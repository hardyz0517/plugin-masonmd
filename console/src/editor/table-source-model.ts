import {
  isLuoguTableMergeMarker,
  resolveLuoguTableMergeTopology,
} from "../markdown/table-merge-resolver";

export interface LuoguTableCell {
  row: number;
  column: number;
  rowspan: number;
  colspan: number;
  content: string;
  hidden: boolean;
}

export type LuoguTableGrid = LuoguTableCell[][];
export type LuoguTableAlignment = "left" | "center" | "right" | null;

export interface LuoguTableModel {
  cells: LuoguTableGrid;
  alignments: LuoguTableAlignment[];
  valid: boolean;
  diagnostics: string[];
}

export function createLuoguTableCells(rows: number, columns: number): LuoguTableGrid {
  const safeRows = Math.max(1, Math.floor(rows) || 1);
  const safeColumns = Math.max(1, Math.floor(columns) || 1);
  return Array.from({ length: safeRows }, (_, row) =>
    Array.from({ length: safeColumns }, (_, column) => ({
      row,
      column,
      rowspan: 1,
      colspan: 1,
      content: "",
      hidden: false,
    }))
  );
}

const cloneGrid = (cells: LuoguTableGrid): LuoguTableGrid =>
  cells.map((row, rowIndex) =>
    row.map((cell, columnIndex) => ({
      ...cell,
      row: rowIndex,
      column: columnIndex,
      rowspan: 1,
      colspan: 1,
      hidden: false,
    }))
  );

const isMarker = (value: string) => isLuoguTableMergeMarker(value.trim());

/** Resolve source markers through the shared Markdown merge-topology resolver. */
export function resolveLuoguTableMerges(cells: LuoguTableGrid): {
  grid: LuoguTableGrid;
  valid: boolean;
  diagnostics: string[];
} {
  const source = cloneGrid(cells);
  const resolved = resolveLuoguTableMergeTopology(
    source.map((row) => row.map((cell) => cell.content.trim()))
  );

  source.forEach((row, rowIndex) => {
    row.forEach((cell, columnIndex) => {
      const owner = resolved.ownerByCell[rowIndex]?.[columnIndex];
      if (!owner) return;
      cell.hidden = owner.row !== rowIndex || owner.column !== columnIndex;
      cell.rowspan = owner.rowspan;
      cell.colspan = owner.colspan;
    });
  });

  return {
    grid: source,
    valid: resolved.valid,
    diagnostics: resolved.diagnostics.map((diagnostic) => diagnostic.message),
  };
}

const splitTableRow = (line: string): string[] => {
  let value = line.trim();
  if (value.startsWith("|")) value = value.slice(1);
  if (value.endsWith("|") && !value.endsWith("\\|")) value = value.slice(0, -1);

  const cells: string[] = [];
  let current = "";
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === "\\" && value[index + 1] === "|") {
      current += "|";
      index += 1;
    } else if (character === "|") {
      cells.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }
  cells.push(current.trim());
  return cells;
};

const alignmentOf = (separator: string): LuoguTableAlignment => {
  const value = separator.trim();
  const left = value.startsWith(":");
  const right = value.endsWith(":");
  if (left && right) return "center";
  if (left) return "left";
  if (right) return "right";
  return null;
};

/** Parse a standalone GFM/Luogu table source into the editor model. */
export function parseLuoguTableSource(source: string): LuoguTableModel | null {
  const lines = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2 || !lines[0].includes("|") || !lines[1].includes("|")) return null;

  const header = splitTableRow(lines[0]);
  const separator = splitTableRow(lines[1]);
  if (
    header.length === 0 ||
    separator.length !== header.length ||
    separator.some((cell) => !/^:?-{1,}:?$/.test(cell.trim()))
  ) {
    return null;
  }

  const rows = [header, ...lines.slice(2).map(splitTableRow)];
  const columnCount = header.length;
  const cells = createLuoguTableCells(rows.length, columnCount);
  const diagnostics: string[] = [];
  rows.forEach((row, rowIndex) => {
    if (row.length !== columnCount) {
      diagnostics.push(`Table row ${rowIndex + 1} has ${row.length} cells; expected ${columnCount}.`);
    }
    for (let column = 0; column < columnCount; column += 1) {
      cells[rowIndex][column].content = row[column] || "";
    }
  });

  const resolved = diagnostics.length
    ? { grid: cells, valid: false, diagnostics: [] as string[] }
    : resolveLuoguTableMerges(cells);
  return {
    cells: resolved.grid,
    alignments: separator.map(alignmentOf),
    valid: diagnostics.length === 0 && resolved.valid,
    diagnostics: [...diagnostics, ...resolved.diagnostics],
  };
}

const escapeCell = (value: string) => {
  const trimmed = value.trim();
  const markerSafe = isMarker(trimmed) ? `\\${trimmed}` : trimmed;
  return markerSafe.replace(/\r?\n/g, "<br>").replace(/\|/g, "\\|");
};

export function serializeLuoguTable(
  cells: LuoguTableGrid,
  options: { alignments?: LuoguTableAlignment[] } = {}
): string {
  const rows = cells.length ? cells : createLuoguTableCells(1, 1);
  const columnCount = rows[0]?.length || 1;
  const ownerAt = (row: number, column: number) => {
    for (const sourceRow of rows) {
      for (const cell of sourceRow) {
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
  };

  const outputRows = rows.map((sourceRow, row) => {
    const values = Array.from({ length: columnCount }, (_, column) => {
      const cell = ownerAt(row, column) || sourceRow[column];
      if (!cell) return "";
      if (cell.row !== row || cell.column !== column) {
        if (column > cell.column) return "<";
        return "^";
      }
      return escapeCell(cell.content);
    });
    return `| ${values.join(" | ")} |`;
  });

  const separator = `| ${Array.from({ length: columnCount }, (_, column) => {
    const alignment = options.alignments?.[column] || null;
    if (alignment === "left") return ":---";
    if (alignment === "center") return ":---:";
    if (alignment === "right") return "---:";
    return "---";
  }).join(" | ")} |`;
  return [outputRows[0] || `| ${"".padEnd(columnCount * 3, " ")} |`, separator, ...outputRows.slice(1)].join("\n");
}
