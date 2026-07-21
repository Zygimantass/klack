#!/bin/sh

set -eu

REPOSITORY=${KLACK_REPOSITORY:-Zygimantass/klack}
INSTALL_ROOT=${KLACK_INSTALL_ROOT:-${HOME}/Library/Application Support/Klack}
BIN_DIR=${KLACK_BIN_DIR:-${HOME}/.local/bin}
RELEASE_BASE_URL=${KLACK_RELEASE_BASE_URL:-https://github.com/${REPOSITORY}/releases/download}
LATEST_URL=${KLACK_LATEST_URL:-https://github.com/${REPOSITORY}/releases/latest}
VERSION=${KLACK_VERSION:-}
PR_NUMBER=${KLACK_PR:-}
INSTALL_SLACK=false
APP_PATH=
NO_RESIGN=false

say() {
  printf '%s\n' "$*"
}

fail() {
  printf 'klack install: %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Install the latest Klack release for macOS.

Usage:
  install.sh [--install] [--version vX.Y.Z | --pr NUMBER] [--app /Applications/Slack.app] [--no-resign]

Options:
  --install         Run `klack install` after installing the Klack runtime.
  --version VERSION Install a specific release tag instead of the latest.
  --pr NUMBER       Install the successful CI build for a pull request.
  --app PATH        Forward a custom Slack app path to `klack install`.
  --no-resign       Forward `--no-resign` to `klack install`.
  -h, --help        Show this help.

Environment:
  KLACK_INSTALL_ROOT      Runtime directory (default: ~/Library/Application Support/Klack)
  KLACK_BIN_DIR           Launcher directory (default: ~/.local/bin)
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --install)
      INSTALL_SLACK=true
      ;;
    --version)
      [ "$#" -ge 2 ] || fail "--version requires a release tag"
      VERSION=$2
      shift
      ;;
    --pr)
      [ "$#" -ge 2 ] || fail "--pr requires a pull request number"
      PR_NUMBER=$2
      shift
      ;;
    --app)
      [ "$#" -ge 2 ] || fail "--app requires a path"
      APP_PATH=$2
      shift
      ;;
    --no-resign)
      NO_RESIGN=true
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "unknown argument: $1"
      ;;
  esac
  shift
done

[ "${KLACK_PLATFORM:-$(uname -s)}" = "Darwin" ] || fail "only macOS is currently supported"

DETECTED_ARCH=${KLACK_ARCH:-$(uname -m)}
if [ -z "${KLACK_ARCH:-}" ] && [ "$(sysctl -n sysctl.proc_translated 2>/dev/null || true)" = "1" ]; then
  DETECTED_ARCH=arm64
fi

case "$DETECTED_ARCH" in
  arm64)
    ARCH=arm64
    ;;
  x86_64)
    ARCH=x64
    ;;
  *)
    fail "unsupported architecture: $DETECTED_ARCH"
    ;;
esac

command -v curl >/dev/null 2>&1 || fail "curl is required"
command -v tar >/dev/null 2>&1 || fail "tar is required"
command -v node >/dev/null 2>&1 || fail "Node.js 24 or newer is required: https://nodejs.org/"

NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null) ||
  fail "could not determine the installed Node.js version"
[ "$NODE_MAJOR" -ge 24 ] || fail "Node.js 24 or newer is required (found $(node --version))"

download() {
  DOWNLOAD_URL=$1
  shift
  case "$DOWNLOAD_URL" in
    https://*)
      curl --proto '=https' --proto-redir '=https' --tlsv1.2 -fsSL --retry 3 "$@" "$DOWNLOAD_URL"
      ;;
    *)
      [ "${KLACK_ALLOW_INSECURE_DOWNLOADS:-}" = "1" ] ||
        fail "refusing non-HTTPS download URL: $DOWNLOAD_URL"
      curl -fsSL --retry 3 "$@" "$DOWNLOAD_URL"
      ;;
  esac
}

TEMP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/klack-install.XXXXXX")
RELEASE_STAGE=
INSTALL_LOCK=
trap 'rm -rf "$TEMP_DIR"; [ -z "$RELEASE_STAGE" ] || rm -rf "$RELEASE_STAGE"; [ -z "$INSTALL_LOCK" ] || rmdir "$INSTALL_LOCK" 2>/dev/null || true' EXIT HUP INT TERM

if [ -n "$PR_NUMBER" ] && [ -n "$VERSION" ]; then
  fail "--pr and --version cannot be used together"
fi

