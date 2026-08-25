package run.halo.bytemd;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.thymeleaf.context.ITemplateContext;
import org.thymeleaf.model.IModel;
import org.thymeleaf.model.IModelFactory;
import org.thymeleaf.processor.element.IElementModelStructureHandler;

class BytemdHeadProcessorTest {

    @Test
    void injectsCurrentAndLegacyPublishedAssetsWithTheCurrentCacheVersion() {
        ITemplateContext context = mock(ITemplateContext.class);
        IModel model = mock(IModel.class);
        IModelFactory factory = mock(IModelFactory.class);
        when(context.getModelFactory()).thenReturn(factory);

        new BytemdHeadProcessor().process(
            context,
            model,
            mock(IElementModelStructureHandler.class)
        ).block();

        ArgumentCaptor<CharSequence> markup = ArgumentCaptor.forClass(CharSequence.class);
        verify(factory).createText(markup.capture());
        assertTrue(markup.getValue().toString().contains(
            "luogu-markdown.css?v=1.10.84"
        ));
        assertTrue(markup.getValue().toString().contains(
            "bytemd-markdown.css?v=1.10.84"
        ));
        assertTrue(markup.getValue().toString().contains(
            "code-block-copy.js?v=1.10.84"
        ));
    }
}
