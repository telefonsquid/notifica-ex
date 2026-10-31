# notifica-ex

Self-hosted notes app in the spirit of Google Keep: text, list, markdown and image notes, note groups, per-note styling, multi-user sharing, and reminders pushed through [ntfy](https://ntfy.sh) with custom recurrence (every n days/hours, fixed time of day, odd intervals like 16 h). Later: an Android app as share target, and recurring tasks that can be checked off from the notification.

Main goals, in order: human readability, long-term maintainability, a distinct minimal look with deliberate motion.

## Memory upkeep

This file is the agent's memory. Keep it lean.

- Update it in the same change that makes it stale (new convention, decision, skill).
- Only record what the code and git history don't already say.
- Once a topic outgrows a few lines here, move it into a skill and leave a one-line pointer below.
- Review occasionally: delete what no longer holds, merge what repeats.

## Skills

Live in `.claude/skills/<name>/SKILL.md`. Status `planned` means the file doesn't exist yet.

| Skill | Covers | Status |
|---|---|---|
| `theming` | Token layers (color, layout, spacing, radius, motion), theme switching, the Tailwind palette | planned |
| `motion` | Easing/duration tokens, transition patterns, view transitions, reduced motion | planned |
| `data-model` | PocketBase collections, access rules, sharing, migrations | planned |
| `reminders` | Recurrence model, scheduler, ntfy delivery and actions | planned |
| `android` | Android client, share target, notification actions | planned |

## Stack

Bun, SvelteKit 3 + adapter-node, Svelte 5 (runes, experimental remote functions and async), TypeScript 6, PocketBase, Tailwind 4, lucide, zod. bits-ui for dialogs and menus, marked for markdown notes (`#lib/markdown.ts` escapes raw HTML and filters link schemes). Docker compose for deployment.

Ports: dev server 55560, PocketBase 8091, ntfy 8092. `.claude/launch.json` starts the dev server for the preview pane.

Reference implementation for structure and conventions: `D:\Repositories\fsd-flight-check`. Follow its architecture, not its visual style.

## SvelteKit 3 differences

Most docs and examples online, and fsd-flight-check, are still SvelteKit 2. In this repo:

- **`#lib` instead of `$lib`**: a subpath import in `package.json`. Imports need the file extension: `#lib/motion.ts`, `#lib/ui/Button.svelte`, `#lib/themes/index.ts`.
- **Env vars** are declared and validated with zod in `src/env.ts` and imported by name from `$app/env/private` or `$app/env/public`. `$env/*` no longer exists. New variables go into `env.ts`, `.env.example` and the compose file.
- **`$app/env`** replaces `$app/environment`.
- **Hook types** (`Handle`, `HandleServerError`, `sequence`) come from `@sveltejs/kit/hooks`. Remote function validation errors arrive in `handleError` with `kind: 'validation'`.
- **`resolve()`** from `$app/paths` takes route ids including groups: `resolve('/(app)/settings')`. The eslint rule requires it for every `href` and `goto`.
- **tsconfig** extends `$app/tsconfig`.

## Conventions carried over from fsd-flight-check

- **Server data access**: remote functions in `src/routes/api/*.remote.ts`, wrapped by `#lib/server/remote_function_error_trace` so rejected arguments get logged. Every argument has a zod schema; size caps live in `#lib/schema_limits.ts`.
- **Query layer**: `#lib/server/queries.ts` returns `Result<T>`; callers `unwrap()` into a SvelteKit error. Client calls go through `safeAction()`, which turns errors into toasts.
- **Auth**: `hooks.server.ts` re-verifies the PocketBase cookie on every request and exposes `locals.user`. The client-side `pb` instance in `#lib/pocketbase.ts` is never imported into server files.
- **Global dialogs**: state in `#lib/singletons/*.svelte.ts` (+ `createDialogPromise` for awaited results), component mounted once in the root layout.
- **Folders**: `#lib/ui` holds generic primitives, `#lib/components` holds domain components, `#lib/server` holds server-only code.
- **Bootstrap**: `pocketbase/pb_schema.json` is imported on first start through `POST /api/migration`, guarded by `SERVER_AUTH_SECRET`. Versioned data migrations run from the same endpoint.
- **Deployment**: compose with `web`, `pocketbase` (entrypoint upserts the superuser) and a one-shot `migration` curl container. PocketBase cron hooks call SvelteKit endpoints for scheduled work.
- **Comments**: uppercase section labels (`// FETCH DATA`), `// ====` dividers between groups of functions. CSS comments must be `/* */`.
- Use the Svelte MCP (`svelte-autofixer`) on every component written or changed.

## Look and motion

Until the `theming` and `motion` skills exist:

- **Palette** in `src/app.css` `@theme`. Themes in `#lib/themes/*.css` set `--theme-*` colors and may override the `--layout-*` defaults (widths, gutters, gaps, paddings, radii). `@theme inline` maps both onto utilities like `bg-card`, `text-ink-muted`, `p-card`, `w-rail`. Components use those utilities only, never palette colors directly.
- **Theme choice** is a cookie, rendered into `%theme%` by `hooks.server.ts` so the first paint is right. `#lib/themes/switch.ts` reveals the new theme as a circle from the click point.
- **Label tabs** sit on the top or bottom card edge, a per-device `labels` cookie (`#lib/preferences.ts`) rendered into `<html data-labels>` the same way.
- **Settings page** has four sections: Appearance (device preferences), Behaviour, Account, Users (admin only).
- **Motion tokens** (`--ease-*`, `--duration-*`) live in CSS. `#lib/motion.ts` reads them for JS transitions (`rise`, `sink`, `stagger`) and returns 0 durations under reduced motion.
- **Page changes** use view transitions from the root layout; `.vt-rail`, `.vt-page` and `.vt-rail-indicator` name the moving parts.

## Decisions

- **No encryption** beyond TLS for now. E2E was considered and dropped (2026-10-31): too costly for search, sharing and reminder text.
- **Groups are labels**: a note can carry several, groups act as filters. Each label has a colour from the note palette and shows as a folder tab on the card's edge, named only on hover.
- **Accounts by admin invite** with a set-password link, as in fsd-flight-check. No open signup.
- **Android via Tauri 2 mobile**, reusing the Svelte UI; Kotlin plugin for share target and notification actions.
- **Light by default**: Platinum theme first, Charcoal (dark) second. Tangerine accent, Powder Blue secondary in both.
- **UI language**: English.
- **Live UI through PocketBase realtime**: the root layout hands the auth token to the browser (the cookie stays httpOnly), the `(app)` layout connects once, pages subscribe with `onCollectionChange()` from `#lib/realtime.ts` (bursts coalesce into one refresh) and react with `query().refresh()` for remote queries, `invalidateAll()` for load data. Collection rules decide which events a user receives, so every new collection needs list/view rules before it gets subscribed to. After a reconnect everything is invalidated once to catch missed events.
- **Deactivated users** lose running sessions: `hooks.server.ts` rejects them on every request.
- **Reminders via bundled ntfy**: official ntfy image as its own compose service, the app publishes over HTTP. Recurring tasks get checked off through ntfy `http` action buttons that call back into our API.
- **One reminder per note**, stored with its own IANA timezone so fixed times of day survive DST and dates render the same on server and client. `next` is the coming occurrence, `sent` the last pushed one, `done` the occurrence checked off. Missed occurrences collapse into one push.
- **Done links are signed**: the ntfy button posts `{occurrence, signature}`, an HMAC over reminder id and occurrence with `SERVER_AUTH_SECRET`. No login on the phone needed, and a stale button does nothing.
- **No versioned migrations before the first release**: `pocketbase/pb_schema.json` is the schema, dev re-imports it on every `POST /api/migration`.
- **Note colours** are names from `NOTE_COLORS` (tints, solids, stickies, textures), shared by notes and labels and stored as the name, never a hex value. Adding one means `schemas.ts`, both `color` selects in `pb_schema.json` and `note_colors.css`. Elements set `data-note`, `#lib/note_colors.css` paints `.note-surface` and `.note-mark` from it. Tints and stickies come from each theme's `--theme-note-*`. Its WHITE INK and DARK INK groups override the `--theme-*` tokens inside the note, so components get readable ink without knowing.
- **Views** replace fixed pages: each is a saved filter and sort (`#lib/views.ts`, matched in the browser) with a rail slot and an icon stored by name (`#lib/view_icons.ts`). Route `(app)/[[view]]`, the first view lives at `/`. New accounts get Notes and Reminders, the last view can't be deleted.
- **Rail views render unkeyed**: a keyed `#each` there froze the page on the second reorder (Svelte 5.57).
