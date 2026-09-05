/** @vitest-environment happy-dom */

import { describe, expect, it } from "vitest";
import { sanitizeMermaidSvg } from "../../plugins/mermaid";

describe("Mermaid SVG sanitizer", () => {
  it("keeps generated SVG CSS while restoring Mermaid's intrinsic dimensions", () => {
    const svg = sanitizeMermaidSvg(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="-8 -8 165.4 320" width="100%" style="max-width: 165.4px">
        <style>.marker { fill: #333333; stroke: #333; } .node { fill: #ECECFF; }</style>
        <path class="marker" d="M 0 0 L 10 5" onload="alert(1)" />
      </svg>
    `);

    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("width")).toBe("165.4");
    expect(svg?.getAttribute("height")).toBe("320");
    expect(svg?.getAttribute("viewBox")).toBe("-8 -8 165.4 320");
    expect(svg?.getAttribute("preserveAspectRatio")).toBe("xMidYMid meet");
    expect(svg?.getAttribute("style")).toContain("width: 165.4px");
    expect(svg?.getAttribute("style")).toContain("height: auto");
    expect(svg?.querySelector("path")?.getAttribute("onload")).toBeNull();
    expect(svg?.querySelector("style")?.textContent).toContain(
      "var(--mason-mermaid-line-color, #007acc)"
    );
    expect(svg?.querySelector("style")?.textContent).toContain(
      "mason-markdown Mermaid marker colors"
    );
    expect(svg?.querySelector("style")?.textContent).not.toContain(")333)");
  });

  it("rejects unsafe SVG CSS and SVGs without a usable size", () => {
    expect(
      sanitizeMermaidSvg(
        '<svg viewBox="0 0 100 50"><style>.node { fill: url(https://bad.test); }</style></svg>'
      )
    ).toBeNull();
    expect(sanitizeMermaidSvg('<svg width="100%"><path d="M0 0" /></svg>')).toBeNull();
  });

  it("keeps Mermaid HTML labels centered while filtering unsafe XHTML styles", () => {
    const svg = sanitizeMermaidSvg(`
      <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 120 40">
        <foreignObject x="0" y="0" width="120" height="40" style="width: 120px; height: 40px; position: absolute">
          <div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; max-width: 120px; text-align: center; background-image: url(https://bad.test)">
            <span class="nodeLabel"><strong>开始</strong></span>
          </div>
        </foreignObject>
      </svg>
    `);

    expect(svg).not.toBeNull();
    const foreignObject = svg?.querySelector("foreignObject");
    const label = foreignObject?.querySelector("div");
    expect(foreignObject).not.toBeNull();
    expect(label?.getAttribute("style")).toContain("display: table-cell");
    expect(label?.getAttribute("style")).toContain("text-align: center");
    expect(label?.getAttribute("style")).not.toContain("background-image");
    expect(label?.querySelector("strong")?.textContent).toBe("开始");
  });

  it("centers legacy sequence actor labels inside their rectangles", () => {
    const svg = sanitizeMermaidSvg(`
      <svg xmlns="http://www.w3.org/2000/svg" aria-roledescription="sequence" viewBox="-10 -10 240 120">
        <g>
          <rect class="actor actor-bottom" x="20" y="40" width="100" height="40" />
          <text class="actor" x="70" y="60"><tspan>用户</tspan></text>
        </g>
        <g>
          <line x1="170" y1="0" x2="170" y2="80" />
          <g>
            <rect class="actor actor-top" x="120" y="0" width="100" height="40" />
            <text class="actor" x="120" y="0"><tspan>编辑器</tspan></text>
          </g>
        </g>
      </svg>
    `);

    expect(svg).not.toBeNull();
    const actors = Array.from(svg?.querySelectorAll("text.actor") || []);
    expect(actors).toHaveLength(2);
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
  });
});
