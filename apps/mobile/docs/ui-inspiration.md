# UI/UX Inspiration & Component-Kit Reference

> **Part 1 deliverable** of the [Mobile UI/UX Overhaul](../../../docs/superpowers/specs/to-be-reviewed/2026-06-27-mobile-ui-ux-overhaul.md) (issue #85 → #97).
> This is a **directional** reference — a curated set of patterns and component directions for Parts 3 (information architecture) and 4 (screen design) to design *against*, not a set of decisions. It does not pre-decide the IA or the visuals.

**North star (parent spec):** the user opens the app and is immediately *doing the thing* — in a lesson, in a chat, mid-course — not configuring one. Today the home tab (`app/(app)/index.tsx`) is a cold "What do you want to learn?" creation form: the user starts at paperwork, not in the action.

**Locked stack (ADR-003, ADR-029):** Expo SDK 52 · Expo Router 4 · NativeWind v4 (`className`) · React Native Reusables (RNR) primitives copied in-repo · CSS-variable tokens in `src/global.css` + `tailwind.config.js`. Everything proposed here must work inside that — no StyleSheet, no other styling libraries.

---

## Apps surveyed

Duolingo, Brilliant, Khan Academy, Sololearn, Headspace — plus Mimo as a coding-specific supporting example. Every pattern below names the app it comes from and links a source. **Sololearn is the closest direct analog** to our model: it has an in-lesson AI tutor ("Kodie"), so its patterns are weighted most heavily for the chat-tutor surfaces.

---

## 1. Pattern catalogue (by surface)

Each surface maps to one of our real screens. "**→ Us:**" notes how the pattern bears on Autodidact.

### First-run — "drop into the action"

- **Duolingo — the lesson *is* the onboarding.** Pick a language + a motivation, then drop straight into the first bite-sized lesson *before* account creation. Signup is deferred ("gradual engagement"): the prompt to register appears only after there's progress worth saving. Locked features (leaderboards) are the carrot, not a gate on core value. ([appcues](https://goodux.appcues.com/blog/duolingo-user-onboarding), [Mobbin flow](https://mobbin.com/explore/flows/afd9076d-2599-44fe-962f-fc723a7a7b6b))
- **Brilliant — assess by *solving*.** Opens with real visual puzzles (weight-scale problems) to gauge level; the user is solving within seconds, not reading. ([screensdesign](https://screensdesign.com/showcase/brilliant-learn-by-doing))
- **Headspace — bundle session one with install; CTA optional.** 3-step personalization → a guided breathing exercise (a taste of core value) before the dashboard. Cautionary tale: the *old* heavier onboarding (mandatory video + first meditation) drove a **38% drop-off**, which is why they trimmed it. ([Raw.Studio](https://raw.studio/blog/how-headspace-designs-for-mindfulness/), [App Fuel](https://theappfuel.com/examples/headspace_onboarding))
- **→ Us:** The recurring winner is **do the thing before asking for anything** — interleave assessment/signup *into* the activity. We already have guest (anonymous) auth (`UpgradeAccountCard`), and the [onboarding-course work](../../../docs/superpowers/specs/to-be-reviewed/2026-06-19-onboarding-course-design.md) auto-enrolls new users into a *Welcome* course — the data-side enabler for landing a brand-new user directly in a real chat-lesson instead of the creation form.

### Home / landing surface — *our Learn tab (`index.tsx`)*

- **Khan Academy — one-tap "Resume."** The most-recent lesson is reachable from a single **Resume** button; tapping it animates the lesson up from the bottom (à la Spotify now-playing / Kindle last-read). Deliberately distraction-free. ([Scott Liang](https://www.scottliang.com/work/khan-academy-redesign))
- **Duolingo — the path *is* the home screen.** A vertical journey of level nodes (completed = gold/checked, current = emphasized as the obvious next tap), spaced-repetition ordering, and a **floating button** that snaps scroll back to the current node. ([Duolingo blog](https://blog.duolingo.com/new-duolingo-home-screen-design/))
- **Brilliant — motivation hero + next-lesson nudge.** Streak/XP/leagues up top alongside a branching path showing position and a companion nudging the next lesson. ([screensdesign](https://screensdesign.com/showcase/brilliant-learn-by-doing), [Rive](https://rive.app/blog/how-brilliant-org-motivates-learners-with-rive-animations))
- **Headspace — scrollable content shelves (counter-example).** Long need-based shelves are critiqued as *too* scroll-heavy — they bury the next action. ([UI Sources](https://uisources.com/app/headspace))
- **→ Us:** Today's home is a creation form with no resume affordance. The strongest replacement is a **Resume hero** (Khan) pointed at the user's last module chat, with creation demoted to a secondary "+ New course" action.

### Course / lesson browsing — *our My Courses (`courses/index.tsx`) + Course detail (`courses/[id]`)*

- **Path / journey map (Duolingo, Brilliant).** A guided trail of nodes so users "never wonder what to do next": completed = gold/checked, locked = greyed ahead, current = emphasized. Brilliant calls its variant a *Level Gameboard*. ([Duolingo blog](https://blog.duolingo.com/new-duolingo-home-screen-design/), [Rive](https://rive.app/blog/how-brilliant-org-motivates-learners-with-rive-animations))
- **Goal-based tracks (Sololearn).** Pick a path; it adapts to pace/skill. Each lesson = short concept → one-question quiz → end-of-module quiz. ([Sololearn](https://www.sololearn.com/en/))
- **Contents list + per-course progress bar (Khan).** Traditional list/explore + bookmarks with a horizontal progress bar; better for a deep catalog, weaker at "what's next." ([Scott Liang](https://www.scottliang.com/work/khan-academy-redesign))
- **→ Us:** Course detail already has a module list with locked/available states and a progress bar — that's the raw material for a **path/journey map**. The map makes module locking (today opaque, per the Part 2 audit) *legible*: greyed-ahead nodes explain themselves.

### In-lesson / chat — *our Module chat (`courses/[id]/modules/[moduleId]/chat.tsx`)*

- **Sololearn — in-lesson AI tutor "Kodie" (closest analog).** When stuck, the learner asks Kodie, an in-app AI tutor, for instant guidance on the current challenge; it gives feedback and suggests next steps. The tutor is an on-demand affordance *inside* the lesson, not a separate destination. ([Sololearn](https://www.sololearn.com/en/), [App Store](https://apps.apple.com/us/app/sololearn-learn-to-code/id1210079064))
- **Duolingo — instant feedback + sticky CTA.** Answers evaluated instantly (green/red), a persistent bottom **CONTINUE** advances, a top progress bar fills across the lesson; completion fires multiple rewards at once. ([Duolingo wiki](https://duolingo.fandom.com/wiki/Troubleshooting))
- **Brilliant — manipulate, don't memorize.** Wrong answers expand into *interactive* explanations you can poke at, not a static "incorrect." ([screensdesign](https://screensdesign.com/showcase/brilliant-learn-by-doing))
- **→ Us:** Our chat *is* the lesson, so Sololearn's model maps most directly. Worth borrowing: an explicit **lesson progress indicator** inside the chat (Duolingo's top bar), suggested next-step affordances from the tutor, and a clear module-complete celebration (we already fire a module-complete toast via `useSSE`).

### Progress & streaks — *our Profile (`profile.tsx`) + cross-app*

- **Duolingo — streak as the central mechanic.** Daily goal + flame tracker + push + home-screen widget; XP = movement along the path. Credited with ~2× daily retention. ([deconstructoroffun](https://duolingo.deconstructoroffun.com/mechanics/streaks))
- **Brilliant — animated streak payoff.** A Rive event-triggered animation fires the moment a streak is achieved, synced to the rising counter; layered with XP/levels/leagues + an escalating iOS widget. ([Rive](https://rive.app/blog/how-brilliant-org-motivates-learners-with-rive-animations))
- **Common pattern:** a slim persistent top bar (streak / currency / progress) plus a deliberate **celebration moment** on success — treated as a retention surface, not decoration.
- **→ Us:** Today progress lives only as a per-course bar + profile stats. A **slim streak/progress bar** is a cheap, high-leverage motivator — but keep it slim (Headspace's failure mode is a stats dashboard that *delays* the action).

### Empty / loading states — *our first-run + generation polling*

- **Avoid the true empty state (Duolingo, Brilliant, Mimo).** Onboarding pre-seeds the path and drops the user into content, so first-run "empty" is replaced by an active first lesson.
- **Loading as a brand moment (Brilliant).** Tangram-style loading animations reinforce identity instead of a spinner.
- **Personalized seed from onboarding answers (Headspace, Sololearn).** Experience/goal questions pre-populate the first home so a new account already looks "full."
- **→ Us:** Two concrete wins — (1) the Learn tab has *no* first-run/empty state today; pre-seed it from the Welcome course so it's never blank; (2) course generation shows opaque hardcoded status labels (`Queued… / Generating…`) — replace with a branded, reassuring generating state (Brilliant's loading-as-brand).

---

## 2. "Start in the action" home patterns — shortlist

For our model the "action" is **resuming a chat-based lesson**. Five concrete directions for the Learn tab, with trade-offs for a chat-tutor app:

| # | Pattern (exemplar) | What it is | Pros for us | Cons for us |
|---|---|---|---|---|
| 1 | **Resume hero card** (Khan Academy) | Most-recent lesson front-and-center; one tap reopens it | Dead-simple, zero decision cost; maps perfectly to "reopen the chat you were in" | Shows one thread — weak for parallel courses; needs an obvious path to the catalog |
| 2 | **Path map with emphasized current node** (Duolingo) | Home is the journey; next node is the obvious tap + scroll-to-current button | Gives context (where you are / what's next) while pointing at one action; legible module locking | A literal node map fits discrete lessons better than open-ended chat; heavier to build |
| 3 | **Open mid-conversation** (Sololearn "Kodie") | Home *is* the live tutor chat — opens with the AI's next message already waiting | Purest "start in the action" for a chat tutor — the action is already on screen; AI can recap + propose next step | Disorienting with multiple courses; needs a lightweight switcher; can lose the sense of structured progress |
| 4 | **Motivation hero + companion nudge** (Brilliant) | Streak/XP hero with a companion suggesting the next lesson | Couples the action with the motivation to take it; "companion suggests next" = our AI tutor proposing the next chat | Overdone → a stats dashboard that *delays* the action (Headspace failure mode) |
| 5 | **Deferred-signup, lesson-first launch** (Duolingo / Mimo) | New users skip setup and open directly into a generated first lesson/chat; save-progress prompt comes after | Maximizes "doing within seconds"; we already have guest auth + an onboarding Welcome course to land in | Needs guest→real migration (we have it); some features must be visibly gated as the upgrade incentive |

**Directional lean (for Part 3 to decide, not a decision):** the cleanest fit for a chat-tutor app is a **hybrid of #1 + #3** — a *Resume hero that is the live chat thread*, with the **path map (#2)** one tap away for orientation, a **slim streak/progress bar (#4)** that never grows into a dashboard, and **#5** governing the brand-new-user path (land them straight in the Welcome chat). Creation moves to a secondary "+ New course" affordance.

---

## 3. Component / template directions

Three directions for accelerating the build, all evaluated against the locked stack. Full sources at the end.

| Direction | Stack fit | License | Adoption cost | Maintenance | Verdict |
|---|---|---|---|---|---|
| **1. RNR full catalog + CLI/registry** | Native — *is* this stack (className + rn-primitives + CSS-var tokens) | MIT | Lowest: copy-paste / CLI `add`, you own the code, zero runtime lock-in | Active into 2026 (rn-primitives 1.4.0, Mar 2026; SDK-55 tracking) | **Primary / backbone** |
| **2. tweakcn token/theme export** | Strong — shadcn/RNR share the identical CSS-variable contract | MIT (free) | Near-zero: copy variable values into `global.css`; no dependency | Active; largest shadcn-theming mindshare | **Primary for tokens** |
| **3. gluestack-ui v2** | Compatible (NativeWind v4.1, copy-paste) **but** ships its own provider + `@gluestack-ui/*` deps + token conventions | MIT | Higher: provider/config wiring, runtime deps, reconciling token models | Active (v2 stable on NativeWind v4.1) | **Mine selectively, not co-primary** |
| *NativeCN / nativecn-ui* | Compatible but redundant with RNR; smaller catalog; fragmented forks | MIT | Low | Less established than RNR | **Skip as primary; raid for a missing component only** |

### Recommendation (directional)

1. **Double down on React Native Reusables.** It's the only zero-lock-in perfect fit and is actively maintained. We already own RNR primitives in `src/components/ui/`; the gap is that we use a *fraction* of the catalog. `rn-primitives` covers accordion, dialog, dropdown-menu, popover, select, switch, tabs, tooltip, progress, avatar, radio-group and more — exactly the higher-order pieces the redesign (path map, switchers, sheets, tabs) will need. Pull them in via copy-paste or the `@react-native-reusables/cli` registry as Part 4 designs land.
2. **Use tweakcn for the palette/theming refresh.** Fastest path to a polished, contrast-checked light/dark palette in our exact variable names. **One discipline:** export in **HSL** (not OKLCH / Tailwind-v4 `@theme`) — NativeWind v4 expects HSL/RGB channel values, and our tokens are already HSL (e.g. `--primary: 239 84% 67%`). Treat it as a palette *source*, not a config to paste verbatim.
3. **Treat gluestack-ui v2 as a donor library only.** If a composed block exists there that RNR lacks, port the *idea* — don't run its provider + deps alongside RNR (two overlapping primitive/theming systems).

**Net:** the two safe, high-leverage bets — **RNR full catalog (#1)** and **tweakcn HSL token export (#2)** — are pure additions to the locked stack with no new runtime dependency and no styling conflict. No re-platforming, fully inside ADR-029.

---

## Handoff

- **→ Part 3 (Information Architecture, #99):** use §2 (home patterns) — especially the #1+#3 hybrid — as the menu of "start in the action" structures to choose the landing surface and navigation model from.
- **→ Part 4 (Screen Design, #100):** use §1 (per-surface catalogue) as the reference library to design each screen against, and §3 to know which RNR components/blocks and token palette to build with.
- **→ Part 5 (Design-System Foundation, #101):** §3's RNR-catalog and tweakcn token recommendations are the concrete inputs for extending tokens + the component library.

---

## Sources

**Learning-app patterns:** [Duolingo onboarding](https://goodux.appcues.com/blog/duolingo-user-onboarding) · [Duolingo home redesign](https://blog.duolingo.com/new-duolingo-home-screen-design/) · [Duolingo streaks](https://duolingo.deconstructoroffun.com/mechanics/streaks) · [Brilliant teardown](https://screensdesign.com/showcase/brilliant-learn-by-doing) · [Brilliant + Rive](https://rive.app/blog/how-brilliant-org-motivates-learners-with-rive-animations) · [Khan Academy redesign](https://www.scottliang.com/work/khan-academy-redesign) · [Sololearn](https://www.sololearn.com/en/) · [Sololearn App Store](https://apps.apple.com/us/app/sololearn-learn-to-code/id1210079064) · [Headspace onboarding](https://raw.studio/blog/how-headspace-designs-for-mindfulness/) · [Headspace UI critique](https://uisources.com/app/headspace) · [Mimo teardown](https://screensdesign.com/showcase/mimo-learn-codingprogramming)

**Component kits / tokens:** [React Native Reusables docs](https://reactnativereusables.com/docs) · [RNR repo](https://github.com/founded-labs/react-native-reusables) · [RNR CLI](https://www.npmjs.com/package/@react-native-reusables/cli) · [rn-primitives](https://rn-primitives.vercel.app/) · [tweakcn](https://tweakcn.com/) · [shadcn theming](https://ui.shadcn.com/docs/theming) · [gluestack-ui v2 + NativeWind](https://gluestack.io/blogs/gluestack-ui-v2-stable-release-with-nativewind-v4-1-support) · [gluestack repo](https://github.com/gluestack/gluestack-ui) · [NativeCN](https://www.nativecn.xyz/)
</content>
</invoke>
