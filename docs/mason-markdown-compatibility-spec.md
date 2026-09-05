# Mason Markdown Compatibility Upgrade Specification

**Status:** Implemented; Halo integration matrix pending manual verification
**Scope:** Mason Markdown Console editor and Halo UC post editor
**Current baseline:** plugin-masonmd 1.10.85, Halo 2.25.0, ByteMD 1.22.x
**Reference:** GFM specification and the Mason Markdown editor manual supplied with this task

## 0. Product identity and naming boundary

This release is a deliberate, breaking plugin identity migration. The installed
plugin is `PluginMasonMarkdown`, its settings and configuration use the Mason
Markdown names, and the stable UC route is `/uc/masonmd-editor`. Published
assets and generated semantic HTML use the `mason-*` namespace only. The old
plugin route, asset names, and project-owned CSS namespaces are not compatibility
contracts and are intentionally removed; posts that still contain the old
generated markup must be opened and saved again with Mason Markdown.

The `@bytemd/*` packages, ByteMD public types, and native `.bytemd-*` editor DOM
selectors remain because they are third-party implementation APIs rather than
the plugin's public identity. They must stay isolated in the editor adapter and
must never be emitted as Mason Markdown article markup.

## 1. Decision Summary

Do not replace ByteMD or rewrite the whole editor in this upgrade.

The current ByteMD + Unified/remark/rehype + CodeMirror direction is capable of implementing the required syntax. The main problem is not the parser family. The main problems are:

- Markdown parsing, preview rendering, editor commands, and article persistence are coupled in mason-markdown-editor.vue.
- Mason Markdown-specific syntax is missing from the processor pipeline.
- The table dialog generates HTML for merged tables instead of Mason Markdown-compatible Markdown source.
- Preview highlighting uses Highlight.js while Mason Markdown uses PrismJS semantics.
- There is no compatibility fixture or regression test suite.
- Mermaid and autosave behavior are coupled to editor DOM and render timing.

The target architecture is therefore a compatibility layer extracted around the existing ByteMD host, implemented in small Unified plugins and shared by the Console editor, UC editor, preview, and save pipeline.

CodeMirror 6 migration is explicitly deferred. It is only justified later if editor-level behavior such as search, folding, or multi-cursor cannot be implemented reliably on the current CodeMirror 5 integration.

### 1.1 ByteMD processing constraint

The planned pipeline is a logical responsibility order, not permission to rearrange ByteMD internals.

ByteMD 1.22 currently builds its processor in this order:

~~~text
remarkParse
  -> registered remark plugins
  -> remarkRehype
  -> rehypeRaw
  -> ByteMD's rehypeSanitize
  -> registered rehype plugins
  -> rehypeStringify
~~~

The public plugin API does not provide a hook to insert a rehype plugin before the built-in sanitizer. The implementation must therefore:

- use the public remark and rehype plugin contracts;
- pass the same sanitize-schema factory to the ByteMD Editor and every manual getProcessor call;
- represent user-controlled directive and table data as ordinary AST nodes before sanitization where possible;
- run post-sanitize Mason Markdown rehype plugins only on already sanitized nodes;
- generate only fixed, validated attributes and class names in post-sanitize plugins;
- never use post-sanitize plugins as a way to pass arbitrary user HTML through.

If a feature genuinely requires a pre-sanitize HAST hook, stop and evaluate a local processor wrapper before coding. Do not silently fork ByteMD's internal processor in a second code path.

## 2. Goals

### 2.1 Functional goals

The implementation must:

1. Parse and render the CommonMark and GFM syntax supported by the current product.
2. Support all syntax described in the supplied Mason Markdown editor manual, including:
   - callout directives;
   - nested directives;
   - table cell merging;
   - cute-table styles;
   - paragraph and heading alignment;
   - epigraph blocks;
   - math expressions rendered by KaTeX;
   - Prism-compatible code language and line metadata;
   - Mason Markdown editor shortcuts and table editing behavior where feasible.
3. Produce the same semantic result in the editor preview, saved HTML, and published article.
4. Preserve raw Markdown source in Halo without replacing Mason Markdown syntax with generated HTML.
5. Preserve existing ByteMD features:
   - toolbar actions;
   - math editing;
   - Mermaid;
   - attachment insertion;
   - table insertion;
   - automatic saving;
   - full-screen mode;
   - light and dark themes;
   - Console editor and UC editor integration.
6. Fail safely on malformed or unknown syntax without throwing, losing source content, or producing unsafe HTML.
7. Make future syntax additions possible without adding more feature code to the Vue component.

### 2.2 Non-goals

This upgrade does not:

- fork or modify Halo core;
- reproduce Mason Markdown's private backend or private editor DOM;
- change the theme project;
- replace Halo's UC API;
- permit arbitrary user-defined directives to become arbitrary HTML;
- sacrifice HTML sanitization for visual compatibility;
- rewrite the editor only because Mason Markdown uses CodeMirror 6.

## 3. Compatibility Contract

"Compatible with Mason Markdown" is split into four independently testable contracts.

