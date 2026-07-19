> Completed: 2026-07-19

# Working Mobile Dev Environment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Parent:** 2026-07-19-dev-environment-design.md

**Goal:** A working mobile dev environment — dev-client APK built and installed, `pnpm mobile:run` opens it, and guest/email/Google sign-in all work against the local Supabase stack.

**Architecture:** Placeholder assets unblock EAS prebuild → cloud dev-client build (existing EAS project/profile/keystore) → `run-mobile.sh` targets the dev client (fail-fast without it) → `[auth.external.google]` in the local Supabase config gives dev the same `signInWithIdToken` → GoTrue flow as prod. One `preview` build proves the release path. Spec: [`../../specs/_done/2026-07-19-dev-environment-design.md`](../../specs/_done/2026-07-19-dev-environment-design.md).

**Tech Stack:** Expo SDK 52 + expo-dev-client (already deps) · EAS cloud builds (`eas-cli` 20.x) · Supabase CLI local stack · PIL 12.2.0 from the repo venv (`.venv/bin/python3`) · bash + adb (WSL client → Windows server).

## Global Constraints

- No new tools: only what the repo already uses (PIL from `.venv`, existing eas-cli, Supabase CLI, adb shim).
- WSL adb invariant: the **Windows** adb server owns `:5037`; never run `~/android-platform-tools/adb start-server`; always call Linux adb with `ADB_SERVER_SOCKET=tcp:localhost:5037`.
- Work directly on `master`; one commit per task (repo owner's standing preference for contained work).
- Package name everywhere: `com.autodidact.app`. AVD: `Medium_Phone`. Metro `:8081`, API `:3000`, Supabase `:55321` (DB `:55322`).
- Never commit secrets; the Google *client secret* must NOT enter the repo or `.env.dev` — dummy placeholder only (spec §4).
- Never close GitHub issues; when everything is done, add label `in-review` only (root `CLAUDE.md`).
- Flip this plan file's checkboxes as steps complete (owner's plan-bookkeeping rule).
- `expo prebuild` rehearsal must leave `git status --porcelain apps/mobile` empty (it rewrites `package.json` scripts as well as creating `android/`).

---

### Task 1: Pick up the work — status moves + stray file cleanup

**Files:**
- Move: `docs/superpowers/specs/to-be-reviewed/2026-07-19-dev-environment-design.md` → `docs/superpowers/specs/in-progress/`
- Move: `docs/superpowers/plans/to-be-reviewed/2026-07-19-dev-environment.md` → `docs/superpowers/plans/in-progress/`
- Modify: `docs/superpowers/specs/README.md`, `docs/superpowers/plans/README.md` (index rows)
- Delete: `app.json` (repo root — stray 16-byte `{"expo":{}}`, accidental artifact of running an expo command at root)

**Interfaces:** Produces: plan at `docs/superpowers/plans/in-progress/2026-07-19-dev-environment.md` — all later tasks update checkboxes there.

- [x] **Step 1: Move spec and plan to in-progress**

```bash
git mv docs/superpowers/specs/to-be-reviewed/2026-07-19-dev-environment-design.md docs/superpowers/specs/in-progress/
git mv docs/superpowers/plans/to-be-reviewed/2026-07-19-dev-environment.md docs/superpowers/plans/in-progress/
```

- [x] **Step 2: Update both README indexes** — in `docs/superpowers/specs/README.md` move the `2026-07-19 — Working Mobile Dev Environment` row from "🔵 To be reviewed" to "🟡 In progress" with Related plan `[in-progress](../plans/in-progress/2026-07-19-dev-environment.md)`; add the equivalent row to `docs/superpowers/plans/README.md`'s in-progress section (match the existing row format in that file).

- [x] **Step 3: Delete the stray root app.json** — first confirm it is still the 16-byte stray (`cat app.json` must print exactly `{"expo":{}}` — if it prints anything else, STOP and surface it), then `rm app.json`.

- [x] **Step 4: Commit**

```bash
git add -u && git add docs/superpowers/
git commit -m "chore(dev-env): pick up dev-environment plan; drop stray root app.json"
```

