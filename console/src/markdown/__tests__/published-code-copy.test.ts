/** @vitest-environment happy-dom */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cwd } from "node:process";
import { Window } from "happy-dom";
import { describe, expect, it } from "vitest";

const copyRuntime = readFileSync(
  resolve(cwd(), "..", "src", "main", "resources", "assets", "code-block-copy.js"),
  "utf8",
);

const runCopyRuntime = (window: Window) => {
  new Function("window", "document", "navigator", copyRuntime)(
    window,
    window.document,
    window.navigator,
  );
  window.document.dispatchEvent(new window.Event("DOMContentLoaded"));
};

const settle = (window: Window) => new Promise<void>((resolve) => {
  window.setTimeout(resolve, 0);
});

describe("published code copy runtime", () => {
  it("mounts one button and copies source without generated line numbers", async () => {
    const window = new Window();
    const copied: string[] = [];
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: (value: string) => {
          copied.push(value);
          return Promise.resolve();
        },
      },
    });
    window.document.body.innerHTML = [
      "<pre class=\"bytemd-code-block\"><span class=\"bytemd-code-content\"><code>",
      "<span class=\"bytemd-code-line\"><span class=\"bytemd-code-line-number\">17</span><span class=\"bytemd-code-line-content\">return 0;</span></span>",
      "<span class=\"bytemd-code-line\"><span class=\"bytemd-code-line-number\">18</span><span class=\"bytemd-code-line-content\">}</span></span>",
      "</code></span></pre>",
    ].join("");

    runCopyRuntime(window);
    runCopyRuntime(window);

    const block = window.document.querySelector("pre")!;
    const button = block.querySelector<HTMLButtonElement>(".bytemd-code-copy-button")!;
    expect(block.querySelectorAll(".bytemd-code-copy-button")).toHaveLength(1);
    expect(button.getAttribute("title")).toBe("复制代码");

    button.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    await settle(window);

    expect(copied).toEqual(["return 0;\n}"]);
    expect(button.getAttribute("data-copy-state")).toBe("success");
  });

  it("supports unnumbered fallback blocks without changing their source", async () => {
    const window = new Window();
    const copied: string[] = [];
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: (value: string) => {
          copied.push(value);
          return Promise.resolve();
        },
      },
    });
    window.document.body.innerHTML = [
      "<pre class=\"bytemd-code-fallback\"><span class=\"bytemd-code-content\">",
      "<code>const answer = 42;</code></span></pre>",
    ].join("");

    runCopyRuntime(window);

    const button = window.document.querySelector<HTMLButtonElement>(
      ".bytemd-code-copy-button",
    )!;
    button.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    await settle(window);

    expect(copied).toEqual(["const answer = 42;"]);
  });

  it("supports legacy Luogu code blocks without copying their line gutter", async () => {
    const window = new Window();
    const copied: string[] = [];
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: (value: string) => {
          copied.push(value);
          return Promise.resolve();
        },
      },
    });
    window.document.body.innerHTML = [
      "<pre class=\"luogu-code-block\"><span class=\"luogu-code-content\"><code>",
      "<span class=\"luogu-code-line\"><span class=\"luogu-code-line-number\">3</span><span class=\"luogu-code-line-content\">  return 0;</span></span>",
      "</code></span></pre>",
    ].join("");

    runCopyRuntime(window);

    const button = window.document.querySelector<HTMLButtonElement>(
      ".bytemd-code-copy-button",
    )!;
    button.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    await settle(window);

    expect(copied).toEqual(["  return 0;"]);
  });

  it("uses the legacy clipboard fallback after a clipboard permission failure", async () => {
    const window = new Window();
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: () => Promise.reject(new Error("denied")),
      },
    });
    const copied: string[] = [];
    Object.defineProperty(window.document, "execCommand", {
      configurable: true,
      value: (command: string) => {
        copied.push(command);
        return true;
      },
    });
    window.document.body.innerHTML = [
      "<pre class=\"bytemd-code-block\"><span class=\"bytemd-code-content\">",
      "<code>fallback source</code></span></pre>",
    ].join("");

    runCopyRuntime(window);

    const button = window.document.querySelector<HTMLButtonElement>(
      ".bytemd-code-copy-button",
    )!;
    button.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    await settle(window);

    expect(copied).toEqual(["copy"]);
    expect(button.getAttribute("data-copy-state")).toBe("success");
  });
});
