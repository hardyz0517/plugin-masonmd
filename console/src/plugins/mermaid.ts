import type { BytemdPlugin } from "bytemd";

// Code blocks are wrapped once so Halo's Shiki integration does not claim
// already-rendered blocks via its `pre > code` selector. Keep Mermaid lookup
// independent of that wrapper for both editor and saved HTML rendering.
const MERMAID_SELECTOR = "pre code.language-mermaid";
const MERMAID_THEME_FALLBACKS = {
  background: "#ffffff",
  primaryColor: "#f8f8f8",
  primaryTextColor: "#3b3b3b",
  primaryBorderColor: "#007acc",
  secondaryColor: "#f3f3f3",
  secondaryTextColor: "#3b3b3b",
  secondaryBorderColor: "#bdbdbd",
  tertiaryColor: "#ffffff",
  tertiaryTextColor: "#3b3b3b",
  tertiaryBorderColor: "#bdbdbd",
  noteBkgColor: "#fff8c5",
  noteTextColor: "#3b3b3b",
  noteBorderColor: "#c8a600",
  lineColor: "#007acc",
  textColor: "#3b3b3b",
  mainBkg: "#f8f8f8",
  errorBkgColor: "#fce4e4",
  errorTextColor: "#a1260d",
  nodeBorder: "#007acc",
  clusterBkg: "#f3f3f3",
  clusterBorder: "#bdbdbd",
  defaultLinkColor: "#007acc",
  titleColor: "#3b3b3b",
  edgeLabelBackground: "#ffffff",
  actorBkg: "#f8f8f8",
  actorBorder: "#007acc",
  actorTextColor: "#3b3b3b",
  actorLineColor: "#6e6e6e",
  signalColor: "#007acc",
  signalTextColor: "#3b3b3b",
  labelBoxBkgColor: "#f8f8f8",
  labelBoxBorderColor: "#007acc",
  labelTextColor: "#3b3b3b",
  loopTextColor: "#3b3b3b",
  activationBorderColor: "#6e6e6e",
  activationBkgColor: "#eeeeee",
  sequenceNumberColor: "#fefefe",
  altBackground: "#f3f3f3",
  classText: "#3b3b3b",
};

const MERMAID_THEME_VARIABLES = { ...MERMAID_THEME_FALLBACKS };

type MermaidThemeVariable = keyof typeof MERMAID_THEME_FALLBACKS;

const LEGACY_MERMAID_THEME_VARIABLES: Record<string, MermaidThemeVariable> = {
  "#ececff": "primaryColor",
  "#131300": "primaryTextColor",
  "hsl(240,60%,86.2745098039%)": "primaryBorderColor",
  "#ffffde": "secondaryColor",
  "#000021": "secondaryTextColor",
  "hsl(60,60%,83.5294117647%)": "secondaryBorderColor",
  "hsl(80,100%,96.2745098039%)": "tertiaryColor",
  "rgb(6.3333333334,0,19.0000000001)": "tertiaryTextColor",
  "hsl(80,60%,86.2745098039%)": "tertiaryBorderColor",
  "#fff5ad": "noteBkgColor",
  "#aaaa33": "noteBorderColor",
  "#333333": "lineColor",
  "#333": "textColor",
  "#552222": "errorBkgColor",
  "#9370db": "nodeBorder",
  "#e8e8e8": "edgeLabelBackground",
  "hsl(259.6261682243,59.7765363128%,87.9019607843%)": "actorBorder",
  "#808080": "actorLineColor",
  grey: "actorLineColor",
  black: "primaryTextColor",
  "#666": "activationBorderColor",
  "#f4f4f4": "activationBkgColor",
  "#f0f0f0": "altBackground",
};

const toKebabCase = (value: string) =>
  value.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);

const MERMAID_COLOR_VARIABLES = new Map<string, string>();

