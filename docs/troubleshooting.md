# Mason Markdown 排错指南

## 先收集信息

报告问题时请提供：

- Halo 版本、插件版本和浏览器版本
- 问题发生的页面：Console 编辑器、UC 编辑页或文章页
- 最小 Markdown 示例
- 浏览器控制台和 Network 中失败请求的状态码
- 是否同时安装了 `plugin-katex`、Shiki 或其他内容渲染插件

## 公式重复渲染

当前插件会生成 Mason Markdown 的 KaTeX 内容。若同时使用 `plugin-katex`，不要让它再次处理 `.mason-math-*` 内容。

排查顺序：

1. 查看文章 HTML 是否已经包含 `.katex`。
2. 暂时关闭主题或其他公式插件的二次处理规则。
3. 清理浏览器缓存后重新打开文章。
4. 不要直接对已经生成的 KaTeX HTML 再次调用 `renderMathInElement`。

## 文章页资源 404

当前发布资源的前缀是：

```text
/plugins/PluginMasonMarkdown/assets/ui/published/
```

例如样式资源为：

```text
/plugins/PluginMasonMarkdown/assets/ui/published/mason-markdown.css
```

检查以下项目：

1. Halo 中插件处于启用状态。
2. 请求路径没有使用旧的 `/assets/static/` 前缀。
3. 已安装的 JAR 版本与页面缓存参数一致。
4. 反向代理没有拦截 `/plugins/PluginMasonMarkdown/` 静态资源。

## Mermaid 错位、过大或不显示

- 代码围栏语言必须是 `mermaid`。
- 先确认编辑器预览和文章页是否都异常。
- 文章页应加载插件提供的 `mermaid-layout-normalizer.js`。
- 主题不要对文章内容中的 `svg`、`foreignObject`、`pre` 和 `code` 设置破坏性全局尺寸或 `display` 规则。
- Mermaid 解析失败时应退回源码代码块；如果源码也消失，记录原始 Markdown 和文章 HTML。

## 表格错位或合并异常

先用普通 GFM 表格验证基础渲染，再单独验证 Cute Table 和合并标记。非法或无法组成矩形表格的合并拓扑应安全降级为普通表格，不要直接编辑文章 HTML 作为修复方式。

完整输入样例位于 [Mason Markdown 全语法测试文档](./compatibility/mason-markdown-all-syntax-test.md)。

## 保存冲突、登录失效和权限错误

- `401`：重新登录并确认 UC 会话仍有效。
- `403`：检查 `uc:posts:manage`；发布或取消发布还需 `uc:posts:publish`。
- `409`：页面会尝试读取最新草稿并重放当前编辑内容；仍失败时手动保存或刷新后重试。
- `5xx` 或网络错误：不要关闭当前页面，确认正文仍在编辑区后重试。

前端隐藏按钮不是权限边界，最终权限由 Halo 服务端 API 校验。

## 主题样式覆盖

插件文章样式由 Mason Markdown 的页面头部处理器注入。样式资源名为 `mason-markdown.css`，文章语义类统一使用 `mason-*`。若某个主题仍然显示异常，使用开发者工具检查主题是否覆盖了表格、代码块、列表、公式或 Mermaid 的通用选择器。

不要把插件的文章渲染逻辑复制到主题模板或主题 JS 中；修复应优先落在插件的共享 Markdown 管线或文章内容处理边界。
