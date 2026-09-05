import { describe, expect, it } from "vitest";
import { resolveMasonTableMergeTopology } from "../table-merge-resolver";

describe("Mason Markdown table merge topology", () => {
  it("resolves documented vertical and leftward merge markers", () => {
    const result = resolveMasonTableMergeTopology([
      [undefined, undefined, undefined],
      ["A", "<", "<"],
      ["^", "^", "^"],
    ]);

    const owner = result.ownerByCell[1][0];
    expect(result.valid).toBe(true);
    expect(owner).toMatchObject({ row: 1, column: 0, rowspan: 2, colspan: 3 });
    expect(result.ownerByCell[1][2]).toBe(owner);
    expect(result.ownerByCell[2][0]).toBe(owner);
    expect(result.ownerByCell[2][2]).toBe(owner);
  });

  it("keeps a valid vertical chain when adjacent unsupported markers are present", () => {
    const result = resolveMasonTableMergeTopology([
      [undefined, undefined, undefined, undefined],
      [undefined, undefined, undefined, undefined],
      ["^", "<", ">", undefined],
      ["^", undefined, undefined, undefined],
    ]);

    expect(result.ownerByCell[1][0]).toMatchObject({ row: 1, rowspan: 3, colspan: 1 });
    expect(result.ownerByCell[2][0]).toBe(result.ownerByCell[1][0]);
    expect(result.ownerByCell[3][0]).toBe(result.ownerByCell[1][0]);
    expect(result.ownerByCell[2][1]).toMatchObject({ rowspan: 1, colspan: 1 });
    expect(result.ownerByCell[2][2]).toMatchObject({ rowspan: 1, colspan: 1 });
    expect(result.valid).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining(["unsupported-forward-merge"])
    );
  });

  it("keeps only malformed merge groups as source cells", () => {
    const result = resolveMasonTableMergeTopology([
      [undefined, undefined, undefined],
      ["A", "<", "B"],
      ["^", ">", "^"],
    ]);

    expect(result.valid).toBe(false);
    expect(result.ownerByCell[1][0]).toMatchObject({ rowspan: 1, colspan: 1 });
    expect(result.ownerByCell[1][1]).toMatchObject({ rowspan: 1, colspan: 1 });
    expect(result.ownerByCell[1][2]).toMatchObject({ rowspan: 2, colspan: 1 });
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining(["unsupported-forward-merge", "non-rectangular-merge"])
    );
  });

  it("does not create an L-shaped span from incomplete continuations", () => {
    const result = resolveMasonTableMergeTopology([
      [undefined, undefined],
      ["A", "<"],
      ["^", "B"],
    ]);

    expect(result.valid).toBe(false);
    expect(result.owners).toHaveLength(6);
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === "non-rectangular-merge")).toBe(true);
  });
});
