import {
  DIAGNOSTIC_CAPTURE_CHANNEL,
  DIAGNOSTIC_COPY_CHANNEL,
  PLUGIN_CHANNEL,
  PLUGIN_RELOAD_CHANNEL,
  THEME_RELOAD_CHANNEL,
} from "./constants";
import { pluginEvaluationSource } from "./plugin-source";

declare const __KLACK_RENDERER_SOURCE__: string;
declare const __KLACK_VERSION__: string;

type PluginPayload = {
  plugins: Array<{ name: string; source: string }>;
  themes: Array<{
    css: string;
    description?: string;
    id: string;
    name: string;
    version?: string;
  }>;
  version: string;
};

type ElectronRendererModule = {
  contextBridge: {
    exposeInMainWorld(name: string, value: unknown): void;
  };
  ipcRenderer: {
    invoke(channel: string, payload?: unknown): Promise<unknown>;
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
    themes: Array.isArray(candidate?.themes) ? candidate.themes : [],
    version: typeof candidate?.version === "string" ? candidate.version : __KLACK_VERSION__,
  };
}

const payload = normalizePayload(ipcRenderer.sendSync(PLUGIN_CHANNEL));

contextBridge.exposeInMainWorld(
  "KlackNative",
  Object.freeze({
    async capturePage(): Promise<string> {
      const result = await ipcRenderer.invoke(DIAGNOSTIC_CAPTURE_CHANNEL);
      if (typeof result !== "string") throw new TypeError("Klack received an invalid screenshot");
      return result;
    },
    async copyDiagnosticImage(imageDataUrl: string): Promise<void> {
      await ipcRenderer.invoke(DIAGNOSTIC_COPY_CHANNEL, imageDataUrl);
    },
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

async function evaluateThemes(themes: PluginPayload["themes"]): Promise<void> {
  await webFrame.executeJavaScript(`globalThis.Klack.loadThemes(${JSON.stringify(themes)})`);
}

async function waitForDocumentHead(): Promise<void> {
  await webFrame.executeJavaScript(`
    new Promise((resolve) => {
      if (document.head) {
        resolve();
        return;
      }

      const observer = new MutationObserver(() => {
        if (!document.head) return;
        observer.disconnect();
        resolve();
      });
      observer.observe(document, { childList: true, subtree: true });
    })
  `);
}

async function injectKlack(): Promise<void> {
  await webFrame.executeJavaScript(__KLACK_RENDERER_SOURCE__);
  await waitForDocumentHead();
  await evaluateThemes(payload.themes);
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

ipcRenderer.on(THEME_RELOAD_CHANNEL, (_event, nextPayload) => {
  const next = normalizePayload(nextPayload);
  enqueueInjection(async () => {
    await evaluateThemes(next.themes);
    console.info(`[Klack] Hot reloaded ${next.themes.length} theme(s)`);
  });
});

enqueueInjection(injectKlack);
