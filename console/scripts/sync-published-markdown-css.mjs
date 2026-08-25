import { compile } from "sass-embedded";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const consoleDirectory = resolve(scriptDirectory, "..");
const source = resolve(consoleDirectory, "src/styles/bytemd-markdown.scss");
const assetsDirectory = resolve(
  consoleDirectory,
  "../src/main/resources/assets",
);
const bytemdOutput = resolve(assetsDirectory, "bytemd-markdown.css");
const legacyOutput = resolve(assetsDirectory, "luogu-markdown.css");
const copyDataMarker = "__PLUGIN_BYTEMD_COPY_DATA_MARKER__";
const copyButtonMarker = "__PLUGIN_BYTEMD_COPY_BUTTON_MARKER__";

const bytemdCss = compile(source, {
  sourceMap: false,
  style: "expanded",
}).css;

// Historical article snapshots use the former Luogu class namespace. Keep a
// mechanically derived stylesheet so legacy and current renderers share one
// visual and whitespace contract without duplicating Sass maintenance.
const legacyCss = bytemdCss
  .replaceAll("data-plugin-bytemd-code-copy", copyDataMarker)
  .replaceAll("bytemd-code-copy-button", copyButtonMarker)
  .replaceAll("bytemd-", "luogu-")
  .replaceAll(copyDataMarker, "data-plugin-bytemd-code-copy")
  .replaceAll(copyButtonMarker, "bytemd-code-copy-button");

mkdirSync(assetsDirectory, { recursive: true });
writeFileSync(bytemdOutput, bytemdCss, "utf8");
writeFileSync(legacyOutput, legacyCss, "utf8");
