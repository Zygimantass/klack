import { definePlugin } from "klack/sdk";

export default definePlugin({
  name: "RemoveDistractions",
  description:
    "Removes agent features, channel tabs, sidebar filters, help, and low-value channel controls.",
  setup(klack) {
    const channelTabs = klack.selectors.get("slack.channel-header.tabs");
    const viewHeader = klack.selectors.get("slack.channel-header.root");
    const channelNameControl = klack.selectors.get("slack.channel-header.title-control");
    const contextBar = klack.selectors.get("slack.channel-header.context-bar");
    const sharedContextText = klack.selectors.get("slack.channel-header.shared-context-text");
    const dndContextText = klack.selectors.get("slack.channel-header.dnd-context-text");
    const conversationFilter = klack.selectors.get("slack.sidebar.conversation-filter");
    const sharedContext = `${contextBar}:has(${sharedContextText})`;
    klack.ui.hide(
      [
        `.p-sidebar_text_filter_input_header:has(${conversationFilter})`,
        klack.selectors.get("slack.top-nav.help-button"),
        '[data-qa="ai-apps-menu-container"]',
        '[data-qa-channel-sidebar-section-heading="recent_apps"]',
        klack.selectors.get("slack.channel-header.favorite-action"),
        '[data-qa="search_in_channel_button"]',
        '[data-feat="view-header:notifications"]',
        `${channelTabs}:has([aria-label="Add and Edit Channel Tabs"])`,
        sharedContext,
        `${contextBar}:has(${dndContextText})`,
        klack.selectors.get("slack.channel-header.connected-info"),
        "[data-klack-hide-summarize-thread]",
        ':is(button, [role="button"])[aria-label*="summarize" i][aria-label*="thread" i]',
        ':is(button, [role="button"])[title*="summarize" i][title*="thread" i]',
        ':is(button, [role="button"])[data-qa*="summarize" i][data-qa*="thread" i]',
      ],
      { id: "remove-distractions" },
    );

    klack.ui.addStyle(
      `
        [data-klack-external-org-icons] {
          align-self: center;
          margin-inline: 4px;
        }
      `,
      { id: "remove-distractions" },
    );

    const buttonSelector = 'button, [role="button"]';
    const externalOrgIconSelector = `${sharedContext} ${klack.selectors.get(
      "slack.channel-header.shared-context-icon",
    )}`;
    const channelNameSelector = `${viewHeader} ${channelNameControl}`;
    let externalOrgIcons: HTMLElement | null = null;
    let cancelExternalOrgIconsFrame: (() => void) | null = null;
    let externalOrgIconsMarkup = "";

    const updateExternalOrgIcons = (): void => {
      const source = document.querySelector<HTMLElement>(externalOrgIconSelector);
      const channelNameButton = document.querySelector<HTMLElement>(channelNameSelector);

      if (!source || !channelNameButton) {
        externalOrgIcons?.remove();
        externalOrgIcons = null;
        externalOrgIconsMarkup = "";
        return;
      }

      if (
        !externalOrgIcons?.isConnected ||
        externalOrgIcons.previousElementSibling !== channelNameButton
      ) {
        externalOrgIcons?.remove();
        externalOrgIcons = document.createElement("span");
        externalOrgIcons.className = "p-connection_info_icon";
        externalOrgIcons.setAttribute("data-klack-external-org-icons", "");
        channelNameButton.insertAdjacentElement("afterend", externalOrgIcons);
        externalOrgIconsMarkup = "";
      }

      const markup = source.innerHTML;
      if (markup !== externalOrgIconsMarkup) {
        externalOrgIcons.replaceChildren(
          ...Array.from(source.children, (icon) => icon.cloneNode(true)),
        );
        externalOrgIconsMarkup = markup;
      }
    };

    const scheduleExternalOrgIconsUpdate = (): void => {
      if (cancelExternalOrgIconsFrame) return;
      cancelExternalOrgIconsFrame = klack.timers.animationFrame(() => {
        cancelExternalOrgIconsFrame = null;
        updateExternalOrgIcons();
      });
    };

    klack.dom.watch(buttonSelector, (button) => {
      const identity = [
        button.textContent,
        button.getAttribute("aria-label"),
        button.getAttribute("title"),
        button.getAttribute("data-qa"),
      ]
        .filter(Boolean)
        .join(" ")
        .replace(/[-_]+/g, " ");

      if (!/\bsummarize(?:\s+this)?\s+thread\b/i.test(identity)) return;
      button.setAttribute("data-klack-hide-summarize-thread", "");
      return () => button.removeAttribute("data-klack-hide-summarize-thread");
    });

    klack.dom.watch(externalOrgIconSelector, (source) => {
      scheduleExternalOrgIconsUpdate();
      const stopObservingSource = klack.dom.observe(
        source,
        scheduleExternalOrgIconsUpdate,
        { attributes: true, childList: true, subtree: true },
      );
      return () => {
        stopObservingSource();
        if (!source.isConnected) scheduleExternalOrgIconsUpdate();
      };
    });

    klack.dom.watch(channelNameSelector, (channelNameButton) => {
      scheduleExternalOrgIconsUpdate();
      return () => {
        if (!channelNameButton.isConnected) scheduleExternalOrgIconsUpdate();
      };
    });

    updateExternalOrgIcons();
    klack.cleanup(() => {
      cancelExternalOrgIconsFrame?.();
      externalOrgIcons?.remove();
    });
  },
});
