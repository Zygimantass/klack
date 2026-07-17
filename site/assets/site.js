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
const visualLabVersions = {
  editorial: {
    label: "Editorial",
    description: "Open + serif",
  },
  modern: {
    label: "Modern",
    description: "Direct + sans",
  },
  compact: {
    label: "Compact",
    description: "Dense + quick",
  },
  centered: {
    label: "Centered",
    description: "Single focal point",
  },
  product: {
    label: "Product",
    description: "Demo above fold",
  },
  terminal: {
    label: "Terminal",
    description: "Mono + utilitarian",
  },
};
const visualLabColorControls = [
  { property: "--bg", label: "Canvas" },
  { property: "--bg-raised", label: "Panels" },
  { property: "--ink", label: "Text" },
  { property: "--ink-muted", label: "Muted text" },
  { property: "--edge", label: "Borders" },
  { property: "--accent", label: "Action" },
  { property: "--art", label: "Dither A" },
  { property: "--art-secondary", label: "Dither B" },
  { property: "--purple", label: "Secondary" },
];
const visualLabDitherSelects = {
  pattern: {
    label: "Pattern",
    options: {
      dots: "Dots",
      pixels: "Pixels",
      hatch: "Hatch",
      cross: "Crosshatch",
      rings: "Rings",
      paper: "Paper grain",
      strips: "Cut strips",
      flecks: "Ink flecks",
      blocks: "Cut blocks",
    },
  },
  shape: {
    label: "Silhouette",
    options: {
      orbit: "Orbit",
      bloom: "Bloom",
      aperture: "Aperture",
      shards: "Shards",
      wave: "Wave",
      torn: "Torn sheet",
      ribbons: "Ribbons",
      scraps: "Scraps",
      stencil: "Stencil",
    },
  },
  motion: {
    label: "Motion",
    options: {
      drift: "Drift",
      orbit: "Orbit",
      pulse: "Pulse",
      scan: "Scan",
      glitch: "Glitch",
      counterspin: "Counterspin",
    },
  },
  timing: {
    label: "Timing",
    options: {
      fluid: "Fluid",
      linear: "Linear",
      stepped: "Stepped",
      elastic: "Elastic",
    },
  },
  blend: {
    label: "Ink blend",
    options: {
      normal: "Normal",
      screen: "Screen",
      "soft-light": "Soft light",
      difference: "Difference",
      "color-dodge": "Color dodge",
    },
  },
};
const visualLabDitherRanges = {
  density: { label: "Cell size", min: 3, max: 14, step: 1, unit: "px" },
  speed: { label: "Cycle length", min: 4, max: 60, step: 1, unit: "s" },
  drift: { label: "Travel", min: 0, max: 96, step: 2, unit: "px" },
  spin: { label: "Rotation", min: 0, max: 180, step: 2, unit: "°" },
  pulse: { label: "Breathing", min: 0, max: 28, step: 1, unit: "%" },
  hue: { label: "Hue travel", min: 0, max: 180, step: 5, unit: "°" },
  bloom: { label: "Bloom", min: 0, max: 24, step: 1, unit: "px" },
  opacity: { label: "Ink strength", min: 20, max: 100, step: 2, unit: "%" },
  parallax: { label: "Cursor pull", min: 0, max: 30, step: 1, unit: "px" },
};
const visualLabDefaults = {
  version: "centered",
  colors: {
    "--bg": "#0b0d0c",
    "--bg-raised": "#101311",
    "--ink": "#edeee8",
    "--ink-muted": "#92978f",
    "--edge": "#899188",
    "--accent": "#c8ff4d",
    "--art": "#56bdf3",
    "--art-secondary": "#776bff",
    "--purple": "#776bff",
  },
  dither: {
    animated: true,
    reactive: true,
    pattern: "pixels",
    shape: "shards",
    motion: "glitch",
    timing: "stepped",
    blend: "difference",
    density: 4,
    speed: 6,
    drift: 58,
    spin: 28,
    pulse: 12,
    hue: 90,
    bloom: 4,
    opacity: 74,
    parallax: 18,
  },
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
      "--edge": "#718b75",
      "--accent": "#d2dc81",
      "--art": "#739f7a",
      "--art-secondary": "#b59b70",
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
      "--edge": "#557982",
      "--accent": "#83d4df",
      "--art": "#477f8e",
      "--art-secondary": "#8daec7",
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
      "--edge": "#806d7b",
      "--accent": "#dca5af",
      "--art": "#795d75",
      "--art-secondary": "#b09ad1",
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
      "--edge": "#8f6655",
      "--accent": "#ef9a64",
      "--art": "#a43f2d",
      "--art-secondary": "#cf7868",
      "--purple": "#cf7868",
    },
  },
  gruvbox: {
    label: "Gruvbox",
    colors: {
      "--bg": "#1d2021",
      "--bg-raised": "#282828",
      "--ink": "#ebdbb2",
      "--ink-muted": "#a89984",
      "--edge": "#928374",
      "--accent": "#b8bb26",
      "--art": "#83a598",
      "--art-secondary": "#d3869b",
      "--purple": "#d3869b",
    },
  },
  solarized: {
    label: "Solarized",
    colors: {
      "--bg": "#002b36",
      "--bg-raised": "#073642",
      "--ink": "#eee8d5",
      "--ink-muted": "#839496",
      "--edge": "#586e75",
      "--accent": "#b58900",
      "--art": "#2aa198",
      "--art-secondary": "#268bd2",
      "--purple": "#6c71c4",
    },
  },
  ultraviolet: {
    label: "Ultraviolet",
    colors: {
      "--bg": "#0d0714",
      "--bg-raised": "#181024",
      "--ink": "#f7efff",
      "--ink-muted": "#a08aae",
      "--edge": "#765b86",
      "--accent": "#f8dc4e",
      "--art": "#b56cff",
      "--art-secondary": "#ff5fa2",
      "--purple": "#8d78ff",
    },
  },
  cobalt: {
    label: "Cobalt",
    colors: {
      "--bg": "#07101f",
      "--bg-raised": "#0d1930",
      "--ink": "#edf4ff",
      "--ink-muted": "#8597b5",
      "--edge": "#50688f",
      "--accent": "#ff9e3d",
      "--art": "#4ea1ff",
      "--art-secondary": "#69e6cf",
      "--purple": "#8a7dff",
    },
  },
  oxide: {
    label: "Oxide",
    colors: {
      "--bg": "#120b09",
      "--bg-raised": "#211311",
      "--ink": "#f4e5d4",
      "--ink-muted": "#aa8f7e",
      "--edge": "#8d5b49",
      "--accent": "#ef6a4c",
      "--art": "#eab464",
      "--art-secondary": "#9ac6a2",
      "--purple": "#c184d4",
    },
  },
  phosphor: {
    label: "Phosphor",
    colors: {
      "--bg": "#020805",
      "--bg-raised": "#06140c",
      "--ink": "#d7ffe0",
      "--ink-muted": "#67a979",
      "--edge": "#3f8c57",
      "--accent": "#81ff98",
      "--art": "#2de36a",
      "--art-secondary": "#b6ffcf",
      "--purple": "#52d990",
    },
  },
  newsprint: {
    label: "Newsprint",
    colors: {
      "--bg": "#11100e",
      "--bg-raised": "#1e1b16",
      "--ink": "#f2ead7",
      "--ink-muted": "#a69d8c",
      "--edge": "#807667",
      "--accent": "#ffdc73",
      "--art": "#e95d4f",
      "--art-secondary": "#6eb7ac",
      "--purple": "#ad8dc8",
    },
  },
  mono: {
    label: "Mono",
    colors: {
      "--bg": "#0a0a0a",
      "--bg-raised": "#141414",
      "--ink": "#eeeeea",
      "--ink-muted": "#91918c",
      "--edge": "#8b8b85",
      "--accent": "#deded7",
      "--art": "#a2a29b",
      "--art-secondary": "#d1d1ca",
      "--purple": "#bdbdb7",
    },
  },
};
const visualLabMotionPresets = {
  drift: {
    label: "Drift",
    description: "Slow + airy",
    dither: {
      ...visualLabDefaults.dither,
      pattern: "dots",
      shape: "orbit",
      motion: "drift",
      timing: "fluid",
      blend: "normal",
      density: 5,
      speed: 22,
      drift: 34,
      spin: 18,
      pulse: 6,
      hue: 0,
      bloom: 4,
      opacity: 90,
      parallax: 10,
    },
  },
  orbit: {
    label: "Orbit",
    description: "Layered spin",
    dither: {
      ...visualLabDefaults.dither,
      pattern: "dots",
      shape: "aperture",
      motion: "orbit",
      timing: "linear",
      blend: "screen",
      density: 7,
      speed: 16,
      drift: 46,
      spin: 86,
      pulse: 8,
      hue: 30,
      bloom: 10,
      opacity: 84,
      parallax: 14,
    },
  },
  pulse: {
    label: "Pulse",
    description: "Big breaths",
    dither: {
      ...visualLabDefaults.dither,
      pattern: "rings",
      shape: "bloom",
      motion: "pulse",
      blend: "screen",
      density: 8,
      speed: 8,
      drift: 12,
      spin: 16,
      pulse: 22,
      hue: 60,
      bloom: 14,
      opacity: 80,
      parallax: 8,
    },
  },
  scan: {
    label: "Scan",
    description: "Print sweep",
    dither: {
      ...visualLabDefaults.dither,
      pattern: "hatch",
      shape: "wave",
      motion: "scan",
      timing: "linear",
      blend: "soft-light",
      density: 6,
      speed: 12,
      drift: 76,
      spin: 8,
      pulse: 4,
      hue: 20,
      bloom: 5,
      opacity: 96,
      parallax: 5,
    },
  },
  glitch: {
    label: "Glitch",
    description: "Hard cuts",
    dither: {
      ...visualLabDefaults.dither,
      pattern: "pixels",
      shape: "shards",
      motion: "glitch",
      timing: "stepped",
      blend: "difference",
      density: 4,
      speed: 6,
      drift: 58,
      spin: 28,
      pulse: 12,
      hue: 90,
      bloom: 4,
      opacity: 74,
      parallax: 18,
    },
  },
  aura: {
    label: "Aura",
    description: "Color bloom",
    dither: {
      ...visualLabDefaults.dither,
      pattern: "cross",
      shape: "bloom",
      motion: "counterspin",
      timing: "fluid",
      blend: "screen",
      density: 10,
      speed: 30,
      drift: 24,
      spin: 42,
      pulse: 16,
      hue: 160,
      bloom: 20,
      opacity: 70,
      parallax: 12,
    },
  },
  cutout: {
    label: "Cutout",
    description: "Torn sheet",
    dither: {
      ...visualLabDefaults.dither,
      pattern: "paper",
      shape: "torn",
      motion: "glitch",
      timing: "stepped",
      blend: "normal",
      density: 5,
      speed: 9,
      drift: 40,
      spin: 18,
      pulse: 5,
      hue: 15,
      bloom: 2,
      opacity: 88,
      parallax: 12,
    },
  },
  ransom: {
    label: "Ransom",
    description: "Uneven strips",
    dither: {
      ...visualLabDefaults.dither,
      pattern: "strips",
      shape: "ribbons",
      motion: "glitch",
      timing: "stepped",
      blend: "normal",
      density: 8,
      speed: 7,
      drift: 64,
      spin: 8,
      pulse: 5,
      hue: 35,
      bloom: 3,
      opacity: 92,
      parallax: 15,
    },
  },
  scraps: {
    label: "Scraps",
    description: "Loose pieces",
    dither: {
      ...visualLabDefaults.dither,
      pattern: "flecks",
      shape: "scraps",
      motion: "glitch",
      timing: "elastic",
      blend: "normal",
      density: 6,
      speed: 10,
      drift: 50,
      spin: 36,
      pulse: 10,
      hue: 45,
      bloom: 2,
      opacity: 90,
      parallax: 20,
    },
  },
  stencil: {
    label: "Stencil",
    description: "Holes + ink",
    dither: {
      ...visualLabDefaults.dither,
      pattern: "blocks",
      shape: "stencil",
      motion: "pulse",
      timing: "stepped",
      blend: "screen",
      density: 7,
      speed: 11,
      drift: 20,
      spin: 14,
      pulse: 16,
      hue: 35,
      bloom: 7,
      opacity: 78,
      parallax: 10,
    },
  },
};
const visualLabHandCutPresetIds = new Set(["cutout", "ransom", "scraps", "stencil"]);

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
  const edge = colors["--edge"];
  const accent = colors["--accent"];
  const art = colors["--art"];
  const artSecondary = colors["--art-secondary"];
  const purple = colors["--purple"];
  const accentInk = colorLuminance(accent) > 0.42 ? "#10110f" : "#f4f4ef";

  return {
    "--bg-soft": mixColors(surface, text, 0.055),
    "--bg-tint": mixColors(background, text, 0.025),
    "--bg-deep": mixColors(background, "#000000", 0.24),
    "--line": mixColors(background, edge, 0.25),
    "--line-strong": mixColors(background, edge, 0.58),
    "--accent-hover": mixColors(accent, accentInk, 0.08),
    "--accent-ink": accentInk,
    "--purple-soft": mixColors(background, purple, 0.2),
    "--code-bg": mixColors(background, "#000000", 0.3),
    "--code-ink": mixColors(text, "#ffffff", 0.03),
    "--code-muted": muted,
    "--code-purple": mixColors(purple, "#ffffff", 0.36),
    "--code-green": accent,
    "--code-blue": mixColors(artSecondary, "#ffffff", 0.18),
    "--code-panel": mixColors(surface, text, 0.045),
    "--code-line": mixColors(surface, text, 0.16),
    "--art-soft": mixColors(background, art, 0.38),
  };
}