### 3.1 Source compatibility

The following Mason Markdown source forms must be accepted without converting them to a private syntax:

~~~markdown
:::info[Title]
Body
:::

::cute-table{tuack=3}

| A | B | C |
|---|---|---|
| 1 | 2 | 3 |
| 4 | ^ | < |

~~~cpp lines=5-6,11
int main() {}
~~~
~~~

The raw source saved to Halo must remain semantically equivalent to the source entered by the user. Formatting normalization is allowed only when it does not change syntax meaning.

The renderer must never parse and reserialize the entire document during an ordinary save. Source serialization is allowed only for an explicit editor command such as table merge, and that command must replace the smallest selected source range possible.

### 3.2 Render compatibility

The resulting HTML must have equivalent structure and visual meaning for:

- callout title, body, type, and open state;
- table row and column spans;
- table style;
- alignment;
- epigraph layout;
- code language, line numbers, and highlighted lines;
- inline and block mathematics.

Exact DOM class names used by Mason Markdown are not required. Stable local semantic classes are preferred, provided the rendered result is equivalent and themeable.

### 3.3 Editor compatibility

The editor must provide source-producing commands for all toolbar features. A toolbar operation must insert the same source syntax that a user would write manually.

The preview must never be the source of truth. The source editor remains authoritative.

### 3.4 Persistence compatibility

The UC editor must continue using Halo's standard PostEditor contract:

- raw contains source Markdown;
- content contains the rendered HTML expected by the current Halo API;
- rawType remains markdown;
- contentAnnotations.CONTENT_JSON remains compatible with the current Halo UC PostEditor implementation.

The Markdown compatibility layer must not invent a second article persistence format. Parser diagnostics and internal AST data are not persisted as article content.

## 4. Current Baseline and Technical Debt

The current plugin chain is assembled in:

- console/src/components/mason-markdown-editor.vue

It currently combines GFM, Highlight.js, Mermaid, math, hard-break behavior, attachment actions, editor context state, table dialogs, HTML rendering, autosave, and UC-aware persistence.

The following existing behavior must be isolated during the migration:

1. mason-markdown-editor.vue directly owns too many unrelated responsibilities.
2. Table insertion serializes merged cells as HTML.
3. Mermaid uses a second DOM post-processing path after the main processor.
4. Some toolbar operations depend on ByteMD internal DOM selectors.
5. CodeMirror mode configuration implies Frontmatter support that the Markdown processor does not provide.
6. remark-breaks changes strict GFM soft-break semantics.
7. Highlight.js CSS is coupled to the preview theme.
8. The project has no Markdown parser tests; test:unit currently reports No tests.

No existing behavior may be removed merely because it is not part of GFM. It must either be preserved in the new compatibility profile or explicitly documented as a product decision.

## 5. Target Architecture

### 5.1 Module boundaries

The target source layout is:

~~~text
console/src/markdown/
  types.ts
  diagnostics.ts
  pipeline.ts
  profiles.ts
  mason-markdown-processor.ts
  remark-mason-directive.ts
  remark-mason-table.ts
  remark-rehype-mason-handlers.ts
  rehype-mason-code.ts
  language-registry.ts
  sanitize-schema.ts
  fixtures/

console/src/editor/
  mason-markdown-editor-adapter.ts
  table-source-model.ts
  table-commands.ts
  markdown-shortcuts.ts
  editor-context.ts

console/src/components/
  mason-markdown-editor.vue
  uc-post-editor.vue

console/src/composables/
  use-uc-post-draft.ts
  use-post-save.ts

console/src/styles/
  mason-markdown.scss
  editor-theme.scss

src/main/java/com/hardyzheng/masonmd/
  MasonMarkdownHeadProcessor.java

src/main/resources/assets/
  mason-markdown.css
  katex/
~~~

The Vue components should compose these modules. They should not contain the grammar implementation, table serialization rules, or direct HTML transformation logic.

### 5.2 Shared Markdown pipeline

Create one factory for the product plugin set and one wrapper for compilation:

~~~ts
createMasonEditorPlugins({
  profile: "mason-v1",
});

compileMarkdown({
  raw,
  profile: "mason-v1",
  target: "editor-preview" | "save-html",
});

renderMarkdown(raw, target);
~~~

The plugin factory returns the same BytemdPlugin array for the ByteMD Editor and for the manual processor used by UC save. The compiler wrapper calls ByteMD's public getProcessor with that same array and the same sanitize callback. It must not instantiate a second independent remark/rehype base pipeline.

renderMarkdown is the only public entry point for producing article HTML. compileMarkdown may be used internally for diagnostics and canonical output, but save, preview adapters, and tests must not call getProcessor directly.

The actual ByteMD order is:

~~~text
remarkParse
  -> registered remark plugins:
       remarkGfm
       remarkDirective
       remarkMath
       remarkMasonNormalize
  -> remarkRehype(shared Mason Markdown handlers)
  -> rehypeRaw
  -> ByteMD rehypeSanitize(custom schema)
  -> registered rehype plugins:
       rehypeMasonCode
       rehypeSlug
  -> rehypeStringify
