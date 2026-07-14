declare const __KLACK_VERSION__: string;

import {
  definePlugin,
  type Cleanup,
  type KlackApi,
  type KlackButtonOptions,
  type KlackExtension,
  type KlackLegacyPlugin,
  type KlackMountResult,
  type KlackPlugin,
  type KlackPluginDefinition,
  type KlackUiPosition,
  type KlackUiTarget,
} from "./sdk";

type PluginState = {
  plugin: KlackPluginDefinition;
  resources: Set<Cleanup>;
  started: boolean;
};

type KlackGlobal = {
  definePlugin: typeof definePlugin;
  disable(name: string): void;
  enable(name: string): void;
  isEnabled(name: string): boolean;
  list(): Array<{
    description?: string;
    enabled: boolean;
    name: string;
    started: boolean;
    version?: string;
  }>;
  loadPlugin(sourceName: string, extension: unknown): void;
  register(plugin: KlackPluginDefinition): void;
  resetPlugins(): void;
  version: string;
};

declare global {
  interface Window {
    Klack?: KlackGlobal;
    KlackNative?: {
      version?: string;
    };
  }
}

const SETTINGS_KEY = "klack:plugin-overrides";
const states = new Map<string, PluginState>();
let ready = document.readyState !== "loading";

function readOverrides(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") as Record<string, boolean>;
  } catch {
    return {};
  }
}

function writeOverride(name: string, enabled: boolean): void {
  const overrides = readOverrides();
  overrides[name] = enabled;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(overrides));
}

function isEnabled(name: string): boolean {
  const state = states.get(name);
  if (!state) return false;

  const override = readOverrides()[name];
  return typeof override === "boolean" ? override : state.plugin.defaultEnabled !== false;
}

function track(state: PluginState, cleanup: Cleanup): Cleanup {
  let active = true;
  const tracked = (): void => {
    if (!active) return;
    active = false;
    state.resources.delete(tracked);
    cleanup();
  };
  state.resources.add(tracked);
  return tracked;
}

function cleanupResources(state: PluginState): void {
  for (const cleanup of [...state.resources].reverse()) {
    try {
      cleanup();
    } catch (error) {
      console.error(`[Klack] Failed to clean up ${state.plugin.name}`, error);
    }
  }
  state.resources.clear();
}

function addStyle(plugin: string, css: string, id?: string): Cleanup {
  const style = document.createElement("style");
  style.dataset.klackPlugin = plugin;
  if (id) style.dataset.klackStyle = id;
  style.textContent = css;
  (document.head || document.documentElement).append(style);
  return () => style.remove();
}

function resolveTargets(target: KlackUiTarget): Element[] {
  if (typeof target === "string") return Array.from(document.querySelectorAll(target));
  if (target instanceof Element) return [target];

  const resolved = target();
  if (!resolved) return [];
  if (resolved instanceof Element) return [resolved];
  return [...resolved].filter((element): element is Element => element instanceof Element);
}

function watchMutations(reconcile: () => void): Cleanup {
  let active = true;
  let scheduled = false;
  const schedule = (): void => {
    if (!active || scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      if (!active) return;
      reconcile();
    });
  };

  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  return () => {
    active = false;
    observer.disconnect();
  };
}

function observe(selector: string, callback: (element: Element) => void | Cleanup): Cleanup {
  const records = new Map<Element, Cleanup | undefined>();

  const clean = (element: Element, cleanup?: Cleanup): void => {
    try {
      cleanup?.();
    } catch (error) {
      console.error(`[Klack] Failed to clean up observer for ${selector}`, error);
    } finally {
      records.delete(element);
    }
  };

  const reconcile = (): void => {
    const matches = new Set(Array.from(document.querySelectorAll(selector)));

    for (const [element, cleanup] of records) {
      if (element.isConnected && matches.has(element)) continue;
      clean(element, cleanup);
    }

    for (const element of matches) {
      if (records.has(element)) continue;
      const cleanup = callback(element);
      records.set(element, typeof cleanup === "function" ? cleanup : undefined);
    }
  };

  reconcile();
  const stopWatching = watchMutations(reconcile);

  return () => {
    stopWatching();
    [...records].forEach(([element, cleanup]) => clean(element, cleanup));
    records.clear();
  };
}

