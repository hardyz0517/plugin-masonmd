<script setup lang="ts">
import { Editor } from "@bytemd/vue-next";
import {
  markdownTable,
  luoguToolbarIcons,
} from "../plugins";
import type { LuoguToolbarIcon } from "../plugins";
import type { BytemdEditorContext, BytemdPlugin } from "bytemd";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { AttachmentLike } from "@halo-dev/ui-shared";
import {
  axiosInstance,
  consoleApiClient,
  ucApiClient,
} from "@halo-dev/api-client";
import type { AxiosResponse } from "axios";
import bytemdLocale from "bytemd/locales/zh_Hans.json";
import "bytemd/dist/index.css";
import "github-markdown-css/github-markdown-light.css";
import "katex/dist/katex.min.css";
import { contentAnnotations } from "../constants/content-annotations";
import { createMarkdownRuntime } from "../markdown/pipeline";
import { createMarkdownRenderCoordinator } from "../markdown/render-coordinator";
import { codeLanguages } from "../markdown/language-registry";
import {
  createLuoguTableCells,
  serializeLuoguTable,
} from "../editor/table-source-model";
import type { LuoguTableCell } from "../editor/table-source-model";
import {
  createEditorContextBridge,
  markdownModeConfig,
} from "../editor/editor-context";
import {
  createAttachmentToolbarPlugin,
  createBytemdEditorPlugins,
} from "../editor/bytemd-plugin-adapter";
import {
  clampTableSize as clampTableSizeCommand,
  findTableCellOwner as findTableCellOwnerCommand,
  getTableSelectionRect,
  isTableCellSelected as isTableCellSelectedCommand,
  mergeTableCells,
  splitTableCell,
} from "../editor/table-commands";
import type { TablePoint, TableSelectionRect } from "../editor/table-commands";
import "../styles/main.scss";

defineOptions({ name: "ByteMdEditor" });

type LuoguToolbarButton = {
  title: string;
  icon: LuoguToolbarIcon;
  action: () => void | Promise<void>;
  disabled?: boolean;
};

type TableCell = LuoguTableCell;

type AutosaveRecord = {
  id: string;
  savedAt: string;
  pagePath: string;
  raw: string;
};

const markdownRuntime = createMarkdownRuntime("luogu-v1");
const editorContextBridge = createEditorContextBridge({
  insertTable: () => insertTable(),
  insertLink: () => insertLink(),
  insertImage: () => insertImages(),
});
const { activeEditorContext, isEditorFullscreen } = editorContextBridge;
const createPlugins = (useVimKeymap = false): BytemdPlugin[] =>
  createBytemdEditorPlugins({
    runtime: markdownRuntime,
    contextPlugin: editorContextBridge.plugin,
    attachmentPlugin: createAttachmentToolbarPlugin((context) => {
      activeEditorContext.value = context;
      attachmentSelectorModal.value = true;
    }),
    tablePlugin: markdownTable(),
    useVimKeymap,
  });

const renderCoordinator = createMarkdownRenderCoordinator("luogu-v1");

const editorConfig = {
  fixedGutter: false,
  lineWrapping: true,
  lineNumbers: true,
  mode: markdownModeConfig,
};

const DEFAULT_TABLE_ROWS = 1;
const DEFAULT_TABLE_COLUMNS = 1;
const MAX_TABLE_SIZE = 100;

const createTableCells = (rows: number, columns: number): TableCell[][] =>
  createLuoguTableCells(rows, columns);

const plugins = ref<BytemdPlugin[]>(createPlugins());
let contentRenderVersion = 0;

const VIM_KEYMAP_NAME = "vim";

const props = defineProps({
  raw: {
    type: String,
    required: false,
    default: "",
  },
  content: {
    type: String,
    required: false,
    default: "",
  },
});

const emit = defineEmits<{
  (event: "update:raw", value: string): void;
  (event: "update:content", value: string): void;
  (event: "update", value: string): void;
}>();

const editorValue = ref(props.raw);
const characterCount = computed(() => Array.from(editorValue.value).length);
const lineCount = computed(() => editorValue.value.split("\n").length);
const lastSavedAt = ref<Date>();
const AUTOSAVE_HISTORY_STORAGE_KEY = "plugin-bytemd:autosave-history:v1";
const MAX_AUTOSAVE_RECORDS = 20;
const autosaveDialogOpen = ref(false);
const autosaveRecords = ref<AutosaveRecord[]>([]);
const selectedAutosaveRecordId = ref<string>();

const formatTimePart = (value: number) => String(value).padStart(2, "0");
const formatSavedTime = (value: Date) =>
  [value.getHours(), value.getMinutes(), value.getSeconds()]
    .map(formatTimePart)
    .join(":");
const formatAutosaveTime = (value: string) => {
  const savedAt = new Date(value);

  if (Number.isNaN(savedAt.getTime())) {
    return "--";
  }

  return `${savedAt.getFullYear()}/${savedAt.getMonth() + 1}/${savedAt.getDate()} ${formatSavedTime(savedAt)}`;
};
const lastSavedTime = computed(() =>
  lastSavedAt.value ? formatSavedTime(lastSavedAt.value) : "--"
);
const selectedAutosaveRecord = computed(() =>
  autosaveRecords.value.find(
    (record) => record.id === selectedAutosaveRecordId.value
  )
);