~~~

Important ordering rules:

- Directive syntax must be parsed before conversion to HAST.
- Directive nodes must be converted to fixed HAST structures by shared remarkRehype handlers before sanitization. Do not depend on an internal marker surviving sanitization.
- Table merge markers must be interpreted after GFM table parsing and before sanitization by the custom table handler.
- Code block meta must be interpreted before code highlighting.
- The custom sanitize schema must allow only the fixed attributes generated by the compatibility layer.
- Rehype plugins registered after ByteMD's sanitizer may wrap or decorate sanitized nodes, but must not copy arbitrary raw HTML or unvalidated attributes.
- User input must never be interpolated into raw HTML strings without escaping.
- Mermaid rendering must remain an isolated trusted renderer and must not alter the stored Markdown source.

If ByteMD's public remarkRehype handler option cannot support a required node safely, stop the implementation and review a local processor wrapper. Do not fall back to private HTML markers or global string replacement.

### 5.3 Pipeline result contract

The shared compiler should expose a typed result:

~~~ts
interface MarkdownCompileResult {
  canonicalHtml: string;
  renderedHtml: string;
  diagnostics: MarkdownDiagnostic[];
  features: Set<MarkdownFeature>;
}

interface MarkdownDiagnostic {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  line?: number;
  column?: number;
}
~~~

canonicalHtml is the sanitized Unified output before trusted Mermaid enhancement. renderedHtml is the target output after the same deterministic enhancement step used by the save path. The editor may display diagnostics later, but diagnostics must not be mixed into article content or save payloads.

Plugins report diagnostics through the current VFile or an invocation-local collector. They must not write to module-level arrays because concurrent preview and save compilations would mix results across documents.

The ByteMD preview and UC save must use the same plugin factory, remarkRehype options, sanitize schema, and compatibility profile. ByteMD's viewerEffect is only a DOM adapter for the shared Mermaid rendering primitive; the save path may use a string/DOM adapter for the same primitive, but must not independently reimplement Mermaid or code-block post-processing.

The code-block output is fully produced by the shared Unified pipeline. Mermaid is the only separate trusted enhancement because it requires a browser/runtime renderer. Its source remains a language-mermaid code block until that enhancement step.

### 5.4 Compatibility profiles

Use an explicit profile instead of silently changing global behavior:

~~~ts
type MarkdownCompatibilityProfile = "legacy" | "mason-v1";
~~~

Rules:

- legacy preserves current behavior for rollback and comparison.
- mason-v1 is the new target behavior.
- New syntax is enabled only in mason-v1.
- The active profile is selected centrally, not independently by the Console editor and UC editor.
- The profile must be covered by fixture tests.
- The profile is a deployment/runtime configuration, not a per-post annotation. Do not add renderer-version metadata to Halo posts without a separate migration design.

After the new pipeline has passed production validation, mason-v1 becomes the default. Existing articles are not rewritten merely by installing the plugin; they are re-rendered only when saved or explicitly migrated.

### 5.5 Dependency and runtime policy

Before adding parser packages, run a compatibility spike against the exact Unified versions bundled by ByteMD 1.22. Do not upgrade Unified, remark-rehype, rehype-raw, or rehype-sanitize transitively as part of a syntax feature.

Direct dependencies must be declared when their runtime or CSS is part of the contract:

- remark-directive for directive parsing;
- KaTeX for runtime and CSS;
- PrismJS or an AST-compatible Prism adapter for preview highlighting;
- the chosen test runner.

The lockfile must be reviewed for ESM/CJS, browser bundle, and license compatibility. A package that requires a newer Unified major must be pinned to a compatible version or isolated behind an adapter. Do not solve an incompatibility by duplicating the whole Markdown processor.

Prism languages are registered through language-registry.ts. Because ByteMD's preview processor is synchronous, the core supported set must be synchronously available before processing: C++, C, Python, Java, JavaScript, Markdown, and LaTeX. Optional languages may be preloaded asynchronously before processor invocation, but no remark or rehype transformer may perform a dynamic import. A completed optional preload must trigger a version-guarded rerender.

### 5.6 Render scheduling and cache

The current editor can parse the same raw value once for ByteMD preview and again for the content v-model. The upgrade must not add more uncoordinated render loops.

Rules:

- renderMarkdown deduplicates concurrent requests for the same raw snapshot, profile, and renderer version;
- the cache is editor-instance scoped and bounded to the latest few snapshots;
- save always awaits the render result for its exact raw snapshot;
- stale preview results never update content or diagnostics;
- a rejected Mermaid enhancement falls back to canonicalHtml and is not cached as a successful enhanced result;
- parser plugins contain no mutable document state at module scope;
- theme changes update CSS tokens and Mermaid presentation without recompiling ordinary Markdown.

Phase 0 must record render time and memory for a representative large Chinese Markdown article. Each phase must remain within the agreed regression budget, and the final Playwright suite must include rapid typing followed immediately by manual save.

## 6. Syntax Requirements

