package com.hardyzheng.masonmd;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.nodes.Node;
import org.jsoup.nodes.TextNode;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Mono;
import run.halo.app.theme.ReactivePostContentHandler;

/**
 * Keeps saved Mason Markdown markup independent from optional theme-side
 * renderers. In particular, Mason Markdown code blocks must be isolated before
 * plugin-shiki sees them, otherwise its pre>code migration reads MasonMarkdown's line
 * numbers as source text. Rows without an explicit highlight are
 * flattened so default code remains free of a line-number gutter.
 *
 * <p>The handler only migrates a generic math wrapper when its matching element
 * already contains complete KaTeX markup. Raw, unrendered math wrappers are
 * left untouched so installations that still rely on plugin-katex can render
 * them normally. The raw type is intentionally not used as a gate here:
 * casing/value, while renaming an already-rendered wrapper is safe for either
 * Markdown or HTML content.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class MasonMarkdownPostContentHandler implements ReactivePostContentHandler {

    private static final Pattern ELEMENT_TAG = Pattern.compile(
        "(?is)<!--.*?-->|<(/?)([a-z][a-z0-9:-]*)(?:\\s[^>]*?)?/?>");
    private static final Pattern EDITABLE_MATH_ELEMENT = Pattern.compile(
        "(?is)<(span|div)\\b[^>]*>");
    private static final Pattern CLASS_ATTRIBUTE = Pattern.compile(
        "(?i)\\bclass\\s*=\\s*([\\\"'])([^\\\"']*)\\1");
    private static final Pattern OLD_MATH_CLASS = Pattern.compile(
        "(?i)(?:^|\\s)math-(?:inline|display)(?=\\s|$)");
    private static final Pattern KATEX_CLASS = Pattern.compile(
        "(?i)\\bclass\\s*=\\s*([\\\"'])[^\\\"']*\\bkatex(?:\\b|-)");
    private static final Set<String> VOID_ELEMENTS = Set.of(
        "area", "base", "br", "col", "embed", "hr", "img", "input", "link",
        "meta", "param", "source", "track", "wbr"
    );
    private static final List<CodeMarkupNamespace> CODE_MARKUP_NAMESPACES = List.of(
        new CodeMarkupNamespace("mason")
    );

    @Override
    public Mono<PostContentContext> handle(PostContentContext postContent) {
        if (postContent == null) {
            return Mono.empty();
        }
        if (postContent.getContent() == null
            || postContent.getContent().isBlank()) {
            return Mono.just(postContent);
        }

        String migrated = isolateMasonCodeBlocks(postContent.getContent());
        migrated = migrateRenderedMathClasses(migrated);
        migrated = markFormulaOnlyParagraphs(migrated);
        if (!migrated.equals(postContent.getContent())) {
            postContent.setContent(migrated);
        }
        return Mono.just(postContent);
    }

    /**
     * Isolates direct code children behind the wrapper emitted by the Markdown
     * renderer and normalizes already-wrapped Mason Markdown snapshots.
     * Shiki selects {@code pre:has(> code)}, so the wrapper keeps plugin-owned
     * content in the light DOM while this migration can remove default line
     * gutters.
     */
    static String isolateMasonCodeBlocks(String content) {
        if (content == null || content.isEmpty()
            || !containsMasonCodeMarkup(content)) {
            return content;
        }

        Document document = Jsoup.parse(content);
        // This handler serializes syntax-token spans back into the code node.
        // Jsoup pretty printing otherwise trims the first text node's leading
        // spaces, which changes the author's code indentation.
        document.outputSettings(new Document.OutputSettings().prettyPrint(false));
        boolean changed = false;
        for (Element pre : document.select("pre")) {
            Element code = findMasonCodeElement(pre);
            CodeMarkupNamespace namespace = code == null
                ? null
                : findCodeMarkupNamespace(pre, code);
            if (namespace == null) {
                continue;
            }

            boolean normalized = normalizeUnnumberedCode(pre, code, namespace);
            boolean isolated = false;
            if (code.parent() == pre) {
                Element wrapper = new Element("span").addClass(namespace.codeContent());
                code.replaceWith(wrapper);
                wrapper.appendChild(code);
                isolated = true;
            }

            changed |= normalized || isolated;
        }

        if (!changed) {
            return content;
        }
        return document.body().html();
    }

    private static Element findMasonCodeElement(Element pre) {
        for (Element child : pre.children()) {
            if ("code".equals(child.tagName())) {
                return child;
            }
            if (isCodeContentWrapper(child)) {
                Element nestedCode = child.children().stream()
                    .filter(nested -> "code".equals(nested.tagName()))
                    .findFirst()
                    .orElse(null);
                if (nestedCode != null) {
                    return nestedCode;
                }
            }
        }
        return null;
    }

    /**
     * Mason Markdown can emit line rows for every known language. A
     * highlighted row is the persisted signal that the author opted into the
     * line-number presentation; unhighlighted rows can be flattened to
     * the ordinary code-block shape before the article is styled.
     */
    private static boolean normalizeUnnumberedCode(
        Element pre, Element code, CodeMarkupNamespace namespace
    ) {
        List<Element> rows = code.children().stream()
            .filter(child -> child.hasClass(namespace.codeLine()))
            .toList();
        if (rows.isEmpty()
            || !code.select("." + namespace.codeLine() + ".is-highlighted, ."
                + namespace.codeLine() + "[data-highlighted=true]").isEmpty()
            || rows.size() != code.childrenSize()) {
            return false;
        }

        StringBuilder flattened = new StringBuilder();
        for (int index = 0; index < rows.size(); index++) {
            Element content = rows.get(index).children().stream()
                .filter(child -> child.hasClass(namespace.codeLineContent()))
                .findFirst()
                .orElse(null);
            if (content == null) {
                return false;
            }
            if (index > 0) {
                flattened.append('\n');
            }
            flattened.append(content.html());
        }

        code.html(flattened.toString());
        pre.addClass(namespace.codeBlockWithoutLineNumbers());
        return true;
    }

    private static boolean containsMasonCodeMarkup(String content) {
        return CODE_MARKUP_NAMESPACES.stream().anyMatch(namespace ->
            content.contains(namespace.codeBlock())
                || content.contains(namespace.codeFallback())
                || content.contains(namespace.codeLine())
        );
    }

    private static boolean isCodeContentWrapper(Element element) {
        return CODE_MARKUP_NAMESPACES.stream()
            .anyMatch(namespace -> element.hasClass(namespace.codeContent()));
    }

    private static CodeMarkupNamespace findCodeMarkupNamespace(Element pre, Element code) {
        for (CodeMarkupNamespace namespace : CODE_MARKUP_NAMESPACES) {
            if (pre.hasClass(namespace.codeBlock())
                || pre.hasClass(namespace.codeFallback())
                || !code.select("." + namespace.codeLine() + ", ."
                    + namespace.codeLineNumber() + ", ."
                    + namespace.codeLineContent()).isEmpty()) {
                return namespace;
            }
        }
        return null;
    }

    private record CodeMarkupNamespace(String prefix) {

        String codeBlock() {
            return prefix + "-code-block";
        }

        String codeBlockWithoutLineNumbers() {
            return codeBlock() + "--no-line-numbers";
        }

        String codeFallback() {
            return prefix + "-code-fallback";
        }

        String codeContent() {
            return prefix + "-code-content";
        }

        String codeLine() {
            return prefix + "-code-line";
        }

        String codeLineNumber() {
            return prefix + "-code-line-number";
        }

        String codeLineContent() {
            return prefix + "-code-line-content";
        }
    }

    static String migrateRenderedMathClasses(String content) {
        if (content == null || content.isEmpty()
            || (!content.contains("math-inline") && !content.contains("math-display"))
            || !KATEX_CLASS.matcher(content).find()) {
            return content;
        }

        List<Replacement> replacements = new ArrayList<>();
        Matcher candidates = EDITABLE_MATH_ELEMENT.matcher(content);
        while (candidates.find()) {
            String openingTag = candidates.group();
            Matcher classMatcher = CLASS_ATTRIBUTE.matcher(openingTag);
            if (!classMatcher.find() || !OLD_MATH_CLASS.matcher(classMatcher.group(2)).find()) {
                continue;
            }

            int closingTagStart = findMatchingClosingTag(
                content, candidates.end(), candidates.group(1));
            if (closingTagStart < 0) {
                continue;
            }

            String elementContent = content.substring(candidates.end(), closingTagStart);
            if (!KATEX_CLASS.matcher(elementContent).find()) {
                continue;
            }

            String migratedOpeningTag = migrateClassAttribute(openingTag, classMatcher);
            replacements.add(new Replacement(
                candidates.start(), candidates.end(), migratedOpeningTag));
        }

        if (replacements.isEmpty()) {
            return content;
        }

        StringBuilder result = new StringBuilder(content);
        for (int index = replacements.size() - 1; index >= 0; index--) {
            Replacement replacement = replacements.get(index);
            result.replace(replacement.start(), replacement.end(), replacement.value());
        }
        return result.toString();
    }

    /**
     * The old ByteMD math plugin parsed a one-line {@code $$...$$} paragraph
     * as an inline-math span. Mark only paragraphs that contain that span and
     * no prose, so the published stylesheet can center the legacy snapshot
     * without changing ordinary inline formulas in a sentence.
     */
    static String markFormulaOnlyParagraphs(String content) {
        if (content == null || content.isEmpty()
            || (!content.contains("math-inline")
                && !content.contains("mason-math-inline"))) {
            return content;
        }

        Document document = Jsoup.parse(content);
        boolean changed = false;
        for (Element paragraph : document.select("p")) {
            Element math = formulaOnlyChild(paragraph);
            if (math == null || paragraph.hasClass("mason-math-paragraph-display")) {
                continue;
            }
            paragraph.addClass("mason-math-paragraph-display");
            changed = true;
        }

        if (!changed) {
            return content;
        }
        document.outputSettings(new Document.OutputSettings().prettyPrint(false));
        return document.body().html();
    }

    private static Element formulaOnlyChild(Element paragraph) {
        List<Element> children = paragraph.children();
        if (children.size() != 1) {
            return null;
        }

        Element math = children.get(0);
        if (!math.hasClass("math-inline")
            && !math.hasClass("mason-math-inline")) {
            return null;
        }

        for (Node node : paragraph.childNodes()) {
            if (node == math) {
                continue;
            }
            if (!(node instanceof TextNode textNode) || !textNode.getWholeText().isBlank()) {
                return null;
            }
        }
        return math;
    }

    private static String migrateClassAttribute(String openingTag, Matcher classMatcher) {
        String classes = classMatcher.group(2);
        String migratedClasses = classes
            .replaceAll("(?i)(?<!\\S)math-inline(?!\\S)", "mason-math-inline")
            .replaceAll("(?i)(?<!\\S)math-display(?!\\S)", "mason-math-display")
            .replaceAll("(?i)(?<!\\S)math(?!\\S)", "mason-math");
        return openingTag.substring(0, classMatcher.start(2))
            + migratedClasses
            + openingTag.substring(classMatcher.end(2));
    }

    private static int findMatchingClosingTag(String html, int from, String tagName) {
        int depth = 1;
        String normalizedTagName = tagName.toLowerCase();
        Matcher tags = ELEMENT_TAG.matcher(html);
        tags.region(from, html.length());
        while (tags.find()) {
            if (tags.group(2) == null || !tagName.equalsIgnoreCase(tags.group(2))) {
                continue;
            }
            String tag = tags.group();
            if ("/".equals(tags.group(1))) {
                depth--;
                if (depth == 0) {
                    return tags.start();
                }
            } else if (!VOID_ELEMENTS.contains(normalizedTagName)
                && !tag.trim().endsWith("/>")) {
                depth++;
            }
        }
        return -1;
    }

    private record Replacement(int start, int end, String value) {
    }
}
