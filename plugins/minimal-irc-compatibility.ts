import { definePlugin, type Cleanup } from "klack/sdk";

import {
  classifySlackMention,
  isRelevantSlackMention,
  relevantUserGroupIds,
  type SlackMention,
} from "./lib/minimal-irc-compatibility";

type ThemeManager = {
  isThemeEnabled(id: string): boolean;
};

type SlackDesktopDelegate = {
  getCurrentUserId?(): Promise<string> | string;
  getTokenForCurrentTeam?(): Promise<string> | string;
};

type SlackWindow = Window & {
  desktopDelegate?: SlackDesktopDelegate;
  desktopDelegates?: Record<string, SlackDesktopDelegate>;
  navigation?: EventTarget;
};

type MessageDecoration = {
  compactSpacer: ChildNode | undefined;
  compactSpacerText: string;
  content: Element;
  indent: Element;
  prefix: HTMLSpanElement;
  senderLabel: HTMLSpanElement;
  timeLabel: HTMLSpanElement;
};

function themeManager(): ThemeManager | undefined {
  return (window as unknown as { Klack?: ThemeManager }).Klack;
}

function visibleText(element: Element | null): string {
  return element?.textContent?.replace(/\s+/g, " ").trim() || "";
}

function activeSlackDelegate(): SlackDesktopDelegate | undefined {
  const slackWindow = window as SlackWindow;
  const team = location.pathname.match(/^\/client\/([^/]+)/)?.[1];
  return (team && slackWindow.desktopDelegates?.[team]) || slackWindow.desktopDelegate;
}

function activeSlackTeam(): string {
  return location.pathname.match(/^\/client\/([^/]+)/)?.[1] || "__default__";
}

function mentionFromElement(element: Element): SlackMention | null {
  return classifySlackMention({
    classes: Array.from(element.classList),
    memberId: element.getAttribute("data-member-id"),
    stringifyId: element.getAttribute("data-stringify-id"),
    stringifyType: element.getAttribute("data-stringify-type"),
    userGroupId: element.getAttribute("data-user-group-id"),
  });
}

