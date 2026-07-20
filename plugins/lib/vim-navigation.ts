export type Direction = "next" | "previous";

export type VimCommand =
  | "activate"
  | "bottom"
  | "center-prefix"
  | "count"
  | "half-next"
  | "half-previous"
  | "history-back"
  | "history-forward"
  | "insert"
  | "left"
  | "next"
  | "page-next"
  | "page-previous"
  | "previous"
  | "react"
  | "search"
  | "top-prefix"
  | "unwind"
  | "visual"
  | "yank";

export type VisualMotion =
  | "big-word-end"
  | "big-word-next"
  | "character-next"
  | "character-previous"
  | "line-end"
  | "line-start"
  | "swap-ends"
  | "word-end"
  | "word-next"
  | "word-previous";

export type VimKeyInput = {
  altKey?: boolean;
  ctrlKey?: boolean;
  defaultPrevented?: boolean;
  isComposing?: boolean;
  key: string;
  metaKey?: boolean;
  repeat?: boolean;
  shiftKey?: boolean;
};

export type VimKeyContext = {
  blocked?: boolean;
  nativeTarget?: boolean;
};

export type GlobalSearchTransitionInput = {
  awaitingResults: boolean;
  hasEditor: boolean;
  hasView: boolean;
  kind: "global" | "sidebar";
  phase: "open" | "results" | "typing";
  restoring: boolean;
};

export function shouldEnterGlobalSearchResults(
  input: GlobalSearchTransitionInput,
): boolean {
  return (
    input.kind === "global" &&
    input.phase === "typing" &&
    input.awaitingResults &&
    !input.restoring &&
    !input.hasEditor &&
    input.hasView
  );
}

export function keyCommand(
  event: VimKeyInput,
  context: VimKeyContext = {},
): VimCommand | null {
  if (
    context.blocked ||
    context.nativeTarget ||
    event.defaultPrevented ||
    event.isComposing ||
    event.altKey ||
    event.metaKey
  ) {
    return null;
  }

  if (event.ctrlKey) {
    if (event.shiftKey) return null;
    const command =
      event.key.toLocaleLowerCase() === "d"
        ? "half-next"
        : event.key.toLocaleLowerCase() === "u"
          ? "half-previous"
          : null;
    return command;
  }

  if (
    event.shiftKey &&
    event.key !== "{" &&
    event.key !== "}" &&
    event.key !== ":" &&
    event.key !== "/" &&
    event.key !== "G" &&
    event.key !== "H" &&
    event.key !== "L"
  ) {
    return null;
  }

  let command: VimCommand | null = null;
  if (/^\d$/.test(event.key)) command = "count";
  else if (event.key === "h") command = "left";
  else if (event.key === "j") command = "next";
  else if (event.key === "k") command = "previous";
  else if (event.key === "}") command = "page-next";
  else if (event.key === "{") command = "page-previous";
  else if (event.key === "/") command = "search";
  else if (event.key === ":") command = "react";
  else if (event.key === "g") command = "top-prefix";
  else if (event.key === "z") command = "center-prefix";
  else if (event.key === "G") command = "bottom";
  else if (event.key === "H") command = "history-back";
  else if (event.key === "L") command = "history-forward";
  else if (event.key === "i") command = "insert";
  else if (event.key === "l" || event.key === "Enter") command = "activate";
  else if (event.key === "Escape") command = "unwind";
  else if (event.key === "v") command = "visual";
  else if (event.key === "y") command = "yank";

  if (
    event.repeat &&
    command !== "next" &&
    command !== "previous" &&
    command !== "page-next" &&
    command !== "page-previous"
  ) {
    return null;
  }
  return command;
}

export function visualMotionCommand(event: VimKeyInput): VisualMotion | null {
  if (
    event.defaultPrevented ||
    event.isComposing ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey
  ) {
    return null;
  }
  if (event.shiftKey && event.key !== "$" && event.key !== "E" && event.key !== "W") {
    return null;
  }

  if (event.key === "h") return "character-previous";
  if (event.key === "l") return "character-next";
  if (event.key === "w") return "word-next";
  if (event.key === "W") return "big-word-next";
  if (event.key === "b") return "word-previous";
  if (event.key === "e") return "word-end";
  if (event.key === "E") return "big-word-end";
  if (event.key === "0") return "line-start";
  if (event.key === "$") return "line-end";
  if (event.key === "o" && !event.repeat) return "swap-ends";
  return null;
}

export function appendCountDigit(prefix: string, digit: string, maxDigits = 3): string | null {
  if (!/^\d$/.test(digit) || (prefix.length === 0 && digit === "0")) return null;
  return `${prefix}${digit}`.slice(0, Math.max(1, maxDigits));
}

