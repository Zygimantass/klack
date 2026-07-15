import type { ThemeSelectorId } from "./theme-selectors";

export type Cleanup = () => void;

export type KlackEventOptions = boolean | AddEventListenerOptions;

export type KlackOn = {
  <Type extends keyof WindowEventMap>(
    target: Window,
    type: Type,
    listener: (event: WindowEventMap[Type]) => void,
    options?: KlackEventOptions,
  ): Cleanup;
  <Type extends keyof DocumentEventMap>(
    target: Document,
    type: Type,
    listener: (event: DocumentEventMap[Type]) => void,
    options?: KlackEventOptions,
  ): Cleanup;
  <Type extends keyof GlobalEventHandlersEventMap>(
    target: Element,
    type: Type,
    listener: (event: GlobalEventHandlersEventMap[Type]) => void,
    options?: KlackEventOptions,
  ): Cleanup;
  <EventType extends Event>(
    target: EventTarget,
    type: string,
    listener: (event: EventType) => void,
    options?: KlackEventOptions,
  ): Cleanup;
};

export type KlackUiTarget =
  | string
  | Element
  | (() => Element | Iterable<Element> | null | undefined);

export type KlackUiPosition = "append" | "prepend" | "before" | "after";

export type KlackMountContext = {
  cleanup(cleanup: Cleanup): Cleanup;
  on: KlackOn;
  plugin: string;
  target: Element;
};

export type KlackMountOptions = {
  observeAttributes?: boolean | readonly string[];
  position?: KlackUiPosition;
};

export type KlackButtonContext = KlackMountContext & {
  button: HTMLButtonElement;
};

export type KlackButtonOptions = KlackMountOptions & {
  ariaLabel?: string;
  attributes?: Readonly<Record<string, string>>;
  className?: string;
  disabled?: boolean;
  id: string;
  label: string;
  onClick?: (event: MouseEvent, context: KlackButtonContext) => void | Promise<void>;
  target: KlackUiTarget;
  title?: string;
};

export type KlackUi = {
  addButton(options: KlackButtonOptions): Cleanup;
  addStyle(css: string, options?: { id?: string }): Cleanup;
  hide(selectors: string | readonly string[], options?: { id?: string }): Cleanup;
  mount(
    target: KlackUiTarget,
    render: (context: KlackMountContext) => Element,
    options?: KlackMountOptions,
  ): Cleanup;
};

export type KlackDom = {
  observe(
    target: Node,
    callback: MutationCallback,
    options: MutationObserverInit,
  ): Cleanup;
  watch(
    selector: string,
    callback: (element: Element) => void | Cleanup,
    options?: { attributes?: boolean | readonly string[] },
  ): Cleanup;
};

export type KlackEvents = {
  on: KlackOn;
};

export type KlackTimers = {
  animationFrame(callback: FrameRequestCallback): Cleanup;
  interval(callback: () => void, delay: number): Cleanup;
  timeout(callback: () => void, delay: number): Cleanup;
};

export type KlackSelectorProbe = {
  candidate?: string;
  candidateIndex: number;
  id: ThemeSelectorId;
  matchCount: number;
  stability?: "owned" | "stable" | "semantic" | "structural" | "fallback";
};

export type KlackSelectors = {
  candidates(id: ThemeSelectorId): readonly string[];
  get(id: ThemeSelectorId): string;
  probe(id: ThemeSelectorId, root?: ParentNode): KlackSelectorProbe;
};

export type KlackDiagnostics = {
  capturePage(): Promise<string>;
  copyImage(imageDataUrl: string): Promise<void>;
};

export type KlackApi = {
  cleanup(cleanup: Cleanup): Cleanup;
  diagnostics: KlackDiagnostics;
  dom: KlackDom;
  events: KlackEvents;
  logger: Console;
  selectors: KlackSelectors;
  timers: KlackTimers;
  ui: KlackUi;
  version: string;
};

export type KlackPlugin = {
  defaultEnabled?: boolean;
  description?: string;
  name: string;
  setup(klack: KlackApi): void;
  version?: string;
};

/**
 * Adds type checking and autocomplete to a plugin definition. At runtime this
 * is intentionally an identity function.
 */
export function definePlugin<const Plugin extends KlackPlugin>(plugin: Plugin): Plugin {
  return plugin;
}
