import { createPackage, extractFile, getRawHeader, uncache } from "@electron/asar";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { BOOTSTRAP_PACKAGE_NAME, KLACK_VERSION, ORIGINAL_ASAR_NAME } from "./constants";

type PackageJson = {
  main?: unknown;
  name?: unknown;
  productName?: unknown;
  version?: unknown;
};

export type InstallOptions = {
  appPath: string;
  klackRoot: string;
  resign?: boolean;
};

export type UninstallOptions = {
  resign?: boolean;
};

export type InstallStatus = {
  appPath: string;
  installed: boolean;
  slackVersion?: string;
  state: "installed" | "not-installed" | "broken";
};

type AppPaths = {
  appAsar: string;
  appUnpacked: string;
  backupAsar: string;
  backupUnpacked: string;
  infoPlist: string;
  resources: string;
};

type AsarIntegrity = Record<string, { algorithm: "SHA256"; hash: string }>;

function appPaths(appPath: string): AppPaths {
  const resources = path.join(path.resolve(appPath), "Contents", "Resources");
  return {
    appAsar: path.join(resources, "app.asar"),
    appUnpacked: path.join(resources, "app.asar.unpacked"),
    backupAsar: path.join(resources, ORIGINAL_ASAR_NAME),
    backupUnpacked: path.join(resources, `${ORIGINAL_ASAR_NAME}.unpacked`),
    infoPlist: path.join(path.resolve(appPath), "Contents", "Info.plist"),
    resources,
  };
}

function packageJson(asarPath: string): PackageJson {
  uncache(asarPath);
  return JSON.parse(extractFile(asarPath, "package.json").toString("utf8")) as PackageJson;
}

function isKlackBootstrap(asarPath: string): boolean {
  try {
    return packageJson(asarPath).name === BOOTSTRAP_PACKAGE_NAME;
  } catch {
    return false;
  }
}

function assertSlackPackage(pkg: PackageJson): asserts pkg is PackageJson & { main: string } {
  if (pkg.name !== "slack-desktop" || typeof pkg.main !== "string") {
    throw new Error("The selected app.asar does not look like a supported Slack desktop installation");
  }
}

function writeFileAtomic(destination: string, contents: Buffer | string): void {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, contents);
  fs.renameSync(temporary, destination);
}

function moveToTemporary(source: string, label: string): string {
  const temporary = path.join(os.tmpdir(), `klack-${label}-${process.pid}-${Date.now()}.asar`);
  fs.copyFileSync(source, temporary);
  fs.chmodSync(temporary, fs.statSync(source).mode);
  try {
    fs.rmSync(source);
  } catch (error) {
    fs.rmSync(temporary, { force: true });
    throw error;
  }
  return temporary;
}

function asarIntegrity(asarPath: string): { algorithm: "SHA256"; hash: string } {
  const { headerString } = getRawHeader(asarPath);
  return {
    algorithm: "SHA256",
    hash: createHash("sha256").update(headerString).digest("hex"),
  };
}

function readAsarIntegrity(infoPlist: string): AsarIntegrity {
  try {
    const output = execFileSync(
      "/usr/bin/plutil",
      ["-extract", "ElectronAsarIntegrity", "json", "-o", "-", infoPlist],
      { encoding: "utf8" },
    );
    return JSON.parse(output) as AsarIntegrity;
  } catch {
    return {};
  }
}

function writeAsarIntegrity(infoPlist: string, integrity: AsarIntegrity): void {
  const action = Object.keys(readAsarIntegrity(infoPlist)).length === 0 ? "-insert" : "-replace";
  execFileSync(
    "/usr/bin/plutil",
    [action, "ElectronAsarIntegrity", "-json", JSON.stringify(integrity), infoPlist],
    { stdio: "pipe" },
  );
}

function updateAsarIntegrity(paths: AppPaths, installed: boolean): void {
  const integrity = readAsarIntegrity(paths.infoPlist);
  integrity["Resources/app.asar"] = asarIntegrity(paths.appAsar);

  if (installed) {
    integrity[`Resources/${ORIGINAL_ASAR_NAME}`] = asarIntegrity(paths.backupAsar);
  } else {
    delete integrity[`Resources/${ORIGINAL_ASAR_NAME}`];
  }

  writeAsarIntegrity(paths.infoPlist, integrity);
}

function readEntitlements(appPath: string): string {
  const entitlements = execFileSync(
    "/usr/bin/codesign",
    ["-d", "--entitlements", ":-", appPath],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  );
  if (!entitlements.includes("<dict>")) {
    throw new Error("Could not read Slack's existing macOS entitlements");
  }
  return entitlements;
}

function allowAdHocLibraries(entitlements: string): string {
  const key = "com.apple.security.cs.disable-library-validation";
  const existing = new RegExp(`(<key>${key.replaceAll(".", "\\.")}<\\/key>\\s*)<false\\s*\\/>`);
  if (existing.test(entitlements)) return entitlements.replace(existing, "$1<true/>");
  if (entitlements.includes(`<key>${key}</key>`)) return entitlements;

  const closingDictionary = entitlements.lastIndexOf("</dict>");
  if (closingDictionary === -1) throw new Error("Slack's macOS entitlements are not a valid plist");
  return `${entitlements.slice(0, closingDictionary)}<key>${key}</key><true/>${entitlements.slice(closingDictionary)}`;
}

