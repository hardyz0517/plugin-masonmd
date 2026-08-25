import { compile } from "sass-embedded";
import { Window } from "happy-dom";
import { describe, expect, it } from "vitest";
import { join } from "node:path";

const styles = compile(
  join(__dirname, "../../styles/bytemd-markdown.scss"),
).css;

describe("code block style contract", () => {
  it("styles Prism tokens in ordinary code blocks without line numbers", () => {
    for (const selector of [
      ".bytemd-code-content .token.comment",
      ".bytemd-code-content .token.punctuation",
      ".bytemd-code-content .token.keyword",
      ".bytemd-code-content .token.string",
      ".bytemd-code-content .token.function",
      ".bytemd-code-content .token.number",
    ]) {
      expect(styles).toContain(selector);
    }
  });

  it("keeps generated code lines as rows after a theme span reset", () => {
    const window = new Window();
    window.document.head.innerHTML = `
      <style>${styles}</style>
      <style>.markdown-body pre code span { display: inline; }</style>
    `;
    window.document.body.innerHTML = `
      <div class="markdown-body">
        <pre class="bytemd-code-block"><span class="bytemd-code-content"><code>
          <span class="bytemd-code-line"><span class="bytemd-code-line-content">one</span></span>
          <span class="bytemd-code-line"><span class="bytemd-code-line-content">two</span></span>
        </code></span></pre>
        <pre class="bytemd-code-block bytemd-code-block--no-line-numbers"><span class="bytemd-code-content"><code>plain</code></span></pre>
      </div>
    `;

    const lines = window.document.querySelectorAll(".bytemd-code-line");
    expect(lines.length).toBe(2);
    expect(window.document.querySelectorAll("pre > code").length).toBe(0);
    expect(window.getComputedStyle(window.document.querySelector(".bytemd-code-content")!).display).toBe("block");
    const code = window.document.querySelector(".bytemd-code-content > code")!;
    expect(window.getComputedStyle(code).display).toBe("block");
    expect(window.getComputedStyle(code).backgroundColor).toBe("transparent");
    expect(window.getComputedStyle(code).padding).toBe("0px");
    lines.forEach((line) => {
      expect(window.getComputedStyle(line).display).toBe("grid");
    });
    const ordinary = window.document.querySelector(
      ".bytemd-code-block--no-line-numbers",
    )!;
    expect(window.getComputedStyle(ordinary).paddingLeft).toBe("16px");
    expect(window.getComputedStyle(ordinary).paddingRight).toBe("16px");
  });

  it("preserves ordinary code indentation after a host resets descendant whitespace", () => {
    const window = new Window();
    window.document.head.innerHTML = `
      <style>${styles}</style>
      <style>
        .hardy-prose pre code,
        .hardy-prose pre code span {
          white-space: normal;
        }
      </style>
    `;
    window.document.body.innerHTML = `
      <article class="hardy-prose">
        <pre class="bytemd-code-block bytemd-code-block--no-line-numbers"><span class="bytemd-code-content"><code><span class="token keyword">int</span> main() {\n  <span class="token function">run</span>();\n}</code></span></pre>
      </article>
    `;

    const block = window.document.querySelector(".bytemd-code-block")!;
    const content = window.document.querySelector(".bytemd-code-content")!;
    const code = window.document.querySelector(".bytemd-code-content > code")!;
    const token = window.document.querySelector(".bytemd-code-content .token")!;

    expect(window.getComputedStyle(block).whiteSpace).toBe("pre-wrap");
    expect(window.getComputedStyle(content).whiteSpace).toBe("pre-wrap");
    expect(window.getComputedStyle(code).whiteSpace).toBe("pre-wrap");
    expect(window.getComputedStyle(token).whiteSpace).toBe("pre-wrap");
  });

  it("keeps the code block on one light surface against host inline-code rules", () => {
    const window = new Window();
    window.document.head.innerHTML = `
      <style>${styles}</style>
      <style>
        main.hardy-post-editor .bytemd .bytemd-preview .markdown-body :not(pre) > code {
          background: #f0f0f0;
        }
      </style>
    `;
    window.document.body.innerHTML = `
      <main class="hardy-post-editor">
        <div class="bytemd">
          <div class="bytemd-preview">
            <div class="markdown-body">
              <pre class="bytemd-code-block"><span class="bytemd-code-content"><code>one</code></span></pre>
              <pre class="bytemd-code-fallback"><span class="bytemd-code-content"><code>two</code></span></pre>
            </div>
          </div>
        </div>
      </main>
    `;

    const blocks = window.document.querySelectorAll("pre");
    expect(window.getComputedStyle(blocks[0]).backgroundColor).toBe("#fafafa");
    expect(window.getComputedStyle(blocks[1]).backgroundColor).toBe("#fafafa");
    blocks.forEach((block) => {
      expect(
        window.getComputedStyle(block.querySelector(".bytemd-code-content > code")!).backgroundColor,
      ).toBe("transparent");
    });
  });
});
