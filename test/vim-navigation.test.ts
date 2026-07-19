import assert from "node:assert/strict";
import test from "node:test";

import {
  appendCountDigit,
  countValue,
  keyCommand,
  movedIndex,
  shouldSuppressNormalModeKey,
  threadTimestampFromUrl,
  wrappedIndex,
  type VimCommand,
  type VimKeyContext,
  type VimKeyInput,
} from "../plugins/lib/vim-navigation";

function key(
  value: string,
  overrides: Partial<VimKeyInput> = {},
  context: VimKeyContext = {},
): VimCommand | null {
  return keyCommand({ key: value, ...overrides }, context);
}

test("maps unmodified Vim navigation keys", () => {
  assert.equal(key("h"), "left");
  assert.equal(key("j"), "next");
  assert.equal(key("k"), "previous");
  assert.equal(key("l"), "activate");
  assert.equal(key("Enter"), "activate");
  assert.equal(key("Escape"), "unwind");
  assert.equal(key("/"), "search");
  assert.equal(key("/", { shiftKey: true }), "search");
  assert.equal(key("g"), "top-prefix");
  assert.equal(key("G", { shiftKey: true }), "bottom");
  assert.equal(key("i"), "insert");
  assert.equal(key("v"), "visual");
  assert.equal(key("y"), "yank");
  assert.equal(key("}"), "page-next");
  assert.equal(key("}", { shiftKey: true }), "page-next");
  assert.equal(key("{"), "page-previous");
  assert.equal(key("{", { shiftKey: true }), "page-previous");
  assert.equal(key("d", { ctrlKey: true }), "half-next");
  assert.equal(key("u", { ctrlKey: true }), "half-previous");
  assert.equal(key("7"), "count");
  assert.equal(key("j", { ctrlKey: true }), null);
  assert.equal(key("d", { ctrlKey: true, shiftKey: true }), null);
  assert.equal(key("d", { metaKey: true }), null);
  assert.equal(key("i", { shiftKey: true }), null);

  for (const value of ["J", "K", " ", "ArrowDown", "x"]) {
    assert.equal(key(value), null);
  }
});

test("leaves modified, composing, prevented, and native-surface keys alone", () => {
  for (const value of ["h", "j", "k", "l", "Enter", "Escape"]) {
    for (const overrides of [
      { altKey: true },
      { ctrlKey: true },
      { metaKey: true },
      { shiftKey: true },
      { isComposing: true },
      { defaultPrevented: true },
    ]) {
      assert.equal(key(value, overrides), null);
    }
    assert.equal(key(value, {}, { blocked: true }), null);
    assert.equal(key(value, {}, { nativeTarget: true }), null);
  }
  assert.equal(key("d", { ctrlKey: true }, { nativeTarget: true }), null);
  assert.equal(key("u", { ctrlKey: true }, { blocked: true }), null);
});

test("allows key repeat only for movement commands", () => {
  assert.equal(key("j", { repeat: true }), "next");
  assert.equal(key("k", { repeat: true }), "previous");
  assert.equal(key("}", { repeat: true, shiftKey: true }), "page-next");
  assert.equal(key("d", { ctrlKey: true, repeat: true }), "half-next");
  for (const value of ["h", "g", "G", "i", "v", "y", "/", "l", "Enter", "Escape", "7"]) {
    assert.equal(key(value, { repeat: true }), null);
  }
});

test("builds and reads multi-digit count prefixes", () => {
  assert.equal(appendCountDigit("", "0"), null);
  assert.equal(appendCountDigit("", "1"), "1");
  assert.equal(appendCountDigit("1", "0"), "10");
  assert.equal(appendCountDigit("999", "9"), "999");
  assert.equal(appendCountDigit("1", "x"), null);
  assert.equal(countValue(""), 1);
  assert.equal(countValue("10"), 10);
});

test("suppresses composer editing keys until insert mode", () => {
  for (const value of ["x", " ", "J", "Backspace", "Delete"]) {
    assert.equal(shouldSuppressNormalModeKey({ key: value }), true);
  }
  for (const input of [
    { key: "x", altKey: true },
    { key: "x", ctrlKey: true },
    { key: "x", metaKey: true },
    { key: "x", defaultPrevented: true },
    { key: "x", isComposing: true },
    { key: "Tab" },
  ]) {
    assert.equal(shouldSuppressNormalModeKey(input), false);
  }
});

test("moves within list boundaries without wrapping", () => {
  assert.equal(movedIndex(0, -1, "next"), -1);
  assert.equal(movedIndex(3, -1, "next"), 0);
  assert.equal(movedIndex(3, -1, "previous"), 2);
  assert.equal(movedIndex(3, 1, "next"), 2);
  assert.equal(movedIndex(3, 1, "previous"), 0);
  assert.equal(movedIndex(3, 2, "next"), 2);
  assert.equal(movedIndex(3, 0, "previous"), 0);
  assert.equal(movedIndex(3, 4, "next"), 0);
  assert.equal(movedIndex(3, 4, "previous"), 2);
  assert.equal(movedIndex(20, 2, "next", 10), 12);
  assert.equal(movedIndex(20, 12, "previous", 10), 2);
  assert.equal(movedIndex(5, 2, "next", 10), 4);
});

test("cycles through links with counted wraparound", () => {
  assert.equal(wrappedIndex(0, 0, "next"), -1);
  assert.equal(wrappedIndex(3, 0, "previous"), 2);
  assert.equal(wrappedIndex(3, 2, "next"), 0);
  assert.equal(wrappedIndex(3, 0, "next", 10), 1);
  assert.equal(wrappedIndex(3, 2, "previous", 10), 1);
});

test("preserves a reply's parent timestamp when opening its thread", () => {
  assert.equal(
    threadTimestampFromUrl(
      "https://example.slack.com/archives/C123/p1000000002?thread_ts=1000.000001&cid=C123",
      "1000.000002",
    ),
    "1000.000001",
  );
  assert.equal(
    threadTimestampFromUrl("https://example.slack.com/archives/C123/p1000000002", "1000.000002"),
    "1000.000002",
  );
  assert.equal(
    threadTimestampFromUrl("https://example.slack.com/archives/C123/p1000000002?thread_ts=bad", "1000.000002"),
    "1000.000002",
  );
  assert.equal(threadTimestampFromUrl("not a url", "1000.000002"), "1000.000002");
});
