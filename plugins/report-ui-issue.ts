import { definePlugin } from "klack/sdk";

const HISTORY_KEY = "klack:report-ui-issue:steps:v1";
const MAX_STEPS = 5;

type Step = {
  action: string;
  at: string;
  route: string;
};

type PluginSummary = {
  enabled: boolean;
  name: string;
  started: boolean;
};

type ThemeSummary = {
  enabled: boolean;
  name: string;
};

type KlackManager = {
  list(): PluginSummary[];
  listThemes(): ThemeSummary[];
};

type NavigationWindow = Window & {
  Klack?: KlackManager;
  navigation?: EventTarget;
};

function clean(value: string | null | undefined, maxLength = 96): string {
  const normalized = value?.replace(/\s+/g, " ").trim() || "";
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
}

function safeRoute(): string {
  return `${location.origin}${location.pathname}`;
}

function readSteps(): Step[] {
  try {
    const value = JSON.parse(sessionStorage.getItem(HISTORY_KEY) || "[]") as unknown;
    if (!Array.isArray(value)) return [];
    return value
      .filter(
        (step): step is Step =>
          !!step &&
          typeof step === "object" &&
          typeof (step as Step).action === "string" &&
          typeof (step as Step).at === "string" &&
          typeof (step as Step).route === "string",
      )
      .slice(-MAX_STEPS);
  } catch {
    return [];
  }
}

function writeSteps(steps: Step[]): void {
  try {
    sessionStorage.setItem(HISTORY_KEY, JSON.stringify(steps.slice(-MAX_STEPS)));
  } catch {
    // Action history is best-effort and must never interfere with Slack.
  }
}

function visibleRect(element: Element | null): string {
  if (!element) return "no";
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return "no";
  return `yes (${Math.round(rect.width)}×${Math.round(rect.height)})`;
}

function clickDescription(target: Element): string | null {
  if (target.closest("[data-klack-debug-report-trigger]")) return null;

  const control = target.closest<HTMLElement>(
    'button, a, [role="button"], [role="tab"], [role="menuitem"], [role="treeitem"], [role="textbox"], [data-qa="channel-sidebar-channel"]',
  );
  if (!control) return null;

  if (control.closest('[data-qa="message_container"], [data-qa="message-text"]')) {
    const qa = control.getAttribute("data-qa");
    return qa ? `Clicked message control (${qa})` : "Clicked message control";
  }
  if (control.closest('[data-qa="message_input"], [contenteditable="true"]')) {
    return "Focused the message composer";
  }
  if (
    control.closest('[data-qa="search_view"]') ||
    control.matches('[data-qa="top_nav_search"], [role="searchbox"]')
  ) {
    const qa = control.getAttribute("data-qa");
    return qa ? `Clicked search control (${qa})` : "Clicked search control";
  }

  const navigationLabel = control.matches(
    "[data-tabbed-slack-tab-link], [data-qa='channel-sidebar-channel'], [role='treeitem']",
  )
    ? control.textContent
    : "";
  const label = clean(
    control.getAttribute("aria-label") ||
      control.getAttribute("title") ||
      navigationLabel ||
      control.getAttribute("data-qa") ||
      "",
  );
  const kind = control.getAttribute("role") || control.tagName.toLocaleLowerCase();
  return label ? `Clicked ${kind} “${label}”` : `Clicked ${kind}`;
}

function wrapReport(context: CanvasRenderingContext2D, report: string, maxWidth: number): string[] {
  const output: string[] = [];
  for (const sourceLine of report.split("\n")) {
    if (!sourceLine) {
      output.push("");
      continue;
    }

    let line = "";
    for (const word of sourceLine.split(" ")) {
      const next = line ? `${line} ${word}` : word;
      if (context.measureText(next).width <= maxWidth) {
        line = next;
        continue;
      }
      if (line) output.push(line);
      if (context.measureText(word).width <= maxWidth) {
        line = word;
        continue;
      }

      let remainder = word;
      while (remainder && context.measureText(remainder).width > maxWidth) {
        let end = Math.max(1, Math.floor((remainder.length * maxWidth) / context.measureText(remainder).width));
        while (end > 1 && context.measureText(remainder.slice(0, end)).width > maxWidth) end -= 1;
        output.push(remainder.slice(0, end));
        remainder = remainder.slice(end);
      }
      line = remainder;
    }
    if (line) output.push(line);
  }
  return output;
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image), { once: true });
    image.addEventListener("error", () => reject(new Error("Could not decode the Slack screenshot")), {
      once: true,
    });
    image.src = source;
  });
}

