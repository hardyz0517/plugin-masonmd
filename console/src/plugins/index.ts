import type { BytemdPlugin, BytemdEditorContext } from "bytemd";
import rehypeSlug from "rehype-slug";
import useVim from "codemirror-ssr/keymap/vim";
export { markdownTable } from "./markdown-table";
export { bytemdToolbarIcons } from "./bytemd-toolbar-icons";
export type { BytemdToolbarIcon } from "./bytemd-toolbar-icons";
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
