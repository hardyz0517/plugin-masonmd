# Mason Markdown Compatibility Upgrade Implementation Plan

**Status:** Implemented; Halo integration matrix pending manual verification
**Source specification:** docs/mason-markdown-compatibility-spec.md
**Current baseline:** plugin-masonmd 1.10.85, Halo 2.25.0, ByteMD 1.22.x
**Release rule:** preserve existing JARs; do not push or modify theme-hardy as part of this plan

The naming migration is intentionally breaking: `PluginMasonMarkdown` is a new
plugin identity, `/uc/masonmd-editor` is the only UC route, and published
resources/classes use Mason names only. Existing JARs are retained as files, but
old plugin-owned asset paths and semantic namespaces are not maintained. The
ByteMD package/API names listed below remain only where they identify the actual
third-party editor dependency.

## 1. Execution Rules

### 1.1 Non-negotiable constraints

- Do not rewrite the whole editor.
- Keep `/uc/masonmd-editor` stable once this release is installed; do not add the
  removed legacy route back.
- Do not change Halo core or fork Halo source.
- Do not modify theme-hardy.
- Do not delete existing JAR files.
- Do not serialize the whole Markdown document during ordinary save.
- Do not create a second independent Markdown parser for UC save.
- Do not add a new syntax by string replacement over rendered HTML.
- Do not let post-sanitize plugins pass arbitrary user HTML through.
- Do not claim Mason Markdown compatibility until the corresponding fixture passes.
- Do not bump the release version until the final integration gate passes.

### 1.2 Worktree procedure

The repository already contains unrelated dirty changes. Before implementation:

~~~powershell
git status --short
git diff --stat
git branch --show-current
git switch -c codex/mason-markdown-compatibility
~~~

If codex/mason-markdown-compatibility already exists, use git switch codex/mason-markdown-compatibility instead of the create command. Do not reset, clean, or revert existing changes.

At the end of every phase:

~~~powershell
git diff --check
git status --short
~~~

A phase is not complete if it introduces unrelated formatting or generated metadata changes.

### 1.3 Definition of done

A phase is complete only when:

1. Its code and tests are present.
2. Its phase-specific acceptance checks pass.
3. The previous phase's regression checks still pass.
4. The implementation notes and known limitations are updated.
5. The next phase has no unresolved blocking dependency.

## 2. Workstream Map

The implementation is divided into independent workstreams with controlled integration points:

| Workstream | Responsibility | Main output |
|---|---|---|
| W1 | Compatibility fixtures and test harness | Parser, security, round-trip tests |
| W2 | Shared ByteMD processor adapter | One plugin/options/sanitize factory |
| W3 | Directive AST layer | Callouts, align, epigraph, cute-table association |
| W4 | Table source model and renderer | Mason Markdown merge syntax and editor operations |
| W5 | Code and Mermaid renderer | Prism behavior, line metadata, stable SVG |
| W6 | Editor command adapter | Toolbar, shortcuts, source-range edits |
| W7 | Content styling delivery | Editor CSS and published-page CSS |
| W8 | UC persistence and concurrency | Save, autosave, conflict, render snapshots |
| W9 | Release verification | Halo matrix, package, JAR, rollback |

Dependencies:

~~~text
W1 -> W2 -> W3
          -> W4
          -> W5
W2 -> W6
W2 + W5 + W7 + W8 -> W9
W4 -> W6
~~~

W1 and the dependency spike must finish before grammar implementation begins. W2 must finish before W3, W4, W5, or W8 are integrated into the main editor.

## 3. Phase 0: Baseline and Compatibility Spike

**Goal:** prove dependency and runtime assumptions before changing behavior.
**Risk:** medium
**Gate:** blocking

### 3.1 Record the current state

Record:

- plugin version from gradle.properties;
- Halo version from build.gradle;
- ByteMD and plugin versions from console/package.json and pnpm-lock.yaml;
- current frontend build output;
- current Gradle package output;
- current behavior for GFM, math, Mermaid, tables, code blocks, save, and publish.

Commands:

