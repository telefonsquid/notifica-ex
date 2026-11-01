---
name: reminders
description: Reminder recurrence model, timezones, the per minute scheduler, ntfy delivery, signed Done buttons and the reminder band on cards. Use when touching anything that schedules, sends or shows a reminder.
---

# Reminders

## Model

- A note holds as many reminders as wanted. Each belongs to the user who made it (collaborators keep theirs private).
- Fields: `at` (first occurrence), `repeat`, `every`, `weekdays`, `until`, `timezone`, `task`, `next`, `sent`, `done`.
- `repeat` (`reminderRepeatSchema`): never, hours, days, weeks, weekdays, months, years. `every` is the n, `weekdays` the picks for `weekdays`, `until` an optional end date.
- Each reminder stores its own IANA timezone, so a fixed time of day survives DST and dates render the same on server and client.
- `next` is the coming occurrence, `sent` the last pushed one, `done` the occurrence checked off. `task` reminders get a Done button.

## Shared logic `#lib/reminders.ts`

Runs on server and client: `occurrenceAfter()` computes the next occurrence, `parseTimestamp()`, `describeRule()` for the UI line, `WEEKDAYS`, `UNITS`, timezone helpers that cache one formatter per zone. Any recurrence change goes here so both sides agree.

## Scheduler

- `pocketbase/cronjobs/cron.pb.js` POSTs to `WEB_INTERNAL_URL` with `SERVER_AUTH_SECRET`: reminders every minute (`/api/reminders/dispatch`), maintenance daily at 3am.
- `dispatchDueReminders()` in `#lib/server/reminders.ts` takes every reminder with `next` due, publishes it, then sets `sent: next` and `next: occurrenceAfter(now)`. Missed occurrences collapse into one push.

## Delivery

- ntfy is bundled as its own compose service (port 8092), the app publishes over HTTP through `#lib/server/ntfy.ts` `publish()` (returns a `Result`) to the owner's `ntfyTopic`.
- `notification()` sets the click target to `${ORIGIN}/?note=<id>`, which opens the note.
- Tasks add a Done `http` action posting `{occurrence, signature}` to `/api/reminders/[id]/done`.

## Done links

- The signature is an HMAC over reminder id and occurrence with `SERVER_AUTH_SECRET` (`sign(doneSubject(id, occurrence))`). No login on the phone needed.
- The endpoint verifies the HMAC and only ticks the occurrence equal to `sent`, so a stale button does nothing.

## UI

- The reminder band on a card: the first line carries the add button, a full Add reminder row only while there are none.
- Changes unfold only once the card finished growing (`settled`), closing folds them too.
- A closed card shows the line faint, leaves out "Once" and adds the time left on the right (`formatDistance`, ticking through `now()` in `#lib/clock.svelte.ts`).
- The note menu lists a single note's reminders and opens the card at one, a selection only offers Remove reminders.

## Later

Recurring tasks checked off from the Android app's notification (see the `android` skill once it exists).
