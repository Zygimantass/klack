export type SlackMention = {
  id: string;
  kind: "user" | "user-group";
};

export type SlackMentionAttributes = {
  classes: readonly string[];
  memberId?: string | null;
  stringifyId?: string | null;
  stringifyType?: string | null;
  userGroupId?: string | null;
};

type SlackUserGroupUsersResponse = {
  ok?: unknown;
  users?: unknown;
};

type SlackUserGroup = {
  date_delete?: unknown;
  id?: unknown;
  is_usergroup_disabled?: unknown;
  users?: unknown;
};

function nonEmptyString(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized || null;
}

export function classifySlackMention(attributes: SlackMentionAttributes): SlackMention | null {
  const classes = new Set(attributes.classes);
  const stringifyType = nonEmptyString(attributes.stringifyType);

  const isUserGroupMention =
    classes.has("c-mrkdwn__user_group--mention") ||
    (classes.has("c-mrkdwn__user_group") && stringifyType === "mention") ||
    (Boolean(nonEmptyString(attributes.userGroupId)) && stringifyType === "mention");
  if (isUserGroupMention) {
    const id = nonEmptyString(attributes.userGroupId) || nonEmptyString(attributes.stringifyId);
    return id ? { id, kind: "user-group" } : null;
  }

  const isUserMention =
    classes.has("c-mrkdwn__mention") ||
    (classes.has("c-member_slug") && stringifyType === "mention") ||
    (Boolean(nonEmptyString(attributes.memberId)) && stringifyType === "mention");
  if (!isUserMention) return null;

  const id = nonEmptyString(attributes.memberId) || nonEmptyString(attributes.stringifyId);
  return id ? { id, kind: "user" } : null;
}

export function userGroupMemberships(
  value: unknown,
  currentUserId: string,
): Map<string, boolean> {
  const result = new Map<string, boolean>();
  if (!Array.isArray(value) || !currentUserId) return result;

  for (const candidate of value as SlackUserGroup[]) {
    if (!candidate || typeof candidate !== "object") continue;
    if (typeof candidate.id !== "string") continue;
    const deleted =
      (typeof candidate.date_delete === "number" && candidate.date_delete !== 0) ||
      (typeof candidate.date_delete === "string" &&
        candidate.date_delete !== "" &&
        candidate.date_delete !== "0");
    if (candidate.is_usergroup_disabled === true || deleted) {
      result.set(candidate.id, false);
      continue;
    }
    if (!Array.isArray(candidate.users)) continue;
    result.set(candidate.id, candidate.users.includes(currentUserId));
  }
  return result;
}

export function relevantUserGroupIds(value: unknown, currentUserId: string): Set<string> {
  return new Set(
    Array.from(userGroupMemberships(value, currentUserId))
      .filter(([, member]) => member)
      .map(([id]) => id),
  );
}

export function userGroupUsersMembership(
  value: unknown,
  currentUserId: string,
): boolean | null {
  if (!value || typeof value !== "object" || !currentUserId) return null;
  const response = value as SlackUserGroupUsersResponse;
  if (response.ok !== true || !Array.isArray(response.users)) return null;
  return response.users.includes(currentUserId);
}

export function retryAfterMilliseconds(
  value: string | null,
  now = Date.now(),
): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1_000);

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : Math.max(0, timestamp - now);
}

export function isRelevantSlackMention(
  mention: SlackMention | null,
  currentUserId: string,
  relevantGroupIds: ReadonlySet<string>,
): boolean {
  if (!mention || !currentUserId) return false;
  return mention.kind === "user"
    ? mention.id === currentUserId
    : relevantGroupIds.has(mention.id);
}