~~~powershell
cd console
pnpm install --frozen-lockfile
pnpm type-check
pnpm build
cd ..
./gradlew test
./gradlew build
~~~

Keep the resulting JAR. Do not delete older artifacts.

Create:

~~~text
docs/compatibility/baseline-1.10.56.md
~~~

The report must record command results, package versions, browser/runtime versions, and known failures. It is not a user-facing manual.

### 3.2 Build the fixture inventory

Create:

~~~text
console/src/markdown/fixtures/
console/src/markdown/__tests__/
~~~

Copy the Markdown examples from the supplied Mason Markdown manual into categorized fixture files. Do not hand-normalize source while copying.

Required fixture groups:

- gfm-basic;
- gfm-tables;
- gfm-task-list;
- gfm-autolink;
- gfm-strikethrough;
- gfm-footnote-extension;
- soft-break;
- math;
- directive-callout;
- directive-nested;
- directive-align;
- directive-epigraph;
- directive-cute-table;
- table-merge;
- table-malformed;
- code-language;
- code-lines;
- mermaid;
- html-sanitize;
- unicode-and-width.

Each fixture has:

~~~text
input.md
expected.json
~~~

expected.json contains:

~~~json
{
  "profile": "legacy",
  "features": [],
  "diagnostics": [],
  "htmlSnapshot": "..."
}
~~~

Do not make the test format depend on the exact whitespace of generated HTML. Use normalized HTML snapshots plus semantic assertions for attributes and structure.

### 3.3 Verify ByteMD API assumptions

Add:

~~~text
console/src/markdown/__tests__/mason-markdown-api-contract.test.ts
~~~

Verify:

- plugin remark hooks execute before remarkRehype;
- remarkRehype handlers can override table and code handlers;
- Editor accepts the same sanitize callback and remarkRehype options as getProcessor;
- VFile messages are available after processing;
- custom schema attributes survive the built-in sanitizer;
- rehype plugins execute after the built-in sanitizer.

The probe must import the installed ByteMD package rather than duplicating its internals.

### 3.4 Dependency compatibility spike

Test exact candidate versions against the locked dependency graph:

- remark-directive;
- PrismJS;
- KaTeX;
- Vitest;
- the selected SVG sanitizer strategy.

Commands:

~~~powershell
cd console
pnpm why bytemd
pnpm why remark-parse
pnpm why remark-rehype
pnpm why rehype-raw
pnpm why rehype-sanitize
pnpm view remark-directive versions --json
pnpm view prismjs versions --json
pnpm view katex versions --json
~~~

Select exact versions after the probe. Only then add the pinned versions, for example:

~~~powershell
pnpm add -D vitest@VERIFIED_VERSION
pnpm add remark-directive@VERIFIED_VERSION prismjs@VERIFIED_VERSION katex@VERIFIED_VERSION
~~~

Replace VERIFIED_VERSION with the version recorded in the baseline report. Do not run an unpinned install for a parser dependency. Do not commit dependency changes from the spike until the compatibility test passes. If a candidate requires an incompatible Unified major:

1. try a compatible pinned version;
2. write a small adapter;
3. stop before upgrading the whole parser stack.

After selecting Vitest, change console/package.json test:unit from the current placeholder command to vitest run and include the corresponding lockfile update as part of Phase 0. No Git commit or push is required by this plan.

### 3.5 Decide blocking behavior from fixtures

Before Phase 1, record concrete decisions for:

- ordinary single-newline behavior;
- invalid directive rendering;
- malformed table fallback;
- unknown code language fallback;
- code line wrapping;
- saved Mermaid output;
- KaTeX CSS delivery on published articles.

Write decisions into fixture expected.json files and the spec's Open Decisions section.

### Phase 0 exit criteria

- baseline report exists;
- fixture inventory exists;
- test runner executes at least one passing test;
- ByteMD API probe passes;
- dependency versions are compatible or a documented blocker exists;
- no production code behavior changed.

**Rollback:** remove only Phase 0 test and dependency spike files and restore package manifests if the spike is abandoned. Never revert unrelated worktree changes.

