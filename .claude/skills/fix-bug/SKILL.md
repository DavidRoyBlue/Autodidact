---
name: fix-bug
description: Use when investigating or fixing a bug, regression, crash, or incorrect behavior anywhere in the repo. Triggers on "bug", "broken", "regression", "crash", "throws", "wrong result", "doesn't work anymore". Reproduce before fixing.
---

# Fix bug

## Overview

Reproduce → fix → regression-test, in that order. A fix without a reproduction is a guess; a fix without a regression test will come back.

## When to use

- Any defect report: wrong output, crash, flaky behavior, regression after a change

## When NOT to use

- New features or behavior changes (that's design work, not a bug)
- Failing tests caused by an in-progress change you're already making

## Workflow

1. **Reproduce first.** Prefer a failing test that captures the bug (right runner per `.claude/rules/testing.md`); if a test isn't practical, reproduce manually and record the exact steps/output. Do not touch the fix until you've seen the failure.
2. Locate the cause: graph tools (`semantic_search_nodes` → `query_graph` callers_of → `get_affected_flows`) before file-scanning; read the nearest `CLAUDE.md` for invariants the fix must respect.
3. Fix minimally — the smallest change that makes the reproduction pass. No drive-by refactoring.
4. Keep the reproduction as a regression test. If skipping the test, state why and how you verified the fix manually.
5. Run the affected package's tests (`pnpm --filter <pkg> test`) plus any package the graph flags in the impact radius.
6. If the bug exposed a durable gotcha, record it in the nearest `CLAUDE.md` (compounding rule).

## Definition of done

- [ ] Bug reproduced (failing test or recorded manual repro) **before** the fix was written
- [ ] Regression test added — or an explicit justification for skipping plus manual verification
- [ ] Affected and impacted package tests pass
- [ ] Fix is minimal; no unrelated cleanup
