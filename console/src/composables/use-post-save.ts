import { computed, ref } from "vue";
import type { ComputedRef, Ref } from "vue";

export type PostSaveStatus =
  | "idle"
  | "saving"
  | "saved"
  | "failed"
  | "conflict"
  | "unauthorized"
  | "forbidden"
  | "retryable";

export interface PostSaveRequest<TSnapshot> {
  id: number;
  snapshot: TSnapshot;
}

export interface PostSaveController<TSnapshot> {
  status: ComputedRef<PostSaveStatus>;
  error: Ref<string>;
  begin: (snapshot: TSnapshot) => PostSaveRequest<TSnapshot>;
  isCurrent: (request: PostSaveRequest<TSnapshot>) => boolean;
  succeed: (request: PostSaveRequest<TSnapshot>) => boolean;
  fail: (request: PostSaveRequest<TSnapshot>, error: unknown, message: string) => boolean;
  invalidate: () => void;
}

function statusForError(error: unknown): PostSaveStatus {
  const response = (error as { response?: { status?: number }} | undefined)?.response;
  const status = response?.status;
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 409) return "conflict";
  if (!response || status === 408 || status === 429 || (status !== undefined && status >= 500)) {
    return "retryable";
  }
  return "failed";
}

export function createPostSaveController<TSnapshot>(): PostSaveController<TSnapshot> {
  const statusValue = ref<PostSaveStatus>("idle");
  const error = ref("");
  let sequence = 0;

  const begin = (snapshot: TSnapshot) => {
    const request = { id: ++sequence, snapshot };
    statusValue.value = "saving";
    error.value = "";
    return request;
  };

  const isCurrent = (request: PostSaveRequest<TSnapshot>) => request.id === sequence;

  const succeed = (request: PostSaveRequest<TSnapshot>) => {
    if (!isCurrent(request)) return false;
    statusValue.value = "saved";
    error.value = "";
    return true;
  };

  const fail = (request: PostSaveRequest<TSnapshot>, requestError: unknown, message: string) => {
    if (!isCurrent(request)) return false;
    statusValue.value = statusForError(requestError);
    error.value = message;
    return true;
  };

  return {
    status: computed(() => statusValue.value),
    error,
    begin,
    isCurrent,
    succeed,
    fail,
    invalidate: () => {
      sequence += 1;
      statusValue.value = "idle";
      error.value = "";
    },
  };
}