### 6.1 CommonMark and GFM

The following must remain supported:

- headings;
- paragraphs;
- emphasis and strong emphasis;
- links and images;
- blockquotes;
- ordered and unordered lists;
- nested lists;
- fenced and indented code blocks;
- thematic breaks;
- escapes and entities;
- autolink literals;
- strikethrough;
- tables and column alignment;
- task lists;
- footnotes if provided by the installed remark-gfm version.

Each feature requires at least one positive fixture and one interaction fixture, such as a link inside a table cell or emphasis inside a list item.

### 6.2 Soft line breaks

The current remark-breaks behavior must not remain implicit.

Before implementation, compare the following against Mason Markdown:

~~~markdown
line one
line two
~~~

The result must be recorded in the mason-v1 fixture. If Mason Markdown uses hard breaks, retain remark-breaks in that profile. If Mason Markdown follows soft-break behavior, remove it from mason-v1 and keep it only in legacy if existing articles depend on it.

### 6.3 Math

Required behavior:

- inline math using the supported delimiters;
- block math using the supported delimiters;
- math inside table cells;
- math inside directives;
- escaped delimiters;
- invalid expressions that do not break the entire document.

The KaTeX runtime and CSS must be explicit dependencies of the editor bundle. The parser must preserve invalid math as source and report a diagnostic rather than silently dropping it.

KaTeX must be imported directly by the project rather than relying on the transitive dependency of the ByteMD math plugin. This makes the CSS and runtime version part of the lockable compatibility contract.

### 6.4 Directive grammar

Add remark-directive and a whitelist-based transformer.

The transformer creates typed mdast directive nodes or equivalent controlled nodes. The shared remarkRehype handlers convert those nodes, GFM tables, and code nodes to fixed HAST structures before ByteMD's sanitizer. Labels, attributes, table spans, code metadata, and child content remain validated AST values; they are never concatenated into an HTML string.

ByteMD exposes remarkRehype options on both Editor and getProcessor. The handler map and its options must come from one factory and be passed to both paths. A post-sanitize rehype plugin must not be used to discover or unwrap user-controlled directive markers.

Supported forms:

~~~markdown
:::name[label]{attributes}
Content
:::

::name[label]{attributes}
~~~

Rules:

- container directives require at least three colons;
- leaf directives require exactly two colons and a standalone line;
- nested containers must have more opening colons than their children;
- directive names are case-sensitive and must be whitelisted;
- unknown directives leave raw source untouched, render through a deterministic escaped fallback, and generate a warning;
- arbitrary HTML tags cannot be selected through directive attributes;
- user-provided labels and attributes are text values, not HTML fragments.

The fallback renderer must use the node's source position and the original VFile value when it needs to show literal directive syntax. It must not attempt to reconstruct unknown syntax from a partially normalized AST.

#### Callouts

Support:

~~~text
info
success
warning
error
~~~

The label becomes the callout title. The {open} attribute controls the default expanded state. A collapsible callout must use valid details/summary semantics:

~~~html
<details class="mason-callout mason-callout-info" open>
  <summary>Title</summary>
  <div class="mason-callout-body">...</div>
</details>
~~~

All four callout types use the same details/summary structure. The open attribute is emitted only for {open}; absence means the callout starts collapsed. The exact wrapper may change only if a Mason Markdown fixture proves different behavior, and any replacement must preserve keyboard operation, open state, and nesting.

#### Alignment

Support left, center, and right alignment for paragraphs and headings only:

~~~markdown
:::align{center}
Centered paragraph.
:::
~~~

Alignment must not be applied to code blocks, tables, or list containers unless Mason Markdown's actual behavior confirms it.

#### Epigraph

Support:

~~~markdown
:::epigraph[-- author]
Text
:::
~~~

The author label must be escaped and rendered as text.

#### Cute tables

Support:

~~~markdown
::cute-table{three}
::cute-table{tuack}
::cute-table{tuack=3}
~~~

The directive changes table presentation only. It must not alter the underlying table cell contents or merge semantics.

Association rules:

- a cute-table leaf directive applies only to the immediately following mdast table sibling;
- blank source lines do not break association, but any intervening non-table block does;
- a directive without a following table renders through the directive fallback and reports a warning;
- three and tuack are the only accepted styles;
- tuack=N accepts one bounded positive column index according to Mason Markdown fixtures;
- duplicate style directives are invalid and use deterministic fallback behavior.

### 6.5 Mason Markdown table merge semantics

Normal GFM tables remain valid. A cell is treated as a merge marker only when its normalized content is exactly one of:

~~~text
^
<
>
~~~

The same characters inside code spans, escaped text, or longer text are ordinary content. Because mdast text values can erase the distinction between an escaped marker and a literal marker, marker detection must use the cell's source position and original VFile slice in addition to child node types. A plain trimmed source cell of exactly one unescaped marker is required.

Required algorithm:

1. Parse the full table into a rectangular logical grid.
2. Validate marker positions and resolve each marker to a source cell.
3. Compute row spans and column spans without overlapping occupied regions.
4. Convert the logical grid to HAST table cells.
5. Preserve a diagnostic for malformed markers.
6. Fall back to an ordinary table when a merge cannot be resolved safely.

