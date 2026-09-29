# Mobile walkthrough — 2026-09-29 (#320 follow-up)

First run of the app on a device since July. Build: `scripts/run-mobile.sh
--release` (local gradle, x86_64, `Medium_Phone` AVD, Android 16) against the
dev workspace (api/agent/worker + local Supabase) and AgentPlatform :8400.
Screenshots in `walkthrough-2026-09-29/`. Driven with `adb shell input` —
mobile-mcp taps were broken by the adb-forward bug (Automation #174).

| Flow | Result | Evidence |
|---|---|---|
| Launch | **working** — sign-in screen, no `RNGoogleSignin` crash | `01-sign-in.png` |
| Google sign-in | **not completed** — the native sheet opens (module works) but the AVD has no Google account, so it asks for full credentials; cancel returns cleanly with no alert. Needs the one-time account step (`social-sign-in.md`, "Local stack"). | `02-google-sheet-no-account.png` |
| Facebook sign-in | not tested (no Facebook app configured for the local stack) | — |
| Continue as guest | **working** after fix — anonymous session, `sync_user_from_auth`, auto-enrolled | `03-guest-onboarding-course.png` |
| Onboarding deep-link | **working** — first launch lands on the onboarding course | `03-…` |
| Course detail | **working** after fix — real progress bar, locked/available states | `08-course-detail-fixed.png` |
| Module chat | **working** after fix — teacher reply from AgentPlatform, second turn, `module_complete` | `10-module-chat-reply.png`, `12-module-chat-second-turn.png` |
| Progress unlock | **working** — module 1 completed (score 95), module 2 available, 1/2 | `13-progress-unlock.png` |
| Create course (budget selector) | **working** — `30 min` selected, `POST /courses` accepted, button shows the real generation status; see "Generation" below | `14-create-course-form.png`, `15-create-course-generating.png` |

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
   header showed the raw route name — hidden with `href: null`, course title
   as header.
4. **Keyboard hid the composer** — Android already resizes the window;
   the extra `height` KeyboardAvoidingView pushed it off screen.
5. **A long message pushed the send button off screen** — the composer
   wrapper now owns `flex-1`, input capped at `max-h-32`.
6. **Build itself** — `babel-preset-expo`, the JSX plugin and Reanimated were
   undeclared; NativeWind 4.2 needs Reanimated 4 / RN 0.78 (pinned to 4.1).

## Left open (issues under #320)

- Nested routes live inside the tab navigator, so there is no back affordance
  from a course or a chat: Android BACK returns to the Learn tab, not the
  course. Course detail → chat → back should pop to the course (a stack
  inside the My Courses tab).
- "Intermediate" difficulty chip wraps to two lines at 720 px width.
- Google sign-in end to end (needs a Google account on the AVD, and the
  Android OAuth client SHA-1 for the local debug keystore — `social-sign-in.md` §2).
- The teacher returns one whole reply; the "streaming" spinner runs 20–50 s
  with nothing on screen. Either stream tokens from AgentPlatform or show a
  "thinking" state that says so.
- `pnpm db:reset:dev` drops the onboarding course; `pnpm setup` seeds it but
  nothing re-seeds after a reset (`db:seed:onboarding:dev` by hand).