export default definePlugin({
  name: "MinimalIRCCompatibility",
  description:
    "Adds message metadata and relevant-mention markers while the Minimal IRC theme is enabled.",
  setup(klack) {
    const messageSelector = klack.selectors.get("slack.message.row");
    const senderSelector = klack.selectors.get("slack.message.sender-name");
    const timestampSelector = klack.selectors.get("slack.message.timestamp");
    const timestampLabelSelector = klack.selectors.get("slack.message.timestamp-label");
    const indentSelector = klack.selectors.get("slack.message.indent");
    const bodySelector = klack.selectors.get("slack.message.body");
    const userMentionSelector = klack.selectors.get("slack.message.user-mention");
    const userGroupMentionSelector = klack.selectors.get("slack.message.user-group-mention");
    const attachmentSelector = klack.selectors.get("slack.attachment.collection");
    const filesSelector = klack.selectors.get("slack.file.collection");
    const surfaceSelector = [
      klack.selectors.get("slack.message.pane"),
      klack.selectors.get("slack.threads.view"),
      klack.selectors.get("slack.thread.pane"),
    ].join(", ");

    let stopDecorating: Cleanup | undefined;

    const startDecorating = (): Cleanup => {
      const decorations = new Map<Element, MessageDecoration>();
      const mentions = new Set<Element>();
      const sendersBySurface = new WeakMap<Element, Map<string, string>>();
      let active = true;
      let currentUserId = "";
      let identityContext: string | null = null;
      let identityGeneration = 0;
      let identityLoading = false;
      let identityReady = false;
      let identityRetryCount = 0;
      let cancelIdentityRetry: Cleanup | null = null;
      let membershipAbort: AbortController | null = null;
      let relevantGroupIds = new Set<string>();

      const decorateMention = (mention: Element): void => {
        if (
          isRelevantSlackMention(mentionFromElement(mention), currentUserId, relevantGroupIds)
        ) {
          mention.setAttribute("data-klack-relevant-mention", "");
        } else {
          mention.removeAttribute("data-klack-relevant-mention");
        }
      };

      const refreshMentions = (): void => mentions.forEach(decorateMention);

      const loadMentionIdentity = async (
        generation: number,
        abort: AbortController,
      ): Promise<"complete" | "retry" | "stale"> => {
        const delegate = activeSlackDelegate();
        const userId = await delegate?.getCurrentUserId?.();
        if (!active || generation !== identityGeneration) return "stale";
        if (typeof userId !== "string" || !userId) return "retry";
        currentUserId = userId;
        refreshMentions();

        const token = await delegate?.getTokenForCurrentTeam?.();
        if (!active || generation !== identityGeneration) return "stale";
        if (typeof token !== "string" || !token) return "retry";
        const body = new URLSearchParams({
          include_users: "true",
          token,
        });
        const response = await fetch("/api/usergroups.list", {
          body,
          credentials: "same-origin",
          method: "POST",
          signal: abort.signal,
        });
        if (!response.ok) return "retry";
        const result = (await response.json()) as { ok?: unknown; usergroups?: unknown };
        if (!active || generation !== identityGeneration) return "stale";
        if (result.ok !== true) return "retry";
        relevantGroupIds = relevantUserGroupIds(result.usergroups, currentUserId);
        refreshMentions();
        return "complete";
      };

      const scheduleIdentityRetry = (generation: number): void => {
        identityLoading = false;
        if (identityRetryCount >= 3) {
          identityReady = true;
          return;
        }
        const delays = [250, 1_000, 3_000] as const;
        const delay = delays[identityRetryCount];
        identityRetryCount += 1;
        cancelIdentityRetry = klack.timers.timeout(() => {
          cancelIdentityRetry = null;
          if (active && generation === identityGeneration) ensureMentionIdentity();
        }, delay);
      };

      function ensureMentionIdentity(): void {
        if (!active) return;
        const context = activeSlackTeam();
        if (context !== identityContext) {
          identityContext = context;
          identityGeneration += 1;
          identityLoading = false;
          identityReady = false;
          identityRetryCount = 0;
          currentUserId = "";
          relevantGroupIds = new Set();
          cancelIdentityRetry?.();
          cancelIdentityRetry = null;
          membershipAbort?.abort();
          membershipAbort = null;
          refreshMentions();
        }
        if (identityLoading || identityReady || cancelIdentityRetry) return;

        identityLoading = true;
        const generation = identityGeneration;
        const abort = new AbortController();
        membershipAbort = abort;
        void loadMentionIdentity(generation, abort)
          .then((outcome) => {
            if (!active || generation !== identityGeneration || outcome === "stale") return;
            if (outcome === "complete") {
              identityLoading = false;
              identityReady = true;
            } else scheduleIdentityRetry(generation);
          })
          .catch((error: unknown) => {
            if (!active || generation !== identityGeneration) return;
            if (error instanceof DOMException && error.name === "AbortError") return;
            klack.logger.warn(
              "[Klack] MinimalIRCCompatibility could not load user-group membership",
            );
            scheduleIdentityRetry(generation);
          });
      }

      const senderCache = (message: Element): Map<string, string> => {
        const surface = message.closest(surfaceSelector) || document.documentElement;
        let cache = sendersBySurface.get(surface);
        if (!cache) {
          cache = new Map();
          sendersBySurface.set(surface, cache);
        }
        return cache;
      };

      const removeDecoration = (message: Element): void => {
        const decoration = decorations.get(message);
        if (!decoration) return;

        decoration.prefix.remove();
        if (decoration.compactSpacer?.isConnected && !decoration.compactSpacer.textContent) {
          decoration.compactSpacer.textContent = decoration.compactSpacerText;
        }
        decoration.content.removeAttribute("data-klack-message-content");
        message.removeAttribute("data-klack-message");
        decorations.delete(message);
      };

      const decorateMessage = (message: Element): void => {
        const channel = message.getAttribute("data-msg-channel-id") || "__default__";
        const cache = senderCache(message);
        let sender = visibleText(message.querySelector(senderSelector));
        if (sender) cache.set(channel, sender);
        else sender = cache.get(channel) || "";

        const timestamp = message.querySelector<HTMLElement>(timestampSelector);
        const timestampText = [
          visibleText(timestamp?.querySelector(timestampLabelSelector) || null),
          timestamp?.getAttribute("aria-label") || "",
        ].join(" ");
        const time = timestampText.match(/\b\d{1,2}:\d{2}\b/)?.[0] || "";
        if (!sender || !time) return;

        const indent = message.querySelector(indentSelector);
        if (!indent) return;
        const compactSpacer = Array.from(indent.childNodes).find(
          (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.includes("\u00a0"),
        );
        const compactSpacerText = compactSpacer?.textContent || "";
        const content = Array.from(indent.children).find(
          (element) =>
            !element.matches(`${klack.selectors.get("slack.message.sender")}, [data-klack-message-prefix]`),
        );
        if (!content) return;

        let decoration = decorations.get(message);
        if (decoration && (decoration.indent !== indent || decoration.content !== content)) {
          removeDecoration(message);
          decoration = undefined;
        }
        if (decoration && compactSpacer && decoration.compactSpacer !== compactSpacer) {
          if (decoration.compactSpacer?.isConnected && !decoration.compactSpacer.textContent) {
            decoration.compactSpacer.textContent = decoration.compactSpacerText;
          }
          decoration.compactSpacer = compactSpacer;
          decoration.compactSpacerText = compactSpacerText;
        }

        if (!decoration) {
          const prefix = document.createElement("span");
          prefix.dataset.klackMessagePrefix = "";
          prefix.ariaHidden = "true";
          prefix.style.display = "none";
          const timeLabel = document.createElement("span");
          timeLabel.dataset.klackMessageTime = "";
          const senderLabel = document.createElement("span");
          senderLabel.dataset.klackMessageSender = "";
          prefix.append(timeLabel, senderLabel);
          decoration = {
            compactSpacer,
            compactSpacerText,
            content,
            indent,
            prefix,
            senderLabel,
            timeLabel,
          };
          decorations.set(message, decoration);
          indent.prepend(prefix);
        }

        decoration.timeLabel.textContent = `[${time}] `;
        decoration.senderLabel.textContent = `<${sender}>`;
        if (decoration.compactSpacer) decoration.compactSpacer.textContent = "";
        decoration.content.setAttribute("data-klack-message-content", "");
        message.setAttribute("data-klack-message", "");
      };

      const cleanups = [
        klack.dom.watch(messageSelector, (message) => {
          decorateMessage(message);
          return () => removeDecoration(message);
        }),
        klack.dom.watch(
          `${messageSelector} ${bodySelector}, ${messageSelector} ${senderSelector}, ${messageSelector} ${timestampSelector}, ${messageSelector} ${indentSelector}, ${messageSelector} ${attachmentSelector}, ${messageSelector} ${filesSelector}`,
          (content) => {
            const message = content.closest(messageSelector);
            if (message) decorateMessage(message);
          },
        ),
        klack.dom.watch(
          `${userMentionSelector}, ${userGroupMentionSelector}`,
          (mention) => {
            ensureMentionIdentity();
            mentions.add(mention);
            decorateMention(mention);
            const stopObserving = klack.dom.observe(
              mention,
              () => {
                ensureMentionIdentity();
                decorateMention(mention);
              },
              {
                attributeFilter: [
                  "class",
                  "data-member-id",
                  "data-stringify-id",
                  "data-stringify-type",
                  "data-user-group-id",
                ],
                attributes: true,
              },
            );
            return () => {
              stopObserving();
              mentions.delete(mention);
              mention.removeAttribute("data-klack-relevant-mention");
            };
          },
          {
            attributes: [
              "class",
              "data-member-id",
              "data-stringify-id",
              "data-stringify-type",
              "data-user-group-id",
            ],
          },
        ),
        ...((window as SlackWindow).navigation
          ? [
              klack.events.on(
                (window as SlackWindow).navigation as EventTarget,
                "currententrychange",
                () => queueMicrotask(ensureMentionIdentity),
              ),
            ]
          : []),
        klack.events.on(window, "popstate", () => queueMicrotask(ensureMentionIdentity)),
      ];

      ensureMentionIdentity();

      return () => {
        active = false;
        identityGeneration += 1;
        cancelIdentityRetry?.();
        membershipAbort?.abort();
        [...cleanups].reverse().forEach((cleanup) => cleanup());
        [...decorations.keys()].forEach(removeDecoration);
      };
    };

    const reconcile = (): void => {
      const enabled = themeManager()?.isThemeEnabled("MinimalIRC") === true;
      if (enabled && !stopDecorating) stopDecorating = startDecorating();
      else if (!enabled && stopDecorating) {
        stopDecorating();
        stopDecorating = undefined;
      }
    };

    klack.events.on(document, "klack:themes-changed", reconcile);
    klack.cleanup(() => stopDecorating?.());
    reconcile();
  },
});