function resignMacApp(appPath: string, entitlements: string): void {
  const temporary = path.join(os.tmpdir(), `klack-entitlements-${process.pid}-${Date.now()}.plist`);
  try {
    fs.writeFileSync(temporary, allowAdHocLibraries(entitlements));
    execFileSync(
      "/usr/bin/codesign",
      ["--force", "--sign", "-", "--options", "runtime", "--entitlements", temporary, appPath],
      { stdio: "pipe" },
    );
    execFileSync("/usr/bin/codesign", ["--verify", "--deep", "--strict", appPath], { stdio: "pipe" });
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

function finishMacBundle(
  paths: AppPaths,
  appPath: string,
  installed: boolean,
  entitlements?: string,
): void {
  if (process.platform !== "darwin") return;
  if (!fs.existsSync(paths.infoPlist)) throw new Error(`Slack Info.plist not found at ${paths.infoPlist}`);

  updateAsarIntegrity(paths, installed);
  if (entitlements) resignMacApp(appPath, entitlements);
}

async function createBootstrap(
  bootstrapPath: string,
  mainPath: string,
  productName: string,
  version: string,
): Promise<void> {
  const source = fs.mkdtempSync(path.join(os.tmpdir(), "klack-bootstrap-"));
  try {
    fs.writeFileSync(
      path.join(source, "package.json"),
      JSON.stringify({ main: "index.js", name: BOOTSTRAP_PACKAGE_NAME, productName, version }),
    );
    fs.writeFileSync(path.join(source, "index.js"), `require(${JSON.stringify(mainPath)});\n`);
    await createPackage(source, bootstrapPath);
  } finally {
    fs.rmSync(source, { force: true, recursive: true });
  }
}

function generateCombinedPreload(originalAsar: string, klackRoot: string): void {
  const klackPreloadPath = path.join(klackRoot, "dist", "preload.js");
  const runtimePreloadPath = path.join(klackRoot, "runtime", "preload.bundle.js");

  if (!fs.existsSync(klackPreloadPath)) {
    throw new Error(`Klack is not built. Missing ${klackPreloadPath}`);
  }

  const klackPreload = fs.readFileSync(klackPreloadPath);
  const slackPreload = extractFile(originalAsar, "dist/preload.bundle.js");
  writeFileAtomic(
    runtimePreloadPath,
    Buffer.concat([
      Buffer.from("// Generated by Klack. Re-run `klack install` after every Slack update.\n"),
      klackPreload,
      Buffer.from("\n;\n// Slack's original sandboxed preload follows.\n"),
      slackPreload,
      Buffer.from("\n"),
    ]),
  );
}

export function getStatus(appPath: string): InstallStatus {
  const paths = appPaths(appPath);
  if (!fs.existsSync(paths.appAsar)) {
    return { appPath: path.resolve(appPath), installed: false, state: "broken" };
  }

  const currentIsKlack = isKlackBootstrap(paths.appAsar);
  const hasBackup = fs.existsSync(paths.backupAsar);
  const original = hasBackup ? paths.backupAsar : paths.appAsar;
  let slackVersion: string | undefined;

  try {
    const version = packageJson(original).version;
    if (typeof version === "string") slackVersion = version;
  } catch {
    // The state below will report a broken or unsupported installation.
  }

  if (currentIsKlack && hasBackup) {
    return { appPath: path.resolve(appPath), installed: true, slackVersion, state: "installed" };
  }
  if (currentIsKlack || hasBackup) {
    return { appPath: path.resolve(appPath), installed: false, slackVersion, state: "broken" };
  }
  return { appPath: path.resolve(appPath), installed: false, slackVersion, state: "not-installed" };
}

export async function install(options: InstallOptions): Promise<InstallStatus> {
  const appPath = path.resolve(options.appPath);
  const klackRoot = path.resolve(options.klackRoot);
  const paths = appPaths(appPath);
  const mainPath = path.join(klackRoot, "dist", "main.cjs");
  const shouldResign = options.resign ?? process.platform === "darwin";

  if (!fs.existsSync(mainPath)) {
    throw new Error(`Klack is not built. Missing ${mainPath}`);
  }
  if (!fs.existsSync(paths.appAsar)) {
    throw new Error(`Slack app.asar not found at ${paths.appAsar}`);
  }

  const before = getStatus(appPath);
  if (before.state === "broken") {
    throw new Error("Slack has a partial or conflicting Klack installation; refusing to overwrite it");
  }

  const originalAsar = before.installed ? paths.backupAsar : paths.appAsar;
  const originalPackage = packageJson(originalAsar);
  assertSlackPackage(originalPackage);
  generateCombinedPreload(originalAsar, klackRoot);

  const originalInfoPlist =
    process.platform === "darwin" && fs.existsSync(paths.infoPlist)
      ? fs.readFileSync(paths.infoPlist)
      : undefined;
  const entitlements = shouldResign && process.platform === "darwin" ? readEntitlements(appPath) : undefined;

  const temporaryAsar = path.join(
    paths.resources,
    `.app.asar.klack-${process.pid}-${Math.random().toString(16).slice(2)}`,
  );
  await createBootstrap(
    temporaryAsar,
    mainPath,
    typeof originalPackage.productName === "string" ? originalPackage.productName : "Slack",
    typeof originalPackage.version === "string" ? originalPackage.version : KLACK_VERSION,
  );
  fs.chmodSync(temporaryAsar, fs.statSync(originalAsar).mode);

  if (before.installed) {
    let oldBootstrap: string | undefined;
    let movedBootstrap = false;
    let installedBootstrap = false;
    try {
      oldBootstrap = moveToTemporary(paths.appAsar, "old-bootstrap");
      movedBootstrap = true;
      fs.renameSync(temporaryAsar, paths.appAsar);
      installedBootstrap = true;
      finishMacBundle(paths, appPath, true, entitlements);
      fs.rmSync(oldBootstrap, { force: true });
    } catch (error) {
      if (installedBootstrap) fs.rmSync(paths.appAsar, { force: true });
      if (movedBootstrap && oldBootstrap && !fs.existsSync(paths.appAsar) && fs.existsSync(oldBootstrap)) {
        fs.renameSync(oldBootstrap, paths.appAsar);
      }
      if (originalInfoPlist) writeFileAtomic(paths.infoPlist, originalInfoPlist);
      fs.rmSync(temporaryAsar, { force: true });
      throw error;
    }
    return getStatus(appPath);
  }

  let movedAsar = false;
  let movedUnpacked = false;
  let installedBootstrap = false;
  try {
    fs.renameSync(paths.appAsar, paths.backupAsar);
    movedAsar = true;

    if (fs.existsSync(paths.appUnpacked)) {
      fs.renameSync(paths.appUnpacked, paths.backupUnpacked);
      movedUnpacked = true;
    }

    fs.renameSync(temporaryAsar, paths.appAsar);
    installedBootstrap = true;
    finishMacBundle(paths, appPath, true, entitlements);
  } catch (error) {
    if (installedBootstrap) fs.rmSync(paths.appAsar, { force: true });
    if (movedUnpacked && fs.existsSync(paths.backupUnpacked)) {
      fs.renameSync(paths.backupUnpacked, paths.appUnpacked);
    }
    if (movedAsar && fs.existsSync(paths.backupAsar)) {
      fs.renameSync(paths.backupAsar, paths.appAsar);
    }
    if (originalInfoPlist) writeFileAtomic(paths.infoPlist, originalInfoPlist);
    fs.rmSync(temporaryAsar, { force: true });
    throw error;
  }

  return getStatus(appPath);
}

export function uninstall(appPathInput: string, options: UninstallOptions = {}): InstallStatus {
  const appPath = path.resolve(appPathInput);
  const paths = appPaths(appPath);
  const before = getStatus(appPath);
  const shouldResign = options.resign ?? process.platform === "darwin";

  if (!before.installed) {
    throw new Error(
      before.state === "not-installed"
        ? "Klack is not installed in this Slack app"
        : "Slack has a partial or conflicting Klack installation; refusing an automatic restore",
    );
  }

  const originalInfoPlist =
    process.platform === "darwin" && fs.existsSync(paths.infoPlist)
      ? fs.readFileSync(paths.infoPlist)
      : undefined;
  const entitlements = shouldResign && process.platform === "darwin" ? readEntitlements(appPath) : undefined;

  let oldBootstrap: string | undefined;
  let restoredAsar = false;
  let restoredUnpacked = false;

  try {
    oldBootstrap = moveToTemporary(paths.appAsar, "removing-bootstrap");
    fs.renameSync(paths.backupAsar, paths.appAsar);
    restoredAsar = true;

    if (fs.existsSync(paths.backupUnpacked)) {
      fs.renameSync(paths.backupUnpacked, paths.appUnpacked);
      restoredUnpacked = true;
    }

    finishMacBundle(paths, appPath, false, entitlements);
    fs.rmSync(oldBootstrap, { force: true });
  } catch (error) {
    if (restoredUnpacked && fs.existsSync(paths.appUnpacked)) {
      fs.renameSync(paths.appUnpacked, paths.backupUnpacked);
    }
    if (restoredAsar && fs.existsSync(paths.appAsar)) {
      fs.renameSync(paths.appAsar, paths.backupAsar);
    }
    if (oldBootstrap && fs.existsSync(oldBootstrap)) {
      fs.renameSync(oldBootstrap, paths.appAsar);
    }
    if (originalInfoPlist) writeFileAtomic(paths.infoPlist, originalInfoPlist);
    throw error;
  }

  return getStatus(appPath);
}