const draftContentPath =
  /^\/apis\/(?:api\.console\.halo\.run\/v1alpha1\/(?:posts|singlepages)|uc\.api\.content\.halo\.run\/v1alpha1\/posts)\/?$/;
const contentUpdatePath =
  /^\/apis\/(?:api\.console\.halo\.run\/v1alpha1\/(?:posts|singlepages)\/[^/]+\/content|uc\.api\.content\.halo\.run\/v1alpha1\/posts\/[^/]+\/draft)\/?$/;

const getRequestPath = (url: string) => {
  try {
    return new URL(url, window.location.origin).pathname;
  } catch {
    return "";
  }
};

const isContentSaveResponse = (response: AxiosResponse) => {
  const method = response.config.method?.toLowerCase();
  const url = response.config.url;

  if (!method || !url) {
    return false;
  }

  const path = getRequestPath(url);
  return (
    (method === "post" && draftContentPath.test(path)) ||
    (method === "put" && contentUpdatePath.test(path))
  );
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const parseRequestData = (data: unknown) => {
  if (typeof data !== "string") {
    return data;
  }

  try {
    return JSON.parse(data) as unknown;
  } catch {
    return undefined;
  }
};

const getRawFromRequestPart = (value: unknown): string | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  if (typeof value.raw === "string") {
    return value.raw;
  }

  if (isRecord(value.content) && typeof value.content.raw === "string") {
    return value.content.raw;
  }

  if (!isRecord(value.metadata) || !isRecord(value.metadata.annotations)) {
    return undefined;
  }

  const contentJson = value.metadata.annotations[contentAnnotations.CONTENT_JSON];
  if (typeof contentJson !== "string") {
    return undefined;
  }

  try {
    const content = JSON.parse(contentJson) as unknown;
    return isRecord(content) && typeof content.raw === "string"
      ? content.raw
      : undefined;
  } catch {
    return undefined;
  }
};

const getResponseRaw = (response: AxiosResponse) => {
  const requestData = parseRequestData(response.config.data);
  const requestParts = isRecord(requestData)
    ? [requestData, requestData.post, requestData.snapshot]
    : [requestData];

  for (const requestPart of requestParts) {
    const raw = getRawFromRequestPart(requestPart);
    if (raw !== undefined) {
      return raw;
    }
  }

  return editorValue.value;
};

const getCurrentPagePath = () =>
  `${window.location.pathname}${window.location.search}${window.location.hash}`;

const getAutosavePagePath = (response: AxiosResponse) => {
  const responseData = response.data;
  const permalink =
    isRecord(responseData) && isRecord(responseData.status)
      ? responseData.status.permalink
      : undefined;

  if (typeof permalink !== "string" || !permalink) {
    return getCurrentPagePath();
  }

  try {
    const url = new URL(permalink, window.location.origin);
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return getCurrentPagePath();
  }
};

const isAutosaveRecord = (value: unknown): value is AutosaveRecord => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.savedAt === "string" &&
    !Number.isNaN(new Date(value.savedAt).getTime()) &&
    typeof value.pagePath === "string" &&
    typeof value.raw === "string"
  );
};

const readAutosaveRecords = () => {
  try {
    const savedRecords = window.localStorage.getItem(
      AUTOSAVE_HISTORY_STORAGE_KEY
    );

    if (!savedRecords) {
      return [];
    }

    const parsedRecords = JSON.parse(savedRecords) as unknown;
    if (!Array.isArray(parsedRecords)) {
      return [];
    }

    return parsedRecords
      .filter(isAutosaveRecord)
      .sort(
        (first, second) =>
          new Date(second.savedAt).getTime() - new Date(first.savedAt).getTime()
      )
      .slice(0, MAX_AUTOSAVE_RECORDS);
  } catch {
    return [];
  }
};

const setAutosaveRecords = (records: AutosaveRecord[]) => {
  autosaveRecords.value = records;

  if (
    !selectedAutosaveRecordId.value ||
    !records.some((record) => record.id === selectedAutosaveRecordId.value)
  ) {
    selectedAutosaveRecordId.value = records[0]?.id;
  }
};

