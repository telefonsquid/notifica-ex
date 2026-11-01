---
name: reminders
description: Reminder recurrence, the dispatch run that pushes them through ntfy, the signed Done button and how to test it all locally. Read before changing reminders.ts, server/reminders.ts, the dispatch or done endpoints or the reminder UI.
---

# Reminders

## Rule and state

A reminder stores its rule as picked (`at`, `repeat`, `every`, `weekdays`, `until`) with the IANA `timezone` it was set in, so daily times keep their clock time across daylight saving and dates render the same everywhere. `next` is the coming occurrence, empty once a one off went out. `sent` is the last one pushed, `done` the one checked off. A task waits while `sent` is set and differs from `done`.

`occurrenceAfter(rule, moment)` in `#lib/reminders.ts` computes `next`:

- hours step in plain milliseconds and may drift across daylight saving,
- days and weeks keep the clock time in the reminder's zone,
- months and years keep the day, the 31st falls back to the last day of shorter months,
- weekdays take the start's clock time on the picked days, the start itself only counts on one of them,
- `until` ends every repeating rule, a one off ignores it.

`reminders.test.ts` pins these down, run `bun run test` after any change there.

## Dispatch

PocketBase's cron hook (`pocketbase/cronjobs/cron.pb.js`) posts to `/api/reminders/dispatch` every minute with `SERVER_AUTH_SECRET`. `dispatchDueReminders` sends everything with `next <= now` and moves it on to the occurrence after now, so missed ones collapse into one push. A failed push stays due and is retried for an hour, then the reminder moves on. Only one run goes at a time.

The ntfy message carries the note title and its text as plain text, a click opens `/?note=<id>` (the page opens that note, an expired session returns there after the login). Tasks get a Done button: an http action posting `{occurrence, signature}` to `/api/reminders/<id>/done`, the signature an HMAC of id and occurrence, so it works without a session and a stale button does nothing.

## Testing locally

Run PocketBase with `pocketbase/cronjobs` as hooks dir and `WEB_INTERNAL_URL` pointing at the dev server, or call the dispatch endpoint by hand. Any HTTP server that logs POST bodies on 8092 stands in for ntfy, `NTFY_URL` points at it.
