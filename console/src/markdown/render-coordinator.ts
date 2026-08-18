import { renderMermaidInHtml } from "../plugins/mermaid";
import { compileMarkdown, createMarkdownRuntime } from "./pipeline";
import type {
  MarkdownCompatibilityProfile,
  MarkdownCompileResult,
  MarkdownTarget,
} from "./types";

const wrapPublishedMarkdown = (html: string) =>
  `<div class="luogu-markdown-body">${html}</div>`;

export function createMarkdownRenderCoordinator(
  profile: MarkdownCompatibilityProfile = "luogu-v1"
) {
  const cache = new Map<string, Promise<MarkdownCompileResult>>();

  const render = (raw: string, target: MarkdownTarget = "editor-preview") => {
    const key = `${profile}:${target}:${raw}`;
    const cached = cache.get(key);
    if (cached) return cached;
    const promise = compileMarkdown({
      raw,
      profile,
      target,
      runtime: createMarkdownRuntime(profile),
    }).then(async (result) => {
      const renderedHtml = await renderMermaidInHtml(result.canonicalHtml);
      return {
        ...result,
        renderedHtml:
          target === "save-html" ? wrapPublishedMarkdown(renderedHtml) : renderedHtml,
      };
    });
    cache.set(key, promise);
    if (cache.size > 6) cache.delete(cache.keys().next().value as string);
    return promise;
  };

  return { render };
}