const addAutosaveRecord = (response: AxiosResponse, savedAt: Date) => {
  const newRecord: AutosaveRecord = {
    id: `${savedAt.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    savedAt: savedAt.toISOString(),
    pagePath: getAutosavePagePath(response),
    raw: getResponseRaw(response),
  };
  const records = [newRecord, ...readAutosaveRecords()].slice(
    0,
    MAX_AUTOSAVE_RECORDS
  );

  for (let length = records.length; length > 0; length--) {
    const recordsToStore = records.slice(0, length);

    try {
      window.localStorage.setItem(
        AUTOSAVE_HISTORY_STORAGE_KEY,
        JSON.stringify(recordsToStore)
      );
      setAutosaveRecords(recordsToStore);
      return;
    } catch {
      // Retry with older records removed when local storage is close to quota.
    }
  }
};

const openAutosaveDialog = () => {
  const records = readAutosaveRecords();
  autosaveRecords.value = records;
  selectedAutosaveRecordId.value = records[0]?.id;
  autosaveDialogOpen.value = true;
};

const closeAutosaveDialog = () => {
  autosaveDialogOpen.value = false;
  focusEditor();
};

const restoreAutosaveRecord = () => {
  const record = selectedAutosaveRecord.value;
  const ctx = getEditorContext();

  if (!record || !ctx) {
    return;
  }

  editorValue.value = record.raw;
  ctx.editor.setValue(record.raw);
  autosaveDialogOpen.value = false;
  focusEditor();
};

let saveResponseInterceptorId: number | undefined;

const handleChange = (v: string) => {
  editorValue.value = v;
  emit("update:raw", v);

  if (v !== props.raw) {
    emit("update", v);
  }
};

type UploadContext = "console" | "uc";

const matchesPathPrefix = (pathname: string, prefix: string) => {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
};

const getUploadContext = (): UploadContext => {
  const { pathname } = window.location;

  if (matchesPathPrefix(pathname, "/console")) {
    return "console";
  }

  if (matchesPathPrefix(pathname, "/uc")) {
    return "uc";
  }

  throw new Error(`Unsupported upload context: ${pathname}`);
};

const uploadAttachment = async (file: File, context: UploadContext) => {
  if (context === "console") {
    const { data } =
      await consoleApiClient.storage.attachment.uploadAttachmentForConsole({
        file,
      });
    return data;
  }

  const { data } = await ucApiClient.storage.attachment.uploadAttachmentForUc({
    file,
  });
  return data;
};

const handleUploadImages = async (files: File[]) => {
  const uploadContext = getUploadContext();

  return await Promise.all(
    files.map(async (file) => {
      const data = await uploadAttachment(file, uploadContext);
      const url = data.status?.permalink;

      if (!url) {
        throw new Error("Uploaded attachment has no permalink.");
      }

      return {
        url,
        alt: data.spec.displayName || file.name,
      };
    })
  );
};

const getEditorContext = () => activeEditorContext.value;

const focusEditor = () => {
  getEditorContext()?.editor.focus();
};

const clampHeadingLevel = (level: number) => Math.min(Math.max(level, 1), 6);

const changeHeadingLevel = (offset: number) => {
  const ctx = getEditorContext();
  if (!ctx) {
    return;
  }

  ctx.replaceLines((line) => {
    const indent = line.match(/^\s*/)?.[0] || "";
    const content = line.slice(indent.length);
    const match = content.match(/^(#{1,6})\s+/);
    const text = content.replace(/^(#{1,6})\s+/, "").trim() || "标题";
    const baseLevel = match ? match[1].length : offset > 0 ? 1 : 2;
    const nextLevel = clampHeadingLevel(baseLevel + offset);

    return `${indent}${"#".repeat(nextLevel)} ${text}`;
  });
  focusEditor();
};

const wrapText = (before: string, after?: string) => {
  const ctx = getEditorContext();
  if (!ctx) {
    return;
  }

  ctx.wrapText(before, after);
  focusEditor();
};

const replaceLines = (replace: Parameters<BytemdEditorContext["replaceLines"]>[0]) => {
  const ctx = getEditorContext();
  if (!ctx) {
    return;
  }

  ctx.replaceLines(replace);
  focusEditor();
};

const insertHorizontalRule = () => {
  const ctx = getEditorContext();
  if (!ctx) {
    return;
  }

  ctx.appendBlock("---");
  focusEditor();
};

const linkDialogOpen = ref(false);
const linkUrl = ref("");
const linkText = ref("");
const imageDialogOpen = ref(false);
const imageUrl = ref("");
const imageAlt = ref("");
const imageUploading = ref(false);
const imageUploadError = ref("");

const insertLink = () => {
  const ctx = getEditorContext();
  linkUrl.value = "";
  linkText.value = ctx?.editor.getSelection() || "";
  linkDialogOpen.value = true;
};

const closeLinkDialog = () => {
  linkDialogOpen.value = false;
  focusEditor();
};

const confirmLinkDialog = () => {
  const ctx = getEditorContext();
  const url = linkUrl.value.trim();

  if (!ctx || !url) {
    return;
  }

  const text = linkText.value.trim() || url;
  ctx.editor.replaceSelection(`[${text}](${url})`);
  linkDialogOpen.value = false;
  focusEditor();
};

const insertImages = () => {
  const ctx = getEditorContext();
  imageUrl.value = "";
  imageAlt.value = ctx?.editor.getSelection() || "";
  imageUploadError.value = "";
  imageDialogOpen.value = true;
};

const closeImageDialog = () => {
  imageDialogOpen.value = false;
  imageUploadError.value = "";
  focusEditor();
};

const uploadImageForDialog = async () => {
  const ctx = getEditorContext();
  if (!ctx || imageUploading.value) {
    return;
  }

  const fileList = await ctx.selectFiles({
    accept: "image/*",
    multiple: false,
  });

  if (!fileList?.length) {
    return;
  }

  imageUploading.value = true;
  imageUploadError.value = "";
  try {
    const [image] = await handleUploadImages([fileList[0]]);
    imageUrl.value = image.url;
    if (!imageAlt.value.trim()) {
      imageAlt.value = image.alt;
    }
  } catch (error: unknown) {
    imageUploadError.value =
      error instanceof Error && error.message
        ? error.message
        : "图片上传失败，请重试";
  } finally {
    imageUploading.value = false;
  }
};

const confirmImageDialog = () => {
  const ctx = getEditorContext();
  const url = imageUrl.value.trim();

  if (!ctx || !url) {
    return;
  }

  const alt = imageAlt.value.trim();
  ctx.appendBlock(`![${alt}](${url})`);
  imageDialogOpen.value = false;
  focusEditor();
};

const insertCode = () => {
  const ctx = getEditorContext();
  codeContent.value = ctx?.editor.getSelection() || "";
  codeLanguage.value = "cpp";
  codeDialogOpen.value = true;
};

const codeDialogOpen = ref(false);
const codeLanguage = ref("cpp");
const codeContent = ref("");

const closeCodeDialog = () => {
  codeDialogOpen.value = false;
  focusEditor();
};

const getCodeFence = (content: string) => {
  const fences = content.match(/`{3,}/g) || [];
  const maxFenceLength = fences.reduce(
    (length, fence) => Math.max(length, fence.length),
    2
  );

  return "`".repeat(maxFenceLength + 1);
};

