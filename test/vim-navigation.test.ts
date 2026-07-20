import assert from "node:assert/strict";
import test from "node:test";

import {
  appendCountDigit,
  countValue,
  keyCommand,
  movedIndex,
  movedVisualIndex,
  shouldEnterGlobalSearchResults,
  shouldSuppressNormalModeKey,
  shouldTreatComposerAsNormalMode,
  threadTimestampFromUrl,
  visualMotionCommand,
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
  assert.equal(key(":", { shiftKey: true }), "react");
  assert.equal(key("g"), "top-prefix");
  assert.equal(key("z"), "center-prefix");
  assert.equal(key("G", { shiftKey: true }), "bottom");
  assert.equal(key("H", { shiftKey: true }), "history-back");
  assert.equal(key("L", { shiftKey: true }), "history-forward");
  assert.equal(key("i"), "insert");
  assert.equal(key("c"), "edit");
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
  assert.equal(key(":", { shiftKey: true, metaKey: true }), null);

  for (const value of ["J", "K", " ", "ArrowDown", "x"]) {
    assert.equal(key(value), null);
  }
});

test("leaves modified, composing, prevented, and native-surface keys alone", () => {
  for (const value of ["h", "j", "k", "l", "c", "Enter", "Escape"]) {
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
  assert.equal(key("C", { shiftKey: true }), null);
});

test("allows key repeat only for movement commands", () => {
  assert.equal(key("j", { repeat: true }), "next");
  assert.equal(key("k", { repeat: true }), "previous");
  assert.equal(key("}", { repeat: true, shiftKey: true }), "page-next");
  assert.equal(key("d", { ctrlKey: true, repeat: true }), "half-next");
  for (const value of ["h", "g", "z", "G", "H", "L", "i", "c", "v", "y", "/", ":", "l", "Enter", "Escape", "7"]) {
    assert.equal(key(value, { repeat: true }), null);
  }
});

test("maps visual-mode character and word motions", () => {
  assert.equal(visualMotionCommand({ key: "h" }), "character-previous");
  assert.equal(visualMotionCommand({ key: "l", repeat: true }), "character-next");
  assert.equal(visualMotionCommand({ key: "w" }), "word-next");
  assert.equal(visualMotionCommand({ key: "W", shiftKey: true }), "big-word-next");
  assert.equal(visualMotionCommand({ key: "W", shiftKey: true, repeat: true }), "big-word-next");
  assert.equal(visualMotionCommand({ key: "b" }), "word-previous");
  assert.equal(visualMotionCommand({ key: "e" }), "word-end");
  assert.equal(visualMotionCommand({ key: "E", shiftKey: true }), "big-word-end");
  assert.equal(visualMotionCommand({ key: "E", shiftKey: true, metaKey: true }), null);
  assert.equal(visualMotionCommand({ key: "0" }), "line-start");
  assert.equal(visualMotionCommand({ key: "$", shiftKey: true }), "line-end");
  assert.equal(visualMotionCommand({ key: "o" }), "swap-ends");
  assert.equal(visualMotionCommand({ key: "o", repeat: true }), null);
  assert.equal(visualMotionCommand({ key: "l", metaKey: true }), null);
});

test("enters global result navigation only after submitted search replaces the editor", () => {
  const base = {
    awaitingResults: true,
    hasEditor: false,
    hasView: true,
    kind: "global" as const,
    phase: "typing" as const,
    restoring: false,
  };
  assert.equal(shouldEnterGlobalSearchResults(base), true);
  assert.equal(shouldEnterGlobalSearchResults({ ...base, awaitingResults: false }), false);
  assert.equal(shouldEnterGlobalSearchResults({ ...base, hasEditor: true }), false);
  assert.equal(shouldEnterGlobalSearchResults({ ...base, hasView: false }), false);
  assert.equal(shouldEnterGlobalSearchResults({ ...base, kind: "sidebar" }), false);
  assert.equal(shouldEnterGlobalSearchResults({ ...base, phase: "results" }), false);
  assert.equal(shouldEnterGlobalSearchResults({ ...base, restoring: true }), false);
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

test("never treats an inline message editor as a normal-mode composer", () => {
  assert.equal(
    shouldTreatComposerAsNormalMode({
      insideMessageEditor: true,
      ownedByEditSession: false,
      ownedByInsertSession: false,
    }),
    false,
  );
  assert.equal(
    shouldTreatComposerAsNormalMode({
      insideMessageEditor: false,
      ownedByEditSession: false,
      ownedByInsertSession: false,
    }),
    true,
  );
  assert.equal(
    shouldTreatComposerAsNormalMode({
      insideMessageEditor: false,
      ownedByEditSession: true,
      ownedByInsertSession: false,
    }),
    false,
  );
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

test("cycles through content targets with counted wraparound", () => {
  assert.equal(wrappedIndex(0, 0, "next"), -1);
  assert.equal(wrappedIndex(3, 0, "previous"), 2);
  assert.equal(wrappedIndex(3, 2, "next"), 0);
  assert.equal(wrappedIndex(3, 0, "next", 10), 1);
  assert.equal(wrappedIndex(3, 2, "previous", 10), 1);
});

test("moves visual selection endpoints by characters, words, and hard lines", () => {
  const graphemes = Array.from("one two\nthree");
  assert.equal(movedVisualIndex(graphemes, 0, "character-next", 2), 2);
  assert.equal(movedVisualIndex(graphemes, 6, "character-previous", 3), 3);
  assert.equal(movedVisualIndex(graphemes, 0, "word-next"), 4);
  assert.equal(movedVisualIndex(graphemes, 6, "word-previous"), 4);
  assert.equal(movedVisualIndex(graphemes, 4, "word-end"), 6);
  assert.equal(movedVisualIndex(graphemes, 2, "word-end"), 6);
  assert.equal(movedVisualIndex(graphemes, 0, "word-end", 2), 6);
  assert.equal(movedVisualIndex(graphemes, 5, "line-start"), 0);
  assert.equal(movedVisualIndex(graphemes, 9, "line-start"), 8);
  assert.equal(movedVisualIndex(graphemes, 1, "line-end"), 6);
  assert.equal(movedVisualIndex(graphemes, 9, "line-end"), 12);

  const words = Array.from("one-two three\nfour");
  assert.equal(movedVisualIndex(words, 0, "word-next"), 4);
  assert.equal(movedVisualIndex(words, 0, "big-word-next"), 8);
  assert.equal(movedVisualIndex(words, 0, "big-word-next", 2), 14);
  assert.equal(movedVisualIndex(words, 0, "big-word-end"), 6);
  assert.equal(movedVisualIndex(words, 0, "big-word-end", 2), 12);
  const atomicAlt = ["image preview", "x", "\u00a0", "next"];
  assert.equal(movedVisualIndex(atomicAlt, 0, "big-word-next"), 3);
  assert.equal(movedVisualIndex(atomicAlt, 0, "big-word-end"), 1);
  assert.equal(movedVisualIndex(words, words.length - 1, "big-word-next"), words.length - 1);
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
