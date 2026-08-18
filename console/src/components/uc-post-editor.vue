<script setup lang="ts">
import { consoleApiClient, ucApiClient } from "@halo-dev/api-client";
import type { Attachment } from "@halo-dev/api-client";
import { stores } from "@halo-dev/ui-shared";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import Bytemd from "./bytemd.vue";
import { useUcPostDraft } from "../composables/use-uc-post-draft";
import "../styles/uc-post-editor.scss";
import "../styles/vscode-modern-theme.scss";

const query = new URLSearchParams(window.location.search);
const draft = useUcPostDraft(query.get("name") || "");
const {
  post,
  content,
  categories,
  loading,
  loadFailed,
  saving,
  publishing,
  unpublishing,
  deleting,
  error,
  successLink,
  statusText,
  tags,
  optionsError,
} = draft;
const tagPickerOpen = ref(false);
const tagPickerKeyword = ref("");
const tagPickerSelection = ref<string[]>([]);
const categoryMenuOpen = ref(false);
const categoryMenuRef = ref<HTMLElement>();
const categoryHighlightIndex = ref(0);
const attachmentPickerOpen = ref(false);
const attachmentLoading = ref(false);
const attachmentUploading = ref(false);
const attachmentError = ref("");
const attachmentKeyword = ref("");
const attachments = ref<Attachment[]>([]);
const coverFileInput = ref<HTMLInputElement>();
const deleteDialogOpen = ref(false);
const editorColorScheme = ref<"light" | "dark">("light");
const siteLogo = ref("");
const siteTitle = ref("站点");
const siteHomeUrl = ref(new URL("/", window.location.origin).toString());
let themeObserver: MutationObserver | undefined;
let themeMediaQuery: MediaQueryList | undefined;
let allowPageLeave = false;

function asNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

async function loadSiteBrand() {
  let fallbackLogo = "";
  try {
    const globalInfoStore = stores.globalInfo();
    if (!globalInfoStore.globalInfo) await globalInfoStore.fetchGlobalInfo();
    const globalInfo = globalInfoStore.globalInfo;
    const externalUrl = asNonEmptyString(globalInfo?.externalUrl);
    const globalTitle = asNonEmptyString(globalInfo?.siteTitle);

    if (externalUrl) siteHomeUrl.value = new URL(externalUrl, window.location.origin).toString();
    if (globalTitle) siteTitle.value = globalTitle;
    fallbackLogo = asNonEmptyString(globalInfo?.favicon);
  } catch {
    // The editor remains usable when the global info endpoint is unavailable.
  }

  try {
    const { data } = await consoleApiClient.configMap.system.getSystemConfigByGroup({
      group: "basic",
    });
    const basicConfig = data as { logo?: unknown; title?: unknown };
    const configuredLogo = asNonEmptyString(basicConfig.logo);
    const configuredTitle = asNonEmptyString(basicConfig.title);

    siteLogo.value = configuredLogo || fallbackLogo;
    if (configuredTitle) siteTitle.value = configuredTitle;
  } catch {
    siteLogo.value = fallbackLogo;
  }
}

function handleSiteLogoError() {
  siteLogo.value = "";
}

function getThemeMode() {
  const root = document.documentElement;
  let storedMode: string | null = null;
  try {
    storedMode = window.localStorage.getItem("hardy:color-scheme");
  } catch {
    storedMode = null;
  }

  return storedMode || root.dataset.hardyColorScheme || root.dataset.colorScheme || "auto";
}

function syncEditorColorScheme() {
  const root = document.documentElement;
  const mode = getThemeMode();
  const isDark =
    root.classList.contains("dark") ||
    mode === "dark" ||
    (mode === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  editorColorScheme.value = isDark ? "dark" : "light";
}

function setupThemeSync() {
  syncEditorColorScheme();
  themeObserver = new MutationObserver(syncEditorColorScheme);
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "data-color-scheme", "data-hardy-color-scheme"],
  });
  themeMediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  themeMediaQuery.addEventListener("change", syncEditorColorScheme);
  window.addEventListener("storage", syncEditorColorScheme);
}

