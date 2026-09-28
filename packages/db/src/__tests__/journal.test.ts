import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const journalPath = join(__dirname, '../../migrations/meta/_journal.json');

interface JournalEntry {
  idx: number;
  when: number;
  tag: string;
}

describe('migrations/meta/_journal.json', () => {
  const journal = JSON.parse(readFileSync(journalPath, 'utf-8')) as { entries: JournalEntry[] };

  it('has a strictly increasing "when" across entries, in array order', () => {
    // drizzle's migrate() gates every entry on a single `lastDbMigration.created_at`
    // (the max `when` already applied) and iterates entries in array order — it never
    // compares an entry against its neighbours. A `when` that collides with, or falls
    // behind, an earlier entry is silently skipped forever once that earlier entry (or
    // anything after it) has been applied. See 0013_onboarding's collision with
    // 0011_identity_link_sync (issue #320): identical `when` meant 0013 never ran, in
    // any environment, while still logging success.
    for (let i = 1; i < journal.entries.length; i++) {
      const prev = journal.entries[i - 1]!;
      const curr = journal.entries[i]!;
      expect(
        curr.when,
        `"${curr.tag}" (when: ${curr.when}) must be greater than "${prev.tag}" (when: ${prev.when})`,
      ).toBeGreaterThan(prev.when);
    }
  });

  it('has no duplicate tags', () => {
    const tags = journal.entries.map((e) => e.tag);
    expect(new Set(tags).size).toBe(tags.length);
  });
});
