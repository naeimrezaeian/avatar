# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Run from the repo root (npm workspaces):

```bash
npm run dev        # next dev (Turbopack) on :3000
npm run build      # next build — also runs TypeScript; this is the type gate
npm run lint       # eslint in apps/web
npm run typecheck  # tsc --noEmit across workspaces
```

`next lint` was removed in Next 16 — `next build` no longer lints, so run `lint` separately.

Checks live in `apps/web/scripts` and are assertion scripts, not a test runner:

```bash
npm run check          # data + editor + admin + system, in Node against fake-indexeddb
npm run check:api      # HTTP checks of auth and permissions — needs a running server
npm run check:timeline # drag, trim, snap and undo driven by a real mouse — needs a server
npm run check:theme    # every page screenshot-audited for stray colours (Playwright)
npm run check:browser
```

## Layout

- `apps/web` — Next.js 16 (App Router, React 19, Tailwind v4, shadcn/ui on Base UI).
- `apps/web/src/server` — server side: SQLite, repositories, sessions, permissions. Everything there is `import "server-only"`.
- `packages/contracts` — zod schemas + derived types, the shared domain contract.

`@avatar/contracts` is consumed as **source**, not a build artifact: `transpilePackages` in `next.config.ts` plus a `paths` entry in `apps/web/tsconfig.json`. There is no dist step to keep in sync.

**`experimental.turbopackScopeHoisting` is off, and must stay off** while contracts are consumed as source. Turbopack's scope hoisting reorders module init when a transpiled package lands in a server chunk shared by two or more route handlers; the build dies with `Cannot access 'am' before initialization` inside `contracts/primitives.ts`. One route builds fine, two do not. Building contracts to a dist would also fix it — at the cost of the sync step we deliberately avoided.

**Root `devDependencies` must keep `@types/react`/`@types/react-dom`.** npm hoists `react`, `next-themes`, and `@base-ui` to the root `node_modules`; without React types at that level their `.d.ts` files cannot resolve the React namespace, and props like `children` silently vanish from third-party component types.

## Two decisions that shape everything

**1. The generation model is `LongCat-Video-Avatar` / `Avatar-1.5`, not the base `LongCat-Video`.** The base model does text-to-video, image-to-video, and continuation only — no lip sync. The Avatar variant takes reference image + audio + text prompt and does audio-driven generation, 5 s to 10 min per run.

Consequences that are already encoded in the contracts:

- The pipeline is **sequential**: script → TTS with the cloned voice → audio → (image + audio + prompt) → video. Video cannot run in parallel with speech synthesis; speech is its input.
- **A scene's duration is set by its voiceover, not by the user.** `AvatarClip` is duration-locked (`isDurationLocked`) — stretching it on the timeline would desync lips from audio. To change length, edit the script and regenerate.
- Generate the voiceover first (cheap, seconds), let the user hear it, then spend credits on video (expensive, minutes).
- The prompt controls **non-speech** behaviour — gestures, framing, pauses. Speech comes from the script text.

**2. Phase 1 is a vertical slice, not all 21 sections.** Order: auth → avatar → project → scene → timeline → export. Admin, roles, plans, templates, and collaboration come after the slice works end to end. The spec's own phasing (all frontend, then backend, then AI) was rejected because the editor's document schema *is* the backend contract.

## Where data lives (mid-migration)

Ownership is split, deliberately and temporarily:

- **The server owns identity** — users, credentials, sessions, verification tokens — in SQLite (`node:sqlite`, file at `apps/web/.data/avatar.sqlite`, migrations by `PRAGMA user_version` in `src/server/db.ts`). The session id is an httpOnly cookie; `src/proxy.ts` only checks that the cookie exists (an optimistic check, as the Next docs prescribe), and every route handler re-checks it against the database. Permissions are enforced in `src/server/authorize.ts`, not by hiding buttons.
- **The browser still owns content** — projects, documents, avatars, voices, assets, credits, jobs — in IndexedDB via `dataClient`.