function registerMermaidColor(color: string, key: MermaidThemeVariable) {
  const normalized = color.toLowerCase().replace(/\s+/g, "");
  if (!MERMAID_COLOR_VARIABLES.has(normalized)) {
    MERMAID_COLOR_VARIABLES.set(
      normalized,
      `var(--mason-mermaid-${toKebabCase(key)}, ${MERMAID_THEME_FALLBACKS[key]})`
    );
  }
}

Object.entries(MERMAID_THEME_FALLBACKS).forEach(([key, color]) => {
  registerMermaidColor(color, key as MermaidThemeVariable);
});
Object.entries(LEGACY_MERMAID_THEME_VARIABLES).forEach(([color, key]) => {
  registerMermaidColor(color, key);
});

const MERMAID_COLOR_PATTERN = /#[0-9a-f]{3,8}\b|(?:rgb|hsl)a?\([^)]*\)|\b(?:black|grey|white)\b/gi;

let mermaidPromise: Promise<typeof import("mermaid").default> | undefined;
let renderQueue = Promise.resolve();

async function getMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then((module) => module.default);
  }
  return mermaidPromise;
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function createDeterministicMermaidId(definition: string, occurrence = 0) {
  return `mason-mermaid-${stableHash(`${occurrence}\u0000${definition}`)}`;
}

/**
 * Mermaid emits one stylesheet per SVG. Replace only color tokens inside that
 * stylesheet in one pass, so a replacement fallback can never be matched and
 * rewritten again (the source of the malformed `))))333)` CSS).
 */
export function rewriteMermaidThemeCss(stylesheet: string): string {
  return stylesheet.replace(MERMAID_COLOR_PATTERN, (match) => {
    return MERMAID_COLOR_VARIABLES.get(match.toLowerCase().replace(/\s+/g, "")) || match;
  });
}

const MERMAID_MARKER_STYLE_MARKER =
  "/* mason-markdown Mermaid marker colors */";
const MERMAID_MARKER_STYLE =
  MERMAID_MARKER_STYLE_MARKER +
  ".arrowheadPath,.arrowMarkerPath{" +
  "fill:var(--mason-mermaid-line-color,#007acc)!important;" +
  "stroke:var(--mason-mermaid-line-color,#007acc)!important;}";

export interface MermaidSvgDimensions {
  width: number;
  height: number;
  viewBox: string;
}

const numericDimension = (value: string | null) => {
  if (!value) return undefined;
  const match = value.trim().match(/^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(?:px)?$/i);
  if (!match) return undefined;
  const dimension = Number(match[1]);
  return Number.isFinite(dimension) && dimension > 0 ? dimension : undefined;
};

export function deriveMermaidSvgDimensions(
  viewBox: string | null,
  width?: string | null,
  height?: string | null
): MermaidSvgDimensions | undefined {
  const values = (viewBox || "")
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(Number);
  const viewBoxWidth = values.length === 4 ? values[2] : undefined;
  const viewBoxHeight = values.length === 4 ? values[3] : undefined;

  if (
    values.length === 4 &&
    values.every(Number.isFinite) &&
    typeof viewBoxWidth === "number" &&
    typeof viewBoxHeight === "number" &&
    viewBoxWidth > 0 &&
    viewBoxHeight > 0
  ) {
    return {
      width: viewBoxWidth,
      height: viewBoxHeight,
      viewBox: values.join(" "),
    };
  }

  const fallbackWidth = numericDimension(width || null);
  const fallbackHeight = numericDimension(height || null);
  if (!fallbackWidth || !fallbackHeight) return undefined;

  return {
    width: fallbackWidth,
    height: fallbackHeight,
    viewBox: `0 0 ${fallbackWidth} ${fallbackHeight}`,
  };
}

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const XHTML_NAMESPACE = "http://www.w3.org/1999/xhtml";

const ALLOWED_SVG_TAGS = new Set([
  "svg", "g", "path", "rect", "circle", "ellipse", "line", "polyline",
  "polygon", "text", "tspan", "defs", "marker", "clippath", "mask",
  "pattern", "use", "symbol", "title", "desc", "style", "foreignobject",
  "switch",
]);

