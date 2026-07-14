import { definePlugin } from "klack/sdk";

export default definePlugin({
  name: "LoadedIndicator",
  description: "Shows a small button to prove that Klack loaded.",
  setup(klack) {
    klack.ui.addStyle(
      `
        [data-klack-button="LoadedIndicator:loaded-indicator"] {
          position: fixed;
          right: 12px;
          bottom: 12px;
          z-index: 2147483647;
          border: 1px solid rgba(255, 255, 255, 0.25);
          border-radius: 999px;
          padding: 4px 8px;
          color: white;
          background: #611f69;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
          font: 600 11px/1.2 Slack-Lato, Lato, sans-serif;
          cursor: pointer;
          user-select: none;
        }
      `,
      { id: "loaded-indicator" },
    );

    klack.ui.addButton({
      id: "loaded-indicator",
      target: "body",
      label: `Klack ${klack.version}`,
      title: "Klack is active. Click to test the plugin button API.",
      onClick(_event, { button }) {
        button.textContent = button.textContent?.startsWith("✓")
          ? `Klack ${klack.version}`
          : `✓ Klack ${klack.version}`;
      },
    });
  },
});
