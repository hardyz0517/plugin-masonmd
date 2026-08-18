import type { MarkdownDiagnostic } from "./types";

type VFileMessageLike = {
  fatal?: boolean | null;
  line?: number | null;
  column?: number | null;
  reason?: unknown;
  ruleId?: string | null;
  source?: string | null;
};

export function collectMarkdownDiagnostics(file: {
  messages: readonly VFileMessageLike[];
}): MarkdownDiagnostic[] {
  return file.messages.map((message) => {
    const diagnostic = message;
    const reason =
      typeof diagnostic.reason === "string" ? diagnostic.reason : String(message);

    return {
      code:
        diagnostic.ruleId || diagnostic.source || "markdown-processing-message",
      severity: diagnostic.fatal ? "error" : "warning",
      message: reason,
      ...(typeof diagnostic.line === "number"
        ? { line: diagnostic.line }
        : {}),
      ...(typeof diagnostic.column === "number"
        ? { column: diagnostic.column }
        : {}),
    };
  });
}