Malformed input must never throw or silently delete cells. The fallback behavior must be deterministic and tested.

The custom table handler must delegate each cell's inline children to the normal mdast-to-HAST state. It must not escape the entire cell as a string, because that would disable links, emphasis, math, and inline code inside merged cells.

The table insertion dialog must serialize source Markdown using the same model. Merged tables must never be emitted as HTML as the normal path.

The marker direction and malformed-input behavior must be defined by golden fixtures copied from the Mason Markdown manual. The implementation must not infer new meanings for < or > from variable names alone. The manual's irregular example is a required fixture because it exercises adjacent horizontal and vertical merges.

Table transformation must preserve source provenance by construction. The shared remarkRehype table handler receives only mdast table nodes produced by GFM, converts them to HAST, and applies the merge model before sanitization. Raw HTML tables never enter this handler and must not be transformed merely because their text contains ^, <, or >.

### 6.6 Code blocks

The mdast code node's lang and meta are not guaranteed to survive ByteMD's default code handler. The shared remarkRehype handler must explicitly copy validated source metadata to allowlisted intermediate properties before sanitization. rehypeMasonCode then consumes those properties after sanitization and removes or normalizes them in the final output.

Required rules:

- an explicit language is passed to PrismJS;
- an absent language defaults to C++ for Mason Markdown compatibility;
- plain and plaintext disable token highlighting;
- unknown languages fall back to plain text and produce a warning;
- lines=5-6,11 parses into line ranges;
- line numbers and line-row markup are emitted only when a valid lines= range is present;
- invalid ranges are ignored safely and produce a warning;
- line ranges are clamped to the actual number of lines;
- code content is escaped before token output;
- code block rendering supports wrapping without corrupting line highlighting.

The intermediate language and meta properties are implementation details, not a second source format. They must be generated only by the shared code handler, validated before use, and covered by sanitizer tests.

For an ordinary fenced block, the output keeps a regular highlighted code body
without a line-number gutter. A block with valid line metadata uses the numbered
row structure:

~~~html
<pre class="mason-code-block" data-language="cpp">
  <code>
    <span class="mason-code-line" data-line="5" data-highlighted="true">...</span>
  </code>
</pre>
~~~

The exact DOM is internal. CSS must not depend on Highlight.js classes after the Prism migration.

Mermaid is recognized before ordinary code highlighting and remains a separate renderer.

Prism language support must be explicit. Add a language-registry module with aliases, a synchronously registered core set, and a bounded supported-language list. Do not import every Prism language into the initial editor bundle. The registry must define the fallback for an absent, plain, plaintext, and unknown language. Optional asynchronous preloading occurs outside the processor and is not part of the first compatibility release.

### 6.7 Mermaid extension

Mermaid is an existing product extension, not GFM or Mason Markdown syntax, but it must remain compatible throughout the migration.

Requirements:

- language-mermaid code blocks bypass Prism token rendering;
- Mermaid remains configured with securityLevel strict;
- renderer IDs are deterministic for the same document, diagram source, and occurrence index;
- enable Mermaid deterministic ID settings where supported and use a stable seed;
- the same raw Markdown must produce stable saved HTML across repeated renders;
- generated SVG is parsed and validated through a dedicated SVG allowlist before insertion;
- event handlers, scripts, external executable references, and unsafe foreignObject content are rejected;
- preview and save adapters call the same renderMermaidDefinition primitive;
- a render or validation failure preserves the original escaped Mermaid code block.

Do not write an unsanitized Mermaid SVG string directly to innerHTML. The implementation may insert a validated SVG node or serialize a validated document fragment.

### 6.8 Frontmatter boundary

Frontmatter is not part of the GFM or Mason Markdown syntax contract. The current yaml-frontmatter CodeMirror mode must not be presented as proof that frontmatter is supported.

The first compatibility release must choose one of two explicit behaviors:

- remove the frontmatter-only editor mode and treat it as ordinary Markdown text; or
- add remark-frontmatter, define the Halo persistence semantics, and add preview/save fixtures.

The recommended choice for this upgrade is the first one. Do not add a parser plugin merely because the editor mode already has the word frontmatter in its name.

### 6.9 Raw HTML and sanitization

GFM raw HTML support and Halo security requirements are not identical. The product must use an explicit allowlist:

- allow safe structural tags;
- allow only approved attributes;
- remove event handlers, scripts, unsafe URLs, and unsafe styles;
- allow generated callout, table, and code classes;
- allow generated IDs from rehype-slug;
- never trust class, style, or data-* values from arbitrary user HTML without validation.

Maintain separate input and generated-HTML allowlists. The input sanitizer schema may allow only the intermediate properties required by the shared handlers, such as open, data-mason-language, and data-mason-meta. rowspan and colspan are generated by the trusted GFM table handler before sanitization and must be bounded integers. Post-sanitize output properties such as data-language, data-line, and data-highlighted must be created only by validated Mason Markdown plugins and should not be added to the raw HTML input allowlist unless there is a documented compatibility reason. Generated values must come only from validated enums, booleans, and bounded integers.

