import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  consoleApiClient: {
    content: { tag: { listPostTags: vi.fn() } },
  },
  publicApiClient: {
    content: {
      category: { queryCategories: vi.fn() },
      tag: { queryTags: vi.fn() },
    },
  },
  ucApiClient: {
    content: {
      post: {
        getMyPost: vi.fn(),
        getMyPostDraft: vi.fn(),
        updateMyPostDraft: vi.fn(),
        publishMyPost: vi.fn(),
        unpublishMyPost: vi.fn(),
        createMyPost: vi.fn(),
        updateMyPost: vi.fn(),
        recycleMyPost: vi.fn(),
      },
    },
  },
  render: vi.fn(),
  permissionHas: vi.fn(() => true),
}));

vi.mock("@halo-dev/api-client", () => ({
  ...mocks,
  paginate: vi.fn(async () => []),
}));

vi.mock("@halo-dev/ui-shared", () => ({
  utils: {
    id: { uuid: () => "generated-post" },
    permission: { has: mocks.permissionHas },
  },
}));

vi.mock("../../markdown/render-coordinator", () => ({
  createMarkdownRenderCoordinator: () => ({ render: mocks.render }),
}));

import { useUcPostDraft } from "../use-uc-post-draft";

const post = () => ({
  apiVersion: "content.halo.run/v1alpha1",
  kind: "Post",
  metadata: {
    name: "post-1",
    creationTimestamp: "2026-08-19T00:00:00Z",
    annotations: {},
  },
  spec: {
    allowComment: true,
    categories: [],
    cover: "",
    deleted: false,
    excerpt: { autoGenerate: true, raw: "" },
    headSnapshot: "head-1",
    htmlMetas: [],
    owner: "user",
    pinned: false,
    publish: true,
    publishTime: "2026-08-19T00:00:00Z",
    releaseSnapshot: "release-old",
    slug: "post-1",
    tags: [],
    template: "",
    title: "Post",
    visible: "PUBLIC",
  },
  status: { permalink: "/archives/post-1" },
});

const raw = [
  ":::epigraph[-- author]",
  "Quote",
  ":::",
  "",
  "| A | B |",
  "| --- | --- |",
  "| 1 | 2 |",
  "| ^ | 3 |",
].join("\n");

const oldSnapshot = {
  apiVersion: "content.halo.run/v1alpha1",
  kind: "Snapshot",
  metadata: {
    name: "head-1",
    annotations: {
      "content.halo.run/patched-content": "<p>legacy article</p>",
      "content.halo.run/patched-raw": raw,
    },
  },
  spec: { owner: "user", rawType: "markdown", subjectRef: {} },
};

const savedHtml =
  '<div class="luogu-markdown-body"><blockquote class="luogu-epigraph">Quote</blockquote>' +
  '<table><tbody><tr><td rowspan="2">1</td><td>2</td></tr></tbody></table></div>';

