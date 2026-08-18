type MarkdownNode = {
  type?: string;
  value?: string;
  url?: string;
  children?: MarkdownNode[];
  position?: {
    start?: { offset?: number };
    end?: { offset?: number };
  };
};

const STYLE_ELEMENT = /<style\b[^>]*>[\s\S]*?<\/style\s*>/gi;
const UNSAFE_ELEMENT = /<\s*\/?\s*(?:script|iframe|object|embed|applet|base|form|meta|link)\b/i;

const isUnsafeUrl = (value: string) => {
  const normalized = value
    .trim()
    .split("")
    .filter((character) => character.charCodeAt(0) > 0x20)
    .join("")
    .toLowerCase();
  if (/^(?:javascript|vbscript|data|file):/.test(normalized)) return true;

  try {
    return /^(?:javascript|vbscript|data|file):/.test(
      decodeURIComponent(normalized),
    );
  } catch {
    return false;
  }
};

const sourceForNode = (node: MarkdownNode, source: string) => {
  const start = node.position?.start?.offset;
  const end = node.position?.end?.offset;
  if (typeof start !== "number" || typeof end !== "number") return undefined;
  return source.slice(start, end);
};

function preserveUnsafeLink(node: MarkdownNode, source: string) {
  if (node.type !== "link" || typeof node.url !== "string" || !isUnsafeUrl(node.url)) {
    return;
  }

  const literal = sourceForNode(node, source);
  if (!literal) return;

  // Keep the original Markdown visible, but make it a text node before
  // remark-rehype can create an anchor from the unsafe destination.
  node.type = "text";
  node.value = literal;
  delete node.url;
  delete node.children;
}

function stripUnsafeContent(
  node: MarkdownNode,
  source: string,
  parent?: MarkdownNode,
) {
  if (node.type === "html" && typeof node.value === "string") {
    node.value = node.value.replace(STYLE_ELEMENT, "");

    // Sanitizers quite correctly remove executable elements, but dropping the
    // whole node also drops the author's source. Render dangerous HTML as
    // escaped text so the fallback remains readable and non-executable.
    if (UNSAFE_ELEMENT.test(node.value)) {
      const literal = node.value;
      if (parent?.type === "root") {
        node.type = "paragraph";
        node.children = [{ type: "text", value: literal }];
        delete node.value;
      } else {
        node.type = "text";
      }
    }
  }

  preserveUnsafeLink(node, source);
  node.children?.forEach((child) => stripUnsafeContent(child, source, node));
}

/**
 * Raw HTML is intentionally not a styling or execution escape hatch for
 * posts. Strip complete style elements and preserve executable elements as
 * text before remark-rehype can turn them into live nodes; generated KaTeX
 * and Mermaid markup do not pass through here.
 */
export function remarkStripUnsafeHtml() {
  return (tree: MarkdownNode, file: { value?: unknown }) => {
    const source = typeof file.value === "string" ? file.value : "";
    stripUnsafeContent(tree, source);
  };
}
