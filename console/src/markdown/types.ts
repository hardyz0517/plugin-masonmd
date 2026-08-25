export type MarkdownTarget = "editor-preview" | "save-html";

export type MarkdownCompatibilityProfile = "legacy" | "bytemd-v1";

export type MarkdownFeature =
  | "gfm"
  | "math"
  | "mermaid"
  | "directive"
  | "table-merge"
  | "cute-table"
  | "prism-code";

export interface MarkdownDiagnostic {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  line?: number;
  column?: number;
}

export interface MarkdownRenderRequest {
  raw: string;
  profile: MarkdownCompatibilityProfile;
  target: MarkdownTarget;
}

export interface MarkdownCompileResult {
  canonicalHtml: string;
  renderedHtml: string;
  diagnostics: MarkdownDiagnostic[];
  features: Set<MarkdownFeature>;
}