if [ -n "$PR_NUMBER" ]; then
  case "$PR_NUMBER" in
    *[!0-9]*|'') fail "invalid pull request number: $PR_NUMBER" ;;
  esac
  [ "$PR_NUMBER" -gt 0 ] 2>/dev/null || fail "invalid pull request number: $PR_NUMBER"
  command -v gh >/dev/null 2>&1 || fail "GitHub CLI is required for PR builds: https://cli.github.com/"
  gh auth status >/dev/null 2>&1 || fail "authenticate GitHub CLI before installing a PR build: gh auth login"

  PR_SHA=$(gh pr view "$PR_NUMBER" --repo "$REPOSITORY" --json headRefOid --jq '.headRefOid') ||
    fail "could not resolve pull request #${PR_NUMBER}"
  case "$PR_SHA" in
    *[!0-9a-f]*|'') fail "pull request #${PR_NUMBER} returned an invalid head commit" ;;
  esac
  [ "${#PR_SHA}" -eq 40 ] || fail "pull request #${PR_NUMBER} returned an invalid head commit"

  RUN_ID=$(gh run list \
    --repo "$REPOSITORY" \
    --workflow CI \
    --event pull_request \
    --commit "$PR_SHA" \
    --status success \
    --limit 1 \
    --json databaseId \
    --jq '.[0].databaseId // empty') || fail "could not query CI for pull request #${PR_NUMBER}"
  case "$RUN_ID" in
    *[!0-9]*|'')
      fail "pull request #${PR_NUMBER} has no successful CI build for ${PR_SHA}; wait for CI or approve the workflow first"
      ;;
  esac

  ARTIFACT=klack-pr-${PR_NUMBER}-darwin-${ARCH}
  ARTIFACT_DIR=${TEMP_DIR}/artifact
  mkdir -p "$ARTIFACT_DIR"
  say "WARNING: PR builds are unreviewed code. Only continue with pull requests you trust."
  say "Downloading Klack PR #${PR_NUMBER} (${PR_SHA}) for darwin-${ARCH}..."
  gh run download "$RUN_ID" --repo "$REPOSITORY" --name "$ARTIFACT" --dir "$ARTIFACT_DIR" ||
    fail "could not download ${ARTIFACT} from CI run ${RUN_ID}"

  ARCHIVE_PATH=
  for CANDIDATE in "${ARTIFACT_DIR}"/klack-v*-darwin-${ARCH}.tar.gz; do
    [ -f "$CANDIDATE" ] || continue
    [ -z "$ARCHIVE_PATH" ] || fail "PR artifact contains multiple darwin-${ARCH} archives"
    ARCHIVE_PATH=$CANDIDATE
  done
  [ -n "$ARCHIVE_PATH" ] || fail "PR artifact does not contain a darwin-${ARCH} archive"
  ARCHIVE=${ARCHIVE_PATH##*/}
  CHECKSUM_FILE=${ARCHIVE_PATH}.sha256
  [ -f "$CHECKSUM_FILE" ] || fail "PR artifact does not contain a checksum for ${ARCHIVE}"
  SHORT_SHA=$(printf '%s' "$PR_SHA" | cut -c1-12)
  INSTALL_VERSION=pr-${PR_NUMBER}-${SHORT_SHA}-${RUN_ID}
  DISPLAY_VERSION="PR #${PR_NUMBER} at ${SHORT_SHA}"
else
  if [ -z "$VERSION" ]; then
    VERSION=$(download "$LATEST_URL" -o /dev/null -w '%{url_effective}')
    VERSION=${VERSION%/}
    VERSION=${VERSION##*/}
  fi

  case "$VERSION" in
    v[0-9]*) ;;
    *) fail "invalid release tag: $VERSION" ;;
  esac
  case "$VERSION" in
    *[!A-Za-z0-9._-]*) fail "invalid release tag: $VERSION" ;;
  esac

  ARCHIVE=klack-${VERSION}-darwin-${ARCH}.tar.gz
  ARCHIVE_PATH=${TEMP_DIR}/${ARCHIVE}
  RELEASE_URL=${RELEASE_BASE_URL}/${VERSION}
  CHECKSUM_FILE=${TEMP_DIR}/checksums.txt
  INSTALL_VERSION=$VERSION
  DISPLAY_VERSION=$VERSION
  say "Downloading Klack ${VERSION} for darwin-${ARCH}..."
  download "${RELEASE_URL}/${ARCHIVE}" -o "$ARCHIVE_PATH"
  download "${RELEASE_URL}/checksums.txt" -o "$CHECKSUM_FILE"
fi

EXPECTED_CHECKSUM=$(awk -v archive="$ARCHIVE" '$2 == archive || $2 == "*" archive { print $1; exit }' "$CHECKSUM_FILE")
[ -n "$EXPECTED_CHECKSUM" ] || fail "checksums.txt has no entry for ${ARCHIVE}"