## 4. Phase 1: Extract the Shared Processor Without Behavior Change

**Goal:** remove processor construction from mason-markdown-editor.vue while preserving current output.
**Risk:** high
**Gate:** required before syntax features

### 4.1 Add processor contracts

Create:

~~~text
console/src/markdown/types.ts
console/src/markdown/profiles.ts
console/src/markdown/diagnostics.ts
console/src/markdown/sanitize-schema.ts
console/src/markdown/mason-markdown-processor.ts
console/src/markdown/pipeline.ts
~~~

Define:

~~~ts
type MarkdownTarget = "editor-preview" | "save-html";

type MarkdownCompatibilityProfile = "legacy" | "mason-v1";

interface MarkdownRenderRequest {
  raw: string;
  profile: MarkdownCompatibilityProfile;
  target: MarkdownTarget;
}

interface MarkdownCompileResult {
  canonicalHtml: string;
  renderedHtml: string;
  diagnostics: MarkdownDiagnostic[];
  features: Set<MarkdownFeature>;
}
~~~

The types must be independent of Vue components and Halo API types.

### 4.2 Separate syntax plugins from editor effects

Move current plugin construction into two factories:

~~~ts
createMarkdownSyntaxPlugins(profile)
createEditorPlugins(settings)
~~~

Syntax plugins include:

- GFM;
- current math;
- current breaks behavior;
- slug;
- Mermaid viewer adapter;
- future Mason Markdown remark and rehype plugins.

Editor plugins include:

- editor context;
- table keymap;
- Vim keymap;
- toolbar actions.

UC save must consume syntax plugins and render options only. It must not depend on Vim, CodeMirror, or toolbar state.

### 4.3 Share sanitize and remarkRehype options

Create:

~~~ts
createMarkdownSanitizeSchema(profile)
createMarkdownRemarkRehypeOptions(profile)
createMarkdownRuntime(profile)
~~~

Pass the same values to:

- ByteMD Editor props;
- manual ByteMD getProcessor calls;
- test helpers.

The only allowed direct getProcessor call after this phase is inside mason-markdown-processor.ts.

### 4.4 Move content rendering behind one coordinator

Create:

~~~text
console/src/markdown/render-coordinator.ts
~~~

Responsibilities:

- compile the exact raw snapshot;
- collect VFile diagnostics;
- run trusted Mermaid enhancement;
- return canonicalHtml and renderedHtml;
- deduplicate equal in-flight requests;
- reject stale results at the caller boundary;
- keep cache state per editor instance.

Do not put autosave or Halo API calls in the coordinator.

### 4.5 Refactor mason-markdown-editor.vue

Remove from mason-markdown-editor.vue:

- direct getProcessor calls;
- plugin array assembly;
- Markdown processor options;
- HTML table generation;
- Mermaid HTML rendering orchestration.

Keep in mason-markdown-editor.vue:

- ByteMD component binding;
- editor context bridge;
- toolbar presentation;
- modal presentation;
- emit update:raw and update:content;
- focus and full-screen behavior.

During this phase, keep existing table and Highlight.js behavior behind adapters if needed. Do not combine extraction with syntax changes.

### 4.6 Refactor UC editor integration

Update use-uc-post-draft.ts or the save composable so that:

- raw is the source snapshot;
- renderMarkdown produces content;
- CONTENT_JSON remains the existing Halo-compatible snapshot;
- save state changes only after the matching request succeeds;
- no parser logic appears in the UC component.

### Phase 1 exit criteria

- current GFM, math, Mermaid, table, attachment, and save snapshots are unchanged;
- Console and UC use the same syntax plugin factory;
- ByteMD Editor and manual compilation receive the same sanitize and remarkRehype options;
- type-check and build pass;
- no direct getProcessor remains outside mason-markdown-processor.ts;
- no UC API call appears in Markdown modules.

**Rollback:** restore mason-markdown-editor.vue wiring and remove only the new processor adapter. Keep fixture tests and baseline report.
+
## 5. Phase 2: Baseline Correctness, Sanitization, and Math

