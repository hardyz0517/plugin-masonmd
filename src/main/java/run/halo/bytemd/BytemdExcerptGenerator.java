package run.halo.bytemd;

import org.apache.commons.lang3.StringUtils;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Mono;
import run.halo.app.content.ExcerptGenerator;

/**
 * Preserves Halo's default excerpt behavior while removing KaTeX's duplicate
 * accessibility representation before text extraction.
 */
@Component
@Order(Ordered.LOWEST_PRECEDENCE)
public class BytemdExcerptGenerator implements ExcerptGenerator {

    private static final int DEFAULT_HTML_LIMIT = 500;
    private static final int DEFAULT_TEXT_LIMIT = 150;

    @Override
    public Mono<String> generate(Context context) {
        return Mono.fromSupplier(() -> generateExcerpt(context));
    }

    static String generateExcerpt(Context context) {
        if (context == null || StringUtils.isBlank(context.getContent())) {
            return StringUtils.EMPTY;
        }

        String content = context.getContent();
        if (hasDuplicatedKatexText(content)) {
            Document document = Jsoup.parse(content);
            document.select(".katex-mathml").remove();
            document.outputSettings(new Document.OutputSettings().prettyPrint(false));
            content = document.body().html();
        }

        String shortHtml = StringUtils.substring(content, 0, DEFAULT_HTML_LIMIT);
        String text = Jsoup.parse(shortHtml).text();
        int requestedLimit = context.getMaxLength();
        int textLimit = requestedLimit > 0
            ? Math.min(requestedLimit, DEFAULT_TEXT_LIMIT)
            : DEFAULT_TEXT_LIMIT;
        return StringUtils.substring(text, 0, textLimit);
    }

    static boolean hasDuplicatedKatexText(String content) {
        return StringUtils.contains(content, "katex-mathml")
            && StringUtils.contains(content, "katex-html");
    }
}