Security fixtures must include script tags, event handlers, javascript URLs, malformed SVG, and unsafe CSS.

## 7. Editor Integration

### 7.1 ByteMD adapter

ByteMD remains the editor host. The adapter is responsible only for:

- connecting ByteMD's raw/content model to the host;
- installing editor-side plugins;
- exposing the editor context to toolbar commands;
- forwarding the shared processor to preview;
- cleanup when the editor is destroyed.

The adapter must not contain directive parsing, HTML serialization, UC API calls, or article metadata logic.

New code must not use ByteMD private DOM selectors to implement core behavior. Existing selectors must be isolated behind one adapter and removed where the public plugin API can replace them.

### 7.2 Toolbar commands

Every toolbar command must declare:

~~~ts
interface MarkdownCommand {
  id: string;
  execute(context: EditorCommandContext): void;
  isEnabled(context: EditorCommandContext): boolean;
}
~~~

Commands operate on raw source, not preview DOM. This prevents toolbar behavior from diverging from manually entered syntax.

Required command groups:

- heading level;
- bold, italic, strikethrough;
- link and image;
- quote;
- code block;
- math;
- table;
- task list;
- ordered and unordered lists;
- horizontal rule;
- attachment insertion;
- fullscreen and view mode.

Shortcut definitions live in one markdown-shortcuts.ts module. Conflicts with browser shortcuts and table navigation must be explicit.

The Mason Markdown compatibility profile must cover this exact shortcut matrix, using Mod as Command on macOS and Ctrl elsewhere:

~~~text
Mod+Shift+Up/Down       heading level up/down
Mod+Shift+H             horizontal rule
Mod+B / Mod+I / Mod+D   bold / italic / delete
Mod+M                   math
Mod+Shift+L             link
Mod+Shift+I             image
Mod+Shift+Q             blockquote
Mod+Shift+1             code block
Mod+Shift+2             table
Mod+Shift+7/8/9         unordered / ordered / task list
~~~

Each shortcut must be tested inside and outside a table. A command that opens a dialog must preserve the current selection and return focus to the editor after completion.

### 7.3 Table editor model

Introduce a MasonTableModel that understands both ordinary GFM tables and merge markers.

The model must support:

- parse source table;
- preserve alignment;
- insert/delete row;
- insert/delete column;
- navigate visible cells;
- select and merge cells;
- split merged cells;
- serialize back to Mason Markdown Markdown;
- report malformed input.

The current mte-kernel implementation may be retained temporarily behind an adapter for keyboard behavior, but it must not parse and serialize a competing table model. During the migration, one source model must be selected per document and all table commands must go through it. The steady-state implementation must not have one algorithm for plain tables and another for merged tables.

The adapter may delegate low-level cursor movement to mte-kernel, but serialization, merge topology, malformed-input handling, and source round trips belong exclusively to MasonTableModel.

### 7.4 Editor highlighting

Source editor highlighting and preview highlighting are separate concerns.

CodeMirror source highlighting should provide:

- Markdown structure highlighting;
- math delimiter and math body highlighting;
- neutral formatting markers;
- no artificial blue selection or indentation backgrounds;
- correct line numbers and active line behavior.

PrismJS applies only to rendered preview code blocks. Preview CSS must not be used to correct CodeMirror token colors.

### 7.5 Editor-kernel parity boundary

Syntax compatibility and CodeMirror implementation parity are separate release dimensions. The Mason Markdown manual also describes Ctrl+F search, code folding, and Alt-based multi-selection. These must be tracked explicitly:

- search and folding are editor usability requirements and should be implemented with the current CodeMirror adapter where possible;
- multi-selection is a separate capability and must not be claimed as Mason Markdown parity until Chinese input and IME behavior are tested;
- migrating to CodeMirror 6 requires its own spike and acceptance matrix;
- failure to implement a CodeMirror 6-specific behavior must not block the Markdown parser and persistence upgrade, but must be recorded as an editor compatibility gap.

## 8. UC and Console Persistence

### 8.1 Save flow

The host component prepares the standard Halo payload from the shared render coordinator:

~~~text
raw = current Markdown source
content = await renderMarkdown(raw, "save-html").renderedHtml
rawType = markdown
~~~

The UC API method signatures and CONTENT_JSON annotation structure remain those of the Halo 2.25.0 UC PostEditor implementation. No syntax-specific data is added to annotations.

The save path must not call a second renderer for Mermaid, Prism, or table output. The canonical render coordinator owns those steps. If Halo's published article renderer changes the final HTML again, that boundary must be tested as an integration contract rather than assumed to be identical to editor preview HTML.

### 8.2 Concurrency rules

The save controller must:

- assign a monotonically increasing request ID;
- compile the exact raw snapshot associated with that request;
- ignore stale compile or network responses;
- update the last-saved snapshot only after the matching request succeeds;
- distinguish manual save from autosave;
- never mark a newer local edit as saved because an older request returned later;
- surface conflict, authentication, permission, and network errors separately.

