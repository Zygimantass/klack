import { definePlugin, type Cleanup } from "klack/sdk";

type ThemeManager = {
  isThemeEnabled(id: string): boolean;
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

export default definePlugin({
  name: "MinimalIRCCompatibility",
  description: "Adds message metadata used by the Minimal IRC theme while that theme is enabled.",
  setup(klack) {
    const messageSelector = klack.selectors.get("slack.message.row");
    const senderSelector = klack.selectors.get("slack.message.sender-name");
    const timestampSelector = klack.selectors.get("slack.message.timestamp");
    const timestampLabelSelector = klack.selectors.get("slack.message.timestamp-label");
    const indentSelector = klack.selectors.get("slack.message.indent");
    const bodySelector = klack.selectors.get("slack.message.body");
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
      const sendersBySurface = new WeakMap<Element, Map<string, string>>();

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
      ];

      return () => {
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