function insert(element: Element, target: Element, position: KlackUiPosition): void {
  switch (position) {
    case "prepend":
      target.prepend(element);
      break;
    case "before":
      target.before(element);
      break;
    case "after":
      target.after(element);
      break;
    default:
      target.append(element);
  }
}

function mount(
  plugin: string,
  target: KlackUiTarget,
  render: (context: { plugin: string; target: Element }) => KlackMountResult,
  position: KlackUiPosition = "append",
): Cleanup {
  const records = new Map<Element, { cleanup?: Cleanup; element: Element }>();

  const remove = (targetElement: Element): void => {
    const record = records.get(targetElement);
    if (!record) return;
    records.delete(targetElement);
    try {
      record.cleanup?.();
    } catch (error) {
      console.error(`[Klack] Failed to clean up mounted UI for ${plugin}`, error);
    } finally {
      record.element.remove();
    }
  };

  const reconcile = (): void => {
    const targets = new Set(
      resolveTargets(target).filter(
        (element) => element.isConnected && !element.closest("[data-klack-plugin]"),
      ),
    );

    for (const [targetElement, record] of records) {
      if (targets.has(targetElement) && record.element.isConnected) continue;
      remove(targetElement);
    }

    for (const targetElement of targets) {
      if (records.has(targetElement)) continue;

      try {
        const result = render({ plugin, target: targetElement });
        const record = result instanceof Element ? { element: result } : result;
        if (!(record.element instanceof Element)) {
          throw new TypeError("ui.mount() render functions must return an Element");
        }
        record.element.setAttribute("data-klack-plugin", plugin);
        records.set(targetElement, record);
        insert(record.element, targetElement, position);
      } catch (error) {
        console.error(`[Klack] Failed to mount UI for ${plugin}`, error);
      }
    }
  };

  reconcile();
  const stopWatching = watchMutations(reconcile);
  return () => {
    stopWatching();
    [...records.keys()].forEach(remove);
  };
}

function addButton(plugin: string, options: KlackButtonOptions): Cleanup {
  if (!/^[A-Za-z0-9_-]+$/.test(options.id)) {
    throw new TypeError(`Invalid Klack button id: ${options.id}`);
  }

  return mount(
    plugin,
    options.target,
    ({ target }) => {
      const button = document.createElement("button");
      for (const [name, value] of Object.entries(options.attributes || {})) {
        button.setAttribute(name, value);
      }
      button.type = "button";
      button.classList.add("klack-button");
      if (options.className) {
        button.classList.add(...options.className.split(/\s+/).filter(Boolean));
      }
      button.dataset.klackButton = `${plugin}:${options.id}`;
      button.disabled = options.disabled === true;
      button.textContent = options.label;
      if (options.title) button.title = options.title;
      if (options.ariaLabel) button.ariaLabel = options.ariaLabel;

      const onClick = (event: MouseEvent): void => {
        try {
          void Promise.resolve(options.onClick?.(event, { button, plugin, target })).catch((error) => {
            console.error(`[Klack] Button ${plugin}:${options.id} failed`, error);
          });
        } catch (error) {
          console.error(`[Klack] Button ${plugin}:${options.id} failed`, error);
        }
      };
      button.addEventListener("click", onClick);
      return {
        cleanup: () => button.removeEventListener("click", onClick),
        element: button,
      };
    },
    options.position,
  );
}

const KLACK_VERSION = window.KlackNative?.version || __KLACK_VERSION__;

