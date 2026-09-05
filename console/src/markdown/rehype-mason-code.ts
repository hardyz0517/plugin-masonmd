import Prism from "prismjs";
import { getPrismGrammar, resolveCodeLanguage } from "./language-registry";

export type MasonCodeHNode = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: MasonCodeHNode[];
};

type HNode = MasonCodeHNode;

// Keep the semantic <code> element, but place it behind one phrasing-content
// wrapper. Halo's Shiki integration claims every `pre > code` block and moves
// it into a shadow tree, where the plugin's line-row CSS cannot apply. The
// wrapper leaves these already-highlighted blocks in the document while
// preserving the language class and generated token markup.
const codeContent = (
  language: ReturnType<typeof resolveCodeLanguage>,
  children: HNode[],
): HNode => ({
  type: "element",
  tagName: "span",
  properties: { className: ["mason-code-content"] },
  children: [
    {
      type: "element",
      tagName: "code",
      properties: { className: [`language-${language.language}`] },
      children,
    },
  ],
});

const tokenNodes = (tokens: unknown[]): HNode[] => {
  const result: HNode[] = [];
  tokens.forEach((token) => {
    if (typeof token === "string") {
      result.push({ type: "text", value: token });
      return;
    }
    if (!token || typeof token !== "object") return;
    const object = token as { type?: string; content?: unknown; alias?: string | string[] };
    const content = Array.isArray(object.content)
      ? tokenNodes(object.content)
      : typeof object.content === "string"
        ? [{ type: "text", value: object.content }]
        : [];
    result.push({
      type: "element",
      tagName: "span",
      properties: {
        className: [
          "token",
          object.type || "plain",
          ...(Array.isArray(object.alias)
            ? object.alias
            : object.alias
              ? [object.alias]
              : []),
        ],
      },
      children: content,
    });
  });
  return result;
};

const lineRanges = (meta: string, lineCount: number, report: (reason: string) => void) => {
  const match = meta.match(/(?:^|\s)lines?\s*=\s*([^\s]+)/i);
  if (!match) {
    return { ranges: new Set<number>(), hasInvalid: false, hasMetadata: false };
  }
  const result = new Set<number>();
  let hasInvalid = false;
  for (const part of match[1].split(",")) {
    const range = part.match(/^(\d+)(?:-(\d+))?$/);
    if (!range) {
      hasInvalid = true;
      report(`Invalid code line range: ${part}`);
      continue;
    }
    const rawStart = Number(range[1]);
    const rawEnd = Number(range[2] || range[1]);
    if (rawStart < 1 || rawEnd < rawStart) {
      hasInvalid = true;
      report(`Invalid code line range: ${part}`);
      continue;
    }
    const start = Math.min(lineCount, rawStart);
    const end = Math.max(start, Math.min(lineCount, rawEnd));
    if (rawStart > lineCount || rawEnd > lineCount) {
      report(`Code line range was clamped to ${lineCount} lines.`);
    }
    for (let line = start; line <= end; line += 1) result.add(line);
  }
  return { ranges: result, hasInvalid, hasMetadata: true };
};

const lineChildren = (line: string, language: ReturnType<typeof resolveCodeLanguage>) => {
  if (language.isPlainText || language.isMermaid) return [{ type: "text", value: line } as HNode];
  const grammar = getPrismGrammar(language.language);
  if (!grammar) return [{ type: "text", value: line } as HNode];
  return tokenNodes(Prism.tokenize(line, grammar));
};

const codeChildren = (code: string, language: ReturnType<typeof resolveCodeLanguage>) => {
  if (language.isPlainText || language.isMermaid) return [{ type: "text", value: code } as HNode];
  const grammar = getPrismGrammar(language.language);
  if (!grammar) return [{ type: "text", value: code } as HNode];
  return tokenNodes(Prism.tokenize(code, grammar));
};

const createFallbackCodeBlock = (
  language: ReturnType<typeof resolveCodeLanguage>,
  code: string,
): HNode => ({
  type: "element",
  tagName: "pre",
  properties: {
    className: [`language-${language.language}`, "mason-code-fallback"],
  },
  children: [codeContent(language, codeChildren(code, language))],
});

const createPlainCodeBlock = (
  language: ReturnType<typeof resolveCodeLanguage>,
  code: string,
): HNode => ({
  type: "element",
  tagName: "pre",
  properties: {
    className: [
      "mason-code-block",
      "mason-code-block--no-line-numbers",
      `language-${language.language}`,
    ],
    dataLanguage: language.language,
  },
  children: [codeContent(language, [{ type: "text", value: code }])],
});

const createCodeBlockWithoutLineNumbers = (
  language: ReturnType<typeof resolveCodeLanguage>,
  code: string,
): HNode => ({
  type: "element",
  tagName: "pre",
  properties: {
    className: [
      "mason-code-block",
      "mason-code-block--no-line-numbers",
      `language-${language.language}`,
    ],
    dataLanguage: language.language,
  },
  children: [codeContent(language, codeChildren(code, language))],
});

export function renderMasonCodeBlock(
  rawLanguage: string | null | undefined,
  rawMeta: string,
  code: string,
): HNode {
  const language = resolveCodeLanguage(rawLanguage);
  if (language.isMermaid) return createPlainCodeBlock(language, code);

  const lines = code.split("\n");
  const rangeResult = lineRanges(rawMeta, lines.length, () => undefined);
  if (language.isUnknown || rangeResult.hasInvalid) {
    return createFallbackCodeBlock(language, code);
  }
  if (!rangeResult.hasMetadata) {
    return createCodeBlockWithoutLineNumbers(language, code);
  }
  const highlighted = rangeResult.ranges;
  const lineNodes = lines.map((line, index) => ({
    type: "element",
    tagName: "span",
    properties: {
      className: ["mason-code-line", ...(highlighted.has(index + 1) ? ["is-highlighted"] : [])],
      dataLine: index + 1,
    },
    children: [
      {
        type: "element",
        tagName: "span",
        properties: { className: ["mason-code-line-number"], ariaHidden: "true" },
        children: [{ type: "text", value: String(index + 1) }],
      },
      {
        type: "element",
        tagName: "span",
        properties: { className: ["mason-code-line-content"] },
        children: lineChildren(line, language),
      },
    ],
  } as HNode));

  return {
    type: "element",
    tagName: "pre",
    properties: {
      className: ["mason-code-block", `language-${language.language}`],
      dataLanguage: language.language,
    },
    children: [codeContent(language, lineNodes)],
  };
}
