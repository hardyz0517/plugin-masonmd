import { describe, expect, it } from "vitest";
import { BYTEMD_SHORTCUTS } from "../markdown-shortcuts";

describe("Bytemd shortcut matrix", () => {
  it("contains both modifier families for source insertion commands", () => {
    expect(BYTEMD_SHORTCUTS.link).toEqual(["Ctrl-Shift-L", "Cmd-Shift-L"]);
    expect(BYTEMD_SHORTCUTS.image).toEqual(["Ctrl-Shift-I", "Cmd-Shift-I"]);
    expect(BYTEMD_SHORTCUTS.table).toEqual(["Ctrl-Shift-2", "Cmd-Shift-2"]);
    expect(BYTEMD_SHORTCUTS.taskList).toEqual(["Ctrl-Shift-9", "Cmd-Shift-9"]);
  });
});
