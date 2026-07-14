import { definePlugin } from "klack/sdk";

export default definePlugin({
  name: "NoHelpButton",
  description: "Hides Slack's top navigation help button.",
  setup(klack) {
    klack.ui.hide('[data-qa="top-nav-help-button"]', { id: "no-help-button" });
  },
});
