import { definePlugin } from "klack/sdk";

import {
  appendCountDigit,
  countValue,
  keyCommand,
  movedIndex,
  movedVisualIndex,
  shouldEnterGlobalSearchResults,
  shouldSuppressNormalModeKey,
  threadTimestampFromUrl,
  visualMotionCommand,
  wrappedIndex,
  type Direction,
  type VisualMotion,
} from "./lib/vim-navigation";

type CursorKind = "message" | "search" | "sidebar";
type Surface = "main" | "sidebar" | "thread" | "threads";

type Cursor = {
  element: HTMLElement;
  identity: string | null;
  kind: CursorKind;
  surface: Surface;
};

type ThreadOrigin = {
  element: HTMLElement;
  identity: string | null;
  surface: "main" | "threads";
};

type CursorOrigin = Cursor;

type InsertSession = {
  origin: CursorOrigin | null;
  surface: Exclude<Surface, "sidebar">;
  target: HTMLElement;
};

type SearchSession = {
  awaitingResults: boolean;
  initialText: string;
  kind: "global" | "sidebar";
  origin: CursorOrigin | null;
  pendingText: string;
  phase: "open" | "results" | "typing";
  resultIdentity: string | null;
  restoring: boolean;
};

type ReactionSession = {
  origin: CursorOrigin;
  phase: "open" | "opening";
};

type ContentSession = {
  index: number;
  origin: CursorOrigin;
  targetKey: string | null;
};

type ContentTarget = {
  element: HTMLElement;
  kind: "image" | "link";
  key: string | null;
};

type VisualSession = {
  anchor: number;
  head: number;
  origin: CursorOrigin;
  renderedRange: Range | null;
  text: string;
  token: number;
};

type DomPoint = {
  node: Node;
  offset: number;
};

type VisualUnit = {
  end: DomPoint;
  start: DomPoint;
  text: string;
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
const TEXT_ENTRY_TARGET_SELECTOR = [
  "input",
  "textarea",
  "select",
  '[contenteditable]:not([contenteditable="false"])',
  '[role="combobox"]',
  '[role="searchbox"]',
  '[role="textbox"]',
].join(", ");
const CONTENT_SELECTED_ATTRIBUTE = "data-klack-vim-content-selected";
const SELECTED_ATTRIBUTE = "data-klack-vim-selected";
const SIDEBAR_SEARCH_ATTRIBUTE = "data-klack-vim-sidebar-search";
const VISUAL_SELECTED_ATTRIBUTE = "data-klack-vim-visual-selected";
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

function graphemeParts(value: string): Array<{ index: number; segment: string }> {
  if (typeof Intl.Segmenter === "function") {
    return Array.from(
      new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value),
      ({ index, segment }) => ({ index, segment }),
    );
  }
  const parts: Array<{ index: number; segment: string }> = [];
  let index = 0;
  for (const segment of value) {
    parts.push({ index, segment });
    index += segment.length;
  }
  return parts;
}