**Goal:** remove known correctness gaps before adding Mason Markdown syntax.
**Risk:** medium

### 5.1 Add direct KaTeX dependency and CSS

- Add direct KaTeX dependency.
- Import KaTeX CSS through the editor style entry.
- Verify inline and block formulas in light and dark editor modes.
- Verify formulas inside tables and blockquotes.
- Add invalid formula fixtures.

Do not rely on the transitive KaTeX package of the ByteMD math plugin.

### 5.2 Implement explicit sanitizer schema

Create a schema builder that documents:

- allowed structural tags;
- allowed safe attributes;
- allowed protocol URLs;
- generated callout attributes;
- intermediate code metadata;
- heading IDs;
- table spans;
- task-list attributes;
- footnote attributes.

Test both raw HTML input and generated compatibility output.

Raw user HTML must not be able to create internal compatibility markers.

### 5.3 Resolve soft-break behavior

Compare baseline output with Mason Markdown fixtures. Select one profile behavior:

~~~text
legacy: current behavior
mason-v1: verified Mason Markdown behavior
~~~

Do not change the default globally until the fixture and existing article comparison pass.

### 5.4 Add VFile diagnostics

Map parser messages to MarkdownDiagnostic:

- stable code;
- severity;
- line;
- column;
- user-readable message.

Unknown or malformed syntax must never throw from the processor.

### Phase 2 exit criteria

- KaTeX editor rendering is complete and tested;
- sanitizer tests pass;
- soft-break behavior is explicit;
- invalid Markdown produces safe HTML plus diagnostics;
- no raw HTML test can execute script or event handlers;
- preview and save outputs remain equal for the baseline profile.

## 6. Phase 3: Directive Layer

**Goal:** implement all Mason Markdown directive semantics through AST handlers.
**Risk:** high
**Gate:** security and nesting gate

### 6.1 Add directive parsing

Add remark-directive at the version proven in Phase 0.

Create:

~~~text
console/src/markdown/remark-mason-directive.ts
console/src/markdown/remark-rehype-mason-handlers.ts
~~~

The remark transformer must:

- accept container and leaf directive nodes;
- validate colon nesting;
- validate names and attributes;
- preserve source positions;
- create typed nodes;
- convert unknown directives to escaped fallback nodes with diagnostics.

### 6.2 Implement callouts

Support:

~~~text
info
success
warning
error
~~~

Rules:

- title is text, never HTML;
- open is a boolean attribute only;
- all callouts use valid details and summary structure;
- nested content is rendered through normal Markdown handlers;
- nested callouts remain accessible;
- no arbitrary class or style from input.

Tests:

- each callout type;
- with and without title;
- with and without open;
- nested callouts with different colon counts;
- malformed closing delimiter;
- unsafe title and attribute values.

### 6.3 Implement align

- accept left, center, right;
- apply only to paragraphs and headings;
- preserve nested inline Markdown and math;
- reject unsupported targets deterministically;
- test nested alignment and invalid values.

### 6.4 Implement epigraph

- parse label as text;
- render body through normal Markdown;
- preserve multiline content;
- escape unsafe labels;
- test nesting behavior according to the manual.

### 6.5 Implement cute-table association

- associate only with the immediately following mdast table;
- allow blank source lines;
- stop association at another block;
- validate three, tuack, and bounded tuack=N;
- report missing table and duplicate directive;
- pass style information into the table handler without changing cell data.

### Phase 3 exit criteria

- every directive fixture passes in preview and save;
- nested directives do not throw or leak HTML;
- sanitizer and security tests pass;
- unknown directives preserve raw source and have deterministic preview fallback;
- no directive code exists in Vue components.

**Rollback:** disable mason-v1 directive plugins while keeping the legacy profile and existing editor.

## 7. Phase 4: Mason Markdown Table Source Model and Rendering

**Goal:** replace HTML merge fallback with source-compatible Mason Markdown Markdown.
**Risk:** very high
**Gate:** source round-trip gate

### 7.1 Build the logical table model

Create:

~~~text
console/src/editor/table-source-model.ts
console/src/editor/table-commands.ts
console/src/markdown/remark-mason-table.ts
~~~

The model must represent:

- source row and column positions;
- header separator and alignments;
- visible and merged cells;
- cell source ranges;
- marker provenance;
- malformed markers;
- row and column spans.

Do not use HTML as the primary model.

### 7.2 Define marker recognition

Recognize only a trimmed, exactly one-character, unescaped source cell:

~~~text
^
<
>
~~~

Use the original VFile source range where mdast text nodes have lost escape information.

Do not recognize:

- code spans containing a marker;
- escaped markers;
- longer strings containing a marker;
- markers in raw HTML tables.

### 7.3 Implement table handler

Override the GFM table handler through remarkRehype options.

The handler must:

1. receive mdast GFM table nodes;
2. preserve inline child nodes through the normal HAST state;
3. build the logical grid;
4. resolve merges using golden Mason Markdown fixtures;
5. generate bounded rowspan and colspan values;
6. fall back to an ordinary table on invalid topology;
7. report diagnostics without deleting source content;
8. pass the result through the normal ByteMD sanitizer.

Do not add a second post-sanitize table parser.

### 7.4 Replace table dialog serialization

Remove:

~~~text
buildTableHtml()
hasMergedTableCells() ? buildTableHtml() : ...
~~~

Replace with:

~~~text
MasonTableModel -> serializeMarkdownTable()
~~~

The dialog must:

- default to 1 row and 1 column;
- insert normal GFM source for unmerged tables;
- insert ^, <, > markers for merged tables;
- preserve inline Markdown in cell content;
- replace only the selected insertion point;
- keep Enter behavior independent from row insertion;
- format the result using one serializer.

### 7.5 Implement source round trips

Test:

~~~text
source -> parse -> model -> serialize -> parse -> render
~~~

Assert:

- merge topology;
- alignment;
- cell content;
- math;
- links;
- inline code;
- malformed fallback;
- no HTML serialization fallback.

### 7.6 Transitional mte-kernel adapter

During migration, mte-kernel may provide cursor movement only. It must not own:

- merge topology;
- source serialization;
- malformed handling;
- final table format.

Remove or reduce the dependency only after the new model passes all browser tests.

### Phase 4 exit criteria

- all Mason Markdown merge examples render correctly;
- irregular merge fixture passes;
- table dialog never emits HTML for supported merges;
- merged cells preserve inline Markdown and math;
- source round-trip tests pass;
- existing plain-table keyboard behavior remains usable.

**Rollback:** keep the new model behind a feature flag and restore normal-table insertion only. Never restore HTML as the published format for a supported Mason Markdown merge.
+
## 8. Phase 5: Prism Code Blocks and Deterministic Mermaid

**Goal:** match Mason Markdown code-block semantics without breaking existing diagrams.
**Risk:** high

### 8.1 Add language registry

Create:

~~~text
console/src/markdown/language-registry.ts
~~~

Synchronously register the initial core:

~~~text
cpp, c, python, java, javascript, markdown, latex
~~~

Define:

- aliases;
- display labels;
- Prism grammar;
- plain and plaintext behavior;
- unknown-language fallback;
- language diagnostics.

Do not dynamically import languages from inside a processor transformer.

### 8.2 Preserve code metadata before sanitizer

Extend the shared remarkRehype handler to copy:

- normalized language;
- raw meta;
- source position if needed.

Use only allowlisted intermediate properties.

### 8.3 Implement code renderer

Create:

~~~text
console/src/markdown/rehype-mason-code.ts
~~~

Implement:

- default C++ when language is absent;
- plain text mode;
- unknown language fallback;
- lines=5-6,11 parser;
- invalid range diagnostics;
- clamped ranges;
- line-number spans;
- line-highlight spans;
- wrapping-compatible CSS;
- safe text escaping.

Ensure Mermaid is excluded before Prism.

### 8.4 Replace Highlight.js preview styling

- remove dependence on hljs classes in Mason Markdown preview styles;
- add Prism token styles for light and dark modes;
- keep CodeMirror source highlighting separate;
- verify indentation and selection colors do not leak into preview code.

