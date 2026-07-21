import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const installScript = path.resolve("install.sh");
const version = "v0.1.0";

function writeRelease(root: string, releaseRoot: string, tag: string, validChecksum = true): string {
  const release = path.join(releaseRoot, tag);
  const packageRoot = path.join(root, "package", "klack");
  const archive = `klack-${tag}-darwin-arm64.tar.gz`;
  const archivePath = path.join(release, archive);

  for (const directory of [
    path.join(packageRoot, "dist"),
    path.join(packageRoot, "plugins"),
    path.join(packageRoot, "node_modules"),
    release,
  ]) {
    fs.mkdirSync(directory, { recursive: true });
  }

  fs.writeFileSync(
    path.join(packageRoot, "dist", "cli.cjs"),
    `#!/usr/bin/env node
const fs = require("node:fs");
fs.appendFileSync(process.env.KLACK_TEST_INVOCATIONS, process.argv.slice(2).join(" ") + "\\n");
`,
  );
  fs.chmodSync(path.join(packageRoot, "dist", "cli.cjs"), 0o755);
  for (const file of ["main.cjs", "preload.js", "sdk.js"]) {
    fs.writeFileSync(path.join(packageRoot, "dist", file), "// fixture\n");
  }
  fs.writeFileSync(path.join(packageRoot, "plugins", "fixture.js"), "module.exports = () => {};\n");
  fs.writeFileSync(path.join(packageRoot, "node_modules", ".fixture"), "");

  execFileSync("tar", ["-czf", archivePath, "-C", path.join(root, "package"), "klack"]);
  const contents = fs.readFileSync(archivePath);
  const checksum = validChecksum ? createHash("sha256").update(contents).digest("hex") : "0".repeat(64);
  fs.writeFileSync(path.join(release, "checksums.txt"), `${checksum}  ${archive}\n`);
  fs.rmSync(path.join(root, "package"), { force: true, recursive: true });
  return archivePath;
}

function writeFakeGitHubCli(binDirectory: string): void {
  const script = `#!/bin/sh
set -eu
case "$1 $2" in
  "auth status") exit 0 ;;
  "pr view") printf '%s\\n' "$KLACK_TEST_PR_SHA" ;;
  "run list") printf '%s\\n' "$KLACK_TEST_RUN_ID" ;;
  "run download")
    shift 2
    output=
    while [ "$#" -gt 0 ]; do
      if [ "$1" = "--dir" ]; then
        output=$2
        shift
      fi
      shift
    done
    mkdir -p "$output"
    cp "$KLACK_TEST_PR_ARCHIVE" "$output/"
    cp "$KLACK_TEST_PR_ARCHIVE.sha256" "$output/"
    ;;
  *) printf 'unexpected gh invocation: %s\\n' "$*" >&2; exit 1 ;;
esac
`;
  fs.writeFileSync(path.join(binDirectory, "gh"), script);
  fs.chmodSync(path.join(binDirectory, "gh"), 0o755);
}

function releaseFixture(t: test.TestContext, validChecksum = true) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "klack-install-script-"));
  const releaseRoot = path.join(root, "releases");
  const invocationLog = path.join(root, "invocations.log");
  writeRelease(root, releaseRoot, version, validChecksum);

  const installRoot = path.join(root, "Library", "Application Support", "Klack");
  const binDirectory = path.join(root, "bin");
  const environment = {
    ...process.env,
    FORCE_COLOR: "1",
    NO_COLOR: "",
    KLACK_ALLOW_INSECURE_DOWNLOADS: "1",
    KLACK_ARCH: "arm64",
    KLACK_BIN_DIR: binDirectory,
    KLACK_INSTALL_ROOT: installRoot,
    KLACK_PLATFORM: "Darwin",
    KLACK_RELEASE_BASE_URL: pathToFileURL(releaseRoot).href.replace(/\/$/, ""),
    KLACK_TEST_INVOCATIONS: invocationLog,
    KLACK_VERSION: version,
  };

  t.after(() => fs.rmSync(root, { force: true, recursive: true }));
  return { binDirectory, environment, installRoot, invocationLog, releaseRoot, root };
}

test("installs a verified release in a durable version directory", (t) => {
  const fixture = releaseFixture(t);
  const output = execFileSync("/bin/sh", [installScript, "--install"], {
    encoding: "utf8",
    env: fixture.environment,
  });

  const releaseDirectory = path.join(fixture.installRoot, "releases", version);
  const launcher = path.join(fixture.binDirectory, "klack");
  assert.equal(fs.realpathSync(path.join(fixture.installRoot, "current")), fs.realpathSync(releaseDirectory));
  assert.equal(fs.readlinkSync(launcher), path.join(fixture.installRoot, "current", "dist", "cli.cjs"));
  assert.equal(fs.readFileSync(fixture.invocationLog, "utf8"), "install\n");
  assert.match(output, new RegExp(`Klack ${version} installed`));
});