function visualUnits(root: HTMLElement): VisualUnit[] {
  const units: VisualUnit[] = [];
  const visit = (node: Node): void => {
    if (node instanceof Text) {
      const parent = node.parentElement;
      if (!parent || parent.closest('[hidden], [aria-hidden="true"]')) return;
      const style = window.getComputedStyle(parent);
      if (style.display === "none" || style.visibility === "hidden") return;
      const parts = graphemeParts(node.data);
      parts.forEach(({ index, segment }) => {
        units.push({
          end: { node, offset: index + segment.length },
          start: { node, offset: index },
          text: segment,
        });
      });
      return;
    }
    if (!(node instanceof Element)) return;
    if (node !== root) {
      if (node.matches('[hidden], [aria-hidden="true"], script, style')) return;
      const style = window.getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden") return;
    }
    if (node instanceof HTMLBRElement || node instanceof HTMLImageElement) {
      const parent = node.parentNode;
      if (!parent) return;
      const offset = Array.prototype.indexOf.call(parent.childNodes, node) as number;
      const text =
        node instanceof HTMLBRElement
          ? "\n"
          : node.getAttribute("data-stringify-text") ||
            node.getAttribute("alt") ||
            node.getAttribute("aria-label") ||
            "";
      if (text) {
        units.push({
          end: { node: parent, offset: offset + 1 },
          start: { node: parent, offset },
          text,
        });
      }
      return;
    }
    Array.from(node.childNodes).forEach(visit);
  };
  Array.from(root.childNodes).forEach(visit);
  return units;
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
  if (!scroller) return false;
  const rowHeight = Math.ceil(element.getBoundingClientRect().height);
  const distance = Math.max(24, Math.min(80, rowHeight || 80));
  const previous = scroller.scrollTop;
  scroller.scrollBy({ top: direction === "next" ? distance : -distance });
  return scroller.scrollTop !== previous;
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

function searchResultIdentity(result: Element): string | null {
  const message = result.matches("[data-msg-channel-id][data-msg-ts]")
    ? result
    : result.querySelector("[data-msg-channel-id][data-msg-ts]");
  if (message) {
    const identity = messageIdentity(message);
    if (identity) return identity;
  }
  const timestamp = result.matches("a[data-ts][href]")
    ? result
    : result.querySelector("a[data-ts][href]");
  if (!(timestamp instanceof HTMLAnchorElement)) return null;
  return `timestamp:${timestamp.getAttribute("data-ts") || ""}:${timestamp.href}`;
}

function identityFor(element: Element, kind: CursorKind): string | null {
  if (kind === "message") return messageIdentity(element);
  if (kind === "search") return searchResultIdentity(element);
  return sidebarIdentity(element);
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
  description:
    "Adds Vim-style navigation, content browsing, reactions, search, selection, and insert mode across Slack conversations and threads.",
  defaultEnabled: false,
  setup(klack) {
    const messagePaneSelector = klack.selectors.get("slack.message.pane");
    const messageRowSelector = klack.selectors.get("slack.message.row");
    const messageBodySelector = klack.selectors.get("slack.message.body");
    const replyBarSelector = klack.selectors.get("slack.message.reply-bar");
    const reactionActionSelector = klack.selectors.get("slack.message.add-reaction-action");
    const timestampSelector = klack.selectors.get("slack.message.timestamp");
    const composerInputSelector = klack.selectors.get("slack.composer.input");
    const attachmentImageSelector = klack.selectors.get("slack.attachment.image");
    const emojiPickerRootSelector = klack.selectors.get("slack.emoji-picker.root");
    const fileImageSelector = klack.selectors.get("slack.file.image");
    const fileImageThumbnailSelector = klack.selectors.get("slack.file.image-thumbnail");
    const flexpaneRootSelector = klack.selectors.get("slack.flexpane.root");
    const mediaViewerCloseSelector = klack.selectors.get("slack.media-viewer.close");
    const mediaViewerImageSelector = klack.selectors.get("slack.media-viewer.image");
    const mediaViewerNextSelector = klack.selectors.get("slack.media-viewer.next");
    const mediaViewerPreviousSelector = klack.selectors.get("slack.media-viewer.previous");
    const mediaViewerRootSelector = klack.selectors.get("slack.media-viewer.root");
    const searchInputSelector = klack.selectors.get("slack.search.dialog-input");
    const searchAutocompleteFooterSelector = klack.selectors.get(
      "slack.search.autocomplete-footer",
    );
    const searchResultSelector = klack.selectors.get("slack.search.result");
    const searchSuggestionSelector = klack.selectors.get("slack.search.suggestion");
    const searchViewSelector = klack.selectors.get("slack.search.view");
    const sidebarChannelItemSelector = klack.selectors.get("slack.sidebar.channel-item");
    const sidebarItemSelector = klack.selectors.get("slack.sidebar.item");
    const sidebarFilterSelector = klack.selectors.get("slack.sidebar.conversation-filter");
    const sidebarRootSelector = klack.selectors.get("slack.sidebar.root");
    const sidebarSelectedSelector = klack.selectors.get("slack.sidebar.item-selected");
    const threadPaneSelector = klack.selectors.get("slack.thread.pane");
    const threadReplyContainerSelector = klack.selectors.get("slack.thread.reply-container");
    const threadsCardSelector = klack.selectors.get("slack.threads.card");
    const threadsFooterSelector = klack.selectors.get("slack.threads.footer");
    const threadsItemSelector = klack.selectors.get("slack.threads.item");
    const threadsViewSelector = klack.selectors.get("slack.threads.view");
    const topNavSearchSelector = klack.selectors.get("slack.top-nav.search-trigger");

    let cursor: Cursor | null = null;
    let preferredSurface: Surface = "main";
    let threadOrigin: ThreadOrigin | null = null;
    let cancelBoundaryRetry: (() => void) | null = null;
    let cancelPendingFocus: (() => void) | null = null;
    let cancelPendingMediaNavigation: (() => void) | null = null;
    let cancelPendingReaction: (() => void) | null = null;
    let cancelPendingReactionRestore: (() => void) | null = null;
    let cancelPendingSearchRestore: (() => void) | null = null;
    let cancelPendingThread: (() => void) | null = null;
    let cancelPendingThreadTeardown: (() => void) | null = null;
    let centerPrefixPending = false;
    let countPrefix = "";
    let insertSession: InsertSession | null = null;
    let contentSession: ContentSession | null = null;
    let activatingContentTarget = false;
    let activatingReactionAction = false;
    let drainPendingThreadMovement: (() => void) | null = null;
    const pendingThreadMovements: Array<{ amount: number; direction: Direction }> = [];
    let threadMovementInFlight = false;
    let reactionSession: ReactionSession | null = null;
    let searchSession: SearchSession | null = null;
    let topPrefixPending = false;
    let visualSessionToken = 0;
    let visualSession: VisualSession | null = null;

    const keyboardBlocked = (): boolean =>
      hasBlockingSurface() || Boolean(visibleElement(emojiPickerRootSelector));

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
      centerPrefixPending = false;
      topPrefixPending = false;
    };

    const takeCount = (): number => {
      const count = countValue(countPrefix);
      resetCount();
      return count;
    };

    const queueThreadMovement = (direction: Direction, amount: number): void => {
      const last = pendingThreadMovements[pendingThreadMovements.length - 1];
      const lastIsInFlight = threadMovementInFlight && pendingThreadMovements.length === 1;
      if (last?.direction === direction && !lastIsInFlight) last.amount += amount;
      else pendingThreadMovements.push({ amount, direction });
      drainPendingThreadMovement?.();
    };

    const cancelDeferredFocus = (): void => {
      cancelPendingFocus?.();
      cancelPendingFocus = null;
    };

    const cancelMediaNavigation = (): void => {
      cancelPendingMediaNavigation?.();
      cancelPendingMediaNavigation = null;
    };

    const cancelReactionRestore = (): void => {
      cancelPendingReactionRestore?.();
      cancelPendingReactionRestore = null;
    };

    const cancelSearchRestore = (): void => {
      cancelPendingSearchRestore?.();
      cancelPendingSearchRestore = null;
    };

    const cancelPendingMove = (): void => {
      cancelBoundaryRetry?.();
      cancelBoundaryRetry = null;
    };

    const cancelThreadTeardown = (): void => {
      cancelPendingThreadTeardown?.();
      cancelPendingThreadTeardown = null;
    };

    const clearContentSession = (): void => {
      document.querySelectorAll(`[${CONTENT_SELECTED_ATTRIBUTE}]`).forEach((element) => {
        element.removeAttribute(CONTENT_SELECTED_ATTRIBUTE);
      });
      contentSession = null;
    };

    const clearVisualSession = (): void => {
      document.querySelectorAll(`[${VISUAL_SELECTED_ATTRIBUTE}]`).forEach((element) => {
        element.removeAttribute(VISUAL_SELECTED_ATTRIBUTE);
      });
      const selection = window.getSelection();
      if (visualSession?.renderedRange && selection?.rangeCount === 1) {
        const current = selection.getRangeAt(0);
        const owned = visualSession.renderedRange;
        if (
          current.startContainer === owned.startContainer &&
          current.startOffset === owned.startOffset &&
          current.endContainer === owned.endContainer &&
          current.endOffset === owned.endOffset
        ) {
          selection.removeAllRanges();
        }
      }
      visualSession = null;
    };

    const clearCursor = (): void => {
      cancelPendingMove();
      cancelDeferredFocus();
      cancelPendingReaction?.();
      cancelPendingReaction = null;
      cancelReactionRestore();
      reactionSession = null;
      clearContentSession();
      clearVisualSession();
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
      const identity = identityFor(element, kind);
      const surface: Surface =
        kind === "sidebar"
          ? "sidebar"
          : kind === "search"
            ? searchSession?.origin?.surface || preferredSurface
            : element.closest(threadPaneSelector)
              ? "thread"
              : element.closest(threadsViewSelector)
                ? "threads"
                : "main";
      cursor = { element, identity, kind, surface };
      if (kind === "search" && searchSession?.kind === "global") {
        searchSession.resultIdentity = identity;
      }
      if (scroll) element.scrollIntoView({ block: "nearest", inline: "nearest" });
    };

    const select = (element: HTMLElement, kind: CursorKind): void => {
      clearCursor();
      paintCursor(element, kind, true);
    };

    const threadPane = (): HTMLElement | null => visibleElement(threadPaneSelector);

    const surfaceForCursor = (candidate: Cursor): Surface => candidate.surface;

    const rootForSurface = (surface: Surface): HTMLElement | null => {
      if (surface === "sidebar") return visibleElement(sidebarRootSelector);
      if (surface === "thread") return threadPane();
      if (surface === "threads") return visibleElement(threadsViewSelector);
      return visibleElement(messagePaneSelector);
    };

    const restoreCursorOrigin = (origin: CursorOrigin | null): boolean => {
      if (!origin) return false;
      preferredSurface = origin.surface;
      const root = rootForSurface(origin.surface);
      const selector =
        origin.kind === "sidebar"
          ? sidebarItemSelector
          : origin.kind === "search"
            ? searchResultSelector
            : messageRowSelector;
      const replacement =
        root && origin.identity
          ? canonicalElements(root, selector).find(
              (element) => identityFor(element, origin.kind) === origin.identity,
            )
          : null;
      const fallbackMatches =
        !origin.identity || identityFor(origin.element, origin.kind) === origin.identity;
      const target =
        replacement || (fallbackMatches && isRendered(origin.element) ? origin.element : null);
      if (!target) return false;
      select(target, origin.kind);
      return true;
    };

    const messageForOrigin = (origin: CursorOrigin): HTMLElement | null => {
      const root = rootForSurface(origin.surface);
      const replacement =
        root && origin.identity
          ? canonicalElements(root, messageRowSelector).find(
              (message) => messageIdentity(message) === origin.identity,
            )
          : null;
      const fallbackMatches =
        !origin.identity || messageIdentity(origin.element) === origin.identity;
      return replacement || (fallbackMatches && isRendered(origin.element) ? origin.element : null);
    };

    const messageBodyElements = (message: HTMLElement): HTMLElement[] => {
      const exactBodies = Array.from(
        message.querySelectorAll<HTMLElement>('[data-qa="message-text"]'),
      ).filter(isRendered);
      if (exactBodies.length > 0) return exactBodies;
      const bodies = Array.from(message.querySelectorAll(messageBodySelector)).filter(isRendered);
      if (message.matches(messageBodySelector) && isRendered(message)) bodies.unshift(message);
      return bodies;
    };

    const contentTargetsForMessage = (message: HTMLElement): ContentTarget[] => {
      const bodies = messageBodyElements(message);
      const seen = new Set<HTMLElement>();
      const targets: ContentTarget[] = [];
      const addTarget = (element: HTMLElement, kind: ContentTarget["kind"]): void => {
        if (seen.has(element) || !isRendered(element)) return;
        if (element.closest(messageRowSelector) !== message) return;
        if (element instanceof HTMLAnchorElement) {
          const href = element.getAttribute("href")?.trim() || "";
          if (!href || /^\s*(?:data|javascript):/i.test(href)) return;
        }
        const fileOwner = element.matches("[data-file-id]")
          ? element
          : element.closest<HTMLElement>("[data-file-id]") ||
            element.querySelector<HTMLElement>("[data-file-id]");
        const fileId = fileOwner?.getAttribute("data-file-id") || "";
        const href = element instanceof HTMLAnchorElement
          ? element.href
          : element.closest<HTMLAnchorElement>("a[href]")?.href || "";
        const image = element.matches("img[src]")
          ? element
          : element.querySelector<HTMLImageElement>("img[src]");
        const source = image instanceof HTMLImageElement ? image.currentSrc || image.src : "";
        const key = fileId
          ? `${kind}:file:${fileId}`
          : href
            ? `${kind}:href:${href}`
            : source
              ? `${kind}:src:${source}`
              : null;
        seen.add(element);
        targets.push({ element, key, kind });
      };
      for (const body of bodies) {
        for (const link of Array.from(body.querySelectorAll<HTMLAnchorElement>("a[href]"))) {
          if (link.closest(messageRowSelector) !== message) continue;
          if (link.closest(timestampSelector) || link.closest(replyBarSelector)) continue;
          if (link.closest(THREAD_ACTION_SELECTOR)) continue;
          if (
            link.closest(
              [
                '[data-qa="message-actions"]',
                '[data-qa="message_attachment_default"]',
                '[data-qa="channel_link"]',
                '[data-stringify-type="mention"]',
                ".c-member_slug",
                ".c-mrkdwn__user_group",
                ".internal_channel_link",
                ".c-message__actions",
                ".c-message_kit__avatar",
              ].join(", "),
            )
          ) {
            continue;
          }
          addTarget(link, "link");
        }
      }

      const actionableSelector = [
        "a[href]",
        "button",
        '[role="button"]',
        '[role="link"]',
        '[tabindex]:not([tabindex="-1"])',
      ].join(", ");
      const mediaSelector = [
        attachmentImageSelector,
        fileImageThumbnailSelector,
        fileImageSelector,
      ].join(", ");
      for (const media of Array.from(message.querySelectorAll<HTMLElement>(mediaSelector))) {
        if (!isRendered(media) || media.closest(messageRowSelector) !== message) continue;
        const closestAction = media.closest<HTMLElement>(actionableSelector);
        const containedAction = media.querySelector<HTMLElement>(actionableSelector);
        const action =
          closestAction &&
          closestAction !== message &&
          !closestAction.matches(messageRowSelector) &&
          closestAction.closest(messageRowSelector) === message
            ? closestAction
            : containedAction?.closest(messageRowSelector) === message
              ? containedAction
              : null;
        if (action) {
          const uploadedImage =
            action.matches(fileImageThumbnailSelector) ||
            Boolean(action.closest(fileImageThumbnailSelector)) ||
            Boolean(action.querySelector(fileImageThumbnailSelector)) ||
            action.matches("[data-file-id]") ||
            Boolean(action.closest("[data-file-id]")) ||
            Boolean(action.querySelector("[data-file-id]"));
          addTarget(action, uploadedImage ? "image" : "link");
        }
      }

      targets.sort((left, right) => {
        if (left.element === right.element) return 0;
        return left.element.compareDocumentPosition(right.element) & Node.DOCUMENT_POSITION_FOLLOWING
          ? -1
          : 1;
      });
      return targets;
    };

    const targetsForContentSession = (): ContentTarget[] => {
      if (!contentSession) return [];
      const message = messageForOrigin(contentSession.origin);
      return message ? contentTargetsForMessage(message) : [];
    };

    const paintContentTarget = (
      target: ContentTarget,
      index: number,
      origin: CursorOrigin,
    ): void => {
      clearContentSession();
      target.element.setAttribute(CONTENT_SELECTED_ATTRIBUTE, "");
      contentSession = { index, origin, targetKey: target.key };
      target.element.scrollIntoView({ block: "nearest", inline: "nearest" });
    };

    const enterContentMode = (): boolean => {
      if (cursor?.kind !== "message") return false;
      const origin: CursorOrigin = { ...cursor, surface: surfaceForCursor(cursor) };
      const message = messageForOrigin(origin);
      if (!message) return false;
      const targets = contentTargetsForMessage(message);
      if (targets.length === 0) return false;
      clearVisualSession();
      resetPrefixes();
      paintContentTarget(targets[0], 0, origin);
      return true;
    };

    const moveContentTarget = (direction: Direction, amount: number): boolean => {
      if (!contentSession) return false;
      const targets = targetsForContentSession();
      if (targets.length === 0) return false;
      const keyed = contentSession.targetKey
        ? targets.findIndex((target) => target.key === contentSession?.targetKey)
        : -1;
      const current = keyed >= 0 ? keyed : Math.min(contentSession.index, targets.length - 1);
      const next = wrappedIndex(targets.length, current, direction, amount);
      paintContentTarget(targets[next], next, contentSession.origin);
      return true;
    };

    const exitContentMode = (): boolean => {
      if (!contentSession) return false;
      const { origin } = contentSession;
      clearContentSession();
      resetPrefixes();
      restoreCursorOrigin(origin);
      return true;
    };

    const cancelReactionSession = (restore: boolean): boolean => {
      const session = reactionSession;
      cancelPendingReaction?.();
      cancelPendingReaction = null;
      cancelReactionRestore();
      reactionSession = null;
      if (!session) return false;
      const active = document.activeElement;
      if (active instanceof HTMLElement && active !== document.body) active.blur();
      if (restore) {
        const restoreOrigin = (attempt: number): void => {
          cancelPendingReactionRestore = null;
          if (restoreCursorOrigin(session.origin)) return;
          if (attempt < 30) {
            cancelPendingReactionRestore = klack.timers.timeout(
              () => restoreOrigin(attempt + 1),
              50,
            );
          }
        };
        restoreOrigin(0);
      }
      return true;
    };

    const openReactionPicker = (): boolean => {
      if (cursor?.kind !== "message") return false;
      const origin: CursorOrigin = { ...cursor, surface: surfaceForCursor(cursor) };
      if (!messageForOrigin(origin)) return false;
      cancelReactionRestore();
      cancelReactionSession(false);
      clearContentSession();
      clearVisualSession();
      resetPrefixes();
      const session: ReactionSession = { origin, phase: "opening" };
      reactionSession = session;
      const preexistingActions = new Set(
        Array.from(document.querySelectorAll<HTMLElement>(reactionActionSelector)).filter(
          isRendered,
        ),
      );
      let focusedRow: HTMLElement | null = null;

      const attemptOpen = (attempt: number): void => {
        cancelPendingReaction = null;
        if (reactionSession !== session) return;
        const message = messageForOrigin(origin);
        const row = message?.closest<HTMLElement>('[role="listitem"]') || message;
        if (message && cursor?.element !== message) {
          paintCursor(message, "message", false);
        }
        if (row && row !== focusedRow) {
          focusedRow = row;
          row.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
          row.focus({ preventScroll: true });
        }
        const visibleActions = Array.from(
          document.querySelectorAll<HTMLElement>(reactionActionSelector),
        ).filter(isRendered);
        const ownedAction = visibleActions.find((candidate) => {
          if (!origin.identity) return false;
          const owner =
            candidate.closest<HTMLElement>(messageRowSelector) ||
            candidate
              .closest<HTMLElement>('[role="listitem"]')
              ?.querySelector<HTMLElement>(messageRowSelector);
          return owner ? messageIdentity(owner) === origin.identity : false;
        });
        const appearedActions = row
          ? visibleActions.filter((candidate) => !preexistingActions.has(candidate))
          : [];
        const active = document.activeElement;
        const rowOwnsFocus = Boolean(
          row && active instanceof Node && (active === row || row.contains(active)),
        );
        const fallbackAction =
          appearedActions.length === 1
            ? appearedActions[0]
            : rowOwnsFocus && visibleActions.length === 1
              ? visibleActions[0]
              : null;
        const action =
          (row ? visibleElement(reactionActionSelector, row) : null) ||
          ownedAction ||
          fallbackAction;
        if (action) {
          activatingReactionAction = true;
          try {
            if (clickEnabled(action)) {
              cancelPendingReaction = klack.timers.timeout(() => {
                cancelPendingReaction = null;
                if (
                  reactionSession === session &&
                  !visibleElement(emojiPickerRootSelector)
                ) {
                  cancelReactionSession(true);
                }
              }, 1_500);
              return;
            }
          } finally {
            activatingReactionAction = false;
          }
        }
        if (attempt < 30) {
          cancelPendingReaction = attempt < 8
            ? klack.timers.animationFrame(() => attemptOpen(attempt + 1))
            : klack.timers.timeout(() => attemptOpen(attempt + 1), 50);
        } else {
          cancelReactionSession(true);
        }
      };

      attemptOpen(0);
      return true;
    };

    const messageBodyForSelection = (message: HTMLElement): HTMLElement | null => {
      const bodies = messageBodyElements(message);
      return (
        bodies.find(
          (body) => !bodies.some((candidate) => candidate !== body && candidate.contains(body)),
        ) || null
      );
    };

    const visualContext = (
      origin: CursorOrigin,
    ): { body: HTMLElement; units: VisualUnit[] } | null => {
      const message = messageForOrigin(origin);
      const body = message ? messageBodyForSelection(message) : null;
      if (!body) return null;
      const units = visualUnits(body);
      return units.length > 0 ? { body, units } : null;
    };

    const paintVisualSelection = (session: VisualSession): boolean => {
      const context = visualContext(session.origin);
      if (!context) return false;
      const { body, units } = context;
      const selection = window.getSelection();
      if (!selection) return false;
      session.anchor = Math.min(Math.max(session.anchor, 0), units.length - 1);
      session.head = Math.min(Math.max(session.head, 0), units.length - 1);
      const start = Math.min(session.anchor, session.head);
      const end = Math.max(session.anchor, session.head);
      const range = document.createRange();
      range.setStart(units[start].start.node, units[start].start.offset);
      range.setEnd(units[end].end.node, units[end].end.offset);
      document.querySelectorAll(`[${VISUAL_SELECTED_ATTRIBUTE}]`).forEach((element) => {
        element.removeAttribute(VISUAL_SELECTED_ATTRIBUTE);
      });
      selection.removeAllRanges();
      selection.addRange(range);
      body.setAttribute(VISUAL_SELECTED_ATTRIBUTE, "");
      session.renderedRange = range;
      session.text = units
        .slice(start, end + 1)
        .map((unit) => unit.text)
        .join("");
      const headNode = units[session.head].start.node;
      const headElement = headNode instanceof Element ? headNode : headNode.parentElement;
      headElement?.scrollIntoView({ block: "nearest", inline: "nearest" });
      return true;
    };

    const enterVisualMode = (): boolean => {
      if (cursor?.kind !== "message" || !cursor.element.isConnected) return false;
      const body = messageBodyForSelection(cursor.element);
      if (!body) return false;
      const units = visualUnits(body);
      if (units.length === 0) return false;
      const first = units.findIndex((unit) => unit.text.trim().length > 0);
      if (first < 0) return false;
      const origin: CursorOrigin = { ...cursor, surface: surfaceForCursor(cursor) };
      clearContentSession();
      clearVisualSession();
      resetPrefixes();
      const session: VisualSession = {
        anchor: first,
        head: first,
        origin,
        renderedRange: null,
        text: units[first].text,
        token: ++visualSessionToken,
      };
      visualSession = session;
      if (paintVisualSelection(session)) return true;
      visualSession = null;
      return false;
    };

    const moveVisualSelection = (motion: VisualMotion, amount: number): boolean => {
      const session = visualSession;
      if (!session) return false;
      if (motion === "swap-ends") {
        [session.anchor, session.head] = [session.head, session.anchor];
        return paintVisualSelection(session);
      }
      const context = visualContext(session.origin);
      if (!context) return false;
      session.head = movedVisualIndex(
        context.units.map((unit) => unit.text),
        session.head,
        motion,
        amount,
      );
      return paintVisualSelection(session);
    };

    const reanchorVisualSelection = (): boolean => {
      if (!visualSession) return false;
      visualSession.anchor = visualSession.head;
      resetPrefixes();
      return paintVisualSelection(visualSession);
    };

    const exitVisualMode = (): boolean => {
      if (!visualSession) return false;
      const { origin } = visualSession;
      clearVisualSession();
      resetPrefixes();
      restoreCursorOrigin(origin);
      return true;
    };

    const copyTextWithTextarea = (text: string): boolean => {
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const selection = window.getSelection();
      const ranges = selection
        ? Array.from({ length: selection.rangeCount }, (_, index) =>
            selection.getRangeAt(index).cloneRange(),
          )
        : [];
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("aria-hidden", "true");
      textarea.style.cssText =
        "position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none";
      document.body.append(textarea);
      textarea.focus({ preventScroll: true });
      textarea.select();
      let copied = false;
      try {
        copied = document.execCommand("copy");
      } catch {
        copied = false;
      }
      textarea.remove();
      if (selection) {
        selection.removeAllRanges();
        ranges.forEach((range) => selection.addRange(range));
      }
      if (active?.isConnected) active.focus({ preventScroll: true });
      return copied;
    };

    const yankVisualSelection = (): boolean => {
      const session = visualSession;
      if (!session) return false;
      resetPrefixes();
      paintVisualSelection(session);
      const text = session.text;
      if (copyTextWithTextarea(text)) return exitVisualMode();

      const clipboard = navigator.clipboard;
      if (!clipboard || typeof clipboard.writeText !== "function") {
        paintVisualSelection(session);
        console.warn("[Klack] VimNavigation could not copy the selected message");
        return true;
      }
      const { token } = session;
      let pendingCopy: Promise<void>;
      try {
        pendingCopy = clipboard.writeText(text);
      } catch {
        paintVisualSelection(session);
        console.warn("[Klack] VimNavigation could not copy the selected message");
        return true;
      }
      void pendingCopy.then(
        () => {
          if (visualSession?.token === token) exitVisualMode();
        },
        () => {
          if (visualSession?.token !== token) return;
          paintVisualSelection(session);
          console.warn("[Klack] VimNavigation could not copy the selected message");
        },
      );
      return true;
    };

    const activateContentTarget = (): boolean => {
      if (!contentSession) return false;
      const targets = targetsForContentSession();
      const keyed = contentSession.targetKey
        ? targets.findIndex((target) => target.key === contentSession?.targetKey)
        : -1;
      const target = targets[
        keyed >= 0 ? keyed : Math.min(contentSession.index, targets.length - 1)
      ];
      const { origin } = contentSession;
      resetPrefixes();
      if (!target) {
        clearContentSession();
        restoreCursorOrigin(origin);
        return false;
      }
      if (target.kind === "image") {
        activatingContentTarget = true;
        try {
          return clickEnabled(target.element);
        } finally {
          activatingContentTarget = false;
        }
      }
      clearContentSession();
      if (!clickEnabled(target.element)) {
        restoreCursorOrigin(origin);
        return false;
      }
      restoreCursorOrigin(origin);
      return true;
    };

    const moveMediaViewer = (direction: Direction, amount: number): boolean => {
      const root = visibleElement(mediaViewerRootSelector);
      if (!root) return false;
      cancelMediaNavigation();
      let remaining = Math.max(1, Math.trunc(amount));
      const imageSnapshot = (
        viewer: HTMLElement,
      ): { identity: string } | null => {
        const image = visibleElement(mediaViewerImageSelector, viewer);
        if (!(image instanceof HTMLImageElement)) return null;
        const fileOwner =
          image.closest<HTMLElement>("[data-file-id]") ||
          viewer.querySelector<HTMLElement>(
            '[data-file-id][aria-current="true"], [data-file-id][aria-selected="true"], [data-file-id][data-selected="true"]',
          );
        const selected = viewer.querySelector<HTMLElement>(
          '[aria-current="true"], [aria-selected="true"], [data-selected="true"]',
        );
        const selectedIndex = selected?.parentElement
          ? Array.from(selected.parentElement.children).indexOf(selected)
          : -1;
        return {
          identity: [
            fileOwner?.getAttribute("data-file-id") || "",
            image.currentSrc || image.src || "",
            selectedIndex,
          ].join(":"),
        };
      };
      const advance = (readyStartedAt = performance.now()): void => {
        cancelPendingMediaNavigation = null;
        const currentRoot = visibleElement(mediaViewerRootSelector);
        const selector = direction === "next"
          ? mediaViewerNextSelector
          : mediaViewerPreviousSelector;
        const action = currentRoot ? visibleElement(selector, currentRoot) : null;
        const previous = currentRoot ? imageSnapshot(currentRoot) : null;
        if (!action || !previous || !clickEnabled(action)) {
          if (
            remaining > 0 &&
            currentRoot &&
            performance.now() - readyStartedAt < 1_500
          ) {
            cancelPendingMediaNavigation = klack.timers.timeout(
              () => advance(readyStartedAt),
              50,
            );
          }
          return;
        }
        const startedAt = performance.now();
        const waitForChange = (): void => {
          cancelPendingMediaNavigation = null;
          const refreshedRoot = visibleElement(mediaViewerRootSelector);
          const current = refreshedRoot ? imageSnapshot(refreshedRoot) : null;
          if (current && current.identity !== previous.identity) {
            remaining -= 1;
            if (remaining > 0) {
              cancelPendingMediaNavigation = klack.timers.timeout(
                () => advance(performance.now()),
                50,
              );
            }
            return;
          }
          if (performance.now() - startedAt < 1_500) {
            cancelPendingMediaNavigation = klack.timers.timeout(waitForChange, 50);
          }
        };
        waitForChange();
      };
      advance();
      return true;
    };

    const closeMediaViewer = (): boolean => {
      const root = visibleElement(mediaViewerRootSelector);
      const close = root ? visibleElement(mediaViewerCloseSelector, root) : null;
      cancelMediaNavigation();
      return clickEnabled(close);
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
        const context =
          cursor?.kind === "message" && cursor.surface === "threads"
            ? cursor
            : insertSession?.origin?.kind === "message" &&
                insertSession.origin.surface === "threads"
              ? insertSession.origin
              : null;
        const message = context ? messageForOrigin(context) : null;
        const item = message?.closest<HTMLElement>(threadsItemSelector) || null;
        const card = message?.closest<HTMLElement>(threadsCardSelector) || null;
        const contextualRoot = item || card;
        const contextualFooter = contextualRoot
          ? visibleElement(threadsFooterSelector, contextualRoot)
          : null;
        const contextualInput = contextualRoot
          ? inputs
              .filter((input) => threads?.contains(input))
              .map((input) => {
                const rootRect = contextualRoot.getBoundingClientRect();
                const inputRect = input.getBoundingClientRect();
                const followsThread = inputRect.top >= rootRect.top - 1;
                return {
                  distance:
                    Math.abs(inputRect.top - rootRect.bottom) +
                    (followsThread ? 0 : 1_000_000),
                  input,
                };
              })
              .sort((left, right) => left.distance - right.distance)[0]?.input || null
          : null;
        const footer = threads ? visibleElement(threadsFooterSelector, threads) : null;
        return (
          inputs.find((input) => contextualFooter?.contains(input)) ||
          inputs.find((input) => contextualRoot?.contains(input)) ||
          contextualInput ||
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
      if (
        !(
          searchSession?.kind === "global" &&
          searchSession.phase === "open" &&
          surface === "thread"
        )
      ) {
        searchSession = null;
      }
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

    const globalSearchEditor = (): HTMLElement | null =>
      editorWithin(visibleElement(searchInputSelector));

    const globalSearchView = (): HTMLElement | null => visibleElement(searchViewSelector);

    const sidebarSearchEditor = (): HTMLElement | null => {
      const container = document.querySelector<HTMLElement>(sidebarFilterSelector);
      if (!container) return null;
      if (container.matches(FOCUSABLE_EDITOR_SELECTOR)) return container;
      return container.querySelector<HTMLElement>(FOCUSABLE_EDITOR_SELECTOR);
    };

    const searchEditor = (): HTMLElement | null =>
      searchSession?.kind === "sidebar" ? sidebarSearchEditor() : globalSearchEditor();

    const syncGlobalSearchResults = (): boolean => {
      const session = searchSession;
      const view = globalSearchView();
      const editor = globalSearchEditor();
      if (
        session &&
        shouldEnterGlobalSearchResults({
          awaitingResults: session.awaitingResults,
          hasEditor: Boolean(editor),
          hasView: Boolean(view),
          kind: session.kind,
          phase: session.phase,
          restoring: session.restoring,
        })
      ) {
        session.awaitingResults = false;
        session.pendingText = "";
        session.phase = "results";
        editor?.blur();
        cancelDeferredFocus();
        resetPrefixes();
      }
      if (!session || session.kind !== "global" || session.phase !== "results" || !view) {
        return false;
      }
      const results = canonicalElements(view, searchResultSelector);
      if (results.length === 0) return true;
      const connectedCurrent =
        cursor?.kind === "search" &&
        cursor.element.isConnected &&
        view.contains(cursor.element)
          ? cursor.element
          : null;
      if (connectedCurrent) return true;
      const target =
        (session.resultIdentity
          ? results.find(
              (result) => searchResultIdentity(result) === session.resultIdentity,
            )
          : null) || results[0];
      select(target, "search");
      return true;
    };

    const searchText = (target: HTMLElement | null): string => {
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        return target.value;
      }
      return target?.textContent || "";
    };

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

    const finishSearchRestore = (cursorRestored = false): void => {
      if (!searchSession?.restoring) return;
      const { kind, origin } = searchSession;
      searchSession = null;
      if (kind === "sidebar") {
        document.documentElement.removeAttribute(SIDEBAR_SEARCH_ATTRIBUTE);
      }
      cancelDeferredFocus();
      cancelSearchRestore();
      if (!cursorRestored) restoreCursorOrigin(origin);
    };

    const stepBackFromGlobalSearch = (): void => {
      const historyBack = visibleElement(
        '[data-qa="history_back_button"]:not([aria-disabled="true"])',
      );
      if (clickEnabled(historyBack)) return;
      const pane = threadPane();
      const flexpane = pane?.closest<HTMLElement>(flexpaneRootSelector) || pane;
      const close = flexpane?.querySelector<HTMLElement>('[data-qa="close_flexpane"]') || null;
      if (clickEnabled(close)) return;
      window.history.back();
    };

    const scheduleSearchRestore = (origin: CursorOrigin | null, attempt = 0): void => {
      if (cancelPendingSearchRestore) return;
      cancelPendingSearchRestore = klack.timers.animationFrame(() => {
        cancelPendingSearchRestore = null;
        if (!searchSession?.restoring || searchSession.origin !== origin) return;
        if (searchSession.kind === "sidebar") {
          const restored = origin ? restoreCursorOrigin(origin) : true;
          if (restored || attempt >= 60) {
            if (!restored) clearCursor();
            finishSearchRestore(true);
          } else scheduleSearchRestore(origin, attempt + 1);
          return;
        }
        if (globalSearchEditor() || globalSearchView()) {
          if (
            attempt > 0 &&
            attempt % 60 === 0 &&
            globalSearchView() &&
            !globalSearchEditor()
          ) {
            stepBackFromGlobalSearch();
          }
          if (attempt < 240) scheduleSearchRestore(origin, attempt + 1);
          else if (searchSession?.kind === "global") {
            searchSession.restoring = false;
            if (globalSearchView() && !globalSearchEditor()) {
              searchSession.phase = "results";
              syncGlobalSearchResults();
            } else focusSearchInput(globalSearchEditor());
          }
          return;
        }
        const restored = origin ? restoreCursorOrigin(origin) : true;
        if (restored || attempt >= 240) {
          if (!restored) clearCursor();
          finishSearchRestore(true);
        } else scheduleSearchRestore(origin, attempt + 1);
      });
    };

    const cancelGlobalSearchResults = (): boolean => {
      if (searchSession?.kind !== "global" || searchSession.phase !== "results") return false;
      const session = searchSession;
      session.awaitingResults = false;
      session.pendingText = "";
      session.restoring = true;
      resetPrefixes();
      clearCursor();
      cancelDeferredFocus();
      cancelSearchRestore();
      stepBackFromGlobalSearch();
      scheduleSearchRestore(session.origin);
      return true;
    };

    const replaceSearchText = (target: HTMLElement, text: string, focus = true): void => {
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        if (focus) target.focus({ preventScroll: true });
        target.setRangeText(text, 0, target.value.length, "end");
        target.dispatchEvent(
          new InputEvent("input", {
            bubbles: true,
            data: text,
            inputType: "insertReplacementText",
          }),
        );
        return;
      }
      if (focus) target.focus({ preventScroll: true });
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(target);
      selection?.removeAllRanges();
      selection?.addRange(range);
      document.execCommand("insertText", false, text);
    };

    const cancelSidebarSearch = (): boolean => {
      if (searchSession?.kind !== "sidebar") return false;
      const session = searchSession;
      const target = sidebarSearchEditor();
      resetPrefixes();
      clearCursor();
      if (target) {
        replaceSearchText(target, session.initialText);
        target.blur();
      }
      session.pendingText = "";
      session.restoring = true;
      document.documentElement.removeAttribute(SIDEBAR_SEARCH_ATTRIBUTE);
      cancelDeferredFocus();
      cancelSearchRestore();
      scheduleSearchRestore(session.origin);
      return true;
    };

    const enterSidebarSearchResults = (): boolean => {
      if (searchSession?.kind !== "sidebar" || searchSession.phase !== "typing") return false;
      const root = visibleElement(sidebarRootSelector);
      const items = root ? canonicalElements(root, sidebarChannelItemSelector) : [];
      if (items.length === 0) return false;
      sidebarSearchEditor()?.blur();
      searchSession.phase = "results";
      preferredSurface = "sidebar";
      select(items[0], "sidebar");
      return true;
    };

    const activateSidebarSearchResult = (): boolean => {
      if (searchSession?.kind !== "sidebar" || searchSession.phase !== "results") return false;
      const session = searchSession;
      resetPrefixes();
      const editor = sidebarSearchEditor();
      const root = visibleElement(sidebarRootSelector);
      const identity = cursor?.kind === "sidebar" ? cursor.identity : null;
      const current =
        root && identity
          ? canonicalElements(root, sidebarChannelItemSelector).find(
              (item) => identityFor(item, "sidebar") === identity,
            )
          : cursor?.kind === "sidebar" && isRendered(cursor.element)
            ? cursor.element
            : null;
      if (!current) return false;
      if (cursor?.element !== current) select(current, "sidebar");
      const activated = activateSidebar();
      if (!activated) return false;
      const currentEditor = sidebarSearchEditor() || editor;
      if (currentEditor) {
        replaceSearchText(currentEditor, session.initialText, false);
        currentEditor.blur();
      }
      searchSession = null;
      document.documentElement.removeAttribute(SIDEBAR_SEARCH_ATTRIBUTE);
      cancelDeferredFocus();
      cancelSearchRestore();
      return activated;
    };

    const openSidebarSearch = (): boolean => {
      const target = sidebarSearchEditor();
      if (!target) return false;
      const origin: CursorOrigin | null = cursor
        ? { ...cursor, surface: surfaceForCursor(cursor) }
        : null;
      const initialText = searchText(target);
      cancelSearchRestore();
      clearCursor();
      resetPrefixes();
      insertSession = null;
      document.documentElement.setAttribute(SIDEBAR_SEARCH_ATTRIBUTE, "");
      searchSession = {
        awaitingResults: false,
        initialText,
        kind: "sidebar",
        origin,
        pendingText: "",
        phase: "typing",
        resultIdentity: null,
        restoring: false,
      };
      if (!focusSearchInput(target)) scheduleSearchFocus();
      return true;
    };

    const openGlobalSearch = (): boolean => {
      const team = teamFromLocation();
      const slackWindow = window as SlackWindow;
      const teamDelegate = team ? slackWindow.desktopDelegates?.[team] : undefined;
      const delegate = teamDelegate?.startSearch ? teamDelegate : slackWindow.desktopDelegate;
      const existingInput = globalSearchEditor();
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
      searchSession = {
        awaitingResults: false,
        initialText: "",
        kind: "global",
        origin,
        pendingText: "",
        phase: "typing",
        resultIdentity: null,
        restoring: false,
      };
      if (existingInput) return focusSearchInput(existingInput);
      if (delegate?.startSearch) delegate.startSearch();
      if (!focusSearchInput()) scheduleSearchFocus();
      return true;
    };

    const openSearch = (): boolean => {
      if (preferredSurface === "sidebar" || cursor?.kind === "sidebar") {
        return openSidebarSearch() || openGlobalSearch();
      }
      return openGlobalSearch();
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
      const fallbackMatches =
        !origin.identity || messageIdentity(origin.element) === origin.identity;
      const target =
        replacement || (fallbackMatches && isRendered(origin.element) ? origin.element : null);
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
      const followsThreadPane =
        kind === "message" && root.matches(threadPaneSelector);
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

      const reconcileStartedAt = performance.now();
      const reconcile = (
        anchorElement: HTMLElement,
        anchorIdentity: string | null,
        steps: number,
        idleAttempts: number,
      ): void => {
        cancelBoundaryRetry = klack.timers.timeout(() => {
          cancelBoundaryRetry = null;
          const activeRoot = followsThreadPane ? threadPane() || root : root;
          const refreshed = canonicalElements(activeRoot, selector);
          if (refreshed.length === 0) {
            if (performance.now() - reconcileStartedAt < 1_500) {
              reconcile(anchorElement, anchorIdentity, steps, idleAttempts + 1);
            }
            return;
          }

          const refreshedAnchor = anchorIdentity
            ? refreshed.findIndex((element) => identityFor(element, kind) === anchorIdentity)
            : refreshed.indexOf(anchorElement);
          let candidate = refreshedAnchor;
          let progressed = 0;
          if (refreshedAnchor < 0) {
            if (followsThreadPane && anchorIdentity) {
              if (performance.now() - reconcileStartedAt < 1_500) {
                reconcile(anchorElement, anchorIdentity, steps, idleAttempts + 1);
              }
              return;
            }
            candidate = initialIndex(refreshed, activeRoot, direction);
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

          if (progressed === 0 && performance.now() - reconcileStartedAt < 1_500) {
            if (idleAttempts > 0 && idleAttempts % 4 === 0) {
              scrollPastBoundary(nextElement, activeRoot, direction);
            }
            reconcile(anchorElement, anchorIdentity, steps, idleAttempts + 1);
            return;
          }
          if (scrollPastBoundary(nextElement, activeRoot, direction)) {
            reconcile(nextElement, nextIdentity, stepsLeft, 0);
          }
        }, 50);
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

    const moveSidebarSearchResults = (direction: Direction, amount = 1): boolean => {
      const root = visibleElement(sidebarRootSelector);
      if (!root) return false;
      preferredSurface = "sidebar";
      return moveWithin(root, sidebarChannelItemSelector, "sidebar", direction, amount);
    };

    const moveGlobalSearchResults = (direction: Direction, amount = 1): boolean => {
      const root = globalSearchView();
      if (!root) return false;
      return moveWithin(root, searchResultSelector, "search", direction, amount);
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
      direction: Direction,
    ): boolean => {
      cancelPendingMove();
      const elements = canonicalElements(root, selector);
      if (elements.length === 0) return false;

      const edge = elements[direction === "next" ? elements.length - 1 : 0];
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
        scroller.scrollTop = direction === "next" ? scroller.scrollHeight : 0;
      };
      const startedAt = performance.now();
      let stableSince = startedAt;
      let lastEdge: HTMLElement | null = null;
      let lastIdentity: string | null = null;
      let lastScrollHeight = -1;
      const quietWindow = direction === "previous" && kind === "message" ? 500 : 200;
      const minimumSettle = direction === "previous" && kind === "message" ? 500 : 300;
      const maximumSettle = direction === "previous" && kind === "message" ? 2_000 : 1_500;
      const reconcile = (): void => {
        cancelBoundaryRetry = klack.timers.timeout(() => {
          cancelBoundaryRetry = null;
          scrollToEdge();
          const refreshed = canonicalElements(root, selector);
          if (refreshed.length === 0) {
            if (performance.now() - startedAt < maximumSettle) reconcile();
            return;
          }
          const refreshedEdge = refreshed[direction === "next" ? refreshed.length - 1 : 0];
          const refreshedIdentity = identityFor(refreshedEdge, kind);
          const now = performance.now();
          const atEdge = scroller
            ? direction === "next"
              ? scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1
              : scroller.scrollTop <= 1
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
        return boundaryWithin(root, sidebarItemSelector, "sidebar", "next");
      }
      const surface = messageSurface();
      if (!surface) return false;
      preferredSurface = surface.id;
      return boundaryWithin(surface.root, messageRowSelector, "message", "next");
    };

    const moveToTop = (): boolean => {
      if (preferredSurface === "sidebar" || cursor?.kind === "sidebar") {
        const root = visibleElement(sidebarRootSelector);
        if (!root) return false;
        preferredSurface = "sidebar";
        return boundaryWithin(root, sidebarItemSelector, "sidebar", "previous");
      }
      const surface = messageSurface();
      if (surface?.id !== "thread") return false;
      preferredSurface = "thread";
      return boundaryWithin(surface.root, messageRowSelector, "message", "previous");
    };

    const centerCursor = (): boolean => {
      if (!cursor?.element.isConnected) return false;
      cursor.element.scrollIntoView({ block: "center", inline: "nearest" });
      return true;
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

    const beginGlobalSearchResultOpen = (
      session: SearchSession,
      result: HTMLElement,
    ): void => {
      const alreadyOpening = session.phase === "open";
      pendingThreadMovements.length = 0;
      threadMovementInFlight = false;
      session.resultIdentity = searchResultIdentity(result);
      session.phase = "open";
      resetPrefixes();
      clearCursor();
      if (alreadyOpening) return;
      klack.timers.timeout(() => {
        if (
          searchSession === session &&
          session.phase === "open" &&
          !threadPane() &&
          globalSearchView()
        ) {
          pendingThreadMovements.length = 0;
          threadMovementInFlight = false;
          session.phase = "results";
          syncGlobalSearchResults();
        }
      }, 3_000);
    };

    const activateGlobalSearchResult = (): boolean => {
      if (searchSession?.kind !== "global" || searchSession.phase !== "results") return false;
      const session = searchSession;
      const root = globalSearchView();
      const results = root ? canonicalElements(root, searchResultSelector) : [];
      const identity = cursor?.kind === "search" ? cursor.identity : session.resultIdentity;
      const current =
        (identity
          ? results.find((result) => searchResultIdentity(result) === identity)
          : null) ||
        (cursor?.kind === "search" && isRendered(cursor.element) && root?.contains(cursor.element)
          ? cursor.element
          : null);
      if (!current) return false;
      beginGlobalSearchResultOpen(session, current);
      if (!clickEnabled(current)) {
        session.phase = "results";
        syncGlobalSearchResults();
        return false;
      }
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
      cancelThreadTeardown();
      cancelPendingThread?.();
      pendingThreadMovements.length = 0;
      threadMovementInFlight = false;
      threadOrigin = origin;
      clearCursor();
      preferredSurface = "thread";
      cancelPendingThread = klack.timers.timeout(() => {
        cancelPendingThread = null;
        if (threadPane()) return;
        pendingThreadMovements.length = 0;
        threadMovementInFlight = false;
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

    const finalizeThreadTeardown = (): boolean => {
      if (threadPane()) return false;
      pendingThreadMovements.length = 0;
      threadMovementInFlight = false;
      threadOrigin = null;
      if (
        searchSession?.kind === "global" &&
        searchSession.phase === "open" &&
        globalSearchView()
      ) {
        searchSession.phase = "results";
        preferredSurface = searchSession.origin?.surface || "main";
        syncGlobalSearchResults();
      } else if (preferredSurface === "thread") preferredSurface = "main";
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

      cancelThreadTeardown();
      cancelPendingThread?.();
      cancelPendingThread = null;
      pendingThreadMovements.length = 0;
      threadMovementInFlight = false;
      clearCursor();
      if (threadOrigin) restoreOrigin(threadOrigin);
      else preferredSurface = "main";
      threadOrigin = null;
      klack.timers.animationFrame(finalizeThreadTeardown);
      return true;
    };

    const activate = (): boolean =>
      cursor?.kind === "sidebar" ? activateSidebar() : openThread();

    const navigateHistory = (direction: "back" | "forward"): boolean => {
      if (
        direction === "back" &&
        searchSession?.kind === "global" &&
        searchSession.phase === "open" &&
        threadPane()
      ) {
        return closeThread();
      }
      const target = visibleElement(
        `[data-qa="history_${direction}_button"]:not([aria-disabled="true"])`,
      );
      if (!target) return false;
      cancelThreadTeardown();
      cancelPendingThread?.();
      cancelPendingThread = null;
      pendingThreadMovements.length = 0;
      threadMovementInFlight = false;
      clearCursor();
      resetPrefixes();
      insertSession = null;
      searchSession = null;
      document.documentElement.removeAttribute(SIDEBAR_SEARCH_ATTRIBUTE);
      threadOrigin = null;
      preferredSurface = "main";
      return clickEnabled(target);
    };

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
      const plainEnter =
        event.key === "Enter" &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey &&
        !event.defaultPrevented &&
        !event.isComposing;
      const targetElement = elementFromTarget(event.target);
      if (visibleElement(mediaViewerRootSelector)) {
        const viewerCommand = keyCommand(event);
        let handled = true;
        if (viewerCommand === "count") {
          const nextPrefix = appendCountDigit(countPrefix, event.key);
          if (nextPrefix) countPrefix = nextPrefix;
        } else if (viewerCommand === "next" || viewerCommand === "previous") {
          moveMediaViewer(viewerCommand === "next" ? "next" : "previous", takeCount());
        } else if (viewerCommand === "left" || viewerCommand === "unwind") {
          resetPrefixes();
          handled = closeMediaViewer();
          if (!handled && plainEscape) return;
        } else if (!viewerCommand && !shouldSuppressNormalModeKey(event)) {
          cancelMediaNavigation();
          resetPrefixes();
          return;
        } else {
          resetPrefixes();
        }
        if (handled) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
        return;
      }
      if (cancelPendingReactionRestore && keyCommand(event)) cancelReactionRestore();
      if (reactionSession && !visibleElement(emojiPickerRootSelector)) {
        const reactionCommand = keyCommand(event);
        if (plainEscape) {
          cancelReactionSession(true);
          resetPrefixes();
          event.preventDefault();
          event.stopImmediatePropagation();
          return;
        }
        if (reactionCommand) cancelReactionSession(true);
      }
      syncGlobalSearchResults();
      if (plainEscape && searchSession?.kind === "sidebar" && cancelSidebarSearch()) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (
        plainEscape &&
        searchSession?.kind === "global" &&
        searchSession.phase === "results" &&
        cancelGlobalSearchResults()
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (
        plainEscape &&
        searchSession?.kind === "global" &&
        searchSession.phase === "typing"
      ) {
        const { origin } = searchSession;
        searchSession.awaitingResults = false;
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
        plainEnter &&
        searchSession?.kind === "global" &&
        searchSession.phase === "typing"
      ) {
        searchSession.awaitingResults = true;
        searchSession.pendingText = "";
        resetPrefixes();
      }
      if (
        plainEnter &&
        searchSession?.kind === "sidebar" &&
        searchSession.phase === "typing" &&
        enterSidebarSearchResults()
      ) {
        resetPrefixes();
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (searchSession?.kind === "sidebar" && searchSession.phase === "results") {
        const searchCommand = keyCommand(event);
        if (searchCommand === "count") {
          const nextPrefix = appendCountDigit(countPrefix, event.key);
          if (nextPrefix) countPrefix = nextPrefix;
        } else if (searchCommand === "next" || searchCommand === "previous") {
          moveSidebarSearchResults(
            searchCommand === "next" ? "next" : "previous",
            takeCount(),
          );
        } else if (searchCommand === "activate" && event.key === "Enter") {
          activateSidebarSearchResult();
        } else if (searchCommand === "search") {
          resetPrefixes();
          clearCursor();
          searchSession.phase = "typing";
          focusSearchInput(sidebarSearchEditor());
        } else if (searchCommand) {
          resetPrefixes();
        } else if (!shouldSuppressNormalModeKey(event)) {
          return;
        }
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (searchSession?.kind === "global" && searchSession.phase === "results") {
        const searchCommand = keyCommand(event);
        const hadCenterPrefix = centerPrefixPending;
        const hadTopPrefix = topPrefixPending;
        if (searchCommand === "count") {
          centerPrefixPending = false;
          topPrefixPending = false;
          const nextPrefix = appendCountDigit(countPrefix, event.key);
          if (nextPrefix) countPrefix = nextPrefix;
        } else if (searchCommand === "center-prefix") {
          resetCount();
          topPrefixPending = false;
          if (hadCenterPrefix) {
            centerPrefixPending = false;
            centerCursor();
          } else centerPrefixPending = true;
        } else if (searchCommand === "top-prefix") {
          resetCount();
          centerPrefixPending = false;
          if (hadTopPrefix) {
            topPrefixPending = false;
            const root = globalSearchView();
            if (root) boundaryWithin(root, searchResultSelector, "search", "previous");
          } else topPrefixPending = true;
        } else {
          centerPrefixPending = false;
          topPrefixPending = false;
          const amount = takeCount();
          const root = globalSearchView();
          if (searchCommand === "next" || searchCommand === "previous") {
            moveGlobalSearchResults(
              searchCommand === "next" ? "next" : "previous",
              amount,
            );
          } else if (searchCommand === "page-next" || searchCommand === "page-previous") {
            if (root) {
              pageWithin(
                root,
                searchResultSelector,
                "search",
                searchCommand === "page-next" ? "next" : "previous",
                0.9,
                amount,
              );
            }
          } else if (searchCommand === "half-next" || searchCommand === "half-previous") {
            if (root) {
              pageWithin(
                root,
                searchResultSelector,
                "search",
                searchCommand === "half-next" ? "next" : "previous",
                0.5,
                amount,
              );
            }
          } else if (searchCommand === "bottom") {
            if (root) boundaryWithin(root, searchResultSelector, "search", "next");
          } else if (searchCommand === "activate" && event.key === "Enter") {
            activateGlobalSearchResult();
          } else if (searchCommand === "history-back") {
            cancelGlobalSearchResults();
          } else if (!searchCommand && !shouldSuppressNormalModeKey(event)) {
            return;
          }
        }
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (
        searchSession?.kind === "global" &&
        searchSession.phase === "open" &&
        threadPane()
      ) {
        preferredSurface = "thread";
      }
      if (
        searchSession?.kind === "global" &&
        searchSession.phase === "open" &&
        !threadPane()
      ) {
        const transitionCommand = keyCommand(event);
        if (transitionCommand === "count") {
          const nextPrefix = appendCountDigit(countPrefix, event.key);
          if (nextPrefix) countPrefix = nextPrefix;
        } else if (transitionCommand === "next" || transitionCommand === "previous") {
          queueThreadMovement(
            transitionCommand === "next" ? "next" : "previous",
            takeCount(),
          );
        } else if (!transitionCommand && !shouldSuppressNormalModeKey(event)) {
          return;
        } else {
          resetPrefixes();
        }
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (
        preferredSurface === "thread" &&
        !threadPane() &&
        (cancelPendingThread || cancelPendingThreadTeardown)
      ) {
        const transitionCommand = keyCommand(event);
        if (transitionCommand === "count") {
          const nextPrefix = appendCountDigit(countPrefix, event.key);
          if (nextPrefix) countPrefix = nextPrefix;
        } else if (transitionCommand === "next" || transitionCommand === "previous") {
          const direction = transitionCommand === "next" ? "next" : "previous";
          queueThreadMovement(direction, takeCount());
        } else if (!transitionCommand && !shouldSuppressNormalModeKey(event)) {
          return;
        } else {
          resetPrefixes();
        }
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      const activeSearchEditor = searchEditor();
      const targetIsActiveSearch = Boolean(
        activeSearchEditor &&
          targetElement &&
          (targetElement === activeSearchEditor || activeSearchEditor.contains(targetElement)),
      );
      if (
        searchSession &&
        searchSession.phase === "typing" &&
        !searchSession.restoring &&
        !targetIsActiveSearch
      ) {
        const target = activeSearchEditor;
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
        !keyboardBlocked() &&
        exitInsertMode()
      ) {
        resetPrefixes();
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }

      const command = keyCommand(event);
      const visualMotion = visualMotionCommand(event);
      const blocked = keyboardBlocked();
      const pane = threadPane();
      const activeElement = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
      const activeThreadComposer =
        composerFromTarget(event.target) || composerFromTarget(activeElement);
      const threadRowsPending = Boolean(
        pane &&
          preferredSurface === "thread" &&
          !blocked &&
          (!activeThreadComposer || !isInsertComposer(activeThreadComposer)) &&
          canonicalElements(pane, messageRowSelector).length === 0,
      );
      if (threadRowsPending) {
        if (command === "count") {
          const nextPrefix = appendCountDigit(countPrefix, event.key);
          if (nextPrefix) countPrefix = nextPrefix;
        } else if (command === "next" || command === "previous") {
          queueThreadMovement(command === "next" ? "next" : "previous", takeCount());
        } else if (!command && !shouldSuppressNormalModeKey(event)) {
          return;
        } else {
          resetPrefixes();
        }
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      const threadOwnsPassiveFocus = Boolean(
        pane &&
          preferredSurface === "thread" &&
          !blocked &&
          (command || shouldSuppressNormalModeKey(event)) &&
          !targetElement?.closest(TEXT_ENTRY_TARGET_SELECTOR) &&
          !activeElement?.closest(TEXT_ENTRY_TARGET_SELECTOR),
      );
      if (pane && threadOwnsPassiveFocus) {
        const focusedInsideThread =
          targetElement && pane.contains(targetElement)
            ? targetElement
            : activeElement && pane.contains(activeElement)
              ? activeElement
              : null;
        const focusedRow = focusedInsideThread?.closest<HTMLElement>(messageRowSelector) || null;
        const hasResolvableThreadCursor = Boolean(
          cursor?.kind === "message" &&
            cursor.surface === "thread" &&
            (pane.contains(cursor.element) || cursor.identity),
        );
        if (cursor?.kind === "message" && !hasResolvableThreadCursor) {
          if (!threadOrigin) {
            threadOrigin = {
              element: cursor.element,
              identity: cursor.identity,
              surface: cursor.surface === "threads" ? "threads" : "main",
            };
          }
          clearCursor();
        }
        if (focusedRow && !hasResolvableThreadCursor && cursor?.element !== focusedRow) {
          select(focusedRow, "message");
        }
        if (activeElement && !activeElement.closest(TEXT_ENTRY_TARGET_SELECTOR)) {
          activeElement.blur();
        }
      }
      if (visualSession && (command || visualMotion) && !blocked) {
        if (command === "count" && !(event.key === "0" && countPrefix.length === 0)) {
          const nextPrefix = appendCountDigit(countPrefix, event.key);
          if (nextPrefix) countPrefix = nextPrefix;
        } else if (visualMotion) {
          const amount = visualMotion === "swap-ends" ? 1 : takeCount();
          if (visualMotion === "swap-ends") resetCount();
          moveVisualSelection(visualMotion, amount);
        } else if (command === "yank") yankVisualSelection();
        else if (command === "visual") reanchorVisualSelection();
        else if (command === "unwind") exitVisualMode();
        else resetPrefixes();
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (contentSession && command && !blocked) {
        if (command === "count") {
          topPrefixPending = false;
          const nextPrefix = appendCountDigit(countPrefix, event.key);
          if (nextPrefix) countPrefix = nextPrefix;
        } else if (command === "next" || command === "previous") {
          topPrefixPending = false;
          if (!moveContentTarget(command === "next" ? "next" : "previous", takeCount())) {
            exitContentMode();
          }
        } else if (command === "activate" && event.key === "Enter") activateContentTarget();
        else if (command === "left" || command === "unwind") exitContentMode();
        else if (command === "visual") {
          const { origin } = contentSession;
          clearContentSession();
          restoreCursorOrigin(origin);
          enterVisualMode();
        } else resetPrefixes();
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }

      const focusedNormalComposer = normalModeComposer(event.target);
      if (!command) {
        resetPrefixes();
        if (
          (focusedNormalComposer ||
            threadOwnsPassiveFocus ||
            ((contentSession || visualSession) && !blocked)) &&
          shouldSuppressNormalModeKey(event)
        ) {
          if (focusedNormalComposer) leaveNormalModeComposer(focusedNormalComposer);
          event.preventDefault();
          event.stopImmediatePropagation();
        }
        return;
      }
      const sidebarOwnsPassiveFocus = Boolean(
        targetElement?.closest(sidebarRootSelector) &&
          !targetElement.closest(TEXT_ENTRY_TARGET_SELECTOR),
      );
      if (sidebarOwnsPassiveFocus) {
        preferredSurface = "sidebar";
        if (cursor?.kind !== "sidebar") {
          const focusedItem = targetElement?.closest(sidebarItemSelector);
          if (focusedItem instanceof HTMLElement && isRendered(focusedItem)) {
            select(focusedItem, "sidebar");
          }
        }
      }
      if (
        (!focusedNormalComposer &&
          !sidebarOwnsPassiveFocus &&
          !threadOwnsPassiveFocus &&
          (hasNativeKeyboardTarget(event.target) || hasNativeKeyboardTarget(document.activeElement))) ||
        blocked
      ) {
        resetPrefixes();
        return;
      }

      const leftNormalComposer = focusedNormalComposer !== null;
      if (focusedNormalComposer) leaveNormalModeComposer(focusedNormalComposer);
      if (
        pane &&
        preferredSurface === "thread" &&
        !blocked &&
        (command === "count" || command === "next" || command === "previous")
      ) {
        if (command === "count") {
          const nextPrefix = appendCountDigit(countPrefix, event.key);
          if (nextPrefix) countPrefix = nextPrefix;
        } else {
          queueThreadMovement(command === "next" ? "next" : "previous", takeCount());
        }
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (pane && preferredSurface === "thread") {
        pendingThreadMovements.length = 0;
        threadMovementInFlight = false;
      }
      cancelPendingMove();
      cancelDeferredFocus();
      if (command === "count") {
        centerPrefixPending = false;
        topPrefixPending = false;
        const nextPrefix = appendCountDigit(countPrefix, event.key);
        if (!nextPrefix) return;
        countPrefix = nextPrefix;
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }

      const hadCursor = cursor !== null;
      const hadCenterPrefix = centerPrefixPending;
      const hadCount = countPrefix.length > 0;
      const hadTopPrefix = topPrefixPending;
      let handled = false;
      if (command === "center-prefix") {
        resetCount();
        topPrefixPending = false;
        if (!hadCenterPrefix) {
          centerPrefixPending = true;
          event.preventDefault();
          event.stopImmediatePropagation();
          return;
        }
        centerPrefixPending = false;
        handled = centerCursor();
      } else if (command === "top-prefix") {
        resetCount();
        centerPrefixPending = false;
        if (!hadTopPrefix) {
          topPrefixPending = true;
          event.preventDefault();
          event.stopImmediatePropagation();
          return;
        }
        topPrefixPending = false;
        handled = moveToTop();
      } else {
        centerPrefixPending = false;
        topPrefixPending = false;
        const amount = takeCount();
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
        else if (command === "history-back") handled = navigateHistory("back");
        else if (command === "history-forward") handled = navigateHistory("forward");
        else if (command === "left") handled = moveLeft();
        else if (command === "activate") {
          handled =
            event.key === "Enter" && cursor?.kind === "message"
              ? enterContentMode() || activate()
              : activate();
        }
        else if (command === "insert") handled = focusComposer();
        else if (command === "react") handled = openReactionPicker();
        else if (command === "search") handled = openSearch();
        else if (command === "visual") handled = enterVisualMode();
        else if (command === "unwind") handled = unwind();
      }

      if (
        !handled &&
        !hadCursor &&
        !hadCenterPrefix &&
        !hadCount &&
        !hadTopPrefix &&
        !leftNormalComposer
      ) {
        return;
      }
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
      cancelReactionRestore();
      cancelPendingReaction?.();
      cancelPendingReaction = null;
      const clickedMediaViewer = event.target.closest(mediaViewerRootSelector);
      if (clickedMediaViewer) cancelMediaNavigation();
      if (
        activatingContentTarget ||
        activatingReactionAction ||
        clickedMediaViewer ||
        event.target.closest(emojiPickerRootSelector)
      ) {
        return;
      }
      pendingThreadMovements.length = 0;
      threadMovementInFlight = false;
      reactionSession = null;
      clearContentSession();
      clearVisualSession();
      if (
        searchSession?.kind === "global" &&
        searchSession.phase === "typing" &&
        !searchSession.restoring &&
        event.target.closest('[data-qa="search_input_close"]')
      ) {
        const session = searchSession;
        session.awaitingResults = false;
        session.pendingText = "";
        session.restoring = true;
        cancelSearchRestore();
        scheduleSearchRestore(session.origin);
      }
      if (
        searchSession?.kind === "global" &&
        searchSession.phase === "typing" &&
        event.target.closest(searchAutocompleteFooterSelector)
      ) {
        searchSession.awaitingResults = true;
        searchSession.pendingText = "";
      }
      const clickedGlobalResult = event.target.closest(searchResultSelector);
      if (
        clickedGlobalResult instanceof HTMLElement &&
        searchSession?.kind === "global" &&
        !searchSession.restoring
      ) {
        beginGlobalSearchResultOpen(searchSession, clickedGlobalResult);
        return;
      }
      const activeSearch = searchEditor();
      const clickedInsideSearch = Boolean(
        (activeSearch &&
          (event.target === activeSearch || activeSearch.contains(event.target))) ||
          event.target.closest(searchInputSelector) ||
          event.target.closest(searchAutocompleteFooterSelector) ||
          event.target.closest(searchSuggestionSelector) ||
          (searchSession?.kind === "global" &&
            (event.target.closest(searchViewSelector) ||
              (searchSession.phase === "open" &&
                (event.target.closest(threadPaneSelector) ||
                  event.target.closest(flexpaneRootSelector) ||
                  event.target.closest(
                    '[data-qa="close_flexpane"], [data-qa="history_back_button"]',
                  ))))),
      );
      if (searchSession && !clickedInsideSearch && !searchSession.restoring) {
        if (cursor?.kind === "search") clearCursor();
        if (searchSession.kind === "sidebar") {
          const { initialText } = searchSession;
          const target = sidebarSearchEditor();
          if (target) {
            replaceSearchText(target, initialText, false);
            target.blur();
          }
          document.documentElement.removeAttribute(SIDEBAR_SEARCH_ATTRIBUTE);
        }
        searchSession = null;
        cancelSearchRestore();
      }
      const clickedComposer = composerFromTarget(event.target);
      if (insertSession && (!clickedComposer || !isInsertComposer(clickedComposer))) {
        insertSession = null;
      }
      const closeAction = event.target.closest(
        '[data-qa="close_flexpane"], [data-qa="history_back_button"], [data-qa="history_forward_button"]',
      );
      if (closeAction) {
        cancelThreadTeardown();
        clearCursor();
        klack.timers.animationFrame(() => {
          finalizeThreadTeardown();
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

        [${SELECTED_ATTRIBUTE}="search"][${SELECTED_ATTRIBUTE}] {
          background: rgba(var(--sk_highlight, 18, 100, 163), 0.16) !important;
          box-shadow: inset 4px 0 0 rgb(var(--sk_highlight, 18, 100, 163)) !important;
          border-radius: 6px !important;
        }

        [${CONTENT_SELECTED_ATTRIBUTE}] {
          background: rgba(var(--sk_highlight, 18, 100, 163), 0.24) !important;
          border-radius: 3px !important;
          outline: 2px solid rgb(var(--sk_highlight, 18, 100, 163)) !important;
          outline-offset: 2px;
          scroll-margin-block: 48px;
        }

        [${VISUAL_SELECTED_ATTRIBUTE}]::selection,
        [${VISUAL_SELECTED_ATTRIBUTE}] *::selection {
          background: rgb(var(--sk_highlight, 18, 100, 163)) !important;
        }

        html[${SIDEBAR_SEARCH_ATTRIBUTE}] .p-sidebar_text_filter_input_header:has(${sidebarFilterSelector}) {
          display: flex !important;
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
        else klack.timers.animationFrame(syncGlobalSearchResults);
      };
    });
    klack.dom.watch(searchViewSelector, (view) => {
      const syncResults = (): void => {
        if (!isRendered(view)) return;
        syncGlobalSearchResults();
      };
      syncResults();
      const cancelFrame = klack.timers.animationFrame(syncResults);
      return () => {
        cancelFrame();
        klack.timers.animationFrame(() => {
          if (globalSearchView()) return;
          if (searchSession?.kind !== "global") return;
          if (searchSession.restoring) scheduleSearchRestore(searchSession.origin);
          else if (searchSession.phase !== "typing") {
            clearCursor();
            searchSession = null;
          }
        });
      };
    });
    klack.dom.watch(searchResultSelector, () => {
      const cancelFrame = klack.timers.animationFrame(syncGlobalSearchResults);
      syncGlobalSearchResults();
      return cancelFrame;
    });
    klack.dom.watch(emojiPickerRootSelector, (picker) => {
      let ownedSession: ReactionSession | null = null;
      const markOpen = (): void => {
        if (!isRendered(picker) || !reactionSession) return;
        ownedSession = reactionSession;
        reactionSession.phase = "open";
        cancelPendingReaction?.();
        cancelPendingReaction = null;
      };
      markOpen();
      const cancelFrame = klack.timers.animationFrame(markOpen);
      return () => {
        cancelFrame();
        klack.timers.animationFrame(() => {
          if (visibleElement(emojiPickerRootSelector)) return;
          if (!ownedSession || reactionSession !== ownedSession) return;
          cancelReactionSession(true);
        });
      };
    });
    klack.dom.watch(mediaViewerRootSelector, () => {
      return () => {
        cancelMediaNavigation();
        klack.timers.animationFrame(() => {
          if (visibleElement(mediaViewerRootSelector) || !contentSession) return;
          const session = contentSession;
          const targets = targetsForContentSession();
          const keyed = session.targetKey
            ? targets.findIndex((target) => target.key === session.targetKey)
            : -1;
          const index = keyed >= 0 ? keyed : Math.min(session.index, targets.length - 1);
          const target = targets[index];
          if (target) paintContentTarget(target, index, session.origin);
          else exitContentMode();
        });
      };
    });
    klack.dom.watch(threadPaneSelector, (pane) => {
      cancelPendingThreadTeardown?.();
      cancelPendingThreadTeardown = null;
      let cancelMovementRetry: (() => void) | null = null;
      const drainPendingMovement = (attempt = 0): void => {
        if (cancelMovementRetry) return;
        const scheduleRetry = (nextAttempt = attempt + 1): void => {
          if (nextAttempt > 40) return;
          cancelMovementRetry = klack.timers.timeout(
            () => {
              cancelMovementRetry = null;
              drainPendingMovement(nextAttempt);
            },
            50,
          );
        };
        if (!isRendered(pane)) {
          scheduleRetry();
          return;
        }
        if (threadMovementInFlight) {
          if (cancelBoundaryRetry) {
            scheduleRetry();
            return;
          }
          threadMovementInFlight = false;
          pendingThreadMovements.shift();
          drainPendingMovement(0);
          return;
        }
        const needsCursorRebind = Boolean(
          cursor?.kind === "message" &&
            cursor.surface === "thread" &&
            cursor.identity &&
            !pane.contains(cursor.element),
        );
        if (needsCursorRebind && cursor?.identity) {
          const replacement = canonicalElements(pane, messageRowSelector).find(
            (message) => messageIdentity(message) === cursor?.identity,
          );
          if (replacement) {
            paintCursor(replacement, "message", false);
            if (attempt > 0) {
              drainPendingMovement(0);
              return;
            }
          } else {
            if (attempt >= 40) {
              clearCursor();
              drainPendingMovement(0);
            } else scheduleRetry();
            return;
          }
        }
        let madeProgress = false;
        while (pendingThreadMovements.length > 0) {
          const pending = pendingThreadMovements[0];
          if (
            !moveWithin(
              pane,
              messageRowSelector,
              "message",
              pending.direction,
              pending.amount,
            )
          ) {
            break;
          }
          if (cancelBoundaryRetry) {
            threadMovementInFlight = true;
            scheduleRetry(0);
            return;
          }
          pendingThreadMovements.shift();
          madeProgress = true;
        }
        if (pendingThreadMovements.length > 0) {
          scheduleRetry(madeProgress ? 0 : attempt + 1);
        }
      };
      const requestDrain = (): void => {
        cancelMovementRetry?.();
        cancelMovementRetry = null;
        drainPendingMovement(0);
      };
      drainPendingThreadMovement = requestDrain;
      requestDrain();
      const activateThreadSurface = (): void => {
        if (!isRendered(pane)) return;
        cancelPendingThread?.();
        cancelPendingThread = null;
        if (cursor?.kind === "message" && cursor.surface !== "thread") {
          threadOrigin = {
            element: cursor.element,
            identity: cursor.identity,
            surface: cursor.surface === "threads" ? "threads" : "main",
          };
          clearCursor();
        }
        preferredSurface = "thread";
        drainPendingMovement();
      };
      activateThreadSurface();
      const cancelFrame = klack.timers.animationFrame(activateThreadSurface);
      return () => {
        cancelFrame();
        cancelMovementRetry?.();
        if (drainPendingThreadMovement === requestDrain) {
          drainPendingThreadMovement = null;
        }
        cancelPendingThreadTeardown?.();
        cancelPendingThreadTeardown = klack.timers.timeout(() => {
          cancelPendingThreadTeardown = null;
          if (visibleElement(threadPaneSelector) || cancelPendingThread) return;
          finalizeThreadTeardown();
        }, 500);
      };
    });
    klack.cleanup(() => {
      cancelBoundaryRetry?.();
      cancelPendingMediaNavigation?.();
      cancelPendingReaction?.();
      cancelPendingReactionRestore?.();
      cancelPendingSearchRestore?.();
      cancelPendingThread?.();
      cancelPendingThreadTeardown?.();
      clearCursor();
      resetPrefixes();
      insertSession = null;
      pendingThreadMovements.length = 0;
      threadMovementInFlight = false;
      reactionSession = null;
      searchSession = null;
      threadOrigin = null;
      document.documentElement.removeAttribute(SIDEBAR_SEARCH_ATTRIBUTE);
    });
  },
});
