import { definePlugin } from "@halo-dev/ui-shared";
import { defineAsyncComponent } from "vue";
import { VLoading } from "@halo-dev/components";

export default definePlugin({
  ucRoutes: [
    {
      path: "/hardy-post-editor",
      name: "HardyPostEditor",
      component: defineAsyncComponent({
        loader: () => import("./components/uc-post-editor.vue"),
        loadingComponent: VLoading,
      }),
      meta: {
        title: "新建文章",
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
          displayName: "ByteMD",
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
