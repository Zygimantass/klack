import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  KLACK_VERSION,
  ORIGINAL_ASAR_NAME,
  PLUGIN_CHANNEL,
  PLUGIN_RELOAD_CHANNEL,
  THEME_RELOAD_CHANNEL,
} from "./constants";
import { loadPlugins } from "./plugins";
import { loadThemes } from "./themes";

type BrowserWindowOptions = {
  webPreferences?: {
    devTools?: boolean;
    preload?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

type WebContents = {
  closeDevTools(): void;
  isDestroyed(): boolean;
  isDevToolsOpened(): boolean;
  once(event: "destroyed", listener: () => void): void;
  openDevTools(options?: { activate?: boolean; mode?: "detach" }): void;
  send(channel: string, payload: unknown): void;
};

type BrowserWindowInstance = {
  webContents: WebContents;
};

type BrowserWindowConstructor = {
  new (options?: BrowserWindowOptions): BrowserWindowInstance;
  getAllWindows(): BrowserWindowInstance[];
  getFocusedWindow(): BrowserWindowInstance | null;
  [key: string]: unknown;
};

type MenuItem = {
  label: string;
  role?: string;
  submenu?: Menu | null;
};

type Menu = {
  append(item: MenuItem): void;
  getMenuItemById(id: string): MenuItem | null;
  items: MenuItem[];
};

type MenuItemOptions = {
  accelerator?: string;
  click?: () => void;
  id?: string;
  label: string;
  submenu?: Menu;
};

type ElectronModule = {
  app: {
    getPath(name: "appData"): string;
    setName(name: string): void;
    setAppPath(path: string): void;
    setPath(name: "userData", path: string): void;
  };
  BrowserWindow: BrowserWindowConstructor;
  ipcMain: {
    on(channel: string, listener: (event: { returnValue: unknown }) => void): void;
  };
  Menu: {
    buildFromTemplate(template: MenuItemOptions[]): Menu;
    getApplicationMenu(): Menu | null;
    setApplicationMenu(menu: Menu | null): void;
  };
  MenuItem: new (options: MenuItemOptions) => MenuItem;
  [key: string]: unknown;
};

type SlackPackage = {
  main?: unknown;
  productName?: unknown;
};

const electron = require("electron") as ElectronModule;
const injectorPath = require.main?.filename;

if (!injectorPath || !require.main) {
  throw new Error("[Klack] Could not determine the Electron entry point");
}

const resourcesPath = path.dirname(path.dirname(injectorPath));
const originalAsarPath = path.join(resourcesPath, ORIGINAL_ASAR_NAME);
const originalPackage = require(path.join(originalAsarPath, "package.json")) as SlackPackage;

if (typeof originalPackage.main !== "string") {
  throw new Error("[Klack] Slack's original package.json has no main entry point");
}

const productName = typeof originalPackage.productName === "string" ? originalPackage.productName : "Slack";
electron.app.setName(productName);
electron.app.setPath("userData", path.join(electron.app.getPath("appData"), productName));
require.main.filename = path.join(originalAsarPath, originalPackage.main);
electron.app.setAppPath(originalAsarPath);

if (!process.argv.includes("--klack-vanilla")) {
  const klackRoot = path.resolve(__dirname, "..");
  const klackPreload = path.join(klackRoot, "runtime", "preload.bundle.js");
  const builtInPluginDirectory = path.join(klackRoot, "plugins");
  const userPluginDirectory = process.env.KLACK_PLUGIN_DIR || path.join(os.homedir(), ".klack", "plugins");
  const pluginDirectories = [builtInPluginDirectory, userPluginDirectory];
  const builtInThemeDirectory = path.join(klackRoot, "dist", "themes");
  const userThemeDirectory = process.env.KLACK_THEME_DIR || path.join(os.homedir(), ".klack", "themes");
  const themeDirectories = [builtInThemeDirectory, userThemeDirectory];
  const sdkPath = path.join(klackRoot, "dist", "sdk.js");

  if (!fs.existsSync(klackPreload)) {
    throw new Error(`[Klack] Generated preload not found at ${klackPreload}. Run the installer again.`);
  }

  try {
    fs.mkdirSync(userPluginDirectory, { recursive: true });
  } catch (error) {
    console.error(`[Klack] Failed to create plugin directory ${userPluginDirectory}`, error);
  }
  try {
    fs.mkdirSync(userThemeDirectory, { recursive: true });
  } catch (error) {
    console.error(`[Klack] Failed to create theme directory ${userThemeDirectory}`, error);
  }

  function compilePlugins(reload: boolean): ReturnType<typeof loadPlugins> | undefined {
    let failed = false;
    const nextPlugins = loadPlugins({
      directories: pluginDirectories,
      onError(pluginPath, error) {
        failed = true;
        console.error(`[Klack] Failed to compile plugin ${pluginPath}`, error);
      },
      sdkPath,
    });
    return reload && failed ? undefined : nextPlugins;
  }

  function readThemes(reload: boolean): ReturnType<typeof loadThemes> | undefined {
    let failed = false;
    const nextThemes = loadThemes({
      directories: themeDirectories,
      onError(themePath, error) {
        failed = true;
        console.error(`[Klack] Failed to load theme ${themePath}`, error);
      },
    });
    return reload && failed ? undefined : nextThemes;
  }

  let plugins = compilePlugins(false) || [];
  let themes = readThemes(false) || [];
  const injectedWebContents = new Set<WebContents>();

  electron.ipcMain.on(PLUGIN_CHANNEL, (event) => {
    event.returnValue = {
      plugins,
      themes,
      version: KLACK_VERSION,
    };
  });

  const OriginalBrowserWindow = electron.BrowserWindow;

  class BrowserWindow extends OriginalBrowserWindow {
    constructor(options: BrowserWindowOptions = {}) {
      const originalPreload = options.webPreferences?.preload;
      const shouldInject =
        typeof originalPreload === "string" && path.basename(originalPreload) === "preload.bundle.js";

      if (shouldInject) {
        options = {
          ...options,
          webPreferences: {
            ...options.webPreferences,
            devTools: true,
            preload: klackPreload,
          },
        };
      }

      super(options);

      if (shouldInject) {
        injectedWebContents.add(this.webContents);
        this.webContents.once("destroyed", () => injectedWebContents.delete(this.webContents));
      }
    }
  }

  Object.assign(BrowserWindow, OriginalBrowserWindow);
  Object.defineProperty(BrowserWindow, "name", { configurable: true, value: "BrowserWindow" });

  const devToolsMenuItem = (): MenuItemOptions => ({
    accelerator: "CommandOrControl+Alt+I",
    click() {
      const window = OriginalBrowserWindow.getFocusedWindow() || OriginalBrowserWindow.getAllWindows()[0];
      if (!window) return;

      if (window.webContents.isDevToolsOpened()) {
        window.webContents.closeDevTools();
      } else {
        window.webContents.openDevTools({ activate: true, mode: "detach" });
      }
    },
    id: "klack-toggle-devtools",
    label: "Toggle DevTools",
  });

  const addDeveloperMenu = (menu: Menu): Menu => {
    if (menu.getMenuItemById("klack-toggle-devtools")) return menu;

    const viewMenu = menu.items.find(
      (item) => item.role === "viewMenu" || item.label.replaceAll("&", "").toLowerCase() === "view",
    )?.submenu;
    if (viewMenu) {
      viewMenu.append(new electron.MenuItem(devToolsMenuItem()));
    } else {
      menu.append(
        new electron.MenuItem({
          label: "Klack",
          submenu: electron.Menu.buildFromTemplate([devToolsMenuItem()]),
        }),
      );
    }
    return menu;
  };

  const setApplicationMenu = electron.Menu.setApplicationMenu.bind(electron.Menu);
  electron.Menu.setApplicationMenu = (menu) => setApplicationMenu(menu ? addDeveloperMenu(menu) : null);
  const currentMenu = electron.Menu.getApplicationMenu();
  if (currentMenu) electron.Menu.setApplicationMenu(currentMenu);

  const electronPath = require.resolve("electron");
  const cachedElectron = require.cache[electronPath];
  if (!cachedElectron) {
    throw new Error("[Klack] Electron was not present in the module cache");
  }

  delete cachedElectron.exports;
  cachedElectron.exports = {
    ...electron,
    BrowserWindow,
  };

  let reloadTimer: ReturnType<typeof setTimeout> | undefined;
  const schedulePluginReload = (): void => {
    if (reloadTimer) clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => {
      reloadTimer = undefined;
      const nextPlugins = compilePlugins(true);
      if (!nextPlugins) {
        console.error("[Klack] Plugin hot reload skipped; keeping the previous plugin set");
        return;
      }

      plugins = nextPlugins;
      for (const contents of injectedWebContents) {
        if (contents.isDestroyed()) continue;
        contents.send(PLUGIN_RELOAD_CHANNEL, { plugins, version: KLACK_VERSION });
      }
      console.log(`[Klack] Hot reloaded ${plugins.length} plugin(s)`);
    }, 150);
  };

  for (const directory of new Set(pluginDirectories)) {
    try {
      fs.watch(directory, (_event, filename) => {
        if (filename && !/\.(?:[cm]?[jt]sx?)$/i.test(filename.toString())) return;
        schedulePluginReload();
      });
    } catch (error) {
      console.error(`[Klack] Failed to watch plugin directory ${directory}`, error);
    }
  }

  let themeReloadTimer: ReturnType<typeof setTimeout> | undefined;
  const scheduleThemeReload = (): void => {
    if (themeReloadTimer) clearTimeout(themeReloadTimer);
    themeReloadTimer = setTimeout(() => {
      themeReloadTimer = undefined;
      const nextThemes = readThemes(true);
      if (!nextThemes) {
        console.error("[Klack] Theme hot reload skipped; keeping the previous theme set");
        return;
      }

      themes = nextThemes;
      for (const contents of injectedWebContents) {
        if (contents.isDestroyed()) continue;
        contents.send(THEME_RELOAD_CHANNEL, { themes });
      }
      console.log(`[Klack] Hot reloaded ${themes.length} theme(s)`);
    }, 100);
  };

  for (const directory of new Set(themeDirectories)) {
    try {
      fs.watch(directory, { recursive: true }, (_event, filename) => {
        if (filename && !/\.css$/i.test(filename.toString())) return;
        scheduleThemeReload();
      });
    } catch (error) {
      console.error(`[Klack] Failed to watch theme directory ${directory}`, error);
    }
  }

  console.log(
    `[Klack] ${KLACK_VERSION} loaded; ${plugins.length} plugin(s) and ${themes.length} theme(s)`,
  );
} else {
  console.log("[Klack] Starting Slack in vanilla mode");
}

require(require.main.filename);
