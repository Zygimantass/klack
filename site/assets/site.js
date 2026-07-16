const root = document.documentElement;
const body = document.body;

const icons = {
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>`,
  copy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>`,
  file: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5"/></svg>`,
};

const menuButton = document.querySelector("[data-menu-toggle]");
const mobileNav = document.querySelector("[data-mobile-nav]");

function closeMobileNav() {
  mobileNav?.classList.remove("open");
  menuButton?.setAttribute("aria-expanded", "false");
  body.classList.remove("nav-open");
}

menuButton?.addEventListener("click", () => {
  const open = mobileNav?.classList.toggle("open") ?? false;
  menuButton.setAttribute("aria-expanded", String(open));
  body.classList.toggle("nav-open", open);
});

mobileNav?.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeMobileNav));

const docsSidebar = document.querySelector("[data-docs-sidebar]");
const docsToggle = document.querySelector("[data-docs-toggle]");

function closeDocsSidebar() {
  docsSidebar?.classList.remove("open");
  docsToggle?.setAttribute("aria-expanded", "false");
  body.classList.remove("nav-open");
}

docsToggle?.addEventListener("click", () => {
  const open = docsSidebar?.classList.toggle("open") ?? false;
  docsToggle.setAttribute("aria-expanded", String(open));
  body.classList.toggle("nav-open", open);
});

docsSidebar?.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeDocsSidebar));

document.addEventListener("click", (event) => {
  if (mobileNav?.classList.contains("open") && !mobileNav.contains(event.target) && !menuButton?.contains(event.target)) {
    closeMobileNav();
  }
  if (docsSidebar?.classList.contains("open") && !docsSidebar.contains(event.target) && !docsToggle?.contains(event.target)) {
    closeDocsSidebar();
  }
});

async function writeClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const temporary = document.createElement("textarea");
  temporary.value = text;
  temporary.style.position = "fixed";
  temporary.style.opacity = "0";
  document.body.append(temporary);
  temporary.select();
  document.execCommand("copy");
  temporary.remove();
}

const visualLabStorageKey = "klack-visual-lab";
const visualLabColorControls = [
  { property: "--bg", label: "Canvas" },
  { property: "--bg-raised", label: "Surface" },
  { property: "--ink", label: "Text" },
  { property: "--ink-muted", label: "Muted text" },
  { property: "--accent", label: "Action" },
  { property: "--art", label: "Dither" },
  { property: "--purple", label: "Code" },
];
const visualLabDefaults = {
  colors: {
    "--bg": "#0b0d0c",
    "--bg-raised": "#101311",
    "--ink": "#edeee8",
    "--ink-muted": "#92978f",
    "--accent": "#c8ff4d",
    "--art": "#56bdf3",
    "--purple": "#776bff",
  },
  animated: true,
  density: 5,
  speed: 22,
};
const visualLabPresets = {
  signal: {
    label: "Signal",
    colors: visualLabDefaults.colors,
  },
  matcha: {
    label: "Matcha",
    colors: {
      "--bg": "#08110e",
      "--bg-raised": "#102019",
      "--ink": "#e8e4d2",
      "--ink-muted": "#8e9a88",
      "--accent": "#d2dc81",
      "--art": "#739f7a",
      "--purple": "#b59b70",
    },
  },
  dew: {
    label: "Dew",
    colors: {
      "--bg": "#071014",
      "--bg-raised": "#0e1c21",
      "--ink": "#e2e9e8",
      "--ink-muted": "#82979b",
      "--accent": "#83d4df",
      "--art": "#477f8e",
      "--purple": "#8daec7",
    },
  },
  alpenglow: {
    label: "Alpenglow",
    colors: {
      "--bg": "#120e14",
      "--bg-raised": "#201820",
      "--ink": "#eee5e7",
      "--ink-muted": "#a08e99",
      "--accent": "#dca5af",
      "--art": "#795d75",
      "--purple": "#b09ad1",
    },
  },
  ember: {
    label: "Ember",
    colors: {
      "--bg": "#140b08",
      "--bg-raised": "#24130e",
      "--ink": "#f0dfca",
      "--ink-muted": "#a88775",
      "--accent": "#ef9a64",
      "--art": "#a43f2d",
      "--purple": "#cf7868",
    },
  },
  mono: {
    label: "Mono",
    colors: {
      "--bg": "#0a0a0a",
      "--bg-raised": "#141414",
      "--ink": "#eeeeea",
      "--ink-muted": "#91918c",
      "--accent": "#deded7",
      "--art": "#a2a29b",
      "--purple": "#bdbdb7",
    },
  },
};

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function hexToRgb(hex) {
  const value = hex.replace("#", "");
  return [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16));
}

