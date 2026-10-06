# Implementations

The last 20 merged PRs, newest first. Rewritten by the `implementations` workflow on every merge; never edited by hand or by a PR.

- 2026-10-06 #508 implementations workflow: docs/implementations.md is written on every merge
- 2026-10-02 #500 Deploys through Automation's release flow: prod fast-forwarded by app-release promote, the standard deploy stub
- 2026-10-01 #502 CI: the review tier — hosted CI on every push, the reviewer App gates every merge
- 2026-10-01 #501 autoland: the standard listener, as the template in Automation has it
- 2026-09-30 #446 mobile docs: stop describing Expo Go, point at run-mobile.sh (#445)
- 2026-09-30 #438 Production route to AgentPlatform: bearer key per service, worker run timeout (ADR-032)
- 2026-09-30 #429 docs(prod): PRODUCTION.md truthful about stale prod; audit leftovers (#320)
- 2026-09-30 #449 mobile: Google sign-in verified on device; guest Profile scrolls; buttons stop clipping (#320)
- 2026-09-30 #377 mobile: local APK build, module chat works on a device, UI walkthrough (#320)
- 2026-09-29 #399 Course generation runs on AgentPlatform's course-creator-lean workflow
- 2026-09-29 #385 docs(prod): catch-up deploy runbook + owner checklist (#320)
- 2026-09-28 #326 fix(db): apply the skipped 0013_onboarding migration; log unhandled 500s
- 2026-09-28 #323 infra: drop dead LLM_PROVIDER/CHECKPOINTER wiring (ADR-031 follow-up)
- 2026-09-25 #312 The module teacher runs on AgentPlatform's course-teacher agent (ADR-031)
- 2026-09-25 #309 Course generation runs on AgentPlatform's course-creator workflow (ADR-030)
- 2026-09-24 #297 Code graph: follow upstream guidance (skill, session nudge, grep enrichment)
- 2026-09-22 #296 Adopt ci-autoland: self-hosted runner + auto-merge on green
- 2026-09-22 #294 Drop the emulator script: the AVD is machine-wide now
- 2026-09-22 #291 emulator.sh: the adb wiring is adb-up's, the script only boots the AVD
- 2026-09-21 #288 fix(hooks): use absolute uvx path for code-review-graph hooks