function copyVisualSettings(settings) {
  return {
    version: settings.version,
    colors: { ...settings.colors },
    dither: { ...settings.dither },
  };
}

function numericSetting(value, fallback, minimum, maximum) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? clamp(numeric, minimum, maximum) : fallback;
}

function loadVisualSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(visualLabStorageKey));
    const savedDither = saved?.dither || {};
    const dither = { ...visualLabDefaults.dither, ...savedDither };
    if (typeof saved?.animated === "boolean" && typeof savedDither.animated !== "boolean") dither.animated = saved.animated;
    if (saved?.density !== undefined && savedDither.density === undefined) dither.density = saved.density;
    if (saved?.speed !== undefined && savedDither.speed === undefined) dither.speed = saved.speed;

    for (const [property, config] of Object.entries(visualLabDitherSelects)) {
      if (!config.options[dither[property]]) dither[property] = visualLabDefaults.dither[property];
    }
    for (const [property, config] of Object.entries(visualLabDitherRanges)) {
      dither[property] = numericSetting(dither[property], visualLabDefaults.dither[property], config.min, config.max);
    }
    dither.animated = typeof dither.animated === "boolean" ? dither.animated : visualLabDefaults.dither.animated;
    dither.reactive = typeof dither.reactive === "boolean" ? dither.reactive : visualLabDefaults.dither.reactive;

    return {
      version: visualLabVersions[saved?.version] ? saved.version : visualLabDefaults.version,
      colors: { ...visualLabDefaults.colors, ...saved?.colors },
      dither,
    };
  } catch {
    return copyVisualSettings(visualLabDefaults);
  }
}

