package run.halo.bytemd;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;

class PublishedAssetPackagingTest {

    @Test
    void packagesPublishedStylesAndFontsUnderThePublicUiDirectory() throws IOException {
        String markdownStyles = readText("ui/published/luogu-markdown.css");
        assertTrue(markdownStyles.contains(".luogu-markdown-body"));
        assertTrue(markdownStyles.contains(".luogu-markdown-body a"));
        assertTrue(markdownStyles.contains(".luogu-code-content"));
        assertTrue(markdownStyles.contains(".luogu-code-content > code"));
        assertTrue(markdownStyles.contains("#0969da"));
        assertTrue(markdownStyles.contains("#f0f0f0"));
        assertTrue(readText("ui/published/katex/katex.min.css")
            .contains("url(fonts/KaTeX_Main-Regular.woff2)"));
        assertTrue(readBytes("ui/published/katex/fonts/KaTeX_Main-Regular.woff2").length > 0);
    }

    private static String readText(String path) throws IOException {
        return new String(readBytes(path), StandardCharsets.UTF_8);
    }

    private static byte[] readBytes(String path) throws IOException {
        try (InputStream stream = PublishedAssetPackagingTest.class.getClassLoader()
            .getResourceAsStream(path)) {
            assertNotNull(stream, () -> "Missing packaged resource: " + path);
            return stream.readAllBytes();
        }
    }
}
