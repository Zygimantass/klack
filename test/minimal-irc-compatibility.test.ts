import assert from "node:assert/strict";
import test from "node:test";

import {
  classifySlackMention,
  isRelevantSlackMention,
  relevantUserGroupIds,
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
  const groups = relevantUserGroupIds(
    [
      { id: "S_MEMBER", users: ["U_SELF", "U_OTHER"] },
      { id: "S_OTHER", users: ["U_OTHER"] },
      { id: "S_DISABLED", is_usergroup_disabled: true, users: ["U_SELF"] },
      { date_delete: 1780000000, id: "S_DELETED", users: ["U_SELF"] },
      { id: "S_MALFORMED", users: "U_SELF" },
    ],
    "U_SELF",
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
