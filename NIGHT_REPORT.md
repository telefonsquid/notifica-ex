# Night report, 2026-11-01

Everything is on `claude/beautiful-brown-t8420i`, 24 commits on top of `master` (f8572f3), pushed. All commits are authored as you, with no Claude lines. I committed without asking you about each message because you were away. Squash or reword them as you like before merging. Nothing is merged and there is no PR.

Checks at the end: `bun run check` 0 errors 0 warnings, `bun run lint` clean, `bun run test` 50 tests pass, `bun run build` works. Every flow below was also clicked through in a real browser against a real PocketBase (see "How I tested").

Delete this file once you have read it, it only exists for the handover.

## Bugs fixed

| What was wrong | Where |
|---|---|
| Renaming a view or changing its icon reset its filter and sort to the defaults (zod 4 fills defaults inside `.partial()`) | `viewChangesSchema` in `schemas.ts` |
| Any logged-in user could read every account (name, role, ntfy topic) straight from PocketBase, because the browser holds a PocketBase token | `users` list/view rule: own record, admins all |
| The second click of "Delete" in the right-click and selection menu never happened: bits reads `closeOnSelect` after `onSelect`, so arming the item closed the menu | `NoteMenu.svelte` |
| Ticking a checkbox on a card flipped the wrong line, or none, next to indented code, `- [ ]x` or an empty `- [ ]` | `toggleTask` now checks its edit against the markdown parser |
| A failed ntfy push (ntfy restarting) marked the reminder as sent, so it was lost | retried every minute for an hour, then it moves on |
| Two dispatch runs could overlap and push twice | one run at a time |
| Sessions were never renewed, so everyone was logged out 7 days after logging in | `hooks.server.ts` refreshes the token when it is within 2 days of expiry |
| Logins failed in production over plain http: adapter-node 6 no longer reads `ORIGIN` at runtime and assumes https | `paths.origin` from `ORIGIN` at build time, plus a Dockerfile `ARG` and compose `build.args` |
| A notification tap with an expired session lost the note after logging in | login returns via `?next=` (`#lib/return_path.ts`) |
| `replaceState` is deprecated in SvelteKit 3, and skipped view transitions threw unhandled rejections | page and root layout |
| The reminder form threw on a cleared date field | `ReminderEditor.svelte` |
| Every server remote function imported the browser PocketBase module, against its own warning | `unwrap` moved to `#lib/server/queries.ts` |
| Notification links broke with a trailing slash in `ORIGIN` | `server/reminders.ts` |
| Relative times read "in 60 minutes" or "in 7 days" | `formatDistance` |
| Settings overflowed the screen on phones | `grid-cols-1` on the list rows |
| An opened note scrolled under the toolbar and phone rail | `scroll-margin` on `.note.open` |
| A note deleted elsewhere while open (by its owner, or on another device) left the editor half open and showed an error | the page closes it, the note shows "This note was deleted meanwhile." |

## Cleanup and deduplication

- **Removed:** `src/routes/prototype` (about 1,300 lines of mock-data design exploration, public and unlinked), the no-op `/api/maintenance` endpoint and its daily cron, and unused helpers (`getPage`, `insertOne`, `updateOne`, `createListModelSchema`, `pbOmitMap`, `pocketbaseTimestamp`). If you still want the prototype, it's in git history.
- **New shared controls** in `#lib/ui`:
  - `ConfirmButton`: click twice to delete, deactivate or leave. Was copied in 5 places.
  - `InlineInput`: rename in place. Was copied in 5 places.
  - `CheckBadge`: the check mark on the two settings pickers.
  - `Initials`.
- **`AuthPage`** now holds everything login and set-password had in common. Each page is about 30 lines.
- **`app.css` utilities:** `popover` replaces five copies of the open/close animation, `field` replaces three copies of the input styling. I renamed Input's own `field` class to `floating`, because it clashed with the new utility (I caught that in a screenshot).
- **Smaller fixes:**
  - The filter's day/week amount uses `NumberField`, as the conventions ask.
  - Filter colours follow the picker order.
  - Number limits come from `schema_limits.ts`.
  - View rows reorder with the motion tokens instead of a hardcoded 280 ms.

