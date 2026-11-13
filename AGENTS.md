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
| `theming` | Token layers (color, layout, spacing, radius, motion), theme switching, the Tailwind palette | available |
| `motion` | Easing/duration tokens, transition patterns, view transitions, reduced motion | available |
| `data-model` | PocketBase collections, access rules, sharing, migrations | available |
| `reminders` | Recurrence model, scheduler, ntfy delivery and actions | available |
| `android` | Tauri shell, connect page, toolchain, running on a phone | available |

## Releases

The app is in use since 0.1.0. Never break an existing install: schema changes come with a versioned migration that keeps old data, new env vars are optional with a default, the Android app keeps working against an older server.

Servers deploy only tagged releases (`vX.Y.Z`), not master. A release:

1. Add a section on top of `CHANGELOG.md`: `## X.Y.Z · YYYY-MM-DD`, one bullet per commit subject part since the last tag (split at ` | `), worded as in the commits.
2. Set the version in `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`.
3. Commit as `released X.Y.Z`, tag `vX.Y.Z` on it, push the commit and the tag.

The tag push runs `.github/workflows/android.yml`: it builds the signed APK, publishes it to the F-Droid repo on Pages and attaches it to a GitHub release. Phones update through F-Droid. Details in the `android` skill.

## State machines

`docs/state-machines.md` lists every machine in the app, with states, invariants and transitions, and the issues the audit found. A change to a machine updates its table in the same commit.

## Stack

Bun, SvelteKit 3 + adapter-node, Svelte 5 (runes, experimental remote functions and async), TypeScript 6, PocketBase, Tailwind 4, lucide, zod. bits-ui for dialogs and menus, marked renders notes (`#lib/markdown.ts` escapes raw HTML and filters link schemes), Tiptap edits them, web-push sends browser notifications. Docker compose for deployment.

Ports: dev server 55560, PocketBase 8091, ntfy 8092. Server side URLs use `127.0.0.1`, Node tries IPv6 first for `localhost` and loses about 250 ms on every new connection. `.claude/launch.json` starts the dev server for the preview pane.

**Use `bin/agent-cli` first**, prefer it over re-reading files or guessing commands: `stack [up]` (Docker, containers, health), `pb [collection [id]]` (read PocketBase as superuser, `--schema`), `migrate`, `verify` (check, lint, test, only the problems), `versions` (release files in step, commits since the tag). Each has `--help` and `--json`. A command run in more than one session becomes a subcommand there.

Reference implementation for structure and conventions: `D:\Repositories\fsd-flight-check`. Follow its architecture, not its visual style.

## SvelteKit 3 differences

Most docs and examples online, and fsd-flight-check, are still SvelteKit 2. In this repo:

- **`#lib` instead of `$lib`**: a subpath import in `package.json`. Imports need the file extension: `#lib/motion.ts`, `#lib/ui/Button.svelte`, `#lib/themes/index.ts`.
- **Env vars** are declared and validated with zod in `src/env.ts` and imported by name from `$app/env/private` or `$app/env/public`. `$env/*` no longer exists. New variables go into `env.ts`, `.env.example` and the compose file.
- **`$app/env`** replaces `$app/environment`.
- **Hook types** (`Handle`, `HandleServerError`, `sequence`) come from `@sveltejs/kit/hooks`. Remote function validation errors arrive in `handleError` with `kind: 'validation'`.
- **`resolve()`** from `$app/paths` takes route ids including groups: `resolve('/(app)/settings')`. The eslint rule requires it for every `href` and `goto`. `paths.relative` is off: relative paths read the request url, which a query may not, and turned notification links into `../../`.
- **tsconfig** extends `$app/tsconfig`.
- **Origin** is build time config (`paths.origin` in `vite.config.ts`, fed by `ORIGIN`), adapter-node no longer reads it at runtime and otherwise assumes https from the `Host` header.

## Conventions carried over from fsd-flight-check