> **Executed 2026-07-19 (deviation):** `git add -u` swept in unrelated uncommitted owner changes (infra main.tf, note-to-self.md); commit was reset and redone staging explicit paths only. Use explicit paths, never bare `-u`/`-A`, in later tasks.

---

### Task 2: Placeholder assets

**Files:**
- Create: `apps/mobile/assets/icon.png` (1024×1024), `apps/mobile/assets/adaptive-icon.png` (1024×1024, glyph inside the 66% safe zone), `apps/mobile/assets/splash.png` (1080×1920)

**Interfaces:** Produces: the three asset paths `app.json` already references — Task 3's prebuild rehearsal and every EAS build depend on them.

- [x] **Step 1: Generate the three PNGs** — run from repo root:

```bash
.venv/bin/python3 - <<'EOF'
from PIL import Image, ImageDraw, ImageFont
import os
NAVY = (15, 23, 42, 255)      # #0f172a (app.json splash/adaptive bg)
WHITE = (248, 250, 252, 255)
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

def glyph(img, scale):
    """Draw an 'A': DejaVu if present, else a polygon fallback."""
    d = ImageDraw.Draw(img)
    s = img.size[0]
    if os.path.exists(FONT):
        f = ImageFont.truetype(FONT, int(s * 0.55 * scale))
        d.text((img.size[0] / 2, img.size[1] / 2), "A", font=f, fill=WHITE, anchor="mm")
    else:
        cx, cy, h = img.size[0] / 2, img.size[1] / 2, s * 0.5 * scale
        w = h * 0.7; t = h * 0.16
        d.polygon([(cx, cy - h/2), (cx + w/2, cy + h/2), (cx + w/2 - t, cy + h/2),
                   (cx, cy - h/2 + t*1.6), (cx - w/2 + t, cy + h/2), (cx - w/2, cy + h/2)], fill=WHITE)
        d.rectangle([cx - w/4, cy + h*0.05, cx + w/4, cy + h*0.05 + t*0.6], fill=WHITE)

os.makedirs("apps/mobile/assets", exist_ok=True)
icon = Image.new("RGBA", (1024, 1024), NAVY); glyph(icon, 1.0)
icon.save("apps/mobile/assets/icon.png")
ad = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0)); glyph(ad, 0.6)  # transparent bg; safe zone
ad.save("apps/mobile/assets/adaptive-icon.png")
sp = Image.new("RGBA", (1080, 1920), NAVY); glyph(sp, 0.35)
sp.save("apps/mobile/assets/splash.png")
print("done")
EOF
```

Expected output: `done`

- [x] **Step 2: Verify all three are valid PNGs at the right sizes**

```bash
.venv/bin/python3 -c "
from PIL import Image
for p, exp in [('apps/mobile/assets/icon.png', (1024, 1024)),
               ('apps/mobile/assets/adaptive-icon.png', (1024, 1024)),
               ('apps/mobile/assets/splash.png', (1080, 1920))]:
    im = Image.open(p); im.verify(); assert Image.open(p).size == exp, p
print('assets OK')"
```

Expected: `assets OK`

- [x] **Step 3: Commit**

```bash
git add apps/mobile/assets/
git commit -m "feat(mobile): placeholder app icons + splash (unblocks EAS prebuild)"
```

---

### Task 3: Ignore native dirs + prebuild rehearsal gate

**Files:**
- Modify: `.gitignore` (repo root — add managed-workflow native dirs)
- Rehearsal side effects (must be reverted): `apps/mobile/android/`, `apps/mobile/package.json`

**Interfaces:** Consumes: Task 2 assets. Produces: proof that EAS prebuild will pass — gate for Task 4.

- [x] **Step 1: Gitignore the native dirs** — append to root `.gitignore`:

```gitignore

# Expo managed workflow: native dirs are generated; committing them flips EAS to bare workflow
apps/mobile/android/
apps/mobile/ios/
```

- [x] **Step 2: Run the prebuild rehearsal**

```bash
cd apps/mobile && npx expo prebuild --platform android --no-install; cd ../..
```

Expected: exits 0, prints `✔ Created native directory` (and may print `✔ Updated package.json`). If it fails with an asset ENOENT, Task 2 is broken — stop and fix there.

