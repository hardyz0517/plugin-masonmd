import katex from "katex";

type MathNode = {
  type: string;
  value?: string;
  children?: MathNode[];
};

type RootNode = MathNode & { children: MathNode[] };
type DiagnosticFile = {
  message: (reason: string, node?: unknown) => unknown;
};

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

export function remarkLuoguMath() {
  return (tree: RootNode, file: DiagnosticFile) => {
    tree.children.forEach((child) => visit(child, file));
  };
}
