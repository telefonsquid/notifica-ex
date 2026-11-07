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

## Stack

Bun, SvelteKit 3 + adapter-node, Svelte 5 (runes, experimental remote functions and async), TypeScript 6, PocketBase, Tailwind 4, lucide, zod. bits-ui for dialogs and menus, marked renders notes (`#lib/markdown.ts` escapes raw HTML and filters link schemes), Tiptap edits them, web-push sends browser notifications. Docker compose for deployment.

Ports: dev server 55560, PocketBase 8091, ntfy 8092. Server side URLs use `127.0.0.1`, Node tries IPv6 first for `localhost` and loses about 250 ms on every new connection. `.claude/launch.json` starts the dev server for the preview pane.

Reference implementation for structure and conventions: `D:\Repositories\fsd-flight-check`. Follow its architecture, not its visual style.

## SvelteKit 3 differences

Most docs and examples online, and fsd-flight-check, are still SvelteKit 2. In this repo:

- **`#lib` instead of `$lib`**: a subpath import in `package.json`. Imports need the file extension: `#lib/motion.ts`, `#lib/ui/Button.svelte`, `#lib/themes/index.ts`.
- **Env vars** are declared and validated with zod in `src/env.ts` and imported by name from `$app/env/private` or `$app/env/public`. `$env/*` no longer exists. New variables go into `env.ts`, `.env.example` and the compose file.
- **`$app/env`** replaces `$app/environment`.
- **Hook types** (`Handle`, `HandleServerError`, `sequence`) come from `@sveltejs/kit/hooks`. Remote function validation errors arrive in `handleError` with `kind: 'validation'`.
- **`resolve()`** from `$app/paths` takes route ids including groups: `resolve('/(app)/settings')`. The eslint rule requires it for every `href` and `goto`.
- **tsconfig** extends `$app/tsconfig`.
- **Origin** is build time config (`paths.origin` in `vite.config.ts`, fed by `ORIGIN`), adapter-node no longer reads it at runtime and otherwise assumes https from the `Host` header.

## Conventions carried over from fsd-flight-check

- **Server data access**: remote functions in `src/routes/api/*.remote.ts`, wrapped by `#lib/server/remote_function_error_trace` so rejected arguments get logged. Every argument has a zod schema; size caps live in `#lib/schema_limits.ts`.
- **Query layer**: `#lib/server/queries.ts` returns `Result<T>`; callers `unwrap()` (same file) into a SvelteKit error. Client calls go through `safeAction()`, which turns errors into toasts.
- **Tests**: `bun run test`, `*.test.ts` next to the code they cover. Pure logic only (recurrence, markdown, views), the UI gets checked in a browser.
- **Auth**: `hooks.server.ts` re-verifies the PocketBase cookie on every request and exposes `locals.user`. The client-side `pb` instance in `#lib/pocketbase.ts` is never imported into server files.
- **Global dialogs**: state in `#lib/singletons/*.svelte.ts` (+ `createDialogPromise` for awaited results), component mounted once in the root layout.
- **Folders**: `#lib/ui` holds generic primitives, `#lib/components` holds domain components, `#lib/server` holds server-only code.
- **Bootstrap**: `pocketbase/pb_schema.json` is imported on first start through `POST /api/migration`, guarded by `SERVER_AUTH_SECRET`. Versioned data migrations run from the same endpoint.
- **Deployment**: compose with `web`, `pocketbase` (entrypoint upserts the superuser) and a one-shot `migration` curl container. PocketBase cron hooks call SvelteKit endpoints for scheduled work.
- **Comments**: uppercase section labels (`// FETCH DATA`), `// ====` dividers between groups of functions. CSS comments must be `/* */`.
- Use the Svelte MCP (`svelte-autofixer`) on every component written or changed.

## Look and motion

Tokens, themes, note colours and device preferences: `theming` skill. Everything that moves: `motion` skill. On top of those:

- **Settings page** has six sections: Appearance (device preferences), Views, Labels, Notifications, Account, Users (admin only). The stage scrolls with `scroll-snap` so a section settles below a peek of its predecessor, the tab follows the scroll. Every section has the same width and a visible title, a hairline parts them. Sections other than the current one stay faint, a click on one scrolls there. No descriptions under titles. The tabs are a column on wide screens, an even row of icon over name on tablets, and on phones an icon bar beside the menu button, so they sit in the phones' one bottom row.
- **Tooltips**: icon only buttons get `{@attach tip('Text')}` (`#lib/tooltip.svelte.ts`), the one `Tooltip` in the root layout shows it. Mouse and keyboard only, no `title` attributes. Skip it only where the icon is obvious (close X).
- **Inputs beside an icon** need inline padding of their own, else the caret at the start hides under the icon or the field edge (happened five times). Pill searches use the `search-field` utility in `app.css`, which pads its input. No icon tooltips inside pickers.
- **Number inputs** use `#lib/ui/NumberField.svelte` with its own stepper, not the browser spinner. Floating panels take the `popover` utility from `app.css` for their open and close animation. Rename in place goes through `#lib/ui/InlineInput.svelte` (Enter or blur saves, empty or rejected snaps back).
- **Note menu**: `NoteMenu.svelte` holds the actions for one card or the whole selection and renders as items in the card's `ContextMenu` (right click, touch long press) or, with `bar`, as icon buttons in the selection bar. A mouse long press, a Ctrl or Shift click or the menu's Select starts the selection, then a click on a card toggles it and a Shift click sets every card between it and the last one clicked, in grid order, to the clicked card's new state. A selected card gets a faint breathing `--theme-signature` wash. Menus use the `menu`, `menu-item` and `menu-separator` utilities from `app.css`.

## Decisions

