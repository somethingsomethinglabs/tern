import { mountApp } from "@tern/app";
import type { Bridge } from "@tern/core/contracts";

declare global {
  interface Window {
    tern: Bridge;
  }
}

mountApp(document.getElementById("root")!, window.tern);
