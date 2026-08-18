export type LuoguTableMergeMarker = "^" | "<" | ">";

export interface LuoguTableMergeOwner {
  row: number;
  column: number;
  rowspan: number;
  colspan: number;
}

export interface LuoguTableMergeDiagnostic {
  code:
    | "invalid-table-shape"
    | "invalid-merge-marker"
    | "unsupported-forward-merge"
    | "non-rectangular-merge";
  message: string;
  row?: number;
  column?: number;
}

export interface LuoguTableMergeResolution {
  ownerByCell: Array<Array<LuoguTableMergeOwner | undefined>>;
  owners: LuoguTableMergeOwner[];
  valid: boolean;
  diagnostics: LuoguTableMergeDiagnostic[];
}

type MergeEdge = {
  from: number;
  to: number;
};

const markerAt = (value: unknown): LuoguTableMergeMarker | undefined =>
  value === "^" || value === "<" || value === ">" ? value : undefined;

class DisjointSet {
  private readonly parent: number[];

  private readonly rank: number[];

  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, index) => index);
    this.rank = Array.from({ length: size }, () => 0);
  }

  find(value: number): number {
    const parent = this.parent[value];
    if (parent === value) return value;
    const root = this.find(parent);
    this.parent[value] = root;
    return root;
  }

  union(left: number, right: number): void {
    const leftRoot = this.find(left);
    const rightRoot = this.find(right);
    if (leftRoot === rightRoot) return;

    if (this.rank[leftRoot] < this.rank[rightRoot]) {
      this.parent[leftRoot] = rightRoot;
      return;
    }

    this.parent[rightRoot] = leftRoot;
    if (this.rank[leftRoot] === this.rank[rightRoot]) this.rank[leftRoot] += 1;
  }
}

const createUnmergedResolution = (
  markerGrid: ReadonlyArray<ReadonlyArray<LuoguTableMergeMarker | undefined>>,
  diagnostics: LuoguTableMergeDiagnostic[]
): LuoguTableMergeResolution => {
  const owners: LuoguTableMergeOwner[] = [];
  const ownerByCell = markerGrid.map((row, rowIndex) =>
    row.map((_, columnIndex) => {
      const owner = { row: rowIndex, column: columnIndex, rowspan: 1, colspan: 1 };
      owners.push(owner);
      return owner;
    })
  );

  return {
    ownerByCell,
    owners,
    valid: diagnostics.length === 0,
    diagnostics,
  };
};

/**
 * Resolves Luogu's table merge markers into rectangular ownership regions.
 * `^` joins the cell above and `<` joins the cell to its left. `>` is not a
 * documented Luogu merge marker, so it remains ordinary source text.
 */