function teardownThemeSync() {
  themeObserver?.disconnect();
  themeObserver = undefined;
  themeMediaQuery?.removeEventListener("change", syncEditorColorScheme);
  themeMediaQuery = undefined;
  window.removeEventListener("storage", syncEditorColorScheme);
}

function attachmentUrl(attachment: Attachment) {
  return (
    attachment.status?.permalink ||
    attachment.status?.thumbnails?.medium ||
    Object.values(attachment.status?.thumbnails || {})[0] ||
    ""
  );
}

function attachmentName(attachment: Attachment) {
  return attachment.spec?.displayName || attachment.metadata.name;
}

const filteredAttachments = computed(() => {
  const keyword = attachmentKeyword.value.trim().toLocaleLowerCase();
  if (!keyword) return attachments.value;
  return attachments.value.filter((attachment) =>
    attachmentName(attachment).toLocaleLowerCase().includes(keyword),
  );
});

function getAttachmentErrorMessage(error: unknown) {
  const requestError = error as {
    message?: unknown;
    response?: { data?: { detail?: unknown; title?: unknown } };
  };
  return (
    [
      requestError.response?.data?.detail,
      requestError.response?.data?.title,
      requestError.message,
    ].find((value): value is string => typeof value === "string" && value.length > 0) ||
    "附件操作失败，请重试"
  );
}

async function loadAttachments() {
  attachmentLoading.value = true;
  attachmentError.value = "";
  try {
    const { data } = await ucApiClient.storage.attachment.listMyAttachments({
      page: 1,
      size: 100,
      sort: ["metadata.creationTimestamp,desc"],
    });
    attachments.value = data.items.filter(
      (attachment) => attachment.spec?.mediaType?.startsWith("image/") && attachmentUrl(attachment),
    );
  } catch (requestError: unknown) {
    attachmentError.value = getAttachmentErrorMessage(requestError);
  } finally {
    attachmentLoading.value = false;
  }
}

async function openAttachmentPicker() {
  attachmentPickerOpen.value = true;
  if (!attachments.value.length) await loadAttachments();
}

function closeAttachmentPicker() {
  attachmentPickerOpen.value = false;
  attachmentKeyword.value = "";
  attachmentError.value = "";
}

function selectAttachment(attachment: Attachment) {
  const url = attachmentUrl(attachment);
  if (!url) {
    attachmentError.value = "该附件暂时没有可用地址";
    return;
  }
  post.value.spec.cover = url;
  closeAttachmentPicker();
}

async function handleCoverUpload(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    attachmentError.value = "封面只能上传图片文件";
    return;
  }

  attachmentUploading.value = true;
  attachmentError.value = "";
  try {
    const { data } = await ucApiClient.storage.attachment.uploadAttachmentForUc({ file });
    const url = attachmentUrl(data);
    if (!url) throw new Error("上传成功但没有返回附件地址");
    post.value.spec.cover = url;
    attachments.value = [data, ...attachments.value.filter((item) => item.metadata.name !== data.metadata.name)];
  } catch (requestError: unknown) {
    attachmentError.value = getAttachmentErrorMessage(requestError);
  } finally {
    attachmentUploading.value = false;
  }
}

function clearCover() {
  post.value.spec.cover = "";
}

const hasSavedPost = computed(
  () => Boolean(post.value.metadata.creationTimestamp || draft.postName.value),
);

const articleLink = computed(() => {
  if (successLink.value) return successLink.value;
  if (!hasSavedPost.value) return "";
  if (post.value.status?.permalink) return post.value.status.permalink;
  if (!post.value.spec.slug) return "";
  return new URL(
    `/archives/${encodeURIComponent(post.value.spec.slug)}`,
    window.location.origin,
  ).toString();
});

function openDeleteDialog() {
  if (!hasSavedPost.value || deleting.value) return;
  error.value = "";
  deleteDialogOpen.value = true;
}