The preview renderer uses the same stale-result protection. A slow Mermaid render must not replace a newer preview. The coordinator must keep the canonical sanitized HTML and trusted Mermaid-enhanced HTML as separate values so that a failed Mermaid render can fall back to the safe code block without losing the document.

### 8.3 Autosave

Autosave remains host behavior, not Markdown parser behavior. It must receive a source snapshot and rendered HTML from the shared pipeline, but must not own parser decisions.

The existing five-minute interval remains the product default. A manual save must not start a second autosave request for the same snapshot.

## 9. Styling and Visual Contract

Semantic Markdown styles belong in mason-markdown.scss, scoped to the editor preview and reusable article preview container.

The style layer must provide:

- light and dark tokens;
- callout colors and icons without excessive saturation;
- Mason Markdown-like table styles;
- three-line and Tuack table variants;
- code background, token colors, wrapping, line numbers, and line highlights;
- epigraph alignment;
- accessible focus and hover states;
- mobile overflow behavior.

Visual styles must not be implemented by changing source token colors or by painting an entire CodeMirror line as a selection.

All generated classes must use the stable Mason Markdown-owned `mason-*` prefix. No project-owned `bytemd-*` or `luogu-*` compatibility namespace is emitted or shipped. Avoid generic global selectors such as `.table`, `.code`, or `.active`.

### 9.1 Published article style delivery

Editor SCSS is not automatically available on a theme-rendered article page. The plugin must deliver the custom syntax stylesheet through Halo's supported TemplateHeadProcessor mechanism.

The current MasonMarkdownHeadProcessor must not contain a large Mermaid CSS text block inside Java. It must use versioned links to packaged static stylesheets. The stylesheets must contain only prefixed Mason Markdown syntax, Mermaid, code-block, and KaTeX-support styles required by content generated by this plugin.

Requirements:

- no theme template or theme JavaScript modification;
- no unscoped reset of headings, tables, pre, code, or details;
- stable plugin asset URL with a plugin-version cache key;
- one stylesheet reference per page;
- editor and published-page styles generated from the same token/source file where practical;
- a missing or disabled plugin must degrade custom content to readable HTML instead of hiding it.

KaTeX has two distinct requirements:

- the editor preview must import a direct, locked KaTeX runtime and CSS;
- the published page must either receive the matching CSS/fonts from this plugin or declare plugin-katex as a tested hard dependency.

Phase 0 must verify whether the saved content already contains complete KaTeX HTML. If it does, this plugin should package the matching CSS/fonts and avoid requiring a second renderer. If it does not, retain plugin-katex as an explicit runtime dependency and do not claim standalone math rendering.

## 10. Test Strategy

### 10.1 Parser fixture tests

Use Vitest for pure processor tests. Add an explicit test:unit script that runs vitest run and keep parser fixtures independent from Vue and browser globals.

Every fixture should include:

- input Markdown;
- expected normalized features;
- expected HTML snapshot;
- expected diagnostics;
- expected fallback behavior when malformed.

Fixture groups:

1. CommonMark basics.
2. GFM autolinks, tables, tasks, strikethrough, and footnotes.
3. Soft-break behavior.
4. Inline and block math.
5. Callouts and nested directives.
6. Alignment and epigraph.
7. Cute tables.
8. Ordinary and merged tables.
9. Malformed and irregular tables.
10. Code language, default C++, plain text, and line ranges.
11. Mermaid placeholders and render failures.
12. Raw HTML and sanitization.
13. Chinese, emoji, long lines, and mixed-width table cells.

### 10.2 Source round-trip tests

The following must be tested:

~~~text
source -> parse -> editor model -> serialize
~~~

The result need not preserve whitespace byte-for-byte, but it must preserve:

- table merge topology;
- alignment;
- directive attributes;
- code language and line metadata;
- math delimiters;
- link and image destinations.

### 10.3 Editor tests

Use Playwright for:

- toolbar insertion;
- table merge and split;
- keyboard navigation;
- math and code dialogs;
- full-screen enter and exit;
- source and preview synchronization;
- light and dark mode;
- mobile layout;
- line wrapping and code line highlighting.

### 10.4 UC integration tests

Against Halo 2.25.0, verify:

- new article;
- reload after save;
- reopen draft;
- category and tag persistence;
- attachment upload;
- private and public state;
- conflict handling;
- publish and article URL;
- delete and return navigation;
- login expiry and permission errors.

### 10.5 Security tests

Verify that malicious raw HTML cannot produce:

- script execution;
- event handler execution;
- javascript URL navigation;
- unsafe SVG execution;
- CSS exfiltration or layout-breaking styles.

## 11. Migration Plan

### Phase 0: Freeze and baseline

