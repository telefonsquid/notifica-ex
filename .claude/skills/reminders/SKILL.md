---
name: reminders
description: Reminder recurrence model, timezones, the per minute scheduler, ntfy delivery, signed Done buttons and the reminder band on cards. Use when touching anything that schedules, sends or shows a reminder.
---

# Reminders

## Model

- A note holds as many reminders as wanted. Each belongs to the user who made it (collaborators keep theirs private).
- Fields: `at` (first occurrence), `repeat`, `every`, `weekdays`, `until`, `rules`, `timezone`, `task`, `next`, `open`.
- `repeat` (`reminderRepeatSchema`): never, minutes, hours, days, weeks, weekdays, months, years. `every` is the n, `weekdays` the picks for `weekdays`, `until` an optional end date.
- `rules` (`reminderLimitSchema`, json) narrow a repeat: each is `only` or `except` over `times` (from–to, may wrap past midnight), `days` or `dates`. Except rules always block. Only rules of the same kind are alternatives, different kinds must all hold. `occurrenceAfter()` hops past blocked stretches through `blockedUntil()`.
- Each reminder stores its own IANA timezone, so a fixed time of day survives DST and dates render the same on server and client.
- `next` is the coming occurrence, `open` how many logged task occurrences wait for Done (`countOpenOccurrences()` keeps it in step after every change). `task` reminders get a Done button.
- **Occurrences** log every time a reminder went off: note, reminder (emptied once the reminder is removed), `at`, the `rule` line as it read then, `timezone`, `task`, `done` (when checked off), `comment` (written in the history). Rule changes and removals leave the log alone. Kept forever on purpose while the note exists (decided 2026-11-01), even though a minute reminder adds 1440 rows a day: never prune it. Deleting the note or the account cascades it away. An empty `next` means finished: a time in the past is saved as such, not refused. The minute it is saved in still counts (`firstOccurrence()`), the form only picks whole minutes.

## Shared logic `#lib/reminders.ts`

Runs on server and client: `occurrenceAfter()` computes the next occurrence, `parseTimestamp()`, `describeRule()` for the UI line, `WEEKDAYS`, `UNITS`, timezone helpers that cache one formatter per zone. Any recurrence change goes here so both sides agree.

## Scheduler

- `pocketbase/cronjobs/cron.pb.js` POSTs to `WEB_INTERNAL_URL` with `SERVER_AUTH_SECRET`: reminders every minute (`/api/reminders/dispatch`), maintenance daily at 3am.
- `dispatchDueReminders()` in `#lib/server/reminders.ts` takes every reminder with `next` due, logs an occurrence, delivers it, then sets `next: occurrenceAfter(now)` and recounts `open`. Missed occurrences collapse into one push. "Due" reaches 30 s ahead, since PocketBase's cron sometimes fires a few ms before the full minute. A failed push stays due and is retried every minute for an hour (its log entry removed again), then the reminder moves on. One run at a time.
- Local dev: PocketBase in Docker calls the host dev server through `host.docker.internal`, so the dev script binds Vite to `127.0.0.1` (not `::1`) and `vite.config.ts` allows that host. Rebuild the PocketBase image whenever `pocketbase/cronjobs` changes.

## Delivery

`deliver()` in `#lib/server/delivery.ts` sends one `Push` (`pushFor()`) to every way the owner has. Paths in it are relative, each channel knows its server. A push only stays due while it reached nowhere, a failure on one channel doesn't repeat it on the others. Settings, Notifications has a switch per channel.

- **Android app**: `#lib/server/app_stream.ts` holds the open connections, `/api/app-stream/[user]` serves them as one json line per push, key signed from the user id (`getAppStream`). A foreground service in the app stays connected and shows the notifications itself, see the `android` skill. Coming back with `?since=` replays what it missed from the occurrence log, up to 12 hours and 20 pushes, so a phone that was away never needs server side queueing.
- **Browser**: Web Push through `#lib/server/web_push.ts` to `push_subscriptions`, keys from `PUBLIC_VAPID_KEY` and `VAPID_PRIVATE_KEY`, off while those are empty. `static/push-worker.js` shows them. It registers only once someone turns them on and caches nothing, plain JS since SvelteKit's own service worker build adds a top level import that needs a module worker. A subscription the browser dropped (404, 410) is deleted.
- **ntfy**: bundled as its own compose service (port 8092), `#lib/server/ntfy.ts` `publish()` to the owner's `ntfyTopic`, unless `ntfyPaused`. The click target is `${ORIGIN}/?note=<id>`, tasks add a Done `http` action.

## Done links

- The signature is an HMAC over the occurrence id with `SERVER_AUTH_SECRET` (`sign(doneSubject(id))`). No login on the phone needed.
- Each button ticks off just its own occurrence, however late it gets pressed. A second press does nothing.

## UI

- The reminder band on a card: the first line carries the History and add buttons, a full Add reminder row only while there are none.
- The form is one wrapping row: Start on, Every n, the repeat `Choice` (`#lib/ui/Choice.svelte`, Once and Weekdays set apart on top), then icon buttons. Weekdays (`DayPicker`) fold open below.
- The sliders icon, first in the icon group, opens `ReminderRules`, a dialog that repeats Start on and Repeat (a snippet from the form) above End on and the rules, which fold away for Once. It grows out of the button and shrinks back into it. It edits the form's state directly, the form's save stores it. The icon turns accent with a dot while anything is set there.
- Changes unfold only once the card finished growing (`settled`), closing folds them too.
- A closed card shows the line faint, leaves out "Once" and adds the time left on the right (`formatDistance`, ticking through `now()` in `#lib/clock.svelte.ts`).
- An open task shows `DoneButton`, the one Done pill, pulsing. More than one open adds a count badge, and the pill opens the history instead of ticking anything.
- **History** (`ReminderHistory`, state in `#lib/singletons/reminder_history.svelte.ts`) grows out of the button that asked. It wears the note's colour and title, lists one line per occurrence newest first, grouped by day: the time, then a `DoneButton`, a ticked "hh:mm" with comment and Undo icons, or a faint bell for plain reminders. Above the days, while more than one is open, a row with the count and a Check all pill (`CheckCheck`, `checkOffHistory`) in the same column as the row pills. Toggles show at once from local state (`checks`), then refresh: the pill shrinks into one grid cell while the checked time slides in from the right, its tick draws itself, and an accent wash sweeps the row from the right (Check all staggers it down the list). Comments (`setOccurrenceComment`, max `OCCURRENCE_COMMENT`) exist only here and only on request: the icon unfolds a framed field under the row with an accent OK button. OK, Enter or focus leaving the field saves, Escape drops it, an empty text clears it. A saved comment shows as a quote line (left rule, text where the field's text sits), a click edits it. Pages of `HISTORY_PAGE`, the client refreshes `getHistory` itself since only it knows how far the list is shown. Opened from the band's History button and the note menu.
- The note menu lists a single note's reminders and opens the card at one, a selection only offers Remove reminders.