Consequences to keep in mind until the second half migrates: a newly registered user gets their credit account created client-side by the register form; the admin screen fetches users over HTTP and joins them with counts read locally; the demo user id is pinned to `usr_demo` on both sides, because the browser's demo projects are keyed by it.

`src/lib/auth/ports.ts` is the seam. Swapping the browser implementation for `httpAuthService` changed no screen — that is the same trick to repeat for `dataClient`.

## Domain model

Everything lives in `packages/contracts/src`. Read `project.ts` and `timeline.ts` before touching the editor.

- **`ProjectDocument`** is the editable content, split from the `Project` card used in lists. Entities are stored as **dictionaries keyed by id with separate order arrays** (`scenes`/`sceneOrder`, `tracks`/`trackOrder`, `clips`). This is deliberate: Immer patches then address one object (`clips/<id>/startSec`), so autosave ships tens of bytes, undo/redo gets exact inverse patches, and the structure upgrades to collaborative editing without a rewrite. `revision` guards concurrent writes from two tabs.
- **Scene vs track.** A scene is a *unit of generation*; the timeline is *composition*. A scene yields one avatar clip; other tracks (music, images, text, subtitles) are free-floating.
- **Scene state is derived, never stored** — `sceneGenerationState()` compares input hashes so edited-after-generation results show as `outdated`. A stored status would drift from the script on every keystroke.
- **Credits are seconds internally, minutes in the UI** (`estimateCostSeconds`, `secondsToMinutesLabel`). Spending goes through a **hold**: `CreditHold` reserves, then commits or releases. A plain "check balance before starting" is a race — two tabs both pass and overdraw. `availableSeconds()` = balance − reserved, and the UI shows the reservation rather than hiding it.
- **Aspect ratio belongs to the project**, chosen at creation and read-only after. Scene composition depends on the frame; `ExportSettings.aspectRatio` only records what was used.
- **Consent is a record, not a checkbox.** Face and voice are biometric personal data: `ConsentRecord` carries the document version, grant time, and revocation. Avatars and voices cannot enter `processing` without an active consent of the matching kind.
- **Subtitles come from forced alignment of the known script**, not ASR — `SubtitleCue`. The text already exists; ASR would only add errors and cost.
- **Permissions are data** (`PERMISSIONS`, `ROLE_PERMISSIONS`, `can()`), not `role === 'admin'` checks. Navigation filters itself through `can()`.

## Design tokens

`apps/web/src/app/globals.css` is the single source. Palette follows §14 of `task.md`: light cool background, deep navy navigation (dark in **both** themes — it's a brand anchor, not a derivative of the background), violet→blue accent gradient, soft shadows, rounded cards.

- Use `bg-gradient-accent` / `text-gradient-accent` rather than re-picking gradient stops per component.
- Timeline tracks have fixed tokens (`--track-avatar`, `--track-music`, …) — eight tracks must be distinguishable instantly, so the colors are not chosen ad hoc in components.
- In dark mode `--primary` lightens; deep navy stops being contrasty against a dark background.
- Fonts are Inter + JetBrains Mono with the **cyrillic** subset — Geist's default latin subset does not cover the Russian UI.

## Working agreements (from `task.md`, §"Важно")

- **Communicate with the user in Russian.**
- Surface design/spec concerns with reasoning before implementing a new area.
- Use the **Graphify** skill (`/graphify`) for locating related files and persisting project knowledge.
- Git remote per spec: `git@github.com:naeimrezaeian/avatar.git`.

## Next.js 16 specifics

`apps/web/AGENTS.md` (auto-generated) points at bundled docs in `apps/web/node_modules/next/dist/docs/` — consult them rather than memory. Already relevant here: Turbopack is the default, `middleware` is renamed to `proxy` (matters when auth route protection lands), `params`/`searchParams`/`cookies()`/`headers()` are async-only, and `typedRoutes` is on, so every `href` must correspond to a real route or the build fails.
