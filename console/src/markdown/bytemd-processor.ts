import { getProcessor } from "bytemd";
import type { BytemdPlugin } from "bytemd";
import { collectMarkdownDiagnostics } from "./diagnostics";
import { createMarkdownSanitizeSchema } from "./sanitize-schema";
import { createBytemdRemarkRehypeOptions } from "./remark-rehype-bytemd-handlers";
import type { MarkdownCompatibilityProfile } from "./types";

export interface MarkdownProcessorRuntime {
  plugins: BytemdPlugin[];
  sanitize: NonNullable<Parameters<typeof getProcessor>[0]["sanitize"]>;
  remarkRehype: NonNullable<Parameters<typeof getProcessor>[0]["remarkRehype"]>;
}

export interface ProcessedMarkdown {
  html: string;
  file: { toString: () => string; messages: readonly unknown[] };
  diagnostics: ReturnType<typeof collectMarkdownDiagnostics>;
}

export function processMarkdown(
  raw: string,
  runtime: MarkdownProcessorRuntime
): ProcessedMarkdown {
  const processor = getProcessor({
    plugins: runtime.plugins,
    sanitize: runtime.sanitize,
    remarkRehype: runtime.remarkRehype,
  });
  const file = processor.processSync(raw);
  return { html: file.toString(), file, diagnostics: collectMarkdownDiagnostics(file) };
}

export function createMarkdownProcessorOptions(
  profile: MarkdownCompatibilityProfile,
  plugins: BytemdPlugin[]
): MarkdownProcessorRuntime {
  return {
    plugins,
    sanitize: createMarkdownSanitizeSchema(profile),
    // Keep the rollback profile on ByteMD's native handlers. Bytemd handlers
    // are deliberately enabled only for the compatibility profile.
    remarkRehype: profile === "bytemd-v1" ? createBytemdRemarkRehypeOptions() : {},
  };
}