### 8.5 Stabilize Mermaid

Refactor plugins/mermaid.ts:

- extract renderMermaidDefinition;
- derive IDs from stable hash plus occurrence index;
- enable Mermaid deterministic IDs where supported;
- validate generated SVG;
- reject unsafe SVG nodes and attributes;
- preserve escaped code block on failure;
- use the same primitive for viewer and save adapters;
- remove direct unsanitized innerHTML assignment.

Add repeated-render tests proving identical raw input produces identical saved HTML.

### Phase 5 exit criteria

- code snapshots match the selected Mason Markdown behavior;
- default C++, plain, unknown, and line metadata tests pass;
- long lines wrap without horizontal overflow or broken line highlights;
- Mermaid repeated renders are stable;
- Mermaid failure is safe;
- no Highlight.js class is required by Mason Markdown preview CSS.

## 9. Phase 6: Editor Commands and UI Boundary Cleanup

**Goal:** make toolbar and keyboard operations source-first and independent of parser internals.
**Risk:** medium-high

### 9.1 Create command layer

Create:

~~~text
console/src/editor/markdown-shortcuts.ts
console/src/editor/editor-context.ts
console/src/editor/mason-markdown-editor-adapter.ts
~~~

Move toolbar operations into typed commands:

- heading;
- horizontal rule;
- bold;
- italic;
- delete;
- math;
- link;
- image;
- quote;
- code;
- table;
- unordered list;
- ordered list;
- task list;
- attachment;
- fullscreen.

Commands must edit source ranges and never inspect preview DOM.

### 9.2 Implement Mason Markdown shortcut matrix

Implement and test:

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

Test on Windows/Linux Ctrl and macOS Command. Test inside and outside tables.

### 9.3 Remove private DOM coupling

Inventory and isolate all selectors such as ByteMD toolbar paths. Replace with:

- public ByteMD actions;
- editor context methods;
- local command registry;
- explicit refs owned by the component.

No new code may query ByteMD internal DOM to perform a source operation.

### 9.4 Keep editor-kernel scope explicit

Implement or document:

- search;
- folding;
- line numbers;
- active-line highlight;
- Alt multi-selection and IME behavior.

Do not migrate CodeMirror 6 in this release unless a tested blocker remains after the current adapter improvements.

### Phase 6 exit criteria

- command tests pass;
- shortcut tests pass on both modifier families;
- selection and focus return correctly after dialogs;
- source edits are independent of preview markup;
- private selector usage is isolated and documented.

## 10. Phase 7: Published Styles and Halo Integration

**Goal:** make custom syntax render correctly on actual article pages without theme changes.
**Risk:** high
**Gate:** packaged-plugin gate

### 10.1 Split editor and content styles

Create:

~~~text
console/src/styles/mason-markdown.scss
src/main/resources/assets/mason-markdown.css
~~~

The content stylesheet must contain only prefixed rules for:

- callouts;
- cute tables;
- merged tables;
- epigraph;
- Prism code;
- code line numbers and line highlights;
- Mermaid;
- KaTeX support if selected.

Do not copy editor layout rules into article CSS.

### 10.2 Refactor TemplateHeadProcessor

Refactor:

~~~text
src/main/java/com/hardyzheng/masonmd/MasonMarkdownHeadProcessor.java
~~~

Replace the large Java text block with a versioned stylesheet reference.

Verify:

- the URL works in a packaged plugin;
- only one link is injected;
- cache busting changes when plugin version changes;
- disabled plugin behavior remains readable;
- CSS does not depend on theme-private DOM selectors.

### 10.3 Verify KaTeX delivery

Use the Phase 0 result:

- if saved content contains complete KaTeX HTML, package matching CSS and fonts;
- otherwise retain plugin-katex as a tested prerequisite and document it;
- never claim standalone published math support without an article-page test.

### 10.4 Theme matrix

Test published pages with:

- light mode;
- dark mode;
- auto mode;
- mobile width;
- an existing theme;
- a theme without ByteMD editor CSS.

