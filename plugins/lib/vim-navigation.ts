export type Direction = "next" | "previous";

export type VimCommand =
  | "activate"
  | "bottom"
  | "count"
  | "half-next"
  | "half-previous"
  | "insert"
  | "left"
  | "next"
  | "page-next"
  | "page-previous"
  | "previous"
  | "search"
  | "unwind";

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

  if (event.shiftKey && event.key !== "{" && event.key !== "}" && event.key !== "G") return null;

  let command: VimCommand | null = null;
  if (/^\d$/.test(event.key)) command = "count";
  else if (event.key === "h") command = "left";
  else if (event.key === "j") command = "next";
  else if (event.key === "k") command = "previous";
  else if (event.key === "}") command = "page-next";
  else if (event.key === "{") command = "page-previous";
  else if (event.key === "/") command = "search";
  else if (event.key === "G") command = "bottom";
  else if (event.key === "i") command = "insert";
  else if (event.key === "l" || event.key === "Enter") command = "activate";
  else if (event.key === "Escape") command = "unwind";

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

export function threadTimestampFromUrl(value: string, fallback: string): string {
  try {
    const timestamp = new URL(value, "https://slack.com").searchParams.get("thread_ts");
    return timestamp && /^\d+(?:\.\d+)?$/.test(timestamp) ? timestamp : fallback;
  } catch {
    return fallback;
  }
}