describe("UC published content synchronization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.render.mockResolvedValue({ renderedHtml: savedHtml });
    mocks.ucApiClient.content.post.getMyPost.mockResolvedValue({
      data: post(),
    });
    mocks.ucApiClient.content.post.getMyPostDraft.mockResolvedValue({
      data: oldSnapshot,
    });
    mocks.ucApiClient.content.post.updateMyPostDraft.mockResolvedValue({
      data: {
        ...oldSnapshot,
        metadata: { ...oldSnapshot.metadata, name: "head-2" },
      },
    });
    mocks.ucApiClient.content.post.publishMyPost.mockResolvedValue({
      data: post(),
    });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        location: { href: "http://localhost/editor" },
        history: { replaceState: vi.fn() },
      },
    });
  });

  it("rewrites legacy content and republishes the new head snapshot", async () => {
    const draft = useUcPostDraft("post-1");
    await draft.loadPage();

    expect(draft.hasUnsavedChanges()).toBe(true);
    expect(await draft.save()).toBe(true);

    const updateRequest = mocks.ucApiClient.content.post.updateMyPostDraft.mock.calls[0][0];
    const savedContent = JSON.parse(
      updateRequest.snapshot.metadata.annotations["content.halo.run/content-json"],
    );
    expect(savedContent.content).toContain('class="luogu-markdown-body"');
    expect(savedContent.content).toContain('class="luogu-epigraph"');
    expect(savedContent.content).toContain('rowspan="2"');
    expect(mocks.ucApiClient.content.post.publishMyPost).toHaveBeenCalledTimes(1);
  });

  it("promotes a pending head snapshot even when Markdown was not edited", async () => {
    const pendingPost = post();
    pendingPost.spec.headSnapshot = "head-2";
    pendingPost.spec.releaseSnapshot = "release-old";
    const currentSnapshot = {
      ...oldSnapshot,
      metadata: {
        ...oldSnapshot.metadata,
        name: "head-2",
        annotations: {
          "content.halo.run/patched-content": savedHtml,
          "content.halo.run/patched-raw": raw,
        },
      },
    };
    mocks.ucApiClient.content.post.getMyPost.mockResolvedValue({
      data: pendingPost,
    });
    mocks.ucApiClient.content.post.getMyPostDraft.mockResolvedValue({
      data: currentSnapshot,
    });

    const draft = useUcPostDraft("post-1");
    await draft.loadPage();

    expect(draft.hasUnsavedChanges()).toBe(false);
    expect(await draft.save()).toBe(true);
    expect(mocks.ucApiClient.content.post.updateMyPostDraft).not.toHaveBeenCalled();
    expect(mocks.ucApiClient.content.post.publishMyPost).toHaveBeenCalledTimes(1);
  });

  it("migrates wrapped snapshots that still expose direct pre/code blocks", async () => {
    const legacyRaw = [
      "```cpp",
      "int main() {}",
      "```",
      "",
      ":::unknown-directive[标题]",
      "原样内容",
      ":::",
    ].join("\n");
    const legacySnapshot = {
      ...oldSnapshot,
      metadata: {
        ...oldSnapshot.metadata,
        annotations: {
          "content.halo.run/patched-content":
            '<div class="luogu-markdown-body"><pre class="language-cpp"><code>int main() {}</code></pre><p>标题</p><p>原样内容</p></div>',
          "content.halo.run/patched-raw": legacyRaw,
        },
      },
    };
    mocks.ucApiClient.content.post.getMyPostDraft.mockResolvedValue({
      data: legacySnapshot,
    });

    const draft = useUcPostDraft("post-1");
    await draft.loadPage();

    expect(draft.hasUnsavedChanges()).toBe(true);
    expect(await draft.save()).toBe(true);
    expect(mocks.render).toHaveBeenCalledWith(legacyRaw, "save-html");
    expect(mocks.ucApiClient.content.post.updateMyPostDraft).toHaveBeenCalledTimes(1);
    expect(mocks.ucApiClient.content.post.publishMyPost).toHaveBeenCalledTimes(1);
  });

  it("does not repeatedly migrate a stable snapshot containing a literal forward marker", async () => {
    const stablePost = post();
    stablePost.spec.releaseSnapshot = stablePost.spec.headSnapshot;
    mocks.ucApiClient.content.post.getMyPost.mockResolvedValue({
      data: stablePost,
    });
    mocks.ucApiClient.content.post.getMyPostDraft.mockResolvedValue({
      data: {
        ...oldSnapshot,
        metadata: {
          ...oldSnapshot.metadata,
          annotations: {
            "content.halo.run/patched-content":
              '<div class="luogu-markdown-body"><table><tbody><tr><td>1</td><td>></td></tr></tbody></table></div>',
            "content.halo.run/patched-raw":
              "| A | B |\n| --- | --- |\n| 1 | > |",
          },
        },
      },
    });

    const draft = useUcPostDraft("post-1");
    await draft.loadPage();

    expect(draft.hasUnsavedChanges()).toBe(false);
    expect(await draft.save()).toBe(true);
    expect(mocks.ucApiClient.content.post.updateMyPostDraft).not.toHaveBeenCalled();
    expect(mocks.ucApiClient.content.post.publishMyPost).not.toHaveBeenCalled();
  });
});
