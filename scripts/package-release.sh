#!/bin/sh

set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
OUTPUT_DIR=${1:-${ROOT}/release}
cd "$ROOT"
VERSION=v$(node -p "require('./package.json').version")

case "$(uname -s)" in
  Darwin) PLATFORM=darwin ;;
  *) printf 'package-release: only macOS release artifacts are supported\n' >&2; exit 1 ;;
esac

case "$(uname -m)" in
  arm64) ARCH=arm64 ;;
  x86_64) ARCH=x64 ;;
  *) printf 'package-release: unsupported architecture: %s\n' "$(uname -m)" >&2; exit 1 ;;
esac

command -v pnpm >/dev/null 2>&1 || {
  printf 'package-release: pnpm is required\n' >&2
  exit 1
}

STAGING=$(mktemp -d "${TMPDIR:-/tmp}/klack-package.XXXXXX")
trap 'rm -rf "$STAGING"' EXIT HUP INT TERM

pnpm build
pnpm --filter . deploy --legacy --prod "${STAGING}/klack"

mkdir -p "${STAGING}/klack/runtime" "$OUTPUT_DIR"
printf '%s\n' "$VERSION" > "${STAGING}/klack/VERSION"
chmod +x "${STAGING}/klack/dist/cli.cjs"

ARCHIVE=klack-${VERSION}-${PLATFORM}-${ARCH}.tar.gz
COPYFILE_DISABLE=1 tar -czf "${OUTPUT_DIR}/${ARCHIVE}" -C "$STAGING" klack
(
  cd "$OUTPUT_DIR"
  shasum -a 256 "$ARCHIVE" > "${ARCHIVE}.sha256"
)

printf 'Created %s\n' "${OUTPUT_DIR}/${ARCHIVE}"