let visualSettings = loadVisualSettings();

function applyVisualSettings() {
  root.dataset.visualVersion = visualSettings.version;
  root.dataset.ditherPattern = visualSettings.dither.pattern;
  root.dataset.ditherShape = visualSettings.dither.shape;
  root.dataset.ditherMotion = visualSettings.dither.motion;
  root.dataset.ditherTiming = visualSettings.dither.timing;
  root.dataset.ditherReactive = String(visualSettings.dither.reactive);
  const properties = { ...visualSettings.colors, ...derivedVisualColors(visualSettings.colors) };
  for (const [property, value] of Object.entries(properties)) {
    root.style.setProperty(property, value);
  }
  const dither = visualSettings.dither;
  root.style.setProperty("--dither-grid", `${dither.density}px`);
  root.style.setProperty("--dither-grid-wide", `${dither.density + 4}px`);
  root.style.setProperty("--dither-speed", `${dither.speed}s`);
  root.style.setProperty("--dither-speed-slow", `${Math.round(dither.speed * 1.37)}s`);
  root.style.setProperty("--dither-color-speed", `${Math.max(6, Math.round(dither.speed * 0.82))}s`);
  root.style.setProperty("--dither-play-state", dither.animated ? "running" : "paused");
  root.style.setProperty("--dither-drift", `${dither.drift}px`);
  root.style.setProperty("--dither-drift-half", `${dither.drift / 2}px`);
  root.style.setProperty("--dither-drift-neg", `${-dither.drift}px`);
  root.style.setProperty("--dither-spin", `${dither.spin}deg`);
  root.style.setProperty("--dither-spin-half", `${dither.spin / 2}deg`);
  root.style.setProperty("--dither-spin-neg", `${-dither.spin}deg`);
  root.style.setProperty("--dither-scale-min", String(1 - dither.pulse / 200));
  root.style.setProperty("--dither-scale-max", String(1 + dither.pulse / 100));
  root.style.setProperty("--dither-hue", `${dither.hue}deg`);
  root.style.setProperty("--dither-hue-neg", `${-dither.hue / 2}deg`);
  root.style.setProperty("--dither-bloom", `${dither.bloom}px`);
  root.style.setProperty("--dither-ink-opacity", String(dither.opacity / 100));
  root.style.setProperty("--dither-field-opacity", String(dither.opacity / 250));
  root.style.setProperty("--dither-blend", dither.blend);
  if (!dither.reactive) resetDitherPointer();
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
        <legend>Page version</legend>
        <div class="visual-version-grid">
          ${Object.entries(visualLabVersions).map(([id, version], index) => `
            <button type="button" data-visual-version="${id}" aria-pressed="false">
              <span>V${index + 1}</span>
              <strong>${version.label}</strong>
              <small>${version.description}</small>
            </button>`).join("")}
        </div>
      </fieldset>
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
        <legend>Dither recipes</legend>
        <div class="visual-motion-grid">
          ${Object.entries(visualLabMotionPresets).filter(([id]) => !visualLabHandCutPresetIds.has(id)).map(([id, preset]) => `
            <button type="button" data-visual-motion-preset="${id}" aria-pressed="false">
              <span aria-hidden="true"></span>
              <strong>${preset.label}</strong>
              <small>${preset.description}</small>
            </button>`).join("")}
        </div>
      </fieldset>
      <fieldset class="visual-lab-section visual-cut-studies">
        <legend>Hand-cut studies</legend>
        <div class="visual-motion-grid">
          ${Object.entries(visualLabMotionPresets).filter(([id]) => visualLabHandCutPresetIds.has(id)).map(([id, preset], index) => `
            <button type="button" data-visual-motion-preset="${id}" aria-pressed="false">
              <span aria-hidden="true"></span>
              <strong>C${index + 1} · ${preset.label}</strong>
              <small>${preset.description}</small>
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
        <legend>Dither composition</legend>
        <div class="visual-select-list">
          ${Object.entries(visualLabDitherSelects).map(([property, config]) => `
            <label class="visual-select-row">
              <strong>${config.label}</strong>
              <select data-visual-dither="${property}" aria-label="${config.label}">
                ${Object.entries(config.options).map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}
              </select>
            </label>`).join("")}
        </div>
        <label class="visual-toggle-row">
          <span><strong>Animate</strong><small>Reduced-motion settings still win.</small></span>
          <input type="checkbox" data-visual-dither="animated" />
        </label>
        <label class="visual-toggle-row">
          <span><strong>Follow cursor</strong><small>Subtle pointer parallax over the hero.</small></span>
          <input type="checkbox" data-visual-dither="reactive" />
        </label>
        ${Object.entries(visualLabDitherRanges).map(([property, config]) => `
          <label class="visual-range-row">
            <span><strong>${config.label}</strong><output data-visual-dither-output="${property}"></output></span>
            <input type="range" min="${config.min}" max="${config.max}" step="${config.step}" data-visual-dither="${property}" />
          </label>`).join("")}
      </fieldset>
    </div>
    <div class="visual-lab-footer">
      <button type="button" data-visual-reset>Reset</button>
      <button type="button" data-visual-copy>Copy CSS</button>
    </div>`;

  body.append(trigger, panel);

  const colorInputs = [...panel.querySelectorAll("[data-visual-color]")];
  const ditherInputs = [...panel.querySelectorAll("[data-visual-dither]")];

  function matchingPreset() {
    return Object.entries(visualLabPresets).find(([, preset]) =>
      Object.entries(preset.colors).every(([property, value]) => visualSettings.colors[property] === value),
    )?.[0];
  }

  function matchingMotionPreset() {
    return Object.entries(visualLabMotionPresets).find(([, preset]) =>
      Object.entries(preset.dither).every(([property, value]) => visualSettings.dither[property] === value),
    )?.[0];
  }

  function syncVisualLab() {
    for (const input of colorInputs) {
      const value = visualSettings.colors[input.dataset.visualColor];
      input.value = value;
      panel.querySelector(`[data-visual-output="${input.dataset.visualColor}"]`).textContent = value;
    }
    for (const input of ditherInputs) {
      const property = input.dataset.visualDither;
      if (input.type === "checkbox") input.checked = visualSettings.dither[property];
      else input.value = String(visualSettings.dither[property]);
    }
    for (const [property, config] of Object.entries(visualLabDitherRanges)) {
      panel.querySelector(`[data-visual-dither-output="${property}"]`).textContent = `${visualSettings.dither[property]}${config.unit}`;
    }
    const activePreset = matchingPreset();
    const activeMotionPreset = matchingMotionPreset();
    panel.querySelectorAll("[data-visual-version]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.visualVersion === visualSettings.version));
    });
    panel.querySelectorAll("[data-visual-preset]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.visualPreset === activePreset));
    });
    panel.querySelectorAll("[data-visual-motion-preset]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.visualMotionPreset === activeMotionPreset));
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
  panel.querySelectorAll("[data-visual-version]").forEach((button) => {
    button.addEventListener("click", () => {
      visualSettings.version = button.dataset.visualVersion;
      updateVisualSettings();
    });
  });
  panel.querySelectorAll("[data-visual-preset]").forEach((button) => {
    button.addEventListener("click", () => {
      visualSettings.colors = { ...visualLabPresets[button.dataset.visualPreset].colors };
      updateVisualSettings();
    });
  });
  panel.querySelectorAll("[data-visual-motion-preset]").forEach((button) => {
    button.addEventListener("click", () => {
      visualSettings.dither = { ...visualLabMotionPresets[button.dataset.visualMotionPreset].dither };
      updateVisualSettings();
    });
  });
  for (const input of colorInputs) {
    input.addEventListener("input", () => {
      visualSettings.colors[input.dataset.visualColor] = input.value;
      updateVisualSettings();
    });
  }
  for (const input of ditherInputs) {
    const eventName = input.type === "checkbox" || input.tagName === "SELECT" ? "change" : "input";
    input.addEventListener(eventName, () => {
      const property = input.dataset.visualDither;
      visualSettings.dither[property] = input.type === "checkbox"
        ? input.checked
        : input.type === "range"
          ? Number(input.value)
          : input.value;
      updateVisualSettings();
    });
  }
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
    const dither = visualSettings.dither;
    const css = `/* Klack ${visualLabVersions[visualSettings.version].label} · ${dither.pattern} / ${dither.shape} / ${dither.motion} */\n:root {\n${Object.entries(properties).map(([property, value]) => `  ${property}: ${value};`).join("\n")}\n  --dither-grid: ${dither.density}px;\n  --dither-speed: ${dither.speed}s;\n  --dither-drift: ${dither.drift}px;\n  --dither-spin: ${dither.spin}deg;\n  --dither-hue: ${dither.hue}deg;\n  --dither-bloom: ${dither.bloom}px;\n  --dither-ink-opacity: ${dither.opacity / 100};\n}`;
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

const hero = document.querySelector(".hero");
let ditherPointerFrame = 0;

function resetDitherPointer() {
  root.style.setProperty("--dither-pointer-x", "0px");
  root.style.setProperty("--dither-pointer-y", "0px");
  root.style.setProperty("--dither-pointer-rotate", "0deg");
}

hero?.addEventListener("pointermove", (event) => {
  if (!visualSettings.dither.reactive || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (ditherPointerFrame) cancelAnimationFrame(ditherPointerFrame);
  ditherPointerFrame = requestAnimationFrame(() => {
    const bounds = hero.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2;
    const y = ((event.clientY - bounds.top) / bounds.height - 0.5) * 2;
    const amount = visualSettings.dither.parallax;
    root.style.setProperty("--dither-pointer-x", `${x * amount}px`);
    root.style.setProperty("--dither-pointer-y", `${y * amount}px`);
    root.style.setProperty("--dither-pointer-rotate", `${x * amount * 0.12}deg`);
    ditherPointerFrame = 0;
  });
});
hero?.addEventListener("pointerleave", resetDitherPointer);

applyVisualSettings();
createVisualLab();

const pluginDemo = document.querySelector("[data-plugin-demo]");
const pluginDemoStorageKey = "klack-product-demo";
const pluginDemoDefaults = {
  removeDistractions: true,
  tabbedSlack: true,
  minimalIrc: true,
};

function loadPluginDemoSettings() {
  try {
    return { ...pluginDemoDefaults, ...JSON.parse(localStorage.getItem(pluginDemoStorageKey)) };
  } catch {
    return { ...pluginDemoDefaults };
  }
}

if (pluginDemo) {
  const pluginInputs = [...pluginDemo.querySelectorAll("[data-demo-plugin]")];
  const pluginAttributes = {
    removeDistractions: "data-remove-distractions",
    tabbedSlack: "data-tabbed-slack",
    minimalIrc: "data-minimal-irc",
  };
  let pluginSettings = loadPluginDemoSettings();

  function syncPluginDemo() {
    for (const input of pluginInputs) {
      input.checked = Boolean(pluginSettings[input.dataset.demoPlugin]);
      input.closest(".plugin-preview-item")?.classList.toggle("disabled", !input.checked);
    }
    for (const [plugin, attribute] of Object.entries(pluginAttributes)) {
      pluginDemo.setAttribute(attribute, String(Boolean(pluginSettings[plugin])));
    }
    const enabledCount = Object.values(pluginSettings).filter(Boolean).length;
    pluginDemo.dataset.enabledCount = String(enabledCount);
    pluginDemo.querySelector("[data-demo-enabled-count]").textContent = `${enabledCount} enabled`;
    pluginDemo.querySelector(".mock-status").textContent = enabledCount === 1 ? "1 plugin active" : `${enabledCount} plugins active`;
  }

  for (const input of pluginInputs) {
    input.addEventListener("change", () => {
      pluginSettings[input.dataset.demoPlugin] = input.checked;
      try {
        localStorage.setItem(pluginDemoStorageKey, JSON.stringify(pluginSettings));
      } catch {}
      syncPluginDemo();
    });
  }

  syncPluginDemo();
}

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