async function appendReport(screenshot: string, report: string): Promise<string> {
  const image = await loadImage(screenshot);
  const scale = image.naturalWidth / Math.max(window.innerWidth, 1);
  const fontSize = Math.max(12, Math.round(13 * scale));
  const lineHeight = Math.round(fontSize * 1.45);
  const padding = Math.max(16, Math.round(18 * scale));
  const measure = document.createElement("canvas").getContext("2d");
  if (!measure) throw new Error("Canvas rendering is unavailable");
  measure.font = `${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  const lines = wrapReport(measure, report, image.naturalWidth - padding * 2);
  const footerHeight = padding * 2 + lineHeight * lines.length;

  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight + footerHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas rendering is unavailable");

  context.drawImage(image, 0, 0);
  context.fillStyle = "#1d2021";
  context.fillRect(0, image.naturalHeight, canvas.width, footerHeight);
  context.fillStyle = "#504945";
  context.fillRect(0, image.naturalHeight, canvas.width, Math.max(1, Math.round(scale)));
  context.font = `${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  context.textBaseline = "top";
  lines.forEach((line, index) => {
    context.fillStyle = index === 0 ? "#ebdbb2" : "#a89984";
    context.fillText(line, padding, image.naturalHeight + padding + index * lineHeight);
  });
  return canvas.toDataURL("image/png");
}

export default definePlugin({
  name: "ReportUiIssue",
  description: "Copies an annotated screenshot and privacy-safe UI diagnostics for reporting Klack issues.",
  setup(klack) {
    let steps = readSteps();
    let lastRoute = safeRoute();
    let resetButton: (() => void) | undefined;
    let capturing = false;

    const record = (action: string): void => {
      const next: Step = {
        action: clean(action),
        at: new Date().toLocaleTimeString([], { hour12: false }),
        route: safeRoute(),
      };
      const previous = steps.at(-1);
      if (previous?.action === next.action && previous.route === next.route) return;
      steps = [...steps, next].slice(-MAX_STEPS);
      writeSteps(steps);
    };

    const recordNavigation = (): void => {
      const route = safeRoute();
      if (route === lastRoute) return;
      lastRoute = route;
      record(`Navigated to ${route}`);
    };

    const navigation = (window as NavigationWindow).navigation;
    if (navigation) klack.events.on(navigation, "currententrychange", recordNavigation);
    klack.events.on(window, "popstate", () => queueMicrotask(recordNavigation));
    klack.events.on(window, "hashchange", () => queueMicrotask(recordNavigation));
    klack.events.on(
      document,
      "click",
      (event) => {
        if (event.button !== 0 || !(event.target instanceof Element)) return;
        const description = clickDescription(event.target);
        if (description) record(description);
      },
      true,
    );

    klack.ui.addStyle(
      `
        [data-klack-debug-report-trigger] {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          height: 28px;
          margin: 0 2px;
          padding: 0 8px;
          border: 1px solid rgba(255, 255, 255, 0.16);
          border-radius: 6px;
          color: inherit;
          background: rgba(255, 255, 255, 0.08);
          font: 700 12px/26px Slack-Lato, Lato, sans-serif;
          cursor: pointer;
        }

        [data-klack-debug-report-trigger]:hover {
          background: rgba(255, 255, 255, 0.16);
        }

        [data-klack-debug-report-trigger]:disabled {
          cursor: progress;
          opacity: 0.75;
        }

        [data-klack-debug-report-trigger] svg {
          width: 15px;
          height: 15px;
          fill: none;
          stroke: currentColor;
          stroke-linecap: round;
          stroke-linejoin: round;
          stroke-width: 1.6;
        }
      `,
      { id: "report-ui-issue" },
    );

    klack.ui.mount(
      klack.selectors.get("slack.top-nav.help-button"),
      ({ on }) => {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.klackDebugReportTrigger = "";
        button.title = "Copy screenshot and UI diagnostics";
        button.ariaLabel = "Copy screenshot and UI diagnostics";
        const idleMarkup =
          '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2.75" y="5.25" width="14.5" height="11" rx="2"></rect><path d="M7 5.25 8.25 3.5h3.5L13 5.25"></path><circle cx="10" cy="10.75" r="3"></circle></svg><span>Report</span>';
        button.innerHTML = idleMarkup;

        const setTemporaryLabel = (label: string): void => {
          resetButton?.();
          button.textContent = label;
          resetButton = klack.timers.timeout(() => {
            resetButton = undefined;
            button.innerHTML = idleMarkup;
          }, 2_500);
        };

        const createReport = (): string => {
          const global = (window as NavigationWindow).Klack;
          const enabledPlugins = global?.list().filter((plugin) => plugin.enabled && plugin.started) || [];
          const failedPlugins = global?.list().filter((plugin) => plugin.enabled && !plugin.started) || [];
          const enabledThemes = global?.listThemes().filter((theme) => theme.enabled) || [];
          const channel = clean(
            document.querySelector(klack.selectors.get("slack.channel-header.title-control"))?.textContent,
          );
          const activeTab = clean(
            document.querySelector('[data-tabbed-slack-tab][data-active="true"] [data-tabbed-slack-tab-link]')
              ?.textContent,
          );
          const searchVisible = visibleRect(
            document.querySelector(klack.selectors.get("slack.search.view")),
          ) !== "no";
          const surfaces = [
            searchVisible && "Search",
            document.querySelector(klack.selectors.get("slack.threads.view")) && "Threads",
            document.querySelector(klack.selectors.get("slack.thread.pane")) && "Thread pane",
            channel && "Conversation",
          ].filter(Boolean);
          const rootStyle = getComputedStyle(document.documentElement);
          const lines = [
            "KLACK UI DEBUG REPORT",
            `Captured: ${new Date().toISOString()}`,
            `Screen: ${surfaces.join(" + ") || "Unknown Slack surface"}`,
            `Route: ${safeRoute()}`,
            `Title: ${searchVisible ? "Slack search (query omitted)" : clean(document.title, 140) || "unknown"}`,
            `Channel: ${channel || "none"}`,
            `Active tab: ${searchVisible ? "Search (query omitted)" : activeTab || "none"}`,
            `Viewport: ${window.innerWidth}×${window.innerHeight} @${window.devicePixelRatio}x`,
            `Regions: sidebar=${visibleRect(document.querySelector(klack.selectors.get("slack.sidebar.root")))}, thread=${visibleRect(document.querySelector(klack.selectors.get("slack.thread.pane")))}, composer=${visibleRect(document.querySelector(klack.selectors.get("slack.composer.input")))}`,
            `UI: font=${clean(rootStyle.fontFamily, 120)} ${rootStyle.fontSize}/${rootStyle.lineHeight}; background=${rootStyle.backgroundColor}`,
            `Klack: ${klack.version}; plugins=${enabledPlugins.map((plugin) => plugin.name).join(", ") || "none"}`,
            `Themes: ${enabledThemes.map((theme) => theme.name).join(", ") || "none"}`,
            `Failed plugins: ${failedPlugins.map((plugin) => plugin.name).join(", ") || "none"}`,
            `Runtime: ${clean(navigator.userAgent, 180)}`,
            "Recent actions (oldest → newest):",
            ...(steps.length
              ? steps.map((step, index) => `${index + 1}. ${step.at} — ${step.action} [${step.route}]`)
              : ["1. No navigation or control clicks recorded in this session."]),
            "Privacy: diagnostic text omits message bodies, typed text, search terms, and query parameters; the screenshot contains the visible UI.",
          ];
          return lines.join("\n");
        };

        on(button, "click", async () => {
          if (capturing) return;
          capturing = true;
          resetButton?.();
          resetButton = undefined;
          try {
            const report = createReport();
            const screenshot = await klack.diagnostics.capturePage();
            button.disabled = true;
            button.textContent = "Preparing…";
            let annotated = screenshot;
            try {
              annotated = await appendReport(screenshot, report);
            } catch (error) {
              klack.logger.warn(
                "[ReportUiIssue] Could not annotate screenshot; copying the raw capture",
                error,
              );
            }
            await klack.diagnostics.copyReport({ imageDataUrl: annotated, text: report });
            setTemporaryLabel("✓ Copied");
          } catch (error) {
            klack.logger.error("[ReportUiIssue] Could not create diagnostic report", error);
            setTemporaryLabel("! Failed");
          } finally {
            capturing = false;
            button.disabled = false;
          }
        });
        return button;
      },
      { position: "after" },
    );

    klack.cleanup(() => resetButton?.());
  },
});
