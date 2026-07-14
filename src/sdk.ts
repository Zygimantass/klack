export type Cleanup = () => void;

export type KlackUiTarget =
  | string
  | Element
  | (() => Element | Iterable<Element> | null | undefined);

export type KlackUiPosition = "append" | "prepend" | "before" | "after";

export type KlackMountContext = {
  plugin: string;
  target: Element;
};

export type KlackMountResult =
  | Element
  | {
      cleanup?: Cleanup;
      element: Element;
    };

export type KlackMountOptions = {
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
  mount(
    target: KlackUiTarget,
    render: (context: KlackMountContext) => KlackMountResult,
    options?: KlackMountOptions,
  ): Cleanup;
  observe(selector: string, callback: (element: Element) => void | Cleanup): Cleanup;
};

export type KlackApi = {
  /** @deprecated Use `ui.addStyle()` in new extensions. */
  addStyle(css: string, id?: string): Cleanup;
  logger: Console;
  /** @deprecated Use `ui.observe()` in new extensions. */
  observe(selector: string, callback: (element: Element) => void | Cleanup): Cleanup;
  ui: KlackUi;
  version: string;
};

export type KlackExtension = (klack: KlackApi) => void | Cleanup;

export type KlackPlugin = {
  defaultEnabled?: boolean;
  description?: string;
  name: string;
  setup: KlackExtension;
  version?: string;
};

export type KlackLegacyPlugin = Omit<KlackPlugin, "setup"> & {
  start: KlackExtension;
};

export type KlackPluginDefinition = KlackPlugin | KlackLegacyPlugin;

/**
 * Adds type checking and autocomplete to a plugin definition. At runtime this
 * is intentionally an identity function.
 */
export function definePlugin<const Plugin extends KlackPlugin>(plugin: Plugin): Plugin {
  return plugin;
}
