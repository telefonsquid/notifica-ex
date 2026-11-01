# Night report 2, on top of master 4cf53f7

Branch `claude/beautiful-brown-t8420i`, pushed, 21 new commits, all authored as you without Claude lines. The diff against master contains only tonight's work.

## How the branch relates to master

Master had reimplemented sharing, images and the skills in its own way, and almost none of the first night's fixes had reached it. So I restarted the branch from master. A single "ours" merge commit (e16e0cc) keeps the first night's 25 commits reachable in the history without changing any file, and it meant no force push was needed. If you'd rather not have them in the history, squash-merge the branch.

## Most important fixes

1. **Sharing never reached the other person.** `shared ?= user` silently matches nothing in PocketBase 0.40 for a multi relation, both in `getAllNotesFor`/`getNoteFor` and in the notes rules. It is now `shared.id ?=`. Tested with two accounts: share, live update, edit both ways.
2. **Every account could read every other account through PocketBase**, including ntfy topic and role (the browser holds a token). Users now see only their own record, admins see all. The app already got names for sharing from `getPeople()` on the server.
3. **Leaving a shared note, or being taken off it, kept your reminders on it**, so they pushed about a note you could no longer open. They are now deleted, and dispatch also drops any such orphan. The leave dialog says so.
4. **Renaming a view or changing its icon reset its filter and sort**: zod 4 fills defaults inside `.partial()`. Fixed with `viewChangesSchema`.
5. **A push that failed (ntfy restarting) was lost.** It now stays due for an hour and is retried every minute; its history entry is removed before each retry so the history doesn't double. Runs no longer overlap.
6. **Sessions never renewed**, so everyone was logged out 7 days after logging in. The hook now refreshes the token in its last 2 days.
7. **Logins failed in production over plain http**: adapter-node 6 no longer reads `ORIGIN` at runtime. It is now passed into the build via `paths.origin`, a Dockerfile `ARG` and compose `build.args`.
8. **Notification taps**: with an expired session the note was lost after logging in; that now works through `?next=`. Also replaced the deprecated `replaceState`, and skipped view transitions no longer throw.
9. **Checklist ticks on cards** could flip the wrong line, for example next to indented code or `- [ ]x`.
10. **Masonry** caused the "ResizeObserver loop" error on every open and close. It now watches the cards and the window instead of its own height. I checked: no overlaps, and the error is gone.
11. **Smaller fixes:**
    - A note deleted or unshared elsewhere while open now closes with a notice instead of an error.
    - Clearing the date in the reminder form no longer breaks it.
    - Settings no longer overflow on phones.
    - "in 60 minutes" now reads "in 1 hour".
    - Notification links survive a trailing slash in `ORIGIN`.
    - Two filters that were built by pasting values into strings now use parameters.

## Refactoring

- `unwrap` now lives in `#lib/server/queries.ts`. Server code no longer imports the browser PocketBase module.
- Removed the `/prototype` page and unused helpers.
- New shared pieces:
  - the `popover` utility in `app.css`, replacing five copies of the open/close animation (the share popover now animates too)
  - `#lib/ui/InlineInput.svelte`, used for renaming views, labels and users
  - `#lib/components/AuthPage.svelte`, used by login and set password
  - `#lib/selection.svelte.ts`, used by the notes page

## Tests

`bun run test` now exists: 59 tests covering recurrence (daylight saving, month ends, weekdays, only/except rules), checklists, views and filters, manual order, and relative time.

Checks at the end: `bun run check` 0/0, lint clean, `bun run build` clean.

## Not done or worth a look

- **Database:** existing databases need `POST /api/migration` once for the new `notes` and `users` rules.
- **`/api/maintenance`:** still runs daily and does nothing. With minute reminders the occurrences history grows without limit, and maintenance could prune old checked-off entries. I left that to you, since comments live there.
- **Long-lived tabs:** a tab open for more than a week keeps its old realtime token until it is reloaded.
