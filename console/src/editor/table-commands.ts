import type { LuoguTableCell, LuoguTableGrid } from "./table-source-model";

export interface TablePoint {
  row: number;
  column: number;
}

export interface TableSelectionRect {
  minRow: number;
  maxRow: number;
  minColumn: number;
  maxColumn: number;
}

export function clampTableSize(value: number, maximum = 100): number {
  return Math.min(Math.max(Number.isFinite(value) ? Math.floor(value) : 1, 1), maximum);
}

export function getTableSelectionRect(start: TablePoint, end: TablePoint): TableSelectionRect {
  return {
    minRow: Math.min(start.row, end.row),
    maxRow: Math.max(start.row, end.row),
    minColumn: Math.min(start.column, end.column),
    maxColumn: Math.max(start.column, end.column),
  };
}

export function findTableCellOwner(
  cells: LuoguTableGrid,
  row: number,
  column: number,
): LuoguTableCell | undefined {
  for (const tableRow of cells) {
    for (const cell of tableRow) {
      if (
        !cell.hidden &&
        row >= cell.row &&
        row < cell.row + cell.rowspan &&
        column >= cell.column &&
        column < cell.column + cell.colspan
      ) {
        return cell;
      }
    }
  }
  return undefined;
}

export function isTableCellSelected(
  cell: LuoguTableCell,
  selection: TableSelectionRect,
): boolean {
  return (
    cell.row <= selection.maxRow &&
    cell.row + cell.rowspan - 1 >= selection.minRow &&
    cell.column <= selection.maxColumn &&
    cell.column + cell.colspan - 1 >= selection.minColumn
  );
}

export function mergeTableCells(
  cells: LuoguTableGrid,
  selection: TableSelectionRect,
): boolean {
  const owners = new Map<string, LuoguTableCell>();
  for (let row = selection.minRow; row <= selection.maxRow; row += 1) {
    for (let column = selection.minColumn; column <= selection.maxColumn; column += 1) {
      const owner = findTableCellOwner(cells, row, column);
      if (!owner) return false;
      const outside =
        owner.row < selection.minRow ||
        owner.column < selection.minColumn ||
        owner.row + owner.rowspan - 1 > selection.maxRow ||
        owner.column + owner.colspan - 1 > selection.maxColumn;
      if (outside) return false;
      owners.set(String(owner.row) + "-" + String(owner.column), owner);
    }
  }

  const target = cells[selection.minRow]?.[selection.minColumn];
  if (!target) return false;
  const content = Array.from(owners.values())
    .map((cell) => cell.content.trim())
    .filter(Boolean)
    .join("\n");

  for (let row = selection.minRow; row <= selection.maxRow; row += 1) {
    for (let column = selection.minColumn; column <= selection.maxColumn; column += 1) {
      const cell = cells[row][column];
      cell.rowspan = 1;
      cell.colspan = 1;
      cell.content = "";
      cell.hidden = true;
    }
  }

  target.rowspan = selection.maxRow - selection.minRow + 1;
  target.colspan = selection.maxColumn - selection.minColumn + 1;
  target.content = content;
  target.hidden = false;
  return true;
}

export function splitTableCell(cells: LuoguTableGrid, cell: LuoguTableCell): void {
  const { row, column, rowspan, colspan, content } = cell;
  for (let currentRow = row; currentRow < row + rowspan; currentRow += 1) {
    for (
      let currentColumn = column;
      currentColumn < column + colspan;
      currentColumn += 1
    ) {
      const currentCell = cells[currentRow]?.[currentColumn];
      if (!currentCell) continue;
      currentCell.rowspan = 1;
      currentCell.colspan = 1;
      currentCell.hidden = false;
      currentCell.content = "";
    }
  }
  cells[row][column].content = content;
}
