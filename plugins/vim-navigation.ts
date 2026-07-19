import { definePlugin } from "klack/sdk";

import {
  appendCountDigit,
  countValue,
  keyCommand,
  movedIndex,
  shouldSuppressNormalModeKey,
  threadTimestampFromUrl,
  type Direction,
} from "./lib/vim-navigation";

type CursorKind = "message" | "sidebar";
type Surface = "main" | "sidebar" | "thread" | "threads";

type Cursor = {
  element: HTMLElement;
  identity: string | null;
  kind: CursorKind;
};

type ThreadOrigin = {
  element: HTMLElement;
  identity: string | null;
  surface: "main" | "threads";
};

type CursorOrigin = Cursor & {
  surface: Surface;
};

type InsertSession = {
  origin: CursorOrigin | null;
  surface: Exclude<Surface, "sidebar">;
  target: HTMLElement;
};

type SearchSession = {
  origin: CursorOrigin | null;
  pendingText: string;
  restoring: boolean;
};

type DeepLinkArgs = {
  cmd: "channel";
  id: string;
  message: string;
  team?: string;
  thread_ts: string;
};

type SlackDesktopDelegate = {
  handleDeepLinkWithArgs?(args: string): void;
  startSearch?(): void;
};

type SlackWindow = Window & {
  desktopDelegate?: SlackDesktopDelegate;
  desktopDelegates?: Record<string, SlackDesktopDelegate>;
};

// Slack's non-modal secondary thread pane has role="dialog", so only modal dialogs block Vim input.
const BLOCKING_SURFACE_SELECTOR = '[aria-modal="true"], [role="listbox"], [role="menu"]';
const NATIVE_KEYBOARD_TARGET_SELECTOR = [
  "input",
  "textarea",
  "select",
  "button",
  "a[href]",
  '[contenteditable]:not([contenteditable="false"])',
  '[role="combobox"]',
  '[role="listbox"]',
  '[role="link"]',
  '[role="menu"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="searchbox"]',
  '[role="slider"]',
  '[role="spinbutton"]',
  '[role="switch"]',
  '[role="tab"]',
  '[role="textbox"]',
  '[role="treeitem"]',
  '[role="button"]',
  '[tabindex]:not([tabindex="-1"])',
].join(", ");
const SELECTED_ATTRIBUTE = "data-klack-vim-selected";
const FOCUSABLE_EDITOR_SELECTOR =
  'input, textarea, [contenteditable="true"], [role="searchbox"], [role="textbox"]';
const MAX_PAGE_COUNT = 20;
const THREAD_ACTION_SELECTOR = [
  '[data-qa="start_thread"]',
  '[data-qa="message-actions-reply-to-thread"]',
  '[data-qa="reply_to_thread"]',
].join(", ");

function elementFromTarget(target: EventTarget | null): Element | null {
  if (target instanceof Element) return target;
  return document.activeElement;
}

function hasNativeKeyboardTarget(target: EventTarget | null): boolean {
  return elementFromTarget(target)?.closest(NATIVE_KEYBOARD_TARGET_SELECTOR) !== null;
}

