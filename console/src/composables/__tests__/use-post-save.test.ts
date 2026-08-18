import { describe, expect, it } from "vitest";
import { createPostSaveController } from "../use-post-save";

describe("post save controller", () => {
  it("ignores stale responses and only accepts the current request", () => {
    const controller = createPostSaveController<string>();
    const first = controller.begin("first");
    const second = controller.begin("second");

    expect(controller.succeed(first)).toBe(false);
    expect(controller.status.value).toBe("saving");
    expect(controller.fail(second, { response: { status: 409 } }, "conflict")).toBe(true);
    expect(controller.status.value).toBe("conflict");
    expect(controller.error.value).toBe("conflict");
  });

  it("classifies authentication, permission, and retryable failures", () => {
    const controller = createPostSaveController<string>();
    const request = controller.begin("snapshot");

    controller.fail(request, { response: { status: 401 } }, "login");
    expect(controller.status.value).toBe("unauthorized");

    const forbidden = controller.begin("snapshot");
    controller.fail(forbidden, { response: { status: 403 } }, "permission");
    expect(controller.status.value).toBe("forbidden");

    const retryable = controller.begin("snapshot");
    controller.fail(retryable, { response: { status: 503 } }, "retry");
    expect(controller.status.value).toBe("retryable");
  });
});