function rgbToHex(rgb) {
  return `#${rgb.map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`;
}

function mixColors(first, second, amount) {
  const firstRgb = hexToRgb(first);
  const secondRgb = hexToRgb(second);
  return rgbToHex(firstRgb.map((channel, index) => channel + (secondRgb[index] - channel) * amount));
}

function colorLuminance(hex) {
  return hexToRgb(hex)
    .map((channel) => channel / 255)
    .map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
    .reduce((total, channel, index) => total + channel * [0.2126, 0.7152, 0.0722][index], 0);
}

function derivedVisualColors(colors) {
  const background = colors["--bg"];
  const surface = colors["--bg-raised"];
  const text = colors["--ink"];
  const muted = colors["--ink-muted"];
  const accent = colors["--accent"];
  const art = colors["--art"];
  const purple = colors["--purple"];
  const accentInk = colorLuminance(accent) > 0.42 ? "#10110f" : "#f4f4ef";

  return {
    "--bg-soft": mixColors(surface, text, 0.055),
    "--bg-tint": mixColors(background, text, 0.025),
    "--bg-deep": mixColors(background, "#000000", 0.24),
    "--line": mixColors(background, text, 0.12),
    "--line-strong": mixColors(background, text, 0.27),
    "--accent-hover": mixColors(accent, accentInk, 0.08),
    "--accent-ink": accentInk,
    "--purple-soft": mixColors(background, purple, 0.2),
    "--code-bg": mixColors(background, "#000000", 0.3),
    "--code-ink": mixColors(text, "#ffffff", 0.03),
    "--code-muted": muted,
    "--code-purple": mixColors(purple, "#ffffff", 0.36),
    "--code-green": accent,
    "--code-blue": mixColors(art, "#ffffff", 0.18),
    "--code-panel": mixColors(surface, text, 0.045),
    "--code-line": mixColors(surface, text, 0.16),
  };
}

function copyVisualSettings(settings) {
  return {
    colors: { ...settings.colors },
    animated: settings.animated,
    density: settings.density,
    speed: settings.speed,
  };
}

function loadVisualSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(visualLabStorageKey));
    return {
      colors: { ...visualLabDefaults.colors, ...saved?.colors },
      animated: typeof saved?.animated === "boolean" ? saved.animated : visualLabDefaults.animated,
      density: clamp(Number(saved?.density) || visualLabDefaults.density, 3, 10),
      speed: clamp(Number(saved?.speed) || visualLabDefaults.speed, 8, 50),
    };
  } catch {
    return copyVisualSettings(visualLabDefaults);
  }
}

let visualSettings = loadVisualSettings();

function applyVisualSettings() {
  const properties = { ...visualSettings.colors, ...derivedVisualColors(visualSettings.colors) };
  for (const [property, value] of Object.entries(properties)) {
    root.style.setProperty(property, value);
  }
  root.style.setProperty("--dither-grid", `${visualSettings.density}px`);
  root.style.setProperty("--dither-grid-wide", `${visualSettings.density + 4}px`);
  root.style.setProperty("--dither-speed", `${visualSettings.speed}s`);
  root.style.setProperty("--dither-speed-slow", `${Math.round(visualSettings.speed * 1.4)}s`);
  root.style.setProperty("--dither-play-state", visualSettings.animated ? "running" : "paused");
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", visualSettings.colors["--bg"]);
}

