import type { BytemdPlugin, BytemdEditorContext } from "bytemd";
import rehypeSlug from "rehype-slug";
import useVim from "codemirror-ssr/keymap/vim";
export { markdownTable } from "./markdown-table";
export { masonToolbarIcons } from "./mason-toolbar-icons";
export type { MasonToolbarIcon } from "./mason-toolbar-icons";
export { mermaidPlugin, renderMermaidInHtml } from "./mermaid";

export function pluginSlug(): BytemdPlugin {
  return {
    rehype: (processor) => processor.use(rehypeSlug),
  };
}

export function vim(): BytemdPlugin {
  return {
    editorEffect(ctx: BytemdEditorContext) {
      useVim(ctx.codemirror);
      ctx.editor.setOption("keyMap", "vim");
    },
  };
}
