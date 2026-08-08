/// <reference types="@rsbuild/core" />

declare module "*.vue" {
  import Vue from "vue";
  export default Vue;
}

declare module "@susisu/mte-kernel" {
  export const Alignment: {
    readonly NONE: string;
    readonly LEFT: string;
    readonly RIGHT: string;
    readonly CENTER: string;
  };
  export class TableEditor {
    constructor(textEditor: object);
  }
  export function options<T extends Record<string, unknown>>(options: T): T;
}

declare module "@bytemd/vue-next" {
  import type { DefineComponent } from "vue";

  export const Editor: DefineComponent<Record<string, unknown>, object, object>;
  export const Viewer: DefineComponent<Record<string, unknown>, object, object>;
}

declare module "@halo-dev/api-client" {
  import type { AxiosInstance } from "axios";

  export const axiosInstance: AxiosInstance;
  export const consoleApiClient: any;
  export const ucApiClient: any;
}