## Features from the plan

1. **Sharing.** The owner shares a note by email from the people icon on an open note.
   - Everyone on the note sees and edits it live. Only the owner deletes it, the others "Leave" it (also from the menu).
   - Closed cards show who else is on the note as initials. Views can filter by Shared.
   - Labels and reminders stay personal. On a shared note, `labels` holds everyone's label ids and each person only sees and changes their own.
   - Other accounts only ever expose name and email, through `getPeople()`.
   - One PocketBase pitfall I hit: a multi-relation rule needs `sharedWith.id ?=`. Plain `sharedWith ?=` silently matches nothing.
2. **Image notes.** Add images with the button on an open note, by pasting or by dropping them.
   - Cards show images edge to edge at the top, with sizes from PocketBase thumbnails.
   - Files are protected in PocketBase and only served through `/api/notes/[id]/images/[file]`, which checks access. Other users get 404, logged-out visitors 401.
   - Uploads go one per request, so `BODY_SIZE_LIMIT=12M` in the Dockerfile is enough. Tested with a 2.4 MB image on the production build.
3. **Installable web app with a share target.** This is a first step toward the Android goal, pending Tauri.
   - Adds `manifest.webmanifest` and icons rendered from the favicon.
   - On Android, "Share → notifica-ex" goes to `/share`, which creates a note from the shared title, text and link and opens it. Logged out, it logs in first and then continues.
4. **Undo for archiving.** Archiving shows a toast with Undo. `notify()` now takes an `action`.
5. **`n` starts a new note.** It never fires while you're typing.
6. **Duplicates keep their images.** The server copies the files over (`duplicateNote`).

## Docs and tests

- **Skills:** wrote `theming`, `motion`, `data-model` and `reminders` in `.claude/skills`. The "Look and motion" bullets moved into the first two unchanged. `AGENTS.md` keeps the UI conventions and points to the skills.
- **`AGENTS.md` additions:** sharing, images, the installable app, `paths.origin`, the shared controls and utilities, tests, commit authorship, and how to run PocketBase in a cloud session.
- **Tests:** `bun run test`, with `*.test.ts` next to the code: recurrence (daylight saving, month ends, weekdays), checklists vs. rendering, view filters and sorting, relative time. `@types/bun` was added for their types.

## Please check by hand

- **Animations:** I saw them only as screenshots, not in motion. Look at the image block on cards (it uses `unfold` like the other blocks), the toast's Undo button, and the share popover.
- **Real ntfy and a phone:** I used a fake ntfy that records publishes. Dispatch, retry and the signed Done button all worked against it.
- **Installing the app on Android:** there was no device to try the share target on.
- **Upgrading an existing database:** dev re-imports `pb_schema.json` through `POST /api/migration`, which adds `sharedWith` and `images` and the new rules. A production database created before today needs the same import once, since the only migrations so far are the schema snapshot.

## Open points

- A tab left open for many days keeps the old realtime token. If the event stream reconnects after that token expired, events stop until a reload. It's rare, and a proper fix needs a resubscribe hook in the PocketBase SDK.
- Edits on a shared note are last write wins, with no merging of simultaneous edits.
- The Android/Tauri app and its notification actions are still to do. The web share target covers sharing into the app for now.

## How I tested

The cloud container can't download GitHub releases, but proxy.golang.org works. I built PocketBase 0.40.6 from source (a few-line `main.go` with the jsvm plugin, so the cron hook runs), ran it on 8091 with `pocketbase/cronjobs`, ran a stand-in ntfy on 8092 that logs publishes, and ran the dev server on 55560. Playwright then drove:

- login and deep links
- creating notes, labels and reminders
- the note menu: duplicate, colour, pin, select, archive
- filters
- settings: themes, label edge, views, users
- sharing between two accounts with live updates
- images
- the share target
- phone layouts
- the production build