- **Server data access**: remote functions in `src/routes/api/*.remote.ts`, wrapped by `#lib/server/remote_function_error_trace` so rejected arguments get logged. Every argument has a zod schema; size caps live in `#lib/schema_limits.ts`.
- **Query layer**: `#lib/server/queries.ts` returns `Result<T>`; callers `unwrap()` (`#lib/server/result.ts`) into a SvelteKit error. Client calls go through `safeAction()`, which turns errors into toasts.
- **Tests**: `bun run test`, `*.test.ts` next to the code they cover. Pure logic only (recurrence, markdown, views), the UI gets checked in a browser.
- **Auth**: `hooks.server.ts` re-verifies the PocketBase cookie on every request and exposes `locals.user`. The client-side `pb` instance in `#lib/pocketbase.ts` is never imported into server files.
- **Links with a query** (`?note=`, `?view=`) are built and read only through `#lib/links.ts`.
- **Global dialogs**: state in `#lib/singletons/*.svelte.ts`, component mounted once in the root layout.
- **Folders**: `#lib/ui` holds generic primitives, `#lib/components` holds domain components, `#lib/server` holds server-only code.
- **Bootstrap**: `pocketbase/pb_schema.json` is imported on first start through `POST /api/migration`, guarded by `SERVER_AUTH_SECRET`. Versioned data migrations run from the same endpoint.
- **Deployment**: compose with `web`, `pocketbase` (entrypoint upserts the superuser) and a one-shot `migration` curl container. PocketBase cron hooks call SvelteKit endpoints for scheduled work.
- **Comments**: uppercase section labels (`// FETCH DATA`), `// ====` dividers between groups of functions. CSS comments must be `/* */`.
- Use the Svelte MCP (`svelte-autofixer`) on every component written or changed.

## Look and motion

Tokens, themes, note colours and device preferences: `theming` skill. Everything that moves: `motion` skill. On top of those:

- **Settings page** has six settings sections: Appearance (device preferences), Views, Labels, Notifications, Account and Users (admin only). After them an app group, Administration (admin only), About and Changelog, set apart in the tabs by a hairline break (`group` on the section). About shows versions, admins also see PocketBase (`pb_hooks/about.pb.js` reads `PB_VERSION` from the Dockerfile) and ntfy (optional `NTFY_VERSION` env, the compose file feeds it the image tag). The changelog is `CHANGELOG.md`, baked in at build time. The stage scrolls freely through all sections, no snap and no fading, the tab follows the section at its top (the last one at the very end). Every section has the same width and a numbered title with a printed rule beside it, a new group starts after a wider gap. No descriptions under titles. The tabs are a column on wide screens, a row of icon over name on tablets (long names take more room), and on phones a list on top that names the current section and folds the others out under a chevron.
- **Riso print**: buttons, the create button, rail, toasts, settings tabs and the auth page are printed in the loop logo's inks (orange, pink, blue), each over a second pass slipped bottom right. Tokens, utilities and `RisoIcon` in the `theming` skill.
- **Tooltips**: icon only buttons get `{@attach tip('Text')}` (`#lib/tooltip.svelte.ts`), the one `Tooltip` in the root layout shows it. Mouse and keyboard only, no `title` attributes. Skip it only where the icon is obvious (close X).
- **Inputs beside an icon** need inline padding of their own, else the caret at the start hides under the icon or the field edge (happened five times). Pill searches use the `search-field` utility in `app.css`, which pads its input. No icon tooltips inside pickers.
- **Resizable panels** take `resizable()` from `#lib/resizable.ts`, a bottom right corner grip. A size lasts only while the panel is open, nothing is remembered. Label picks render through `LabelChip`, the look of FilterEditor's Simple chips.
- **Number inputs** use `#lib/ui/NumberField.svelte` with its own stepper, not the browser spinner. Floating panels take the `popover` utility from `app.css` for their open and close animation. Rename in place goes through `#lib/ui/InlineInput.svelte` (Enter or blur saves, empty or rejected snaps back).
- **Note menu**: `NoteMenu.svelte` holds the actions for one card or the whole selection and renders as items in the card's `ContextMenu` (right click, touch long press) or, with `bar`, as icon buttons in the selection bar. A mouse long press, a Ctrl or Shift click or the menu's Select starts the selection, then a click on a card toggles it and a Shift click sets every card between it and the last one clicked, in grid order, to the clicked card's new state. A hovered closed card shows a select circle on its top right corner, where the filled check of a selected card sits, and pin and archive buttons that the header's lock and faces step aside for (mouse only). They sit on a copy of the card's background (`.card::before`, clipped to their spot) that hides the text under them, the text never rewraps for them. A selected card gets a still, dense `--theme-signature` wash. Menus use the `menu`, `menu-item` and `menu-separator` utilities from `app.css`.

## Decisions

