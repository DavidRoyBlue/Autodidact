import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as L from "./issues.mjs";

test("isSuperpowersFile: only .md under docs/superpowers", () => {
  assert.equal(L.isSuperpowersFile("/r/docs/superpowers/specs/to-be-reviewed/a.md"), true);
  assert.equal(L.isSuperpowersFile("/r/docs/superpowers/plans/in-progress/b.md"), true);
  assert.equal(L.isSuperpowersFile("/r/docs/superpowers/specs/plan-in-action/a.md"), true);
  assert.equal(L.isSuperpowersFile("/r/docs/architecture/x.md"), false);
  assert.equal(L.isSuperpowersFile("/r/docs/superpowers/specs/a.txt"), false);
  assert.equal(L.isSuperpowersFile("/r/docs/superpowers/specs/README.md"), false);
  assert.equal(L.isSuperpowersFile("/r/docs/superpowers/specs/2026-01-01-x.md"), false);
  assert.equal(L.isSuperpowersFile("/r/docs/superpowers/plans/2026-01-01-x.review.md"), false);
});

test("labelForPath: folder → label", () => {
  assert.equal(L.labelForPath("/r/docs/superpowers/specs/to-be-reviewed/a.md"), "ready");
  assert.equal(L.labelForPath("/r/docs/superpowers/plans/in-progress/a.md"), "in-progress");
  assert.equal(L.labelForPath("/r/docs/superpowers/specs/plan-in-action/a.md"), "in-progress");
  assert.equal(L.labelForPath("/r/docs/superpowers/specs/_done/a.md"), "ready");
});

test("isDonePath", () => {
  assert.equal(L.isDonePath("/r/docs/superpowers/specs/_done/a.md"), true);
  assert.equal(L.isDonePath("/r/docs/superpowers/specs/to-be-reviewed/a.md"), false);
});

test("titleFromContent: H1 else basename", () => {
  assert.equal(L.titleFromContent("# My Spec — Title\n\nbody", "x.md"), "My Spec — Title");
  assert.equal(L.titleFromContent("no heading here", "2026-06-24-thing.md"), "2026-06-24-thing");
});

test("bodyFromContent: first prose paragraph, skips headings/metadata/callouts", () => {
  const content = "# Title\n\n**Date:** 2026-06-24\n**Parent:** p.md\n\n> a callout\n\nThe real first paragraph.\n\nSecond.";
  assert.equal(L.bodyFromContent(content, "Title"), "The real first paragraph.");
  assert.equal(L.bodyFromContent("# Only Title", "Only Title"), "Only Title");
  // Verify bold-opening prose is NOT skipped (only bold metadata fields are)
  assert.equal(
    L.bodyFromContent("# T\n\n**Bold intro** then the rest of the sentence.", "T"),
    "**Bold intro** then the rest of the sentence."
  );
});

test("parentFromContent: filename or null", () => {
  assert.equal(L.parentFromContent("**Parent:** 2026-06-20-foo.md\n"), "2026-06-20-foo.md");
  assert.equal(L.parentFromContent("no parent field"), null);
});

test("readMap returns {} when absent; writeMap persists sorted, readMap reads it back", () => {
  const dir = mkdtempSync(join(tmpdir(), "imap-"));
  try {
    assert.deepEqual(L.readMap(dir), {});
    L.writeMap(dir, { "b.md": { issue: 2, parent: null }, "a.md": { issue: 1, parent: "b.md" } });
    const back = L.readMap(dir);
    assert.deepEqual(Object.keys(back), ["a.md", "b.md"]); // sorted
    assert.deepEqual(back["a.md"], { issue: 1, parent: "b.md" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