- [x] **Step 3: Restore a clean tree (MANDATORY — even if Step 2 failed)**

```bash
rm -rf apps/mobile/android
git checkout -- apps/mobile/package.json pnpm-lock.yaml 2>/dev/null || true
git status --porcelain apps/mobile
```

Expected: `git status --porcelain apps/mobile` prints **nothing** except `?? apps/mobile/assets/` lines if Task 2 wasn't committed (it should have been). A leftover `android/` dir or a modified `package.json` here will corrupt every later EAS build — do not proceed until this is empty.

- [x] **Step 4: Commit**

```bash
git add .gitignore
git commit -m "chore: gitignore generated native dirs (keep EAS managed workflow)"
```

---

### Task 4: Kick off the EAS dev-client build (no-wait)

**Files:** none (cloud side effect only)

**Interfaces:** Produces: a queued EAS build for profile `development`; Task 7 finds it via `eas build:list` (no ID handoff needed — it is the newest `development`-profile build).

- [x] **Step 1: Confirm login + kick the build**

```bash
cd apps/mobile
npx eas-cli whoami                 # expect: davidroyblue (if not logged in, STOP — owner must `eas login`)
npx eas-cli build --profile development --platform android --non-interactive --no-wait
cd ../..
```

Expected: prints a build page URL and exits. Build runs ~30–60 min in the cloud while Tasks 5–6 proceed.

- [x] **Step 2: Record the kicked build** — note the build ID/URL in the task-completion message (no repo file). If the command errors with a quota/outage message: per spec, wait; only escalate to the owner about the local-Gradle fallback if blocked > 1 day.

> **Executed 2026-07-19 (deviation):** build 1 (`0f3cdd0d`) ERRORED in Gradle — expo-modules-core's Compose Compiler 1.5.15 requires Kotlin 1.9.25 vs RN-default 1.9.24 (expo doctor had flagged SDK/package skew). Fix: `expo install --fix` (rn 0.76.9, screens ~4.4, svg ^15.8) + `expo-build-properties` plugin pinning `android.kotlinVersion=1.9.25` in `app.config.ts`; prebuild rehearsal re-run clean, mobile typecheck + 68/68 jest green. Build 2: `fa4baf49-8c74-47b4-a766-6c6cf75e0e6b`.

> **Executed 2026-07-19 (deviation 2):** build 2 (`fa4baf49`) ERRORED — RN core autolinking generated `import expo.core.ExpoModulesPackage;` (uncompilable). Root cause: from the generated `android/` cwd, expo-modules-autolinking fails to load expo's `react-native.config.js` and falls back to the library namespace (`expo.core`). Fix: app-level `apps/mobile/react-native.config.js` pinning `packageImportPath` for `expo`; verified against the exact settings.gradle command from `android/` cwd. Build 3: `d8fbfd24-586a-45cf-be69-4c6b3e777038`.

---

### Task 5: Local Supabase Google provider

**Files:**
- Modify: `supabase/config.toml` (add `[auth.external.google]` — place it right before the existing `[auth.external.apple]` block at line ~324)
- Modify: `.env.example` (document the two vars), `.env.dev` (real dev values — `GOOGLE_WEB_CLIENT_ID` already exists there)

**Interfaces:** Consumes: existing `GOOGLE_WEB_CLIENT_ID` in `.env.dev`. Produces: local GoTrue accepting Google ID tokens — Task 9's Google sign-in depends on it.

- [x] **Step 1: Add the provider block to `supabase/config.toml`**

```toml
[auth.external.google]
enabled = true
# Reuses the .env.dev entry (same public Web client ID the EAS profiles in apps/mobile/eas.json carry)
client_id = "env(GOOGLE_WEB_CLIENT_ID)"
# Expected unnecessary for the signInWithIdToken flow (GoTrue validates via Google JWKS);
# dummy keeps env() resolvable. NEVER put the prod secret here or in .env.dev (spec §4).
secret = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET)"
skip_nonce_check = true  # dev-only: the Android native sheet sends no nonce
```

- [x] **Step 2: Add the env vars** — in `.env.example`, directly under the existing `GOOGLE_WEB_CLIENT_ID=` line (~109), add:

```bash
# Local Supabase Google provider (supabase/config.toml env() substitution).
# Dummy is fine: signInWithIdToken validates via Google JWKS, no secret needed.
SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=dev-dummy-not-used
```

Add the same line (with the same dummy value) to `.env.dev`.

- [x] **Step 3: Robustness check — `supabase start` with the vars UNSET** (the `pnpm setup` path runs `supabase start` without the dotenv wrapper):

```bash
pnpm exec supabase stop
env -u GOOGLE_WEB_CLIENT_ID -u SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET pnpm exec supabase start
```

Expected: stack boots (warnings about empty env are OK). **Decision rule if it hard-fails on the unresolved `env()`:** replace both `env()` references in the toml block with committed literals — the real Web client ID string (public, copy from `apps/mobile/eas.json`) and `"dev-dummy-not-used"` — re-test, and note the deviation in this plan file under Task 5.

- [x] **Step 4: Restart with real env and verify GoTrue advertises Google**

```bash
pnpm exec supabase stop
pnpm exec dotenv -e .env.dev -- pnpm exec supabase start
curl -fsS --max-time 5 http://127.0.0.1:55321/auth/v1/settings | .venv/bin/python3 -c "import sys,json; s=json.load(sys.stdin); print('google enabled:', s['external']['google'])"
```