const confirmCodeDialog = () => {
  const ctx = getEditorContext();
  if (!ctx) {
    closeCodeDialog();
    return;
  }

  const fence = getCodeFence(codeContent.value);
  ctx.appendBlock(`${fence}${codeLanguage.value}\n${codeContent.value}\n${fence}`);
  codeDialogOpen.value = false;
  focusEditor();
};

const insertTable = () => {
  openTableDialog();
};

const tableDialogOpen = ref(false);
const tableRows = ref(DEFAULT_TABLE_ROWS);
const tableColumns = ref(DEFAULT_TABLE_COLUMNS);
const tableCells = ref<TableCell[][]>(
  createTableCells(DEFAULT_TABLE_ROWS, DEFAULT_TABLE_COLUMNS)
);
const tableSelectionStart = ref<TablePoint>({ row: 0, column: 0 });
const tableSelectionEnd = ref<TablePoint>({ row: 0, column: 0 });
const tableSelectionDragging = ref(false);

const clampTableSize = (value: number) =>
  clampTableSizeCommand(value, MAX_TABLE_SIZE);

const resetTableCells = (rows: number, columns: number) => {
  tableCells.value = createTableCells(rows, columns);
  tableSelectionStart.value = { row: 0, column: 0 };
  tableSelectionEnd.value = { row: 0, column: 0 };
};

const openTableDialog = () => {
  tableRows.value = DEFAULT_TABLE_ROWS;
  tableColumns.value = DEFAULT_TABLE_COLUMNS;
  resetTableCells(DEFAULT_TABLE_ROWS, DEFAULT_TABLE_COLUMNS);
  tableDialogOpen.value = true;
};

const closeTableDialog = () => {
  tableDialogOpen.value = false;
  tableSelectionDragging.value = false;
  focusEditor();
};

const syncTableSize = () => {
  const rows = clampTableSize(Number(tableRows.value));
  const columns = clampTableSize(Number(tableColumns.value));

  tableRows.value = rows;
  tableColumns.value = columns;
  resetTableCells(rows, columns);
};

const getSelectionRect = (): TableSelectionRect =>
  getTableSelectionRect(tableSelectionStart.value, tableSelectionEnd.value);

const isTableCellSelected = (cell: TableCell) =>
  isTableCellSelectedCommand(cell, getSelectionRect());

const findTableCellOwner = (row: number, column: number) =>
  findTableCellOwnerCommand(tableCells.value, row, column);

const getActiveTableCell = () => {
  const { row, column } = tableSelectionStart.value;
  return findTableCellOwner(row, column);
};

const getActiveTableCellContent = () => getActiveTableCell()?.content || "";

const setActiveTableCellContent = (event: Event) => {
  const cell = getActiveTableCell();
  if (!cell) {
    return;
  }

  cell.content = (event.target as HTMLTextAreaElement).value;
};

const startTableSelection = (cell: TableCell) => {
  tableSelectionStart.value = { row: cell.row, column: cell.column };
  tableSelectionEnd.value = {
    row: cell.row + cell.rowspan - 1,
    column: cell.column + cell.colspan - 1,
  };
  tableSelectionDragging.value = true;
};

const extendTableSelection = (cell: TableCell) => {
  if (!tableSelectionDragging.value) {
    return;
  }

  tableSelectionEnd.value = {
    row: cell.row + cell.rowspan - 1,
    column: cell.column + cell.colspan - 1,
  };
};

const finishTableSelection = () => {
  tableSelectionDragging.value = false;
};

const mergeSelectedTableCells = () => {
  const rect = getSelectionRect();
  if (!mergeTableCells(tableCells.value, rect)) return;
  const targetCell = tableCells.value[rect.minRow][rect.minColumn];
  tableSelectionStart.value = { row: targetCell.row, column: targetCell.column };
  tableSelectionEnd.value = {
    row: targetCell.row + targetCell.rowspan - 1,
    column: targetCell.column + targetCell.colspan - 1,
  };
};

const splitActiveTableCell = () => {
  const cell = getActiveTableCell();
  if (!cell) {
    return;
  }

  const { row, column } = cell;
  splitTableCell(tableCells.value, cell);
  tableSelectionStart.value = { row, column };
  tableSelectionEnd.value = { row, column };
};

const confirmTableDialog = () => {
  const ctx = getEditorContext();
  if (!ctx) {
    closeTableDialog();
    return;
  }

  ctx.appendBlock(serializeLuoguTable(tableCells.value));
  tableDialogOpen.value = false;
  focusEditor();
};

