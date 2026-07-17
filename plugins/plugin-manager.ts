import { definePlugin } from "klack/sdk";

const PLUGIN_NAME = "PluginManager";

type PluginSummary = {
  description?: string;
  enabled: boolean;
  name: string;
  started: boolean;
  version?: string;
};

type ThemeSummary = {
  description?: string;
  enabled: boolean;
  id: string;
  name: string;
  version?: string;
};

type KlackManager = {
  arePluginsReady(): boolean;
  completeFirstInstall(): void;
  disable(name: string): void;
  disableTheme(id: string): void;
  enable(name: string): void;
  enableTheme(id: string): void;
  isFirstInstall(): boolean;
  list(): PluginSummary[];
  listThemes(): ThemeSummary[];
  version: string;
};

function manager(): KlackManager | undefined {
  return (window as unknown as { Klack?: KlackManager }).Klack;
}

function claimFirstInstall(): Promise<"claimed" | "completed" | "retry"> | undefined {
  return (window as unknown as {
    KlackNative?: { claimFirstInstall?(): Promise<"claimed" | "completed" | "retry"> };
  }).KlackNative?.claimFirstInstall?.();
}

function completeFirstInstall(): Promise<void> | undefined {
  return (window as unknown as {
    KlackNative?: { completeFirstInstall?(): Promise<void> };
  }).KlackNative?.completeFirstInstall?.();
}

function pluginStatus(plugin: PluginSummary): { className: string; label: string } {
  if (plugin.name === PLUGIN_NAME) return { className: "is-required", label: "Built in" };
  if (!plugin.enabled) return { className: "is-disabled", label: "Off" };
  if (!plugin.started) return { className: "is-error", label: "Failed to start" };
  return { className: "is-enabled", label: "On" };
}

function themeStatus(theme: ThemeSummary): { className: string; label: string } {
  return theme.enabled
    ? { className: "is-enabled", label: "On" }
    : { className: "is-disabled", label: "Off" };
}

function pluginInitial(name: string): string {
  return name.replace(/([a-z])([A-Z])/g, "$1 $2").trim().charAt(0).toUpperCase() || "P";
}