export function resolveLuoguTableMergeTopology(
  source: ReadonlyArray<ReadonlyArray<unknown>>
): LuoguTableMergeResolution {
  const markerGrid = source.map((row) => row.map(markerAt));
  const diagnostics: LuoguTableMergeDiagnostic[] = [];
  const rowCount = markerGrid.length;
  const columnCount = markerGrid[0]?.length || 0;

  if (!rowCount || !columnCount) {
    return createUnmergedResolution(markerGrid, diagnostics);
  }

  if (markerGrid.some((row) => row.length !== columnCount)) {
    diagnostics.push({
      code: "invalid-table-shape",
      message: "Table rows have different column counts; merge markers were left unchanged.",
    });
    return createUnmergedResolution(markerGrid, diagnostics);
  }

  const indexOf = (row: number, column: number) => row * columnCount + column;
  const blocked = new Set<number>();
  const edges: MergeEdge[] = [];

  // Mark independently invalid source cells first. This prevents a later
  // marker from accidentally merging into an unsupported or impossible cell.
  markerGrid.forEach((row, rowIndex) => {
    row.forEach((marker, columnIndex) => {
      if (!marker) return;
      const index = indexOf(rowIndex, columnIndex);
      if (marker === ">") {
        blocked.add(index);
        // A leftward merge immediately before an unsupported forward marker
        // would create an L-shaped component with the valid vertical chain.
        // Degrade that local pair while keeping independent `^` merges alive.
        if (columnIndex > 0 && markerGrid[rowIndex][columnIndex - 1] === "<") {
          blocked.add(indexOf(rowIndex, columnIndex - 1));
        }
        diagnostics.push({
          code: "unsupported-forward-merge",
          message: `Unsupported forward merge marker at row ${rowIndex + 1}, column ${columnIndex + 1}; it was left as text.`,
          row: rowIndex,
          column: columnIndex,
        });
        return;
      }

      if ((marker === "^" && rowIndex === 0) || (marker === "<" && columnIndex === 0)) {
        blocked.add(index);
        diagnostics.push({
          code: "invalid-merge-marker",
          message: `Invalid ${marker} merge marker at row ${rowIndex + 1}, column ${columnIndex + 1}; it was left as text.`,
          row: rowIndex,
          column: columnIndex,
        });
      }
    });
  });

  markerGrid.forEach((row, rowIndex) => {
    row.forEach((marker, columnIndex) => {
      if (!marker || blocked.has(indexOf(rowIndex, columnIndex))) return;
      const target =
        marker === "^"
          ? { row: rowIndex - 1, column: columnIndex }
          : { row: rowIndex, column: columnIndex - 1 };
      const targetIndex = indexOf(target.row, target.column);

      if (blocked.has(targetIndex)) {
        blocked.add(indexOf(rowIndex, columnIndex));
        diagnostics.push({
          code: "invalid-merge-marker",
          message: `Merge marker at row ${rowIndex + 1}, column ${columnIndex + 1} points to an invalid cell and was left as text.`,
          row: rowIndex,
          column: columnIndex,
        });
        return;
      }

      edges.push({ from: indexOf(rowIndex, columnIndex), to: targetIndex });
    });
  });

  const sets = new DisjointSet(rowCount * columnCount);
  edges.forEach(({ from, to }) => sets.union(from, to));

  const components = new Map<number, Array<{ row: number; column: number }>>();
  for (let row = 0; row < rowCount; row += 1) {
    for (let column = 0; column < columnCount; column += 1) {
      const root = sets.find(indexOf(row, column));
      const component = components.get(root) || [];
      component.push({ row, column });
      components.set(root, component);
    }
  }

  const owners: LuoguTableMergeOwner[] = [];
  const ownerByCell = markerGrid.map((row) => Array<LuoguTableMergeOwner | undefined>(row.length));

  components.forEach((members) => {
    const minRow = Math.min(...members.map((member) => member.row));
    const maxRow = Math.max(...members.map((member) => member.row));
    const minColumn = Math.min(...members.map((member) => member.column));
    const maxColumn = Math.max(...members.map((member) => member.column));
    const rowspan = maxRow - minRow + 1;
    const colspan = maxColumn - minColumn + 1;
    const isMerged = members.length > 1;
    const isRectangle = members.length === rowspan * colspan;

    if (isMerged && !isRectangle) {
      const firstMarker = members.find((member) => markerGrid[member.row][member.column]);
      diagnostics.push({
        code: "non-rectangular-merge",
        message: "Table merge markers do not form a rectangle; that merge group was left as source cells.",
        row: firstMarker?.row,
        column: firstMarker?.column,
      });
    }

    if (!isMerged || !isRectangle) {
      members.forEach((member) => {
        const owner = { row: member.row, column: member.column, rowspan: 1, colspan: 1 };
        owners.push(owner);
        ownerByCell[member.row][member.column] = owner;
      });
      return;
    }

    const owner = { row: minRow, column: minColumn, rowspan, colspan };
    owners.push(owner);
    members.forEach((member) => {
      ownerByCell[member.row][member.column] = owner;
    });
  });

  return {
    ownerByCell,
    owners,
    valid: diagnostics.length === 0,
    diagnostics,
  };
}

export function isLuoguTableMergeMarker(value: unknown): value is LuoguTableMergeMarker {
  return markerAt(value) !== undefined;
}