- Create a feature branch.
- Record current plugin version and current rendered outputs.
- Copy the Mason Markdown manual examples into fixtures.
- Run a dependency compatibility spike for remark-directive and the selected Prism adapter against ByteMD's locked Unified versions.
- Verify the packaged plugin asset URL and TemplateHeadProcessor stylesheet injection in a Halo 2.25.0 article page.
- Verify whether saved math content contains complete KaTeX HTML or still depends on plugin-katex processing.
- Add a legacy profile that reproduces current behavior.
- Do not change the public editor route.

Exit criteria: current common Markdown, math, Mermaid, tables, and UC save behavior have regression coverage; dependency compatibility is proven without a Unified major upgrade.

### Phase 1: Extract without behavior change

- Add markdown/types.ts, pipeline.ts, and profile definitions.
- Move processor construction out of mason-markdown-editor.vue.
- Keep existing plugins and Highlight.js temporarily.
- Make Console and UC editors consume the same factory.
- Pass the same sanitize callback and plugin array to ByteMD preview and manual UC compilation.

Exit criteria: type-check, build, and existing UI tests pass with identical output snapshots; preview and UC compilation are demonstrably using the same factory.

### Phase 2: Baseline correctness

- Add direct KaTeX CSS dependency/import.
- Decide soft-break semantics from Mason Markdown fixtures.
- Add explicit sanitizer schema.
- Add compile diagnostics and stale-result protection.

Exit criteria: no known regressions in math, raw HTML safety, or preview/save consistency.

### Phase 3: Directive layer

- Add remark-directive.
- Implement whitelisted callouts, alignment, epigraph, and cute-table wrappers.
- Add scoped semantic CSS.

Exit criteria: all manual directive examples render correctly, including nesting and {open}.

### Phase 4: Table source model

- Implement Mason Markdown marker parsing and HAST transformation.
- Replace HTML fallback in the table dialog.
- Add merge/split/source round-trip tests.
- Keep existing plain-table behavior behind the model adapter during migration.

Exit criteria: merged table Markdown survives save, reload, edit, and publish without topology changes.

### Phase 5: Code block layer

- Add PrismJS-compatible rendering.
- Implement language fallback and lines= metadata.
- Replace Highlight.js-only preview CSS.
- Keep CodeMirror source highlighting independent.

Exit criteria: code snapshots match the defined Mason Markdown behavior for all supported languages and metadata cases.

### Phase 6: Editor command cleanup

- Move toolbar commands and shortcuts to dedicated modules.
- Remove new dependencies on ByteMD private DOM selectors.
- Add command enablement and keyboard tests.
- Re-evaluate the remaining mte-kernel dependency.

Exit criteria: toolbar and shortcut operations serialize the same syntax as manual editing.

### Phase 7: Release and cleanup

- Run type-check, frontend build, Gradle test, and Gradle packaging.
- Run the Halo UC integration matrix.
- Compare legacy and mason-v1 output for existing articles.
- Make mason-v1 the default only after validation.
- Keep prior JAR artifacts; do not delete them.

## 12. Rollback and Compatibility Policy

Rollback requirements:

- The raw source must remain usable by the previous plugin version where it used only legacy syntax.
- New Mason Markdown syntax may render as literal text under an older plugin, but must never corrupt raw source.
- Existing saved HTML is not rewritten on plugin installation.
- A failed migration must be recoverable by switching the profile to legacy and reinstalling the previous JAR.
- Do not use a destructive database migration for Markdown content.

The first release containing the compatibility layer should use a minor version increment after implementation is complete. Version changes are not part of this spec's coding phase.

## 13. Acceptance Criteria

The upgrade is complete only when all of the following are true:

1. Every syntax example from the supplied Mason Markdown manual has a fixture and passes.
2. GFM baseline tests pass without undocumented behavior changes.
3. Directive, table merge, and code metadata syntax survive save and reload.
4. ByteMD preview and saved HTML use the same plugin factory, sanitize schema, and render coordinator.
5. The table dialog never emits HTML for a supported Mason Markdown merge operation.
6. Invalid syntax produces a safe fallback and a diagnostic.
7. Raw HTML remains sanitized.
8. Post-sanitize Mason Markdown plugins cannot inject arbitrary raw HTML or unvalidated attributes.
9. Math, Mermaid, attachments, autosave, full-screen, and existing editor routes still work.
10. UC and Console use the same Markdown compatibility profile.
11. Type-check, frontend build, Gradle packaging, parser tests, browser tests, and Halo integration tests pass.
12. Published article pages receive the versioned plugin stylesheet and render custom syntax without a theme change.
13. No theme-hardy change, Halo core fork, or /console/posts/editor route replacement is required.

## 14. Open Decisions Before Coding

The following must be settled using Mason Markdown behavior fixtures rather than assumptions:

- whether a single source newline is a hard break;
- exact unsupported-language fallback behavior;
- exact code line-number presentation on wrapped lines;
- exact malformed table fallback;
- whether saved content should contain Mermaid SVG or a stable Mermaid placeholder for the current Halo renderer;
- which subset of raw HTML Mason Markdown accepts while Halo security still permits it.

These decisions should be recorded in tests before implementation starts. Once they are fixtures, they become compatibility guarantees instead of undocumented behavior.