function isRendered(element: Element): element is HTMLElement {
  if (!(element instanceof HTMLElement) || !element.isConnected) return false;
  if (element.closest('[hidden], [aria-hidden="true"]')) return false;
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function hasBlockingSurface(): boolean {
  return Array.from(document.querySelectorAll(BLOCKING_SURFACE_SELECTOR)).some(isRendered);
}

function visibleElement(selector: string, root: ParentNode = document): HTMLElement | null {
  return Array.from(root.querySelectorAll(selector)).find(isRendered) || null;
}

function canonicalElements(root: Element, selector: string): HTMLElement[] {
  return Array.from(root.querySelectorAll(selector))
    .filter(isRendered)
    .filter((element) => {
      const matchingAncestor = element.parentElement?.closest(selector);
      return !matchingAncestor || !root.contains(matchingAncestor);
    })
    .sort((left, right) => {
      const leftRect = left.getBoundingClientRect();
      const rightRect = right.getBoundingClientRect();
      return leftRect.top - rightRect.top || leftRect.left - rightRect.left;
    });
}

function initialIndex(elements: HTMLElement[], root: HTMLElement, direction: Direction): number {
  if (elements.length === 0) return -1;
  const rootRect = root.getBoundingClientRect();
  const top = Math.max(0, rootRect.top);
  const bottom = Math.min(window.innerHeight, rootRect.bottom);
  const visibleIndices = elements.flatMap((element, index) => {
    const rect = element.getBoundingClientRect();
    return rect.bottom > top && rect.top < bottom ? [index] : [];
  });
  if (visibleIndices.length === 0) return direction === "next" ? 0 : elements.length - 1;
  return direction === "next" ? visibleIndices[0] : visibleIndices[visibleIndices.length - 1];
}

function scrollPastBoundary(
  element: HTMLElement,
  root: HTMLElement,
  direction: Direction,
): boolean {
  let candidate: HTMLElement | null = element.parentElement;
  while (candidate && root.contains(candidate)) {
    if (candidate.scrollHeight > candidate.clientHeight + 1) {
      const distance = Math.max(80, Math.round(candidate.clientHeight * 0.4));
      const previous = candidate.scrollTop;
      candidate.scrollBy({ top: direction === "next" ? distance : -distance });
      if (candidate.scrollTop !== previous) return true;
    }
    if (candidate === root) return false;
    candidate = candidate.parentElement;
  }
  return false;
}

function messageIdentity(message: Element): string | null {
  const channel = message.getAttribute("data-msg-channel-id");
  const timestamp = message.getAttribute("data-msg-ts");
  return channel && timestamp ? `${channel}:${timestamp}` : null;
}

function sidebarIdentity(item: Element): string | null {
  const channel =
    item.getAttribute("data-qa-channel-sidebar-channel-id") ||
    item
      .querySelector("[data-qa-channel-sidebar-channel-id]")
      ?.getAttribute("data-qa-channel-sidebar-channel-id");
  if (channel) return `channel:${channel}`;
  const control = item.matches("a[href]") ? item : item.querySelector("a[href]");
  return control instanceof HTMLAnchorElement ? `route:${control.href}` : null;
}

function identityFor(element: Element, kind: CursorKind): string | null {
  return kind === "message" ? messageIdentity(element) : sidebarIdentity(element);
}

function clickEnabled(element: HTMLElement | null): boolean {
  if (!element || element.getAttribute("aria-disabled") === "true") return false;
  if (element instanceof HTMLButtonElement && element.disabled) return false;
  element.click();
  return true;
}

function teamFromLocation(): string | undefined {
  return location.pathname.match(/^\/client\/([^/]+)/)?.[1];
}

export default definePlugin({
  name: "VimNavigation",
  description: "Adds Vim-style navigation, counts, search, and insert mode across Slack conversations and threads.",
  defaultEnabled: false,
  setup(klack) {
    const messagePaneSelector = klack.selectors.get("slack.message.pane");
    const messageRowSelector = klack.selectors.get("slack.message.row");
    const replyBarSelector = klack.selectors.get("slack.message.reply-bar");
    const timestampSelector = klack.selectors.get("slack.message.timestamp");
    const composerInputSelector = klack.selectors.get("slack.composer.input");
    const flexpaneRootSelector = klack.selectors.get("slack.flexpane.root");
    const searchInputSelector = klack.selectors.get("slack.search.dialog-input");
    const sidebarItemSelector = klack.selectors.get("slack.sidebar.item");
    const sidebarRootSelector = klack.selectors.get("slack.sidebar.root");
    const sidebarSelectedSelector = klack.selectors.get("slack.sidebar.item-selected");
    const threadPaneSelector = klack.selectors.get("slack.thread.pane");
    const threadReplyContainerSelector = klack.selectors.get("slack.thread.reply-container");
    const threadsFooterSelector = klack.selectors.get("slack.threads.footer");
    const threadsViewSelector = klack.selectors.get("slack.threads.view");
    const topNavSearchSelector = klack.selectors.get("slack.top-nav.search-trigger");

    let cursor: Cursor | null = null;
    let preferredSurface: Surface = "main";
    let threadOrigin: ThreadOrigin | null = null;
    let cancelBoundaryRetry: (() => void) | null = null;
    let cancelPendingFocus: (() => void) | null = null;
    let cancelPendingSearchRestore: (() => void) | null = null;
    let cancelPendingThread: (() => void) | null = null;
    let countPrefix = "";
    let insertSession: InsertSession | null = null;
    let searchSession: SearchSession | null = null;

    const composerFromTarget = (target: EventTarget | null): HTMLElement | null => {
      const element = elementFromTarget(target);
      const composer = element?.closest(composerInputSelector);
      return composer instanceof HTMLElement &&
        !composer.closest(searchInputSelector) &&
        isRendered(composer)
        ? composer
        : null;
    };

    const resetCount = (): void => {
      countPrefix = "";
    };

    const resetPrefixes = (): void => {
      resetCount();
    };

    const takeCount = (): number => {
      const count = countValue(countPrefix);
      resetCount();
      return count;
    };

    const cancelDeferredFocus = (): void => {
      cancelPendingFocus?.();
      cancelPendingFocus = null;
    };

    const cancelSearchRestore = (): void => {
      cancelPendingSearchRestore?.();
      cancelPendingSearchRestore = null;
    };

    const cancelPendingMove = (): void => {
      cancelBoundaryRetry?.();
      cancelBoundaryRetry = null;
    };

    const clearCursor = (): void => {
      cancelPendingMove();
      cancelDeferredFocus();
      document.querySelectorAll(`[${SELECTED_ATTRIBUTE}]`).forEach((element) => {
        element.removeAttribute(SELECTED_ATTRIBUTE);
      });
      cursor = null;
    };

    const paintCursor = (element: HTMLElement, kind: CursorKind, scroll: boolean): void => {
      document.querySelectorAll(`[${SELECTED_ATTRIBUTE}]`).forEach((selected) => {
        selected.removeAttribute(SELECTED_ATTRIBUTE);
      });
      element.setAttribute(SELECTED_ATTRIBUTE, kind);
      cursor = { element, identity: identityFor(element, kind), kind };
      if (scroll) element.scrollIntoView({ block: "nearest", inline: "nearest" });
    };

    const select = (element: HTMLElement, kind: CursorKind): void => {
      clearCursor();
      paintCursor(element, kind, true);
    };

    const threadPane = (): HTMLElement | null => visibleElement(threadPaneSelector);

    const surfaceForCursor = (candidate: Cursor): Surface => {
      if (candidate.kind === "sidebar") return "sidebar";
      if (candidate.element.closest(threadPaneSelector)) return "thread";
      if (candidate.element.closest(threadsViewSelector)) return "threads";
      return "main";
    };

    const rootForSurface = (surface: Surface): HTMLElement | null => {
      if (surface === "sidebar") return visibleElement(sidebarRootSelector);
      if (surface === "thread") return threadPane();
      if (surface === "threads") return visibleElement(threadsViewSelector);
      return visibleElement(messagePaneSelector);
    };

    const restoreCursorOrigin = (origin: CursorOrigin | null): void => {
      if (!origin) return;
      preferredSurface = origin.surface;
      const root = rootForSurface(origin.surface);
      const selector = origin.kind === "sidebar" ? sidebarItemSelector : messageRowSelector;
      const replacement =
        root && origin.identity
          ? canonicalElements(root, selector).find(
              (element) => identityFor(element, origin.kind) === origin.identity,
            )
          : null;
      const target = replacement || (origin.element.isConnected ? origin.element : null);
      if (target) select(target, origin.kind);
    };

    const editorWithin = (root: HTMLElement | null): HTMLElement | null => {
      if (!root) return null;
      if (root.matches(FOCUSABLE_EDITOR_SELECTOR)) return root;
      return visibleElement(FOCUSABLE_EDITOR_SELECTOR, root);
    };

    const composerForSurface = (surface: Surface): HTMLElement | null => {
      const inputs = Array.from(document.querySelectorAll(composerInputSelector))
        .filter(isRendered)
        .filter((input) => !input.closest(searchInputSelector));
      if (inputs.length === 0) return null;

      if (surface === "thread") {
        const pane = threadPane();
        const flexpane = pane?.closest<HTMLElement>(flexpaneRootSelector) || pane;
        const replyContainer = flexpane
          ? visibleElement(threadReplyContainerSelector, flexpane)
          : null;
        return (
          inputs.find((input) => replyContainer?.contains(input)) ||
          inputs.find((input) => pane?.contains(input)) ||
          null
        );
      }
      if (surface === "threads") {
        const threads = visibleElement(threadsViewSelector);
        const footer = threads ? visibleElement(threadsFooterSelector, threads) : null;
        return (
          inputs.find((input) => footer?.contains(input)) ||
          inputs.find((input) => threads?.contains(input)) ||
          null
        );
      }

      return (
        inputs.find(
          (input) =>
            !input.closest(threadPaneSelector) &&
            !input.closest(flexpaneRootSelector) &&
            !input.closest(threadsViewSelector),
        ) || null
      );
    };

    const insertSurface = (): Exclude<Surface, "sidebar"> => {
      const surface = cursor ? surfaceForCursor(cursor) : preferredSurface;
      return surface === "sidebar" ? "main" : surface;
    };

    const isInsertComposer = (composer: HTMLElement): boolean => {
      if (!insertSession) return false;
      if (
        insertSession.target === composer ||
        insertSession.target.contains(composer) ||
        composer.contains(insertSession.target)
      ) {
        return true;
      }
      return composerForSurface(insertSession.surface) === composer;
    };

    const normalModeComposer = (target: EventTarget | null): HTMLElement | null => {
      const composer = composerFromTarget(target) || composerFromTarget(document.activeElement);
      return composer && !isInsertComposer(composer) ? composer : null;
    };

    const leaveNormalModeComposer = (composer: HTMLElement): void => {
      const active = document.activeElement;
      if (active instanceof HTMLElement && (active === composer || composer.contains(active))) {
        active.blur();
      } else {
        composer.blur();
      }
    };

    const focusComposer = (): boolean => {
      const surface = insertSurface();
      const target = composerForSurface(surface);
      if (!target) return false;
      const origin: CursorOrigin | null = cursor
        ? { ...cursor, surface: surfaceForCursor(cursor) }
        : null;
      clearCursor();
      resetPrefixes();
      searchSession = null;
      insertSession = { origin, surface, target };
      target.focus({ preventScroll: true });
      const active = document.activeElement;
      const current = composerForSurface(surface);
      if (
        active === target ||
        (active instanceof Node && target.contains(active)) ||
        active === current ||
        (active instanceof Node && current?.contains(active))
      ) {
        if (current) insertSession.target = current;
        return true;
      }
      insertSession = null;
      restoreCursorOrigin(origin);
      return false;
    };

    const exitInsertMode = (): boolean => {
      if (!insertSession) return false;
      const { origin, surface, target } = insertSession;
      const active = document.activeElement;
      insertSession = null;
      const current = composerForSurface(surface);
      if (
        active instanceof HTMLElement &&
        (active === target ||
          target.contains(active) ||
          active === current ||
          current?.contains(active))
      ) {
        active.blur();
      } else if (target.isConnected) target.blur();
      restoreCursorOrigin(origin);
      return true;
    };

    const searchEditor = (): HTMLElement | null =>
      editorWithin(visibleElement(searchInputSelector));

    const editSearchText = (
      target: HTMLElement,
      operation: "delete" | "insert",
      text = "",
    ): void => {
      target.focus({ preventScroll: true });
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        const end = target.selectionEnd ?? target.value.length;
        const start = target.selectionStart ?? end;
        const rangeStart = operation === "delete" && start === end ? Math.max(0, start - 1) : start;
        const replacement = operation === "insert" ? text : "";
        target.setRangeText(replacement, rangeStart, end, "end");
        target.dispatchEvent(
          new InputEvent("input", {
            bubbles: true,
            data: operation === "insert" ? text : null,
            inputType: operation === "insert" ? "insertText" : "deleteContentBackward",
          }),
        );
        return;
      }
      if (operation === "insert") document.execCommand("insertText", false, text);
      else document.execCommand("delete");
    };

    const focusSearchInput = (target = searchEditor()): boolean => {
      if (!target) return false;
      target.focus({ preventScroll: true });
      const focused = document.activeElement === target || target.contains(document.activeElement);
      if (focused && searchSession && !searchSession.restoring && searchSession.pendingText) {
        const pendingText = searchSession.pendingText;
        searchSession.pendingText = "";
        editSearchText(target, "insert", pendingText);
      }
      return focused;
    };

    const scheduleSearchFocus = (attempt = 0): void => {
      cancelPendingFocus = klack.timers.animationFrame(() => {
        cancelPendingFocus = null;
        if (!searchSession || searchSession.restoring || focusSearchInput() || attempt >= 60) return;
        scheduleSearchFocus(attempt + 1);
      });
    };

    const finishSearchRestore = (): void => {
      if (!searchSession?.restoring) return;
      const { origin } = searchSession;
      searchSession = null;
      cancelDeferredFocus();
      cancelSearchRestore();
      restoreCursorOrigin(origin);
    };

    const scheduleSearchRestore = (origin: CursorOrigin | null, attempt = 0): void => {
      cancelPendingSearchRestore = klack.timers.animationFrame(() => {
        cancelPendingSearchRestore = null;
        if (!searchSession?.restoring || searchSession.origin !== origin) return;
        if (searchEditor()) {
          if (attempt < 120) scheduleSearchRestore(origin, attempt + 1);
          return;
        }
        finishSearchRestore();
      });
    };

    const openSearch = (): boolean => {
      const team = teamFromLocation();
      const slackWindow = window as SlackWindow;
      const teamDelegate = team ? slackWindow.desktopDelegates?.[team] : undefined;
      const delegate = teamDelegate?.startSearch ? teamDelegate : slackWindow.desktopDelegate;
      const existingInput = searchEditor();
      const trigger = visibleElement(topNavSearchSelector);
      if (!existingInput && !delegate?.startSearch && !trigger) return false;

      if (!existingInput && !delegate?.startSearch && !clickEnabled(trigger)) return false;
      const origin: CursorOrigin | null = cursor
        ? { ...cursor, surface: surfaceForCursor(cursor) }
        : null;
      cancelSearchRestore();
      clearCursor();
      resetPrefixes();
      insertSession = null;
      searchSession = { origin, pendingText: "", restoring: false };
      if (existingInput) return focusSearchInput(existingInput);
      if (delegate?.startSearch) delegate.startSearch();
      if (!focusSearchInput()) scheduleSearchFocus();
      return true;
    };

    const originFor = (message: HTMLElement, identity: string | null): ThreadOrigin => ({
      element: message,
      identity,
      surface: message.closest(threadsViewSelector) ? "threads" : "main",
    });

    const restoreOrigin = (origin: ThreadOrigin): void => {
      preferredSurface = origin.surface;
      const root = visibleElement(
        origin.surface === "threads" ? threadsViewSelector : messagePaneSelector,
      );
      const replacement =
        root && origin.identity
          ? canonicalElements(root, messageRowSelector).find(
              (message) => messageIdentity(message) === origin.identity,
            )
          : null;
      const target = replacement || (origin.element.isConnected ? origin.element : null);
      if (target) select(target, "message");
    };

    const messageSurface = (): { id: Exclude<Surface, "sidebar">; root: HTMLElement } | null => {
      if (cursor?.kind === "message" && cursor.element.isConnected) {
        const selectedThread = cursor.element.closest(threadPaneSelector);
        if (selectedThread && isRendered(selectedThread)) return { id: "thread", root: selectedThread };
        const selectedThreadsView = cursor.element.closest(threadsViewSelector);
        if (selectedThreadsView && isRendered(selectedThreadsView)) {
          return { id: "threads", root: selectedThreadsView };
        }
        const selectedMain = cursor.element.closest(messagePaneSelector);
        if (selectedMain && isRendered(selectedMain)) return { id: "main", root: selectedMain };
      }

      const active = document.activeElement;
      if (active instanceof Element) {
        const activeThread = active.closest(threadPaneSelector);
        if (activeThread && isRendered(activeThread)) return { id: "thread", root: activeThread };
        const activeThreadsView = active.closest(threadsViewSelector);
        if (activeThreadsView && isRendered(activeThreadsView)) {
          return { id: "threads", root: activeThreadsView };
        }
      }

      const selectors: Array<[Exclude<Surface, "sidebar">, string]> =
        preferredSurface === "thread"
          ? [["thread", threadPaneSelector], ["threads", threadsViewSelector], ["main", messagePaneSelector]]
          : preferredSurface === "threads"
            ? [["threads", threadsViewSelector], ["thread", threadPaneSelector], ["main", messagePaneSelector]]
            : [["main", messagePaneSelector], ["thread", threadPaneSelector], ["threads", threadsViewSelector]];
      for (const [id, selector] of selectors) {
        const root = visibleElement(selector);
        if (root) return { id, root };
      }
      return null;
    };

    const moveWithin = (
      root: HTMLElement,
      selector: string,
      kind: CursorKind,
      direction: Direction,
      amount = 1,
    ): boolean => {
      cancelBoundaryRetry?.();
      cancelBoundaryRetry = null;
      const elements = canonicalElements(root, selector);
      if (elements.length === 0) return false;

      let current = -1;
      if (cursor?.kind === kind) {
        current = elements.indexOf(cursor.element);
        if (current < 0 && cursor.identity) {
          current = elements.findIndex((element) => identityFor(element, kind) === cursor?.identity);
        }
      }

      let remaining = Math.max(1, Math.trunc(amount));
      let anchor = current;
      if (anchor < 0) {
        anchor = initialIndex(elements, root, direction);
        if (anchor < 0) return false;
        remaining -= 1;
      }
      const next = remaining > 0
        ? movedIndex(elements.length, anchor, direction, remaining)
        : anchor;
      remaining -= Math.abs(next - anchor);
      select(elements[next], kind);

      const reconcile = (
        anchorElement: HTMLElement,
        anchorIdentity: string | null,
        steps: number,
        idleFrames: number,
      ): void => {
        cancelBoundaryRetry = klack.timers.animationFrame(() => {
          cancelBoundaryRetry = null;
          const refreshed = canonicalElements(root, selector);
          if (refreshed.length === 0) {
            if (idleFrames < 2) reconcile(anchorElement, anchorIdentity, steps, idleFrames + 1);
            return;
          }

          const refreshedAnchor = anchorIdentity
            ? refreshed.findIndex((element) => identityFor(element, kind) === anchorIdentity)
            : refreshed.indexOf(anchorElement);
          let candidate = refreshedAnchor;
          let progressed = 0;
          if (refreshedAnchor < 0) {
            candidate = initialIndex(refreshed, root, direction);
            progressed = candidate >= 0 ? 1 : 0;
          } else {
            candidate = movedIndex(refreshed.length, refreshedAnchor, direction, steps);
            progressed = Math.abs(candidate - refreshedAnchor);
          }
          if (candidate < 0) return;

          const nextElement = refreshed[candidate];
          const nextIdentity = identityFor(nextElement, kind);
          const stepsLeft = Math.max(0, steps - progressed);
          if (progressed > 0) select(nextElement, kind);
          if (stepsLeft === 0) return;

          if (progressed === 0 && idleFrames < 2) {
            reconcile(anchorElement, anchorIdentity, steps, idleFrames + 1);
            return;
          }
          if (scrollPastBoundary(nextElement, root, direction)) {
            reconcile(nextElement, nextIdentity, stepsLeft, 0);
          }
        });
      };

      if (remaining > 0 && scrollPastBoundary(elements[next], root, direction)) {
        reconcile(elements[next], identityFor(elements[next], kind), remaining, 0);
      }
      return true;
    };

    const moveSidebar = (direction: Direction, amount = 1): boolean => {
      const root = visibleElement(sidebarRootSelector);
      if (!root) return false;
      preferredSurface = "sidebar";
      return moveWithin(root, sidebarItemSelector, "sidebar", direction, amount);
    };

    const moveMessages = (direction: Direction, amount = 1): boolean => {
      const surface = messageSurface();
      if (!surface) return false;
      preferredSurface = surface.id;
      return moveWithin(surface.root, messageRowSelector, "message", direction, amount);
    };

    const pageWithin = (
      root: HTMLElement,
      selector: string,
      kind: CursorKind,
      direction: Direction,
      fraction: number,
      pages: number,
    ): boolean => {
      cancelBoundaryRetry?.();
      cancelBoundaryRetry = null;
      const elements = canonicalElements(root, selector);
      if (elements.length === 0) return false;

      let anchor = cursor?.kind === kind ? elements.indexOf(cursor.element) : -1;
      if (anchor < 0 && cursor?.kind === kind && cursor.identity) {
        anchor = elements.findIndex((element) => identityFor(element, kind) === cursor?.identity);
      }
      if (anchor < 0) {
        anchor = initialIndex(elements, root, direction);
        if (anchor < 0) return false;
        select(elements[anchor], kind);
      }

      const anchorElement = elements[anchor];
      const anchorIdentity = identityFor(anchorElement, kind);
      let scroller: HTMLElement | null = anchorElement.parentElement;
      while (scroller && root.contains(scroller)) {
        if (scroller.scrollHeight > scroller.clientHeight + 1) {
          const scrollerRect = scroller.getBoundingClientRect();
          const anchorRect = anchorElement.getBoundingClientRect();
          const yOffset = anchorRect.top + anchorRect.height / 2 - scrollerRect.top;
          const previous = scroller.scrollTop;
          const distance =
            scroller.clientHeight * fraction * Math.min(Math.max(1, pages), MAX_PAGE_COUNT);
          scroller.scrollBy({ top: direction === "next" ? distance : -distance });
          if (scroller.scrollTop !== previous) {
            const reconcile = (attempt: number): void => {
              cancelBoundaryRetry = klack.timers.animationFrame(() => {
                cancelBoundaryRetry = null;
                const refreshed = canonicalElements(root, selector);
                if (refreshed.length === 0) {
                  if (attempt < 2) reconcile(attempt + 1);
                  return;
                }
                const currentScrollerRect = scroller?.getBoundingClientRect();
                if (!currentScrollerRect) return;
                const target = refreshed.reduce((best, element, index) => {
                  const rect = element.getBoundingClientRect();
                  const offset = rect.top + rect.height / 2 - currentScrollerRect.top;
                  return Math.abs(offset - yOffset) < best.distance
                    ? { distance: Math.abs(offset - yOffset), index }
                    : best;
                }, { distance: Number.POSITIVE_INFINITY, index: 0 }).index;
                const targetIdentity = identityFor(refreshed[target], kind);
                if (targetIdentity === anchorIdentity && attempt < 2) {
                  reconcile(attempt + 1);
                  return;
                }
                select(refreshed[target], kind);
              });
            };
            reconcile(0);
            return true;
          }
        }
        if (scroller === root) break;
        scroller = scroller.parentElement;
      }

      select(elements[direction === "next" ? elements.length - 1 : 0], kind);
      return true;
    };

    const movePage = (direction: Direction, fraction: number, pages: number): boolean => {
      if (preferredSurface === "sidebar" || cursor?.kind === "sidebar") {
        const root = visibleElement(sidebarRootSelector);
        if (!root) return false;
        preferredSurface = "sidebar";
        return pageWithin(root, sidebarItemSelector, "sidebar", direction, fraction, pages);
      }
      const surface = messageSurface();
      if (!surface) return false;
      preferredSurface = surface.id;
      return pageWithin(surface.root, messageRowSelector, "message", direction, fraction, pages);
    };

    const boundaryWithin = (
      root: HTMLElement,
      selector: string,
      kind: CursorKind,
    ): boolean => {
      cancelPendingMove();
      const elements = canonicalElements(root, selector);
      if (elements.length === 0) return false;

      const edge = elements[elements.length - 1];
      let candidate: HTMLElement | null = edge.parentElement;
      let scroller: HTMLElement | null = null;
      let largestScrollRange = 1;
      while (candidate && root.contains(candidate)) {
        const scrollRange = candidate.scrollHeight - candidate.clientHeight;
        const overflowY = window.getComputedStyle(candidate).overflowY;
        if (/^(?:auto|scroll|overlay)$/.test(overflowY) && scrollRange > largestScrollRange) {
          scroller = candidate;
          largestScrollRange = scrollRange;
        }
        if (candidate === root) break;
        candidate = candidate.parentElement;
      }
      if (!scroller) {
        select(edge, kind);
        return true;
      }

      const scrollToEdge = (): void => {
        if (!scroller) return;
        scroller.scrollTop = scroller.scrollHeight;
      };
      const startedAt = performance.now();
      let stableSince = startedAt;
      let lastEdge: HTMLElement | null = null;
      let lastIdentity: string | null = null;
      let lastScrollHeight = -1;
      const quietWindow = 200;
      const minimumSettle = 300;
      const maximumSettle = 1_500;
      const reconcile = (): void => {
        cancelBoundaryRetry = klack.timers.timeout(() => {
          cancelBoundaryRetry = null;
          scrollToEdge();
          const refreshed = canonicalElements(root, selector);
          if (refreshed.length === 0) {
            if (performance.now() - startedAt < maximumSettle) reconcile();
            return;
          }
          const refreshedEdge = refreshed[refreshed.length - 1];
          const refreshedIdentity = identityFor(refreshedEdge, kind);
          const now = performance.now();
          const atEdge = scroller
            ? scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1
            : true;
          const sameEdge = refreshedIdentity
            ? refreshedIdentity === lastIdentity
            : refreshedEdge === lastEdge;
          if (!atEdge || !sameEdge || scroller?.scrollHeight !== lastScrollHeight) {
            stableSince = now;
          }
          lastEdge = refreshedEdge;
          lastIdentity = refreshedIdentity;
          lastScrollHeight = scroller?.scrollHeight ?? 0;
          if (cursor?.element !== refreshedEdge || cursor.kind !== kind) {
            paintCursor(refreshedEdge, kind, false);
          }
          const elapsed = now - startedAt;
          if (
            elapsed < minimumSettle ||
            (now - stableSince < quietWindow && elapsed < maximumSettle)
          ) {
            reconcile();
            return;
          }
          select(refreshedEdge, kind);
        }, 50);
      };

      scrollToEdge();
      reconcile();
      return true;
    };

    const moveToBottom = (): boolean => {
      if (preferredSurface === "sidebar" || cursor?.kind === "sidebar") {
        const root = visibleElement(sidebarRootSelector);
        if (!root) return false;
        preferredSurface = "sidebar";
        return boundaryWithin(root, sidebarItemSelector, "sidebar");
      }
      const surface = messageSurface();
      if (!surface) return false;
      preferredSurface = surface.id;
      return boundaryWithin(surface.root, messageRowSelector, "message");
    };

    const enterSidebar = (): boolean => {
      const root = visibleElement(sidebarRootSelector);
      if (!root) return false;
      const items = canonicalElements(root, sidebarItemSelector);
      const active = items.find(
        (item) =>
          item.matches(sidebarSelectedSelector) ||
          item.getAttribute("data-qa-channel-sidebar-channel-is-selected") === "true" ||
          item.querySelector('[data-qa-channel-sidebar-channel-is-selected="true"]') !== null,
      );
      const target = active || items[0];
      if (!target) return false;
      preferredSurface = "sidebar";
      select(target, "sidebar");
      return true;
    };

    const activateSidebar = (): boolean => {
      if (cursor?.kind !== "sidebar" || !cursor.element.isConnected) return false;
      const item = cursor.element;
      const target = item.matches(
        '[data-qa="channel-sidebar-channel"], a[href], button, [role="treeitem"]',
      )
        ? item
        : item.querySelector<HTMLElement>(
            '[data-qa="channel-sidebar-channel"], a[href], button, [role="treeitem"]',
          ) || item;
      if (!clickEnabled(target)) return false;
      clearCursor();
      preferredSurface = "main";
      return true;
    };

    const openWithDeepLink = (message: HTMLElement): boolean => {
      const channel = message.getAttribute("data-msg-channel-id");
      const timestamp = message.getAttribute("data-msg-ts");
      if (!channel || !timestamp || !/^[CDG][A-Z0-9]{8,}$/.test(channel) || !/^\d+(?:\.\d+)?$/.test(timestamp)) {
        return false;
      }

      const team = teamFromLocation();
      const slackWindow = window as SlackWindow;
      const delegate = (team && slackWindow.desktopDelegates?.[team]) || slackWindow.desktopDelegate;
      if (!delegate?.handleDeepLinkWithArgs) return false;
      const timestampElement = message.querySelector(timestampSelector);
      const timestampLink =
        timestampElement instanceof HTMLAnchorElement
          ? timestampElement
          : timestampElement?.querySelector<HTMLAnchorElement>("a[href]");
      const args: DeepLinkArgs = {
        cmd: "channel",
        id: channel,
        message: timestamp,
        team,
        thread_ts: timestampLink
          ? threadTimestampFromUrl(timestampLink.href, timestamp)
          : timestamp,
      };
      delegate.handleDeepLinkWithArgs(JSON.stringify(args));
      return true;
    };

    const beginThreadTransition = (origin: ThreadOrigin): void => {
      cancelPendingThread?.();
      threadOrigin = origin;
      clearCursor();
      preferredSurface = "thread";
      cancelPendingThread = klack.timers.timeout(() => {
        cancelPendingThread = null;
        if (threadPane()) return;
        restoreOrigin(origin);
        threadOrigin = null;
      }, 1_500);
    };

    const openThread = (): boolean => {
      if (cursor?.kind !== "message" || !cursor.element.isConnected) return false;
      const message = cursor.element;
      if (message.closest(threadPaneSelector)) return false;
      const origin = originFor(message, cursor.identity);
      const replyBar =
        message.querySelector<HTMLElement>('[data-qa="reply_bar"]') ||
        message.querySelector<HTMLElement>(replyBarSelector);
      let opened = clickEnabled(replyBar);
      if (!opened) {
        const action = message.querySelector<HTMLElement>(THREAD_ACTION_SELECTOR);
        opened = clickEnabled(action);
      }
      if (!opened) {
        message.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
        opened = clickEnabled(message.querySelector<HTMLElement>(THREAD_ACTION_SELECTOR));
      }
      if (!opened) opened = openWithDeepLink(message);
      if (!opened) return false;
      beginThreadTransition(origin);
      return true;
    };

    const closeThread = (): boolean => {
      const pane = threadPane();
      if (!pane) return false;
      const flexpane = pane.closest<HTMLElement>(flexpaneRootSelector) || pane;
      const close = flexpane.querySelector<HTMLElement>('[data-qa="close_flexpane"]');
      const historyBack = document.querySelector<HTMLElement>(
        '[data-qa="history_back_button"]:not([aria-disabled="true"])',
      );
      if (!clickEnabled(close) && !clickEnabled(historyBack)) return false;

      cancelPendingThread?.();
      cancelPendingThread = null;
      clearCursor();
      if (threadOrigin) restoreOrigin(threadOrigin);
      else preferredSurface = "main";
      threadOrigin = null;
      return true;
    };

    const activate = (): boolean =>
      cursor?.kind === "sidebar" ? activateSidebar() : openThread();

    const moveLeft = (): boolean => {
      const surface = messageSurface();
      if (surface?.id === "thread") return closeThread();
      if (preferredSurface === "sidebar" || cursor?.kind === "sidebar") return false;
      return enterSidebar();
    };

    const unwind = (): boolean => {
      if (threadPane()) return closeThread();
      if (!cursor) return false;
      clearCursor();
      return true;
    };

    const handleKeyDown = (event: KeyboardEvent): void => {
      const plainEscape =
        event.key === "Escape" &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey &&
        !event.defaultPrevented &&
        !event.isComposing;
      const targetElement = elementFromTarget(event.target);
      if (plainEscape && searchSession) {
        const { origin } = searchSession;
        searchSession.pendingText = "";
        searchSession.restoring = true;
        cancelDeferredFocus();
        cancelSearchRestore();
        scheduleSearchRestore(origin);
        resetPrefixes();
        if (!targetElement?.closest(searchInputSelector) && !searchEditor()) {
          finishSearchRestore();
          event.preventDefault();
          event.stopImmediatePropagation();
        }
        return;
      }
      if (
        searchSession &&
        !searchSession.restoring &&
        !targetElement?.closest(searchInputSelector)
      ) {
        const target = searchEditor();
        const focused = target ? focusSearchInput(target) : false;
        const plainText =
          !event.altKey &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.isComposing &&
          event.key.length === 1;
        if (plainText) {
          if (target && focused) editSearchText(target, "insert", event.key);
          else searchSession.pendingText += event.key;
        } else if (
          event.key === "Backspace" &&
          !event.altKey &&
          !event.ctrlKey &&
          !event.metaKey
        ) {
          if (target && focused) editSearchText(target, "delete");
          else searchSession.pendingText = searchSession.pendingText.slice(0, -1);
        }
        if (!event.altKey && !event.ctrlKey && !event.metaKey) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
        return;
      }
      if (
        plainEscape &&
        insertSession &&
        !hasBlockingSurface() &&
        exitInsertMode()
      ) {
        resetPrefixes();
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }

      const focusedNormalComposer = normalModeComposer(event.target);
      const command = keyCommand(event);
      if (!command) {
        resetPrefixes();
        if (focusedNormalComposer && shouldSuppressNormalModeKey(event)) {
          leaveNormalModeComposer(focusedNormalComposer);
          event.preventDefault();
          event.stopImmediatePropagation();
        }
        return;
      }
      if (
        (!focusedNormalComposer &&
          (hasNativeKeyboardTarget(event.target) || hasNativeKeyboardTarget(document.activeElement))) ||
        hasBlockingSurface()
      ) {
        resetPrefixes();
        return;
      }

      const leftNormalComposer = focusedNormalComposer !== null;
      if (focusedNormalComposer) leaveNormalModeComposer(focusedNormalComposer);
      cancelPendingMove();
      cancelDeferredFocus();
      if (command === "count") {
        const nextPrefix = appendCountDigit(countPrefix, event.key);
        if (!nextPrefix) return;
        countPrefix = nextPrefix;
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }

      const hadCursor = cursor !== null;
      const hadCount = countPrefix.length > 0;
      const amount = takeCount();
      let handled = false;
      if (command === "next" || command === "previous") {
        const direction = command === "next" ? "next" : "previous";
        handled =
          preferredSurface === "sidebar" || cursor?.kind === "sidebar"
            ? moveSidebar(direction, amount)
            : moveMessages(direction, amount);
      } else if (command === "page-next" || command === "page-previous") {
        handled = movePage(command === "page-next" ? "next" : "previous", 0.9, amount);
      } else if (command === "half-next" || command === "half-previous") {
        handled = movePage(command === "half-next" ? "next" : "previous", 0.5, amount);
      } else if (command === "bottom") handled = moveToBottom();
      else if (command === "left") handled = moveLeft();
      else if (command === "activate") handled = activate();
      else if (command === "insert") handled = focusComposer();
      else if (command === "search") handled = openSearch();
      else handled = unwind();

      if (!handled && !hadCursor && !hadCount && !leftNormalComposer) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };

    const handleBeforeInput = (event: InputEvent): void => {
      if (event.defaultPrevented) return;
      const composer = normalModeComposer(event.target);
      if (!composer) return;
      leaveNormalModeComposer(composer);
      event.preventDefault();
      event.stopImmediatePropagation();
    };

    const updateSurfaceFromClick = (event: MouseEvent): void => {
      if (!(event.target instanceof Element)) return;
      resetPrefixes();
      cancelPendingMove();
      cancelDeferredFocus();
      if (searchSession && !event.target.closest(searchInputSelector)) {
        searchSession = null;
        cancelSearchRestore();
      }
      const clickedComposer = composerFromTarget(event.target);
      if (insertSession && (!clickedComposer || !isInsertComposer(clickedComposer))) {
        insertSession = null;
      }
      const closeAction = event.target.closest(
        '[data-qa="close_flexpane"], [data-qa="history_back_button"]',
      );
      if (closeAction) {
        clearCursor();
        klack.timers.animationFrame(() => {
          if (threadPane()) return;
          threadOrigin = null;
          if (preferredSurface === "thread") preferredSurface = "main";
        });
        return;
      }

      const threadAction =
        event.target.closest('[data-qa="reply_bar"]') ||
        event.target.closest(replyBarSelector) ||
        event.target.closest(THREAD_ACTION_SELECTOR);
      if (threadAction) {
        const message = threadAction.closest(messageRowSelector);
        if (message instanceof HTMLElement && !message.closest(threadPaneSelector)) {
          threadOrigin = originFor(message, messageIdentity(message));
        }
        preferredSurface = "thread";
      } else if (event.target.closest(sidebarRootSelector)) preferredSurface = "sidebar";
      else if (event.target.closest(threadPaneSelector)) preferredSurface = "thread";
      else if (event.target.closest(threadsViewSelector)) preferredSurface = "threads";
      else if (event.target.closest(messagePaneSelector)) preferredSurface = "main";
      else return;
      clearCursor();
    };

    klack.ui.addStyle(
      `
        [${SELECTED_ATTRIBUTE}] {
          outline: 2px solid rgb(var(--sk_highlight, 18, 100, 163)) !important;
          outline-offset: -2px;
          scroll-margin-block: 48px;
        }

        [${SELECTED_ATTRIBUTE}="sidebar"][${SELECTED_ATTRIBUTE}] {
          background: rgba(var(--sk_highlight, 18, 100, 163), 0.24) !important;
          box-shadow: inset 4px 0 0 rgb(var(--sk_highlight, 18, 100, 163)) !important;
          border-radius: 6px !important;
        }

        [${SELECTED_ATTRIBUTE}="message"][${SELECTED_ATTRIBUTE}] {
          background: rgba(var(--sk_highlight, 18, 100, 163), 0.12) !important;
          box-shadow: inset 4px 0 0 rgb(var(--sk_highlight, 18, 100, 163)) !important;
        }
      `,
      { id: "vim-navigation" },
    );
    klack.events.on(document, "keydown", handleKeyDown, true);
    klack.events.on(document, "beforeinput", handleBeforeInput, true);
    klack.events.on(document, "click", updateSurfaceFromClick);
    klack.dom.watch(searchInputSelector, (container) => {
      const focusOpenedSearch = (): void => {
        if (!searchSession || searchSession.restoring || !isRendered(container)) return;
        focusSearchInput(editorWithin(container));
      };
      focusOpenedSearch();
      const cancelFrame = klack.timers.animationFrame(focusOpenedSearch);
      return () => {
        cancelFrame();
        if (searchSession?.restoring) scheduleSearchRestore(searchSession.origin);
      };
    });
    klack.dom.watch(threadPaneSelector, (pane) => {
      const activateThreadSurface = (): void => {
        if (!isRendered(pane)) return;
        resetPrefixes();
        if (cursor?.kind === "message" && !cursor.element.closest(threadPaneSelector)) {
          threadOrigin = originFor(cursor.element, cursor.identity);
          clearCursor();
        }
        preferredSurface = "thread";
      };
      activateThreadSurface();
      const cancelFrame = klack.timers.animationFrame(activateThreadSurface);
      return () => {
        cancelFrame();
        if (document.querySelector(threadPaneSelector) || cancelPendingThread) return;
        threadOrigin = null;
        if (preferredSurface === "thread") preferredSurface = "main";
      };
    });
    klack.cleanup(() => {
      cancelBoundaryRetry?.();
      cancelPendingSearchRestore?.();
      cancelPendingThread?.();
      clearCursor();
      resetPrefixes();
      insertSession = null;
      searchSession = null;
      threadOrigin = null;
    });
  },
});