test("downloads an update without removing the previously installed release", (t) => {
  const fixture = releaseFixture(t);
  execFileSync("/bin/sh", [installScript], { env: fixture.environment });

  const nextVersion = "v0.1.1";
  writeRelease(fixture.root, fixture.releaseRoot, nextVersion);
  execFileSync("/bin/sh", [installScript], {
    env: { ...fixture.environment, KLACK_VERSION: nextVersion },
  });

  assert.equal(fs.existsSync(path.join(fixture.installRoot, "releases", version)), true);
  assert.equal(
    fs.realpathSync(path.join(fixture.installRoot, "current")),
    fs.realpathSync(path.join(fixture.installRoot, "releases", nextVersion)),
  );
});

test("CLI update downloads the release and forwards install options", (t) => {
  const fixture = releaseFixture(t);
  const fakeBin = path.join(fixture.root, "fake-bin");
  const customApp = path.join(fixture.root, "Custom Slack.app");
  fs.mkdirSync(fakeBin);
  fs.writeFileSync(path.join(fakeBin, "pgrep"), "#!/bin/sh\nexit 1\n");
  fs.chmodSync(path.join(fakeBin, "pgrep"), 0o755);

  execFileSync(
    process.execPath,
    [path.resolve("dist/cli.cjs"), "update", "--app", customApp, "--no-resign"],
    {
      env: {
        ...fixture.environment,
        PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
      },
    },
  );

  assert.equal(
    fs.readFileSync(fixture.invocationLog, "utf8"),
    `install --app ${customApp} --no-resign\n`,
  );
});

test("CLI installs a successful pull request build by number", (t) => {
  const fixture = releaseFixture(t);
  const fakeBin = path.join(fixture.root, "fake-bin");
  const customApp = path.join(fixture.root, "Custom Slack.app");
  const pullRequest = 42;
  const pullRequestSha = "0123456789abcdef0123456789abcdef01234567";
  const runId = "123456789";
  const archive = path.join(fixture.releaseRoot, version, `klack-${version}-darwin-arm64.tar.gz`);
  const checksum = createHash("sha256").update(fs.readFileSync(archive)).digest("hex");
  fs.writeFileSync(`${archive}.sha256`, `${checksum}  ${path.basename(archive)}\n`);
  fs.mkdirSync(fakeBin);
  fs.writeFileSync(path.join(fakeBin, "pgrep"), "#!/bin/sh\nexit 1\n");
  fs.chmodSync(path.join(fakeBin, "pgrep"), 0o755);
  writeFakeGitHubCli(fakeBin);

  const output = execFileSync(
    process.execPath,
    [path.resolve("dist/cli.cjs"), "install", `#${pullRequest}`, "--app", customApp, "--no-resign"],
    {
      encoding: "utf8",
      env: {
        ...fixture.environment,
        KLACK_TEST_PR_ARCHIVE: archive,
        KLACK_TEST_PR_SHA: pullRequestSha,
        KLACK_TEST_RUN_ID: runId,
        KLACK_VERSION: "",
        PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
      },
    },
  );

  const installVersion = `pr-${pullRequest}-${pullRequestSha.slice(0, 12)}-${runId}`;
  assert.equal(
    fs.realpathSync(path.join(fixture.installRoot, "current")),
    fs.realpathSync(path.join(fixture.installRoot, "releases", installVersion)),
  );
  assert.equal(
    fs.readFileSync(fixture.invocationLog, "utf8"),
    `install --app ${customApp} --no-resign\n`,
  );
  assert.match(output, /WARNING: PR builds are unreviewed code/);
  assert.match(output, /Klack PR #42 at 0123456789ab installed/);
});

test("CLI rejects an invalid pull request selector", () => {
  const result = spawnSync(process.execPath, [path.resolve("dist/cli.cjs"), "install", "#not-a-number"], {
    encoding: "utf8",
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Invalid pull request number/);
});

test("refuses to replace an unrelated launcher", (t) => {
  const fixture = releaseFixture(t);
  fs.mkdirSync(fixture.binDirectory, { recursive: true });
  fs.writeFileSync(path.join(fixture.binDirectory, "klack"), "unrelated\n");

  const result = spawnSync("/bin/sh", [installScript], {
    encoding: "utf8",
    env: fixture.environment,
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /refusing to replace existing launcher/);
  assert.equal(fs.readFileSync(path.join(fixture.binDirectory, "klack"), "utf8"), "unrelated\n");
});

test("rejects an incomplete existing release", (t) => {
  const fixture = releaseFixture(t);
  const releaseDirectory = path.join(fixture.installRoot, "releases", version);
  fs.mkdirSync(path.join(releaseDirectory, "dist"), { recursive: true });
  fs.writeFileSync(path.join(releaseDirectory, "dist", "cli.cjs"), "");

  const result = spawnSync("/bin/sh", [installScript], {
    encoding: "utf8",
    env: fixture.environment,
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /existing release is incomplete/);
});

test("rejects a release whose checksum does not match", (t) => {
  const fixture = releaseFixture(t, false);
  const result = spawnSync("/bin/sh", [installScript], {
    encoding: "utf8",
    env: fixture.environment,
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /checksum verification failed/);
  assert.equal(fs.existsSync(fixture.installRoot), false);
});
