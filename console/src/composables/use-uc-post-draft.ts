import {
  consoleApiClient,
  paginate,
  publicApiClient,
  ucApiClient,
} from "@halo-dev/api-client";
import type {
  CategoryVo,
  Content,
  Post,
  Snapshot,
  TagVo,
} from "@halo-dev/api-client";
import { utils } from "@halo-dev/ui-shared";
import { computed, ref } from "vue";
import { contentAnnotations } from "../constants/content-annotations";
import { createMarkdownRenderCoordinator } from "../markdown/render-coordinator";
import { createPostSaveController } from "./use-post-save";

type ApiError = {
  message?: unknown;
  response?: {
    status?: number;
    data?: {
      detail?: unknown;
      title?: unknown;
    };
  };
};

const AUTOSAVE_DELAY_MS = 5 * 60 * 1000;

function createEmptyPost(): Post {
  return {
    apiVersion: "content.halo.run/v1alpha1",
    kind: "Post",
    metadata: {
      name: utils.id.uuid(),
      annotations: {
        [contentAnnotations.PREFERRED_EDITOR]: "mason-markdown",
      },
    },
    spec: {
      allowComment: true,
      baseSnapshot: "",
      categories: [],
      cover: "",
      deleted: false,
      excerpt: { autoGenerate: true, raw: "" },
      headSnapshot: "",
      htmlMetas: [],
      owner: "",
      pinned: false,
      priority: 0,
      publish: false,
      publishTime: "",
      releaseSnapshot: "",
      slug: "",
      tags: [],
      template: "",
      title: "",
      visible: "PUBLIC",
    },
  } as Post;
}

function asApiError(error: unknown): ApiError {
  return typeof error === "object" && error !== null ? (error as ApiError) : {};
}

function errorMessage(error: unknown, fallback: string) {
  const requestError = asApiError(error);
  const detail = requestError.response?.data?.detail;
  const title = requestError.response?.data?.title;
  const message = requestError.message;

  return [detail, title, message].find(
    (value): value is string => typeof value === "string" && value.length > 0,
  ) || fallback;
}

const MASON_DIRECTIVE_NAMES = new Set([
  "info",
  "success",
  "warning",
  "error",
  "align",
  "epigraph",
  "cute-table",
]);

