package com.hardyzheng.masonmd;

import static java.nio.charset.StandardCharsets.UTF_8;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.HexFormat;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.StringUtils;
import org.springframework.context.event.EventListener;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.util.retry.Retry;
import run.halo.app.content.ExcerptGenerator;
import run.halo.app.content.PostContentService;
import run.halo.app.core.extension.content.Post;
import run.halo.app.extension.ListOptions;
import run.halo.app.extension.MetadataUtil;
import run.halo.app.extension.ReactiveExtensionClient;
import run.halo.app.plugin.event.PluginStartedEvent;
import run.halo.app.plugin.extensionpoint.ExtensionGetter;

/**
 * Invalidates Halo's cached automatic excerpt for published snapshots created
 * by older Mason Markdown renderers. Each exact release content revision is migrated
 * at most once.
 */
@Slf4j
@Component
public class MasonMarkdownExcerptMigration {

    static final String CONTENT_CHECKSUM_ANNOTATION = "checksum/content";
    static final String MIGRATED_CONTENT_ANNOTATION =
        "masonmd.hardyzheng.com/excerpt-content-checksum";

    private final ReactiveExtensionClient client;
    private final PostContentService postContentService;
    private final ExtensionGetter extensionGetter;

    public MasonMarkdownExcerptMigration(
        ReactiveExtensionClient client,
        PostContentService postContentService,
        ExtensionGetter extensionGetter
    ) {
        this.client = client;
        this.postContentService = postContentService;
        this.extensionGetter = extensionGetter;
    }

    @EventListener
    public void onPluginStarted(PluginStartedEvent ignored) {
        extensionGetter.getEnabledExtension(ExcerptGenerator.class)
            .filter(MasonMarkdownExcerptGenerator.class::isInstance)
            .flatMap(generator -> migrateMasonExcerpts())
            .defaultIfEmpty(0L)
            .subscribe(
                count -> {
                    if (count > 0) {
                        log.info("Invalidated {} Mason Markdown KaTeX excerpt cache(s)", count);
                    }
                },
                error -> log.warn("Failed to migrate Mason Markdown KaTeX excerpts", error)
            );
    }

    Mono<Long> migrateMasonExcerpts() {
        return client.listAll(Post.class, new ListOptions(), Sort.unsorted())
            .filter(MasonMarkdownExcerptMigration::usesAutomaticExcerpt)
            .flatMap(this::migratePost, 4)
            .filter(Boolean.TRUE::equals)
            .count();
    }

    private Mono<Boolean> migratePost(Post post) {
        String postName = post.getMetadata().getName();
        String releaseSnapshot = post.getSpec().getReleaseSnapshot();
        return postContentService.getReleaseContent(postName)
            .filter(content -> isMasonMarkdownMathWithDuplicateText(content.getContent()))
            .flatMap(content -> invalidateExcerptCache(
                postName,
                releaseSnapshot,
                contentRevision(content.getContent())
            ))
            .defaultIfEmpty(false)
            .onErrorResume(error -> {
                log.warn("Failed to inspect excerpt for post [{}]", postName, error);
                return Mono.just(false);
            });
    }

    private Mono<Boolean> invalidateExcerptCache(
        String postName,
        String expectedReleaseSnapshot,
        String contentRevision
    ) {
        return Mono.defer(() -> client.fetch(Post.class, postName)
                .filter(MasonMarkdownExcerptMigration::usesAutomaticExcerpt)
                .filter(post -> StringUtils.equals(
                    expectedReleaseSnapshot,
                    post.getSpec().getReleaseSnapshot()
                ))
                .filter(post -> !hasMigratedContentRevision(post, contentRevision))
                .flatMap(post -> {
                    var annotations = MetadataUtil.nullSafeAnnotations(post);
                    annotations.put(MIGRATED_CONTENT_ANNOTATION, contentRevision);
                    annotations.remove(CONTENT_CHECKSUM_ANNOTATION);
                    return client.update(post).thenReturn(true);
                })
                .defaultIfEmpty(false))
            .retryWhen(Retry.backoff(3, Duration.ofMillis(100))
                .filter(OptimisticLockingFailureException.class::isInstance));
    }

    private static boolean hasMigratedContentRevision(Post post, String contentRevision) {
        var annotations = MetadataUtil.nullSafeAnnotations(post);
        return StringUtils.equals(contentRevision, annotations.get(MIGRATED_CONTENT_ANNOTATION));
    }

    static boolean usesAutomaticExcerpt(Post post) {
        if (post == null || post.getSpec() == null
            || !Boolean.TRUE.equals(post.getSpec().getPublish())
            || StringUtils.isBlank(post.getSpec().getReleaseSnapshot())) {
            return false;
        }
        var excerpt = post.getSpec().getExcerpt();
        return excerpt == null || !Boolean.FALSE.equals(excerpt.getAutoGenerate());
    }

    static boolean isMasonMarkdownMathWithDuplicateText(String content) {
        if (!MasonMarkdownExcerptGenerator.hasDuplicatedKatexText(content)) {
            return false;
        }
        return StringUtils.contains(content, "mason-markdown-body")
            || StringUtils.contains(content, "mason-math")
            || StringUtils.contains(content, "math-inline")
            || StringUtils.contains(content, "math-display");
    }

    static String contentRevision(String content) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                .digest(StringUtils.defaultString(content).getBytes(UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException error) {
            throw new IllegalStateException("SHA-256 is unavailable", error);
        }
    }
}
