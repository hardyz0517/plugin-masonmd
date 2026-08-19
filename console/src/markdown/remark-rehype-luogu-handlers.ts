import { fromHtml } from "hast-util-from-html";
import katex from "katex";
import { renderLuoguCodeBlock } from "./rehype-luogu-code";
import { resolveLuoguTableMergeTopology } from "./table-merge-resolver";

type HNode = {
  type: "element" | "text";
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HNode[];
};

type State = {
  all: (node: unknown) => HNode[];
  patch: (from: unknown, to: unknown) => void;
  applyData: (from: unknown, to: HNode) => HNode;
  h: (
    node: unknown,
    tagName: string,
    properties?: Record<string, unknown>,
    children?: HNode[]
  ) => HNode;
};

type DirectiveNode = {
  type: string;
  name?: string;
  label?: string;
  attributes?: Record<string, string | null | undefined>;
  children?: unknown[];
  data?: Record<string, unknown>;
};

type TableCellNode = {
  type: string;
  children?: unknown[];
  data?: Record<string, unknown>;
};

type TableRowNode = { type: string; children?: TableCellNode[] };
type TableNode = {
  type: string;
  align?: Array<"left" | "right" | "center" | null>;
  children?: TableRowNode[];
  data?: Record<string, unknown>;
};

type MathNode = {
  type: "math" | "inlineMath";
  value?: string;
};

const text = (value: string): HNode => ({ type: "text", value });

const normalizeClassNames = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  return typeof value === "string" ? [value] : [];
};

const addClass = (node: HNode, className: string) => {
  node.properties = {
    ...(node.properties || {}),
    className: [...new Set([...normalizeClassNames(node.properties?.className), className])],
  };
};

const getDirectiveAttribute = (node: DirectiveNode): string | undefined =>
  Object.keys(node.attributes || {})[0];

const getDirectiveLabel = (node: DirectiveNode): string | undefined => {
  const firstChild = node.children?.[0] as
    | { data?: { directiveLabel?: boolean }; children?: Array<{ type?: string; value?: string }> }
    | undefined;
  if (!firstChild?.data?.directiveLabel) return undefined;
  return (firstChild.children || [])
    .filter((child) => child.type === "text")
    .map((child) => child.value || "")
    .join("");
};

function sourceFallback(_state: State, node: DirectiveNode): HNode {
  // Do not walk an invalid directive's children. A partially normalized
  // directive can contain user-controlled nodes that would otherwise be
  // interpreted as HTML or as another supported directive. The original
  // source position is the only lossless and safe fallback.
  const source = String(
    node.data?.luoguDirectiveSource || `::${node.name || "directive"}`,
  );
  const fallback = renderLuoguCodeBlock("plaintext", "", source) as HNode;
  addClass(fallback, "luogu-directive-fallback");
  return fallback;
}

function directiveHandler(state: State, rawNode: unknown): HNode {
  const node = rawNode as DirectiveNode;
  if (node.data?.luoguDirectiveFallback) return sourceFallback(state, node);

  const name = node.name || "";
  const label = getDirectiveLabel(node);
  const bodyNode = label
    ? { ...node, children: (node.children || []).slice(1) }
    : node;
  const body = state.all(bodyNode);

  if (["info", "success", "warning", "error"].includes(name)) {
    const summary = text(label || name);
    const properties: Record<string, unknown> = {
      className: ["luogu-callout", `luogu-callout-${name}`],
    };
    if (Object.prototype.hasOwnProperty.call(node.attributes || {}, "open")) {
      properties.open = true;
    }

    const bodyClassNames = ["luogu-callout-body"];
    if (
      body.some(
        (child) =>
          child.type === "element" &&
          normalizeClassNames(child.properties?.className).includes("luogu-table-scroll")
      )
    ) {
      bodyClassNames.push("luogu-callout-body-with-table");
    }

    return {
      type: "element",
      tagName: "details",
      properties,
      children: [
        { type: "element", tagName: "summary", properties: {}, children: [summary] },
        { type: "element", tagName: "div", properties: { className: bodyClassNames }, children: body },
      ],
    };
  }

  if (name === "align") {
    const alignment = getDirectiveAttribute(node);
    const children = body.map((child) => {
      if (child.type !== "element") return child;
      if (["p", "h1", "h2", "h3", "h4", "h5", "h6"].includes(child.tagName || "")) {
        addClass(child, `luogu-align-${alignment || "left"}`);
      }
      return child;
    });

    return {
      type: "element",
      tagName: "div",
      properties: { className: ["luogu-align-container"] },
      children,
    };
  }

  if (name === "epigraph") {
    return {
      type: "element",
      tagName: "blockquote",
      properties: { className: ["luogu-epigraph"] },
      children: [
        { type: "element", tagName: "div", properties: { className: ["luogu-epigraph-body"] }, children: body },
        { type: "element", tagName: "cite", properties: {}, children: [text(label || "")] },
      ],
    };
  }

  return sourceFallback(state, node);
}

