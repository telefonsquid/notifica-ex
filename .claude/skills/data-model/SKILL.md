---
name: data-model
description: PocketBase collections and access rules, sharing, images, realtime, the query and remote function layers, schema changes and migrations. Use when adding a field or collection, changing who may see or edit what, or writing server data access.
---

# Data model

## Collections

Schema lives in `pocketbase/pb_schema.json`. `#lib/schemas.ts` holds zod for what the browser sends and plain types for stored records, size caps sit in `#lib/schema_limits.ts`. Zod stays out of the browser bundle: client code takes only types from `schemas.ts`, constants it needs sit in zod free modules (`schema_limits.ts`, `note_colors.ts`, `preferences.ts`), reading saved views in `#lib/server/views.ts`.

| Collection | Fields | List/view rule |
|---|---|---|
| `users` (auth) | name, authorizationLevel, state, ntfyTopic, ntfyPaused, streamEpoch (part of the app stream key, a new password raises it) | own record, admins all (names for sharing come from `getPeople()` on the server) |
| `labels` | owner, name, color, autoColor, colorPriority (order in the auto color chart, lowest first) | owner |
| `notes` | owner, title, body (markdown), color, labels, pinned, archived, position, images (protected file), shared (users, max 20) | `owner = @request.auth.id \|\| shared.id ?= @request.auth.id` (a multi relation needs `.id ?=`, plain `?=` silently matches nothing) |
| `reminders` | note, owner, at, repeat, weekdays, until, every, timezone, task, next, open | owner, so a collaborator's reminders stay private |
| `occurrences` | owner, note, reminder, at, rule, timezone, task, done, comment | owner, the reminder history |
| `views` | owner, name, icon (lucide name, text), position, filter (json), sort (json) | owner |
| `push_subscriptions` | owner, endpoint (unique), p256dh, auth | superuser only, one per browser |
| `migrations` | bookkeeping | superuser only |

Colours are stored as names from `NOTE_COLORS`, see the `theming` skill.

## Access

- The server talks to PocketBase as superuser, so **the query layer enforces ownership**: every query takes the user id and filters by it. Collection rules matter for realtime, which runs in the browser with the user's token.
- Every new collection needs list/view rules before anything subscribes to it.
- `hooks.server.ts` re-verifies the cookie on every request and rejects deactivated users.

## Sharing

- The owner picks people in `ShareEditor`, stored in `notes.shared`.
- Collaborators edit title, body, colour and images and add their own reminders. Pin, archive, labels, manual order and delete stay with the owner, the server strips those fields from a collaborator's update.
- For a collaborator, delete becomes `leaveNote` (removes them from `shared`). Duplicating someone else's note drops their labels.
- Leaving, or being taken off a note, deletes that person's reminders on it (`deleteRemindersOn`), and dispatch drops any reminder whose owner lost the note. Their history stays.
- UI: `owned = note.owner === me` decides which actions show.

## Images

- Protected `images` file field, since PocketBase is public for realtime.
- Upload through `POST /api/notes/[id]/images`, one file per request (files don't fit remote functions, `BODY_SIZE_LIMIT` raised in the Dockerfile). `shrink()` turns big photos into WebP in the browser first.
- Served through `/api/notes/[id]/images/[name]`, which checks access with `getNoteFor` and fetches with a file token. Names never repeat, so it caches immutable.

## Server layers

- **Queries**: `#lib/server/queries.ts`, every function returns `Result<T>`. Callers `unwrap()` into a SvelteKit error.
- **Remote functions**: `src/routes/api/*.remote.ts`, wrapped by `#lib/server/remote_function_error_trace`. Every argument has a zod schema, each starts with `signedIn()` (`#lib/server/signed_in.ts`), which gives the user or a 403.
- **Client**: calls go through `safeAction()` (`#lib/pocketbase.ts`), which turns errors into toasts. The client `pb` instance is never imported on the server.

## Realtime

The root layout hands the auth token to the browser (the cookie stays httpOnly), the `(app)` layout connects once. Pages subscribe with `onCollectionChange()` from `#lib/realtime.ts` (bursts coalesce, the third argument marks events the page already shows, the callback gets the others) and react with `query().refresh()` for remote queries, `invalidateAll()` for load data. After a reconnect everything is invalidated once.

Notes are the exception, with 500 of them a refresh weighs 270 KB: commands answer with their one note and `kept()` from `#lib/note_list.ts` merges it into `getNotes()`, realtime events go in the same way through `keepEvents()`. Whatever isn't about one note (deleting a label, leaving) still refreshes.

## Ordering

Sort `manual` is the default. `position` stays 0 until a note is dragged, `positionOf()` falls back to creation time so new notes land first. A drop takes the midpoint of its neighbours (`positionBetween()`).

## Schema changes

- No versioned migrations before the first release. Edit `pb_schema.json`, then `POST /api/migration` with `SERVER_AUTH_SECRET`: `bootstrap.ts` imports the schema and drops fields it no longer lists (the import alone keeps them).
- A new field touches `pb_schema.json`, `schemas.ts`, the queries that write it, and any remote function schema that accepts it.
- PocketBase refuses to change a field's type. Give the field a new id in `pb_schema.json` and add a dev one off in `bootstrap.ts` that reads the values, drops the old field, adds the new one and refills them. Delete it once every dev database ran it.
- After the first release, data changes become versioned migrations run from the same endpoint.