function saveVisualSettings() {
  try {
    localStorage.setItem(visualLabStorageKey, JSON.stringify(visualSettings));
  } catch {}
}

function createVisualLab() {
  const trigger = document.createElement("button");
  trigger.className = "visual-lab-trigger";
  trigger.type = "button";
  trigger.setAttribute("aria-controls", "visual-lab");
  trigger.setAttribute("aria-expanded", "false");
  trigger.innerHTML = `<span aria-hidden="true">◐</span> Visual lab`;

  const panel = document.createElement("aside");
  panel.className = "visual-lab";
  panel.id = "visual-lab";
  panel.hidden = true;
  panel.setAttribute("aria-label", "Visual settings");
  panel.innerHTML = `
    <div class="visual-lab-header">
      <strong>Visual lab</strong>
      <button type="button" data-visual-close aria-label="Close visual lab">×</button>
    </div>
    <div class="visual-lab-body">
      <fieldset class="visual-lab-section">
        <legend>Palette presets</legend>
        <div class="visual-preset-grid">
          ${Object.entries(visualLabPresets).map(([id, preset]) => `
            <button type="button" data-visual-preset="${id}" aria-pressed="false">
              <span class="visual-preset-swatch" style="--preset-bg: ${preset.colors["--bg"]}; --preset-art: ${preset.colors["--art"]}; --preset-accent: ${preset.colors["--accent"]}"></span>
              ${preset.label}
            </button>`).join("")}
        </div>
      </fieldset>
      <fieldset class="visual-lab-section">
        <legend>Colors</legend>
        <div class="visual-color-list">
          ${visualLabColorControls.map(({ property, label }) => `
            <label class="visual-color-row">
              <span><strong>${label}</strong><code>${property}</code></span>
              <output data-visual-output="${property}"></output>
              <input type="color" data-visual-color="${property}" aria-label="${label} color" />
            </label>`).join("")}
        </div>
      </fieldset>
      <fieldset class="visual-lab-section">
        <legend>Dither motion</legend>
        <label class="visual-toggle-row">
          <span><strong>Animate</strong><small>Reduced-motion settings still win.</small></span>
          <input type="checkbox" data-visual-animated />
        </label>
        <label class="visual-range-row">
          <span><strong>Density</strong><output data-visual-density-output></output></span>
          <input type="range" min="3" max="10" step="1" data-visual-density />
        </label>
        <label class="visual-range-row">
          <span><strong>Cycle speed</strong><output data-visual-speed-output></output></span>
          <input type="range" min="8" max="50" step="1" data-visual-speed />
        </label>
      </fieldset>
    </div>
    <div class="visual-lab-footer">
      <button type="button" data-visual-reset>Reset</button>
      <button type="button" data-visual-copy>Copy CSS</button>
    </div>`;

  body.append(trigger, panel);

  const colorInputs = [...panel.querySelectorAll("[data-visual-color]")];
  const densityInput = panel.querySelector("[data-visual-density]");
  const speedInput = panel.querySelector("[data-visual-speed]");
  const animatedInput = panel.querySelector("[data-visual-animated]");

  function matchingPreset() {
    return Object.entries(visualLabPresets).find(([, preset]) =>
      Object.entries(preset.colors).every(([property, value]) => visualSettings.colors[property] === value),
    )?.[0];
  }

  function syncVisualLab() {
    for (const input of colorInputs) {
      const value = visualSettings.colors[input.dataset.visualColor];
      input.value = value;
      panel.querySelector(`[data-visual-output="${input.dataset.visualColor}"]`).textContent = value;
    }
    densityInput.value = String(visualSettings.density);
    speedInput.value = String(visualSettings.speed);
    animatedInput.checked = visualSettings.animated;
    panel.querySelector("[data-visual-density-output]").textContent = `${visualSettings.density}px`;
    panel.querySelector("[data-visual-speed-output]").textContent = `${visualSettings.speed}s`;
    const activePreset = matchingPreset();
    panel.querySelectorAll("[data-visual-preset]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.visualPreset === activePreset));
    });
  }

  function updateVisualSettings() {
    applyVisualSettings();
    saveVisualSettings();
    syncVisualLab();
  }

  function closeVisualLab() {
    panel.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    trigger.focus();
  }

  trigger.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    trigger.setAttribute("aria-expanded", String(!panel.hidden));
    if (!panel.hidden) panel.querySelector("[data-visual-close]").focus();
  });
  panel.querySelector("[data-visual-close]").addEventListener("click", closeVisualLab);
  panel.querySelectorAll("[data-visual-preset]").forEach((button) => {
    button.addEventListener("click", () => {
      visualSettings.colors = { ...visualLabPresets[button.dataset.visualPreset].colors };
      updateVisualSettings();
    });
  });
  for (const input of colorInputs) {
    input.addEventListener("input", () => {
      visualSettings.colors[input.dataset.visualColor] = input.value;
      updateVisualSettings();
    });
  }
  densityInput.addEventListener("input", () => {
    visualSettings.density = Number(densityInput.value);
    updateVisualSettings();
  });
  speedInput.addEventListener("input", () => {
    visualSettings.speed = Number(speedInput.value);
    updateVisualSettings();
  });
  animatedInput.addEventListener("change", () => {
    visualSettings.animated = animatedInput.checked;
    updateVisualSettings();
  });
  panel.querySelector("[data-visual-reset]").addEventListener("click", () => {
    visualSettings = copyVisualSettings(visualLabDefaults);
    try {
      localStorage.removeItem(visualLabStorageKey);
    } catch {}
    applyVisualSettings();
    syncVisualLab();
  });
  panel.querySelector("[data-visual-copy]").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const properties = { ...visualSettings.colors, ...derivedVisualColors(visualSettings.colors) };
    const css = `:root {\n${Object.entries(properties).map(([property, value]) => `  ${property}: ${value};`).join("\n")}\n}`;
    try {
      await writeClipboard(css);
      button.textContent = "Copied";
      window.setTimeout(() => (button.textContent = "Copy CSS"), 1400);
    } catch {
      button.textContent = "Copy failed";
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !panel.hidden) closeVisualLab();
  });

  if (new URLSearchParams(window.location.search).has("lab")) {
    panel.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
  }

  syncVisualLab();
}

