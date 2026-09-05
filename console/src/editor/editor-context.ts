import { ref } from "vue";
import type { BytemdEditorContext, BytemdPlugin } from "bytemd";
import useMarkSelection from "codemirror-ssr/addon/selection/mark-selection.js";
import useMultiplexMode from "codemirror-ssr/addon/mode/multiplex.js";
import useStexMode from "codemirror-ssr/mode/stex/stex.js";
import { createMarkdownShortcutMap } from "./markdown-shortcuts";
import type { MarkdownShortcutActions } from "./markdown-shortcuts";

const MODERN_MARKDOWN_MODE = "mason-modern-markdown";

export const markdownModeConfig = {
  name: "gfm",
  gitHubSpice: false,
  highlightFormatting: true,
  tokenTypeOverrides: {
    list1: "mason-list",
    list2: "mason-list",
    list3: "mason-list",
  },
} as unknown as Parameters<BytemdEditorContext["codemirror"]["getMode"]>[1];

type CodeMirrorMode = ReturnType<BytemdEditorContext["codemirror"]["getMode"]>;
type MultiplexingCodeMirror = BytemdEditorContext["codemirror"] & {
  multiplexingMode: (
    outer: CodeMirrorMode,
    ...modes: Array<{
      open: string;
      close: string;
      mode: CodeMirrorMode;
      delimStyle: string;
      innerStyle: string;
    }>
  ) => CodeMirrorMode;
};

function configureModernMarkdownMode(ctx: BytemdEditorContext) {
  useMultiplexMode(ctx.codemirror);
  useStexMode(ctx.codemirror);
  const codemirror = ctx.codemirror as MultiplexingCodeMirror;
  codemirror.defineMode(MODERN_MARKDOWN_MODE, (config) => {
    const markdownMode = codemirror.getMode(config, markdownModeConfig);
    const mathMode = codemirror.getMode(config, "stex");
    return codemirror.multiplexingMode(
      markdownMode,
      {
        open: "$$",
        close: "$$",
        mode: mathMode,
        delimStyle: "formatting-math",
        innerStyle: "mason-math",
      },
      {
        open: "$",
        close: "$",
        mode: mathMode,
        delimStyle: "formatting-math",
        innerStyle: "mason-math",
      },
    );
  });
  ctx.editor.setOption("mode", MODERN_MARKDOWN_MODE);
}

export interface EditorContextBridge {
  activeEditorContext: ReturnType<typeof ref<BytemdEditorContext | undefined>>;
  isEditorFullscreen: ReturnType<typeof ref<boolean>>;
  plugin: BytemdPlugin;
  getContext: () => BytemdEditorContext | undefined;
  focus: () => void;
}

export function createEditorContextBridge(actions: MarkdownShortcutActions): EditorContextBridge {
  const activeEditorContext = ref<BytemdEditorContext>();
  const isEditorFullscreen = ref(false);
  const markedSelectionCodeMirrors = new WeakSet<object>();

  const plugin: BytemdPlugin = {
    editorEffect(ctx) {
      if (!markedSelectionCodeMirrors.has(ctx.codemirror)) {
        useMarkSelection(ctx.codemirror);
        markedSelectionCodeMirrors.add(ctx.codemirror);
      }
      ctx.editor.setOption("styleSelectedText", true);
      configureModernMarkdownMode(ctx);
      activeEditorContext.value = ctx;
      const shortcutMap = createMarkdownShortcutMap(ctx, actions);
      ctx.editor.addKeyMap(shortcutMap);

      const syncFullscreenState = () => {
        isEditorFullscreen.value = ctx.root.classList.contains("bytemd-fullscreen");
      };
      const fullscreenObserver = new MutationObserver(syncFullscreenState);
      fullscreenObserver.observe(ctx.root, {
        attributes: true,
        attributeFilter: ["class"],
      });
      syncFullscreenState();

      return () => {
        fullscreenObserver.disconnect();
        ctx.editor.removeKeyMap(shortcutMap);
        if (activeEditorContext.value === ctx) {
          activeEditorContext.value = undefined;
          isEditorFullscreen.value = false;
        }
      };
    },
  };

  return {
    activeEditorContext,
    isEditorFullscreen,
    plugin,
    getContext: () => activeEditorContext.value,
    focus: () => activeEditorContext.value?.editor.focus(),
  };
}
