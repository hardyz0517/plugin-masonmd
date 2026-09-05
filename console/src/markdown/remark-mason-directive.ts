type DirectiveNode = {
  type: string;
  name?: string;
  label?: string;
  value?: string;
  attributes?: Record<string, string | null | undefined>;
  children?: DirectiveNode[];
  data?: Record<string, unknown>;
  position?: {
    start?: { offset?: number };
    end?: { offset?: number };
  };
};

type RootNode = DirectiveNode & { children: DirectiveNode[] };
type DiagnosticFile = {
  value: unknown;
  message: (reason: string, node?: unknown) => unknown;
};

const CALLOUT_NAMES = new Set(["info", "success", "warning", "error"]);
const ALIGNMENT_NAMES = new Set(["left", "center", "right"]);

const sourceForNode = (node: DirectiveNode, source: string): string => {
  const start = node.position?.start?.offset;
  const end = node.position?.end?.offset;

  if (typeof start !== "number" || typeof end !== "number") {
    return `::${node.name || "directive"}`;
  }

  return source.slice(start, end);
};

const getAttributeName = (node: DirectiveNode): string | undefined =>
  Object.keys(node.attributes || {})[0];

const hasOnlyOpenAttribute = (node: DirectiveNode): boolean => {
  const attributes = node.attributes || {};
  const keys = Object.keys(attributes);
  return (
    keys.length === 0 ||
    (keys.length === 1 &&
      keys[0] === "open" &&
      (attributes.open === null || attributes.open === undefined || attributes.open === ""))
  );
};

function markFallback(
  node: DirectiveNode,
  source: string,
  message: (reason: string, node: DirectiveNode) => void,
  reason: string
) {
  node.data = {
    ...node.data,
    masonDirectiveFallback: true,
    masonDirectiveSource: sourceForNode(node, source),
  };
  message(reason, node);
}

function normalizeDirective(
  node: DirectiveNode,
  source: string,
  message: (reason: string, node: DirectiveNode) => void
) {
  if (node.type === "textDirective") {
    const literal = sourceForNode(node, source);
    if (literal) {
      // remark-directive treats the colon in values such as
      // `javascript:alert(...)` as an inline directive. Inline directives are
      // not part of the Mason Markdown grammar, so preserve their exact source as text.
      node.type = "text";
      node.value = literal;
      delete node.name;
      delete node.attributes;
      delete node.children;
    }
    return;
  }

  if (node.type !== "containerDirective" && node.type !== "leafDirective") {
    return;
  }

  if (!node.name) {
    markFallback(node, source, message, "Directive is missing a name.");
    return;
  }

  if (CALLOUT_NAMES.has(node.name)) {
    if (node.type !== "containerDirective" || !hasOnlyOpenAttribute(node)) {
      markFallback(
        node,
        source,
        message,
        "Callouts must be container directives and only accept the open attribute."
      );
    }
    return;
  }

  if (node.name === "align") {
    if (
      node.type !== "containerDirective" ||
      Object.keys(node.attributes || {}).length !== 1 ||
      !ALIGNMENT_NAMES.has(getAttributeName(node) || "") ||
      ![null, undefined, ""].includes(node.attributes?.[getAttributeName(node) || ""] ?? null)
    ) {
      markFallback(
        node,
        source,
        message,
        "Alignment accepts only left, center, or right on a container directive."
      );
    }
    return;
  }

  if (node.name === "epigraph") {
    if (node.type !== "containerDirective" || Object.keys(node.attributes || {}).length > 0) {
      markFallback(node, source, message, "Epigraph must be a container directive.");
    }
    return;
  }

  if (node.name !== "cute-table") {
    markFallback(node, source, message, `Unsupported directive: ${node.name}.`);
  }
}

function associateCuteTables(
  parent: RootNode,
  source: string,
  message: (reason: string, node: DirectiveNode) => void
) {
  const children = parent.children || [];
  const nextChildren: DirectiveNode[] = [];

  for (let index = 0; index < children.length; index += 1) {
    const node = children[index];

    if (node.name !== "cute-table" || node.type !== "leafDirective") {
      nextChildren.push(node);
      continue;
    }

    const attributes = node.attributes || {};
    const attributeNames = Object.keys(attributes);
    const style = attributeNames.length === 1 ? attributeNames[0] : undefined;
    const tuackColumn = style === "tuack" ? node.attributes?.tuack : undefined;
    const isValidStyle =
      (style === "three" &&
        (attributes.three === null || attributes.three === undefined || attributes.three === "")) ||
      (style === "tuack" &&
        (tuackColumn === "" ||
          tuackColumn === null ||
          tuackColumn === undefined ||
          (/^[1-9]\d?$/.test(tuackColumn) && Number(tuackColumn) <= 99)));
    const table = children[index + 1];

    if (!isValidStyle || table?.type !== "table") {
      markFallback(
        node,
        source,
        message,
        "cute-table must be followed immediately by a table and use three or tuack."
      );
      nextChildren.push(node);
      continue;
    }

    table.data = {
      ...table.data,
      masonTableStyle: style,
      ...(style === "tuack" && typeof tuackColumn === "string" && tuackColumn
        ? { masonTuackColumn: Number(tuackColumn) }
        : {}),
    };
  }

  parent.children = nextChildren;
}

function walk(
  node: DirectiveNode,
  source: string,
  message: (reason: string, node: DirectiveNode) => void
) {
  normalizeDirective(node, source, message);
  if (node.children?.length) {
    associateCuteTables(node as RootNode, source, message);
    node.children.forEach((child) => walk(child, source, message));
  }
}

export function remarkMasonDirective() {
  return (tree: RootNode, file: DiagnosticFile) => {
    const source = typeof file.value === "string" ? file.value : "";
    const report = (reason: string, node: DirectiveNode) => file.message(reason, node);
    associateCuteTables(tree, source, report);
    tree.children.forEach((node) => walk(node, source, report));
  };
}
