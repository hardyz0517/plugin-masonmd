import { resolveMasonTableMergeTopology } from "./table-merge-resolver";

type TableNode = {
  type: string;
  children?: TableNode[];
  value?: string;
  data?: Record<string, unknown>;
  position?: {
    start?: { offset?: number };
    end?: { offset?: number };
  };
};

type RootNode = TableNode & { children: TableNode[] };
type DiagnosticFile = {
  value: unknown;
  message: (reason: string, node?: unknown) => unknown;
};

const getCellText = (cell: TableNode): string | undefined => {
  const children = cell.children || [];
  if (children.length !== 1 || children[0].type !== "text") return undefined;
  return children[0].value;
};

const getSourceCell = (cell: TableNode, source: string): string | undefined => {
  const start = cell.position?.start?.offset;
  const end = cell.position?.end?.offset;
  if (typeof start !== "number" || typeof end !== "number") return undefined;
  return source
    .slice(start, end)
    .replace(/^\s*\|?\s*/, "")
    .replace(/\s*\|?\s*$/, "");
};

function visit(
  node: TableNode,
  source: string,
  report: (reason: string, node: TableNode) => void
) {
  if (node.type === "tableCell") {
    const text = getCellText(node)?.trim();
    const sourceCell = getSourceCell(node, source)?.trim();
    const marker = text && /^[\^<>]$/.test(text) ? text : undefined;

    if (!marker) return;
    if (sourceCell !== marker) {
      // Escaped markers and inline-code markers are normal table content.
      return;
    }

    node.data = { ...node.data, masonTableMarker: marker };
  }

  node.children?.forEach((child) => visit(child, source, report));

  if (node.type === "table") {
    const rows = (node.children || []).filter((child) => child.type === "tableRow");
    const resolution = resolveMasonTableMergeTopology(
      rows.map((row) =>
        (row.children || []).map((cell) => cell.data?.masonTableMarker)
      )
    );
    resolution.diagnostics.forEach((diagnostic) => report(diagnostic.message, node));
  }
}

export function remarkMasonTable() {
  return (tree: RootNode, file: DiagnosticFile) => {
    const source = typeof file.value === "string" ? file.value : "";
    visit(tree, source, (reason, node) => file.message(reason, node));
  };
}
