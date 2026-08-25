import { readFileSync } from "node:fs";
import { join } from "node:path";
import { compile } from "sass-embedded";
import { Window } from "happy-dom";
import { describe, expect, it } from "vitest";

const stylePath = join(__dirname, "../../styles/bytemd-markdown.scss");
const pluginStyles = compile(stylePath).css;
const editorStyles = compile(join(__dirname, "../../styles/main.scss")).css;
const githubStyles = readFileSync(
  join(__dirname, "../../../node_modules/github-markdown-css/github-markdown-light.css"),
  "utf8",
);

function createDocument(markup: string) {
  const window = new Window();
  window.document.head.innerHTML = `<style>${pluginStyles}</style><style>${githubStyles}</style>`;
  window.document.body.innerHTML = `<div class="markdown-body">${markup}</div>`;
  return window;
}

describe("Cute Table style contract", () => {
  it("keeps a direct Three table intrinsic-width and centered after GitHub CSS", () => {
    const window = createDocument(`
      <table class="bytemd-markdown-table bytemd-cute-table-three">
        <thead><tr><th>Name</th><th>Value</th></tr></thead>
        <tbody><tr><td>Alpha</td><td>1</td></tr></tbody>
      </table>
    `);
    const table = window.document.querySelector("table");
    const header = table?.querySelector("th");

    expect(table).not.toBeNull();
    expect(window.getComputedStyle(table!).display).toBe("table");
    expect(window.getComputedStyle(table!).width).toBe("auto");
    expect(window.getComputedStyle(table!).minWidth).toBe("0");
    expect(window.getComputedStyle(table!).marginLeft).toBe("auto");
    expect(window.getComputedStyle(table!).marginRight).toBe("auto");
    expect(window.getComputedStyle(table!).borderTopWidth).toBe("5px");
    expect(window.getComputedStyle(table!).borderBottomWidth).toBe("5px");
    expect(window.getComputedStyle(header!).backgroundColor).toBe("transparent");
    expect(window.getComputedStyle(header!).borderWidth).toBe("0px");
    expect(window.getComputedStyle(header!).fontWeight).toBe("400");
    expect(window.getComputedStyle(table!.querySelector("thead")!).borderBottomWidth).toBe("3px");
  });

  it("renders Tuack column and row rules from the table semantic class", () => {
    const window = createDocument(`
      <div class="bytemd-table-scroll bytemd-cute-table bytemd-cute-table-tuack">
        <table class="bytemd-markdown-table bytemd-cute-table-tuack">
          <colgroup><col><col class="bytemd-tuack-break"><col></colgroup>
          <thead><tr><th>A</th><th>B</th><th>C</th></tr></thead>
          <tbody>
            <tr><td>1</td><td>2</td><td>3</td></tr>
            <tr><td>4</td><td>5</td><td>6</td></tr>
          </tbody>
        </table>
      </div>
    `);
    const table = window.document.querySelector("table");
    const columns = table?.querySelectorAll("col");
    const firstRow = table?.querySelector("tbody tr");
    const lastRow = table?.querySelector("tbody tr:last-child");

    expect(window.getComputedStyle(columns![1]).borderLeftWidth).toBe("3px");
    expect(window.getComputedStyle(columns![2]).borderLeftWidth).toBe("1px");
    expect(window.getComputedStyle(firstRow!).borderBottomWidth).toBe("1px");
    expect(window.getComputedStyle(lastRow!).borderBottomWidth).toBe("0px");
  });

  it("keeps epigraphs right-aligned and overrides GitHub blockquote defaults", () => {
    const window = createDocument(`
      <blockquote class="bytemd-epigraph">
        <div class="bytemd-epigraph-body"><p>Quote</p></div>
        <cite>-- author</cite>
      </blockquote>
    `);
    const epigraph = window.document.querySelector("blockquote");
    const body = window.document.querySelector(".bytemd-epigraph-body");
    const cite = window.document.querySelector("cite");

    expect(window.getComputedStyle(epigraph!).width).toBe("40%");
    expect(window.getComputedStyle(epigraph!).marginLeft).toBe("60%");
    expect(window.getComputedStyle(epigraph!).borderLeftWidth).toBe("0px");
    expect(window.getComputedStyle(epigraph!).paddingLeft).toBe("0px");
    expect(window.getComputedStyle(body!).textAlign).toBe("left");
    expect(window.getComputedStyle(cite!).borderTopWidth).toBe("1px");
    expect(window.getComputedStyle(cite!).textAlign).toBe("right");
  });

  it("removes list markers from task lists in published and editor previews", () => {
    const publishedWindow = createDocument(`
      <div class="bytemd-markdown-body">
        <ul class="contains-task-list">
          <li class="task-list-item"><input type="checkbox">Done</li>
        </ul>
      </div>
    `);
    const editorWindow = new Window();
    editorWindow.document.head.innerHTML = `<style>${editorStyles}</style><style>${githubStyles}</style>`;
    editorWindow.document.body.innerHTML = `
      <div class="bytemd"><div class="bytemd-preview"><div class="markdown-body">
        <ul class="contains-task-list">
          <li class="task-list-item"><input type="checkbox">Done</li>
        </ul>
      </div></div></div>
    `;

    expect(publishedWindow.getComputedStyle(publishedWindow.document.querySelector("ul")!).listStyle).toBe("none");
    expect(editorWindow.getComputedStyle(editorWindow.document.querySelector("ul")!).listStyle).toBe("none");
    expect(editorWindow.getComputedStyle(editorWindow.document.querySelector("li")!).listStyle).toBe("none");
  });
});
