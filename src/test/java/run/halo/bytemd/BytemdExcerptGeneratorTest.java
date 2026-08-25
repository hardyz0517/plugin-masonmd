package run.halo.bytemd;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;
import run.halo.app.content.ExcerptGenerator;

class BytemdExcerptGeneratorTest {

    @Test
    void removesHiddenMathmlBeforeExtractingAutomaticExcerpt() {
        var context = new ExcerptGenerator.Context()
            .setContent("""
                <div class="luogu-markdown-body"><p>线性求
                <span class="bytemd-math bytemd-math-inline"><span class="katex">
                <span class="katex-mathml"><math><semantics><mn>1</mn><annotation>1</annotation></semantics></math></span>
                <span class="katex-html" aria-hidden="true"><span class="mord">1</span></span>
                </span></span> 到 n。</p></div>
                """)
            .setMaxLength(160);

        assertEquals("线性求 1 到 n。", BytemdExcerptGenerator.generateExcerpt(context));
    }

    @Test
    void leavesCurrentHtmlOnlyKatexAtOneVisibleCopy() {
        var context = new ExcerptGenerator.Context()
            .setContent("""
                <p>线性求 <span class="bytemd-math" role="math" aria-label="1">
                <span class="katex"><span class="katex-html"><span class="mord">1</span></span></span>
                </span> 到 n。</p>
                """)
            .setMaxLength(160);

        assertEquals("线性求 1 到 n。", BytemdExcerptGenerator.generateExcerpt(context));
    }

    @Test
    void keepsHalosDefaultExcerptLengthCeiling() {
        String content = "<p>" + "a".repeat(200) + "</p>";
        var context = new ExcerptGenerator.Context()
            .setContent(content)
            .setMaxLength(160);

        assertEquals(150, BytemdExcerptGenerator.generateExcerpt(context).length());
    }
}
