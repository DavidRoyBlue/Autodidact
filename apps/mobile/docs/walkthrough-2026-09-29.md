# Mobile walkthrough — 2026-09-29 (#320 follow-up)

First run of the app on a device since July. Build: `scripts/run-mobile.sh
--release` (local gradle, x86_64, `Medium_Phone` AVD, Android 16) against the
dev workspace (api/agent/worker + local Supabase) and AgentPlatform :8400.
Screenshots in `walkthrough-2026-09-29/`. Driven with `adb shell input` —
mobile-mcp taps were broken by the adb-forward bug (Automation #174).

| Flow | Result | Evidence |
|---|---|---|
| Launch | **working** — sign-in screen, no `RNGoogleSignin` crash | `01-sign-in.png` |
| Google sign-in | **working** after console fix (2026-09-30) — without a Google account on the AVD the sheet asks for credentials; with one it returned `DEVELOPER_ERROR`, a SHA-1 mismatch between the Android OAuth client and the local build's keystore (`social-sign-in.md` §2). | `02-google-sheet-no-account.png`, `20-google-developer-error.png`, `23-google-account-chooser.png`, `24-google-signed-in.png` |
| Profile (guest) | **working** after fix — the guest card overflowed a non-scrolling `Screen`, so **Sign Out was unreachable**; `profile.tsx` now scrolls. | `21-profile-scrolls-sign-out.png` |
| Facebook sign-in | not tested (no Facebook app configured for the local stack) | — |
| Continue as guest | **working** after fix — anonymous session, `sync_user_from_auth`, auto-enrolled | `03-guest-onboarding-course.png` |
| Onboarding deep-link | **working** — first launch lands on the onboarding course | `03-…` |
| Course detail | **working** after fix — real progress bar, locked/available states | `08-course-detail-fixed.png` |
| Module chat | **working** after fix — teacher reply from AgentPlatform, second turn, `module_complete` | `10-module-chat-reply.png`, `12-module-chat-second-turn.png` |
| Progress unlock | **working** — module 1 completed (score 95), module 2 available, 1/2 | `13-progress-unlock.png` |
| Create course (budget selector) | **working** after fix — `30 min` selected, `POST /courses` accepted, the button shows the real generation status (~7 min on AgentPlatform), the app opens the course when ready. Before the fix it opened **0/0 modules, all locked**: a generated course never enrolled its creator. The enroll fix is verified by curl and unit test, not on-device: the second generation ("Intro to chess openings", 1 h) **failed on AgentPlatform** — `plan_review` exceeded Claude Code's 4096 output-token cap (`run_9a65f09c74e2`, handed to `pm AgentPlatform`) — and the app rendered that state correctly ("Course generation failed. Please try again."). | `14-create-course-form.png`, `15-create-course-generating.png`, `16-generated-course-all-locked.png` (before), `19-create-course-failed.png` |
| Back navigation | **working** after fix — header back on course and chat, Android BACK pops chat → course | `17-chat-header-back.png`, `18-back-pops-to-course.png` |
| Guest → Google upgrade (Profile) | **not testable on the local stack** — the web `linkIdentity` flow sends Google `redirect_uri=http://10.0.2.2:55321/auth/v1/callback`; only the hosted Supabase callback is authorized on the Web client, so Google answers `400 redirect_uri_mismatch`. Authorizing it needs the real client secret in local GoTrue, which `social-sign-in.md` forbids — prod-only path. | owner screenshot (Chrome custom tab) |

## What was broken, and what this PR fixed

1. **Release build blocked the local stack** — no `usesCleartextTraffic`, so
   every request to `http://10.0.2.2` failed ("Network request failed" on
   guest sign-in). Now set only when the API URL is `http://` (`app.config.ts`).
2. **Module chat never sent** — `@microsoft/fetch-event-source` needs
   `document` and a streaming `response.body`; RN has neither. The session
   was created server-side with zero messages. `useSSE` now reads the SSE
   body through `apiFetch`. Also `uuid` v4 threw (no `crypto.getRandomValues`)
   → `expo-crypto`; and the client toasted "Module complete" on every reply
   because it read `complete` (stream end) as `module_complete`.
3. **Tab bar showed the nested routes as tabs** (`courses/[id]…`) and the
   header showed the raw route name — the course routes now live in a stack
   under the My Courses tab (fix 8), with the course title as header.
4. **Keyboard hid the composer** — Android already resizes the window;
   the extra `height` KeyboardAvoidingView pushed it off screen.
5. **A long message pushed the send button off screen** — the composer
   wrapper now owns `flex-1`, input capped at `max-h-32`.
6. **Build itself** — `babel-preset-expo`, the JSX plugin and Reanimated were
   undeclared; NativeWind 4.2 needs Reanimated 4 / RN 0.78 (pinned to 4.1).
7. **Generated course unusable** — `createOrReuse` enrolls the creator only
   when it reuses a course; a new one has no enrollment and no
   `module_progress`, so it opened 0/0 with every module locked.
   `useCourseGeneration` now calls the existing `POST /courses/:id/enroll`
   (the unused `useEnrollCourse` hook) before navigating. Verified with curl:
   after enroll, module 1 `available`, 4 `locked`.
8. **No way back from a course or a chat** — the course routes lived directly
   under the tab navigator, so Android BACK from a chat landed on the Learn
   tab. `courses/` is now a stack inside the My Courses tab (header back,
   BACK pops to the course).
9. **Guest Profile could not sign out** — `UpgradeAccountCard` pushed Sign Out
   below the fold of a non-scrolling `Screen`; the profile is `<Screen scroll>`.
10. **Small ghost buttons clipped their label** ("Use email instead", "Continue
    as guest"): `size="sm"` was `h-9` with `py-2`, leaving 20 px for a 22 px
    line — now `h-10` (`22-sign-in-buttons-fixed.png`).

## Left open (issues under #320)

- Chat history does not survive leaving the screen: `POST /chat/sessions`
  creates a new session on every visit (five rows for one user/module in the
  local DB), so re-opening a module shows an empty chat and the teacher
  starts over. The API should resume the module's open session.

- The server should enroll the creator when generation completes (worker or
  `courses.service`), so a course is usable from any client — the app-side
  enroll is a client workaround for the API gap.
- "Intermediate" difficulty chip wraps to two lines at 720 px width.
- The teacher returns one whole reply; the "streaming" spinner runs 20–50 s
  with nothing on screen. Either stream tokens from AgentPlatform or show a
  "thinking" state that says so.
- Course generation can fail for long budgets: AgentPlatform's course-creator
  `plan_review` step hit Claude Code's 4096 output-token cap on a 1 h course
  (AgentPlatform's side, handed to its manager). The app only says "try
  again"; it has no retry that reuses the topic/budget, and the failed row
  stays in `courses` with no way to see it.
- `pnpm db:reset:dev` drops the onboarding course; `pnpm setup` seeds it but
  nothing re-seeds after a reset (`db:seed:onboarding:dev` by hand).
