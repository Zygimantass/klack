import { definePlugin } from "klack/sdk";

export default definePlugin({
  name: "NoHelpButton",
  description: "Hides Slack's top navigation help button.",
  setup(klack) {
    klack.ui.hide(klack.selectors.get("slack.top-nav.help-button"), { id: "no-help-button" });
  },
});
