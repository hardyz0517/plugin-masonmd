import { compile } from "sass-embedded";
import { Window } from "happy-dom";
import { describe, expect, it } from "vitest";
import { join } from "node:path";

const styles = compile(
  join(__dirname, "../../styles/luogu-markdown.scss"),
).css;

describe("code block style contract", () => {
  it("keeps generated code lines as rows after a theme span reset", () => {
    const window = new Window();
    window.document.head.innerHTML = `
      <style>${styles}</style>
      <style>.markdown-body pre code span { display: inline; }</style>
    `;
    window.document.body.innerHTML = `
      <div class="markdown-body">
        <pre class="luogu-code-block"><span class="luogu-code-content"><code>
          <span class="luogu-code-line"><span class="luogu-code-line-content">one</span></span>
          <span class="luogu-code-line"><span class="luogu-code-line-content">two</span></span>
        </code></span></pre>
      </div>
    `;

    const lines = window.document.querySelectorAll(".luogu-code-line");
    expect(lines.length).toBe(2);
    expect(window.document.querySelectorAll("pre > code").length).toBe(0);
    expect(window.getComputedStyle(window.document.querySelector(".luogu-code-content")!).display).toBe("block");
    const code = window.document.querySelector(".luogu-code-content > code")!;
    expect(window.getComputedStyle(code).display).toBe("block");
    expect(window.getComputedStyle(code).backgroundColor).toBe("transparent");
    expect(window.getComputedStyle(code).padding).toBe("0px");
    lines.forEach((line) => {
      expect(window.getComputedStyle(line).display).toBe("grid");
    });
  });
});