function createPluginApi(state: PluginState): KlackApi {
  const ui = Object.freeze({
    addButton: (options: KlackButtonOptions) => track(state, addButton(state.plugin.name, options)),
    addStyle: (css: string, options?: { id?: string }) =>
      track(state, addStyle(state.plugin.name, css, options?.id)),
    mount: (
      target: KlackUiTarget,
      render: (context: { plugin: string; target: Element }) => KlackMountResult,
      options?: { position?: KlackUiPosition },
    ) => track(state, mount(state.plugin.name, target, render, options?.position)),
    observe: (selector: string, callback: (element: Element) => void | Cleanup) =>
      track(state, observe(selector, callback)),
  });

  return Object.freeze({
    addStyle: (css: string, id?: string) => ui.addStyle(css, { id }),
    logger: console,
    observe: ui.observe,
    ui,
    version: KLACK_VERSION,
  });
}

function start(name: string): void {
  const state = states.get(name);
  if (!state || state.started || !ready || !isEnabled(name)) return;

  try {
    state.started = true;
    const setup = "setup" in state.plugin ? state.plugin.setup : state.plugin.start;
    const cleanup = setup(createPluginApi(state));
    if (typeof cleanup === "function") track(state, cleanup);
    console.info(`[Klack] Started ${name}`);
  } catch (error) {
    cleanupResources(state);
    state.started = false;
    console.error(`[Klack] Failed to start ${name}`, error);
  }
}

function stop(name: string): void {
  const state = states.get(name);
  if (!state?.started) return;

  try {
    cleanupResources(state);
  } finally {
    state.started = false;
  }
}

function defaultPluginName(sourceName: string): string {
  const filename = sourceName.split(/[\\/]/).pop() || "plugin";
  const name = filename.replace(/\.js$/i, "").replace(/[^A-Za-z0-9_-]+/g, "-");
  return name.replace(/^-+|-+$/g, "") || "plugin";
}

const Klack: KlackGlobal = Object.freeze({
  definePlugin,
  disable(name) {
    writeOverride(name, false);
    stop(name);
  },
  enable(name) {
    writeOverride(name, true);
    start(name);
  },
  isEnabled,
  list() {
    return [...states.values()].map(({ plugin, started }) => ({
      description: plugin.description,
      enabled: isEnabled(plugin.name),
      name: plugin.name,
      started,
      version: plugin.version,
    }));
  },
  loadPlugin(sourceName, extension) {
    if (typeof extension === "function") {
      Klack.register({ name: defaultPluginName(sourceName), setup: extension as KlackExtension });
      return;
    }
    if (!extension || typeof extension !== "object") return;

    const candidate = extension as Partial<KlackPlugin & KlackLegacyPlugin>;
    if (typeof candidate.setup !== "function" && typeof candidate.start !== "function") return;
    Klack.register({ ...candidate, name: candidate.name || defaultPluginName(sourceName) } as KlackPluginDefinition);
  },
  register(plugin) {
    const setup = plugin && ("setup" in plugin ? plugin.setup : plugin.start);
    if (!plugin || typeof plugin.name !== "string" || typeof setup !== "function") {
      throw new TypeError("Klack plugins need a name and setup(klack) function");
    }
    if (!/^[A-Za-z0-9_-]+$/.test(plugin.name)) {
      throw new TypeError(`Invalid Klack plugin name: ${plugin.name}`);
    }
    if (states.has(plugin.name)) {
      throw new Error(`Klack plugin already registered: ${plugin.name}`);
    }

    states.set(plugin.name, { plugin, resources: new Set(), started: false });
    start(plugin.name);
  },
  resetPlugins() {
    [...states.keys()].reverse().forEach(stop);
    states.clear();
  },
  version: KLACK_VERSION,
});

window.Klack = Klack;

if (!ready) {
  document.addEventListener(
    "DOMContentLoaded",
    () => {
      ready = true;
      states.forEach((_, name) => start(name));
    },
    { once: true },
  );
}

console.info(`[Klack] Renderer ${Klack.version} ready`);