(`dotenv` is the workspace's `dotenv-cli` dep — it needs `pnpm exec` outside package.json scripts.)

Expected: `google enabled: True`

- [x] **Step 5: Commit**

```bash
git add supabase/config.toml .env.example
git commit -m "feat(supabase): enable Google provider on the local stack (id-token flow, dummy secret)"
```

(`.env.dev` is never committed.)

---

### Task 6: `run-mobile.sh` targets the dev client

**Files:**
- Modify: `scripts/run-mobile.sh` (replace everything from the `# --- 2. Metro + open app` comment to the end of the file — steps 2–4 — keeping the header, env setup, color helpers, and Step 1 emulator block)

**Interfaces:** Consumes: booted emulator from `emulator.sh` (unchanged). Produces: `pnpm mobile:run` = dev-client launcher; fail-fast message names the Task 4 build command and `adb install`.

- [x] **Step 1: Replace steps 2–4 of the script** with the block below. Constants first: next to the existing `METRO_LOG`/`METRO_TIMEOUT` definitions add `APP_ID="com.autodidact.app"` and **move** `LINUX_ADB="$HOME/android-platform-tools/adb"` there too (today it's defined mid-script inside the section being replaced — the new code uses it earlier):

```bash
# --- 2. device + dev client check --------------------------------------------
# The app REQUIRES a custom dev client (native Google sign-in); in Expo Go it
# crashes on boot, so a missing dev client is a hard stop, not a fallback.
# Detection is by the expo-dev-launcher component, NOT package presence: the
# `preview` profile APK shares the package name but is not a dev client (and
# installing it replaces the dev client — they collide on the same AVD).
serial=$(timeout 10 "$LINUX_ADB" devices | awk '$2=="device" && $1 ~ /^emulator-/{print $1; exit}')
[[ -n "$serial" ]] || die "no booted emulator visible to adb"

if ! timeout 15 "$LINUX_ADB" -s "$serial" shell dumpsys package "$APP_ID" 2>/dev/null | grep -qi devlauncher; then
  die "no dev client on $serial — the app cannot run in Expo Go (native Google sign-in).
  Build:    cd apps/mobile && npx eas-cli build --profile development --platform android
  Install:  adb install <downloaded .apk>
  then re-run: pnpm mobile:run"
fi

# --- 3. adb reverses (EVERY path, incl. Metro-already-up) --------------------
# The device reaches Metro (8081), the local API (3000) and the local Supabase
# stack (55321) via localhost thanks to these.
for port in 8081 3000 55321; do
  timeout 10 "$LINUX_ADB" -s "$serial" reverse "tcp:$port" "tcp:$port" >/dev/null 2>&1 || true
done

# --- 4. Metro (start only if not already serving) ----------------------------
if ! curl -fsS --max-time 2 "http://localhost:8081/status" >/dev/null 2>&1; then
  info "▶ Starting Expo/Metro (log: .expo-dev.log)"
  : > "$METRO_LOG"
  ( cd apps/mobile && CI=1 ANDROID_HOME="$ADB_SHIM" nohup pnpm start >>"$METRO_LOG" 2>&1 & )
  info "… waiting for Metro on :8081 (≤ ${METRO_TIMEOUT}s)"
  deadline=$(( SECONDS + METRO_TIMEOUT ))
  ready=""
  while (( SECONDS < deadline )); do
    if curl -fsS --max-time 2 "http://localhost:8081/status" >/dev/null 2>&1; then ready=1; break; fi
    if grep -qiE 'CommandError|ELIFECYCLE|Command failed|adb ENOENT|EADDRINUSE' "$METRO_LOG" 2>/dev/null; then
      die "Expo failed to start — see $METRO_LOG"$'\n'"$(tail -3 "$METRO_LOG")"
    fi
    sleep 2
  done
  [[ -n "$ready" ]] || die "Metro did not become ready within ${METRO_TIMEOUT}s — see $METRO_LOG"
else
  ok "Metro already running on :8081"
fi

# --- 5. open the project in the dev client -----------------------------------
# Idempotent: re-fires the deep link until the app is foregrounded.
for _ in 1 2 3 4 5 6; do
  fg=$(timeout 10 "$LINUX_ADB" -s "$serial" shell dumpsys activity activities 2>/dev/null | grep -i topResumedActivity)
  [[ "$fg" == *"$APP_ID"* ]] && break
  timeout 10 "$LINUX_ADB" -s "$serial" shell am start -a android.intent.action.VIEW \
    -d "autodidact://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081" "$APP_ID" >/dev/null 2>&1 || true
  sleep 3
done
[[ "$fg" == *"$APP_ID"* ]] || warn "app not confirmed foregrounded — check the emulator screen"

ok "Dev client is open with Metro serving${serial:+ ($serial)}"
echo -e "${CYAN}  Drive it via mobile-mcp (mobile_take_screenshot / mobile_list_elements_on_screen).${NC}"
echo -e "${YELLOW}  Note: backend is NOT started by this script — run 'pnpm dev' separately. Metro log: .expo-dev.log${NC}"
```

Also update the header comment block (lines 2–12) to describe the dev-client flow instead of Expo Go, and delete the now-unused Expo Go references.

- [x] **Step 2: Syntax-check and test the fail-fast path** (no dev client is installed yet — Task 7 hasn't run):

```bash
bash -n scripts/run-mobile.sh && echo "syntax OK"
pnpm mobile:run
```

Expected: `syntax OK`; then the script boots/fast-paths the emulator and **dies** with the "no dev client on emulator-5554" message naming the build and install commands. That failure IS the passing test at this stage.

- [x] **Step 3: Commit**

```bash
git add scripts/run-mobile.sh
git commit -m "feat(scripts): run-mobile targets the dev client (fail-fast without it; reverses on every path)"
```

---

### Task 7: Install the dev client + hand over the SHA-1

**Files:** none committed (APK downloaded to `$CLAUDE_JOB_DIR/tmp` or `/tmp`)

**Interfaces:** Consumes: Task 4's build (newest `development` build), Task 6's script. Produces: dev client installed on the AVD; keystore SHA-1 string for Task 8's owner checklist.

- [x] **Step 1: Wait for the build and get the artifact URL**

```bash
cd apps/mobile
npx eas-cli build:list --platform android --limit 1 --non-interactive --json | .venv/bin/python3 -c "import sys,json; b=json.load(sys.stdin)[0]; print(b['buildProfile'], b['status'], b.get('artifacts',{}).get('buildUrl',''))"
cd ../..
```

Expected: `development FINISHED https://…apk`. If `ERRORED`: fetch the log (`eas build:view <id> --json` → `logFiles[0]`, curl with `--compressed`, it is NDJSON — the same diagnosis flow that found the assets bug on 2026-07-18) and fix before continuing. If still `IN_QUEUE`/`IN_PROGRESS`: poll every ~5 min.

- [x] **Step 2: Download + install on the emulator** (emulator must be booted — `pnpm emulator`):

```bash
curl -fsSL --max-time 300 "<buildUrl>" -o "$CLAUDE_JOB_DIR/tmp/autodidact-dev.apk"
ADB_SERVER_SOCKET=tcp:localhost:5037 ~/android-platform-tools/adb install -r "$CLAUDE_JOB_DIR/tmp/autodidact-dev.apk"
```

Expected: `Success`

- [x] **Step 3: Extract the keystore SHA-1 from the APK** (no Google console needed):

```bash
keytool -printcert -jarfile "$CLAUDE_JOB_DIR/tmp/autodidact-dev.apk" | grep -A2 'SHA1'
```

Expected: a `SHA1: XX:XX:…` fingerprint line. Record it for Task 8.

- [x] **Step 4: Verify detection** — `pnpm mobile:run` now must pass the dev-client check and open the app (Metro + deep link). App may show errors until backend/auth wiring is verified in Task 9; foregrounding the dev client is the pass condition here.

> **Executed 2026-07-19 (deviation 3):** build 3 (`d8fbfd24`) FINISHED — first green EAS build. APK installed; SHA-1 `E5:1A:B1:0B:A9:5E:44:79:7C:1B:2E:D1:E5:3F:EB:F7:B4:7C:AF:45` (via apksigner; keytool can't read v2-only signatures). Dev client could NOT reach Metro through `adb reverse` (tunnels accept but pass no data across the Windows-adb-server/WSL split) — replaced reverses with the `10.0.2.2` host-loopback (deep link + Metro-scoped SUPABASE_URL/AUTODIDACT_API_BASE_URL env). Verified: bundle loads, sign-in screen renders in the dev client.

---

### Task 8: OWNER GATE — Google Cloud console + emulator account

**Files:** none (external console + device state)

**Interfaces:** Consumes: SHA-1 from Task 7. Produces: a valid Android OAuth client — without it Task 9's Google step fails with `DEVELOPER_ERROR`.

- [ ] **Step 1: Present the owner checklist** (fill in the real SHA-1) and STOP until the owner confirms:

> In [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials:
> 1. Confirm an **Android** OAuth client exists with package `com.autodidact.app` and SHA-1 `<from Task 7>`. If none (or it says `com.blueking.autodidact`), create/fix it.
> 2. The **Web** client (`232057392869-…`) stays as is — it's the ID-token audience.
> 3. On the emulator: Settings → add a Google account (any test Google account).

- [ ] **Step 2: Verify the account is on the device**

```bash
ADB_SERVER_SOCKET=tcp:localhost:5037 ~/android-platform-tools/adb shell dumpsys account | grep -c 'type=com.google'
```

Expected: ≥ 1

---

### Task 9: End-to-end verification on the device

**Files:** none (verification only; screenshots via mobile-mcp)

**Interfaces:** Consumes: everything above; `pnpm dev` running in a separate terminal (owner keeps it up, or start it backgrounded).

- [x] **Step 1: Full stack up** — backend `pnpm dev` running (verify: `curl -fsS --max-time 3 http://localhost:3000/v1/health` or the repo's health route; check `curl -fsS --max-time 3 http://127.0.0.1:55321/auth/v1/settings` for the local stack), then `pnpm mobile:run`.

- [x] **Step 2: Guest sign-in** — via mobile-mcp: screenshot the sign-in screen, tap "Continue as guest", confirm the app routes into `(app)`. 

- [x] **Step 3: Email sign-up/sign-in** — create a throwaway account (e.g. `dev-check@example.com`), confirm it lands in the app shell. If sign-up demands email confirmation, the local stack catches all mail in Inbucket — open `http://127.0.0.1:55324`, find the message, click the confirm link, retry sign-in.

- [x] **Step 4: Google sign-in** — tap "Continue with Google"; native sheet appears; pick the device account; the app must land in `(app)`. On `DEVELOPER_ERROR` → Task 8 client mismatch. On a GoTrue 400 → check auth logs: `docker logs $(docker ps --format '{{.Names}}' | grep supabase_auth) --tail 50`, verify JWKS reachability and `aud` vs `client_id`; if the dummy secret is the cause, report to the owner per spec §4.

- [x] **Step 5: Confirm rows in the local DB**

```bash
docker exec $(docker ps --format '{{.Names}}' | grep supabase_db) psql -U postgres -d postgres -c \
  "select email, is_anonymous, (select count(*) from auth.identities i where i.user_id = u.id and i.provider='google') as google_ids from auth.users u order by created_at desc limit 5;"
```

Expected: the guest row (`is_anonymous=t`), the email row, and a row with `google_ids=1`. Also confirm the same users appear in `public.users` (`select id, email from public.users order by created_at desc limit 5;`).

- [x] **Step 6: Update this plan's checkboxes and note results** (screenshots + any deviations) under this task.

> **Progress 2026-07-19:** T9 steps 1–3+5 verified ahead of the T8 gate: guest sign-in routes into `(app)` (row `ef381f7c…`, `is_anonymous=t`); guest→email upgrade via UpgradeAccountCard succeeds ("Account saved", same UUID, email set, `is_anonymous=f`, provider `email`, synced to `public.users`). Email test used the upgrade card rather than sign-out/sign-up — exercises `updateUser` against local GoTrue. Step 4 (Google) awaits the Task 8 owner gate.

> **Completed 2026-07-19 (T9 step 4):** owner signed a Google account into the AVD (persists across reboots on the AVD data partition). Re-ran `pnpm mobile:run` after a full session restart (backend + Metro had died with the prior session — restarted `pnpm dev`, re-booted the emulator, re-fired the dev-client deep link manually since the script's own foreground-confirm loop hung once). "Continue with Google" → native account picker → app landed in `(app)` shell. DB confirmed: new `auth.users` row `d8373e17…`, `provider=google`, `is_anonymous=f`, real email, synced to `public.users`. All T9 checkpoints (guest, email upgrade, Google, DB rows) now verified.

---

### Task 10: Preview build proof + docs + wrap-up

**Files:**
- Modify: `docs/deployment.md` (statuses: dev client ✅, run-mobile wiring ✅, Google-in-dev ✅, preview ✅; Expo Go section → dev client required)
- Modify: `apps/mobile/docs/social-sign-in.md` (add "Local stack (dev)" section: the config.toml block, dummy-secret rationale, `skip_nonce_check`, GoTrue-400 troubleshooting row)
- Modify: `apps/mobile/CLAUDE.md` (Commands section: `pnpm mobile:run` now requires the dev client; add the rebuild triggers line from the spec §2)
- Move: spec + this plan → `_done/` with index updates

**Interfaces:** Consumes: green Task 9.

- [x] **Step 1: Fire the preview build and confirm green**

```bash
cd apps/mobile && npx eas-cli build --profile preview --platform android --non-interactive --no-wait; cd ../..
# poll as in Task 7 Step 1 until FINISHED
```

Expected: newest `preview` build reaches `FINISHED` with an artifact URL. **Do NOT install it on the dev AVD** (package-name collision would replace the dev client).

- [x] **Step 2: Docs updates** — apply the three file updates listed above. Keep each edit short; link to the spec instead of duplicating design rationale.

- [ ] **Step 3: Close out statuses**

```bash
git mv docs/superpowers/specs/in-progress/2026-07-19-dev-environment-design.md docs/superpowers/specs/_done/
git mv docs/superpowers/plans/in-progress/2026-07-19-dev-environment.md docs/superpowers/plans/_done/
# add "> Completed: <today's date>" at the top of the plan file; update both README indexes
```

- [ ] **Step 4: Commit, push, and flag for review**

```bash
git add -A docs/ apps/mobile/CLAUDE.md
git commit -m "docs(dev-env): dev environment shipped — statuses, runbooks, plan closed out"
git push origin master
gh issue edit <session issue #> --add-label in-review --remove-label in-progress   # never close it
```

> **Progress 2026-07-19 (T10):** preview attempt 1 (`b609a5c7`) failed — release bundling could not resolve `expo-asset` under pnpm (local `expo export` also silently emitted no bundle); fixed by adding `expo-asset` as a direct dep. Preview attempt 2 (`37a8f470`) FINISHED. Docs updated (deployment.md, social-sign-in.md local-stack section, mobile CLAUDE.md dev-client rules, PRODUCTION.md mobile state). Close-out (status moves + in-review) awaits the Google device E2E (T9 step 4).