applyVisualSettings();
createVisualLab();

document.querySelectorAll("[data-copy]").forEach((button) => {
  const original = button.innerHTML;
  button.addEventListener("click", async () => {
    const target = document.querySelector(button.dataset.copy);
    const text = target?.textContent?.replace(/^\$\s*/, "").trim();
    if (!text) return;

    try {
      await writeClipboard(text);
      button.innerHTML = icons.check;
      button.setAttribute("aria-label", "Copied");
      window.setTimeout(() => {
        button.innerHTML = original;
        button.setAttribute("aria-label", "Copy to clipboard");
      }, 1600);
    } catch {
      button.setAttribute("aria-label", "Copy failed");
    }
  });
});

document.querySelectorAll(".code-frame[data-code]").forEach((frame) => {
  const header = frame.querySelector(".code-header");
  const code = frame.querySelector("code");
  if (!header || !code || header.querySelector(".code-header-copy")) return;

  const button = document.createElement("button");
  button.className = "code-header-copy";
  button.type = "button";
  button.textContent = "Copy";
  button.setAttribute("aria-label", "Copy code");
  button.addEventListener("click", async () => {
    try {
      await writeClipboard(code.textContent.trim());
      button.textContent = "Copied";
      window.setTimeout(() => (button.textContent = "Copy"), 1600);
    } catch {
      button.textContent = "Failed";
    }
  });
  header.append(button);
});