function closeDeleteDialog() {
  if (!deleting.value) deleteDialogOpen.value = false;
}

async function canReturnTo(url: URL) {
  if (/^\/404(?:\/|$)/.test(url.pathname)) return false;

  try {
    const response = await fetch(url.toString(), {
      method: "HEAD",
      credentials: "same-origin",
    });
    return response.status !== 404;
  } catch {
    // A network error should not strand the user in the editor after deletion.
    return true;
  }
}

async function confirmDelete() {
  if (deleting.value) return;
  const deleted = await draft.deletePost();
  if (!deleted) return;

  allowPageLeave = true;
  deleteDialogOpen.value = false;
  const currentUrl = new URL(window.location.href);
  const referrerUrl = document.referrer ? new URL(document.referrer, currentUrl.origin) : undefined;

  if (referrerUrl && referrerUrl.origin === currentUrl.origin && referrerUrl.href !== currentUrl.href) {
    if (/^\/archives(?:\/|$)/.test(referrerUrl.pathname)) {
      window.location.assign(new URL("/", currentUrl.origin).toString());
      return;
    }

    if (await canReturnTo(referrerUrl)) {
      window.location.assign(referrerUrl.toString());
      return;
    }

    // A known invalid referrer must not fall through to history.back(), which
    // would send the user back to the same 404 page.
    window.location.assign(new URL("/", currentUrl.origin).toString());
    return;
  }

  if (window.history.length > 1) {
    window.history.back();
    return;
  }

  window.location.assign(new URL("/", currentUrl.origin).toString());
}

function handleArticleLinkClick(event: MouseEvent) {
  if (!articleLink.value) event.preventDefault();
}

function handleBeforeUnload(event: BeforeUnloadEvent) {
  if (allowPageLeave || !draft.hasUnsavedChanges()) return;
  event.preventDefault();
  event.returnValue = "";
}
const selectedCategory = computed({
  get: () => post.value.spec.categories?.[0] || "",
  set: (value: string) => {
    post.value.spec.categories = value ? [value] : [];
  },
});

function displayName(item: { metadata: { name: string }; spec?: { displayName?: string } }) {
  return item.spec?.displayName || item.metadata.name;
}

function getTags() {
  return post.value.spec.tags || (post.value.spec.tags = []);
}

function tagDisplayName(name: string) {
  const tag = tags.value.find((item) => item.metadata.name === name);
  return tag ? displayName(tag) : name;
}

const filteredTags = computed(() => {
  const keyword = tagPickerKeyword.value.trim().toLocaleLowerCase();
  if (!keyword) return tags.value;

  return tags.value.filter((tag) =>
    [tag.metadata.name, tag.spec?.displayName, tag.spec?.slug]
      .filter(Boolean)
      .some((value) => value!.toLocaleLowerCase().includes(keyword)),
  );
});

const tagPickerSelectionCount = computed(() => tagPickerSelection.value.length);

function openTagPicker() {
  tagPickerSelection.value = [...getTags()];
  tagPickerKeyword.value = "";
  tagPickerOpen.value = true;
}

function closeTagPicker() {
  tagPickerOpen.value = false;
  tagPickerKeyword.value = "";
}

function isTagSelected(name: string) {
  return tagPickerSelection.value.includes(name);
}

function toggleTagSelection(name: string) {
  if (isTagSelected(name)) {
    tagPickerSelection.value = tagPickerSelection.value.filter((tag) => tag !== name);
    return;
  }
  tagPickerSelection.value = [...tagPickerSelection.value, name];
}

function confirmTagPicker() {
  post.value.spec.tags = [...tagPickerSelection.value];
  closeTagPicker();
}

function handleTagPickerTriggerKeydown(event: KeyboardEvent) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    openTagPicker();
  }
}

const categoryOptions = computed(() => [
  { value: "", label: "未分类" },
  ...categories.value.map((item) => ({
    value: item.metadata.name,
    label: displayName(item),
  })),
]);
const selectedCategoryLabel = computed(
  () => categoryOptions.value.find((option) => option.value === selectedCategory.value)?.label || "未分类",
);