- **No encryption** beyond TLS for now. E2E was considered and dropped (2026-10-31): too costly for search, sharing and reminder text.
- **Groups are labels**: a note can carry several, groups act as filters. Each label has a colour from the note palette and shows as a folder tab on the card's edge, named only on hover.
- **Accounts by admin invite** with a set-password link, as in fsd-flight-check. No open signup.
- **Android via Tauri 2 mobile**: a shell whose webview opens the server, asked once on a bundled connect page. Other apps share text and images into a new note. Details in the `android` skill.
- **UI language**: English.
- **Deactivated users** lose running sessions: `hooks.server.ts` rejects them on every request.
- **An outage is not a logout**: `#lib/server/outage.ts` turns a connection failure into a 503 and the session cookie stays. Pages in `(app)` show it on `+error.svelte`, the browser polls `/api/health` and shows `ServerBanner`, then reloads the data by itself. `safeAction()` asks the health check before it toasts, so failed calls don't pile up.
- **Reminders reach three channels**, each with its own switch: the Android app's background service, browser Web Push and the bundled ntfy. Each reminder has its own timezone, Done buttons are signed. Details in the `reminders` and `android` skills.
- **Data**: collections, access rules, sharing, images, realtime and schema changes in the `data-model` skill.
- **Light by default**: Platinum first, Charcoal second, see the `theming` skill.
- **Manual order like Keep**: sort `manual` is the default, new notes land first. Drag works with mouse and pen only, in a manual sort, with nothing open or selected.
- **Views** replace fixed pages: each is a saved filter and sort (`#lib/views.ts`, matched in the browser) with a rail slot and an icon stored by name: any lucide icon, the picker shows a curated set (`VIEW_ICONS`) above a search over all of them, others load lazily (`viewIcon()` in `#lib/view_icons.ts`). New notes start with what the view's filter demands (`noteDefaults()`): the one colour, every required label, pinned or archived, never a rule that leaves a choice. Route `(app)/[[view]]`, the first view lives at `/`. New accounts get Notes, Reminders and Archived, the last view can't be deleted. The toolbar has separate Sort (`SortEditor`) and Filter (`FilterEditor`) popovers, each with an accent dot while its part differs from the saved view. Both end in the same `viewActions` band (save as new, save to view), shaded and only there while something differs. View settings show the two side by side. `FilterEditor` has a Simple mode (search, an icon bar for pinned, reminder, open tasks and a three step archive toggle, label picks, no headings) and an Advanced one, switched by a pill floating above the box top right that names the other mode and badges how many filters Simple can't show, Clear floats beside it. Picked labels show by check and full colour, no ring. Label chips wear the card tabs' `note-mark type-meta` look.
- **Rail views render unkeyed**: a keyed `#each` there froze the page on the second reorder (Svelte 5.57).
- **Notes are markdown only**: the body is the single source, checklists included as `- [ ]` lines. `MarkdownEditor` edits it rich through Tiptap or raw in a textarea. Cards tick tasks by index through `toggleTask()`. Prose and checklist styles for both renderers live in `#lib/markdown.css`.
- **Notes edit in place**, no modal: one `Note` component is both card and editor, opening keeps every element and adds the open only ones (`.extra`, fading in after the card grew, out before it shrinks). Tiptap loads on hover and a skeleton toolbar holds its place until then. The open card spans two grid columns when there is room and saves on a click outside or Escape, no Done button. Colour, archive and delete join the pin in the header once the card is 26rem wide. The grid order is frozen while a card is open so autosaves don't move it. Labels show as tabs beside the card, not on it, with a remove button and `LabelAdder` as the last tab. On an open card the tab name opens `LabelEditor` (colour, rename, delete everywhere).
- **Sharing**: owner picks people, collaborators edit content and add their own reminders, the rest stays with the owner. Delete becomes Leave for them. Details in the `data-model` skill.
- **Phones get one bottom row**: below `sm` the rail collapses into a menu button bottom left, as big as the create button, that spreads a fullscreen menu (views, settings, logout as named rail items) out of itself. The toolbar sits bottom right. Under 31rem of container width the grid is one full width column. Opening a note scrolls all of it into view.
- **Deletes that reach further ask in a dialog**: labels and views go through `#lib/deletions.ts`, which awaits `confirmAction()` (the one `ConfirmDialog` in the root layout). No click twice buttons.
- **Note deletes wait for an Undo**: a deleted or left note hides at once (`hiddenNotes`), the server hears of it when the toast ends. A closing page sends what waits through `POST /api/notes/removals` with `keepalive`, logout finishes it first. Archive offers the same Undo, it only needs to put the old values back.
- **Keyboard**: `/` opens the search, `n` a new note, Delete removes the selection, none of them while typing. Rail views (`ViewMenu`) and the label tabs of an open card have their own right click menus, touch long press opens them too.
- **Unsaved notes hold navigation**: `beforeNavigate` cancels, saves, then repeats the navigation.
- **Back closes before it navigates**: browser back and the Android gesture send an Escape (`closeOverlay()` in `#lib/back.ts`), a handler that acts on Escape must `preventDefault()` so back stops there. Dialogs, popovers, menus, the viewer, an open note and the selection all count.
- **No blur anywhere**: neither `filter` nor `backdrop-filter`, it costs too much per frame. Things floating over content are opaque, soft glows are box shadows.
- **New notes grow out of the create button**, which hides meanwhile. An empty one shrinks back into it, a saved one hands over to its grid card. The button gives up its width meanwhile so search and filter recentre. `edit()` awaits the editor before the snapshot (hover preloads it), else a second glide bumps the grid. The editor focuses through `view.focus()` since Tiptap's focus command scrolls and cut the page's smooth scroll short.