if command -v shasum >/dev/null 2>&1; then
  ACTUAL_CHECKSUM=$(shasum -a 256 "$ARCHIVE_PATH" | awk '{ print $1 }')
elif command -v sha256sum >/dev/null 2>&1; then
  ACTUAL_CHECKSUM=$(sha256sum "$ARCHIVE_PATH" | awk '{ print $1 }')
else
  fail "shasum or sha256sum is required to verify the release"
fi
[ "$ACTUAL_CHECKSUM" = "$EXPECTED_CHECKSUM" ] || fail "checksum verification failed for ${ARCHIVE}"

mkdir -p "${TEMP_DIR}/extracted"
tar -xzf "$ARCHIVE_PATH" -C "${TEMP_DIR}/extracted"
PACKAGE_ROOT=${TEMP_DIR}/extracted/klack
[ -f "${PACKAGE_ROOT}/dist/cli.cjs" ] || fail "release archive does not contain dist/cli.cjs"
[ -f "${PACKAGE_ROOT}/dist/main.cjs" ] || fail "release archive does not contain dist/main.cjs"
[ -f "${PACKAGE_ROOT}/dist/preload.js" ] || fail "release archive does not contain dist/preload.js"
[ -f "${PACKAGE_ROOT}/dist/sdk.js" ] || fail "release archive does not contain dist/sdk.js"
[ -d "${PACKAGE_ROOT}/plugins" ] || fail "release archive does not contain built-in plugins"
[ -d "${PACKAGE_ROOT}/node_modules" ] || fail "release archive does not contain production dependencies"

RELEASES_DIR=${INSTALL_ROOT}/releases
RELEASE_DIR=${RELEASES_DIR}/${INSTALL_VERSION}
mkdir -p "$RELEASES_DIR" "$BIN_DIR"
LOCK_PATH=${INSTALL_ROOT}/.install-lock
mkdir "$LOCK_PATH" 2>/dev/null || fail "another Klack installation is already running"
INSTALL_LOCK=$LOCK_PATH

if [ -e "$RELEASE_DIR" ]; then
  if [ ! -f "${RELEASE_DIR}/dist/cli.cjs" ] ||
    [ ! -f "${RELEASE_DIR}/dist/main.cjs" ] ||
    [ ! -f "${RELEASE_DIR}/dist/preload.js" ] ||
    [ ! -f "${RELEASE_DIR}/dist/sdk.js" ] ||
    [ ! -d "${RELEASE_DIR}/plugins" ] ||
    [ ! -d "${RELEASE_DIR}/node_modules" ]; then
    fail "existing release is incomplete; remove ${RELEASE_DIR} and re-run the installer"
  fi
  say "Klack ${DISPLAY_VERSION} is already downloaded."
else
  RELEASE_STAGE=$(mktemp -d "${RELEASES_DIR}/.staging.XXXXXX")
  chmod +x "${PACKAGE_ROOT}/dist/cli.cjs"
  mv "$PACKAGE_ROOT" "${RELEASE_STAGE}/klack"
  mv "${RELEASE_STAGE}/klack" "$RELEASE_DIR"
  rmdir "$RELEASE_STAGE"
  RELEASE_STAGE=
fi

LAUNCHER=${BIN_DIR}/klack
if [ -e "$LAUNCHER" ] || [ -L "$LAUNCHER" ]; then
  EXISTING_TARGET=$(readlink "$LAUNCHER" 2>/dev/null || true)
  [ "$EXISTING_TARGET" = "${INSTALL_ROOT}/current/dist/cli.cjs" ] ||
    fail "refusing to replace existing launcher: ${LAUNCHER}"
fi

ln -sfn "releases/${INSTALL_VERSION}" "${INSTALL_ROOT}/current"
ln -sfn "${INSTALL_ROOT}/current/dist/cli.cjs" "$LAUNCHER"

say "Klack ${DISPLAY_VERSION} installed in ${RELEASE_DIR}"
say "Launcher: ${LAUNCHER}"

case ":${PATH}:" in
  *:"${BIN_DIR}":*) ;;
  *) say "Add ${BIN_DIR} to PATH to run klack directly." ;;
esac

if [ "$INSTALL_SLACK" = true ]; then
  say "Installing Klack into Slack..."
  set -- install
  if [ -n "$APP_PATH" ]; then
    set -- "$@" --app "$APP_PATH"
  fi
  if [ "$NO_RESIGN" = true ]; then
    set -- "$@" --no-resign
  fi
  "$LAUNCHER" "$@"
else
  say "Quit Slack completely, then run:"
  say "  ${LAUNCHER} install"
fi
