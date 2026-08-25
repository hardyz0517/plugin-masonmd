package run.halo.bytemd;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;
import run.halo.app.theme.ReactivePostContentHandler.PostContentContext;

class BytemdPostContentHandlerTest {

    private final BytemdPostContentHandler handler = new BytemdPostContentHandler();

    @Test
    void migratesOnlyCompleteOldInlineAndDisplayMathWrappers() {
        String oldContent = """
            <p><span class="math math-inline"><span class="katex"><span class="katex-mathml">x</span><span class="katex-html">x</span></span></span></p>
            <div class="math math-display"><span class="katex-display"><span class="katex">y</span></span></div>
            """;

        String migrated = BytemdPostContentHandler.migrateRenderedMathClasses(oldContent);

        assertTrue(migrated.contains("class=\"bytemd-math bytemd-math-inline\""));
        assertTrue(migrated.contains("class=\"bytemd-math bytemd-math-display\""));
        assertTrue(!migrated.contains("class=\"math math-inline\""));
        assertTrue(!migrated.contains("class=\"math math-display\""));
    }

    @Test
    void isolatesLegacyBytemdCodeBeforeShikiCanWrapIt() {
        String oldContent = """
            <div class="bytemd-markdown-body">
              <pre class="bytemd-code-block language-cpp" data-language="cpp"><code class="language-cpp"><span class="bytemd-code-line is-highlighted"><span class="bytemd-code-line-number">17</span><span class="bytemd-code-line-content">return 0;</span></span></code></pre>
            </div>
            """;

        String migrated = BytemdPostContentHandler.isolateLegacyCodeBlocks(oldContent);

        assertTrue(migrated.contains(
            "<span class=\"bytemd-code-content\"><code class=\"language-cpp\">"));
        assertTrue(migrated.contains("class=\"bytemd-code-line-number\">17"));
        assertTrue(org.jsoup.Jsoup.parse(migrated).select("pre > code").isEmpty());
    }

    @Test
    void isolatesHistoricalLuoguCodeWithoutChangingItsNamespace() {
        String oldContent = """
            <pre class="luogu-code-block language-cpp" data-language="cpp"><code class="language-cpp"><span class="luogu-code-line is-highlighted"><span class="luogu-code-line-number">17</span><span class="luogu-code-line-content">  return 0;</span></span></code></pre>
            """;

        String migrated = BytemdPostContentHandler.isolateLegacyCodeBlocks(oldContent);

        assertTrue(migrated.contains(
            "<span class=\"luogu-code-content\"><code class=\"language-cpp\">"));
        assertTrue(migrated.contains("class=\"luogu-code-line-content\">  return 0;"));
        assertTrue(!migrated.contains("bytemd-code-content"));
        assertTrue(org.jsoup.Jsoup.parse(migrated).select("pre > code").isEmpty());
    }

    @Test
    void flattensLegacyBlocksThatWereNotSelectedForLineNumbers() {
        String oldContent = """
            <pre class="bytemd-code-block language-cpp" data-language="cpp"><code class="language-cpp"><span class="bytemd-code-line"><span class="bytemd-code-line-number">1</span><span class="bytemd-code-line-content">int value = 1;</span></span><span class="bytemd-code-line"><span class="bytemd-code-line-number">2</span><span class="bytemd-code-line-content">return value;</span></span></code></pre>
            """;

        String migrated = BytemdPostContentHandler.isolateLegacyCodeBlocks(oldContent);
        var document = org.jsoup.Jsoup.parse(migrated);
        var pre = document.selectFirst("pre");

        assertTrue(pre.hasClass("bytemd-code-block--no-line-numbers"));
        assertEquals("int value = 1;\nreturn value;", pre.selectFirst("code").text());
        assertTrue(document.select(".bytemd-code-line-number").isEmpty());
    }

