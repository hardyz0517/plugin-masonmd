import { definePlugin } from "@halo-dev/ui-shared";
import { defineAsyncComponent } from "vue";
import { VLoading } from "@halo-dev/components";

const ucPostEditor = defineAsyncComponent({
  loader: () => import("./components/uc-post-editor.vue"),
  loadingComponent: VLoading,
});

export default definePlugin({
  ucRoutes: [
    {
      path: "/masonmd-editor",
      name: "MasonMarkdownPostEditor",
      component: ucPostEditor,
      meta: {
        title: "新建文章 - Mason Markdown",
        permissions: ["uc:posts:manage"],
        hideFooter: true,
      },
    },
    {
      path: "/hardy-post-editor",
      name: "HardyPostEditor",
      component: ucPostEditor,
      meta: {
        title: "新建文章 - Mason Markdown",
        permissions: ["uc:posts:manage"],
        hideFooter: true,
      },
    },
  ],
  extensionPoints: {
    "editor:create": () => {
      return [
        {
          name: "bytemd",
          displayName: "Mason Markdown",
          component: defineAsyncComponent({
            loader: () => import("./components/bytemd.vue"),
            loadingComponent: VLoading,
          }),
          rawType: "markdown",
          logo: "/plugins/PluginBytemd/assets/logo.png",
        },
      ];
    },
  },
});
