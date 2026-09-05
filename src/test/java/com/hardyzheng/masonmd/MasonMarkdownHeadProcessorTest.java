package com.hardyzheng.masonmd;

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

class MasonMarkdownHeadProcessorTest {

    @Test
    void injectsMasonPublishedAssetsWithTheCurrentCacheVersion() {
        ITemplateContext context = mock(ITemplateContext.class);
        IModel model = mock(IModel.class);
        IModelFactory factory = mock(IModelFactory.class);
        when(context.getModelFactory()).thenReturn(factory);

        new MasonMarkdownHeadProcessor().process(
            context,
            model,
            mock(IElementModelStructureHandler.class)
        ).block();

        ArgumentCaptor<CharSequence> markup = ArgumentCaptor.forClass(CharSequence.class);
        verify(factory).createText(markup.capture());
        assertTrue(markup.getValue().toString().contains(
            "mason-markdown.css?v=1.10.85"
        ));
        assertTrue(markup.getValue().toString().contains(
            "code-block-copy.js?v=1.10.85"
        ));
    }
}
