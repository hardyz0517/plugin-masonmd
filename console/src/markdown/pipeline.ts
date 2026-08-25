import gfm from "@bytemd/plugin-gfm";
import gfmLocale from "@bytemd/plugin-gfm/locales/zh_Hans.json";
import highlight from "@bytemd/plugin-highlight";
import math from "@bytemd/plugin-math";
import mathLocale from "@bytemd/plugin-math/locales/zh_Hans.json";
import breaks from "@bytemd/plugin-breaks";
import type { BytemdPlugin } from "bytemd";
import remarkDirective from "remark-directive";
import { mermaidPlugin } from "../plugins/mermaid";
import { pluginSlug } from "../plugins";
import { createMarkdownProcessorOptions, processMarkdown, type MarkdownProcessorRuntime } from "./bytemd-processor";
import { remarkBytemdCode } from "./remark-bytemd-code";
import { remarkBytemdDirective } from "./remark-bytemd-directive";
import { remarkBytemdMath } from "./remark-bytemd-math";
import { remarkBytemdTable } from "./remark-bytemd-table";
import { remarkStripUnsafeHtml } from "./remark-strip-unsafe-html";
import type { MarkdownCompatibilityProfile, MarkdownCompileResult, MarkdownRenderRequest } from "./types";

export function createMathSyntaxPlugin(
  profile: MarkdownCompatibilityProfile
): BytemdPlugin {
  const mathPlugin = math({ locale: mathLocale });
  if (profile === "legacy") {
    return mathPlugin;
  }

  // The Bytemd rehype handler emits complete KaTeX HTML during compilation.
  // ByteMD's viewerEffect is intended for raw math wrappers and would read
  // KaTeX's hidden MathML plus visible HTML back into KaTeX a second time.
  return {
    ...mathPlugin,
    viewerEffect: undefined,
  };
}

export function createMarkdownSyntaxPlugins(
  profile: MarkdownCompatibilityProfile
): BytemdPlugin[] {
  const syntax: BytemdPlugin[] = [
    gfm({ locale: gfmLocale }),
    createMathSyntaxPlugin(profile),
    pluginSlug(),
    mermaidPlugin(),
    { remark: (processor) => processor.use(remarkStripUnsafeHtml) },
  ];

  if (profile === "legacy") {
    syntax.push(highlight(), breaks());
  } else {
    syntax.push({ remark: (processor) => processor.use(remarkDirective) });
    syntax.push({ remark: (processor) => processor.use(remarkBytemdDirective) });
    syntax.push({ remark: (processor) => processor.use(remarkBytemdMath) });
    syntax.push({ remark: (processor) => processor.use(remarkBytemdTable) });
    syntax.push({ remark: (processor) => processor.use(remarkBytemdCode) });
  }

  return syntax;
}

export function createMarkdownRuntime(
  profile: MarkdownCompatibilityProfile
): MarkdownProcessorRuntime {
  return createMarkdownProcessorOptions(profile, createMarkdownSyntaxPlugins(profile));
}

export function compileMarkdown(
  request: MarkdownRenderRequest & { runtime?: MarkdownProcessorRuntime }
): Promise<MarkdownCompileResult> {
  const runtime = request.runtime || createMarkdownRuntime(request.profile);
  const result = processMarkdown(request.raw, runtime);
  const features = new Set<MarkdownCompileResult["features"] extends Set<infer T> ? T : never>();
  features.add("gfm");
  if (/\$[^\n$]+\$|\$\$/.test(request.raw)) features.add("math");
  if (/(?:```|~~~)\s*mermaid(?:\s|$)/i.test(request.raw)) features.add("mermaid");
  if (/^\s*:{2,}/m.test(request.raw)) features.add("directive");
  if (/\|\s*[\^<>]\s*\|/m.test(request.raw)) features.add("table-merge");
  if (/cute-table/.test(request.raw)) features.add("cute-table");
  if (/^\s*(```|~~~)/m.test(request.raw)) features.add("prism-code");
  return Promise.resolve({
    canonicalHtml: result.html,
    renderedHtml: result.html,
    diagnostics: result.diagnostics,
    features,
  });
}

export function createEditorSyntaxPlugins(
  profile: MarkdownCompatibilityProfile,
  editorPlugins: BytemdPlugin[] = []
): BytemdPlugin[] {
  return [...createMarkdownSyntaxPlugins(profile), ...editorPlugins.filter(Boolean)];
}
