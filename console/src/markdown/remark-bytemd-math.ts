import katex from "katex";

type MathNode = {
  type: string;
  value?: string;
  position?: {
    start?: { offset?: number };
    end?: { offset?: number };
  };
  children?: MathNode[];
};

type RootNode = MathNode & { children: MathNode[] };
type DiagnosticFile = {
  message: (reason: string, node?: unknown) => unknown;
  toString?: () => string;
};

const isWhitespaceText = (node: MathNode) =>
  node.type === "text" && !node.value?.trim();

const getSourceSlice = (file: DiagnosticFile, node: MathNode) => {
  const source = file.toString?.();
  const start = node.position?.start?.offset;
  const end = node.position?.end?.offset;

  if (typeof source !== "string" || typeof start !== "number" || typeof end !== "number") {
    return undefined;
  }

  return source.slice(start, end);
};

const isDoubleDollarInlineMath = (file: DiagnosticFile, node: MathNode) => {
  if (node.type !== "inlineMath") return false;
  const source = getSourceSlice(file, node);
  const trimmed = source?.trim();

  // Markdown editors commonly leave indentation or trailing spaces on a
  // formula-only line. Those spaces are outside the delimiters and must not
  // change the block-level meaning of `$$formula$$`.
  return !!trimmed && trimmed.startsWith("$$") && trimmed.endsWith("$$") && trimmed.length >= 4;
};

const asDisplayMath = (node: MathNode, position: MathNode["position"]): MathNode => ({
  type: "math",
  value: node.value || "",
  position,
});

/**
 * Bytemd accepts a standalone `$$formula$$` line as display math. remark-math
 * parses that spelling as inlineMath because its flow extension requires the
 * fences to occupy separate lines, so normalize only formula-only paragraphs
 * before the rehype handlers run. Mixed prose remains inline math.
 */
function normalizeStandaloneDisplayMath(
  nodes: MathNode[],
  file: DiagnosticFile,
): MathNode[] {
  const normalized: MathNode[] = [];

  for (const node of nodes) {
    if (node.type === "paragraph" && node.children?.length) {
      const children = node.children;
      const formulaChildren = children.filter((child) =>
        isDoubleDollarInlineMath(file, child),
      );
      const onlyFormulaAndWhitespace =
        formulaChildren.length > 0 &&
        children.every(
          (child) => isWhitespaceText(child) || isDoubleDollarInlineMath(file, child),
        );

      if (onlyFormulaAndWhitespace) {
        normalized.push(
          ...formulaChildren.map((child) => asDisplayMath(child, node.position)),
        );
        continue;
      }
    }

    if (node.children?.length) {
      node.children = normalizeStandaloneDisplayMath(node.children, file);
    }
    normalized.push(node);
  }

  return normalized;
}

function visit(node: MathNode, file: DiagnosticFile) {
  if (node.type === "math" || node.type === "inlineMath") {
    try {
      katex.renderToString(node.value || "", {
        displayMode: node.type === "math",
        throwOnError: true,
        trust: false,
      });
    } catch {
      file.message("Invalid math expression; it will be preserved as readable fallback text.", node);
    }
  }
  node.children?.forEach((child) => visit(child, file));
}

export function remarkBytemdMath() {
  return (tree: RootNode, file: DiagnosticFile) => {
    tree.children = normalizeStandaloneDisplayMath(tree.children, file);
    tree.children.forEach((child) => visit(child, file));
  };
}
