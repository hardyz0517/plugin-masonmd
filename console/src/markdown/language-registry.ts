import Prism from "prismjs";
import "prismjs/components/prism-c";
import "prismjs/components/prism-cpp";
import "prismjs/components/prism-java";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-latex";
import "prismjs/components/prism-markdown";
import "prismjs/components/prism-python";

export type MarkdownCodeLanguage =
  | "c"
  | "cpp"
  | "java"
  | "javascript"
  | "latex"
  | "markdown"
  | "plaintext"
  | "python"
  | "mermaid";

export interface ResolvedCodeLanguage {
  language: MarkdownCodeLanguage;
  displayName: string;
  isPlainText: boolean;
  isMermaid: boolean;
  isUnknown: boolean;
}

const LANGUAGE_ALIASES: Record<string, MarkdownCodeLanguage> = {
  c: "c",
  "c++": "cpp",
  cc: "cpp",
  cpp: "cpp",
  cxx: "cpp",
  java: "java",
  javascript: "javascript",
  js: "javascript",
  latex: "latex",
  markdown: "markdown",
  md: "markdown",
  mermaid: "mermaid",
  plain: "plaintext",
  plaintext: "plaintext",
  text: "plaintext",
  py: "python",
  python: "python",
};

const DISPLAY_NAMES: Record<MarkdownCodeLanguage, string> = {
  c: "C",
  cpp: "C++",
  java: "Java",
  javascript: "JavaScript",
  latex: "LaTeX",
  markdown: "Markdown",
  mermaid: "Mermaid",
  plaintext: "Plain Text",
  python: "Python",
};

export function resolveCodeLanguage(value?: string | null): ResolvedCodeLanguage {
  const normalized = value?.trim().toLowerCase();
  const language = normalized ? LANGUAGE_ALIASES[normalized] : "cpp";

  if (!language) {
    return {
      language: "plaintext",
      displayName: normalized || "Plain Text",
      isPlainText: true,
      isMermaid: false,
      isUnknown: true,
    };
  }

  return {
    language,
    displayName: DISPLAY_NAMES[language],
    isPlainText: language === "plaintext",
    isMermaid: language === "mermaid",
    isUnknown: false,
  };
}

export function getPrismGrammar(language: MarkdownCodeLanguage) {
  if (language === "cpp") return Prism.languages.cpp;
  if (language === "plaintext" || language === "mermaid") return undefined;
  return Prism.languages[language];
}

export const codeLanguages = [
  { label: "C++", value: "cpp" },
  { label: "Python", value: "python" },
  { label: "C", value: "c" },
  { label: "Java", value: "java" },
  { label: "JavaScript", value: "javascript" },
  { label: "Markdown", value: "markdown" },
  { label: "LaTeX", value: "latex" },
  { label: "纯文本", value: "plaintext" },
];
