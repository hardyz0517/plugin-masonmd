package run.halo.bytemd;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.HashMap;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.Sort;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import run.halo.app.content.ContentWrapper;
import run.halo.app.content.PostContentService;
import run.halo.app.core.extension.content.Post;
import run.halo.app.extension.ListOptions;
import run.halo.app.extension.Metadata;
import run.halo.app.extension.ReactiveExtensionClient;
import run.halo.app.plugin.extensionpoint.ExtensionGetter;

class BytemdExcerptMigrationTest {

    private static final String LEGACY_CONTENT = """
        <div class="luogu-markdown-body"><p>线性求
        <span class="math math-inline"><span class="katex">
        <span class="katex-mathml"><math><mn>1</mn><annotation>1</annotation></math></span>
        <span class="katex-html"><span>1</span></span>
        </span></span> 到 n。</p></div>
        """;

    private ReactiveExtensionClient client;
    private PostContentService contentService;
    private BytemdExcerptMigration migration;

    @BeforeEach
    void setUp() {
        client = mock(ReactiveExtensionClient.class);
        contentService = mock(PostContentService.class);
        migration = new BytemdExcerptMigration(
            client,
            contentService,
            mock(ExtensionGetter.class)
        );
    }

    @Test
    void invalidatesOnlyTheCachedExcerptAndMarksTheReleaseRevision() {
        Post post = publishedPost(true);
        post.getMetadata().getAnnotations().put(
            BytemdExcerptMigration.CONTENT_CHECKSUM_ANNOTATION,
            "old-core-checksum"
        );
        when(client.listAll(eq(Post.class), any(ListOptions.class), any(Sort.class)))
            .thenReturn(Flux.just(post));
        when(contentService.getReleaseContent("post-1"))
            .thenReturn(Mono.just(ContentWrapper.builder()
                .content(LEGACY_CONTENT)
                .raw("线性求 $1$ 到 $n$。")
                .rawType("markdown")
                .snapshotName("release-1")
                .build()));
        when(client.fetch(Post.class, "post-1")).thenReturn(Mono.just(post));
        when(client.update(post)).thenReturn(Mono.just(post));

        assertEquals(1L, migration.migrateLegacyExcerpts().block());
        assertFalse(post.getMetadata().getAnnotations().containsKey(
            BytemdExcerptMigration.CONTENT_CHECKSUM_ANNOTATION
        ));
        assertEquals(
            BytemdExcerptMigration.contentRevision(LEGACY_CONTENT),
            post.getMetadata().getAnnotations().get(
                BytemdExcerptMigration.MIGRATED_CONTENT_ANNOTATION
            )
        );
        verify(client).update(post);
    }

    @Test
    void doesNotMigrateTheSameReleaseContentTwice() {
        Post post = publishedPost(true);
        post.getMetadata().getAnnotations().put(
            BytemdExcerptMigration.MIGRATED_CONTENT_ANNOTATION,
            BytemdExcerptMigration.contentRevision(LEGACY_CONTENT)
        );
        when(client.listAll(eq(Post.class), any(ListOptions.class), any(Sort.class)))
            .thenReturn(Flux.just(post));
        when(contentService.getReleaseContent("post-1"))
            .thenReturn(Mono.just(ContentWrapper.builder().content(LEGACY_CONTENT).build()));
        when(client.fetch(Post.class, "post-1")).thenReturn(Mono.just(post));

        assertEquals(0L, migration.migrateLegacyExcerpts().block());
        verify(client, never()).update(any(Post.class));
    }

    @Test
    void skipsManualExcerptsAndCurrentMathMarkup() {
        Post manual = publishedPost(false);
        Post current = publishedPost(true);
        current.getMetadata().setName("post-2");
        when(client.listAll(eq(Post.class), any(ListOptions.class), any(Sort.class)))
            .thenReturn(Flux.just(manual, current));
        when(contentService.getReleaseContent("post-2"))
            .thenReturn(Mono.just(ContentWrapper.builder()
                .content("<div class=\"bytemd-markdown-body\"><span class=\"katex-html\">1</span></div>")
                .build()));

        assertEquals(0L, migration.migrateLegacyExcerpts().block());
        verify(contentService, never()).getReleaseContent("post-1");
        verify(client, never()).update(any(Post.class));
    }

    @Test
    void recognizesOnlyPublishedPluginOwnedLegacyMath() {
        assertTrue(BytemdExcerptMigration.isLegacyBytemdMath(LEGACY_CONTENT));
        assertFalse(BytemdExcerptMigration.isLegacyBytemdMath(
            "<div class=\"other-editor\"><span class=\"katex-mathml\">1</span>"
                + "<span class=\"katex-html\">1</span></div>"
        ));
    }

    private static Post publishedPost(boolean autoGenerateExcerpt) {
        var metadata = new Metadata();
        metadata.setName("post-1");
        metadata.setAnnotations(new HashMap<>());

        var excerpt = new Post.Excerpt();
        excerpt.setAutoGenerate(autoGenerateExcerpt);
        excerpt.setRaw("");

        var spec = new Post.PostSpec();
        spec.setPublish(true);
        spec.setReleaseSnapshot("release-1");
        spec.setExcerpt(excerpt);

        var post = new Post();
        post.setMetadata(metadata);
        post.setSpec(spec);
        return post;
    }
}