function syncCategoryHighlight() {
  const selectedIndex = categoryOptions.value.findIndex(
    (option) => option.value === selectedCategory.value,
  );
  categoryHighlightIndex.value = selectedIndex >= 0 ? selectedIndex : 0;
}

function toggleCategoryMenu() {
  categoryMenuOpen.value = !categoryMenuOpen.value;
  if (categoryMenuOpen.value) syncCategoryHighlight();
}

function selectCategory(value: string) {
  selectedCategory.value = value;
  categoryMenuOpen.value = false;
}

function handleCategoryKeydown(event: KeyboardEvent) {
  const { key } = event;
  if (key === "Escape") {
    categoryMenuOpen.value = false;
    return;
  }

  if (key === "Enter" || key === " ") {
    event.preventDefault();
    if (!categoryMenuOpen.value) {
      toggleCategoryMenu();
    } else {
      selectCategory(categoryOptions.value[categoryHighlightIndex.value]?.value || "");
    }
    return;
  }

  if (key !== "ArrowDown" && key !== "ArrowUp" && key !== "Home" && key !== "End") return;
  event.preventDefault();
  if (!categoryMenuOpen.value) {
    categoryMenuOpen.value = true;
    syncCategoryHighlight();
  }

  const lastIndex = categoryOptions.value.length - 1;
  if (key === "Home") categoryHighlightIndex.value = 0;
  else if (key === "End") categoryHighlightIndex.value = lastIndex;
  else {
    const offset = key === "ArrowDown" ? 1 : -1;
    categoryHighlightIndex.value = (categoryHighlightIndex.value + offset + categoryOptions.value.length) % categoryOptions.value.length;
  }
}

function closeCategoryMenu(event: MouseEvent) {
  const target = event.target;
  if (!(target instanceof Node) || !categoryMenuRef.value?.contains(target)) {
    categoryMenuOpen.value = false;
  }
}

function removeTag(tag: string) {
  const currentTags = getTags();
  const index = currentTags.indexOf(tag);
  if (index >= 0) currentTags.splice(index, 1);
}

onMounted(() => {
  document.addEventListener("click", closeCategoryMenu);
  window.addEventListener("beforeunload", handleBeforeUnload);
  setupThemeSync();
  void loadSiteBrand();
  void draft.loadPage();
});
watch(
  [
    () => post.value.spec.title,
    () => post.value.spec.cover,
    () => post.value.spec.visible,
    () => post.value.spec.pinned,
    () => post.value.spec.categories?.join(",") || "",
    () => post.value.spec.tags?.join(",") || "",
    () => content.value.raw,
  ],
  draft.scheduleAutosave,
);
onBeforeUnmount(() => {
  document.removeEventListener("click", closeCategoryMenu);
  window.removeEventListener("beforeunload", handleBeforeUnload);
  teardownThemeSync();
  draft.dispose();
});
</script>

