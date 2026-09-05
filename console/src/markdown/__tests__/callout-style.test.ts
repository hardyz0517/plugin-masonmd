import { compile } from "sass-embedded";
import { describe, expect, it } from "vitest";
import { join } from "node:path";

const styles = compile(join(__dirname, "../../styles/mason-markdown.scss")).css;

describe("Mason Markdown callout style contract", () => {
  it("uses the compact mask-icon treatment instead of text glyphs", () => {
    expect(styles).toContain(
      "border-left: 5px solid var(--mason-markdown-callout-border, #d9d9d9)"
    );
    expect(styles).toContain("padding-left: 24px");
    expect(styles).toContain("height: 16px");
    expect(styles).toContain("width: 16px");
    expect(styles).toContain(".mason-callout[open] > summary::after");
    expect(styles).toContain("rotate(90deg)");
    expect(styles).toContain(".mason-callout-info > summary::before");
    expect(styles).toContain(".mason-callout-success > summary::before");
    expect(styles).toContain(".mason-callout-warning > summary::before");
    expect(styles).toContain(".mason-callout-error > summary::before");
    expect(styles).not.toContain("--mason-markdown-callout-icon");
  });
});
