import assert from "node:assert/strict";
import test from "node:test";

import {
  classifySlackMention,
  isRelevantSlackMention,
  relevantUserGroupIds,
  retryAfterMilliseconds,
  userGroupMemberships,
  userGroupUsersMembership,
} from "../plugins/lib/minimal-irc-compatibility";

test("classifies actual Slack user and user-group mentions", () => {
  assert.deepEqual(
    classifySlackMention({
      classes: ["c-link", "c-member_slug"],
      memberId: "U_SELF",
      stringifyId: "U_SELF",
      stringifyType: "mention",
    }),
    { id: "U_SELF", kind: "user" },
  );
  assert.deepEqual(
    classifySlackMention({
      classes: ["c-mrkdwn__user_group--mention"],
      stringifyId: "SONCALL",
      stringifyType: "mention",
      userGroupId: "SONCALL",
    }),
    { id: "SONCALL", kind: "user-group" },
  );
});

test("does not mistake channels or linked-message preview slugs for mentions", () => {
  assert.equal(
    classifySlackMention({
      classes: ["c-mrkdwn__channel", "c-member_slug"],
      stringifyId: "C_INFRA",
      stringifyType: "channel",
    }),
    null,
  );
  assert.equal(
    classifySlackMention({
      classes: ["p-rich_text_slug"],
      stringifyId: "1780000000.000000",
      stringifyType: "replace",
    }),
    null,
  );
  assert.equal(
    classifySlackMention({
      classes: ["c-mrkdwn__user_group"],
      stringifyId: "SREFERENCE",
    }),
    null,
  );
});

test("marks only the current user and groups containing that user as relevant", () => {
  const payload = [
    { id: "S_MEMBER", users: ["U_SELF", "U_OTHER"] },
    { id: "S_OTHER", users: ["U_OTHER"] },
    { id: "S_DISABLED", is_usergroup_disabled: true, users: ["U_SELF"] },
    { date_delete: 1780000000, id: "S_DELETED", users: ["U_SELF"] },
    { id: "S_MALFORMED", users: "U_SELF" },
  ];
  const memberships = userGroupMemberships(payload, "U_SELF");
  const groups = relevantUserGroupIds(payload, "U_SELF");

  assert.deepEqual(
    [...memberships],
    [
      ["S_MEMBER", true],
      ["S_OTHER", false],
      ["S_DISABLED", false],
      ["S_DELETED", false],
    ],
  );
  assert.deepEqual([...groups], ["S_MEMBER"]);
  assert.equal(isRelevantSlackMention({ id: "U_SELF", kind: "user" }, "U_SELF", groups), true);
  assert.equal(isRelevantSlackMention({ id: "U_OTHER", kind: "user" }, "U_SELF", groups), false);
  assert.equal(
    isRelevantSlackMention({ id: "S_MEMBER", kind: "user-group" }, "U_SELF", groups),
    true,
  );
  assert.equal(
    isRelevantSlackMention({ id: "S_OTHER", kind: "user-group" }, "U_SELF", groups),
    false,
  );
});

test("resolves a rendered group from its direct membership response", () => {
  const bulk = userGroupMemberships(
    [{ id: "S_ONCALL", users: ["U_SELF"] }],
    "U_SELF",
  );
  assert.equal(bulk.has("S_INFRA"), false);
  assert.equal(
    userGroupUsersMembership({ ok: true, users: ["U_OTHER", "U_SELF"] }, "U_SELF"),
    true,
  );
  assert.equal(userGroupUsersMembership({ ok: true, users: ["U_OTHER"] }, "U_SELF"), false);
  assert.equal(userGroupUsersMembership({ ok: false, users: ["U_SELF"] }, "U_SELF"), null);
  assert.equal(userGroupUsersMembership({ ok: true, users: "U_SELF" }, "U_SELF"), null);
});

test("parses Slack Retry-After values without shortening the requested delay", () => {
  const now = Date.parse("2026-07-20T10:00:00Z");
  assert.equal(retryAfterMilliseconds("12", now), 12_000);
  assert.equal(
    retryAfterMilliseconds("Mon, 20 Jul 2026 10:00:30 GMT", now),
    30_000,
  );
  assert.equal(retryAfterMilliseconds("invalid", now), null);
  assert.equal(retryAfterMilliseconds(null, now), null);
});
