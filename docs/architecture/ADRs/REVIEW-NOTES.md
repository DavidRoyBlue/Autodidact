# Review notes — ADR rebuild (2026-05-10)

This file is a one-time hand-off note for the user's Monday review. It is
not a permanent doc; delete after triage.

## What was done

- The ADR system was reframed from "one ADR per dependency" to "one ADR per architectural decision area." Each ADR poses a problem, surveys ≥3 options neutrally, then concludes with a choice and (where warranted) a 🚩 reconsideration flag.
- Template (`ADR-000-ADRtemplate.md`) was rewritten to match: Status / Context / Non-goals / Decision Drivers / Options Considered / Decision / Rationale / Consequences.
- ADR governance (`docs/architecture/ADRs/CLAUDE.md`) was rewritten to encode the first-principles mandate, mandatory research before drafting, and reconsideration-flag conventions.
- Folder restructured to mirror the repo: `apps/`, `services/`, `packages/`, `infra/`, `cross-cutting/`. Old 12 ADRs moved to `_superseded/` with a provenance README.
- Stale `decisions/` references in `docs/CLAUDE.md`, `docs/architecture/CLAUDE.md`, `docs/superpowers/README.md` fixed to `ADRs/`.
- 22 ADRs drafted. Every package, service, and infra subsystem now has Key Decisions blocks linking to the relevant ADRs. `docs/stack.md` rewritten as a thin index pointing at ADRs.

## ADRs at a glance

| # | Decision area | Choice | Status |
|---|---|---|---|
| 001 | Monorepo & build orchestration | pnpm + Turbo | Accepted |
| 002 | Database platform | Supabase Postgres | Accepted |
| 003 | Mobile application platform | Expo + React Native | Accepted |
| 004 | REST API framework | NestJS | Accepted |
| 005 | AI agent server framework | Fastify | Accepted |
| 006 | AI orchestration framework | LangGraph | Accepted |
| 007 | Background job queue | BullMQ + Redis | 🚩 → Cloud Tasks |
| 008 | ORM / data access layer | Drizzle | Accepted |
| 009 | External vendor abstraction | Custom interfaces + factories | Accepted |
| 010 | Vector search strategy | pgvector | Accepted |
| 011 | Real-time streaming transport | SSE | Accepted |
| 012 | Cloud hosting platform | GCP Cloud Run | Accepted |
| 013 | Mobile UI system | Tamagui | 🚩 → NativeWind |
| 014 | Mobile navigation | Expo Router | Accepted |
| 015 | Mobile state management | TanStack Query + Zustand | Accepted |
| 016 | Runtime schema validation | Zod | Accepted |
| 017 | Observability stack | pino + OpenTelemetry | Accepted |
| 018 | Testing strategy | Vitest + Testcontainers | Accepted |
| 019 | Code quality tooling | ESLint + Prettier | Accepted |
| 020 | Authentication strategy | Supabase Auth | 🚩 → Better Auth |
| 021 | Infrastructure as code | Terraform | Accepted |
| 022 | CI/CD platform | GitHub Actions | Accepted |

## 🚩 Open reconsiderations — start your review here

These are the ADRs whose first-principles analysis concluded that a
*different* tool would be a better fit. Each ADR includes the migration
trigger condition.

> Resolved 2026-06-11: ADR-007 (background job queue) — its flag fired and the
> migration to GCP Cloud Tasks was executed in
> [ADR-027](./services/worker/ADR-027-background-job-queue-cloud-tasks.md).

1. **[ADR-013 — Mobile UI system](./apps/mobile/ADR-013-mobile-ui-system.md)** — current: Tamagui (`2.0.0-rc.41`). Better fit: NativeWind (lighter, more idiomatic for our RN-only mobile app; Tamagui's compile-time cross-platform win doesn't pay off without a web target). Trigger: planned UI refresh, sustained Tamagui RC churn, or measurable bundle-weight impact on launch time.
2. **[ADR-020 — Authentication strategy](./cross-cutting/ADR-020-authentication-strategy.md)** — current: Supabase Auth (bundled with [ADR-002](./cross-cutting/ADR-002-database-platform.md)). Better fit: Better Auth (TS-native, Drizzle-integrated, no vendor lock-in, free at scale). Trigger: Supabase Auth incident >2h, MAU costs >$200/mo, custom session feature need, or a planned auth refresh.

## Things I want you to examine first

In rough priority:

