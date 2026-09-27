import { mount, unmount } from "svelte";
import App from "./App.svelte";
import type { Bridge } from "@tern/core/contracts";

export function mountApp(element: HTMLElement, bridge: Bridge) {
  const app = mount(App, { target: element, props: { bridge } });
  return () => unmount(app);
}
