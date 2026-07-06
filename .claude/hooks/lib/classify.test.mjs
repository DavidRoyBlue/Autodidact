import { test } from "node:test";
import assert from "node:assert/strict";
import { parseClassification } from "./classify.mjs";

test("parseClassification: well-formed three-line answer", () => {
  assert.deepEqual(parseClassification("12\nFix worker timeout\nUser wants retries on long outlines."),
    { parent: "12", title: "Fix worker timeout", summary: "User wants retries on long outlines." });
});

test("parseClassification: null parent, multi-line summary joined", () => {
  const r = parseClassification("null\nAdd dark mode\nFirst sentence.\nSecond sentence.");
  assert.equal(r.parent, null);
  assert.equal(r.title, "Add dark mode");
  assert.equal(r.summary, "First sentence. Second sentence.");
});

test("parseClassification: garbled or empty answers degrade to nulls", () => {
  assert.deepEqual(parseClassification(""), { parent: null, title: null, summary: null });
  assert.deepEqual(parseClassification(null), { parent: null, title: null, summary: null });
  assert.equal(parseClassification("The answer is 12").parent, null);
  assert.equal(parseClassification("  42  \nTitle").parent, "42");
});

test("parseClassification: title capped at 70, summary at 500", () => {
  const r = parseClassification(`7\n${"t".repeat(100)}\n${"s".repeat(600)}`);
  assert.equal(r.title.length, 70);
  assert.equal(r.summary.length, 500);
});
