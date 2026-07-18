import { test } from "node:test";
import assert from "node:assert/strict";
import * as F from "./files.mjs";

test("isSuperpowersFile: only .md in status folders under docs/superpowers", () => {
  assert.equal(F.isSuperpowersFile("/r/docs/superpowers/specs/to-be-reviewed/a.md"), true);
  assert.equal(F.isSuperpowersFile("/r/docs/superpowers/plans/in-progress/b.md"), true);
  assert.equal(F.isSuperpowersFile("/r/docs/superpowers/plans/_done/c.md"), true);
  assert.equal(F.isSuperpowersFile("/r/docs/architecture/x.md"), false);
  assert.equal(F.isSuperpowersFile("/r/docs/superpowers/specs/a.txt"), false);
  assert.equal(F.isSuperpowersFile("/r/docs/superpowers/specs/README.md"), false);
  assert.equal(F.isSuperpowersFile("/r/docs/superpowers/specs/2026-01-01-x.md"), false);
  assert.equal(F.isSuperpowersFile("/r/docs/superpowers/plans/2026-01-01-x.review.md"), false);
});

test("labelForPath: folder → label per rules.json", () => {
  assert.equal(F.labelForPath("/r/docs/superpowers/specs/to-be-reviewed/a.md"), "ready");
  assert.equal(F.labelForPath("/r/docs/superpowers/plans/in-progress/a.md"), "in-progress");
  assert.equal(F.labelForPath("/r/docs/superpowers/specs/_done/a.md"), "ready");
});

test("isDonePath", () => {
  assert.equal(F.isDonePath("/r/docs/superpowers/specs/_done/a.md"), true);
  assert.equal(F.isDonePath("/r/docs/superpowers/specs/to-be-reviewed/a.md"), false);
});

test("titleFromContent: H1 else basename", () => {
  assert.equal(F.titleFromContent("# My Spec — Title\n\nbody", "x.md"), "My Spec — Title");
  assert.equal(F.titleFromContent("no heading here", "2026-06-24-thing.md"), "2026-06-24-thing");
});

test("bodyFromContent: first prose paragraph, skips headings/metadata/callouts", () => {
  const content = "# Title\n\n**Date:** 2026-06-24\n**Parent:** p.md\n\n> a callout\n\nThe real first paragraph.\n\nSecond.";
  assert.equal(F.bodyFromContent(content, "Title"), "The real first paragraph.");
  assert.equal(F.bodyFromContent("# Only Title", "Only Title"), "Only Title");
  // Bold-opening prose is NOT skipped (only bold metadata fields are)
  assert.equal(
    F.bodyFromContent("# T\n\n**Bold intro** then the rest of the sentence.", "T"),
    "**Bold intro** then the rest of the sentence."
  );
});

test("parentFromContent: filename or null", () => {
  assert.equal(F.parentFromContent("**Parent:** 2026-06-20-foo.md\n"), "2026-06-20-foo.md");
  assert.equal(F.parentFromContent("no parent field"), null);
});
