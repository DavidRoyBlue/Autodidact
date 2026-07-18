import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as M from "./map.mjs";

test("readMap returns {} when absent; writeMap persists sorted, readMap reads it back", () => {
  const dir = mkdtempSync(join(tmpdir(), "imap-"));
  try {
    assert.deepEqual(M.readMap(dir), {});
    M.writeMap(dir, { "b.md": { issue: 2, parent: null }, "a.md": { issue: 1, parent: "b.md" } });
    const back = M.readMap(dir);
    assert.deepEqual(Object.keys(back), ["a.md", "b.md"]); // sorted
    assert.deepEqual(back["a.md"], { issue: 1, parent: "b.md" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
