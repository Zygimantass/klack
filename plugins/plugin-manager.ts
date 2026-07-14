import { definePlugin } from "klack/sdk";

const PLUGIN_NAME = "PluginManager";

type PluginSummary = {
  description?: string;
  enabled: boolean;
  name: string;
  started: boolean;
  version?: string;
};

type KlackManager = {
  disable(name: string): void;
  enable(name: string): void;
  list(): PluginSummary[];
  version: string;
};

function manager(): KlackManager | undefined {
  return (window as unknown as { Klack?: KlackManager }).Klack;
}

function pluginStatus(plugin: PluginSummary): { className: string; label: string } {
  if (plugin.name === PLUGIN_NAME) return { className: "is-required", label: "Built in" };
  if (!plugin.enabled) return { className: "is-disabled", label: "Off" };
  if (!plugin.started) return { className: "is-error", label: "Failed to start" };
  return { className: "is-enabled", label: "On" };
}

function pluginInitial(name: string): string {
  return name.replace(/([a-z])([A-Z])/g, "$1 $2").trim().charAt(0).toUpperCase() || "P";
}

export default definePlugin({
  name: PLUGIN_NAME,
  description: "Adds a Slack-native interface for enabling and disabling Klack plugins.",
  setup(klack) {
    klack.ui.addStyle(
      `
        [data-klack-plugin-manager-trigger] {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          height: 28px;
          margin: 0 6px;
          padding: 0 9px;
          border: 0;
          border-radius: 6px;
          color: inherit;
          background: rgba(255, 255, 255, 0.12);
          font: 700 12px/28px Slack-Lato, Lato, sans-serif;
          cursor: pointer;
          user-select: none;
        }

        [data-klack-plugin-manager-trigger]:hover {
          background: rgba(255, 255, 255, 0.2);
        }

        [data-klack-plugin-manager-trigger]:focus-visible {
          outline: 2px solid white;
          outline-offset: 1px;
        }

        [data-klack-plugin-manager-trigger] svg {
          width: 16px;
          height: 16px;
          fill: none;
          stroke: currentColor;
          stroke-linecap: round;
          stroke-linejoin: round;
          stroke-width: 1.7;
        }

        [data-klack-plugin-manager-overlay][hidden] {
          display: none !important;
        }

        [data-klack-plugin-manager-overlay] {
          position: fixed;
          z-index: 2147483600;
          inset: 0;
          display: grid;
          padding: 32px;
          place-items: center;
          color: var(--sk_primary_foreground, #1d1c1d);
          background: rgba(29, 28, 29, 0.62);
          font-family: Slack-Lato, Lato, sans-serif;
        }

        [data-klack-plugin-manager-dialog] {
          display: flex;
          width: min(620px, calc(100vw - 48px));
          max-height: min(720px, calc(100vh - 64px));
          overflow: hidden;
          flex-direction: column;
          border: 1px solid var(--sk_primary_foreground_low, rgba(29, 28, 29, 0.13));
          border-radius: 12px;
          background: var(--sk_primary_background, #fff);
          box-shadow: 0 18px 48px rgba(0, 0, 0, 0.32);
        }

        [data-klack-plugin-manager-header] {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          padding: 24px 28px 18px;
        }

        [data-klack-plugin-manager-heading] {
          margin: 0;
          color: var(--sk_primary_foreground, #1d1c1d);
          font-size: 22px;
          font-weight: 900;
          line-height: 28px;
        }

        [data-klack-plugin-manager-subtitle] {
          margin: 3px 0 0;
          color: var(--sk_primary_foreground_high, #616061);
          font-size: 13px;
          line-height: 18px;
        }

        [data-klack-plugin-manager-close] {
          display: grid;
          width: 36px;
          height: 36px;
          margin: -5px -8px 0 16px;
          padding: 0;
          place-items: center;
          border: 0;
          border-radius: 6px;
          color: var(--sk_primary_foreground_high, #616061);
          background: transparent;
          font: 400 26px/1 Slack-Lato, Lato, sans-serif;
          cursor: pointer;
        }

        [data-klack-plugin-manager-close]:hover {
          color: var(--sk_primary_foreground, #1d1c1d);
          background: var(--sk_primary_foreground_low, rgba(29, 28, 29, 0.08));
        }

        [data-klack-plugin-manager-toolbar] {
          padding: 0 28px 18px;
        }

        [data-klack-plugin-manager-search-wrap] {
          display: flex;
          align-items: center;
          height: 36px;
          padding: 0 11px;
          border: 1px solid var(--sk_primary_foreground_low, #868686);
          border-radius: 6px;
          background: var(--sk_primary_background, #fff);
        }

        [data-klack-plugin-manager-search-wrap]:focus-within {
          border-color: var(--sk_highlight, #1264a3);
          box-shadow: 0 0 0 1px var(--sk_highlight, #1264a3);
        }

        [data-klack-plugin-manager-search-wrap] svg {
          flex: 0 0 16px;
          width: 16px;
          height: 16px;
          margin-right: 8px;
          color: var(--sk_primary_foreground_high, #616061);
          fill: none;
          stroke: currentColor;
          stroke-width: 1.8;
        }

        [data-klack-plugin-manager-search] {
          width: 100%;
          height: 32px;
          padding: 0;
          border: 0;
          outline: 0;
          color: var(--sk_primary_foreground, #1d1c1d);
          background: transparent;
          font: 400 15px/32px Slack-Lato, Lato, sans-serif;
        }

        [data-klack-plugin-manager-search]::placeholder {
          color: var(--sk_primary_foreground_high, #616061);
        }

        [data-klack-plugin-manager-list] {
          min-height: 140px;
          overflow-y: auto;
          border-top: 1px solid var(--sk_primary_foreground_low, rgba(29, 28, 29, 0.13));
          border-bottom: 1px solid var(--sk_primary_foreground_low, rgba(29, 28, 29, 0.13));
        }

        [data-klack-plugin-manager-row] {
          display: grid;
          grid-template-columns: 38px minmax(0, 1fr) auto;
          gap: 12px;
          align-items: center;
          min-height: 70px;
          padding: 10px 28px;
        }

        [data-klack-plugin-manager-row] + [data-klack-plugin-manager-row] {
          border-top: 1px solid var(--sk_primary_foreground_low, rgba(29, 28, 29, 0.08));
        }

        [data-klack-plugin-manager-row]:hover {
          background: var(--sk_primary_background_highlight, rgba(29, 28, 29, 0.035));
        }

        [data-klack-plugin-manager-icon] {
          display: grid;
          width: 36px;
          height: 36px;
          place-items: center;
          border-radius: 9px;
          color: white;
          background: #611f69;
          font-size: 16px;
          font-weight: 900;
        }

        [data-klack-plugin-manager-copy] {
          min-width: 0;
        }

        [data-klack-plugin-manager-name-line] {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
        }

        [data-klack-plugin-manager-name] {
          overflow: hidden;
          font-size: 15px;
          font-weight: 700;
          line-height: 20px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        [data-klack-plugin-manager-status] {
          flex: 0 0 auto;
          font-size: 11px;
          font-weight: 700;
        }

        [data-klack-plugin-manager-status].is-enabled {
          color: #007a5a;
        }

        [data-klack-plugin-manager-status].is-disabled,
        [data-klack-plugin-manager-status].is-required {
          color: var(--sk_primary_foreground_high, #616061);
        }

        [data-klack-plugin-manager-status].is-error {
          color: #e01e5a;
        }

        [data-klack-plugin-manager-description] {
          margin-top: 2px;
          overflow: hidden;
          color: var(--sk_primary_foreground_high, #616061);
          font-size: 13px;
          line-height: 18px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        [data-klack-plugin-manager-switch] {
          position: relative;
          width: 36px;
          height: 20px;
          padding: 0;
          border: 0;
          border-radius: 999px;
          background: #868686;
          cursor: pointer;
          transition: background 100ms ease;
        }

        [data-klack-plugin-manager-switch][aria-checked="true"] {
          background: #007a5a;
        }

        [data-klack-plugin-manager-switch]::after {
          position: absolute;
          top: 2px;
          left: 2px;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: white;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
          content: "";
          transition: transform 100ms ease;
        }

        [data-klack-plugin-manager-switch][aria-checked="true"]::after {
          transform: translateX(16px);
        }

        [data-klack-plugin-manager-switch]:focus-visible {
          outline: 2px solid var(--sk_highlight, #1264a3);
          outline-offset: 2px;
        }

        [data-klack-plugin-manager-switch]:disabled {
          cursor: default;
          opacity: 0.45;
        }

        [data-klack-plugin-manager-empty] {
          padding: 48px 28px;
          color: var(--sk_primary_foreground_high, #616061);
          text-align: center;
          font-size: 14px;
        }

        [data-klack-plugin-manager-footer] {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 16px 28px;
        }

        [data-klack-plugin-manager-path] {
          min-width: 0;
          overflow: hidden;
          color: var(--sk_primary_foreground_high, #616061);
          font-size: 12px;
          line-height: 16px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        [data-klack-plugin-manager-done] {
          flex: 0 0 auto;
          height: 34px;
          padding: 0 16px;
          border: 0;
          border-radius: 4px;
          color: white;
          background: #007a5a;
          font: 700 14px/34px Slack-Lato, Lato, sans-serif;
          cursor: pointer;
        }

        [data-klack-plugin-manager-done]:hover {
          background: #148567;
        }

        @media (prefers-reduced-motion: reduce) {
          [data-klack-plugin-manager-switch],
          [data-klack-plugin-manager-switch]::after {
            transition: none;
          }
        }
      `,
      { id: "plugin-manager" },
    );

    let overlay: HTMLElement | null = null;
    let previousFocus: HTMLElement | null = null;

    const close = (): void => {
      if (!overlay || overlay.hidden) return;
      overlay.hidden = true;
      previousFocus?.focus();
      previousFocus = null;
    };

    klack.ui.mount("body", ({ cleanup, on }) => {
      const nextOverlay = document.createElement("div");
      nextOverlay.dataset.klackPluginManagerOverlay = "";
      nextOverlay.hidden = true;

      const dialog = document.createElement("section");
      dialog.dataset.klackPluginManagerDialog = "";
      dialog.setAttribute("role", "dialog");
      dialog.setAttribute("aria-modal", "true");
      dialog.setAttribute("aria-labelledby", "klack-plugin-manager-title");

      const header = document.createElement("header");
      header.dataset.klackPluginManagerHeader = "";
      const headingCopy = document.createElement("div");
      const heading = document.createElement("h2");
      heading.id = "klack-plugin-manager-title";
      heading.dataset.klackPluginManagerHeading = "";
      heading.textContent = "Plugins";
      const subtitle = document.createElement("p");
      subtitle.dataset.klackPluginManagerSubtitle = "";
      subtitle.textContent = `Manage how Klack ${klack.version} changes Slack`;
      headingCopy.append(heading, subtitle);

      const closeButton = document.createElement("button");
      closeButton.type = "button";
      closeButton.dataset.klackPluginManagerClose = "";
      closeButton.textContent = "×";
      closeButton.title = "Close";
      closeButton.ariaLabel = "Close plugin manager";
      header.append(headingCopy, closeButton);

      const toolbar = document.createElement("div");
      toolbar.dataset.klackPluginManagerToolbar = "";
      const searchWrap = document.createElement("label");
      searchWrap.dataset.klackPluginManagerSearchWrap = "";
      searchWrap.innerHTML =
        '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5"></circle><path d="m12.5 12.5 4 4"></path></svg>';
      const search = document.createElement("input");
      search.type = "search";
      search.dataset.klackPluginManagerSearch = "";
      search.placeholder = "Search plugins";
      search.ariaLabel = "Search plugins";
      searchWrap.append(search);
      toolbar.append(searchWrap);

      const list = document.createElement("div");
      list.dataset.klackPluginManagerList = "";
      list.setAttribute("role", "list");

      const footer = document.createElement("footer");
      footer.dataset.klackPluginManagerFooter = "";
      const path = document.createElement("div");
      path.dataset.klackPluginManagerPath = "";
      path.textContent = "User plugins load from ~/.klack/plugins";
      path.title = "~/.klack/plugins";
      const done = document.createElement("button");
      done.type = "button";
      done.dataset.klackPluginManagerDone = "";
      done.textContent = "Done";
      footer.append(path, done);

      const renderList = (): void => {
        const api = manager();
        if (!api) return;
        const query = search.value.trim().toLocaleLowerCase();
        const plugins = api
          .list()
          .filter((plugin) => {
            if (!query) return true;
            return `${plugin.name} ${plugin.description || ""}`.toLocaleLowerCase().includes(query);
          })
          .sort((left, right) => {
            if (left.name === PLUGIN_NAME) return -1;
            if (right.name === PLUGIN_NAME) return 1;
            return left.name.localeCompare(right.name);
          });

        if (plugins.length === 0) {
          const empty = document.createElement("div");
          empty.dataset.klackPluginManagerEmpty = "";
          empty.textContent = "No plugins match your search.";
          list.replaceChildren(empty);
          return;
        }

        list.replaceChildren(
          ...plugins.map((plugin) => {
            const row = document.createElement("div");
            row.dataset.klackPluginManagerRow = "";
            row.setAttribute("role", "listitem");

            const icon = document.createElement("div");
            icon.dataset.klackPluginManagerIcon = "";
            icon.textContent = pluginInitial(plugin.name);
            icon.ariaHidden = "true";

            const copy = document.createElement("div");
            copy.dataset.klackPluginManagerCopy = "";
            const nameLine = document.createElement("div");
            nameLine.dataset.klackPluginManagerNameLine = "";
            const name = document.createElement("div");
            name.dataset.klackPluginManagerName = "";
            name.textContent = plugin.name;
            name.title = plugin.name;
            const statusValue = pluginStatus(plugin);
            const status = document.createElement("span");
            status.dataset.klackPluginManagerStatus = "";
            status.className = statusValue.className;
            status.textContent = statusValue.label;
            nameLine.append(name, status);

            const description = document.createElement("div");
            description.dataset.klackPluginManagerDescription = "";
            description.textContent = plugin.description || "No description provided";
            description.title = description.textContent;
            if (plugin.version) description.textContent += ` · v${plugin.version}`;
            copy.append(nameLine, description);

            const toggle = document.createElement("button");
            toggle.type = "button";
            toggle.dataset.klackPluginManagerSwitch = "";
            toggle.setAttribute("role", "switch");
            toggle.setAttribute("aria-checked", String(plugin.enabled));
            toggle.ariaLabel = `${plugin.enabled ? "Disable" : "Enable"} ${plugin.name}`;
            toggle.title = toggle.ariaLabel;
            toggle.disabled = plugin.name === PLUGIN_NAME;
            toggle.addEventListener("click", () => {
              const currentApi = manager();
              if (!currentApi || plugin.name === PLUGIN_NAME) return;
              if (plugin.enabled) currentApi.disable(plugin.name);
              else currentApi.enable(plugin.name);
              renderList();
            });

            row.append(icon, copy, toggle);
            return row;
          }),
        );
      };

      const open = (): void => {
        previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        nextOverlay.hidden = false;
        renderList();
        klack.timers.animationFrame(() => search.focus());
      };

      const onOverlayClick = (event: MouseEvent): void => {
        if (event.target === nextOverlay) close();
      };
      const onKeyDown = (event: KeyboardEvent): void => {
        if (nextOverlay.hidden) return;
        if (event.key === "Escape") {
          event.preventDefault();
          close();
          return;
        }
        if (event.key !== "Tab") return;
        const focusable = Array.from(
          nextOverlay.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)'),
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      };
      const onOpen = (): void => open();

      on(nextOverlay, "click", onOverlayClick);
      on(closeButton, "click", close);
      on(done, "click", close);
      on(search, "input", renderList);
      on(document, "keydown", onKeyDown, true);
      on(document, "klack:open-plugin-manager", onOpen);

      dialog.append(header, toolbar, list, footer);
      nextOverlay.append(dialog);
      overlay = nextOverlay;
      cleanup(() => {
        if (overlay === nextOverlay) overlay = null;
      });

      return nextOverlay;
    });

    klack.ui.mount(
      '[data-qa="top-nav-help-button"]',
      ({ on }) => {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.klackPluginManagerTrigger = "";
        button.title = "Manage Klack plugins";
        button.ariaLabel = "Manage Klack plugins";
        button.innerHTML =
          '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7.25 3.25h5.5v3.5h3.5v5.5h-3.5v3.5h-5.5v-3.5h-3.5v-5.5h3.5z"></path><circle cx="10" cy="9.5" r="2.25"></circle></svg><span>Plugins</span>';
        const onClick = (): void => {
          document.dispatchEvent(new Event("klack:open-plugin-manager"));
        };
        on(button, "click", onClick);
        return button;
      },
      { position: "after" },
    );

    klack.cleanup(close);
  },
});