<template>
  <main
    class="hardy-post-editor"
    :class="{ 'hardy-post-editor--dark': editorColorScheme === 'dark' }"
  >
    <header class="hardy-editor-header">
      <div class="hardy-editor-header-inner">
        <div class="hardy-editor-heading">
          <a class="hardy-editor-site-brand" :href="siteHomeUrl" :title="`返回 ${siteTitle} 首页`">
            <img v-if="siteLogo" :src="siteLogo" :alt="siteTitle" @error="handleSiteLogoError" />
            <span v-else aria-hidden="true">{{ siteTitle.slice(0, 1).toUpperCase() }}</span>
          </a>
          <div class="hardy-editor-breadcrumb">
            <p>我的文章</p>
            <h1>{{ post.spec.title || "新建文章" }}</h1>
          </div>
        </div>
        <div class="hardy-editor-actions">
          <a
            v-if="hasSavedPost"
            class="hardy-button primary hardy-view-article"
            :class="{ disabled: !articleLink }"
            :href="articleLink || undefined"
            :aria-disabled="!articleLink"
            :title="articleLink ? '查看文章' : '文章链接暂不可用'"
            @click="handleArticleLinkClick"
          >
            查看文章
          </a>
          <button
            v-if="hasSavedPost"
            type="button"
            class="hardy-button danger"
            :disabled="loading || saving || publishing || unpublishing || deleting"
            @click="openDeleteDialog"
          >
            删除文章
          </button>
        </div>
      </div>
    </header>

    <div v-if="loading" class="hardy-editor-loading">正在加载编辑器...</div>
    <div v-else-if="loadFailed" class="hardy-editor-load-error">
      <strong>{{ error }}</strong>
      <button class="hardy-button secondary" @click="draft.loadPage">重新加载</button>
    </div>
    <template v-else>
      <div class="hardy-editor-content">
        <section class="hardy-post-form" aria-label="文章编辑">
          <div class="hardy-form-row">
            <label class="hardy-form-label" for="hardy-post-title">文章标题</label>
            <div class="hardy-form-control">
              <input id="hardy-post-title" v-model="post.spec.title" class="hardy-input hardy-title-input" placeholder="请输入文章标题" />
            </div>
          </div>

          <div class="hardy-form-row">
            <span class="hardy-form-label" id="hardy-post-category-label">文章分类</span>
            <div class="hardy-form-control hardy-form-control-compact">
              <div ref="categoryMenuRef" class="hardy-category-select" @click.stop>
                <button
                  id="hardy-post-category"
                  type="button"
                  class="hardy-category-trigger"
                  role="combobox"
                  aria-haspopup="listbox"
                  aria-controls="hardy-post-category-options"
                  :aria-expanded="categoryMenuOpen"
                  aria-labelledby="hardy-post-category-label"
                  @click="toggleCategoryMenu"
                  @keydown="handleCategoryKeydown"
                >
                  <span>{{ selectedCategoryLabel }}</span>
                  <span class="hardy-category-chevron" aria-hidden="true" />
                </button>
                <Transition name="hardy-category-menu">
                  <div id="hardy-post-category-options" v-if="categoryMenuOpen" class="hardy-category-menu" role="listbox" aria-labelledby="hardy-post-category-label">
                    <button
                      v-for="(option, index) in categoryOptions"
                      :key="option.value || '__uncategorized__'"
                      type="button"
                      class="hardy-category-option"
                      :class="{
                        selected: option.value === selectedCategory,
                        highlighted: index === categoryHighlightIndex,
                      }"
                      role="option"
                      :aria-selected="option.value === selectedCategory"
                      @mouseenter="categoryHighlightIndex = index"
                      @click="selectCategory(option.value)"
                    >
                      {{ option.label }}
                    </button>
                  </div>
                </Transition>
              </div>
              <p v-if="optionsError" class="hardy-options-error" role="status">
                {{ optionsError }}
                <button type="button" @click="draft.loadOptions">重试</button>
              </p>
            </div>
          </div>

          <div class="hardy-form-row">
            <label class="hardy-form-label" for="hardy-post-cover">文章封面</label>
            <div class="hardy-form-control hardy-cover-control">
              <div class="hardy-cover-input-row">
                <input id="hardy-post-cover" v-model="post.spec.cover" class="hardy-input" placeholder="封面地址（可选）" />
                <button type="button" class="hardy-button" @click="openAttachmentPicker">从附件选择</button>
                <label class="hardy-button hardy-upload-button" :class="{ 'is-loading': attachmentUploading }">
                  {{ attachmentUploading ? "上传中..." : "本地上传" }}
                  <input
                    ref="coverFileInput"
                    type="file"
                    accept="image/*"
                    :disabled="attachmentUploading"
                    @change="handleCoverUpload"
                  />
                </label>
              </div>
              <div v-if="post.spec.cover" class="hardy-cover-preview">
                <img :src="post.spec.cover" alt="文章封面预览" />
                <button type="button" class="hardy-cover-clear" aria-label="移除封面" @click="clearCover">移除</button>
              </div>
            </div>
          </div>

          <div class="hardy-form-row">
            <span class="hardy-form-label">文章标签</span>
            <div
              class="hardy-form-control hardy-tags-control"
              role="button"
              tabindex="0"
              aria-haspopup="dialog"
              :aria-expanded="tagPickerOpen"
              aria-label="选择文章标签"
              @click="openTagPicker"
              @keydown="handleTagPickerTriggerKeydown"
            >
              <span v-for="tag in post.spec.tags || []" :key="tag" class="hardy-tag">
                {{ tagDisplayName(tag) }}
                <button type="button" aria-label="删除标签" @click.stop="removeTag(tag)">×</button>
              </span>
              <span v-if="!(post.spec.tags || []).length" class="hardy-tags-placeholder">
                点击选择标签
              </span>
              <span class="hardy-tags-picker-hint" aria-hidden="true">选择</span>
            </div>
          </div>

          <div class="hardy-form-row hardy-content-row">
            <span class="hardy-form-label">文章内容</span>
            <div class="hardy-form-control hardy-content-control">
              <div class="hardy-editor-surface">
                <Bytemd
                  v-model:raw="content.raw"
                  v-model:content="content.content"
                />
              </div>
            </div>
          </div>

          <div class="hardy-form-row">
            <span class="hardy-form-label">文章状态</span>
            <div class="hardy-form-control hardy-radio-group">
              <label class="hardy-radio"><input v-model="post.spec.visible" type="radio" value="PRIVATE" /> <span>私有</span></label>
              <label class="hardy-radio"><input v-model="post.spec.visible" type="radio" value="PUBLIC" /> <span>公开</span></label>
            </div>
          </div>

          <div class="hardy-form-row">
            <span class="hardy-form-label">置顶文章</span>
            <div class="hardy-form-control hardy-radio-group">
              <label class="hardy-switch-line"><input v-model="post.spec.pinned" type="checkbox" /> <span>在文章列表顶部显示</span></label>
            </div>
          </div>
          <div class="hardy-form-actions">
            <button class="hardy-button primary" :disabled="loading || saving || publishing || unpublishing || deleting" @click="draft.save">保存</button>
            <span v-if="statusText" class="hardy-save-state" :class="{ error }">{{ statusText }}</span>
          </div>
        </section>

        <div v-if="error" class="hardy-editor-message hardy-editor-error">
          <span>{{ error }}</span>
          <button class="hardy-button secondary" @click="draft.save">重试保存</button>
        </div>
      </div>
    </template>

    <Teleport to="body">
      <div
        v-if="deleteDialogOpen"
        class="hardy-attachment-dialog-container hardy-delete-dialog-container"
        :class="{ 'hardy-attachment-dialog-container--dark': editorColorScheme === 'dark' }"
        role="presentation"
        tabindex="-1"
        @keydown.esc="closeDeleteDialog"
        @mousedown.self="closeDeleteDialog"
      >
        <section
          class="hardy-delete-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="hardy-delete-dialog-title"
        >
          <div class="hardy-delete-dialog-icon" aria-hidden="true">!</div>
          <h2 id="hardy-delete-dialog-title">真的要删除这篇文章吗?</h2>
          <p>删除以后您无法找回</p>
          <p v-if="error" class="hardy-delete-dialog-error" role="alert">{{ error }}</p>
          <div class="hardy-delete-dialog-actions">
            <button
              type="button"
              class="hardy-button primary hardy-delete-confirm"
              :disabled="deleting"
              @click="confirmDelete"
            >
              {{ deleting ? "删除中..." : "确定" }}
            </button>
            <button
              type="button"
              class="hardy-button hardy-delete-cancel"
              :disabled="deleting"
              @click="closeDeleteDialog"
            >
              取消
            </button>
          </div>
        </section>
      </div>

      <div
        v-if="attachmentPickerOpen"
        class="hardy-attachment-dialog-container"
        :class="{ 'hardy-attachment-dialog-container--dark': editorColorScheme === 'dark' }"
        role="presentation"
        tabindex="-1"
        @keydown.esc="closeAttachmentPicker"
        @mousedown.self="closeAttachmentPicker"
      >
        <section class="hardy-attachment-dialog" role="dialog" aria-modal="true" aria-labelledby="hardy-attachment-dialog-title">
          <header class="hardy-attachment-dialog-header">
            <h2 id="hardy-attachment-dialog-title">选择文章封面</h2>
            <button type="button" class="hardy-dialog-close" aria-label="关闭" @click="closeAttachmentPicker">×</button>
          </header>
          <div class="hardy-attachment-dialog-toolbar">
            <input v-model="attachmentKeyword" class="hardy-input" type="search" placeholder="搜索附件名称" />
            <button type="button" class="hardy-button" :disabled="attachmentLoading" @click="loadAttachments">刷新附件</button>
          </div>
          <p v-if="attachmentError" class="hardy-attachment-error" role="alert">{{ attachmentError }}</p>
          <div v-if="attachmentLoading" class="hardy-attachment-empty">正在加载附件...</div>
          <div v-else-if="!filteredAttachments.length" class="hardy-attachment-empty">暂无可用图片附件</div>
          <div v-else class="hardy-attachment-grid">
            <button
              v-for="attachment in filteredAttachments"
              :key="attachment.metadata.name"
              type="button"
              class="hardy-attachment-item"
              :title="attachmentName(attachment)"
              @click="selectAttachment(attachment)"
            >
              <img :src="attachmentUrl(attachment)" :alt="attachmentName(attachment)" loading="lazy" />
              <span>{{ attachmentName(attachment) }}</span>
            </button>
          </div>
        </section>
      </div>

      <div
        v-if="tagPickerOpen"
        class="hardy-attachment-dialog-container hardy-tag-picker-container"
        :class="{ 'hardy-attachment-dialog-container--dark': editorColorScheme === 'dark' }"
        role="presentation"
        tabindex="-1"
        @keydown.esc="closeTagPicker"
        @mousedown.self="closeTagPicker"
      >
        <section
          class="hardy-attachment-dialog hardy-tag-picker-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="hardy-tag-picker-title"
        >
          <header class="hardy-attachment-dialog-header">
            <h2 id="hardy-tag-picker-title">选择标签</h2>
            <button type="button" class="hardy-dialog-close" aria-label="关闭" @click="closeTagPicker">×</button>
          </header>
          <div class="hardy-tag-picker-toolbar">
            <label class="hardy-tag-picker-search">
              <span aria-hidden="true">⌕</span>
              <input
                v-model="tagPickerKeyword"
                class="hardy-input"
                type="search"
                placeholder="搜索全部标签"
                autofocus
              />
            </label>
            <span class="hardy-tag-picker-count">已选标签（{{ tagPickerSelectionCount }}）</span>
          </div>
          <div v-if="optionsError" class="hardy-attachment-error" role="alert">{{ optionsError }}</div>
          <div v-if="!filteredTags.length" class="hardy-attachment-empty">
            {{ tagPickerKeyword ? "没有匹配的标签" : "暂无标签" }}
          </div>
          <div v-else class="hardy-tag-picker-list">
            <h3>全部标签</h3>
            <div class="hardy-tag-picker-options">
              <button
                v-for="tag in filteredTags"
                :key="tag.metadata.name"
                type="button"
                class="hardy-tag-picker-option"
                :class="{ selected: isTagSelected(tag.metadata.name) }"
                :aria-pressed="isTagSelected(tag.metadata.name)"
                @click="toggleTagSelection(tag.metadata.name)"
              >
                <span>{{ displayName(tag) }}</span>
                <span class="hardy-tag-picker-check" aria-hidden="true">✓</span>
              </button>
            </div>
          </div>
          <footer class="hardy-tag-picker-footer">
            <button type="button" class="hardy-button" @click="closeTagPicker">取消</button>
            <button type="button" class="hardy-button primary" @click="confirmTagPicker">确认</button>
          </footer>
        </section>
      </div>
    </Teleport>
  </main>
</template>
