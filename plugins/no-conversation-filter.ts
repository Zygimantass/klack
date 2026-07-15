import { definePlugin } from "klack/sdk";

export default definePlugin({
  name: "NoConversationFilter",
  description: "Hides the conversation filter from Slack's sidebar header.",
  setup(klack) {
    const filter = klack.selectors.get("slack.sidebar.conversation-filter");
    klack.ui.hide(
      `.p-sidebar_text_filter_input_header:has(${filter})`,
      { id: "no-conversation-filter" },
    );
  },
});
