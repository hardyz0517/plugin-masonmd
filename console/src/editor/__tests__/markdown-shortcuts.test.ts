import { describe, expect, it } from "vitest";
import { LUOGU_SHORTCUTS } from "../markdown-shortcuts";

describe("Luogu shortcut matrix", () => {
  it("contains both modifier families for source insertion commands", () => {
    expect(LUOGU_SHORTCUTS.link).toEqual(["Ctrl-Shift-L", "Cmd-Shift-L"]);
    expect(LUOGU_SHORTCUTS.image).toEqual(["Ctrl-Shift-I", "Cmd-Shift-I"]);
    expect(LUOGU_SHORTCUTS.table).toEqual(["Ctrl-Shift-2", "Cmd-Shift-2"]);
    expect(LUOGU_SHORTCUTS.taskList).toEqual(["Ctrl-Shift-9", "Cmd-Shift-9"]);
  });
});
