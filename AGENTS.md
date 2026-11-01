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

Bun, SvelteKit 3 + adapter-node, Svelte 5 (runes, experimental remote functions and async), TypeScript 6, PocketBase, Tailwind 4, lucide, zod. bits-ui for dialogs and menus, marked renders notes (`#lib/markdown.ts` escapes raw HTML and filters link schemes), Tiptap edits them. Docker compose for deployment.

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
- **Label tabs** sit on the top or bottom card edge, a per-device `labels` cookie (`#lib/preferences.ts`) rendered into `<html data-labels>` the same way. Both pickers read the `<html>` attribute, not the load data, which keeps the first page load's value across client navigation.
- **Settings page** has five sections: Appearance (device preferences), Views, Behaviour, Account, Users (admin only). The stage scrolls with `scroll-snap` so a section settles below a peek of its predecessor, the tab follows the scroll. Sections other than the current one stay faint and grey, a click on one scrolls there. No descriptions under titles. The tab indicator glides like the rail's.
- **Motion tokens** (`--ease-*`, `--duration-*`) live in CSS. `#lib/motion.ts` reads them for JS transitions (`rise`, `sink`, `stagger`) and returns 0 durations under reduced motion.
- **Page changes** use view transitions from the root layout; `.vt-rail`, `.vt-page` and `.vt-rail-indicator` name the moving parts. The indicator glides with in-out, no spring. Within one route (switching views) `data-transition="same-page"` unnames `.vt-page`, so the page shows live and shared cards glide via `glide()`, snapshotted in the page's `onNavigate` since the async batch swaps cells before `$effect.pre`. Leaving cards fade in place (`leave`). Rail icons carry `.vt-rail-icon` (`match-element`, class `rail-icon`) so their own layers sit above the indicator. It sits on a still wrapper and the hover tilt on the svg inside: Firefox loses the new snapshot of a named element that has its own transform, so the clicked icon vanished. Icons crossfade with the indicator's timing (the live one would turn white before it arrives), the `.vt-toolbar` shows live (old image hidden, new one unanimated), only a part present on one side fades with the page (`:only-child`, since `:not()` never matches on these pseudos).
- **Grid changes** glide: `measure()` before the update, `glide()` after (`#lib/motion.ts`). Cells carry `data-flip`, the part that resizes `data-flip-body`. It keeps its final size for the grid while the body animates width and height under `[data-resizing]`, so text reflows instead of stretching. Opening and closing call the page's `snapshot()` themselves, since a card's blocks can update before the page's `$effect.pre` runs. `measure()` and the cell height `glide()` holds skip `inert` elements, which Svelte sets on everything mid outro, so leaving parts count as gone and the grid doesn't jump when they finish. `html` keeps `scrollbar-gutter: stable`, a scrollbar appearing mid glide shifted every card.
- **Masonry**: `#lib/masonry.ts` places every cell explicitly on 1px grid rows, each in the column (or column pair for a wide card) that ends highest, in sort order. CSS only sets the column count, the vertical gap comes from `--note-row-gap`. It repacks on cell resize and child changes, and `glide()` takes it as its layout step so cards glide straight to the packed spot. Absolutely positioned leaving cells are skipped.
- **Height changes inside a card** use `unfold()` both ways (`in:` and `out:`), which animates size, padding, margin and the flex gap with a symmetric easing, so a swap of two branches keeps the sum steady. Open only controls fade under `.folded` first, then fold away while the card shrinks.
- **Band heights** follow their content with `morph()` (`#lib/motion.ts`), timed per change: its own easing while the card is open and settled, the glide's while it closes.
- **Tooltips**: icon only buttons get `{@attach tip('Text')}` (`#lib/tooltip.svelte.ts`), the one `Tooltip` in the root layout shows it. Mouse and keyboard only, no `title` attributes. Skip it only where the icon is obvious (close X). Shows after 250 ms with a soft `rise`.
- **Number inputs** use `#lib/ui/NumberField.svelte` with its own stepper, not the browser spinner.
- **Note menu**: `NoteMenu.svelte` holds the actions for one card or the whole selection and renders in the card's `ContextMenu` (right click, touch long press) and the selection bar's `DropdownMenu`, both share bits' item parts. A mouse long press or the menu's Select starts the selection, then a click on a card toggles it. A selected card gets a faint `--theme-signature` wash, the accent resolved on `:root` since note colours swap `--theme-accent` inside the card. Menus use the `menu`, `menu-item` and `menu-separator` utilities from `app.css`.

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
- **Reminders stack**: a note holds as many as wanted, each stored with its own IANA timezone so fixed times of day survive DST and dates render the same on server and client. `next` is the coming occurrence, `sent` the last pushed one, `done` the occurrence checked off. Missed occurrences collapse into one push. Repeats: once, every n hours/days/weeks/months/years, or chosen weekdays, each with an optional `until` date.
- **Done links are signed**: the ntfy button posts `{occurrence, signature}`, an HMAC over reminder id and occurrence with `SERVER_AUTH_SECRET`. No login on the phone needed, and a stale button does nothing.
- **No versioned migrations before the first release**: `pocketbase/pb_schema.json` is the schema, dev re-imports it on every `POST /api/migration` and drops fields it no longer lists, since the import alone keeps them.
- **Note colours** are names from `NOTE_COLORS` (tints, solids, stickies, textures), shared by notes and labels and stored as the name, never a hex value. Adding one means `schemas.ts`, both `color` selects in `pb_schema.json` and `note_colors.css`. Elements set `data-note`, `#lib/note_colors.css` paints `.note-surface` and `.note-mark` from it. Tints and stickies come from each theme's `--theme-note-*`, solids are the same everywhere and sit in the `:root` defaults of `app.css`. `COLOR_GROUPS` in `notes.ts` orders every picker: Soft, Sticky, Solid, Texture, 18 each so a group fills two rows of nine. Its WHITE INK and DARK INK groups override the `--theme-*` tokens inside the note, so components get readable ink without knowing. The picker trigger wears a rainbow ring so it never blends into a note of its own colour.
- **Views** replace fixed pages: each is a saved filter and sort (`#lib/views.ts`, matched in the browser) with a rail slot and an icon stored by name (`#lib/view_icons.ts`). Route `(app)/[[view]]`, the first view lives at `/`. New accounts get Notes and Reminders, the last view can't be deleted. The toolbar has separate Sort (`SortEditor`) and Filter (`FilterEditor`) popovers, each with an accent dot while its part differs from the saved view. Both end in the same `viewActions` band (save as new, save to view), shaded and only there while something differs. View settings show the two side by side. `FilterEditor` has a Simple mode (search, an icon bar for pinned, reminder, open tasks and a three step archive toggle, label picks, no headings) and an Advanced one, switched by a pill floating above the box top right that names the other mode and badges how many filters Simple can't show, Clear floats beside it. Picked labels show by check and full colour, no ring. Label chips wear the card tabs' `note-mark type-meta` look. Segmented controls are `#lib/ui/Glider.svelte`, one thumb gliding to the pick. `morph()` animates to the height the layout grants, never past a capped scroll area, and leaves scroll areas unclipped: clipping reset the scroll and looped on the scrollbar.
- **Manual order like Keep**: sort `manual` ("Your order") is the default. `position` stays 0 until a note is dragged, `positionOf()` falls back to its creation time, so new notes land first. A drop takes the midpoint of its neighbours (`positionBetween()`). Drag works with mouse and pen only, in a manual sort, with nothing open or selected.
- **Rail views render unkeyed**: a keyed `#each` there froze the page on the second reorder (Svelte 5.57).
- **Notes are markdown only**: the body is the single source, checklists included as `- [ ]` lines. `MarkdownEditor` edits it rich through Tiptap or raw in a textarea. Cards tick tasks by index through `toggleTask()`. Prose and checklist styles for both renderers live in `#lib/markdown.css`.
- **Images** sit in the notes' protected `images` file field, PocketBase is public for realtime. They upload through `POST /api/notes/[id]/images` (one file per request, files don't fit remote functions, `BODY_SIZE_LIMIT` raised in the Dockerfile) and come back through `/api/notes/[id]/images/[name]`, which checks the owner and fetches with a file token. `shrink()` turns big photos into WebP in the browser first. Paste, drop or the actions' picker adds them, a new empty note gets created for them (`save(true)`). `NoteImages` lays them out edge to edge on top.
- **Notes edit in place**, no modal: one `Note` component is both card and editor, opening keeps every element and adds the open only ones (`.extra`, fading in after the card grew, out before it shrinks). Tiptap loads on hover and a skeleton toolbar holds its place until then. The open card spans two grid columns when there is room and saves on a click outside or Escape, no Done button. Colour, archive and delete join the pin in the header once the card is 26rem wide. The grid order is frozen while a card is open so autosaves don't move it. Labels show as tabs beside the card, not on it, with a remove button and `LabelAdder` as the last tab. On an open card the tab name opens `LabelEditor` (colour, rename, delete everywhere).
- **Unsaved notes hold navigation**: `beforeNavigate` cancels, saves, then repeats the navigation.
- **New notes grow out of the create button**, which hides meanwhile. An empty one shrinks back into it, a saved one hands over to its grid card. The button gives up its width meanwhile so search and filter recentre. `edit()` awaits the editor before the snapshot (hover preloads it), else a second glide bumps the grid. The shrink places the note every frame, since grid and button both move, its width following the body so it never overhangs the page. A resizing cell keeps its final spot and only its body travels, a full size cell far off stretched the page into scrollbars. The page's glide runs from `queueMicrotask` + `flushSync`, `tick()` waits a frame in async mode. The grid has `overflow-anchor: none`, and the editor focuses through `view.focus()` since Tiptap's focus command scrolls and cut the page's smooth scroll short.
- **Reminder band**: the first reminder line carries the add button, a full Add reminder row only while there are none. Changes unfold only once the card finished growing (`settled`), before that the glide covers them. Closing folds them too. A closed card shows the line faint, leaves out "Once" and adds the time left on the right (`formatDistance`, ticking through `now()` in `#lib/clock.svelte.ts`).