const clickNativeToolbarButton = (path: string, right = true) => {
  const root = getEditorContext()?.root;
  const side = right ? "right" : "left";
  root
    ?.querySelector<HTMLElement>(
      `.bytemd-toolbar-${side} .bytemd-toolbar-icon[bytemd-tippy-path="${path}"]`
    )
    ?.click();
};

const getToolbarButtonTitle = (button: LuoguToolbarButton) => {
  if (button.icon === "fullscreen" && isEditorFullscreen.value) {
    return "退出全屏";
  }

  return button.title;
};

const setEditorView = (view: "write" | "preview") => {
  const root = getEditorContext()?.root;
  const tabs = root?.querySelectorAll<HTMLElement>(
    ".bytemd-toolbar-left .bytemd-toolbar-tab"
  );

  if (tabs?.length) {
    tabs[view === "write" ? 0 : 1]?.click();
    return;
  }

  clickNativeToolbarButton(view === "write" ? "2" : "3");
};

const toolbarLeftGroups: LuoguToolbarButton[][] = [
  [
    {
      title: "提升一级",
      icon: "headingUp",
      action: () => changeHeadingLevel(-1),
    },
    {
      title: "降低一级",
      icon: "headingDown",
      action: () => changeHeadingLevel(1),
    },
    {
      title: "水平线",
      icon: "horizontalRule",
      action: insertHorizontalRule,
    },
  ],
  [
    {
      title: "粗体",
      icon: "bold",
      action: () => wrapText("**"),
    },
    {
      title: "斜体",
      icon: "italic",
      action: () => wrapText("*"),
    },
    {
      title: "删除线",
      icon: "strike",
      action: () => wrapText("~~"),
    },
    {
      title: "数学公式",
      icon: "math",
      action: () => wrapText("$"),
    },
  ],
  [
    {
      title: "链接",
      icon: "link",
      action: insertLink,
    },
    {
      title: "图片",
      icon: "image",
      action: insertImages,
    },
    {
      title: "代码",
      icon: "code",
      action: insertCode,
    },
    {
      title: "表格",
      icon: "table",
      action: insertTable,
    },
  ],
  [
    {
      title: "引用",
      icon: "quote",
      action: () => replaceLines((line) => `> ${line}`),
    },
    {
      title: "无序列表",
      icon: "unorderedList",
      action: () => replaceLines((line) => `- ${line}`),
    },
    {
      title: "有序列表",
      icon: "orderedList",
      action: () => replaceLines((line, index) => `${index + 1}. ${line}`),
    },
    {
      title: "任务列表",
      icon: "taskList",
      action: () => replaceLines((line) => `- [ ] ${line}`),
    },
  ],
];

const toolbarRightGroups: LuoguToolbarButton[][] = [
  [
    {
      title: "仅编辑",
      icon: "writeOnly",
      action: () => setEditorView("write"),
    },
    {
      title: "仅预览",
      icon: "previewOnly",
      action: () => setEditorView("preview"),
    },
    {
      title: "全屏",
      icon: "fullscreen",
      action: () => clickNativeToolbarButton("4"),
    },
  ],
  [
    {
      title: "帮助",
      icon: "help",
      action: () => clickNativeToolbarButton("1"),
    },
    {
      title: "自动保存",
      icon: "clock",
      action: openAutosaveDialog,
    },
  ],
];

onMounted(async () => {
  setAutosaveRecords(readAutosaveRecords());

  // The editor-provider contract has no save callback, so use the host's
  // successful content-save response as the authoritative timestamp source.
  saveResponseInterceptorId = axiosInstance.interceptors.response.use(
    (response) => {
      if (isContentSaveResponse(response)) {
        const savedAt = new Date();
        lastSavedAt.value = savedAt;
        addAutosaveRecord(response, savedAt);
      }

      return response;
    }
  );

  try {
    const { data } = await consoleApiClient.plugin.plugin.fetchPluginJsonConfig(
      {
        name: "PluginBytemd",
      }
    );

    const configMapData = data as Record<string, unknown>;
    const basicConfig = isRecord(configMapData.basic)
      ? configMapData.basic
      : undefined;

    if (basicConfig?.keymap === VIM_KEYMAP_NAME) {
      plugins.value = createPlugins(true);
    }
  } catch {
    // Plugin configuration is optional; keep the default Markdown keymap.
  }
});

onBeforeUnmount(() => {
  if (saveResponseInterceptorId !== undefined) {
    axiosInstance.interceptors.response.eject(saveResponseInterceptorId);
  }
});

watch(
  () => props.raw,
  async (value) => {
    editorValue.value = value;
    const version = ++contentRenderVersion;
    // The host persists update:content as the article HTML. Render this
    // value with the published target so it carries the same content wrapper
    // and semantic markup as the standalone UC save path.
    const result = await renderCoordinator.render(value, "save-html");

    if (version === contentRenderVersion) {
      emit("update:content", result.renderedHtml);
    }
  },
  {
    immediate: true,
  }
);

