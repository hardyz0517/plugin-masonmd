import { readFileSync } from "node:fs";
import { join } from "node:path";
import { compile } from "sass-embedded";
import { Window } from "happy-dom";
import { describe, expect, it } from "vitest";

const pluginStyles = compile(
  join(__dirname, "../../styles/mason-markdown.scss"),
).css;
const editorStyles = compile(join(__dirname, "../../styles/main.scss")).css;
const githubStyles = readFileSync(
  join(
    __dirname,
    "../../../node_modules/github-markdown-css/github-markdown-light.css",
  ),
  "utf8",
);

function createWindow(styles: string, markup: string) {
  const window = new Window();
  window.document.head.innerHTML = `<style>${styles}</style><style>${githubStyles}</style>`;
  window.document.body.innerHTML = markup;
  return window;
}

const displayMath = `
  <div class="mason-math mason-math-display">
    <span class="katex-display"><span class="katex"><span class="katex-html">x = 1</span></span></span>
  </div>
`;

describe("display math style contract", () => {
  it("centers $$ formulas in published content", () => {
    const window = createWindow(
      pluginStyles,
      `<div class="mason-markdown-body">${displayMath}</div>`,
    );
    const wrapper = window.document.querySelector(".mason-math-display")!;
    const display = window.document.querySelector(".katex-display")!;
    const katex = window.document.querySelector(".katex")!;

    expect(window.getComputedStyle(wrapper).display).toBe("block");
    expect(window.getComputedStyle(wrapper).textAlign).toBe("center");
    expect(window.getComputedStyle(wrapper).overflowX).toBe("auto");
    expect(window.getComputedStyle(display).display).toBe("block");
    expect(window.getComputedStyle(display).margin).toBe("0px");
    expect(window.getComputedStyle(display).textAlign).toBe("center");
    expect(window.getComputedStyle(katex).display).toBe("block");
    expect(window.getComputedStyle(katex).textAlign).toBe("center");
    expect(window.getComputedStyle(katex).whiteSpace).toBe("nowrap");
  });

  it("keeps $$ formulas centered in the editor preview", () => {
    const window = createWindow(
      editorStyles,
      `<div class="bytemd"><div class="bytemd-preview"><div class="markdown-body">${displayMath}</div></div></div>`,
    );
    const wrapper = window.document.querySelector(".mason-math-display")!;
    const display = window.document.querySelector(".katex-display")!;
    const inlineMath = window.document.createElement("span");
    inlineMath.className = "mason-math mason-math-inline";
    inlineMath.textContent = "x";
    window.document.querySelector(".markdown-body")!.append(inlineMath);

    expect(window.getComputedStyle(wrapper).textAlign).toBe("center");
    expect(window.getComputedStyle(display).display).toBe("block");
    expect(window.getComputedStyle(display).textAlign).toBe("center");
    // No display-math selector should promote an inline formula to a block.
    expect(window.getComputedStyle(inlineMath).display).not.toBe("block");
  });

  it("keeps legacy display snapshots centered without the published wrapper", () => {
    const window = createWindow(
      pluginStyles,
      `<div class="hardy-prose">
        <div class="math math-display">
          <span class="katex-display"><span class="katex">x = 1</span></span>
        </div>
      </div>`,
    );
    const wrapper = window.document.querySelector(".math-display")!;
    const display = window.document.querySelector(".katex-display")!;

    expect(window.getComputedStyle(wrapper).display).toBe("block");
    expect(window.getComputedStyle(wrapper).textAlign).toBe("center");
    expect(window.getComputedStyle(wrapper).width).toBe("100%");
    expect(window.getComputedStyle(display).display).toBe("block");
    expect(window.getComputedStyle(display).textAlign).toBe("center");
  });

  it("centers a legacy formula-only paragraph without centering mixed prose", () => {
    const window = createWindow(
      pluginStyles,
      `<div class="hardy-prose">
        <p class="mason-math-paragraph-display"><span class="math math-inline"><span class="katex">x = 1</span></span></p>
        <p>before <span class="math math-inline"><span class="katex">x = 1</span></span></p>
      </div>`,
    );
    const paragraphs = window.document.querySelectorAll("p");

    expect(window.getComputedStyle(paragraphs[0]).textAlign).toBe("center");
    expect(window.getComputedStyle(paragraphs[1]).textAlign).not.toBe("center");
  });
});
