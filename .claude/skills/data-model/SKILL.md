---
name: data-model
description: PocketBase collections and access rules, sharing, images, realtime, the query and remote function layers, schema changes and migrations. Use when adding a field or collection, changing who may see or edit what, or writing server data access.
---

# Data model

## Collections

Schema lives in `pocketbase/pb_schema.json`. `#lib/schemas/` holds zod for what the browser sends and plain types for stored records, size caps sit in `#lib/schema_limits.ts`. Zod stays out of the browser bundle: client code takes only types from `#lib/schemas/`, constants it needs sit in zod free modules (`schema_limits.ts`, `note_colors.ts`, `preferences.ts`), reading saved views in `#lib/server/views.ts`.

| Collection | Fields | List/view rule |
|---|---|---|
| `users` (auth) | name, authorizationLevel, state, ntfyTopic, ntfyPaused, streamEpoch (part of the app stream key, a new password raises it), appPaused, appResumed (phone reminders, see the `reminders` skill), limits (json, per user overrides), noteLock (json, the wrapped key for locked notes) | own record, admins all (names for sharing come from `getPeople()` on the server) |
| `labels` | owner, name, color, autoColor, colorPriority (order in the auto color chart, lowest first) | owner |
| `notes` | owner, title, body (markdown), color, labels, pinned, archived, position, images and attachments (protected files), fileInfo (json, original name and size per file), shared (users, max 20), sealed (the body encrypted, body empty then) | `owner = @request.auth.id \|\| shared.id ?= @request.auth.id` (a multi relation needs `.id ?=`, plain `?=` silently matches nothing) |
| `reminders` | note, owner, at, repeat, weekdays, until, every, timezone, task, next, open | owner, so a collaborator's reminders stay private |
| `occurrences` | owner, note, reminder, at, rule, timezone, task, done, comment | owner, the reminder history |
| `views` | owner, name, icon (lucide name, text), position, filter (json), sort (json) | owner |
| `api_keys` | owner, name, prefix (first 10 chars, shown in the list), hash (sha256 of the key, unique), scope (read or write), expires, lastUsed (written at most once a minute) | superuser only, the key itself is never stored |
| `push_subscriptions` | owner, endpoint (unique), p256dh, auth | superuser only, one per browser |
| `app_settings` | limits (json, server defaults, one row, none until first changed) | superuser only |
| `migrations` | bookkeeping | superuser only |

Colours are stored as names from `NOTE_COLORS`, see the `theming` skill.

## Access

- The server talks to PocketBase as superuser, so **the query layer enforces ownership**: every query takes the user id and filters by it. Collection rules matter for realtime, which runs in the browser with the user's token.
- Every new collection needs list/view rules before anything subscribes to it.
- `hooks.server.ts` re-verifies the cookie on every request and rejects deactivated users.
- Every per user collection has `owner` with `cascadeDelete`, so `deleteUser` (`users.remote.ts`) only leaves the notes shared with them and deletes the user row, PocketBase takes the rest with their files. A new per user collection needs the same cascade.

## Sharing

- The owner picks people in `ShareEditor`, stored in `notes.shared`.
- Collaborators edit title, body, colour, images and attachments and add their own reminders. Pin, archive, labels, manual order and delete stay with the owner, the server strips those fields from a collaborator's update.
- `removeNote` deletes for the owner and leaves for a collaborator (removes them from `shared`), both through `removeFor` in `#lib/server/note_access.ts`. Its `ACCESS` filter mirrors the notes list and view rules, a contract test keeps them equal. `removeFile` drops an image or attachment. Duplicating someone else's note drops their labels.
- Leaving, or being taken off a note, deletes that person's reminders on it (`deleteRemindersOn`), and dispatch drops any reminder whose owner lost the note. Their history stays.
- UI: `owned = note.owner === me` decides which actions show.

## Locked notes

