import { PLUGIN_CHANNEL, PLUGIN_RELOAD_CHANNEL } from "./constants";
import { pluginEvaluationSource } from "./plugin-source";

declare const __KLACK_RENDERER_SOURCE__: string;
declare const __KLACK_VERSION__: string;

type PluginPayload = {
  plugins: Array<{ name: string; source: string }>;
  version: string;
};

type ElectronRendererModule = {
  contextBridge: {
    exposeInMainWorld(name: string, value: unknown): void;
  };
  ipcRenderer: {
    on(channel: string, listener: (_event: unknown, payload: unknown) => void): void;
    sendSync(channel: string): unknown;
  };
  webFrame: {
    executeJavaScript(source: string): Promise<unknown>;
  };
};

const { contextBridge, ipcRenderer, webFrame } = require("electron") as ElectronRendererModule;

function normalizePayload(received: unknown): PluginPayload {
  const candidate = received as Partial<PluginPayload> | undefined;
  return {
    plugins: Array.isArray(candidate?.plugins) ? candidate.plugins : [],
    version: typeof candidate?.version === "string" ? candidate.version : __KLACK_VERSION__,
  };
}

const payload = normalizePayload(ipcRenderer.sendSync(PLUGIN_CHANNEL));

contextBridge.exposeInMainWorld(
  "KlackNative",
  Object.freeze({
    version: payload.version,
  }),
);

async function evaluatePlugins(payload: PluginPayload): Promise<void> {
  for (const plugin of payload.plugins) {
    if (typeof plugin?.name !== "string" || typeof plugin?.source !== "string") continue;

    try {
      await webFrame.executeJavaScript(pluginEvaluationSource(plugin));
    } catch (error) {
      console.error(`[Klack] Failed to evaluate ${plugin.name}`, error);
    }
  }
}

async function injectKlack(): Promise<void> {
  await webFrame.executeJavaScript(__KLACK_RENDERER_SOURCE__);
  await evaluatePlugins(payload);
}

async function reloadPlugins(received: unknown): Promise<void> {
  const next = normalizePayload(received);
  await webFrame.executeJavaScript("globalThis.Klack.resetPlugins()");
  await evaluatePlugins(next);
  console.info(`[Klack] Hot reloaded ${next.plugins.length} plugin(s)`);
}

let injectionQueue = Promise.resolve();

function enqueueInjection(operation: () => Promise<void>): void {
  injectionQueue = injectionQueue.then(operation, operation).catch((error) => {
    console.error("[Klack] Renderer injection failed", error);
  });
}

ipcRenderer.on(PLUGIN_RELOAD_CHANNEL, (_event, nextPayload) => {
  enqueueInjection(() => reloadPlugins(nextPayload));
});

enqueueInjection(injectKlack);
