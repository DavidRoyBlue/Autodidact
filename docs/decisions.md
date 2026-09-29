# Decisions log

Short-form decisions with their reason, newest first. Durable architectural
choices get an ADR under `docs/architecture/ADRs/`; this file records the
smaller calls a PR makes so the next reader knows why.

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
same recipe as Accountability's `scripts/run-mobile.sh`. The EAS `development`
profile and the Metro/dev-client launch path are gone.

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
