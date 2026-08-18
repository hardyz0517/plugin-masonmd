import type { BytemdEditorContext } from "bytemd";

export const LUOGU_SHORTCUTS = {
  headingUp: ["Ctrl-Shift-Up", "Cmd-Shift-Up"],
  headingDown: ["Ctrl-Shift-Down", "Cmd-Shift-Down"],
  horizontalRule: ["Ctrl-Shift-H", "Cmd-Shift-H"],
  bold: ["Ctrl-B", "Cmd-B"],
  italic: ["Ctrl-I", "Cmd-I"],
  strike: ["Ctrl-D", "Cmd-D"],
  math: ["Ctrl-M", "Cmd-M"],
  link: ["Ctrl-Shift-L", "Cmd-Shift-L"],
  image: ["Ctrl-Shift-I", "Cmd-Shift-I"],
  quote: ["Ctrl-Shift-Q", "Cmd-Shift-Q"],
  code: ["Ctrl-Shift-1", "Cmd-Shift-1"],
  table: ["Ctrl-Shift-2", "Cmd-Shift-2"],
  unorderedList: ["Ctrl-Shift-7", "Cmd-Shift-7"],
  orderedList: ["Ctrl-Shift-8", "Cmd-Shift-8"],
  taskList: ["Ctrl-Shift-9", "Cmd-Shift-9"],
} as const;

type ShortcutAction = (context: BytemdEditorContext) => void;

export interface MarkdownShortcutActions {
  insertTable: ShortcutAction;
  insertLink?: ShortcutAction;
  insertImage?: ShortcutAction;
}

const replaceLines = (
  context: BytemdEditorContext,
  transform: (line: string, index: number) => string
) => {
  context.replaceLines(transform);
  context.editor.focus();
};

const changeHeading = (context: BytemdEditorContext, offset: number) => {
  replaceLines(context, (line) => {
    const prefix = line.match(/^\s*/)?.[0] || "";
    const value = line.slice(prefix.length);
    const match = value.match(/^(#{1,6})\s+/);
    const current = match ? match[1].length : offset > 0 ? 1 : 2;
    const next = Math.min(6, Math.max(1, current + offset));
    return `${prefix}${"#".repeat(next)} ${value.replace(/^(#{1,6})\s+/, "") || "标题"}`;
  });
};

export function createMarkdownShortcutMap(
  context: BytemdEditorContext,
  actionsOrInsertTable: MarkdownShortcutActions | ShortcutAction
) {
  const shortcutActions =
    typeof actionsOrInsertTable === "function"
      ? { insertTable: actionsOrInsertTable }
      : actionsOrInsertTable;
  const actions: Record<string, ShortcutAction> = {};
  const bind = (shortcuts: readonly string[], action: ShortcutAction) => {
    shortcuts.forEach((shortcut) => {
      actions[shortcut] = action;
    });
  };

  bind(LUOGU_SHORTCUTS.headingUp, (ctx) => changeHeading(ctx, -1));
  bind(LUOGU_SHORTCUTS.headingDown, (ctx) => changeHeading(ctx, 1));
  bind(LUOGU_SHORTCUTS.horizontalRule, (ctx) => ctx.appendBlock("---"));
  bind(LUOGU_SHORTCUTS.bold, (ctx) => ctx.wrapText("**"));
  bind(LUOGU_SHORTCUTS.italic, (ctx) => ctx.wrapText("*"));
  bind(LUOGU_SHORTCUTS.strike, (ctx) => ctx.wrapText("~~"));
  bind(LUOGU_SHORTCUTS.math, (ctx) => ctx.wrapText("$"));
  bind(LUOGU_SHORTCUTS.quote, (ctx) => replaceLines(ctx, (line) => `> ${line}`));
  bind(LUOGU_SHORTCUTS.code, (ctx) => ctx.appendBlock("```cpp\n\n```"));
  bind(LUOGU_SHORTCUTS.table, shortcutActions.insertTable);
  bind(
    LUOGU_SHORTCUTS.link,
    shortcutActions.insertLink || ((ctx) => ctx.wrapText("[]()")),
  );
  bind(
    LUOGU_SHORTCUTS.image,
    shortcutActions.insertImage || ((ctx) => ctx.wrapText("![]()")),
  );
  bind(LUOGU_SHORTCUTS.unorderedList, (ctx) => replaceLines(ctx, (line) => `- ${line}`));
  bind(LUOGU_SHORTCUTS.orderedList, (ctx) => replaceLines(ctx, (line, index) => `${index + 1}. ${line}`));
  bind(LUOGU_SHORTCUTS.taskList, (ctx) => replaceLines(ctx, (line) => `- [ ] ${line}`));

  return context.codemirror.normalizeKeyMap(
    Object.fromEntries(
      Object.entries(actions).map(([shortcut, action]) => [shortcut, () => action(context)])
    )
  );
}