export default definePlugin({
  name: PLUGIN_NAME,
  description: "Adds a Slack-native interface for managing Klack plugins and themes.",
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

        [data-klack-plugin-manager-tabs] {
          display: flex;
          gap: 20px;
          padding: 0 28px;
          border-bottom: 1px solid var(--sk_primary_foreground_low, rgba(29, 28, 29, 0.13));
        }

        [data-klack-plugin-manager-tab] {
          height: 36px;
          margin-bottom: -1px;
          padding: 0 1px;
          border: 0;
          border-bottom: 2px solid transparent;
          color: var(--sk_primary_foreground_high, #616061);
          background: transparent;
          font: 700 14px/34px Slack-Lato, Lato, sans-serif;
          cursor: pointer;
        }

        [data-klack-plugin-manager-tab][aria-selected="true"] {
          border-bottom-color: var(--sk_highlight, #1264a3);
          color: var(--sk_primary_foreground, #1d1c1d);
        }

        [data-klack-plugin-manager-tab]:focus-visible {
          border-radius: 3px;
          outline: 2px solid var(--sk_highlight, #1264a3);
          outline-offset: 1px;
        }

        [data-klack-plugin-manager-toolbar] {
          padding: 18px 28px;
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
    let firstInstallClaimed = false;

    const close = (): void => {
      if (!overlay || overlay.hidden) return;
      overlay.hidden = true;
      previousFocus?.focus();
      previousFocus = null;
      if (!firstInstallClaimed) return;

      firstInstallClaimed = false;
      manager()?.completeFirstInstall();
      const completion = completeFirstInstall();
      if (completion) {
        void completion.catch((error) =>
          klack.logger.error("[Klack] Could not complete first-install onboarding", error),
        );
      }
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
      heading.textContent = "Klack";
      const subtitle = document.createElement("p");
      subtitle.dataset.klackPluginManagerSubtitle = "";
      subtitle.textContent = `Manage plugins and themes · v${klack.version}`;
      headingCopy.append(heading, subtitle);

      const closeButton = document.createElement("button");
      closeButton.type = "button";
      closeButton.dataset.klackPluginManagerClose = "";
      closeButton.textContent = "×";
      closeButton.title = "Close";
      closeButton.ariaLabel = "Close plugin manager";
      header.append(headingCopy, closeButton);

      const tabs = document.createElement("div");
      tabs.dataset.klackPluginManagerTabs = "";
      tabs.setAttribute("role", "tablist");
      tabs.ariaLabel = "Klack settings";
      const pluginsTab = document.createElement("button");
      pluginsTab.type = "button";
      pluginsTab.dataset.klackPluginManagerTab = "plugins";
      pluginsTab.setAttribute("role", "tab");
      pluginsTab.textContent = "Plugins";
      const themesTab = document.createElement("button");
      themesTab.type = "button";
      themesTab.dataset.klackPluginManagerTab = "themes";
      themesTab.setAttribute("role", "tab");
      themesTab.textContent = "Themes";
      tabs.append(pluginsTab, themesTab);

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

      let page: "plugins" | "themes" = "plugins";

      const renderList = (): void => {
        const api = manager();
        if (!api) return;
        const query = search.value.trim().toLocaleLowerCase();
        const items = (page === "plugins"
          ? api.list().map((plugin) => ({
              description: plugin.description,
              enabled: plugin.enabled,
              id: plugin.name,
              name: plugin.name,
              required: plugin.name === PLUGIN_NAME,
              status: pluginStatus(plugin),
              toggle() {
                if (plugin.enabled) api.disable(plugin.name);
                else api.enable(plugin.name);
              },
              version: plugin.version,
            }))
          : api.listThemes().map((theme) => ({
              description: theme.description,
              enabled: theme.enabled,
              id: theme.id,
              name: theme.name,
              required: false,
              status: themeStatus(theme),
              toggle() {
                if (theme.enabled) api.disableTheme(theme.id);
                else api.enableTheme(theme.id);
              },
              version: theme.version,
            })))
          .filter((item) => {
            if (!query) return true;
            return `${item.name} ${item.description || ""}`.toLocaleLowerCase().includes(query);
          })
          .sort((left, right) => {
            if (left.required) return -1;
            if (right.required) return 1;
            return left.name.localeCompare(right.name);
          });

        pluginsTab.setAttribute("aria-selected", String(page === "plugins"));
        themesTab.setAttribute("aria-selected", String(page === "themes"));
        search.placeholder = `Search ${page}`;
        search.ariaLabel = `Search ${page}`;
        path.textContent = `User ${page} load from ~/.klack/${page}`;
        path.title = `~/.klack/${page}`;

        if (items.length === 0) {
          const empty = document.createElement("div");
          empty.dataset.klackPluginManagerEmpty = "";
          empty.textContent = `No ${page} match your search.`;
          list.replaceChildren(empty);
          return;
        }

        list.replaceChildren(
          ...items.map((item) => {
            const row = document.createElement("div");
            row.dataset.klackPluginManagerRow = "";
            row.dataset.klackPluginManagerKind = page;
            row.setAttribute("role", "listitem");

            const icon = document.createElement("div");
            icon.dataset.klackPluginManagerIcon = "";
            icon.textContent = pluginInitial(item.name);
            icon.ariaHidden = "true";

            const copy = document.createElement("div");
            copy.dataset.klackPluginManagerCopy = "";
            const nameLine = document.createElement("div");
            nameLine.dataset.klackPluginManagerNameLine = "";
            const name = document.createElement("div");
            name.dataset.klackPluginManagerName = "";
            name.textContent = item.name;
            name.title = item.name;
            const status = document.createElement("span");
            status.dataset.klackPluginManagerStatus = "";
            status.className = item.status.className;
            status.textContent = item.status.label;
            nameLine.append(name, status);

            const description = document.createElement("div");
            description.dataset.klackPluginManagerDescription = "";
            description.textContent = item.description || "No description provided";
            description.title = description.textContent;
            if (item.version) description.textContent += ` · v${item.version}`;
            copy.append(nameLine, description);

            const toggle = document.createElement("button");
            toggle.type = "button";
            toggle.dataset.klackPluginManagerSwitch = "";
            toggle.setAttribute("role", "switch");
            toggle.setAttribute("aria-checked", String(item.enabled));
            toggle.ariaLabel = `${item.enabled ? "Disable" : "Enable"} ${item.name}`;
            toggle.title = toggle.ariaLabel;
            toggle.disabled = item.required;
            toggle.addEventListener("click", () => {
              if (item.required) return;
              item.toggle();
              renderList();
            });

            row.append(icon, copy, toggle);
            return row;
          }),
        );
      };

      const showPage = (nextPage: "plugins" | "themes"): void => {
        if (page !== nextPage) search.value = "";
        page = nextPage;
        renderList();
        list.scrollTop = 0;
        search.focus();
      };

      const open = (): void => {
        previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        nextOverlay.hidden = false;
        renderList();
        list.scrollTop = 0;
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
      let firstInstallClaimPending = false;
      const openFirstInstall = (): void => {
        const api = manager();
        if (!api?.isFirstInstall() || !api.arePluginsReady() || firstInstallClaimPending) return;
        if (!document.querySelector(klack.selectors.get("slack.app.root"))) {
          klack.timers.timeout(openFirstInstall, 250);
          return;
        }
        const claim = claimFirstInstall();
        if (!claim) return;

        firstInstallClaimPending = true;
        void claim
          .then((result) => {
            if (result === "retry") {
              klack.timers.timeout(openFirstInstall, 250);
              return;
            }
            if (result === "completed") {
              if (!firstInstallClaimed) {
                api.completeFirstInstall();
                return;
              }
            } else {
              firstInstallClaimed = true;
            }
            showPage("plugins");
            open();
            klack.timers.timeout(() => {
              const completion = completeFirstInstall();
              if (!completion) return;
              void completion.catch((error) =>
                klack.logger.error("[Klack] Could not complete first-install onboarding", error),
              );
            }, 1_000);
          })
          .catch((error) => klack.logger.error("[Klack] Could not open first-install onboarding", error))
          .finally(() => {
            firstInstallClaimPending = false;
          });
      };

      on(nextOverlay, "click", onOverlayClick);
      on(closeButton, "click", close);
      on(done, "click", close);
      on(search, "input", renderList);
      on(pluginsTab, "click", () => showPage("plugins"));
      on(themesTab, "click", () => showPage("themes"));
      on(document, "keydown", onKeyDown, true);
      on(document, "klack:open-plugin-manager", onOpen);
      on(document, "klack:plugins-ready", openFirstInstall);

      dialog.append(header, tabs, toolbar, list, footer);
      nextOverlay.append(dialog);
      overlay = nextOverlay;
      cleanup(() => {
        if (overlay === nextOverlay) overlay = null;
      });
      openFirstInstall();

      return nextOverlay;
    });

    const helpButton = klack.selectors.get("slack.top-nav.help-button");
    klack.ui.mount(
      () => document.querySelector(helpButton)?.parentElement,
      ({ on }) => {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.klackPluginManagerTrigger = "";
        button.title = "Manage Klack plugins and themes";
        button.ariaLabel = "Manage Klack plugins and themes";
        button.innerHTML =
          '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7.25 3.25h5.5v3.5h3.5v5.5h-3.5v3.5h-5.5v-3.5h-3.5v-5.5h3.5z"></path><circle cx="10" cy="9.5" r="2.25"></circle></svg><span>Klack</span>';
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
