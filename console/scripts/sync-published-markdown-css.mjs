import { compile } from "sass-embedded";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const consoleDirectory = resolve(scriptDirectory, "..");
const source = resolve(consoleDirectory, "src/styles/mason-markdown.scss");
const assetsDirectory = resolve(
  consoleDirectory,
  "../src/main/resources/assets",
);
const masonOutput = resolve(assetsDirectory, "mason-markdown.css");

const masonCss = compile(source, {
  sourceMap: false,
  style: "expanded",
}).css;

mkdirSync(assetsDirectory, { recursive: true });
writeFileSync(masonOutput, masonCss, "utf8");
