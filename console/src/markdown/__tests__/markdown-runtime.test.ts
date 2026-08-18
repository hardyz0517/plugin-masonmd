import { describe, expect, it } from "vitest";
import { compileMarkdown, createMarkdownRuntime } from "../pipeline";
import { createMarkdownRenderCoordinator } from "../render-coordinator";
import {
  createDeterministicMermaidId,
  deriveMermaidSvgDimensions,
  rewriteMermaidThemeCss,
  sanitizeMermaidSvg,
} from "../../plugins/mermaid";
import {
  createLuoguTableCells,
  parseLuoguTableSource,
  serializeLuoguTable,
} from "../../editor/table-source-model";

const render = (raw: string) =>
  compileMarkdown({
    raw,
    profile: "luogu-v1",
    target: "save-html",
    runtime: createMarkdownRuntime("luogu-v1"),
  });

describe("Luogu Markdown runtime", () => {
  it("wraps saved HTML in a theme-independent published-content container", async () => {
    const saved = await createMarkdownRenderCoordinator("luogu-v1").render(
      "# Published title",
      "save-html",
    );
    const preview = await compileMarkdown({
      raw: "# Preview title",
      profile: "luogu-v1",
      target: "editor-preview",
      runtime: createMarkdownRuntime("luogu-v1"),
    });

    expect(saved.canonicalHtml).not.toContain("luogu-markdown-body");
    expect(saved.renderedHtml).toContain('<div class="luogu-markdown-body">');
    expect(preview.renderedHtml).not.toContain("luogu-markdown-body");
  });

  it("rejects raw style tags that could alter the published page", async () => {
    const result = await render("<style>pre { filter: blur(10px); }</style>\n\nText");

    expect(result.canonicalHtml).not.toContain("<style");
    expect(result.canonicalHtml).not.toContain("filter: blur");
  });

  it("keeps GFM tables and inline formatting in the shared pipeline", async () => {
    const result = await render("| Name | Value |\n| --- | --- |\n| **A** | `1` |");

    expect(result.canonicalHtml).toContain("<table");
    expect(result.canonicalHtml).toContain("<strong>A</strong>");
    expect(result.canonicalHtml).toContain("<code>1</code>");
  });

  it("renders nested callouts as safe details elements", async () => {
    const result = await render(
      "::::warning[Outer]{open}\nText\n:::info[Inner]\n**Body**\n:::\n::::"
    );

    expect(result.canonicalHtml).toContain('class="luogu-callout luogu-callout-warning"');
    expect(result.canonicalHtml).toContain("<details");
    expect(result.canonicalHtml).toContain("<summary>Inner</summary>");
    expect(result.canonicalHtml).toContain("<strong>Body</strong>");
  });

  it("rejects directive attributes that are not part of the Luogu grammar", async () => {
    const result = await render(
      ":::warning[Title]{open=true}\nBody\n:::\n\n::align{center=bad}\nText\n:::\n\n::epigraph[Author]{class=unsafe}\nQuote\n:::"
    );

    expect(result.diagnostics.length).toBeGreaterThanOrEqual(3);
    expect(result.canonicalHtml).toContain("luogu-directive-fallback");
    expect(result.canonicalHtml).not.toContain('class="unsafe"');
  });

  it("supports alignment, epigraphs, and cute table styles", async () => {
    const result = await render(
      ":::align{center}\nCentered\n:::\n\n:::epigraph[-- author]\nQuote\n:::\n\n::cute-table{three}\n\n| A | B |\n| --- | --- |\n| 1 | 2 |"
    );

    expect(result.canonicalHtml).toContain("luogu-align-center");
    expect(result.canonicalHtml).toContain("luogu-epigraph");
    expect(result.canonicalHtml).toContain("luogu-cute-table-three");
  });

  it("renders Luogu merge markers as bounded table spans", async () => {
    const result = await render(
      "| A | B | C |\n| --- | --- | --- |\n| 1 | 2 | 3 |\n| ^ | ^ | 4 |\n| 5 | < | 6 |"
    );

    expect(result.canonicalHtml).toContain('rowspan="2"');
    expect(result.canonicalHtml).toContain('colspan="2"');
    expect(result.canonicalHtml).not.toContain("<script");
  });

  it("renders the four-column vertical merge example from the compatibility page", async () => {
    const result = await render(
      [
        "| A | B | C | D |",
        "| --- | --- | --- | --- |",
        "| 纵向合并 | 横向左单元格 | 横向右单元格 | 普通单元格 |",
        "| ^ | < | > | 第二行 |",
        "| ^ | 普通文本 | 普通文本 | 第三行 |",
      ].join("\n")
    );

    expect(result.canonicalHtml).toContain('rowspan="3"');
    expect(result.canonicalHtml).toContain("<td rowspan=\"3\">纵向合并</td>");
    expect(result.canonicalHtml).toContain("&#x3C;");
    expect(result.canonicalHtml).toContain("<td>></td>");
    expect(result.canonicalHtml).not.toContain("colspan=");
    expect(result.canonicalHtml).toContain("<td>第二行</td>");
    expect(result.canonicalHtml).toContain("<td>第三行</td>");
  });

  it("keeps valid table merges when another marker is malformed", async () => {
    const result = await render(
      "| A | B | C |\n| --- | --- | --- |\n| 1 | 2 | 3 |\n| ^ | > | 4 |"
    );

    expect(result.canonicalHtml).toContain('rowspan="2"');
    expect(result.canonicalHtml).toContain("<td>></td>");
    expect(result.canonicalHtml).not.toContain("colspan=");
    expect(result.diagnostics.some((item) => item.message.includes("Unsupported forward merge"))).toBe(true);
  });

  it("renders CuteTable variants as intrinsic-width containers", async () => {
    const result = await render(
      "::cute-table{three}\n\n| A | B |\n| --- | --- |\n| 1 | 2 |"
    );

    expect(result.canonicalHtml).toContain(
      'class="luogu-table-scroll luogu-cute-table luogu-cute-table-three"'
    );
    expect(result.canonicalHtml).toContain("<colgroup><col><col></colgroup>");
  });

  it("marks the requested Tuack group boundary on its following column", async () => {
    const result = await render(
      "::cute-table{tuack=2}\n\n| A | B | C | D |\n| --- | --- | --- | --- |\n| 1 | 2 | 3 | 4 |"
    );

    expect(result.canonicalHtml).toContain(
      '<colgroup><col><col><col class="luogu-tuack-break"><col></colgroup>'
    );
    expect(result.canonicalHtml).not.toContain('<th class="luogu-tuack-break"');
    expect(result.canonicalHtml).not.toContain('<td class="luogu-tuack-break"');
  });

  it("uses Prism output, defaults to C++, and handles line metadata", async () => {
    const result = await render(
      "``` lines=2-3\nint main() {\n  return 0;\n}\n```"
    );

    expect(result.canonicalHtml).toContain("luogu-code-block");
    expect(result.canonicalHtml).toContain('data-language="cpp"');
    expect(result.canonicalHtml).toContain("luogu-code-line-number");
    expect(result.canonicalHtml).toContain("is-highlighted");
  });

  it("reports malformed line metadata without highlighting an invented line", async () => {
    const result = await render("```cpp lines=0,3-2\nint main() {}\n```");

    expect(result.diagnostics.filter((item) => item.message.includes("Invalid code line range")).length).toBe(2);
    expect(result.canonicalHtml).not.toContain("is-highlighted");
  });

  it("falls back safely for unknown languages and raw HTML", async () => {
    const result = await render(
      "```not-a-language\n<script>alert(1)</script>\n```\n\n<img src=javascript:alert(1) onerror=alert(1)>"
    );

    expect(result.canonicalHtml).toContain('class="language-plaintext luogu-code-fallback"');
    expect(result.canonicalHtml).not.toContain('data-language="plaintext"');
    expect(result.canonicalHtml).not.toContain("<script>");
    expect(result.canonicalHtml).not.toContain("onerror");
    expect(result.diagnostics.some((item) => item.message.includes("Unknown code language"))).toBe(true);
  });

  it("preserves dangerous source as text and degrades malformed blocks", async () => {
    const result = await render(
      [
        "<script>alert('this must be removed')</script>",
        "",
        "[危险链接](javascript:alert('this must be blocked'))",
        "",
        "```unknown-language",
        "Unknown language should render as readable plain text and report a diagnostic.",
        "```",
        "",
        "```cpp lines=0,4-2",
        "int invalidRange = 1;",
        "```",
        "",
        ":::unknown-directive[不应被执行]",
        "原样内容",
        ":::",
      ].join("\n"),
    );

    expect(result.canonicalHtml).toContain("script>alert('this must be removed')");
    expect(result.canonicalHtml).not.toContain("<script>");
    expect(result.canonicalHtml).toContain(
      "[危险链接](javascript:alert('this must be blocked'))",
    );
    expect(result.canonicalHtml).not.toContain("<a");
    expect(result.canonicalHtml).toContain('class="language-plaintext"');
    expect(result.canonicalHtml).toContain('class="language-cpp"');
    expect(result.canonicalHtml).not.toContain("luogu-code-line-number");
    expect(result.canonicalHtml).toContain("<p>不应被执行</p>");
    expect(result.canonicalHtml).toContain("<p>原样内容</p>");
    expect(result.canonicalHtml).not.toContain(":::");
    expect(result.diagnostics.some((item) => item.message.includes("Unknown code language"))).toBe(true);
    expect(result.diagnostics.filter((item) => item.message.includes("Invalid code line range")).length).toBe(2);
    expect(result.diagnostics.some((item) => item.message.includes("Unsupported directive"))).toBe(true);
  });

  it("does not treat raw HTML code blocks as internal Luogu code nodes", async () => {
    const result = await render(
      '<pre data-luogu-language="cpp"><code>int main() {}</code></pre>'
    );

    expect(result.canonicalHtml).not.toContain("luogu-code-line-number");
    expect(result.canonicalHtml).not.toContain("data-language=\"cpp\"");
  });

  it("keeps the legacy profile on ByteMD's native code handler", async () => {
    const result = await compileMarkdown({
      raw: "```cpp\nint main() {}\n```",
      profile: "legacy",
      target: "save-html",
      runtime: createMarkdownRuntime("legacy"),
    });

    expect(result.canonicalHtml).not.toContain("luogu-code-block");
  });

  it("serializes the editor table model back to Luogu source", () => {
    const cells = createLuoguTableCells(3, 3);
    cells[0][0].content = "A";
    cells[1][0].content = "B";
    cells[1][0].rowspan = 2;
    cells[1][1].hidden = true;
    cells[2][1].content = "C";
    cells[2][1].colspan = 2;
    cells[2][2].hidden = true;

    const source = serializeLuoguTable(cells);
    expect(source).toContain("^ |");
    expect(source).toContain("< |");
    expect(source).not.toContain("<table>");
  });

  it("round-trips Luogu table source without changing merge topology", () => {
    const source = [
      "| A | B | C |",
      "| :--- | :---: | ---: |",
      "| 1 | 2 | 3 |",
      "| ^ | ^ | 4 |",
      "| 5 | < | 6 |",
    ].join("\n");
    const parsed = parseLuoguTableSource(source);

    expect(parsed?.valid).toBe(true);
    expect(parsed?.alignments).toEqual(["left", "center", "right"]);
    expect(parsed?.cells[1][0].rowspan).toBe(2);
    expect(parsed?.cells[1][1].rowspan).toBe(2);
    expect(parsed?.cells[3][0].colspan).toBe(2);

    const serialized = serializeLuoguTable(parsed!.cells, { alignments: parsed!.alignments });
    const reparsed = parseLuoguTableSource(serialized);
    expect(reparsed?.valid).toBe(true);
    expect(reparsed?.cells[1][0].rowspan).toBe(2);
    expect(reparsed?.cells[3][0].colspan).toBe(2);
    expect(reparsed?.alignments).toEqual(parsed?.alignments);
  });

  it("keeps escaped marker text as ordinary table content", () => {
    const parsed = parseLuoguTableSource("| A | B |\n| --- | --- |\n| \\^ | \\| | ");
    expect(parsed?.valid).toBe(true);
    expect(parsed?.cells[1][0].content).toBe("\\^");
    expect(parsed?.cells[1][1].content).toBe("|");
    expect(serializeLuoguTable(parsed!.cells)).toContain("\\^");
  });

  it("normalizes Mermaid colors and intrinsic dimensions without recursive replacements", () => {
    const stylesheet = ".marker{fill:#333333;stroke:#333}.node{fill:#ECECFF}";
    const rewritten = rewriteMermaidThemeCss(stylesheet);

    expect(rewritten).toContain("var(--bytemd-mermaid-line-color, #007acc)");
    expect(rewritten).toContain("var(--bytemd-mermaid-text-color, #3b3b3b)");
    expect(rewritten).toContain("var(--bytemd-mermaid-primary-color, #f8f8f8)");
    expect(rewritten).not.toContain("#ECECFF");
    expect(rewritten).not.toContain("#9370DB");
    expect(rewritten).not.toContain(")333)");
    expect(deriveMermaidSvgDimensions("-8 -8 165.4 320", "100%", null)).toEqual({
      width: 165.4,
      height: 320,
      viewBox: "-8 -8 165.4 320",
    });
    expect(deriveMermaidSvgDimensions(null, "450px", "271")).toEqual({
      width: 450,
      height: 271,
      viewBox: "0 0 450 271",
    });
  });

  it("derives stable Mermaid IDs and rejects unsafe SVG", () => {
    expect(createDeterministicMermaidId("graph TD\nA-->B", 0)).toBe(
      createDeterministicMermaidId("graph TD\nA-->B", 0)
    );
    expect(createDeterministicMermaidId("graph TD\nA-->B", 0)).not.toBe(
      createDeterministicMermaidId("graph TD\nA-->B", 1)
    );
    expect(sanitizeMermaidSvg("<svg><script>alert(1)</script></svg>")).toBeNull();
  });
});