1. **The 🚩 flags above.** Are any of these flags wrong (i.e., should the current choice's rationale be strong enough to remove the flag)? Or are any of them too soft (i.e., should we promote them to "Proposed: migrate")? My judgement is captured in each ADR's Rationale section — push back if you disagree.
2. **ADR-002 + ADR-020 split.** Old ADR-002 bundled DB and Auth. I split them because the analyses are independent and the bundle is a real architectural choice in itself. The two ADRs are tightly cross-linked. Confirm the split is the right shape.
3. **ADR-006 (LangGraph).** Mastra is the strongest greenfield TypeScript challenger in 2026. I argued Mastra's biggest wins (semantic memory, RAG) are features we don't use, so LangGraph remains first-principles for *our* case. Push back if you read this as me being too kind to the incumbent.
4. **ADR-008 (Drizzle) and ADR-016 (Zod).** Both are defensible as-is, but the field has moved (Prisma 7's TS/WASM engine; Valibot's bundle-size win for shipped clients). I argued neither alternative wins for our context. Worth a sanity check.
5. **ADR-005 vs ADR-004.** Two services, two frameworks (Fastify on agent, NestJS on api). I argued the services have different shapes that justify the split. Worth checking that you agree the per-service ergonomics outweigh the consistency cost.

## Things I'm uncertain about

- **`packages/providers` factory inconsistency** — `EMBEDDING_PROVIDER` is documented but `createEmbeddingProvider` doesn't read it (it always returns OpenAI because that's the only impl). Surfaced in ADR-009's Cons. Small fix-it ticket; not architectural, but worth a follow-up.
- **Whether ADR-022 (CI/CD) deserves its own ADR.** It's a thin one — GitHub Actions on a GitHub repo is the obvious choice. I included it for completeness ("every dependency has a reason for being there"). If you'd rather merge it into ADR-012 or skip it, fine.
- **Tamagui on RC.** Given the v2 RC saga, ADR-013 is the most urgent of the 🚩 flags in my judgement. Worth a separate conversation about whether to do a UI refresh + NativeWind migration as a single planned work item.
- **The "Mastra in 2027?" question.** ADR-006 doesn't flag, but the agent-orchestration space is moving fast. Worth re-reading in 6 months.

## Notes from self-review

After drafting, I reread each ADR with a "hostile reviewer" lens — looking
for sales-pitch language, generic Pros/Cons, drivers that wouldn't help
*us* specifically, and unsupported claims. The pass found:

- All 22 ADRs have the 8 mandatory top-level sections.
- Option counts: 3 (mobile navigation), 4 (code quality), 5–7 elsewhere.
  Mobile navigation is light because the field is genuinely small (Expo
  Router, React Navigation, Solito); I didn't pad with implausible options.
- Reconsideration flags are consistent between Status header line and
  Rationale block in all three flagged ADRs.
- Cross-references between ADRs all resolve (verified by walking each
  link).
- No instance of "great DX" / "amazing community" / "industry standard"
  used as a Pro without qualification — I tried to keep claims specific.
- A few benchmark numbers are cited from the Sources (in-line below);
  treat them as approximate.

## Sources I leaned on for current-year facts

- LangGraph vs Mastra vs Vercel AI SDK 2026 comparison (Speakeasy, Mastra docs)
- Prisma vs Drizzle vs Kysely 2026 download stats and bundle sizes (PkgPulse, Prisma docs)
- Zod vs Valibot vs ArkType 2026 benchmarks (DEV / PkgPulse)
- pgvector vs Pinecone vs Qdrant 2026 perf and pricing (4xxi, Vecstore, Supabase benchmarks)
- BullMQ vs Inngest vs Trigger.dev 2026 comparison (StarterPick)
- Tamagui vs NativeWind vs Gluestack 2026 (Medium, Astrolytics)
- Supabase / Neon / Convex / Firebase pricing comparisons (BuildMVPFast, makerkit)
- Better Auth migration story (PkgPulse, daily.dev)
- Biome vs ESLint+Prettier 2026 (PkgPulse, sph.sh)

When numbers appear in ADRs they were drawn from these sources; treat as
approximate. When uncertain I labeled it explicitly rather than guess.

## Next steps for review

1. Read the three 🚩 flagged ADRs first.
2. Read the index in `README.md` and `stack.md` to confirm the structure makes sense.
3. Spot-check 2–3 ADRs from your "Things I want you to examine first" list.
4. Either accept the set, ask for revisions, or move ADRs to `Proposed: migrate` for the flagged ones.
5. Once reviewed, this `REVIEW-NOTES.md` file should be deleted.
