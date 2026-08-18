# Compatibility Baseline: 1.10.56

This is the recorded baseline for the Luogu Markdown compatibility upgrade. The
worktree already contained UI and UC editor changes before this upgrade; those
changes are preserved.

## Environment

- Target Halo: `2.25.0`
- Plugin version: `1.10.56`
- ByteMD: `1.22.0`
- Unified parser family: `remark-parse 10`, `remark-rehype 10`, `rehype-raw 6`, `rehype-sanitize 5`
- Node package manager: `pnpm 10.20.0`
- Java toolchain: Gradle Java 21 configuration

## Known baseline behavior

- The editor used ByteMD with GFM, Highlight.js, math, Mermaid, breaks, and
  CodeMirror 5.
- Merged table cells were serialized as generated HTML by the table dialog.
- UC content compilation used a second direct `getProcessor` call in the Vue
  component and could race with a delayed preview update.
- CodeMirror was configured with a `yaml-frontmatter` outer mode even though
  frontmatter was not parsed by the Markdown pipeline.
- There was no parser fixture runner; `test:unit` was a placeholder command.
- Published article styling was injected as a large inline Mermaid style block.

## Compatibility spike decisions

- `remark-directive@2.0.1` is pinned because it supports Unified 10.
- `prismjs@1.29.0` is pinned and the initial synchronous registry contains C,
  C++, Python, Java, JavaScript, Markdown, and LaTeX.
- `katex@0.16.22` is explicit and its CSS/fonts are packaged for published
  pages.
- `vitest@0.34.6` is used for pure Markdown fixtures.
- The `luogu-v1` profile follows GFM soft-break behavior; the `legacy` profile
  keeps the existing hard-break plugin.
- Mermaid source remains Markdown. Its SVG is a deterministic, validated
  enhancement and falls back to the sanitized code block on failure.

## Verification recorded during implementation

- `pnpm type-check`: passed.
- The initial implementation pass recorded 38 tests across the shared processor,
  fixtures, table model, and ByteMD API probe.
- `pnpm build`: passed.
- Gradle packaging and Halo runtime integration remain the manual verification
  step for the locally generated plugin artifact.

## Final local verification after implementation

- `pnpm type-check`: passed.
- `pnpm test:unit`: passed, 45 tests.
- `pnpm build`: passed.
- `gradlew build -x :console:pnpmInstall`: passed.
- The latest artifact is `build/libs/plugin-bytemd-1.10.56.jar`; its SHA-256 is
  `1660D9FE317D44E73E683F550A1792FE0E89C99F199E9EF66A681D1C338724EE`.
- Halo browser and published-article checks remain manual because this worktree
  does not contain a running authenticated Halo instance.

## Final implementation notes

- The `luogu-v1` profile now performs Prism rendering in the controlled
  remark-rehype code handler before sanitization. Raw HTML code blocks are not
  treated as generated Luogu code nodes.
- Invalid table merge topology falls back to the complete rectangular source
  table, preserving every cell and marker as text.
- Luogu save HTML now contains KaTeX markup and the packaged KaTeX stylesheet;
  the editor-only math viewer effect is no longer required for saved content.
- Table source parsing, merge resolution, serialization, and round-trip tests
  share `table-source-model.ts` rather than an HTML fallback path.
- Tuack table boundaries are emitted as semantic cell classes, so arbitrary
  bounded `tuack=N` values do not require a CSS rule for each column.
- Existing posts whose slug is generated during a metadata save are fingerprinted
  from the authoritative server response, avoiding a persistent false dirty
  state.