    @Test
    void flattensAlreadyWrappedLegacyBlocksThatWereNotSelectedForLineNumbers() {
        String oldContent = """
            <pre class="bytemd-code-block language-javascript" data-language="javascript"><span class="bytemd-code-content"><code class="language-javascript"><span class="bytemd-code-line"><span class="bytemd-code-line-number">1</span><span class="bytemd-code-line-content">const value = 1;</span></span><span class="bytemd-code-line"><span class="bytemd-code-line-number">2</span><span class="bytemd-code-line-content">console.log(value);</span></span></code></span></pre>
            """;

        String migrated = BytemdPostContentHandler.isolateLegacyCodeBlocks(oldContent);
        var document = org.jsoup.Jsoup.parse(migrated);
        var pre = document.selectFirst("pre");

        assertTrue(pre.hasClass("bytemd-code-block--no-line-numbers"));
        assertEquals("const value = 1;\nconsole.log(value);", pre.selectFirst("code").text());
        assertTrue(document.select(".bytemd-code-line-number").isEmpty());
    }

    @Test
    void flattensHistoricalLuoguBlocksUsingTheHistoricalClassNames() {
        String oldContent = """
            <pre class="luogu-code-block language-cpp"><span class="luogu-code-content"><code class="language-cpp"><span class="luogu-code-line"><span class="luogu-code-line-number">1</span><span class="luogu-code-line-content">  if (ready) {</span></span><span class="luogu-code-line"><span class="luogu-code-line-number">2</span><span class="luogu-code-line-content">    return 0;</span></span><span class="luogu-code-line"><span class="luogu-code-line-number">3</span><span class="luogu-code-line-content">  }</span></span></code></span></pre>
            """;

        String migrated = BytemdPostContentHandler.isolateLegacyCodeBlocks(oldContent);
        var document = org.jsoup.Jsoup.parse(migrated);
        var pre = document.selectFirst("pre");

        assertTrue(pre.hasClass("luogu-code-block--no-line-numbers"));
        assertTrue(migrated.contains("  if (ready) {\n    return 0;\n  }"), migrated);
        assertTrue(document.select(".luogu-code-line-number").isEmpty());
        assertTrue(!pre.classNames().contains("bytemd-code-block--no-line-numbers"));
    }

    @Test
    void leavesOrdinaryCodeBlocksUntouched() {
        String ordinary = "<pre><code class=\"language-cpp\">return 0;</code></pre>";

        assertEquals(ordinary,
            BytemdPostContentHandler.isolateLegacyCodeBlocks(ordinary));
    }

    @Test
    void leavesRawMathUntouchedAndMigratesCompleteMathForAnyContentType() {
        String raw = "<p><span class=\"math math-inline\">x</span></p>";
        assertEquals(raw, BytemdPostContentHandler.migrateRenderedMathClasses(raw));

        PostContentContext markdownContext = PostContentContext.builder()
            .content("<p><span class=\"math math-inline\"><span class=\"katex\">x</span></span></p>")
            .rawType("markdown")
            .build();
        handler.handle(markdownContext).block();
        assertTrue(markdownContext.getContent().contains("bytemd-math-inline"));

        PostContentContext context = PostContentContext.builder()
            .content("<p><span class=\"math math-inline\"><span class=\"katex\">x</span></span></p>")
            .rawType("html")
            .build();
        handler.handle(context).block();
        assertTrue(context.getContent().contains("bytemd-math-inline"));
        assertTrue(!context.getContent().contains("class=\"math math-inline\""));
    }

    @Test
    void migrationIsIdempotent() {
        String migrated = "<span class=\"bytemd-math bytemd-math-inline\"><span class=\"katex\">x</span></span>";
        assertEquals(migrated, BytemdPostContentHandler.migrateRenderedMathClasses(migrated));
    }

    @Test
    void marksOnlyFormulaOnlyLegacyParagraphsForCentering() {
        String content = "<p>\n"
            + "<span class=\"math math-inline\"><span class=\"katex\">x</span></span>\n"
            + "</p><p>before <span class=\"math math-inline\">"
            + "<span class=\"katex\">y</span></span></p>";

        String marked = BytemdPostContentHandler.markFormulaOnlyParagraphs(content);
        var document = org.jsoup.Jsoup.parse(marked);

        assertEquals(1,
            document.select("p.bytemd-math-paragraph-display > .math-inline").size());
        assertEquals(1,
            document.select("p:not(.bytemd-math-paragraph-display) > .math-inline").size());
    }
}
