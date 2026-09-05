import { describe, expect, it } from "vitest";
import type { BytemdPlugin } from "bytemd";
import { createMasonEditorPlugins } from "../mason-markdown-editor-adapter";

const plugin = (): BytemdPlugin => ({});

const options = () => ({
  runtime: { plugins: [plugin()] },
  contextPlugin: plugin(),
  attachmentPlugin: plugin(),
  tablePlugin: plugin(),
});

describe("Mason Markdown editor plugin composition", () => {
  it("keeps table editing when Vim is disabled", () => {
    const config = options();
    const result = createMasonEditorPlugins(config);

    expect(result).toEqual([
      config.runtime.plugins[0],
      config.contextPlugin,
      config.attachmentPlugin,
      config.tablePlugin,
    ]);
  });

  it("adds Vim without replacing table editing", () => {
    const config = options();
    const result = createMasonEditorPlugins({ ...config, useVimKeymap: true });

    expect(result.slice(0, 4)).toEqual([
      config.runtime.plugins[0],
      config.contextPlugin,
      config.attachmentPlugin,
      config.tablePlugin,
    ]);
    expect(result).toHaveLength(5);
    expect(result[4].editorEffect).toBeTypeOf("function");
  });
});