function codeHandler(_state: State, rawNode: unknown): HNode {
  const node = rawNode as { lang?: string | null; meta?: string | null; value?: string };
  const info = (node.lang || "").trim();
  const metaOnly = /(?:^|\s)lines?\s*=/i.test(info);
  const language = (metaOnly ? "cpp" : info || "cpp").toLowerCase();
  const meta = [metaOnly ? info : "", node.meta || ""].filter(Boolean).join(" ");
  return renderLuoguCodeBlock(language, meta, node.value || "") as HNode;
}

function mathHandler(_state: State, rawNode: unknown): HNode {
  const node = rawNode as MathNode;
  const displayMode = node.type === "math";
  const tagName = displayMode ? "div" : "span";

  try {
    // ByteMD's math plugin renders only in viewerEffect. Rendering here keeps
    // UC save HTML and published articles independent from that editor hook.
    const rendered = katex.renderToString(node.value || "", {
      displayMode,
      throwOnError: false,
      trust: false,
    });
    const fragment = fromHtml(rendered, { fragment: true });
    return {
      type: "element",
      tagName,
      properties: { className: ["math", displayMode ? "math-display" : "math-inline"] },
      children: fragment.children as HNode[],
    };
  } catch {
    return {
      type: "element",
      tagName,
      properties: { className: ["math", displayMode ? "math-display" : "math-inline"] },
      children: [{ type: "text", value: node.value || "" }],
    };
  }
}

function tableHandler(state: State, rawNode: unknown): HNode {
  const node = rawNode as TableNode;
  const rows = node.children || [];
  const columnCount = Math.max(0, ...rows.map((row) => row.children?.length || 0));
  const resolution = resolveLuoguTableMergeTopology(
    rows.map((row) =>
      (row.children || []).map((cell) => cell.data?.luoguTableMarker)
    )
  );
  const rowElements: HNode[] = [];
  const tuackColumn =
    typeof node.data?.luoguTuackColumn === "number" ? node.data.luoguTuackColumn : undefined;

  rows.forEach((row, rowIndex) => {
    const cells: HNode[] = [];
    (row.children || []).forEach((cell, columnIndex) => {
      const owner = resolution.ownerByCell[rowIndex]?.[columnIndex];
      if (!owner) return;
      if (owner.row !== rowIndex || owner.column !== columnIndex) return;
      const isHeader = rowIndex === 0;
      const children = state.all(cell);
      const properties: Record<string, unknown> = {};
      const alignment = node.align?.[columnIndex];
      if (alignment) properties.align = alignment;
      if (owner.rowspan > 1) properties.rowSpan = owner.rowspan;
      if (owner.colspan > 1) properties.colSpan = owner.colspan;
      cells.push({
        type: "element",
        tagName: isHeader ? "th" : "td",
        properties,
        children,
      });
    });
    rowElements.push({ type: "element", tagName: "tr", properties: {}, children: cells });
  });

  const tableStyle = node.data?.luoguTableStyle;
  const classNames = ["luogu-markdown-table"];
  const cuteTableClass =
    tableStyle === "three"
      ? "luogu-cute-table-three"
      : tableStyle === "tuack"
        ? "luogu-cute-table-tuack"
        : undefined;
  if (cuteTableClass) classNames.push(cuteTableClass);

  const columnGroup =
    cuteTableClass && columnCount
      ? {
          type: "element",
          tagName: "colgroup",
          properties: {},
          children: Array.from({ length: columnCount }, (_, columnIndex) => ({
            type: "element" as const,
            tagName: "col",
            properties:
              tableStyle === "tuack" &&
              typeof tuackColumn === "number" &&
              tuackColumn >= 1 &&
              tuackColumn < columnCount &&
              columnIndex === tuackColumn
                ? { className: ["luogu-tuack-break"] }
                : {},
            children: [],
          })),
        }
      : undefined;

  const table = {
    type: "element",
    tagName: "table",
    properties: {
      className: classNames,
    },
    children: [
      ...(columnGroup ? [columnGroup] : []),
      {
        type: "element",
        tagName: "thead",
        properties: {},
        children: rowElements.slice(0, 1),
      },
      {
        type: "element",
        tagName: "tbody",
        properties: {},
        children: rowElements.slice(1),
      },
    ],
  } as HNode;

  const wrapperClassNames = ["luogu-table-scroll"];
  if (cuteTableClass) wrapperClassNames.push("luogu-cute-table", cuteTableClass);

  return {
    type: "element",
    tagName: "div",
    properties: { className: wrapperClassNames },
    children: [table],
  };
}

export function createLuoguRemarkRehypeOptions() {
  return {
    handlers: {
      containerDirective: directiveHandler as never,
      leafDirective: directiveHandler as never,
      code: codeHandler as never,
      table: tableHandler as never,
      math: mathHandler as never,
      inlineMath: mathHandler as never,
    },
  };
}
