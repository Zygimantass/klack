import { definePlugin } from "klack/sdk";

const SLACK_MESSAGE_LINK = 'a[href*="/archives/"]';
const SLACK_MESSAGE_PREVIEW = '[data-qa="message_attachment_slack_msg_text"]';
const STORAGE_KEY = "klack:tabbed-slack:v1";
const MAX_TABS = 20;

type LinkState = {
  previewText: string | null;
  title: string | null;
};

type Tab = {
  id: string;
  sourceUrl: string;
  title: string;
  url: string;
};

type StoredState = {
  activeId: string;
  tabs: Tab[];
};

type DeepLinkArgs = {
  cmd: "channel";
  id: string;
  message?: string;
  team?: string;
  thread_ts?: string;
};

type SlackDesktopDelegate = {
  handleDeepLinkWithArgs?(args: string): void;
  startSearch?(): void;
};

type SlackContextMenuClick = {
  linkUrl?: string;
};

type SlackContextMenus = {
  create(item: {
    contexts: "link"[];
    onclick(click: SlackContextMenuClick): void;
    targetUrlPatterns: string[];
    title: string;
    type: "normal";
  }): Promise<string>;
  remove(id: string): Promise<void>;
};

type SlackWindow = Window & {
  desktop?: {
    contextMenus?: SlackContextMenus;
  };
  desktopDelegate?: SlackDesktopDelegate;
  desktopDelegates?: Record<string, SlackDesktopDelegate>;
};

function isSlackMessageLink(element: Element | null): element is HTMLAnchorElement {
  if (!(element instanceof HTMLAnchorElement)) return false;
  if (element.classList.contains("c-timestamp") || element.closest(".c-message_attachment")) return false;
  if (!element.closest('[data-qa="message-text"]')) return false;

  try {
    return /\/archives\/[^/]+\/p\d+/.test(new URL(element.href).pathname);
  } catch {
    return false;
  }
}

function messageContainer(element: Element): Element | null {
  return (
    element.closest('[data-qa="message_container"]') ||
    element.closest(".c-message_kit__indent") ||
    element.closest(".c-message_kit__message")
  );
}

function restoreAttribute(element: Element, name: string, value: string | null): void {
  if (value === null) element.removeAttribute(name);
  else element.setAttribute(name, value);
}

