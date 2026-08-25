import type { ViewerProps } from "bytemd";

type SanitizeSchema = Parameters<NonNullable<ViewerProps["sanitize"]>>[0];

// KaTeX uses only numeric positioning declarations. Keep these generated
// styles while rejecting arbitrary CSS from raw HTML.
const katexStyle = /^(?:(?:height|margin-left|margin-right|position|top|vertical-align|border-bottom-width):(?:-?\d+(?:\.\d+)?(?:em|ex|px|pt|%)?|relative);?)+$/;

const addUnique = (values: unknown[] | undefined, additions: string[]) => [
  ...new Set([
    ...(values || []).filter((value): value is string => typeof value === "string"),
    ...additions,
  ]),
];

export const createMarkdownSanitizeSchema = (
  _profile: "legacy" | "bytemd-v1"
): NonNullable<ViewerProps["sanitize"]> => {
  return (schema: SanitizeSchema) => {
    schema.tagNames = addUnique(schema.tagNames, [
      "details",
      "summary",
      "cite",
      "colgroup",
      "col",
      "math",
      "semantics",
      "mrow",
      "mi",
      "mn",
      "mo",
      "msup",
      "msub",
      "msubsup",
      "mfrac",
      "mroot",
      "msqrt",
      "mover",
      "munder",
      "munderover",
      "mtext",
      "mspace",
      "mpadded",
      "mphantom",
      "mtable",
      "mtr",
      "mtd",
      "annotation",
      "svg",
      "path",
    ]).filter((tagName) => tagName !== "style");
    schema.attributes = schema.attributes || {};
    schema.attributes["*"] = addUnique(schema.attributes["*"], [
      "className",
      "style",
      "dataLine",
    ]);
    schema.attributes["*"] = schema.attributes["*"].map((attribute) =>
      attribute === "style" ? ["style", katexStyle] : attribute
    );
    schema.attributes.math = addUnique(schema.attributes.math, ["xmlns", "display"]);
    schema.attributes.annotation = addUnique(schema.attributes.annotation, ["encoding"]);
    schema.attributes.span = addUnique(schema.attributes.span, ["role", "ariaLabel"]);
    schema.attributes.div = addUnique(schema.attributes.div, ["role", "ariaLabel"]);
    schema.attributes.svg = addUnique(schema.attributes.svg, [
      "xmlns",
      "viewBox",
      "focusable",
      "role",
    ]);
    schema.attributes.path = addUnique(schema.attributes.path, ["d"]);
    schema.attributes.details = addUnique(schema.attributes.details, ["open"]);
    schema.attributes.pre = addUnique(schema.attributes.pre, ["dataLanguage"]);
    return schema;
  };
};
