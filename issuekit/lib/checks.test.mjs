import { test } from "node:test";
import assert from "node:assert/strict";
import { boardTarget, statusRank, shouldAdvance } from "./checks.mjs";

// These run against the real rules.json — they pin the shipped config, not a fixture.

test("boardTarget: most-advanced flow label wins; non-flow labels ignored", () => {
  assert.equal(boardTarget([]), null);
  assert.equal(boardTarget(["bug", "documentation"]), null);
  assert.equal(boardTarget(["ready"]), "Ready");
  assert.equal(boardTarget(["in-progress"]), "In progress");
  assert.equal(boardTarget(["ready", "in-review"]), "In review");
  assert.equal(boardTarget(["in-review", "in-progress", "ready"]), "In review");
});

test("statusRank follows rules.board.statusOrder", () => {
  assert.equal(statusRank("Ready"), 1);
  assert.equal(statusRank("In progress"), 2);
  assert.equal(statusRank("In review"), 3);
  assert.equal(statusRank("Done"), 4);
  assert.equal(statusRank("Backlog"), 0); // unknown
});

test("shouldAdvance: forward-only, never off Done", () => {
  assert.equal(shouldAdvance(null, "Ready"), true);          // not on board yet
  assert.equal(shouldAdvance("Ready", "In review"), true);   // forward
  assert.equal(shouldAdvance("In review", "In progress"), false); // never backward
  assert.equal(shouldAdvance("In progress", "In progress"), false); // already there
  assert.equal(shouldAdvance("Done", "In review"), false);   // never off Done
  assert.equal(shouldAdvance("In progress", null), false);   // no flow label
});