### Phase 7 exit criteria

- custom syntax has expected styles on a real Halo article page;
- no theme-hardy changes are required;
- packaged asset URLs work after Gradle build and installation;
- Mermaid, code blocks, callouts, tables, and epigraph are readable with the plugin UI absent.

## 11. Phase 8: UC Save, Autosave, and Conflict Verification

**Goal:** guarantee source, rendered content, and server state stay consistent.
**Risk:** high
**Gate:** data integrity gate

### 11.1 Save controller

Create or refactor:

~~~text
console/src/composables/use-post-save.ts
~~~

It must:

- snapshot raw before compilation;
- assign request IDs;
- await renderMarkdown for that snapshot;
- send standard Halo content payload;
- update last-saved state only on matching success;
- ignore stale responses;
- expose saving, saved, failed, conflict, unauthorized, and forbidden states.

### 11.2 Autosave controller

Keep autosave outside Markdown modules:

- five-minute default;
- no duplicate request for the current saved snapshot;
- no save on page leave if user has unsaved changes unless explicitly requested by existing product behavior;
- no silent source mutation;
- manual save cancels or supersedes an identical pending autosave.

### 11.3 Existing content migration behavior

Verify:

- installing the new plugin does not rewrite existing content;
- opening an existing post preserves raw source;
- saving an existing post intentionally uses the selected profile;
- rollback to legacy does not corrupt raw source;
- new Mason Markdown syntax degrades to literal source on an older plugin.

### 11.4 UC integration matrix

Against Halo 2.25.0:

- unauthenticated route;
- missing uc:posts:manage;
- missing uc:posts:publish;
- new post;
- draft save;
- refresh;
- reopen draft;
- category and tag persistence;
- cover and attachments;
- private/public state;
- publish;
- view article;
- delete;
- conflict;
- network retry;
- login expiry;
- mobile layout.

### Phase 8 exit criteria

- no stale response can overwrite newer source;
- no state-change save accidentally calls publish;
- private state persists correctly;
- source and content are consistent after reload;
- all UC integration tests pass.
+
## 12. Phase 9: Full Verification and Release

**Goal:** produce a releasable and reversible artifact.

### 12.1 Required commands

From console:

~~~powershell
pnpm install --frozen-lockfile
pnpm type-check
pnpm test:unit
pnpm build
~~~

From repository root:

~~~powershell
./gradlew test
./gradlew build
~~~

Inspect:

~~~powershell
Get-ChildItem build/libs
jar tf build/libs/plugin-masonmd-<version>.jar
git diff --check
~~~

Do not delete any older JAR.

### 12.2 Browser and Halo verification

Run:

- parser fixture suite;
- Playwright editor suite;
- light and dark screenshots;
- mobile screenshots;
- Halo UC integration matrix;
- packaged-plugin asset test;
- published article rendering test;
- security test suite.

Save reports under:

~~~text
docs/compatibility/reports/<version>/
~~~

Do not commit screenshots or generated reports unless they are intentionally part of the repository's test artifacts.

### 12.3 Version and artifact policy

Keep the working version unchanged during Phases 0-8. After all gates pass:

1. bump the plugin version according to the spec's minor-release rule;
2. update the lockfile only if dependencies changed;
3. run the complete build again;
4. retain all prior JARs;
5. record the new artifact path and SHA-256;
6. do not git push unless separately requested.

### 12.4 Release acceptance checklist

- `[x]` means verified locally by automated/static checks; `[ ]` means it still
  requires the real Halo browser matrix below.

- [x] all checked-in Mason Markdown compatibility fixtures pass;
- [x] GFM baseline passes;
- [x] source round trips preserve semantics;
- [x] code metadata passes;
- [x] Mermaid output is deterministic and safe;
- [ ] published CSS works without theme modification;
- [x] KaTeX dependency is direct and packaged with matching CSS/fonts;
- [x] Console and UC share one processor configuration;
- [x] save request ordering and autosave controller tests pass;
- [x] security tests pass;
- [x] frontend type-check and build pass;
- [x] Gradle test and package pass;
- [x] old JARs remain;
- [x] no unauthorized push occurred.

