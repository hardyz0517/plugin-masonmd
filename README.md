# Mason Markdown

面向 Halo 的现代 Markdown 写作工作台：提供 GFM 与 Mason Markdown 扩展语法、KaTeX 公式、Mermaid、代码高亮、表格合并，以及独立的 UC 文章编辑页。

[![CI](https://github.com/hardyz0517/plugin-masonmd/actions/workflows/ci.yaml/badge.svg)](https://github.com/hardyz0517/plugin-masonmd/actions/workflows/ci.yaml)
[![Latest Release](https://img.shields.io/github/v/release/hardyz0517/plugin-masonmd)](https://github.com/hardyz0517/plugin-masonmd/releases)
[![License](https://img.shields.io/github/license/hardyz0517/plugin-masonmd)](./LICENSE)
[![Halo](https://img.shields.io/badge/Halo-%3E%3D2.25.0-5a67d8)](https://www.halo.run/)

[用户指南](./docs/user-guide.md) · [排错指南](./docs/troubleshooting.md) · [全语法测试](./docs/compatibility/bytemd-all-syntax-test.md) · [Halo 应用市场](https://www.halo.run/store/apps/app-HTyhC)

<p align="center">
  <img src="./images/preview.png" alt="Mason Markdown 编辑器预览" width="960" />
</p>

## 项目定位

Mason Markdown 有两种使用方式：

- **Console 编辑器扩展**：在 Halo 原生文章编辑器中切换到 Mason Markdown。
- **独立 UC 编辑页**：访问 `/uc/masonmd-editor`，使用全屏文章工作台完成新建、保存和发布。

Mason Markdown 是插件的用户界面品牌。为兼容已有 Halo 安装，内部插件身份、底层 ByteMD 依赖和 `bytemd-` 资源前缀保持稳定；已有文章可以直接升级，同时提供新的 `/uc/masonmd-editor` 入口。

## 核心能力

| 能力 | 说明 |
| --- | --- |
| Markdown 编辑 | CodeMirror 编辑区、工具栏、全屏、行号和当前行状态 |
| GFM | 标题、列表、任务列表、表格、脚注、删除线、自动链接等 |
| Mason Markdown 扩展 | `bytemd-v1` 兼容管线、提示块、对齐、题注、Cute Table 和单元格合并 |
| 数学公式 | `$...$` 行内公式和 `$$...$$` 块级公式，使用打包的 KaTeX 资源 |
| Mermaid | Mermaid 图表渲染、尺寸规范化和失败时的安全降级 |
| 代码块 | Prism 语法高亮、语言识别、可选行号和长行换行 |
| Halo 内容 | 分类、标签、封面、公开/私有、置顶、草稿和发布 |
| 附件 | 图片、链接和封面支持从 Halo 附件库选择或上传本地文件 |
| 编辑体验 | 五分钟自动保存、自动保存历史、未保存离开提示和亮暗模式同步 |

## 兼容性

| 项目 | 要求 |
| --- | --- |
| Halo | `>= 2.25.0` |
| Java | 21（仅从源码构建需要） |
| Node.js | 20（CI 使用的版本） |
| pnpm | 10（锁定文件使用 pnpm 10） |
| UC 编辑权限 | `uc:posts:manage` |
| UC 发布权限 | `uc:posts:publish`（仅发布或取消发布需要） |

Markdown 兼容性以 [`bytemd-v1` 全语法测试文档](./docs/compatibility/bytemd-all-syntax-test.md) 和 [兼容性规格](./docs/bytemd-markdown-compatibility-spec.md) 为准。Frontmatter 目前不是该兼容配置的一部分，不应仅根据编辑区的语法着色判断它已被解析。

## 安装

### 从 GitHub Releases 安装

1. 打开 [Releases](https://github.com/hardyz0517/plugin-masonmd/releases)，下载对应版本的 JAR 文件。
2. 在 Halo Console 的插件管理页面上传并安装 JAR。
3. 安装或升级完成后，刷新浏览器；如果编辑器资源仍是旧版本，执行一次强制刷新。

### 从 Halo 应用市场安装

也可以从 [Halo 应用市场](https://www.halo.run/store/apps/app-HTyhC) 安装。插件要求 Halo `2.25.0` 或更高版本。

## 快速使用

### Console 编辑器

进入 Halo 文章新建或编辑页面，在编辑器切换菜单中选择 **Mason Markdown**。

### 独立 UC 编辑页

打开站点的：

```text
/uc/masonmd-editor
```

旧入口 `/uc/hardy-post-editor` 会继续保留，用于兼容已有书签和主题链接。

访问该页面需要 `uc:posts:manage`。保存后，页面会使用 Halo UC Post API 保存草稿；公开文章的发布和取消发布还需要 `uc:posts:publish`。分类和标签来自 Halo 后台数据，附件上传也走 Halo UC 附件接口。

更多操作说明见 [用户指南](./docs/user-guide.md)。

## Markdown 支持

### 标准语法

插件以 CommonMark/GFM 为基础，支持常见的标题、强调、引用、列表、任务列表、链接、图片、代码块、表格、脚注、删除线和自动链接。

### Mason Markdown 扩展

Mason Markdown 兼容管线目前覆盖以下方向：

- 提示块：`info`、`success`、`warning`、`error`
- 文本对齐和题注/引文
- GFM 表格、Cute Table 和受控的单元格合并
- 代码块语言、元信息、语法高亮和长行布局
- 行内公式与块级公式
- Mermaid 图表及安全降级

完整可复制的测试内容、异常输入和安全边界见 [Mason Markdown 全语法测试文档](./docs/compatibility/bytemd-all-syntax-test.md)。

### 文章页渲染

编辑器预览和文章页使用共享的 Markdown 兼容管线。插件会随 JAR 发布文章页所需的语义样式、KaTeX 样式和 Mermaid 布局资源，不需要修改主题模板或主题 JS。主题的全局 CSS 仍可能覆盖文章内容样式，遇到渲染差异时请先看 [排错指南](./docs/troubleshooting.md)。

## 常见问题

### 公式被渲染两次

当前版本已经内置 KaTeX 文章页渲染。若同时安装 `plugin-katex`，不要把本插件生成的 `bytemd-math-inline` 或 `bytemd-math-display` 加入它的选择器，否则可能触发二次渲染。旧的 `.math-inline` / `.math-display` 快照会由插件在文章内容处理阶段迁移。

### 文章页资源 404

插件资源路径位于：

```text
/plugins/PluginBytemd/assets/ui/published/
```

不要使用旧的 `/assets/static/` 路径。请先确认插件已启用，再检查浏览器是否缓存了旧 HTML；升级后执行强制刷新。

### Mermaid 尺寸或布局异常

先确认代码块语言写为 `mermaid`，再清理页面缓存并重新保存文章。渲染失败时插件会保留可读的 Mermaid 源码代码块；主题若对 `svg`、`foreignObject` 或 `pre` 设置全局样式，也可能影响最终布局。

### 保存失败、冲突或无权限

确认当前登录状态和 UC 权限。保存失败不会擅自覆盖本地编辑内容；网络恢复后可以手动重试。完整排查步骤见 [排错指南](./docs/troubleshooting.md)。

## 开发

### 获取源码

```bash
git clone https://github.com/hardyz0517/plugin-masonmd.git
cd plugin-masonmd
```

### 前置环境

- Java 21
- Node.js 20
- pnpm 10
- Docker（使用 Halo 本地开发服务器时需要）

### 前端检查和构建

```bash
cd console
pnpm install --frozen-lockfile
pnpm run type-check
pnpm run test:unit
pnpm run build
```

### Gradle 打包

```bash
cd ..
./gradlew build       # macOS / Linux
./gradlew.bat build   # Windows
```

产物位于 `build/libs/`。本地启动 Halo 开发环境：

```bash
./gradlew haloServer       # macOS / Linux
./gradlew.bat haloServer   # Windows
```

## 代码结构

| 目录 | 职责 |
| --- | --- |
| `console/src/components` | Console 编辑器和 UC 编辑页面 |
| `console/src/markdown` | 共享 Markdown 解析、转换和渲染管线 |
| `console/src/styles` | 编辑器、文章内容和主题样式 |
| `src/main/java` | Halo 插件生命周期、文章页内容处理和资源注入 |
| `docs/compatibility` | 语法测试文档和兼容性基线 |

提交前至少运行 `pnpm run type-check`、`pnpm run test:unit`、`pnpm run build` 和 `./gradlew build`。

## 文档

- [用户指南](./docs/user-guide.md)
- [排错指南](./docs/troubleshooting.md)
- [Mason Markdown 全语法测试文档](./docs/compatibility/bytemd-all-syntax-test.md)
- [兼容性规格](./docs/bytemd-markdown-compatibility-spec.md)
- [兼容性实现计划](./docs/bytemd-markdown-compatibility-implementation-plan.md)

## 贡献

提交 Issue 或 Pull Request 时，请附上 Halo 版本、插件版本、浏览器、最小复现 Markdown，以及问题发生在编辑器预览还是文章页。涉及渲染问题时，最好同时提供最终 HTML 和截图。

## License

[GPL-3.0](./LICENSE)

Mason Markdown 当前使用 [ByteMD](https://github.com/bytedance/bytemd) 作为底层编辑器基础，并使用 Halo 官方 API 和插件扩展机制完成集成。
