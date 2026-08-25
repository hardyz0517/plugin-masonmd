import { resolveCodeLanguage } from "./language-registry";

type CodeNode = {
  type: string;
  lang?: string | null;
  meta?: string | null;
  value?: string;
  children?: CodeNode[];
};

type RootNode = CodeNode & { children: CodeNode[] };
type DiagnosticFile = {
  message: (reason: string, node?: unknown) => unknown;
};

function getCodeMetadata(node: CodeNode) {
  const info = (node.lang || "").trim();
  const metaOnly = /(?:^|\s)lines?\s*=/i.test(info);
  return {
    language: metaOnly ? "cpp" : info || "cpp",
    meta: [metaOnly ? info : "", node.meta || ""].filter(Boolean).join(" "),
  };
}

function validateLineMetadata(meta: string, lineCount: number, report: (reason: string) => void) {
  const match = meta.match(/(?:^|\s)lines?\s*=\s*([^\s]+)/i);
  if (!match) return;

  for (const part of match[1].split(",")) {
    const range = part.match(/^(\d+)(?:-(\d+))?$/);
    if (!range) {
      report(`Invalid code line range: ${part}`);
      continue;
    }

    const start = Number(range[1]);
    const end = Number(range[2] || range[1]);
    if (start < 1 || end < start) {
      report(`Invalid code line range: ${part}`);
      continue;
    }
    if (start > lineCount || end > lineCount) {
      report(`Code line range was clamped to ${lineCount} lines.`);
    }
  }
}

function visit(node: CodeNode, file: DiagnosticFile) {
  if (node.type === "code") {
    const metadata = getCodeMetadata(node);
    const resolved = resolveCodeLanguage(metadata.language);
    if (resolved.isUnknown) {
      file.message(`Unknown code language: ${metadata.language}.`, node);
    }
    if (!resolved.isMermaid) {
      validateLineMetadata(
        metadata.meta,
        (node.value || "").split("\n").length,
        (reason) => file.message(reason, node),
      );
    }
  }

  node.children?.forEach((child) => visit(child, file));
}

export function remarkBytemdCode() {
  return (tree: RootNode, file: DiagnosticFile) => {
    tree.children.forEach((child) => visit(child, file));
  };
}
