/** @vitest-environment happy-dom */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cwd } from "node:process";
import { afterEach, describe, expect, it } from "vitest";

const normalizer = readFileSync(
  resolve(cwd(), "..", "src", "main", "resources", "assets", "mermaid-layout-normalizer.js"),
  "utf8"
);

const runNormalizer = () => {
  new Function(normalizer)();
};

afterEach(() => {
  document.body.replaceChildren();
});

describe("published Mermaid layout normalizer", () => {
  it("restores intrinsic dimensions for legacy SVGs saved with width=100%", () => {
    document.body.innerHTML = `
      <div class="bytemd-mermaid">
        <svg viewBox="-8 -8 165.4 320" width="100%"></svg>
      </div>
    `;

    const svg = document.querySelector(".bytemd-mermaid > svg");
    const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
    style.textContent =
      ".marker { fill: var(--broken, #333))))333); } .node rect { fill: #ECECFF; stroke: #9370DB; }";
    svg?.append(style);

    runNormalizer();

    expect(svg?.getAttribute("width")).toBe("165.4");
    expect(svg?.getAttribute("height")).toBe("320");
    expect(svg?.getAttribute("preserveAspectRatio")).toBe("xMidYMid meet");
    expect(svg?.getAttribute("style")).toContain("width: 165.4px");
    expect(svg?.querySelector("style")?.textContent).toContain(
      "plugin-bytemd legacy Mermaid line repair"
    );
    expect(svg?.querySelector("style")?.textContent).toContain(
      "var(--bytemd-mermaid-primary-color,#f8f8f8)"
    );
    expect(svg?.querySelector("style")?.textContent).toContain(
      "var(--bytemd-mermaid-node-border,#007acc)"
    );
    expect(svg?.querySelector("style")?.textContent).not.toContain(
      "#ECECFF"
    );

    const normalizedStyle = svg?.querySelector("style")?.textContent;
    runNormalizer();
    expect(svg?.querySelector("style")?.textContent).toBe(normalizedStyle);
  });

  it("preserves a numeric width while deriving a missing matching height", () => {
    document.body.innerHTML = `
      <div class="bytemd-mermaid">
        <svg viewBox="0 0 400 200" width="300"></svg>
      </div>
    `;

    runNormalizer();

    const svg = document.querySelector(".bytemd-mermaid > svg");
    expect(svg?.getAttribute("width")).toBe("300");
    expect(svg?.getAttribute("height")).toBe("150");
  });

  it("centers labels in legacy SVG-only flowcharts without touching the shape layout", () => {
    document.body.innerHTML = `
      <div class="bytemd-mermaid">
        <svg aria-roledescription="flowchart-v2" viewBox="0 0 160 120" width="100%">
          <g transform="translate(80, 20)" class="node default flowchart-label">
            <rect class="label-container" x="-24" y="-16.7" width="48" height="33.4"></rect>
            <g class="label" transform="translate(0, -9.1999998093)">
              <rect></rect><text><tspan class="row" x="0">开始</tspan></text>
            </g>
          </g>
          <g transform="translate(80, 60)" class="edgeLabel">
            <g class="label" transform="translate(-8, -9.1999998093)">
              <rect height="18.3999996185" width="16"></rect>
              <text><tspan class="row" x="0">是</tspan></text>
            </g>
          </g>
        </svg>
      </div>
    `;

    runNormalizer();

    const svg = document.querySelector(".bytemd-mermaid > svg");
    const nodeLabel = svg?.querySelector(".node.flowchart-label > .label");
    const edgeLabel = svg?.querySelector(".edgeLabel > .label");
    const nodeText = nodeLabel?.querySelector("text");
    const edgeText = edgeLabel?.querySelector("text");

    expect(nodeLabel?.getAttribute("transform")).toBe("translate(0, 0)");
    expect(nodeText?.getAttribute("y")).toBe("0");
    expect(nodeText?.getAttribute("dominant-baseline")).toBe("central");
    expect(edgeLabel?.getAttribute("transform")).toBe(
      "translate(-8, -9.1999998093)"
    );
    expect(edgeText?.getAttribute("y")).toBe("9.2");
    expect(edgeText?.getAttribute("dominant-baseline")).toBe("central");
    expect(svg?.querySelector(".node.flowchart-label > rect")?.getAttribute("y")).toBe(
      "-16.7"
    );

    const normalizedMarkup = document.body.innerHTML;
    runNormalizer();
    expect(document.body.innerHTML).toBe(normalizedMarkup);
  });

  it("leaves modern foreignObject labels unchanged", () => {
    document.body.innerHTML = `
      <div class="bytemd-mermaid">
        <svg aria-roledescription="flowchart-v2" viewBox="0 0 100 60" width="100%">
          <foreignObject x="0" y="0" width="100" height="60">
            <div xmlns="http://www.w3.org/1999/xhtml">现代标签</div>
          </foreignObject>
          <g class="node flowchart-label">
            <g class="label" transform="translate(0, -9.2)">
              <text><tspan>不应修改</tspan></text>
            </g>
          </g>
        </svg>
      </div>
    `;

    runNormalizer();

    const nodeLabel = document.querySelector(".node.flowchart-label > .label");
    const nodeText = nodeLabel?.querySelector("text");
    expect(
      nodeLabel?.getAttribute("transform")
    ).toBe("translate(0, -9.2)");
    expect(nodeText?.hasAttribute("y")).toBe(false);
    expect(nodeText?.hasAttribute("dominant-baseline")).toBe(false);
  });

  it("centers sequence actor labels and is idempotent", () => {
    document.body.innerHTML = `
      <div class="bytemd-mermaid">
        <svg aria-roledescription="sequence" viewBox="0 0 240 120" width="100%">
          <g>
            <rect class="actor actor-bottom" x="20" y="40" width="100" height="40"></rect>
            <text class="actor" x="70" y="60"><tspan>用户</tspan></text>
          </g>
          <g>
            <line x1="170" y1="0" x2="170" y2="80"></line>
            <g>
              <rect class="actor actor-top" x="120" y="0" width="100" height="40"></rect>
              <text class="actor" x="120" y="0"><tspan>编辑器</tspan></text>
            </g>
          </g>
        </svg>
      </div>
    `;

    runNormalizer();

    const actors = Array.from(document.querySelectorAll("text.actor"));
    expect(actors.map((actor) => actor.getAttribute("text-anchor"))).toEqual([
      "middle",
      "middle",
    ]);
    expect(actors.map((actor) => actor.getAttribute("dominant-baseline"))).toEqual([
      "central",
      "central",
    ]);
    expect(actors.map((actor) => [actor.getAttribute("x"), actor.getAttribute("y")])).toEqual([
      ["70", "60"],
      ["170", "20"],
    ]);

    const normalizedMarkup = document.body.innerHTML;
    runNormalizer();
    expect(document.body.innerHTML).toBe(normalizedMarkup);
  });
});