function normalizedUrl(value: string): string | null {
  try {
    const url = new URL(value, location.href);
    if (url.protocol !== "https:" || !/\bslack\.com$/i.test(url.hostname)) return null;
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}

function titleFromDocument(): string {
  const title = document.title
    .replace(/^\(\d+\+?\)\s*/, "")
    .replace(/\s+[|—–-]\s+Slack(?:\s+.*)?$/i, "")
    .trim();
  return title || "Slack";
}

function shortTitle(value: string): string {
  const title = value.replace(/\s+/g, " ").trim();
  if (!title) return "Slack";
  return title.length > 72 ? `${title.slice(0, 69)}…` : title;
}

function createTab(url: string, title: string): Tab {
  return {
    id: `tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    sourceUrl: url,
    title: shortTitle(title),
    url,
  };
}

function timestampFromPermalink(value: string): string {
  if (value.includes(".")) return value;
  return value.length > 6 ? `${value.slice(0, -6)}.${value.slice(-6)}` : value;
}

function teamFromUrl(value: string): string | undefined {
  try {
    return new URL(value).pathname.match(/^\/client\/([^/]+)/)?.[1];
  } catch {
    return undefined;
  }
}

function isConversationId(value: string): boolean {
  return /^[CDG][A-Z0-9]{8,}$/.test(value);
}

function navigateSpecialClientRoute(value: string): boolean {
  try {
    const match = new URL(value).pathname.match(/^\/client\/([^/]+)\/([^/]+)/);
    const team = match?.[1];
    const route = match?.[2];
    if (!route || isConversationId(route)) return false;
    if (route === "search") {
      const slackWindow = window as SlackWindow;
      const teamDelegate = team ? slackWindow.desktopDelegates?.[team] : undefined;
      const delegate = teamDelegate?.startSearch ? teamDelegate : slackWindow.desktopDelegate;
      if (delegate?.startSearch) delegate.startSearch();
      else document.querySelector<HTMLButtonElement>('[data-qa="top_nav_search"]')?.click();
    }
    return true;
  } catch {
    return false;
  }
}

function deepLinkFor(tab: Tab): DeepLinkArgs | null {
  const team = teamFromUrl(tab.url) || teamFromUrl(location.href);
  try {
    const url = new URL(tab.url);
    const archive = url.pathname.match(/^\/archives\/([^/]+)\/p(\d+)/);
    if (archive && isConversationId(archive[1])) {
      const threadTs = url.searchParams.get("thread_ts") || undefined;
      return {
        cmd: "channel",
        id: archive[1],
        message: timestampFromPermalink(archive[2]),
        team,
        thread_ts: threadTs,
      };
    }

    const client = url.pathname.match(
      /^\/client\/([^/]+)\/([^/]+)(?:\/thread\/[^/-]+-(\d+(?:\.\d+)?))?/,
    );
    if (client && isConversationId(client[2])) {
      return {
        cmd: "channel",
        id: client[2],
        message: client[3] && timestampFromPermalink(client[3]),
        team: client[1],
      };
    }
  } catch {
    return null;
  }
  return null;
}

function tabbableSlackUrl(value: string): string | null {
  const url = normalizedUrl(value);
  if (!url) return null;
  if (deepLinkFor({ id: "", sourceUrl: url, title: "", url })) return url;

  try {
    return /^\/client\/[^/]+\/search(?:\/|$)/.test(new URL(url).pathname) ? url : null;
  } catch {
    return null;
  }
}

function readState(): StoredState {
  const currentUrl = normalizedUrl(location.href) || location.href;
  try {
    const candidate = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") as Partial<StoredState> | null;
    const tabs = Array.isArray(candidate?.tabs)
      ? candidate.tabs
          .flatMap((tab) => {
            if (!tab || typeof tab !== "object") return [];
            const url = normalizedUrl((tab as Partial<Tab>).url || "");
            const sourceUrl = normalizedUrl((tab as Partial<Tab>).sourceUrl || "") || url;
            const id = (tab as Partial<Tab>).id;
            const title = (tab as Partial<Tab>).title;
            if (!url || !sourceUrl || typeof id !== "string" || typeof title !== "string") return [];
            return [{ id, sourceUrl, title: shortTitle(title), url }];
          })
          .slice(-MAX_TABS)
      : [];

    if (tabs.length > 0) {
      const current = tabs.find((tab) => tab.url === currentUrl || tab.sourceUrl === currentUrl);
      const storedActiveId = candidate?.activeId;
      const activeId =
        current?.id ||
        (typeof storedActiveId === "string" && tabs.some((tab) => tab.id === storedActiveId)
          ? storedActiveId
          : tabs[0].id);
      const active = tabs.find((tab) => tab.id === activeId) || tabs[0];
      if (!current) {
        active.url = currentUrl;
        if (!/\/archives\/[^/]+\/p\d+/.test(active.sourceUrl)) active.sourceUrl = currentUrl;
        active.title = shortTitle(titleFromDocument());
      }
      return { activeId: activeId || tabs[0].id, tabs };
    }
  } catch {
    // Ignore stale or malformed persisted state.
  }

  const tab = createTab(currentUrl, titleFromDocument());
  return { activeId: tab.id, tabs: [tab] };
}

export default definePlugin({
  name: "TabbedSlack",
  description: "Adds in-app tabs for Slack links and replaces message previews with hover text.",
  setup(klack) {
    klack.ui.addStyle(
      `
        [data-tabbed-slack-strip] {
          display: flex;
          flex: 0 0 36px;
          align-items: end;
          gap: 2px;
          min-width: 0;
          padding: 4px 8px 0;
          overflow-x: auto;
          overflow-y: hidden;
          border-bottom: 1px solid var(--sk_primary_foreground_low, rgba(29, 28, 29, 0.13));
          background: var(--sk_primary_background, #fff);
          scrollbar-width: none;
        }

        [data-tabbed-slack-strip]::-webkit-scrollbar {
          display: none;
        }

        [data-tabbed-slack-tab] {
          display: flex;
          flex: 0 1 220px;
          align-items: center;
          min-width: 104px;
          max-width: 220px;
          height: 31px;
          overflow: hidden;
          border: 1px solid transparent;
          border-bottom: 0;
          border-radius: 7px 7px 0 0;
          color: var(--sk_primary_foreground, #1d1c1d);
          background: var(--sk_primary_background, #fff);
        }

        [data-tabbed-slack-tab][data-active="true"] {
          border-color: var(--sk_primary_foreground_low, rgba(29, 28, 29, 0.13));
          background: var(--sk_primary_background, #fff);
          box-shadow: inset 0 2px 0 var(--sk_highlight, #1264a3);
        }

        [data-tabbed-slack-tab]:not([data-active="true"]) {
          background: var(--sk_primary_background_highlight, rgba(29, 28, 29, 0.04));
        }

        [data-tabbed-slack-tab]:not([data-active="true"]):hover {
          background: var(--sk_primary_background_highlight, rgba(29, 28, 29, 0.08));
        }

        [data-tabbed-slack-tab-link] {
          flex: 1;
          min-width: 0;
          padding: 7px 4px 7px 10px;
          overflow: hidden;
          color: inherit !important;
          font: 700 13px/17px Slack-Lato, Lato, sans-serif;
          text-decoration: none !important;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        [data-tabbed-slack-close] {
          display: grid;
          flex: 0 0 24px;
          width: 24px;
          height: 24px;
          margin-right: 3px;
          padding: 0;
          place-items: center;
          border: 0;
          border-radius: 4px;
          color: inherit;
          background: transparent;
          font: 400 17px/1 Slack-Lato, Lato, sans-serif;
          cursor: pointer;
          opacity: 0.62;
        }

        [data-tabbed-slack-close]:hover {
          background: var(--sk_primary_foreground_low, rgba(29, 28, 29, 0.13));
          opacity: 1;
        }

        [data-tabbed-slack-tab]:only-child [data-tabbed-slack-close] {
          visibility: hidden;
        }

        [data-tabbed-slack-hidden-preview] {
          display: none !important;
        }

        [data-tabbed-slack-preview-text] {
          position: relative;
        }

        [data-tabbed-slack-preview-text]:hover::after {
          position: absolute;
          z-index: 2147483647;
          top: calc(100% + 6px);
          left: 0;
          width: max-content;
          max-width: min(520px, 80vw);
          padding: 8px 10px;
          border: 1px solid rgba(255, 255, 255, 0.18);
          border-radius: 6px;
          color: var(--sk_primary_foreground, #f8f8f8);
          background: var(--sk_primary_background, #1a1d21);
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.28);
          content: attr(data-tabbed-slack-preview-text);
          font: 400 13px/1.4 Slack-Lato, Lato, sans-serif;
          pointer-events: none;
          white-space: normal;
        }
      `,
      { id: "tabbed-slack" },
    );

    let state = readState();
    let pendingTabId: string | null = null;
    let cancelPendingTimer: (() => void) | null = null;
    let lastLocation = location.href;
    let lastDocumentTitle = document.title;
    const strips = new Set<HTMLElement>();
    const links = new Map<HTMLAnchorElement, LinkState>();
    const hiddenPreviews = new Set<Element>();

    const writeState = (): void => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    };

    const selectTab = (tab: Tab): void => {
      state.activeId = tab.id;
      pendingTabId = tab.id;
      cancelPendingTimer?.();
      cancelPendingTimer = klack.timers.timeout(() => {
        cancelPendingTimer = null;
        if (pendingTabId === tab.id) pendingTabId = null;
      }, 1_500);
      writeState();
      renderTabs();

      const args = deepLinkFor(tab);
      const slackWindow = window as SlackWindow;
      const delegate = (args?.team && slackWindow.desktopDelegates?.[args.team]) || slackWindow.desktopDelegate;
      if (args && delegate?.handleDeepLinkWithArgs) {
        delegate.handleDeepLinkWithArgs(JSON.stringify(args));
      } else if (
        !navigateSpecialClientRoute(tab.url) &&
        normalizedUrl(location.href) !== normalizedUrl(tab.url)
      ) {
        location.assign(tab.url);
      }
    };

    const openInTab = (value: string, title = "Slack"): void => {
      const url = tabbableSlackUrl(value);
      if (!url) return;

      let tab = state.tabs.find((candidate) => candidate.sourceUrl === url || candidate.url === url);
      if (!tab) {
        tab = createTab(url, title);
        state.tabs.push(tab);
        if (state.tabs.length > MAX_TABS) state.tabs.shift();
      }
      selectTab(tab);
    };

    const closeTab = (id: string): void => {
      if (state.tabs.length === 1) return;
      const index = state.tabs.findIndex((tab) => tab.id === id);
      if (index < 0) return;

      const wasActive = state.activeId === id;
      state.tabs.splice(index, 1);
      if (!wasActive) {
        writeState();
        renderTabs();
        return;
      }

      const next = state.tabs[Math.min(index, state.tabs.length - 1)];
      selectTab(next);
    };

    function renderTabs(): void {
      for (const strip of strips) {
        strip.replaceChildren(
          ...state.tabs.map((tab) => {
            const item = document.createElement("div");
            item.dataset.tabbedSlackTab = "";
            item.dataset.active = String(tab.id === state.activeId);
            item.setAttribute("role", "presentation");

            const link = document.createElement("a");
            link.dataset.tabbedSlackTabLink = "";
            link.href = tab.url;
            link.textContent = tab.title;
            link.title = tab.title;
            link.setAttribute("role", "tab");
            link.setAttribute("aria-selected", String(tab.id === state.activeId));
            link.addEventListener("click", (event) => {
              if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              event.preventDefault();
              selectTab(tab);
            });

            const close = document.createElement("button");
            close.type = "button";
            close.dataset.tabbedSlackClose = "";
            close.textContent = "×";
            close.title = `Close ${tab.title}`;
            close.ariaLabel = `Close ${tab.title}`;
            close.addEventListener("click", (event) => {
              event.preventDefault();
              event.stopPropagation();
              closeTab(tab.id);
            });

            item.append(link, close);
            return item;
          }),
        );

        strip.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: "nearest",
        });
      }
    }

    klack.ui.mount(
      ".p-view_contents--primary",
      ({ cleanup }) => {
        const strip = document.createElement("div");
        strip.dataset.tabbedSlackStrip = "";
        strip.setAttribute("role", "tablist");
        strip.ariaLabel = "Slack tabs";
        strips.add(strip);
        cleanup(() => strips.delete(strip));
        renderTabs();
        return strip;
      },
      { position: "prepend" },
    );

    const prepareLink = (link: HTMLAnchorElement): void => {
      if (links.has(link) || !isSlackMessageLink(link)) return;

      links.set(link, {
        previewText: link.getAttribute("data-tabbed-slack-preview-text"),
        title: link.getAttribute("title"),
      });
    };

    const updateMessage = (container: Element): void => {
      const messageLinks = Array.from(
        container.querySelectorAll<HTMLAnchorElement>(SLACK_MESSAGE_LINK),
      ).filter(isSlackMessageLink);
      const previews = Array.from(container.querySelectorAll(SLACK_MESSAGE_PREVIEW));

      previews.forEach((preview) => {
        const previewContainer = preview.closest(".c-message_kit__attachments") || preview;
        previewContainer.setAttribute("data-tabbed-slack-hidden-preview", "");
        hiddenPreviews.add(previewContainer);
      });

      messageLinks.forEach((link, index) => {
        prepareLink(link);
        const preview = previews[index] || (previews.length === 1 ? previews[0] : undefined);
        const fullText = preview?.textContent?.replace(/\s+/g, " ").trim();
        if (fullText) {
          link.title = fullText;
          link.setAttribute("data-tabbed-slack-preview-text", fullText);
        }
      });
    };

    const inspectAddedNode = (node: Node, messages: Set<Element>): void => {
      const element = node instanceof Element ? node : node.parentElement;
      if (!element) return;

      if (element.matches(SLACK_MESSAGE_LINK) && isSlackMessageLink(element)) prepareLink(element);
      element.querySelectorAll<HTMLAnchorElement>(SLACK_MESSAGE_LINK).forEach(prepareLink);

      const container = messageContainer(element);
      if (container) messages.add(container);
    };

    const syncRoute = (): void => {
      const currentUrl = normalizedUrl(location.href) || location.href;
      const active = state.tabs.find((tab) => tab.id === state.activeId);
      if (!active) return;

      const locationChanged = location.href !== lastLocation;
      const titleChanged = document.title !== lastDocumentTitle;
      if (!locationChanged && !titleChanged) return;

      if (locationChanged) {
        active.url = currentUrl;
        lastLocation = location.href;
      }
      if (titleChanged) {
        if (pendingTabId !== active.id) active.title = shortTitle(titleFromDocument());
        lastDocumentTitle = document.title;
      }
      if (locationChanged && pendingTabId === active.id) pendingTabId = null;
      writeState();
      renderTabs();
    };

    const initialMessages = new Set<Element>();
    document.querySelectorAll<HTMLAnchorElement>(SLACK_MESSAGE_LINK).forEach((link) => {
      prepareLink(link);
      const container = messageContainer(link);
      if (container) initialMessages.add(container);
    });
    initialMessages.forEach(updateMessage);

    klack.dom.observe(
      document.documentElement,
      (records) => {
        const messages = new Set<Element>();
        for (const record of records) {
          record.addedNodes.forEach((node) => inspectAddedNode(node, messages));
        }
        messages.forEach(updateMessage);
        syncRoute();

        for (const link of links.keys()) {
          if (!link.isConnected) links.delete(link);
        }
      },
      { childList: true, subtree: true },
    );

    const onPopState = (): void => queueMicrotask(syncRoute);
    klack.events.on(window, "popstate", onPopState);

    const onClick = (event: MouseEvent): void => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target.closest(SLACK_MESSAGE_LINK) : null;
      if (!isSlackMessageLink(target)) return;

      const url = normalizedUrl(target.href);
      if (!url) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const title =
        target.getAttribute("data-tabbed-slack-preview-text") || target.title || target.textContent || "Slack message";
      openInTab(url, title);
    };
    klack.events.on(document, "click", onClick, true);

    const contextMenus = (window as SlackWindow).desktop?.contextMenus;
    let contextMenuId: string | null = null;
    let disposed = false;
    if (contextMenus) {
      void contextMenus
        .create({
          contexts: ["link"],
          onclick: ({ linkUrl }) => {
            if (linkUrl) openInTab(linkUrl, "Slack");
          },
          targetUrlPatterns: [
            "https://*.slack.com/archives/C*/p*",
            "https://*.slack.com/archives/D*/p*",
            "https://*.slack.com/archives/G*/p*",
            "https://*.slack.com/client/*/C*",
            "https://*.slack.com/client/*/D*",
            "https://*.slack.com/client/*/G*",
            "https://*.slack.com/client/*/search*",
          ],
          title: "Open in a new tab",
          type: "normal",
        })
        .then((id) => {
          if (disposed) void contextMenus.remove(id);
          else contextMenuId = id;
        })
        .catch((error) => klack.logger.warn("[TabbedSlack] Could not register context menu", error));
    }

    writeState();
    renderTabs();

    klack.cleanup(() => {
      disposed = true;
      if (contextMenuId) void contextMenus?.remove(contextMenuId);
      cancelPendingTimer?.();
      hiddenPreviews.forEach((preview) => preview.removeAttribute("data-tabbed-slack-hidden-preview"));
      hiddenPreviews.clear();
      for (const [link, state] of links) {
        restoreAttribute(link, "data-tabbed-slack-preview-text", state.previewText);
        restoreAttribute(link, "title", state.title);
      }
      links.clear();
    });
  },
});
