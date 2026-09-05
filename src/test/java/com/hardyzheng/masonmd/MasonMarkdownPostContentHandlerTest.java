package com.hardyzheng.masonmd;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;
import run.halo.app.theme.ReactivePostContentHandler.PostContentContext;

class MasonMarkdownPostContentHandlerTest {

    private final MasonMarkdownPostContentHandler handler = new MasonMarkdownPostContentHandler();

    @Test
    void migratesOnlyCompleteRenderedMathWrappers() {
        String oldContent = """
            <p><span class="math math-inline"><span class="katex"><span class="katex-mathml">x</span><span class="katex-html">x</span></span></span></p>
            <div class="math math-display"><span class="katex-display"><span class="katex">y</span></span></div>
            """;

        String migrated = MasonMarkdownPostContentHandler.migrateRenderedMathClasses(oldContent);

        assertTrue(migrated.contains("class=\"mason-math mason-math-inline\""));
        assertTrue(migrated.contains("class=\"mason-math mason-math-display\""));
        assertTrue(!migrated.contains("class=\"math math-inline\""));
        assertTrue(!migrated.contains("class=\"math math-display\""));
    }

    @Test
    void isolatesMasonMarkdownCodeBeforeShikiCanWrapIt() {
        String oldContent = """
            <div class="mason-markdown-body">
              <pre class="mason-code-block language-cpp" data-language="cpp"><code class="language-cpp"><span class="mason-code-line is-highlighted"><span class="mason-code-line-number">17</span><span class="mason-code-line-content">return 0;</span></span></code></pre>
            </div>
            """;

        String migrated = MasonMarkdownPostContentHandler.isolateMasonCodeBlocks(oldContent);

        assertTrue(migrated.contains(
            "<span class=\"mason-code-content\"><code class=\"language-cpp\">"));
        assertTrue(migrated.contains("class=\"mason-code-line-number\">17"));
        assertTrue(org.jsoup.Jsoup.parse(migrated).select("pre > code").isEmpty());
    }

    @Test
    void leavesUnownedCodeMarkupUntouched() {
        String oldContent = """
            <pre class="other-code-block language-cpp" data-language="cpp"><code class="language-cpp"><span class="other-code-line is-highlighted"><span class="other-code-line-number">17</span><span class="other-code-line-content">  return 0;</span></span></code></pre>
            """;

        String migrated = MasonMarkdownPostContentHandler.isolateMasonCodeBlocks(oldContent);

        assertEquals(oldContent, migrated);
        assertTrue(!org.jsoup.Jsoup.parse(migrated).select("pre > code").isEmpty());
    }

    @Test
    void flattensMasonBlocksThatWereNotSelectedForLineNumbers() {
        String oldContent = """
            <pre class="mason-code-block language-cpp" data-language="cpp"><code class="language-cpp"><span class="mason-code-line"><span class="mason-code-line-number">1</span><span class="mason-code-line-content">int value = 1;</span></span><span class="mason-code-line"><span class="mason-code-line-number">2</span><span class="mason-code-line-content">return value;</span></span></code></pre>
            """;

        String migrated = MasonMarkdownPostContentHandler.isolateMasonCodeBlocks(oldContent);
        var document = org.jsoup.Jsoup.parse(migrated);
        var pre = document.selectFirst("pre");

        assertTrue(pre.hasClass("mason-code-block--no-line-numbers"));
        assertEquals("int value = 1;\nreturn value;", pre.selectFirst("code").text());
        assertTrue(document.select(".mason-code-line-number").isEmpty());
    }

    @Test
    void flattensAlreadyWrappedMasonBlocksThatWereNotSelectedForLineNumbers() {
        String oldContent = """
            <pre class="mason-code-block language-javascript" data-language="javascript"><span class="mason-code-content"><code class="language-javascript"><span class="mason-code-line"><span class="mason-code-line-number">1</span><span class="mason-code-line-content">const value = 1;</span></span><span class="mason-code-line"><span class="mason-code-line-number">2</span><span class="mason-code-line-content">console.log(value);</span></span></code></span></pre>
            """;

        String migrated = MasonMarkdownPostContentHandler.isolateMasonCodeBlocks(oldContent);
        var document = org.jsoup.Jsoup.parse(migrated);
        var pre = document.selectFirst("pre");

        assertTrue(pre.hasClass("mason-code-block--no-line-numbers"));
        assertEquals("const value = 1;\nconsole.log(value);", pre.selectFirst("code").text());
        assertTrue(document.select(".mason-code-line-number").isEmpty());
    }

    @Test
    void leavesOrdinaryCodeBlocksUntouched() {
        String ordinary = "<pre><code class=\"language-cpp\">return 0;</code></pre>";

        assertEquals(ordinary,
            MasonMarkdownPostContentHandler.isolateMasonCodeBlocks(ordinary));
    }

    @Test
    void leavesRawMathUntouchedAndMigratesCompleteMathForAnyContentType() {
        String raw = "<p><span class=\"math math-inline\">x</span></p>";
        assertEquals(raw, MasonMarkdownPostContentHandler.migrateRenderedMathClasses(raw));

        PostContentContext markdownContext = PostContentContext.builder()
            .content("<p><span class=\"math math-inline\"><span class=\"katex\">x</span></span></p>")
            .rawType("markdown")
            .build();
        handler.handle(markdownContext).block();
        assertTrue(markdownContext.getContent().contains("mason-math-inline"));

        PostContentContext context = PostContentContext.builder()
            .content("<p><span class=\"math math-inline\"><span class=\"katex\">x</span></span></p>")
            .rawType("html")
            .build();
        handler.handle(context).block();
        assertTrue(context.getContent().contains("mason-math-inline"));
        assertTrue(!context.getContent().contains("class=\"math math-inline\""));
    }

    @Test
    void migrationIsIdempotent() {
        String migrated = "<span class=\"mason-math mason-math-inline\"><span class=\"katex\">x</span></span>";
        assertEquals(migrated, MasonMarkdownPostContentHandler.migrateRenderedMathClasses(migrated));
    }

    @Test
    void marksOnlyFormulaOnlyParagraphsForCentering() {
        String content = "<p>\n"
            + "<span class=\"math math-inline\"><span class=\"katex\">x</span></span>\n"
            + "</p><p>before <span class=\"math math-inline\">"
            + "<span class=\"katex\">y</span></span></p>";

        String marked = MasonMarkdownPostContentHandler.markFormulaOnlyParagraphs(content);
        var document = org.jsoup.Jsoup.parse(marked);

        assertEquals(1,
            document.select("p.mason-math-paragraph-display > .math-inline").size());
        assertEquals(1,
            document.select("p:not(.mason-math-paragraph-display) > .math-inline").size());
    }
}
