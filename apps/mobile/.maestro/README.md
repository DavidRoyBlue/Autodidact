# Maestro mobile e2e flows

UI-level end-to-end flows for the Autodidact app (ADR-023 / ADR-024). These
drive the **real app** on a device or emulator against a running backend. They
are **manual / nightly** — never part of the PR gate (no device in CI by
default).

## Flows

| Flow | Covers |
|------|--------|
| `sign-in.yaml` | Launch + authenticate (verified selectors). |
| `golden-path.yaml` | Sign in → create course → generation → open module → chat a turn. Mirrors the cross-service `@autodidact/e2e` journey through the UI. **Selectors past sign-in are a scaffold — validate on-device before trusting.** |

## Prerequisites

1. Install Maestro: `curl -Ls "https://get.maestro.mobile.dev" | bash`.
2. A running backend reachable at the app's `apiBaseUrl` — start it with
   `LLM_PROVIDER=mock EMBEDDING_PROVIDER=mock AUTH_PROVIDER=mock` for a fast,
   deterministic run (see `@autodidact/e2e`).
3. A built app on a booted emulator/simulator (`pnpm --filter @autodidact/mobile android`/`ios`),
   or Expo Go (then set `appId: host.exp.Exponent`).
4. A seeded test account (pass via `-e EMAIL=… -e PASSWORD=…`).

## Run

```bash
cd apps/mobile
maestro test .maestro/sign-in.yaml
maestro test .maestro/golden-path.yaml -e EMAIL=e2e@test.com -e PASSWORD=...
```

## CI

Intended for a scheduled nightly workflow (see Phase 5 CI restructure), not the
PR gate. Wire as a separate job that boots an emulator, starts the mock backend,
and runs `maestro test .maestro/`.
