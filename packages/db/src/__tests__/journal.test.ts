import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const journalPath = join(__dirname, '../../migrations/meta/_journal.json');

interface JournalEntry {
  when: number;
  tag: string;
}

describe('migrations/meta/_journal.json', () => {
  const journal = JSON.parse(readFileSync(journalPath, 'utf-8')) as { entries: JournalEntry[] };

  it('has a strictly increasing "when" across entries, in array order', () => {
    // drizzle gates each entry on the max already-applied `when` (#320) — a non-increasing
    // entry is silently skipped forever.
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