// attachment selector
const attachmentSelectorModal = ref(false);
const onAttachmentSelect = (attachments: AttachmentLike[]) => {
  if (!attachments.length) {
    return;
  }

  attachments.forEach((attachment) => {
    if (typeof attachment === "string") {
      activeEditorContext.value?.appendBlock(`![](${attachment})`);
    } else if ("url" in attachment) {
      activeEditorContext.value?.appendBlock(
        `![${attachment.alt || attachment.mediaType || "attachment"}](${attachment.url})`
      );
    } else if ("spec" in attachment) {
      const { mediaType, displayName } = attachment.spec;
      const { permalink } = attachment.status || {};

      if (mediaType?.startsWith("image/")) {
        activeEditorContext.value?.appendBlock(`![${displayName}](${permalink})`);
        return;
      }

      if (mediaType?.startsWith("video/")) {
        activeEditorContext.value?.appendBlock(`<video src="${permalink}"></video>`);
        return;
      }

      if (mediaType?.startsWith("audio/")) {
        activeEditorContext.value?.appendBlock(`<audio src="${permalink}"></audio>`);
        return;
      }

      activeEditorContext.value?.appendBlock(`[${displayName}](${permalink})`);
    }
  });

  attachmentSelectorModal.value = false;
  focusEditor();
};
</script>

