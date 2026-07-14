declare const __KLACK_VERSION__: string;

import {
  type Cleanup,
  type KlackApi,
  type KlackButtonOptions,
  type KlackMountContext,
  type KlackMountOptions,
  type KlackOn,
  type KlackPlugin,
  type KlackUiPosition,
  type KlackUiTarget,
} from "./sdk";

type PluginState = {
  plugin: KlackPlugin;
  resources: Set<Cleanup>;
  started: boolean;
};

type KlackGlobal = {
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
  loadPlugin(plugin: unknown): void;
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

function hide(plugin: string, selectors: string | readonly string[], id?: string): Cleanup {
  const selectorList = typeof selectors === "string" ? [selectors] : selectors;
  if (selectorList.length === 0) return () => {};
  selectorList.forEach((selector) => document.querySelector(selector));
  return addStyle(
    plugin,
    `${selectorList.join(",\n")} {\n  display: none !important;\n}`,
    id,
  );
}

function resolveTargets(target: KlackUiTarget): Element[] {
  if (typeof target === "string") return Array.from(document.querySelectorAll(target));
  if (target instanceof Element) return [target];

  const resolved = target();
  if (!resolved) return [];
  if (resolved instanceof Element) return [resolved];
  return [...resolved].filter((element): element is Element => element instanceof Element);
}

function observerOptions(
  attributes?: boolean | readonly string[],
): MutationObserverInit {
  if (attributes === true) return { attributes: true, childList: true, subtree: true };
  if (attributes) {
    return {
      attributeFilter: Array.from(attributes),
      attributes: true,
      childList: true,
      subtree: true,
    };
  }
  return { childList: true, subtree: true };
}

function watchMutations(
  reconcile: () => void,
  attributes?: boolean | readonly string[],
): Cleanup {
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
  observer.observe(document.documentElement, observerOptions(attributes));
  return () => {
    active = false;
    observer.disconnect();
  };
}

type ElementWatchResult =
  | void
  | Cleanup
  | {
      cleanup?: Cleanup;
      isActive?: () => boolean;
      retryOnAdd?: boolean;
    };

type ElementWatchRecord = Exclude<ElementWatchResult, void | Cleanup>;

function matchingElements(node: Node, selector: string): Element[] {
  if (!(node instanceof Element)) return [];
  const matches: Element[] = [];
  if (node.matches(selector)) matches.push(node);
  matches.push(...Array.from(node.querySelectorAll(selector)));
  return matches;
}

function watchElements(
  selector: string,
  callback: (element: Element) => ElementWatchResult,
  options?: { attributes?: boolean | readonly string[] },
): Cleanup {
  const records = new Map<Element, ElementWatchRecord>();

  const activate = (element: Element): void => {
    if (records.has(element)) return;
    try {
      const result = callback(element);
      records.set(
        element,
        typeof result === "function" ? { cleanup: result } : result || {},
      );
    } catch (error) {
      records.set(element, { retryOnAdd: true });
      console.error(`[Klack] Failed to initialize DOM watcher for ${selector}`, error);
    }
  };

  const clean = (element: Element): void => {
    const record = records.get(element);
    try {
      record?.cleanup?.();
    } catch (error) {
      console.error(`[Klack] Failed to clean up DOM watcher for ${selector}`, error);
    } finally {
      records.delete(element);
    }
  };

  document.querySelectorAll(selector).forEach(activate);
  const observer = new MutationObserver((mutations) => {
    for (const [element, record] of records) {
      const stillMatches = element.isConnected && element.matches(selector);
      if (stillMatches && record.isActive?.() !== false) continue;
      clean(element);
      if (stillMatches) activate(element);
    }

    const activateFromMutation = (element: Element): void => {
      if (records.get(element)?.retryOnAdd) clean(element);
      activate(element);
    };

    for (const mutation of mutations) {
      if (mutation.type === "attributes") {
        matchingElements(mutation.target, selector).forEach(activateFromMutation);
      }
      mutation.addedNodes.forEach((node) => {
        if (!node.isConnected) return;
        matchingElements(node, selector).forEach(activateFromMutation);
      });
    }
  });
  observer.observe(document.documentElement, observerOptions(options?.attributes));

  return () => {
    observer.disconnect();
    [...records.keys()].forEach(clean);
  };
}

function listen(
  target: EventTarget,
  type: string,
  listener: EventListener,
  options?: boolean | AddEventListenerOptions,
): Cleanup {
  target.addEventListener(type, listener, options);
  return () => target.removeEventListener(type, listener, options);
}

function observeMutations(
  target: Node,
  callback: MutationCallback,
  options: MutationObserverInit,
): Cleanup {
  const observer = new MutationObserver(callback);
  observer.observe(target, options);
  return () => observer.disconnect();
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
  render: (context: KlackMountContext) => Element,
  options: KlackMountOptions = {},
): Cleanup {
  const create = (targetElement: Element): ElementWatchRecord => {
    const resources = new Set<Cleanup>();
    const cleanup = (resource: Cleanup): Cleanup => {
      let active = true;
      const tracked = (): void => {
        if (!active) return;
        active = false;
        resources.delete(tracked);
        resource();
      };
      resources.add(tracked);
      return tracked;
    };

    try {
      const on = ((
        eventTarget: EventTarget,
        type: string,
        listener: EventListener,
        eventOptions?: boolean | AddEventListenerOptions,
      ) => cleanup(listen(eventTarget, type, listener, eventOptions))) as KlackOn;
      const element = render({
        cleanup,
        on,
        plugin,
        target: targetElement,
      });
      if (!(element instanceof Element)) {
        throw new TypeError("ui.mount() render functions must return an Element");
      }
      element.setAttribute("data-klack-plugin", plugin);
      insert(element, targetElement, options.position || "append");

      return {
        cleanup: () => {
          for (const resource of [...resources].reverse()) {
            try {
              resource();
            } catch (error) {
              console.error(`[Klack] Failed to clean up mounted UI for ${plugin}`, error);
            }
          }
          element.remove();
        },
        isActive: () => {
          if (!element.isConnected) return false;
          if (options.position === "before") return element.nextElementSibling === targetElement;
          if (options.position === "after") return element.previousElementSibling === targetElement;
          return element.parentElement === targetElement;
        },
      };
    } catch (error) {
      for (const resource of [...resources].reverse()) {
        try {
          resource();
        } catch (cleanupError) {
          console.error(`[Klack] Failed to clean up mounted UI for ${plugin}`, cleanupError);
        }
      }
      console.error(`[Klack] Failed to mount UI for ${plugin}`, error);
      return { retryOnAdd: true };
    }
  };

  if (typeof target === "string") {
    return watchElements(target, (targetElement) => {
      if (targetElement.closest("[data-klack-plugin]")) return;
      return create(targetElement);
    }, { attributes: options.observeAttributes });
  }

  const records = new Map<Element, ElementWatchRecord>();
  const remove = (targetElement: Element): void => {
    const record = records.get(targetElement);
    records.delete(targetElement);
    record?.cleanup?.();
  };

  const reconcile = (): void => {
    const targets = new Set(
      resolveTargets(target).filter(
        (element) => element.isConnected && !element.closest("[data-klack-plugin]"),
      ),
    );

    for (const [targetElement, record] of records) {
      if (
        targets.has(targetElement) &&
        !record.retryOnAdd &&
        record.isActive?.() !== false
      ) {
        continue;
      }
      remove(targetElement);
    }

    for (const targetElement of targets) {
      if (records.has(targetElement)) continue;
      records.set(targetElement, create(targetElement));
    }
  };

  reconcile();
  const stopWatching = watchMutations(reconcile, options.observeAttributes);
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
    ({ cleanup, on, target }) => {
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
          void Promise.resolve(
            options.onClick?.(event, { button, cleanup, on, plugin, target }),
          ).catch((error) => {
            console.error(`[Klack] Button ${plugin}:${options.id} failed`, error);
          });
        } catch (error) {
          console.error(`[Klack] Button ${plugin}:${options.id} failed`, error);
        }
      };
      on(button, "click", onClick);
      return button;
    },
    options,
  );
}