- **No encryption** beyond TLS for now. E2E was considered and dropped (2026-10-31): too costly for search, sharing and reminder text.
- **Locked notes** are the one exception (2026-11-08): the owner locks a single note, the browser encrypts its body with a key wrapped by the account password, the server never sees the text. Unshared and without files only, title, labels and reminders stay readable. Changing the password in Settings rewraps the key, a reset by mail loses the text. Each note unlocks with its own password entry and stays readable in that tab until the key goes on reload, logout or 5 minutes hidden. A closed locked card shows its lock in the title row over grey stripes, one line high. Android biometrics and passkeys are planned next. Details in the `data-model` skill.
- **Groups are labels**: a note can carry several, groups act as filters. Each label has a colour from the note palette and shows as a folder tab on the card's edge, named only on hover.
- **Accounts by admin invite** with a set-password link, as in fsd-flight-check. No open signup. Admins deactivate or delete accounts, a delete takes everything the account owns.
- **Android via Tauri 2 mobile**: a shell whose webview opens the server, asked once on a bundled connect page. Other apps share text and images into a new note. Details in the `android` skill.
- **UI language**: English.
- **Deactivated users** lose running sessions: `hooks.server.ts` rejects them on every request.
- **An outage is not a logout**: `#lib/server/outage.ts` turns a connection failure into a 503 and the session cookie stays. Pages in `(app)` show it on `+error.svelte`, the browser polls `/api/health` and shows `ServerBanner`, then reloads the data by itself. `safeAction()` asks the health check before it toasts, so failed calls don't pile up.
- **AI access through MCP**: `/mcp` speaks the Model Context Protocol as stateless Streamable HTTP (one JSON-RPC message per POST, JSON back, no sessions). Callers bring a per user API key (`Authorization: Bearer nex_…`), made in Settings → Account and shown once, stored as a sha256 hash with a read or write scope and an optional expiry. A read key doesn't even see the tools that change things. The tools in `#lib/server/mcp/tools.ts` go through the same owner and sharing checks as the remote functions and never delete notes. The admin switch is the `aiAccess` limit. OAuth was left out for now.
- **Google import**: Settings → Account takes a Takeout `.zip` (or its JSON files), read in the browser (`#lib/zip.ts`, `#lib/google_import.ts`). Keep notes keep colour, labels, pin, archive and files, each Tasks list becomes one checklist note, due dates as text on open tasks. An open dated task also gives its list note a task reminder: Takeout's `scheduled_time` gives the moment (midnight means only a day, then 7:00 in that zone, the older `due` field too), the list's `recurrences` the repeat (a schedule it can't express goes off once), a past one lands finished. Done rounds of repeating tasks (`PAST_HIDDEN`) are left out. Takeout has no Keep reminders, the import block says so. Reminders come only with notes new this time. Notes go up in batches through `imports.remote.ts`, files after them through the usual upload routes. The note id derives from owner and source (`importedId()`), so a second import only adds what is new, no schema field needed.
- **Reminders reach three channels**, each with its own switch: the Android app's background service, browser Web Push and the bundled ntfy. Each reminder has its own timezone, Done buttons are signed. The Android switch lives on the account (`appPaused`), so a browser can silence the phones too. Details in the `reminders` and `android` skills.
- **Files and limits**: any note takes attachments next to its images. On/off, largest attachment and largest image come from the uploader's limits, storage from the note owner's. Administration sets server defaults (100 MB, 15 MB, 1 GB, on) and per user overrides, a turned off feature leaves existing files readable and removable. Details in the `data-model` skill.
- **Data**: collections, access rules, sharing, images, realtime and schema changes in the `data-model` skill.
- **Light by default**: Platinum first, Charcoal second, see the `theming` skill.
- **Manual order like Keep**: sort `manual` is the default, new notes land first. Drag works with mouse and pen only, in a manual sort, with nothing open or selected.
- **Views** replace fixed pages: each is a saved filter and sort (`#lib/views.ts`, matched in the browser) with a rail slot and an icon stored by name: any lucide icon, the picker shows a curated set (`VIEW_ICONS`) above a search over all of them, others load lazily (`viewIcon()` in `#lib/view_icons.ts`). New notes start with what the view's filter demands (`noteDefaults()`): the one colour, every required label, pinned or archived, never a rule that leaves a choice. Route `(app)/[[view]]`, the first view lives at `/`. New accounts get Notes, Reminders and Archived, the last view can't be deleted. The toolbar has separate Sort (`SortEditor`) and Filter (`FilterEditor`) popovers, each with an accent dot while its part differs from the saved view. Both end in the same `viewActions` band (save as new, save to view), shaded and only there while something differs. View settings show the two side by side. `FilterEditor` has a Simple mode (search, an icon bar for pinned, reminder, open tasks (`SIMPLE_TOGGLES` in `#lib/views.ts`) and a three step archive toggle, label picks, no headings) and an Advanced one, switched by a pill floating above the box top right that names the other mode and badges how many filters Simple can't show, Clear floats beside it. Picked labels show by check and full colour, no ring. Label chips wear the card tabs' `note-mark type-meta` look.
- **Rail views render unkeyed**: a keyed `#each` there froze the page on the second reorder (Svelte 5.57).
- **Auto color labels**: a label with `autoColor` paints notes carrying it, derived at render (`shownColor()`), nothing is written to notes. A note's own colour wins, without one the highest label in the Settings chart decides, even when that label is plain. Colour filters match the shown colour. Labels belong to the owner, so collaborators see only the own colour. The account's default colour (Settings → Appearance, Default note color) lands on new notes marked `colorDefault`: auto labels paint over it, a colour picked on the note clears the mark and Default in the picker brings it back. Plain is a colour of its own, so labels don't paint it.
- **Drag lists**: `sortable()` in `#lib/drag_list.ts` drives the priority chart and the rail. Mouse and pen on the row, touch only from a `data-drag-handle`.
- **Notes are markdown only**: the body is the single source, checklists included as `- [ ]` lines. `MarkdownEditor` edits it rich through Tiptap or raw in a textarea. Cards tick tasks by index through `toggleTask()`. Prose and checklist styles for both renderers live in `#lib/markdown.css`.
- **Notes edit in place**, no modal: one `Note` component is both card and editor, opening keeps every element and adds the open only ones (`open-only` in `app.css`, fading in after the card grew, out before it shrinks). Tiptap loads on hover and a skeleton toolbar holds its place until then. The open card spans two grid columns when there is room and saves on a click outside or Escape, no Done button. In a grid of 8 or more notes on a screen 40rem or wider it floats to the screen centre instead, over a page dimmed by its ghost's shadow, and the grid stays still (box shadows only, no blur). A click behind it only closes it, nothing behind reacts. It resizes by a bottom right grip (`resizable()` in `NoteOpening`, the text scrolls while the formatting bar and reminder band stay at the bottom) and glides back quicker than it opened. List items (bullet, numbered and checklist) drag by a handle through `sortable()` (`MarkdownEditor`), the handle sits at the row's right end: the text scrolls in its own box, which clips anything left of it. Colour, archive and delete join the pin in the header once the card is 26rem wide. The grid order is frozen while a card is open so autosaves don't move it. Labels show as tabs beside the card, not on it, with a remove button and `LabelAdder` as the last tab. A click on a tab name, open card or closed, offers Edit label (`LabelEditor`: colour, rename, delete everywhere) or Show only this label, which narrows the view's draft filter.
- **Sharing**: owner picks people, collaborators edit content and add their own reminders, the rest stays with the owner. Delete becomes Leave for them. Details in the `data-model` skill.
- **Phones get one bottom row**: below `sm` the rail collapses into a menu button bottom left, as big as the create button, that spreads a fullscreen menu (views, settings, logout as named rail items) out of itself. The toolbar sits bottom right. Under 31rem of container width the grid is one full width column, with the compact density (Appearance) phones keep two. Opening a note scrolls all of it into view.
- **Deletes that reach further ask in a dialog**: labels and views go through `#lib/deletions.ts`, which awaits `confirmAction()` (the one `ConfirmDialog` in the root layout). No click twice buttons.
- **Note deletes wait for an Undo**: a deleted or left note hides at once (`hiddenNotes`), the server hears of it when the toast ends. A closing page sends what waits through `POST /api/notes/removals` with `keepalive`, logout finishes it first. Archive offers the same Undo, it only needs to put the old values back.
- **Keyboard**: `/` opens the search, `n` a new note, Ctrl+A selects every note of the view, Delete removes the selection, none of them while typing. Rail views (`ViewMenu`, with New view, which lands in Settings with a fresh view open) and the label tabs of an open card have their own right click menus, touch long press opens them too.
- **Unsaved notes hold navigation**: `beforeNavigate` cancels, saves, then repeats the navigation. Closing or reloading the page doesn't wait, nor asks. Logout saves open cards first (`saveOpenNotes`), the way to `/login` itself never waits.
- **Unsaved notes outlast the page**: every unstored change also goes to `localStorage` (`#lib/drafts.ts`), the next page load sends what pages now gone left behind. A reload keeps the backup even if its last save lands, the new page may have read the older list. A note changed elsewhere meanwhile stays as it is, the edits become a note of their own. Web Locks tell live tabs from gone ones and keep two loading pages from both sending. Images in upload don't count, they need the server. There is no offline start: without the server the app shows its error page and restores once back.
- **Back closes before it navigates**: browser back and the Android gesture send an Escape (`closeOverlay()` in `#lib/back.ts`), a handler that acts on Escape must `preventDefault()` so back stops there. Dialogs, popovers, menus, the viewer, an open note and the selection all count.
- **No blur anywhere**: neither `filter` nor `backdrop-filter`, it costs too much per frame. Things floating over content are opaque, soft glows are box shadows.
- **New notes grow out of the create button**, which hides meanwhile. An empty one shrinks back into it, a saved one hands over to its grid card. The button gives up its width meanwhile so search and filter recentre. `edit()` awaits the editor before the snapshot (hover preloads it), else a second glide bumps the grid. The editor focuses through `view.focus()` since Tiptap's focus command scrolls and cut the page's smooth scroll short.
