import { mountApp } from "@tern/app";
import { registerPlugin } from "@capacitor/core";
import type { PluginListenerHandle } from "@capacitor/core";
import { BrowserApplication, type BrowserEvent, type Platform } from "@tern/core/application";
import type { PageBounds } from "@tern/core/contracts";

interface NativeHost {
  readState(): Promise<{ value: string | null }>;
  writeState(options: { value: string }): Promise<void>;
  open(options: { id: string; url: string }): Promise<void>;
  activate(options: { id: string | null }): Promise<void>;
  navigate(options: { id: string; url: string }): Promise<void>;
  close(options: { id: string }): Promise<void>;
  action(options: { id: string; action: string; text?: string; backward?: boolean }): Promise<void>;
  layout(options: PageBounds): Promise<void>;
  clearCache(): Promise<void>;
  clipboard(options: { text: string }): Promise<void>;
  confirm(options: { message: string }): Promise<{ accepted: boolean }>;
  exit(): Promise<void>;
  setZoom(options: { zoom: number }): Promise<void>;
  addListener(name: "browserEvent", callback: (event: BrowserEvent) => void): Promise<PluginListenerHandle>;
}
const native = registerPlugin<NativeHost>("TernHost");
const platform: Platform = {
  read: async () => (await native.readState()).value,
  write: value => native.writeState({ value }),
  open: page => native.open({ id: page.id, url: page.url }),
  activate: id => native.activate({ id }),
  navigate: (id, url) => native.navigate({ id, url }),
  close: id => native.close({ id }),
  action: (id, action, options = {}) => native.action({ id, action, ...options }),
  layout: bounds => { void native.layout(bounds); },
  clearCache: () => native.clearCache(),
  clipboard: text => native.clipboard({ text }),
  confirm: async message => (await native.confirm({ message })).accepted,
  exit: () => native.exit(),
  setZoom: zoom => native.setZoom({ zoom }),
  listen: async callback => { const handle = await native.addListener("browserEvent", callback); return () => { void handle.remove(); }; },
  id: () => crypto.randomUUID(),
  now: () => Date.now(),
};
async function start() {
try {
  const app = await BrowserApplication.open(platform, {
    capabilities: { mobile: true, extensions: false, localAI: false, snapshots: false, preloadLinks: false, downloadDirectory: false, firstSearchResult: false },
    maxLivePages: 16,
  });
  mountApp(document.getElementById("root")!, app);
} catch (error) {
  document.getElementById("root")!.textContent = `Tern could not start. ${String(error)}`;
}

}
void start();