export function countValue(prefix: string): number {
  const count = Number.parseInt(prefix, 10);
  return Number.isFinite(count) && count > 0 ? count : 1;
}

export function shouldSuppressNormalModeKey(event: VimKeyInput): boolean {
  return (
    !event.altKey &&
    !event.ctrlKey &&
    !event.defaultPrevented &&
    !event.isComposing &&
    !event.metaKey &&
    (event.key.length === 1 || event.key === "Backspace" || event.key === "Delete")
  );
}

export function movedIndex(
  length: number,
  current: number,
  direction: Direction,
  amount = 1,
): number {
  if (length <= 0) return -1;
  if (current < 0 || current >= length) return direction === "next" ? 0 : length - 1;
  const distance = Number.isFinite(amount) ? Math.max(1, Math.trunc(amount)) : 1;
  return direction === "next"
    ? Math.min(current + distance, length - 1)
    : Math.max(current - distance, 0);
}

export function wrappedIndex(
  length: number,
  current: number,
  direction: Direction,
  amount = 1,
): number {
  if (length <= 0) return -1;
  const start = Math.min(Math.max(current, 0), length - 1);
  const distance = Number.isFinite(amount) ? Math.max(1, Math.trunc(amount)) : 1;
  const delta = direction === "next" ? distance : -distance;
  return ((start + delta) % length + length) % length;
}

function isWordGrapheme(value: string): boolean {
  return /[\p{L}\p{N}_]/u.test(value);
}

function isBlankGrapheme(value: string): boolean {
  return /^\s+$/u.test(value);
}

export function movedVisualIndex(
  graphemes: readonly string[],
  current: number,
  motion: Exclude<VisualMotion, "swap-ends">,
  amount = 1,
): number {
  if (graphemes.length === 0) return -1;
  let index = Math.min(Math.max(current, 0), graphemes.length - 1);
  const distance = Number.isFinite(amount) ? Math.max(1, Math.trunc(amount)) : 1;

  if (motion === "character-next") return Math.min(index + distance, graphemes.length - 1);
  if (motion === "character-previous") return Math.max(index - distance, 0);
  if (motion === "line-start") {
    while (index > 0 && graphemes[index - 1] !== "\n") index -= 1;
    return index;
  }
  if (motion === "line-end") {
    while (index < graphemes.length - 1 && graphemes[index + 1] !== "\n") index += 1;
    return index;
  }

  for (let step = 0; step < distance; step += 1) {
    if (motion === "big-word-next") {
      if (!isBlankGrapheme(graphemes[index])) {
        while (index < graphemes.length - 1 && !isBlankGrapheme(graphemes[index])) {
          index += 1;
        }
      }
      while (index < graphemes.length - 1 && isBlankGrapheme(graphemes[index])) index += 1;
      continue;
    }

    if (motion === "big-word-end") {
      const atWordEnd =
        !isBlankGrapheme(graphemes[index]) &&
        (index === graphemes.length - 1 || isBlankGrapheme(graphemes[index + 1]));
      if (atWordEnd && index < graphemes.length - 1) index += 1;
      while (index < graphemes.length - 1 && isBlankGrapheme(graphemes[index])) index += 1;
      while (index < graphemes.length - 1 && !isBlankGrapheme(graphemes[index + 1])) {
        index += 1;
      }
      continue;
    }

    if (motion === "word-previous") {
      index = Math.max(0, index - 1);
      while (index > 0 && !isWordGrapheme(graphemes[index])) index -= 1;
      while (index > 0 && isWordGrapheme(graphemes[index - 1])) index -= 1;
      continue;
    }

    if (motion === "word-next") {
      if (isWordGrapheme(graphemes[index])) {
        while (index < graphemes.length - 1 && isWordGrapheme(graphemes[index])) index += 1;
      }
      while (index < graphemes.length - 1 && !isWordGrapheme(graphemes[index])) index += 1;
      continue;
    }

    const atWordEnd =
      isWordGrapheme(graphemes[index]) &&
      (index === graphemes.length - 1 || !isWordGrapheme(graphemes[index + 1]));
    if (atWordEnd && index < graphemes.length - 1) index += 1;
    if (!isWordGrapheme(graphemes[index])) {
      while (index < graphemes.length - 1 && !isWordGrapheme(graphemes[index])) index += 1;
    }
    while (index < graphemes.length - 1 && isWordGrapheme(graphemes[index + 1])) index += 1;
  }
  return index;
}

export function threadTimestampFromUrl(value: string, fallback: string): string {
  try {
    const timestamp = new URL(value, "https://slack.com").searchParams.get("thread_ts");
    return timestamp && /^\d+(?:\.\d+)?$/.test(timestamp) ? timestamp : fallback;
  } catch {
    return fallback;
  }
}