// Mermaid's htmlLabels renderer uses a deliberately small XHTML subtree inside
// foreignObject. Keep this separate from SVG tags so a label cannot introduce
// arbitrary HTML into the rendered article.
const ALLOWED_XHTML_TAGS = new Set([
  "div", "span", "p", "br", "strong", "em", "i", "b", "u", "s",
  "del", "code", "small", "sub", "sup",
]);

const ALLOWED_SVG_ATTRIBUTES = new Set([
  "id", "class", "viewbox", "width", "height", "x", "y", "x1", "x2",
  "y1", "y2", "cx", "cy", "r", "rx", "ry", "d", "points", "fill",
  "fill-opacity", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin",
  "stroke-opacity", "opacity", "transform", "marker-end", "marker-start",
  "markerheight", "markerwidth", "markerunits", "orient", "refx", "refy",
  "preserveaspectratio", "role", "aria-roledescription", "aria-label",
  "dominant-baseline", "text-anchor", "font-size", "font-family", "clip-path",
  "clip-rule", "fill-rule", "shape-rendering", "text-rendering", "vector-effect",
  "color", "version", "name",
  "font-style", "font-weight", "text-decoration", "alignment-baseline", "dx",
  "dy", "textlength", "lengthadjust", "mask", "href", "xlink:href", "xmlns",
  "xmlns:xlink", "xml:space", "style", "focusable",
]);

const ALLOWED_XHTML_ATTRIBUTES = new Set([
  "id", "class", "style", "xmlns", "role", "aria-label", "aria-hidden",
]);

const SAFE_INLINE_STYLE_PROPERTIES = new Set([
  "display", "white-space", "max-width", "min-width", "width", "height",
  "min-height", "max-height", "box-sizing", "text-align", "vertical-align",
  "line-height", "font-size", "font-family", "font-style", "font-weight",
  "text-decoration", "color", "fill", "stroke", "stroke-width", "fill-opacity",
  "stroke-opacity", "opacity", "background", "background-color", "padding",
  "padding-left", "padding-right", "padding-top", "padding-bottom", "margin",
  "margin-left", "margin-right", "margin-top", "margin-bottom", "overflow", "cursor",
]);

