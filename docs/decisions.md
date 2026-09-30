# Decisions log

Dated, one-line-ish decisions that change what happens next in this repo, with
the reason. Durable architectural choices get an ADR in
`architecture/ADRs/` instead; this log is for operational and sequencing calls
that an ADR would be too heavy for. Newest first.

## 2026-09-29 — Catch-up prod deploy (#320)

Owner (David) answers to the runbook worker's questions; the runbook itself is
[`gcp_infra_setup.md` §9](gcp_infra_setup.md#9-redeploy-after-a-pause--the-2026-10-catch-up-deploy-320).

- **One deploy, only after #321 lands.** Prod stays degraded until the
  AgentPlatform route is on `master`; the first deploy in three months ships a
  working product rather than a green health check with broken course
  generation.
- **Restore the Supabase project now, deploy later.** The project is on the Pro
  plan (no 90-day paused-restore deadline), but restoring now lets the early
  backup and the DB sanity checks happen this week instead of on deploy day.
- **Backup = local `pg_dump` over the session pooler (5432), kept outside every
  repo.** `0014_course_on_platform` drops columns irreversibly; a dump the owner
  holds is the rollback, independent of Supabase's managed backups.
- **Migrate from the laptop (`pnpm migrate:prod`) before promoting.** A
  migration failure then never mixes with a deploy failure, and the CI migrate
  step becomes a verified no-op. Cost: the June images are broken between the
  migration and the new revisions, so 9.4 → 9.7 are one sitting.
- **`terraform plan`/`apply` before promoting.** `main.tf` changed since June
  (#323 dropped `LLM_PROVIDER`/`CHECKPOINTER`; #321 may add secrets); applying
  first means the images roll onto matching env wiring. The expected plan is
  enumerated in §9.3 so anything else is a stop signal.
- **Smoke test = health + migrations only.** Course generation and module chat
  end to end are the first thing to try after the deploy, but their failure is a
  bug to file, not a reason to roll back the deploy.

## 2026-09-29 — Courses are a stack inside the My Courses tab; the app enrolls after generation (#320)

`app/(app)/courses/_layout.tsx` is a `Stack` (list → course → module chat)
under the My Courses tab, with the tab's own header off. Why: the three
routes sat directly under the tab navigator, so they showed up as tabs,
the header showed the route name, and Android BACK from a chat landed on
the Learn tab. A stack gives a back button and pops to the course.

`useCourseGeneration` calls `POST /courses/:id/enroll` when generation
completes, before navigating. Why: `courses.service.createOrReuse` enrolls
the creator only when it reuses an existing course; a new one has no
enrollment and no `module_progress`, so it opened 0/0 with every module
locked. This is a client-side workaround — the server should enroll on
completion so any client gets a usable course (left open under #320).

## 2026-09-29 — Module chat reads the SSE reply whole instead of streaming it (#320)

`useSSE` now POSTs through `apiFetch`, reads the response body once the API
closes it, and replays the `data:` events in order. `@microsoft/fetch-event-source`
is gone from the app.

Why: it never worked on a device. The library registers a `document`
visibility listener and reads `response.body.getReader()`; React Native has
neither, so `send()` threw after the optimistic user bubble and the screen
stayed "streaming" forever — the first walkthrough on a real build showed a
session with zero messages server-side. The API already delivers the whole
reply as a single `token` event (the AgentPlatform teacher returns a complete
answer, not tokens) followed by `complete`, so buffering loses nothing today.
The wire format stays SSE (ADR-011): if the teacher ever streams tokens, the
client needs a streaming fetch (`react-native-fetch-api` + a streams polyfill),
not a new protocol.

Same PR, same cause class (code that only ran in Jest): `uuid` v4 needs
`crypto.getRandomValues`, which RN does not provide — message and toast ids
now come from `expo-crypto`'s `randomUUID()`. The client also treated the
API's `complete` (stream end) as module completion; `module_complete` is the
event that carries that, and `complete` only ends streaming now.

## 2026-09-29 — Mobile dev builds are local WSL gradle builds, not EAS dev clients (#320)

`scripts/run-mobile.sh` now builds the APK here (expo prebuild + gradle, one
ABI, pinned to six cores, no daemon) and installs it on the emulator — the
same recipe as Accountability's `scripts/run-mobile.sh`. The Metro/dev-client
launch path is gone; the EAS `development` profile and `expo-dev-client` stay
for cloud dev builds (`apps/mobile/AGENTS.md` "Build & release").

Why: the EAS dev client expired after two weeks and nobody could run the app
for a month; a local build is reproducible on this machine with no account,
no expiry, and the same script the other mobile project already runs. A
release build bundles the JavaScript, so checking a change means rebuilding
(~10 min), not hot-reloading — accepted, because a debug APK cannot prove
anything without Metro and the Metro path had its own 10.0.2.2 / cache
pitfalls. `pnpm mobile` (Metro) stays for readable stacks on a debug APK.

Consequences: `babel-preset-expo`, `@babel/plugin-transform-react-jsx` and
`react-native-reanimated` became declared dependencies of `apps/mobile` — the
release bundle resolves babel presets from `apps/mobile`, where pnpm's
isolated layout links only direct dependencies (the monorepo keeps
`shamefully-hoist=false`; Accountability chose `node-linker=hoisted` instead,
which would touch every service here). NativeWind is pinned to `~4.1` with
`react-native-css-interop ~0.1`: 4.2 / 0.2 hard-requires
`react-native-worklets/plugin`, i.e. Reanimated 4 and React Native ≥ 0.78,
which Expo SDK 52 (RN 0.76) does not have — the `^4.2.5` range only ever
bundled because pnpm auto-installed Reanimated 4 as an unlinked peer. The
app uses no 4.2-only API (`useColorScheme`, `nativewind/metro|preset|babel`).
