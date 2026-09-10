import { test } from "node:test";
import assert from "node:assert/strict";
import { labelFromTitle, parseLabelAnswer, pickLabel, kindLabels } from "./pr-label.mjs";

// These run against the real rules.json — they pin the shipped config, not a fixture.

test("labelFromTitle: conventional-commit prefix → label; scope and ! allowed", () => {
  assert.equal(labelFromTitle("feat(mobile): onboarding course"), "feature");
  assert.equal(labelFromTitle("fix: null deref"), "bug");
  assert.equal(labelFromTitle("docs(architecture): audit graph"), "documentation");
  assert.equal(labelFromTitle("refactor!: split module"), "refactor");
  assert.equal(labelFromTitle("ci: parent-close guard"), "chore");
  assert.equal(labelFromTitle("Batch-resolve open issues"), null);
  assert.equal(labelFromTitle("wip: something"), null); // unknown type
  assert.equal(labelFromTitle(""), null);
});

test("parseLabelAnswer: accepts only a kind label, tolerant of punctuation/case", () => {
  assert.equal(parseLabelAnswer("chore"), "chore");
  assert.equal(parseLabelAnswer("  Bug.\n"), "bug");
  assert.equal(parseLabelAnswer("`documentation`"), "documentation");
  assert.equal(parseLabelAnswer("in-progress"), null); // flow label, not a kind
  assert.equal(parseLabelAnswer("I think it is a feature"), null);
  assert.equal(parseLabelAnswer(""), null);
});

test("pickLabel: skips labelled PRs, prefers the title, falls back to the model", () => {
  const calls = [];
  const ask = (prompt) => { calls.push(prompt); return "refactor"; };
  assert.equal(pickLabel({ title: "Anything", body: "", labels: ["in-progress"] }, ask), null);
  assert.equal(pickLabel({ title: "feat: x", body: "", labels: [] }, ask), "feature");
  assert.equal(calls.length, 0); // no model call so far
  assert.equal(pickLabel({ title: "Tidy up services", body: "Moves code around.", labels: [] }, ask), "refactor");
  assert.equal(calls.length, 1);
  for (const k of kindLabels()) assert.ok(calls[0].includes(k));
  assert.equal(pickLabel({ title: "Untyped", body: null, labels: [] }, () => ""), null); // model failure
});