const KLACK_VERSION = window.KlackNative?.version || __KLACK_VERSION__;

function createPluginApi(state: PluginState): KlackApi {
  const cleanup = (resource: Cleanup): Cleanup => track(state, resource);
  const on = ((
    target: EventTarget,
    type: string,
    listener: EventListener,
    options?: boolean | AddEventListenerOptions,
  ) => cleanup(listen(target, type, listener, options))) as KlackOn;
  const reportTimerError = (timerType: string, error: unknown): void => {
    console.error(`[Klack] ${timerType} callback failed for ${state.plugin.name}`, error);
  };
  const timeout = (callback: () => void, delay: number): Cleanup => {
    let cancel: Cleanup;
    const timer = window.setTimeout(() => {
      cancel();
      try {
        callback();
      } catch (error) {
        reportTimerError("Timeout", error);
      }
    }, delay);
    cancel = cleanup(() => window.clearTimeout(timer));
    return cancel;
  };
  const animationFrame = (callback: FrameRequestCallback): Cleanup => {
    let cancel: Cleanup;
    const frame = window.requestAnimationFrame((time) => {
      cancel();
      try {
        callback(time);
      } catch (error) {
        reportTimerError("Animation frame", error);
      }
    });
    cancel = cleanup(() => window.cancelAnimationFrame(frame));
    return cancel;
  };

  const ui = Object.freeze({
    addButton: (options: KlackButtonOptions) => cleanup(addButton(state.plugin.name, options)),
    addStyle: (css: string, options?: { id?: string }) =>
      cleanup(addStyle(state.plugin.name, css, options?.id)),
    hide: (selectors: string | readonly string[], options?: { id?: string }) =>
      cleanup(hide(state.plugin.name, selectors, options?.id)),
    mount: (
      target: KlackUiTarget,
      render: (context: KlackMountContext) => Element,
      options?: KlackMountOptions,
    ) => cleanup(mount(state.plugin.name, target, render, options)),
  });

  return Object.freeze({
    cleanup,
    dom: Object.freeze({
      observe: (target: Node, callback: MutationCallback, options: MutationObserverInit) =>
        cleanup(observeMutations(target, callback, options)),
      watch: (
        selector: string,
        callback: (element: Element) => void | Cleanup,
        options?: { attributes?: boolean | readonly string[] },
      ) => cleanup(watchElements(selector, callback, options)),
    }),
    events: Object.freeze({ on }),
    logger: console,
    timers: Object.freeze({
      animationFrame,
      interval: (callback: () => void, delay: number) => {
        const timer = window.setInterval(() => {
          try {
            callback();
          } catch (error) {
            reportTimerError("Interval", error);
          }
        }, delay);
        return cleanup(() => window.clearInterval(timer));
      },
      timeout,
    }),
    ui,
    version: KLACK_VERSION,
  });
}

function start(name: string): void {
  const state = states.get(name);
  if (!state || state.started || !ready || !isEnabled(name)) return;

  try {
    state.started = true;
    state.plugin.setup(createPluginApi(state));
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

function registerPlugin(plugin: unknown): void {
  if (!plugin || typeof plugin !== "object") {
    throw new TypeError("Klack plugins must be objects created with definePlugin()");
  }

  const candidate = plugin as Partial<KlackPlugin>;
  if (typeof candidate.name !== "string" || typeof candidate.setup !== "function") {
    throw new TypeError("Klack plugins need a name and setup(klack) function");
  }
  if (!/^[A-Za-z0-9_-]+$/.test(candidate.name)) {
    throw new TypeError(`Invalid Klack plugin name: ${candidate.name}`);
  }
  if (states.has(candidate.name)) {
    throw new Error(`Klack plugin already registered: ${candidate.name}`);
  }

  const definition = candidate as KlackPlugin;
  states.set(definition.name, { plugin: definition, resources: new Set(), started: false });
  start(definition.name);
}

const Klack: KlackGlobal = Object.freeze({
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
  loadPlugin(plugin) {
    registerPlugin(plugin);
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
