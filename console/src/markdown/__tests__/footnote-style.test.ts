import { compile } from "sass-embedded";
import { Window } from "happy-dom";
import { describe, expect, it } from "vitest";
import { join } from "node:path";

const pluginStyles = compile(
  join(__dirname, "../../styles/luogu-markdown.scss"),
).css;
const editorStyles = compile(join(__dirname, "../../styles/main.scss")).css;

function createWindow(styles: string, markup: string) {
  const window = new Window();
  window.document.head.innerHTML = `<style>${styles}</style>`;
  window.document.body.innerHTML = markup;
  return window;
}

describe("footnote reference style", () => {
  it("removes the underline from published and editor footnote references only", () => {
    const published = createWindow(
      pluginStyles,
      `<div class="luogu-markdown-body">
        <a data-footnote-ref href="#user-content-fn-1">1</a>
        <a href="https://example.com">normal link</a>
      </div>`,
    );
    const editor = createWindow(
      editorStyles,
      `<div class="bytemd"><div class="bytemd-preview"><div class="markdown-body">
        <a data-footnote-ref href="#user-content-fn-1">1</a>
        <a href="https://example.com">normal link</a>
      </div></div></div>`,
    );

    expect(
      published.document.querySelector("a[data-footnote-ref]"),
    ).not.toBeNull();
    expect(
      published.document.querySelector("a[data-footnote-ref]") &&
        published.getComputedStyle(
          published.document.querySelector("a[data-footnote-ref]")!,
        ).textDecoration,
    ).toBe("none");
    expect(
      editor.getComputedStyle(
        editor.document.querySelector("a[data-footnote-ref]")!,
      ).textDecoration,
    ).toBe("none");
    expect(
      published.getComputedStyle(
        published.document.querySelector('a[href="https://example.com"]')!,
      ).textDecoration,
    ).toBe("underline");
  });
});