## 13. Risk Register

| Risk | Detection | Mitigation | Stop condition |
|---|---|---|---|
| remark-directive incompatible with locked Unified | Phase 0 API probe | pin compatible version or adapter | requires Unified major upgrade |
| custom handler cannot be passed through ByteMD | Phase 0 probe | local processor wrapper review | requires duplicate parser path |
| table merge semantics are misunderstood | Mason Markdown golden fixtures | capture irregular examples first | output topology differs |
| code meta is lost | code handler fixture | copy metadata before sanitizer | cannot preserve meta |
| Prism bundle is too large | build analysis | bounded synchronous core | editor startup regression exceeds budget |
| Mermaid SVG is unstable | repeated render hash test | deterministic IDs and SVG validation | repeated HTML differs |
| published CSS is unavailable | packaged Halo page test | TemplateHeadProcessor asset link | requires theme modification |
| KaTeX needs external plugin | article integration test | package CSS or document hard dependency | math cannot render independently |
| stale save response overwrites source | race test | request IDs and exact snapshots | source/content mismatch |
| old posts change unexpectedly | legacy comparison | no install-time migration | installation rewrites data |

## 14. Working Sequence for Each Feature

Every new Markdown feature must follow the same sequence:

1. Copy or write the Mason Markdown/GFM source fixture.
2. Define expected AST and HTML semantics.
3. Define malformed and security behavior.
4. Implement the pure remark and rehype layer.
5. Add parser and sanitizer tests.
6. Add editor command or dialog serialization if applicable.
7. Add preview visual test.
8. Add UC save and reload test.
9. Add published article test.
10. Update the compatibility matrix.
11. Only then expose the toolbar or mark the feature complete.

No feature is complete when it merely looks correct in the ByteMD preview.

## 15. First Implementation Batch

The first coding batch should contain only:

- Phase 0 fixture and test harness;
- ByteMD API probe;
- dependency compatibility spike;
- baseline report;
- no Mason Markdown syntax implementation;
- no version bump;
- no JAR release.

The first batch is successful only when the project can prove the intended extension points before the high-risk parser work begins.

## 16. Execution Record

The implementation has been carried through the parser, editor, persistence, styling, and packaging phases in this worktree.

Completed:

- shared ByteMD processor/runtime and Mason Markdown compatibility profile;
- GFM, math, Mermaid, directives, merged tables, cute-table styles, Prism code,
  line numbers, and line highlighting;
- sanitizer allowlist and raw-HTML security regression coverage;
- source-producing table dialog and bounded Tuack boundary classes;
- UC save/render snapshot coordination, five-minute autosave, conflict retry,
  publication-state verification, and slug fingerprint correction;
- published-page CSS and packaged KaTeX resources;
- KaTeX AST rendering for saved HTML, restricted generated-style sanitization,
  and table source parsing/merge-resolution round trips;
- invalid formula diagnostics with readable fallback rendering;
- editor context bridge, source-producing shortcuts, table selection commands,
  and request-ordered post-save state handling;
- Vim and table editor plugins now compose instead of replacing one another;
- image dialog upload failures are visible and retryable;
- deletion from a known 404 referrer now returns to the site home;
- Vitest, frontend type-check/build, and Gradle package verification.

Verification completed in the worktree:

~~~text
pnpm type-check       PASS
pnpm test:unit        PASS (45 tests)
pnpm build            PASS
gradlew build -x :console:pnpmInstall  PASS
git diff --check      PASS
JAR SHA-256            1660D9FE317D44E73E683F550A1792FE0E89C99F199E9EF66A681D1C338724EE
~~~

The remaining release gate is the Halo 2.25.0 browser matrix in Section 12.4.
It requires a running authenticated Halo instance and is intentionally left for
manual testing after installing `build/libs/plugin-masonmd-1.10.56.jar`. The
automated checks do not replace verification of login expiry, UC permissions,
category/tag persistence, attachment upload, draft reload, publish, article
navigation, and responsive behavior against a real Halo instance.
