import { definePlugin } from "klack/sdk";

export default definePlugin({
  name: "NoConversationFilter",
  description: "Hides the conversation filter from Slack's sidebar header.",
  setup(klack) {
    klack.ui.hide(
      '.p-sidebar_text_filter_input_header:has([data-qa="sidebar-text-filter-input"])',
      { id: "no-conversation-filter" },
    );
  },
});