- The browser encrypts, the server only stores. `#lib/note_crypto.ts` holds the format: a random AES-GCM account key, wrapped by PBKDF2 from the account password into `users.noteLock`. Sealed bodies read `v1.<keyId>.<iv>.<ct>`.
- `lockNote` and `unlockNote` in `notes.remote.ts` switch a note, owner only, unshared and without files. `updateNote` takes `sealed` in place of `body` for a locked note and refuses a plain body (409). Share, uploads and MCP body changes are refused, MCP reports the note as `locked`.
- `changePassword` takes a rewrapped lock (`relock()` in the browser), `setPassword` from a mail link clears `noteLock`, which leaves sealed notes unreadable. Duplicate copies `sealed`.
- States: [Note lock](../../../docs/state-machines.md#note-lock).

## Images

- Protected `images` file field, since PocketBase is public for realtime.
- Upload through `POST /api/notes/[id]/images`, one file per request (files don't fit remote functions, `BODY_SIZE_LIMIT` raised in the Dockerfile). `shrink()` turns big photos into WebP in the browser first.
- Served through `/api/notes/[id]/images/[name]`, which checks access with `requireNote` and fetches with a file token. Names never repeat, so it caches immutable.

## Attachments and limits

- Protected `attachments` file field, same shape as images: `POST /api/notes/[id]/attachments`, one file per request, served through `/api/notes/[id]/attachments/[name]` as a forced download (`nosniff`, octet stream, original name from `fileInfo`).
- `#lib/server/limits.ts` resolves `limitsFor(user)`: the user's overrides over `app_settings` over `DEFAULT_LIMITS` (`#lib/limits.ts`). The browser gets them as `page.data.limits` to refuse early, the routes check again.
- On/off and per file size follow the uploader, storage the note's owner, so a collaborator spends the owner's quota. Usage is summed from `fileInfo`, deleting a note frees it, duplicating charges the copy.
- Administration settings go through `administration.remote.ts`, admin only. A null in an override takes that limit back to the default.
- `BODY_SIZE_LIMIT` in the Dockerfile and a reverse proxy's `client_max_body_size` must stay above the largest allowed file (`LIMITS.UPLOAD_BYTES`), see the README.

## Server layers

- **Queries**: `#lib/server/queries.ts`, every function returns `Result<T>`. Callers `unwrap()` into a SvelteKit error.
- **Remote functions**: `src/routes/api/*.remote.ts`, wrapped by `#lib/server/remote_function_error_trace`. Every argument has a zod schema, each starts with `signedIn()` (`#lib/server/signed_in.ts`), which gives the user or a 403.
- **Client**: calls go through `safeAction()` (`#lib/safe_action.ts`), which turns errors into toasts. The client `pb` instance is never imported on the server.

## Realtime

The root layout hands the auth token to the browser (the cookie stays httpOnly), the `(app)` layout connects once. Pages subscribe with `onCollectionChange()` from `#lib/realtime.ts` (bursts coalesce, the third argument marks events the page already shows, the callback gets the others) and react with `query().refresh()` for remote queries, `invalidateAll()` for load data. After a reconnect everything is invalidated once.

Notes are the exception, with 500 of them a refresh weighs 270 KB: commands answer with their one note and `kept()` from `#lib/note_list.ts` merges it into `getNotes()`, realtime events go in the same way through `keepEvents()`. Whatever isn't about one note (deleting a label, leaving) still refreshes.

## Ordering

Sort `manual` is the default. `position` stays 0 until a note is dragged, `positionOf()` falls back to creation time so new notes land first. A drop takes the midpoint of its neighbours (`positionBetween()`).

## Schema changes

- Edit `pb_schema.json`, then `POST /api/migration` with `SERVER_AUTH_SECRET`. A fresh install and dev import the whole schema (dev also drops fields it no longer lists) and record every migration as done.
- An existing install only runs what `MIGRATIONS` in `#lib/server/migrations.ts` lists and hasn't recorded yet, oldest first, each named by the release that brings it. Every schema change that ships needs an entry there, i.e. `addCollections('api_keys')` for 0.3.0. Never edit an entry that already went out, add a new one.
- A new field touches `pb_schema.json`, `#lib/schemas/`, the queries that write it, and any remote function schema that accepts it.
- PocketBase refuses to change a field's type. Give the field a new id in `pb_schema.json` and add a dev one off in `bootstrap.ts` that reads the values, drops the old field, adds the new one and refills them. Delete it once every dev database ran it.
