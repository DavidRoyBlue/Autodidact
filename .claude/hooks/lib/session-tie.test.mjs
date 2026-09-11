import { test } from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { randomUUID } from "node:crypto";
import * as T from "./session-tie.mjs";

test("extractIssueRef: #N, issue N, issue #N, GitHub URLs", () => {
  assert.equal(T.extractIssueRef("fix the bug in #57 please"), 57);
  assert.equal(T.extractIssueRef("continue work on issue 42"), 42);
  assert.equal(T.extractIssueRef("Issue #7 is still broken"), 7);
  assert.equal(T.extractIssueRef("see https://github.com/o/r/issues/123 for context"), 123);
  assert.equal(T.extractIssueRef("no reference here"), null);
  assert.equal(T.extractIssueRef("there are 57 issues"), null);
});

test("isOpenIssue: open issue yes; PR, closed issue and unknown number no", () => {
  const stub = (payload) => () => JSON.stringify(payload);
  assert.equal(T.isOpenIssue(57, stub({ state: "open", isPr: false })), true);
  assert.equal(T.isOpenIssue(258, stub({ state: "open", isPr: true })), false); // a PR — never label it
  assert.equal(T.isOpenIssue(12, stub({ state: "closed", isPr: false })), false);
  assert.equal(T.isOpenIssue(999, () => { throw new Error("gh: Not Found (HTTP 404)"); }), false);
});

test("isOpenIssue: asks the issues endpoint for the referenced number", () => {
  let call;
  T.isOpenIssue(57, (...a) => { call = a; return '{"state":"open","isPr":false}'; });
  assert.deepEqual(call[0], "gh");
  assert.ok(call[1].includes("repos/{owner}/{repo}/issues/57"));
});

test("isSubstantivePrompt: skips slash commands and trivial prompts", () => {
  assert.equal(T.isSubstantivePrompt("/clear"), false);
  assert.equal(T.isSubstantivePrompt("hi"), false);
  assert.equal(T.isSubstantivePrompt("  "), false);
  assert.equal(T.isSubstantivePrompt("refactor the course generation worker task"), true);
});

test("isSubstantivePrompt: rejects manager, CI context, and harness-injected prompts", () => {
  assert.equal(T.isSubstantivePrompt("[manager pm:Autodidact · project_manager · mode=patrol]\n\nPatrol the sessions."), false);
  assert.equal(T.isSubstantivePrompt("REPO: DavidRoyBlue/Autodidact\n\nPerform weekly repository maintenance."), false);
  assert.equal(T.isSubstantivePrompt("<task-notification>agent abc finished</task-notification>"), false);
  assert.equal(T.isSubstantivePrompt("null"), false);
  assert.equal(T.isSubstantivePrompt("You were dispatched by pm:Autodidact. Fix the login bug in #57."), true);
});

test("isScriptedSession: headless/SDK entrypoints are scripts, not people", () => {
  assert.equal(T.isScriptedSession({ CLAUDE_CODE_ENTRYPOINT: "sdk-cli" }), true);
  assert.equal(T.isScriptedSession({ CLAUDE_CODE_ENTRYPOINT: "sdk-ts" }), true);
  assert.equal(T.isScriptedSession({ CLAUDE_CODE_ENTRYPOINT: "cli" }), false);
  assert.equal(T.isScriptedSession({}), false);
});

test("titleFromPrompt: first line, collapsed, capped at 70", () => {
  assert.equal(T.titleFromPrompt("\n\nFix   the\tlogin bug\nmore detail"), "Fix the login bug");
  assert.equal(T.titleFromPrompt("x".repeat(100)).length, 70);
});

test("tie read/write roundtrip; unknown session reads null", () => {
  const id = randomUUID();
  assert.equal(T.readTie(id), null);
  assert.equal(T.readTie(""), null);
  T.writeTie(id, { issue: 99 });
  assert.deepEqual(T.readTie(id), { issue: 99 });
  rmSync(T.tiePath(id));
});

test("sweepStaleTies removes only entries older than the TTL", () => {
  const oldId = randomUUID(), newId = randomUUID();
  T.writeTie(oldId, { issue: 1 });
  T.writeTie(newId, { issue: 2 });
  // Pretend "now" is 8 days ahead: the old tie ages out, the new one written at
  // the same time would too — so re-touch newId by checking against real now first.
  T.sweepStaleTies(Date.now() + 8 * 24 * 60 * 60 * 1000);
  assert.equal(T.readTie(oldId), null);
  T.writeTie(newId, { issue: 2 });
  T.sweepStaleTies();
  assert.deepEqual(T.readTie(newId), { issue: 2 });
  rmSync(T.tiePath(newId));
});
