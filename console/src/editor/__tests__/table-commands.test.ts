import { describe, expect, it } from "vitest";
import {
  findTableCellOwner,
  getTableSelectionRect,
  mergeTableCells,
  splitTableCell,
} from "../table-commands";
import { createBytemdTableCells } from "../table-source-model";

describe("Bytemd table commands", () => {
  it("merges and splits a selected source-model range", () => {
    const cells = createBytemdTableCells(2, 2);
    cells[0][0].content = "A";
    cells[0][1].content = "B";
    const selection = getTableSelectionRect({ row: 0, column: 0 }, { row: 1, column: 1 });

    expect(mergeTableCells(cells, selection)).toBe(true);
    expect(cells[0][0]).toMatchObject({ rowspan: 2, colspan: 2, content: "A\nB" });
    expect(findTableCellOwner(cells, 1, 1)).toBe(cells[0][0]);

    splitTableCell(cells, cells[0][0]);
    expect(cells[0][0]).toMatchObject({ rowspan: 1, colspan: 1, content: "A\nB" });
    expect(cells[1][1].hidden).toBe(false);
  });

  it("rejects a merge that crosses an existing merged owner", () => {
    const cells = createBytemdTableCells(2, 2);
    cells[0][0].rowspan = 2;
    cells[1][0].hidden = true;
    const selection = getTableSelectionRect({ row: 0, column: 0 }, { row: 0, column: 1 });
    expect(mergeTableCells(cells, selection)).toBe(false);
  });
});
