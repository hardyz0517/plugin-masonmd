package run.halo.bytemd;

import org.springframework.stereotype.Component;
import org.thymeleaf.context.ITemplateContext;
import org.thymeleaf.model.IModel;
import org.thymeleaf.processor.element.IElementModelStructureHandler;
import reactor.core.publisher.Mono;
import run.halo.app.theme.dialect.TemplateHeadProcessor;

/**
 * Publishes semantic Markdown assets without coupling the plugin to a theme's
 * DOM or template files.
 */
@Component
public class BytemdHeadProcessor implements TemplateHeadProcessor {

    private static final String PLUGIN_VERSION = "1.10.84";

    @Override
    public Mono<Void> process(ITemplateContext context, IModel model,
                              IElementModelStructureHandler structureHandler) {
        String assetPrefix = "/plugins/PluginBytemd/assets/ui/published/";
        String link = "<link rel=\"stylesheet\" href=\"" + assetPrefix
            + "luogu-markdown.css?v=" + PLUGIN_VERSION + "\">"
            + "<link rel=\"stylesheet\" href=\"" + assetPrefix
            + "bytemd-markdown.css?v=" + PLUGIN_VERSION + "\">"
            + "<link rel=\"stylesheet\" href=\"" + assetPrefix
            + "katex/katex.min.css?v=" + PLUGIN_VERSION + "\">"
            + "<script defer src=\"" + assetPrefix
            + "mermaid-layout-normalizer.js?v=" + PLUGIN_VERSION + "\"></script>"
            + "<script defer src=\"" + assetPrefix
            + "code-block-copy.js?v=" + PLUGIN_VERSION + "\"></script>";
        model.add(context.getModelFactory().createText(
            "<!-- plugin-bytemd semantic markdown styles start -->" + link
                + "<!-- plugin-bytemd semantic markdown styles end -->"));
        return Mono.empty();
    }
}