function sanitizeInlineStyle(value: string): string | undefined {
  const safeDeclarations: string[] = [];
  for (const declaration of value.split(";")) {
    const separator = declaration.indexOf(":");
    if (separator < 0) continue;
    const property = declaration.slice(0, separator).trim().toLowerCase();
    const cssValue = declaration.slice(separator + 1).trim();
    if (
      !SAFE_INLINE_STYLE_PROPERTIES.has(property) ||
      !cssValue ||
      /[<>{}]/.test(cssValue) ||
      /url\s*\(|expression\s*\(|javascript\s*:|vbscript\s*:|@import/i.test(cssValue)
    ) {
      continue;
    }
    safeDeclarations.push(`${property}: ${cssValue}`);
  }
  return safeDeclarations.length > 0 ? safeDeclarations.join("; ") : undefined;
}

function isInsideForeignObject(element: Element) {
  let parent = element.parentElement;
  while (parent) {
    if (parent.tagName.toLowerCase() === "foreignobject") return true;
    parent = parent.parentElement;
  }
  return false;
}

function sanitizeMermaidAttribute(element: Element, name: string, value: string) {
  const normalized = name.toLowerCase();
  const tagName = element.tagName.toLowerCase();
  const isXhtml = ALLOWED_XHTML_TAGS.has(tagName);
  const allowedAttributes = isXhtml
    ? ALLOWED_XHTML_ATTRIBUTES
    : ALLOWED_SVG_ATTRIBUTES;

  const isSafeDataAttribute = /^data-[a-z0-9_.:-]+$/.test(normalized);
  if (
    (!allowedAttributes.has(normalized) && !isSafeDataAttribute) ||
    normalized.startsWith("on")
  ) {
    return false;
  }
  if (normalized === "style") {
    const sanitizedStyle = sanitizeInlineStyle(value);
    if (!sanitizedStyle) return false;
    element.setAttribute(name, sanitizedStyle);
    return true;
  }
  if (normalized === "xmlns") {
    return isXhtml ? value === XHTML_NAMESPACE : value === SVG_NAMESPACE;
  }
  if (normalized === "xmlns:xlink") {
    return value === "http://www.w3.org/1999/xlink";
  }
  if ((normalized === "href" || normalized === "xlink:href") && !value.startsWith("#")) {
    return false;
  }
  return !/javascript:|data:|url\s*\(|expression\s*\(/i.test(value);
}

function numericSvgAttribute(
  element: Element,
  name: string,
  fallback?: number,
): number | undefined {
  const rawValue = element.getAttribute(name);
  if (rawValue === null || rawValue.trim() === "") return fallback;

  const value = Number.parseFloat(rawValue);
  return Number.isFinite(value) ? value : fallback;
}

function formatSvgNumber(value: number) {
  return String(Number(value.toFixed(6)));
}

function findSequenceActorRect(text: Element): Element | null {
  let parent = text.parentElement;
  while (parent) {
    const rect = parent.querySelector("rect.actor");
    if (rect) return rect;
    parent = parent.parentElement;
  }
  return null;
}

function normalizeSequenceActorLabels(root: SVGSVGElement) {
  if (root.getAttribute("aria-roledescription")?.toLowerCase() !== "sequence") {
    return;
  }

  root.querySelectorAll<SVGTextElement>("text.actor").forEach((text) => {
    // Mermaid stores the actor's x coordinate at the rectangle center, but
    // older SVG output omitted text-anchor and treated it as the left edge.
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("dominant-baseline", "central");

    const rect = findSequenceActorRect(text);
    if (!rect) return;

    const x = numericSvgAttribute(rect, "x", 0);
    const y = numericSvgAttribute(rect, "y", 0);
    const width = numericSvgAttribute(rect, "width");
    const height = numericSvgAttribute(rect, "height");
    if (
      x === undefined ||
      y === undefined ||
      width === undefined ||
      height === undefined ||
      width <= 0 ||
      height <= 0
    ) {
      return;
    }

    text.setAttribute("x", formatSvgNumber(x + width / 2));
    text.setAttribute("y", formatSvgNumber(y + height / 2));
  });
}

function normalizeMermaidSvgLayout(root: SVGSVGElement): boolean {
  const dimensions = deriveMermaidSvgDimensions(
    root.getAttribute("viewBox"),
    root.getAttribute("width"),
    root.getAttribute("height")
  );
  if (!dimensions) return false;

  root.setAttribute("viewBox", dimensions.viewBox);
  root.setAttribute("width", String(dimensions.width));
  root.setAttribute("height", String(dimensions.height));
  root.setAttribute("preserveAspectRatio", "xMidYMid meet");
  root.setAttribute(
    "style",
    `width: ${dimensions.width}px; height: auto;`
  );
  normalizeSequenceActorLabels(root);
  return true;
}

export function sanitizeMermaidSvg(svg: string): SVGSVGElement | null {
  if (typeof DOMParser === "undefined") return null;
  const document = new DOMParser().parseFromString(svg, "image/svg+xml");
  if (document.querySelector("parsererror")) return null;
  const root = document.documentElement;
  if (!root || root.tagName.toLowerCase() !== "svg") return null;

  const all = [root, ...Array.from(root.querySelectorAll("*"))];
  for (const element of all) {
    const tagName = element.tagName.toLowerCase();
    const isSvgTag = ALLOWED_SVG_TAGS.has(tagName);
    const isXhtmlTag = ALLOWED_XHTML_TAGS.has(tagName);
    if (!isSvgTag && !isXhtmlTag) return null;
    if (isXhtmlTag && !isInsideForeignObject(element)) return null;
    if (isSvgTag && element.namespaceURI && element.namespaceURI !== SVG_NAMESPACE) {
      return null;
    }
    if (isXhtmlTag && element.namespaceURI && element.namespaceURI !== XHTML_NAMESPACE) {
      return null;
    }
    for (const attribute of Array.from(element.attributes)) {
      if (!sanitizeMermaidAttribute(element, attribute.name, attribute.value)) {
        element.removeAttribute(attribute.name);
      }
    }
    if (tagName === "style") {
      const stylesheet = element.textContent || "";
      if (/url\s*\(|@import|javascript:/i.test(stylesheet)) return null;
      const rewrittenStylesheet = rewriteMermaidThemeCss(stylesheet);
      element.textContent = rewrittenStylesheet.includes(
        MERMAID_MARKER_STYLE_MARKER
      )
        ? rewrittenStylesheet
        : `${rewrittenStylesheet}${MERMAID_MARKER_STYLE}`;
    }
  }

  const safeRoot = root as unknown as SVGSVGElement;
  return normalizeMermaidSvgLayout(safeRoot) ? safeRoot : null;
}

export async function renderMermaidDefinition(
  definition: string,
  occurrence = 0
): Promise<SVGSVGElement> {
  const job = renderQueue.then(async () => {
    const mermaid = await getMermaid();
    const id = createDeterministicMermaidId(definition, occurrence);
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "base",
      themeVariables: MERMAID_THEME_VARIABLES,
      deterministicIds: true,
      deterministicIDSeed: id,
      htmlLabels: true,
      // Mermaid's supported layout path uses XHTML labels in foreignObject.
      // The SVG-only fallback positions text by baseline and misaligns nodes.
      flowchart: { htmlLabels: true },
    } as never);
    const result = await mermaid.render(id, definition);
    const safeSvg = sanitizeMermaidSvg(result.svg);
    if (!safeSvg) throw new Error("Mermaid SVG failed validation");
    return safeSvg;
  });
  renderQueue = job.then(() => undefined, () => undefined);
  return job;
}

async function renderMermaidElement(
  codeElement: HTMLElement,
  occurrence: number,
  shouldRender: () => boolean = () => true
) {
  const container = codeElement.closest("pre");
  if (!container) return;
  const wrapper = document.createElement("div");
  wrapper.className = "mason-mermaid";

  try {
    const svg = await renderMermaidDefinition(codeElement.textContent || "", occurrence);
    if (shouldRender()) wrapper.replaceChildren(svg.cloneNode(true));
  } catch {
    if (shouldRender()) {
      wrapper.classList.add("mason-mermaid-error");
      wrapper.textContent = "Mermaid render failed";
    }
  }

  if (shouldRender()) container.replaceWith(wrapper);
}

export async function renderMermaidInHtml(html: string): Promise<string> {
  if (!html.includes("language-mermaid") || typeof DOMParser === "undefined") return html;

  const htmlDocument = new DOMParser().parseFromString(html, "text/html");
  const codeElements = Array.from(
    htmlDocument.body.querySelectorAll<HTMLElement>(MERMAID_SELECTOR)
  );

  for (const [occurrence, codeElement] of codeElements.entries()) {
    const container = codeElement.closest("pre");
    if (!container) continue;
    try {
      const svg = await renderMermaidDefinition(codeElement.textContent || "", occurrence);
      const wrapper = htmlDocument.createElement("div");
      wrapper.className = "mason-mermaid";
      wrapper.replaceChildren(svg.cloneNode(true));
      container.replaceWith(wrapper);
    } catch {
      // Preserve the sanitized escaped code block when rendering fails.
    }
  }

  return htmlDocument.body.innerHTML;
}

export function mermaidPlugin(): BytemdPlugin {
  return {
    viewerEffect({ markdownBody }) {
      let disposed = false;
      const codeElements = Array.from(
        markdownBody.querySelectorAll<HTMLElement>(MERMAID_SELECTOR)
      );

      codeElements.forEach((codeElement, occurrence) => {
        void renderMermaidElement(codeElement, occurrence, () => {
          return !disposed && markdownBody.contains(codeElement);
        });
      });

      return () => {
        disposed = true;
      };
    },
  };
}