const DIRECTIVE_START = /^ {0,3}:{2,}\s*([A-Za-z][\w-]*)/;
const FENCE_START = /^ {0,3}(`{3,}|~{3,})/;
const FENCED_CODE_START = /^\s*(?:`{3,}|~{3,})/m;
const DIRECT_CODE_BLOCK = /<pre\b[^>]*>\s*<code\b/i;
const UNSAFE_PUBLISHED_MARKUP =
  /<\s*\/?\s*(?:script|iframe|object|embed|applet|base|form|meta|link)\b|<[^>]*\bon[a-z][\w:-]*\s*=|\b(?:href|src|action|formaction|xlink:href)\s*=\s*["']?\s*(?:javascript|vbscript|data|file):/i;
// The compatibility resolver supports `^` and the leftward `<` marker.
// Mason Markdown treats a malformed forward `>` marker as plain text, so
// it must not make an otherwise stable snapshot look perpetually migratable.
const VERTICAL_MERGE_MARKER = /(?:^|\|)\s*\^\s*(?:\||$)/m;
const HORIZONTAL_MERGE_MARKER = /(?:^|\|)\s*<\s*(?:\||$)/m;
const ROWSPAN_MERGE = /\browspan=["'](?:[2-9]|[1-9]\d+)["']/i;
const COLSPAN_MERGE = /\bcolspan=["'](?:[2-9]|[1-9]\d+)["']/i;
const RENDERED_MATH_WRAPPER =
  /\bclass=["'][^"']*(?<![\w-])(?:math-inline|math-display)(?![\w-])[^"']*["'][^>]*>[\s\S]*?\bclass=["'][^"']*\bkatex(?:\b|-)/i;
const DUPLICATED_KATEX_MATHML =
  /<span\b[^>]*\bclass=["'][^"']*(?<![\w-])katex-mathml(?![\w-])[^"']*["']/i;

function withoutFencedCode(raw: string): string {
  let fenceCharacter = "";
  let fenceLength = 0;
  return raw
    .split(/\r?\n/)
    .map((line) => {
      const fence = line.match(FENCE_START);
      if (fenceCharacter) {
        if (
          fence &&
          fence[1][0] === fenceCharacter &&
          fence[1].length >= fenceLength
        ) {
          fenceCharacter = "";
          fenceLength = 0;
        }
        return "";
      }
      if (fence) {
        fenceCharacter = fence[1][0];
        fenceLength = fence[1].length;
        return "";
      }
      return line;
    })
    .join("\n");
}

function directiveNamesOutsideFences(raw: string): string[] {
  return withoutFencedCode(raw)
    .split(/\r?\n/)
    .map((line) => line.match(DIRECTIVE_START)?.[1].toLowerCase())
    .filter((name): name is string => Boolean(name));
}

function hasUnsupportedDirectiveOutput(source: Content): boolean {
  const names = directiveNamesOutsideFences(source.raw);
  if (!names.length) return false;

  const hasFallback = source.content.includes("mason-directive-fallback");
  if (names.some((name) => !MASON_DIRECTIVE_NAMES.has(name)) && !hasFallback) {
    return true;
  }

  const expectedClasses: Record<string, string> = {
    info: "mason-callout",
    success: "mason-callout",
    warning: "mason-callout",
    error: "mason-callout",
    align: "mason-align-container",
    epigraph: "mason-epigraph",
    "cute-table": "mason-cute-table",
  };
  return names.some(
    (name) =>
      MASON_DIRECTIVE_NAMES.has(name) &&
      !source.content.includes(expectedClasses[name]) &&
      !hasFallback,
  );
}

function needsPublishedRenderRefresh(source: Content): boolean {
  if (source.rawType !== "markdown" || !source.raw.trim()) return false;
  const semanticRaw = withoutFencedCode(source.raw);

  // Older snapshots do not carry the stable wrapper used by the published
  // stylesheet. Re-render them on the next save instead of leaving them tied
  // to whichever theme happened to render the original Markdown.
  if (!/\bclass=["'][^"']*\bmason-markdown-body\b/.test(source.content)) {
    return true;
  }

  // The first Mason Markdown renderer emitted direct `pre > code` nodes. Halo's theme
  // highlighter takes over those nodes, so migrate fenced blocks to the
  // wrapped structure used by the current renderer.
  if (
    FENCED_CODE_START.test(source.raw) &&
    DIRECT_CODE_BLOCK.test(source.content)
  ) {
    return true;
  }

  // A legacy snapshot can contain executable markup even though the current
  // editor preview sanitizes it. Re-render once so the published snapshot is
  // safe as well; escaped text does not match this expression.
  if (UNSAFE_PUBLISHED_MARKUP.test(source.content)) return true;

  // The first Mason Markdown math renderer used the selectors consumed by both
  // ByteMD's viewer hook and Halo's plugin-katex. Re-render once so the
  // published snapshot gets the private wrapper classes used by the current
  // renderer and cannot be parsed a second time.
  if (RENDERED_MATH_WRAPPER.test(source.content)) return true;

  // Previous published snapshots used KaTeX's default htmlAndMathml DOM.
  // Halo's automatic excerpt service reads that DOM as text, so each formula
  // leaks its MathML, TeX annotation, and visual value into post cards. A
  // one-time re-render converts the snapshot to the excerpt-safe structure.
  if (DUPLICATED_KATEX_MATHML.test(source.content)) return true;

  if (hasUnsupportedDirectiveOutput(source)) return true;

  if (
    /^\s*:{2,}\s*epigraph(?:\[|\s|\{|$)/m.test(semanticRaw) &&
    !source.content.includes("mason-epigraph")
  ) {
    return true;
  }

  if (VERTICAL_MERGE_MARKER.test(semanticRaw) && !ROWSPAN_MERGE.test(source.content)) {
    return true;
  }

  if (HORIZONTAL_MERGE_MARKER.test(semanticRaw) && !COLSPAN_MERGE.test(source.content)) {
    return true;
  }

  return false;
}

export function useUcPostDraft(initialName = "") {
  const postName = ref(initialName);
  const loading = ref(true);
  const loadFailed = ref(false);
  const saving = ref(false);
  const publishing = ref(false);
  const unpublishing = ref(false);
  const deleting = ref(false);
  const error = ref("");
  const successLink = ref("");
  const snapshot = ref<Snapshot>();
  const categories = ref<CategoryVo[]>([]);
  const tags = ref<TagVo[]>([]);
  const optionsError = ref("");
  const lastSaved = ref<Date>();
  const post = ref<Post>(createEmptyPost());
  const content = ref<Content>({ content: "", raw: "", rawType: "markdown" });
  let autosaveTimer: ReturnType<typeof setTimeout> | undefined;
  let savePromise: Promise<boolean> | undefined;
  let saveActionPromise: Promise<boolean> | undefined;
  let saveRequested = false;
  // A new post has no server-side draft until its first successful manual
  // save. Do not let the timer attempt to create it before then.
  let autosaveEnabled = Boolean(initialName);
  let renderRefreshRequested = false;
  // Updating a head snapshot does not update a published post's release
  // snapshot. Keep this bit until the corresponding publish request succeeds.
  let publicationRefreshRequested = false;
  const saveController = createPostSaveController<{
    postFingerprint: string;
    contentFingerprint: string;
  }>();
  let savedPostFingerprint = "";
  let savedContentFingerprint = "";
  const renderCoordinator = createMarkdownRenderCoordinator("mason-v1");

  const isUpdate = computed(() => Boolean(post.value.metadata.creationTimestamp));
  // status.phase is reconciled asynchronously. spec.publish is the value changed by
  // the UC publish and unpublish endpoints, so it is the only reliable switch here.
  const isPublished = computed(() => post.value.spec?.publish === true);
  const canPublish = computed(() => {
    try {
      return utils.permission.has(["uc:posts:publish"]);
    } catch {
      return false;
    }
  });
  const statusText = computed(() => {
    if (loading.value) return "加载中...";
    if (deleting.value) return "删除中...";
    if (saving.value) return "保存中...";
    if (publishing.value) return "发布中...";
    if (unpublishing.value) return "设为私有中...";
    if (error.value) return "操作失败";
    return lastSaved.value ? `已保存 ${lastSaved.value.toLocaleTimeString()}` : "";
  });

  async function loadOptions() {
    async function loadTags() {
      try {
        return await paginate(
          (params) => consoleApiClient.content.tag.listPostTags(params),
          { size: 1000, sort: ["metadata.creationTimestamp,desc"] },
        );
      } catch {
        // UC authors may not have Console tag permissions. Public tags keep
        // the picker usable while the server still enforces access control.
        return paginate(
          (params) => publicApiClient.content.tag.queryTags(params),
          { size: 100 },
        );
      }
    }

    const [categoryResult, tagResult] = await Promise.allSettled([
      paginate(
        (params) => publicApiClient.content.category.queryCategories(params),
        { size: 100 },
      ),
      loadTags(),
    ]);

    categories.value = categoryResult.status === "fulfilled" ? categoryResult.value : [];
    tags.value = tagResult.status === "fulfilled" ? tagResult.value : [];
    optionsError.value =
      categoryResult.status === "rejected" || tagResult.status === "rejected"
        ? "分类或标签列表加载失败，可稍后重试"
        : "";
  }

  async function loadPost() {
    if (!postName.value) return;
    const { data } = await ucApiClient.content.post.getMyPost({ name: postName.value });
    post.value = data;

    // A draft save advances headSnapshot, while the public article keeps
    // serving releaseSnapshot until the post is published again. Preserve
    // that signal when reopening an already published post so a subsequent
    // explicit save can promote the current head even when the raw source did
    // not change during this editor session.
    publicationRefreshRequested = Boolean(
      data.spec?.publish &&
        data.spec.headSnapshot &&
        data.spec.headSnapshot !== data.spec.releaseSnapshot,
    );

    if (!data.spec.headSnapshot) {
      snapshot.value = undefined;
      content.value = { content: "", raw: "", rawType: "markdown" };
      renderRefreshRequested = false;
      rememberSavedState();
      return;
    }

    const draft = await ucApiClient.content.post.getMyPostDraft({ name: postName.value, patched: true });
    snapshot.value = draft.data;
    const annotations = draft.data.metadata?.annotations || {};
    content.value = {
      content: annotations[contentAnnotations.PATCHED_CONTENT] || "",
      raw: annotations[contentAnnotations.PATCHED_RAW] || "",
      rawType: draft.data.spec?.rawType || "markdown",
    };
    renderRefreshRequested = needsPublishedRenderRefresh(content.value);
    rememberSavedState();
  }

  async function loadPage() {
    loading.value = true;
    loadFailed.value = false;
    error.value = "";
    try {
      await Promise.all([loadOptions(), loadPost()]);
    } catch (requestError: unknown) {
      loadFailed.value = true;
      error.value = errorMessage(requestError, "页面加载失败，请刷新重试");
    } finally {
      loading.value = false;
    }
  }

  function clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }

  function getEditablePostSpec(source: Post) {
    const spec = source.spec || {};
    return {
      title: spec.title || "",
      cover: spec.cover || "",
      visible: spec.visible || "PUBLIC",
      pinned: Boolean(spec.pinned),
      categories: Array.isArray(spec.categories) ? [...spec.categories] : [],
      tags: Array.isArray(spec.tags) ? [...spec.tags] : [],
      slug: spec.slug || "",
    };
  }

  function getPostFingerprint(source = post.value) {
    return JSON.stringify(getEditablePostSpec(source));
  }

  function getContentFingerprint(source = content.value) {
    // HTML is derived from raw Markdown. Treating it as an independent input
    // allowed a delayed preview update to look like a second document change.
    return JSON.stringify([source.raw, source.rawType]);
  }

  function hasDraftInput() {
    const spec = post.value.spec;
    return Boolean(
      postName.value ||
        spec.title.trim() ||
        spec.cover?.trim() ||
        spec.categories?.length ||
        spec.tags?.length ||
        spec.pinned ||
        content.value.raw.trim() ||
        content.value.content.trim(),
    );
  }

  function hasTitle() {
    return Boolean(post.value.spec.title.trim());
  }

  function rememberSavedState() {
    savedPostFingerprint = getPostFingerprint();
    savedContentFingerprint = getContentFingerprint();
  }

  function hasUnsavedChanges() {
    if (!isUpdate.value) return hasDraftInput();

    return renderRefreshRequested ||
      getPostFingerprint() !== savedPostFingerprint ||
      getContentFingerprint() !== savedContentFingerprint;
  }

  function makeSnapshot(source = content.value): Snapshot {
    if (!snapshot.value) {
      throw new Error("草稿快照不存在，请刷新页面后重试");
    }

    const base = clone(snapshot.value);
    return {
      ...base,
      metadata: {
        ...base.metadata,
        annotations: {
          ...base.metadata?.annotations,
          [contentAnnotations.CONTENT_JSON]: JSON.stringify(source),
        },
      },
    } as Snapshot;
  }

  function isConflictError(error: unknown) {
    const requestError = asApiError(error);
    const status = requestError.response?.status;
    const message = String(
      requestError.response?.data?.detail ||
        requestError.response?.data?.title ||
        requestError.message ||
        "",
    ).toLowerCase();

    return status === 409 || message.includes("conflict") || message.includes("冲突");
  }

  function keepLocalPostChanges(remotePost: Post) {
    const localSpec = getEditablePostSpec(post.value);
    post.value = {
      ...remotePost,
      spec: { ...remotePost.spec, ...localSpec },
    };
  }

  function verifySavedVisibility(savedPost: Post, expectedVisible: string) {
    if (savedPost.spec?.visible === expectedVisible) return;

    // Retain the user's choice so a retry can send it again, while marking the
    // server version as the last known saved state.
    keepLocalPostChanges(savedPost);
    savedPostFingerprint = getPostFingerprint(savedPost);
    throw new Error("文章状态未能保存，请重试");
  }

  async function saveDraftNow(conflictRetries = 2): Promise<boolean> {
    if (autosaveTimer) {
      clearTimeout(autosaveTimer);
      autosaveTimer = undefined;
    }

    if (!hasUnsavedChanges()) return true;

    const postFingerprintAtStart = getPostFingerprint();
    const contentFingerprintAtStart = getContentFingerprint();
    const saveRequest = saveController.begin({
      postFingerprint: postFingerprintAtStart,
      contentFingerprint: contentFingerprintAtStart,
    });
    const postToSave = clone(post.value);
    const contentToSave = clone(content.value);
    const postChanged =
      !isUpdate.value || postFingerprintAtStart !== savedPostFingerprint;
    const contentChanged =
      renderRefreshRequested || contentFingerprintAtStart !== savedContentFingerprint;
    error.value = "";
    saving.value = true;
    try {
      const rendered = await renderCoordinator.render(
        contentToSave.raw,
        "save-html"
      );
      contentToSave.content = rendered.renderedHtml;

      if (!postToSave.spec.slug && postToSave.spec.title) {
        postToSave.spec.slug = postToSave.spec.title
          .trim()
          .toLowerCase()
          .replace(/[^\w\u4e00-\u9fff]+/g, "-")
          .replace(/^-|-$/g, "");
      }

      if (!isUpdate.value) {
        postToSave.metadata.annotations = {
          ...postToSave.metadata.annotations,
          [contentAnnotations.CONTENT_JSON]: JSON.stringify(contentToSave),
        };
        const created = await ucApiClient.content.post.createMyPost({ post: postToSave });
        post.value = created.data;
        postName.value = created.data.metadata.name;
        verifySavedVisibility(created.data, postToSave.spec.visible);
        const nextUrl = new URL(window.location.href);
        nextUrl.searchParams.set("name", postName.value);
        window.history.replaceState({}, "", nextUrl);
        await loadPost();
      } else {
        if (postChanged) {
          const { data: latestPost } = await ucApiClient.content.post.getMyPost({
            name: postName.value,
          });
          const localSpecToSave = getEditablePostSpec(postToSave);
          const updated = await ucApiClient.content.post.updateMyPost({
            name: postName.value,
            post: {
              ...latestPost,
              spec: { ...latestPost.spec, ...localSpecToSave },
              metadata: {
                ...latestPost.metadata,
                annotations: {
                  ...latestPost.metadata?.annotations,
                  ...postToSave.metadata?.annotations,
                },
              },
            },
          });
          verifySavedVisibility(updated.data, localSpecToSave.visible);
          const changedDuringRequest = getPostFingerprint() !== postFingerprintAtStart;
          const currentLocalSpec = getEditablePostSpec(post.value);
          post.value = changedDuringRequest
            ? { ...updated.data, spec: { ...updated.data.spec, ...currentLocalSpec } }
            : updated.data;
          // The server response may contain the slug generated from the
          // title. Fingerprint the authoritative saved post, otherwise an
          // initially empty slug keeps the editor permanently dirty.
          savedPostFingerprint = getPostFingerprint(updated.data);
        }

        if (contentChanged) {
          if (!snapshot.value) throw new Error("草稿快照不存在，请刷新页面后重试");
          const saved = await ucApiClient.content.post.updateMyPostDraft({
            name: postName.value,
            snapshot: makeSnapshot(contentToSave),
          });
          snapshot.value = saved.data;
          savedContentFingerprint = contentFingerprintAtStart;
          renderRefreshRequested = false;
          publicationRefreshRequested = true;
        }
      }
      if (!saveController.isCurrent(saveRequest)) return false;
      lastSaved.value = new Date();
      saveController.succeed(saveRequest);
      return true;
    } catch (requestError: unknown) {
      if (conflictRetries > 0 && isConflictError(requestError) && postName.value) {
        const localSpec = getEditablePostSpec(post.value);
        const localContent = clone(content.value);
        try {
          await loadPost();
          post.value.spec = { ...post.value.spec, ...localSpec };
          content.value = localContent;
          renderRefreshRequested = needsPublishedRenderRefresh(localContent);
          return await saveDraftNow(conflictRetries - 1);
        } catch {
          // Keep the original conflict error when refreshing the server state fails.
        }
      }
      error.value = errorMessage(requestError, "保存失败，请重试");
      saveController.fail(saveRequest, requestError, error.value);
      return false;
    } finally {
      saving.value = false;
    }
  }

  function saveDraft(isManualSave = true) {
    if (!isManualSave && (!autosaveEnabled || !hasTitle())) {
      return Promise.resolve(false);
    }

    saveRequested = true;
    if (!savePromise) {
      savePromise = (async () => {
        let result = true;
        while (saveRequested || hasUnsavedChanges()) {
          saveRequested = false;
          result = await saveDraftNow();
          if (!result) break;
        }
        return result;
      })().finally(() => {
        savePromise = undefined;
      });
    }
    return savePromise;
  }

  function scheduleAutosave() {
    if (loading.value || loadFailed.value || !autosaveEnabled) return;
    if (!hasTitle()) return;
    if (!hasDraftInput()) return;
    if (saving.value || publishing.value || unpublishing.value || deleting.value) {
      saveRequested = true;
      return;
    }
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
      autosaveTimer = undefined;
      void saveDraft(false);
    }, AUTOSAVE_DELAY_MS);
  }

  async function syncPublicationState(
    forcePublish = false,
    conflictRetries = 2,
  ): Promise<boolean> {
    if (!postName.value) return true;

    const visibilityAtStart = post.value.spec.visible;
    const shouldPublish = visibilityAtStart === "PUBLIC";
    const needsPublish = shouldPublish && (!isPublished.value || forcePublish);
    if (!needsPublish && shouldPublish === isPublished.value) return true;

    if (needsPublish && !canPublish.value) {
      error.value = "没有发布文章的权限";
      return false;
    }

    publishing.value = shouldPublish;
    unpublishing.value = !shouldPublish;
    error.value = "";
    try {
      const response = shouldPublish
        ? await ucApiClient.content.post.publishMyPost({ name: postName.value })
        : await ucApiClient.content.post.unpublishMyPost({ name: postName.value });
      if (
        response.data.spec?.visible !== visibilityAtStart ||
        Boolean(response.data.spec?.publish) !== shouldPublish
      ) {
        verifySavedVisibility(response.data, visibilityAtStart);
        throw new Error("文章发布状态未能保存，请重试");
      }

      // The response is authoritative for the write, and a read-after-write
      // protects the UI from stale status objects returned during reconciliation.
      const { data: verifiedPost } = await ucApiClient.content.post.getMyPost({
        name: postName.value,
      });
      if (
        verifiedPost.spec?.visible !== visibilityAtStart ||
        Boolean(verifiedPost.spec?.publish) !== shouldPublish
      ) {
        verifySavedVisibility(verifiedPost, visibilityAtStart);
        throw new Error("文章发布状态未能保存，请重试");
      }

      keepLocalPostChanges(verifiedPost);
      if (shouldPublish) {
        // A successful publish promotes the current head snapshot, including
        // content saved by an autosave before the explicit publish action.
        publicationRefreshRequested = false;
      }
      successLink.value = shouldPublish ? verifiedPost.status?.permalink || "" : "";
      return true;
    } catch (requestError: unknown) {
      if (conflictRetries > 0 && isConflictError(requestError) && postName.value) {
        const localSpec = getEditablePostSpec(post.value);
        const localContent = clone(content.value);
        try {
          await loadPost();
          post.value.spec = { ...post.value.spec, ...localSpec };
          content.value = localContent;
          return await syncPublicationState(forcePublish, conflictRetries - 1);
        } catch {
          // Keep the original conflict error when refreshing the server state fails.
        }
      }
      error.value = errorMessage(
        requestError,
        shouldPublish ? "发布失败，请重试" : "取消发布失败，请重试",
      );
      return false;
    } finally {
      publishing.value = false;
      unpublishing.value = false;
    }
  }

  function save() {
    if (!hasTitle()) {
      error.value = "请输入标题";
      return Promise.resolve(false);
    }

    if (!saveActionPromise) {
      saveActionPromise = (async () => {
        let result = true;
        do {
          result = await saveDraft(true);
          if (!result) return false;
          autosaveEnabled = true;
          result = await syncPublicationState(publicationRefreshRequested);
        } while (result && (saveRequested || hasUnsavedChanges()));
        return result;
      })().finally(() => {
        saveActionPromise = undefined;
      });
    }
    return saveActionPromise;
  }

  async function deletePost(): Promise<boolean> {
    if (!postName.value || deleting.value) return false;

    if (autosaveTimer) {
      clearTimeout(autosaveTimer);
      autosaveTimer = undefined;
    }

    deleting.value = true;
    error.value = "";
    try {
      await ucApiClient.content.post.recycleMyPost({ name: postName.value });
      successLink.value = "";
      return true;
    } catch (requestError: unknown) {
      error.value = errorMessage(requestError, "删除失败，请重试");
      return false;
    } finally {
      deleting.value = false;
    }
  }

  function dispose() {
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = undefined;
    saveController.invalidate();
  }

  return {
    postName, post, content, loading, loadFailed, saving, publishing, unpublishing, deleting,
    error, successLink, lastSaved, isUpdate, canPublish, isPublished, statusText,
    saveStatus: saveController.status,
    categories, tags, optionsError,
    loadPage, loadOptions, saveDraft, save, deletePost, hasUnsavedChanges, scheduleAutosave, dispose,
  };
}
