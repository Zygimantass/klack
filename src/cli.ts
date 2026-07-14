import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { getStatus, install, uninstall } from "./installer";

const DEFAULT_SLACK_APP = "/Applications/Slack.app";

function usage(): string {
  return `Klack - experimental Slack desktop plugin loader

Usage:
  klack status [--app /Applications/Slack.app]
  klack install [--app /Applications/Slack.app] [--no-resign]
  klack uninstall [--app /Applications/Slack.app] [--no-resign]

Slack must be fully quit before install or uninstall. Installing modifies
Slack's app.asar and replaces the outer app's vendor signature with an ad-hoc
signature. --no-resign leaves the modified app unable to launch until signed.`;
}

function parseArguments(argv: string[]): { appPath: string; command: string; resign: boolean } {
  let appPath = DEFAULT_SLACK_APP;
  let command = "help";
  let resign = true;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--app") {
      const value = argv[index + 1];
      if (!value) throw new Error("--app requires a path");
      appPath = value;
      index += 1;
    } else if (argument === "--no-resign") {
      resign = false;
    } else if (argument === "--help" || argument === "-h") {
      command = "help";
    } else if (!argument.startsWith("-") && command === "help") {
      command = argument;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  return { appPath: path.resolve(appPath), command, resign };
}

function slackIsRunning(): boolean {
  if (process.platform !== "darwin") return false;
  try {
    execFileSync("pgrep", ["-x", "Slack"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function printStatus(status: ReturnType<typeof getStatus>): void {
  console.log(`App: ${status.appPath}`);
  console.log(`State: ${status.state}`);
  if (status.slackVersion) console.log(`Slack: ${status.slackVersion}`);
}

function bundleBackupPath(appPath: string): string {
  return path.join(path.dirname(appPath), `.${path.basename(appPath)}.klack-original`);
}

function bundleAllowsWrites(appPath: string): boolean {
  const probe = path.join(appPath, "Contents", "Resources", `.klack-write-probe-${process.pid}`);
  try {
    fs.writeFileSync(probe, "");
    fs.rmSync(probe);
    return true;
  } catch (error) {
    fs.rmSync(probe, { force: true });
    if ((error as NodeJS.ErrnoException).code === "EACCES" || (error as NodeJS.ErrnoException).code === "EPERM") {
      return false;
    }
    throw error;
  }
}

async function installApp(appPath: string, klackRoot: string, resign: boolean) {
  if (process.platform !== "darwin" || bundleAllowsWrites(appPath)) {
    return install({ appPath, klackRoot, resign });
  }

  const backupPath = bundleBackupPath(appPath);
  if (fs.existsSync(backupPath)) {
    throw new Error(`Cannot stage protected Slack app because a previous bundle backup exists at ${backupPath}`);
  }

  const stagingRoot = fs.mkdtempSync(path.join(path.dirname(appPath), ".klack-staging-"));
  const stagedApp = path.join(stagingRoot, path.basename(appPath));
  let movedOriginal = false;

  console.log("Slack is protected by macOS App Management; installing through a verified staging copy.");
  try {
    execFileSync("/usr/bin/ditto", ["--noextattr", "--noqtn", appPath, stagedApp], { stdio: "pipe" });
    await install({ appPath: stagedApp, klackRoot, resign });

    fs.renameSync(appPath, backupPath);
    movedOriginal = true;
    try {
      fs.renameSync(stagedApp, appPath);
    } catch (error) {
      fs.renameSync(backupPath, appPath);
      movedOriginal = false;
      throw error;
    }

    return getStatus(appPath);
  } finally {
    if (movedOriginal && !fs.existsSync(appPath) && fs.existsSync(backupPath)) {
      fs.renameSync(backupPath, appPath);
    }
    fs.rmSync(stagingRoot, { force: true, recursive: true });
  }
}

function uninstallApp(appPath: string, resign: boolean) {
  const backupPath = bundleBackupPath(appPath);
  if (process.platform !== "darwin" || !fs.existsSync(backupPath)) {
    return uninstall(appPath, { resign });
  }

  if (!getStatus(appPath).installed) {
    throw new Error("A full-bundle backup exists, but the current Slack app is not a valid Klack installation");
  }

  const modifiedApp = path.join(
    path.dirname(appPath),
    `.${path.basename(appPath)}.klack-removing-${process.pid}`,
  );
  fs.renameSync(appPath, modifiedApp);
  try {
    fs.renameSync(backupPath, appPath);
  } catch (error) {
    fs.renameSync(modifiedApp, appPath);
    throw error;
  }
  fs.rmSync(modifiedApp, { force: true, recursive: true });
  return getStatus(appPath);
}

async function main(): Promise<void> {
  const { appPath, command, resign } = parseArguments(process.argv.slice(2));
  // Release installs use a `current` symlink for the CLI. Resolve it before
  // writing the runtime path into Slack's bootstrap so an update cannot move
  // an existing Slack installation to a version it has not installed yet.
  const klackRoot = fs.realpathSync(path.resolve(__dirname, ".."));

  if (command === "help") {
    console.log(usage());
    return;
  }
  if (command === "status") {
    printStatus(getStatus(appPath));
    return;
  }
  if (command !== "install" && command !== "uninstall") {
    throw new Error(`Unknown command: ${command}\n\n${usage()}`);
  }
  if (slackIsRunning()) {
    throw new Error("A Slack app is running. Quit every Slack copy before modifying an application bundle.");
  }

  if (command === "install") {
    printStatus(await installApp(appPath, klackRoot, resign));
    console.log(
      resign
        ? fs.existsSync(bundleBackupPath(appPath))
          ? "Klack installed with an ad-hoc signature. The original app bundle was preserved for uninstall."
          : "Klack installed. Slack's outer app now has an ad-hoc signature; its vendor signature is not preserved."
        : "Klack installed without re-signing. Slack will not launch until the modified bundle is signed.",
    );
    if (appPath !== DEFAULT_SLACK_APP) {
      console.warn(
        "Browser sign-in callbacks use slack:// and may open /Applications/Slack.app instead. " +
          "Quit other Slack copies or install Klack in the canonical app.",
      );
    }
  } else {
    const restoredBundle = fs.existsSync(bundleBackupPath(appPath));
    printStatus(uninstallApp(appPath, resign));
    console.log(
      restoredBundle
        ? "Klack removed and Slack's original vendor-signed app bundle restored."
        : resign
        ? "Klack removed, Slack's original ASAR restored, and the outer app re-signed ad-hoc."
        : "Klack removed and Slack's original ASAR restored without re-signing the outer app.",
    );
  }
}

void main().catch((error) => {
  console.error(`klack: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