<template>
  <section
    class="bytemd-wrapper"
    :class="{ 'bytemd-wrapper-fullscreen': isEditorFullscreen }"
  >
    <div class="luogu-bytemd-toolbar">
      <div class="luogu-toolbar-side">
        <span
          v-for="(group, groupIndex) in toolbarLeftGroups"
          :key="`left-${groupIndex}`"
          class="luogu-toolbar-group"
        >
          <button
            v-for="button in group"
            :key="button.title"
            type="button"
            class="luogu-toolbar-tool"
            :class="{ disabled: button.disabled }"
            :aria-label="getToolbarButtonTitle(button)"
            :disabled="button.disabled"
            @click="button.action"
          >
            <span
              class="luogu-toolbar-icon"
              v-html="luoguToolbarIcons[button.icon]"
            />
            <span class="luogu-tooltip">{{ getToolbarButtonTitle(button) }}</span>
          </button>
        </span>
      </div>
      <div class="luogu-toolbar-side">
        <span
          v-for="(group, groupIndex) in toolbarRightGroups"
          :key="`right-${groupIndex}`"
          class="luogu-toolbar-group"
        >
          <button
            v-for="button in group"
            :key="button.title"
            type="button"
            class="luogu-toolbar-tool"
            :class="{ disabled: button.disabled }"
            :aria-label="getToolbarButtonTitle(button)"
            :disabled="button.disabled"
            @click="button.action"
          >
            <span
              class="luogu-toolbar-icon"
              v-html="luoguToolbarIcons[button.icon]"
            />
            <span class="luogu-tooltip">{{ getToolbarButtonTitle(button) }}</span>
          </button>
        </span>
      </div>
    </div>
    <Editor
      class="bytemd-editor-host"
      :value="raw"
      :plugins="plugins"
      :sanitize="markdownRuntime.sanitize"
      :remark-rehype="markdownRuntime.remarkRehype"
      :locale="bytemdLocale"
      :editor-config="editorConfig"
      :upload-images="handleUploadImages"
      @change="handleChange"
    />
    <div class="bytemd-custom-status" aria-live="polite">
      <span>字数: <strong>{{ characterCount }}</strong></span>
      <span>行数: <strong>{{ lineCount }}</strong></span>
      <span>上次保存: <strong>{{ lastSavedTime }}</strong></span>
    </div>
    <div
      v-if="autosaveDialogOpen"
      class="luogu-table-dialog-container luogu-autosave-dialog-container"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bytemd-autosave-dialog-title"
      @keydown.esc="closeAutosaveDialog"
      @mousedown.self="closeAutosaveDialog"
    >
      <div class="cs-dialog cs-autosave-dialog">
        <aside class="cs-autosave-sidebar">
          <div class="cs-dialog-header">
            <span id="bytemd-autosave-dialog-title">自动保存</span>
            <button
              type="button"
              class="cs-close-container"
              aria-label="关闭"
              @click="closeAutosaveDialog"
            >
              <svg
                class="cs-close-button"
                aria-hidden="true"
                viewBox="0 0 384 512"
              >
                <path
                  fill="currentColor"
                  d="M345 137c9.4-9.4 9.4-24.6 0-33.9s-24.6-9.4-33.9 0l-119 119L73 103c-9.4-9.4-24.6-9.4-33.9 0s-9.4 24.6 0 33.9l119 119L39 375c-9.4 9.4-9.4 24.6 0 33.9s24.6 9.4 33.9 0l119-119L311 409c9.4 9.4 24.6 9.4 33.9 0s9.4-24.6 0-33.9l-119-119L345 137z"
                />
              </svg>
            </button>
          </div>
          <div class="cs-autosave-history" aria-label="最近自动保存记录">
            <button
              v-for="record in autosaveRecords"
              :key="record.id"
              type="button"
              class="cs-autosave-record"
              :class="{
                selected: record.id === selectedAutosaveRecordId,
              }"
              :aria-pressed="record.id === selectedAutosaveRecordId"
              :title="record.pagePath"
              @click="selectedAutosaveRecordId = record.id"
            >
              <time>{{ formatAutosaveTime(record.savedAt) }}</time>
              <span>{{ record.pagePath }}</span>
            </button>
            <p v-if="!autosaveRecords.length" class="cs-autosave-empty">
              暂无自动保存记录
            </p>
          </div>
          <div class="cs-autosave-actions">
            <button
              type="button"
              class="cs-dialog-button cs-dialog-button-primary"
              :disabled="!selectedAutosaveRecord"
              @click="restoreAutosaveRecord"
            >
              载入
            </button>
            <button
              type="button"
              class="cs-dialog-button cs-dialog-button-info"
              @click="closeAutosaveDialog"
            >
              取消
            </button>
          </div>
        </aside>
        <section class="cs-autosave-preview">
          <template v-if="selectedAutosaveRecord">
            <h2>
              保存时间 {{ formatAutosaveTime(selectedAutosaveRecord.savedAt) }}
            </h2>
            <h2>保存页面 {{ selectedAutosaveRecord.pagePath }}</h2>
            <pre>{{ selectedAutosaveRecord.raw }}</pre>
          </template>
          <p v-else class="cs-autosave-preview-empty">选择左侧的保存记录查看源码</p>
        </section>
      </div>
    </div>
    <div
      v-if="linkDialogOpen"
      class="luogu-table-dialog-container luogu-simple-dialog-container"
    >
      <form class="cs-dialog" @submit.prevent="confirmLinkDialog">
        <div class="cs-dialog-header">
          插入链接
          <button
            type="button"
            class="cs-close-container"
            aria-label="关闭"
            @click="closeLinkDialog"
          >
            <svg
              class="cs-close-button"
              aria-hidden="true"
              viewBox="0 0 384 512"
            >
              <path
                fill="currentColor"
                d="M345 137c9.4-9.4 9.4-24.6 0-33.9s-24.6-9.4-33.9 0l-119 119L73 103c-9.4-9.4-24.6-9.4-33.9 0s-9.4 24.6 0 33.9l119 119L39 375c-9.4 9.4-9.4 24.6 0 33.9s24.6 9.4 33.9 0l119-119L311 409c9.4 9.4 24.6 9.4 33.9 0s9.4-24.6 0-33.9l-119-119L345 137z"
              />
            </svg>
          </button>
        </div>
        <div class="cs-dialog-item">
          <label class="cs-dialog-item-label" for="bytemd-link-url">
            链接地址
          </label>
          <input
            id="bytemd-link-url"
            v-model="linkUrl"
            class="cs-dialog-item-content"
            type="text"
            inputmode="url"
            placeholder="https://example.com"
            required
          />
        </div>
        <div class="cs-dialog-item">
          <label class="cs-dialog-item-label" for="bytemd-link-text">
            链接文字
          </label>
          <input
            id="bytemd-link-text"
            v-model="linkText"
            class="cs-dialog-item-content"
            type="text"
            placeholder="阅读原文"
          />
        </div>
        <div class="cs-dialog-submit-area">
          <button
            type="submit"
            class="cs-dialog-button cs-dialog-button-primary"
            :disabled="!linkUrl.trim()"
          >
            确认
          </button>
          <button
            type="button"
            class="cs-dialog-button cs-dialog-button-info"
            @click="closeLinkDialog"
          >
            取消
          </button>
        </div>
      </form>
    </div>
    <div
      v-if="imageDialogOpen"
      class="luogu-table-dialog-container luogu-simple-dialog-container"
    >
      <form class="cs-dialog" @submit.prevent="confirmImageDialog">
        <div class="cs-dialog-header">
          插入图片
          <button
            type="button"
            class="cs-close-container"
            aria-label="关闭"
            @click="closeImageDialog"
          >
            <svg
              class="cs-close-button"
              aria-hidden="true"
              viewBox="0 0 384 512"
            >
              <path
                fill="currentColor"
                d="M345 137c9.4-9.4 9.4-24.6 0-33.9s-24.6-9.4-33.9 0l-119 119L73 103c-9.4-9.4-24.6-9.4-33.9 0s-9.4 24.6 0 33.9l119 119L39 375c-9.4 9.4-9.4 24.6 0 33.9s24.6 9.4 33.9 0l119-119L311 409c9.4 9.4 24.6 9.4 33.9 0s9.4-24.6 0-33.9l-119-119L345 137z"
              />
            </svg>
          </button>
        </div>
        <div class="cs-dialog-item">
          <label class="cs-dialog-item-label" for="bytemd-image-url">
            图片地址
          </label>
          <input
            id="bytemd-image-url"
            v-model="imageUrl"
            class="cs-dialog-item-content"
            type="text"
            inputmode="url"
            placeholder="https://example.com/image.png"
            required
          />
        </div>
        <div class="cs-dialog-item">
          <label class="cs-dialog-item-label" for="bytemd-image-alt">
            图片说明
          </label>
          <input
            id="bytemd-image-alt"
            v-model="imageAlt"
            class="cs-dialog-item-content"
            type="text"
            placeholder="图片的替代文字"
          />
        </div>
        <div class="cs-dialog-upload-area">
          <button
            type="button"
            class="cs-dialog-upload-button"
            :disabled="imageUploading"
            @click="uploadImageForDialog"
          >
            {{ imageUploading ? "上传中..." : "上传图片" }}
          </button>
        </div>
        <p v-if="imageUploadError" class="cs-dialog-error" role="alert">
          {{ imageUploadError }}
        </p>
        <div class="cs-dialog-submit-area">
          <button
            type="submit"
            class="cs-dialog-button cs-dialog-button-primary"
            :disabled="!imageUrl.trim() || imageUploading"
          >
            确认
          </button>
          <button
            type="button"
            class="cs-dialog-button cs-dialog-button-info"
            :disabled="imageUploading"
            @click="closeImageDialog"
          >
            取消
          </button>
        </div>
      </form>
    </div>
    <div
      v-if="codeDialogOpen"
      class="luogu-table-dialog-container luogu-code-dialog-container"
    >
      <div class="cs-dialog">
        <div>
          <div class="cs-dialog-header">
            插入代码
            <button
              type="button"
              class="cs-close-container"
              aria-label="关闭"
              @click="closeCodeDialog"
            >
              <svg
                class="cs-close-button"
                aria-hidden="true"
                viewBox="0 0 384 512"
              >
                <path
                  fill="currentColor"
                  d="M345 137c9.4-9.4 9.4-24.6 0-33.9s-24.6-9.4-33.9 0l-119 119L73 103c-9.4-9.4-24.6-9.4-33.9 0s-9.4 24.6 0 33.9l119 119L39 375c-9.4 9.4-9.4 24.6 0 33.9s24.6 9.4 33.9 0l119-119L311 409c9.4 9.4 24.6 9.4 33.9 0s9.4-24.6 0-33.9l-119-119L345 137z"
                />
              </svg>
            </button>
          </div>
          <div>
            <div class="cs-dialog-item">
              <div class="cs-dialog-item-label">选择语言</div>
              <select
                v-model="codeLanguage"
                class="cs-dialog-item-content code-language-select"
              >
                <option
                  v-for="language in codeLanguages"
                  :key="language.value"
                  :value="language.value"
                >
                  {{ language.label }}
                </option>
              </select>
            </div>
            <div class="cs-dialog-item">
              <div class="cs-dialog-item-label code-label">代码</div>
              <textarea
                v-model="codeContent"
                class="cs-dialog-item-content code-content"
              />
            </div>
            <div class="cs-dialog-submit-area">
              <button
                type="button"
                class="cs-dialog-button cs-dialog-button-primary"
                @click="confirmCodeDialog"
              >
                确认
              </button>
              <button
                type="button"
                class="cs-dialog-button cs-dialog-button-info"
                @click="closeCodeDialog"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div
      v-if="tableDialogOpen"
      class="luogu-table-dialog-container"
      @mouseup="finishTableSelection"
      @mouseleave="finishTableSelection"
    >
      <div class="cs-dialog cs-dialog-big">
        <div class="cs-dialog-sidebar">
          <div class="cs-dialog-header">
            插入表格
            <button
              type="button"
              class="cs-close-container"
              aria-label="关闭"
              @click="closeTableDialog"
            >
              <svg
                class="cs-close-button"
                aria-hidden="true"
                viewBox="0 0 384 512"
              >
                <path
                  fill="currentColor"
                  d="M345 137c9.4-9.4 9.4-24.6 0-33.9s-24.6-9.4-33.9 0l-119 119L73 103c-9.4-9.4-24.6-9.4-33.9 0s-9.4 24.6 0 33.9l119 119L39 375c-9.4 9.4-9.4 24.6 0 33.9s24.6 9.4 33.9 0l119-119L311 409c9.4 9.4 24.6 9.4 33.9 0s9.4-24.6 0-33.9l-119-119L345 137z"
                />
              </svg>
            </button>
          </div>
          <div class="cs-dialog-item">
            <div class="cs-dialog-item-label">行数</div>
            <input
              v-model.number="tableRows"
              type="number"
              class="cs-dialog-item-content"
              min="1"
              max="100"
              @change="syncTableSize"
            />
          </div>
          <div class="cs-dialog-item">
            <div class="cs-dialog-item-label">列数</div>
            <input
              v-model.number="tableColumns"
              type="number"
              class="cs-dialog-item-content"
              min="1"
              max="100"
              @change="syncTableSize"
            />
          </div>
          <div class="cs-dialog-item">
            <button
              type="button"
              class="cs-dialog-button cs-dialog-button-info"
              @click="mergeSelectedTableCells"
            >
              合并
            </button>
            <button
              type="button"
              class="cs-dialog-button cs-dialog-button-info"
              @click="splitActiveTableCell"
            >
              拆分
            </button>
          </div>
          <div class="cs-dialog-area">
            <h3>编辑区</h3>
            <textarea
              :value="getActiveTableCellContent()"
              @input="setActiveTableCellContent"
            />
          </div>
          <div class="submit-area">
            <button
              type="button"
              class="cs-dialog-button cs-dialog-button-info"
              @click="closeTableDialog"
            >
              取消
            </button>
            <button
              type="button"
              class="cs-dialog-button cs-dialog-button-primary"
              @click="confirmTableDialog"
            >
              确认
            </button>
          </div>
        </div>
        <div class="cs-dialog-view">
          <table class="cs-dialog-table-editor">
            <tbody>
              <tr v-for="(row, rowIndex) in tableCells" :key="rowIndex">
                <td
                  v-for="cell in row"
                  v-show="!cell.hidden"
                  :key="`${cell.row}-${cell.column}`"
                  :data-x="cell.row"
                  :data-y="cell.column"
                  :colspan="cell.colspan"
                  :rowspan="cell.rowspan"
                  :class="{ selected: isTableCellSelected(cell) }"
                  @mousedown.prevent="startTableSelection(cell)"
                  @mouseenter="extendTableSelection(cell)"
                >
                  {{ cell.content || " " }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
    <AttachmentSelectorModal
      v-if="attachmentSelectorModal"
      @select="onAttachmentSelect"
      @close="attachmentSelectorModal = false"
    />
  </section>
</template>
