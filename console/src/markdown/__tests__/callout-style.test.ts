import { compile } from "sass-embedded";
import { describe, expect, it } from "vitest";
import { join } from "node:path";

const styles = compile(join(__dirname, "../../styles/bytemd-markdown.scss")).css;

describe("Bytemd callout style contract", () => {
  it("uses Bytemd's compact mask-icon treatment instead of text glyphs", () => {
    expect(styles).toContain(
      "border-left: 5px solid var(--bytemd-markdown-callout-border, #d9d9d9)"
    );
    expect(styles).toContain("padding-left: 24px");
    expect(styles).toContain("height: 16px");
    expect(styles).toContain("width: 16px");
    expect(styles).toContain(".bytemd-callout[open] > summary::after");
    expect(styles).toContain("rotate(90deg)");
    expect(styles).toContain(".bytemd-callout-info > summary::before");
    expect(styles).toContain(".bytemd-callout-success > summary::before");
    expect(styles).toContain(".bytemd-callout-warning > summary::before");
    expect(styles).toContain(".bytemd-callout-error > summary::before");
    expect(styles).not.toContain("--bytemd-markdown-callout-icon");
  });
});