const dialog = document.querySelector("[data-command-dialog]");
const searchInput = dialog?.querySelector("[data-command-input]");
const resultsRoot = dialog?.querySelector("[data-command-results]");
const searchItems = [...document.querySelectorAll("[data-search-item]")].map((element) => ({
  description: element.dataset.searchDescription || "Klack documentation",
  group: element.dataset.searchGroup || "Documentation",
  href: element.getAttribute("href") || "#",
  title: element.dataset.searchTitle || element.textContent.trim(),
}));

let resultLinks = [];
let selectedIndex = 0;

function renderSearch(query = "") {
  if (!resultsRoot) return;
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const matches = searchItems.filter((item) => {
    const haystack = `${item.title} ${item.description} ${item.group}`.toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });

  resultsRoot.replaceChildren();
  resultLinks = [];
  selectedIndex = 0;

  if (matches.length === 0) {
    const empty = document.createElement("div");
    empty.className = "command-empty";
    empty.textContent = `No results for “${query}”`;
    resultsRoot.append(empty);
    return;
  }

  const groups = new Map();
  for (const item of matches) {
    const group = groups.get(item.group) || [];
    group.push(item);
    groups.set(item.group, group);
  }
  for (const [group, items] of groups) {
    const label = document.createElement("div");
    label.className = "command-group-label";
    label.textContent = group;
    resultsRoot.append(label);

    for (const item of items) {
      const link = document.createElement("a");
      link.className = "command-result";
      link.href = item.href;
      link.innerHTML = `<span class="command-result-icon">${icons.file}</span><span class="command-result-text"><strong></strong><span></span></span>`;
      link.querySelector("strong").textContent = item.title;
      link.querySelector(".command-result-text span").textContent = item.description;
      link.addEventListener("click", () => dialog.close());
      resultsRoot.append(link);
      resultLinks.push(link);
    }
  }

  resultLinks[0]?.classList.add("selected");
}

function openSearch() {
  if (!dialog || dialog.open) return;
  closeMobileNav();
  dialog.showModal();
  body.classList.add("dialog-open");
  renderSearch();
  searchInput.value = "";
  window.setTimeout(() => searchInput.focus(), 0);
}

document.querySelectorAll("[data-search-trigger]").forEach((button) => {
  button.addEventListener("click", openSearch);
});

dialog?.addEventListener("close", () => body.classList.remove("dialog-open"));
dialog?.addEventListener("click", (event) => {
  const rect = dialog.getBoundingClientRect();
  const outside = event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
  if (outside) dialog.close();
});

searchInput?.addEventListener("input", () => renderSearch(searchInput.value));
searchInput?.addEventListener("keydown", (event) => {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Enter") return;
  event.preventDefault();
  if (!resultLinks.length) return;

  if (event.key === "Enter") {
    resultLinks[selectedIndex].click();
    return;
  }

  resultLinks[selectedIndex]?.classList.remove("selected");
  selectedIndex = event.key === "ArrowDown"
    ? (selectedIndex + 1) % resultLinks.length
    : (selectedIndex - 1 + resultLinks.length) % resultLinks.length;
  resultLinks[selectedIndex].classList.add("selected");
  resultLinks[selectedIndex].scrollIntoView({ block: "nearest" });
});

document.addEventListener("keydown", (event) => {
  const target = event.target;
  const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable;
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    dialog?.open ? dialog.close() : openSearch();
  } else if (event.key === "/" && !typing && !dialog?.open) {
    event.preventDefault();
    openSearch();
  }
});

const observedSections = [...document.querySelectorAll(".docs-section[id]")];
const sectionLinks = [...document.querySelectorAll(".sidebar-link[href^='#'], .toc-link[href^='#']")];

if (observedSections.length && "IntersectionObserver" in window) {
  const activateSection = (id) => {
    sectionLinks.forEach((link) => link.classList.toggle("active", link.getAttribute("href") === `#${id}`));
  };

  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible[0]) activateSection(visible[0].target.id);
    },
    { rootMargin: "-18% 0px -68%", threshold: [0, 0.05] },
  );
  observedSections.forEach((section) => observer.observe(section));
}

document.querySelectorAll("[data-year]").forEach((element) => {
  element.textContent = String(new Date().getFullYear());
});
