import { describe, expect, it } from "vitest";
import { MASON_SHORTCUTS } from "../markdown-shortcuts";

describe("Mason Markdown shortcut matrix", () => {
  it("contains both modifier families for source insertion commands", () => {
    expect(MASON_SHORTCUTS.link).toEqual(["Ctrl-Shift-L", "Cmd-Shift-L"]);
    expect(MASON_SHORTCUTS.image).toEqual(["Ctrl-Shift-I", "Cmd-Shift-I"]);
    expect(MASON_SHORTCUTS.table).toEqual(["Ctrl-Shift-2", "Cmd-Shift-2"]);
    expect(MASON_SHORTCUTS.taskList).toEqual(["Ctrl-Shift-9", "Cmd-Shift-9"]);
  });
});
