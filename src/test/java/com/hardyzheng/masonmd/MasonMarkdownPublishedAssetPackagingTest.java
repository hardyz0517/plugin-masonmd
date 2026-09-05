package com.hardyzheng.masonmd;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;

class MasonMarkdownPublishedAssetPackagingTest {

    @Test
    void packagesMasonLogo() throws IOException {
        assertTrue(readBytes("mason-markdown-logo.png").length > 0);
    }

    @Test
    void packagesPublishedStylesAndFontsUnderThePublicUiDirectory() throws IOException {
        String markdownStyles = readText("ui/published/mason-markdown.css");
        assertTrue(markdownStyles.contains(".mason-markdown-body"));
        assertTrue(markdownStyles.contains(".mason-markdown-body a"));
        assertTrue(markdownStyles.contains(".mason-code-content"));
        assertTrue(markdownStyles.contains(".mason-code-content > code"));
        assertTrue(markdownStyles.contains(".mason-code-block--no-line-numbers"));
        assertTrue(markdownStyles.contains(".mason-code-copy-button"));
        assertTrue(markdownStyles.contains("#0969da"));
        assertTrue(markdownStyles.contains("#f0f0f0"));
        assertFalse(markdownStyles.contains("bytemd-markdown.css"));
        assertFalse(markdownStyles.contains("luogu-"));
        assertTrue(markdownStyles.contains("white-space: pre-wrap !important"));
        String copyRuntime = readText("ui/published/code-block-copy.js");
        assertTrue(copyRuntime.contains("mason-code-copy-button"));
        assertTrue(copyRuntime.contains("navigator.clipboard"));
        assertTrue(readText("ui/published/katex/katex.min.css")
            .contains("url(fonts/KaTeX_Main-Regular.woff2)"));
        assertTrue(readBytes("ui/published/katex/fonts/KaTeX_Main-Regular.woff2").length > 0);
    }

    private static String readText(String path) throws IOException {
        return new String(readBytes(path), StandardCharsets.UTF_8);
    }

    private static byte[] readBytes(String path) throws IOException {
        try (InputStream stream = MasonMarkdownPublishedAssetPackagingTest.class.getClassLoader()
            .getResourceAsStream(path)) {
            assertNotNull(stream, () -> "Missing packaged resource: " + path);
            return stream.readAllBytes();
        }
    }
}
