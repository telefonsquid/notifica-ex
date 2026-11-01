---
name: data-model
description: PocketBase collections and access rules, sharing, images, realtime, the query and remote function layers, schema changes and migrations. Use when adding a field or collection, changing who may see or edit what, or writing server data access.
---

# Data model

## Collections

Schema lives in `pocketbase/pb_schema.json`. Zod mirrors live in `#lib/schemas.ts`, size caps in `#lib/schema_limits.ts`.

| Collection | Fields | List/view rule |
|---|---|---|
| `users` (auth) | name, authorizationLevel, state, ntfyTopic | own record, admins all (names for sharing come from `getPeople()` on the server) |
| `labels` | owner, name, color | owner |
| `notes` | owner, title, body (markdown), color, labels, pinned, archived, position, images (protected file), shared (users, max 20) | `owner = @request.auth.id \|\| shared.id ?= @request.auth.id` (a multi relation needs `.id ?=`, plain `?=` silently matches nothing) |
| `reminders` | note, owner, at, repeat, weekdays, until, every, timezone, task, next, open | owner, so a collaborator's reminders stay private |
| `occurrences` | owner, note, reminder, at, rule, timezone, task, done, comment | owner, the reminder history |
| `views` | owner, name, icon (lucide name, text), position, filter (json), sort (json) | owner |
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
- UI: `owned = note.owner === me` decides which actions show.

## Images

- Protected `images` file field, since PocketBase is public for realtime.
- Upload through `POST /api/notes/[id]/images`, one file per request (files don't fit remote functions, `BODY_SIZE_LIMIT` raised in the Dockerfile). `shrink()` turns big photos into WebP in the browser first.
- Served through `/api/notes/[id]/images/[name]`, which checks access with `getNoteFor` and fetches with a file token. Names never repeat, so it caches immutable.

## Server layers

- **Queries**: `#lib/server/queries.ts`, every function returns `Result<T>`. Callers `unwrap()` into a SvelteKit error.
- **Remote functions**: `src/routes/api/*.remote.ts`, wrapped by `#lib/server/remote_function_error_trace`. Every argument has a zod schema.
- **Client**: calls go through `safeAction()` (`#lib/pocketbase.ts`), which turns errors into toasts. The client `pb` instance is never imported on the server.

## Realtime

The root layout hands the auth token to the browser (the cookie stays httpOnly), the `(app)` layout connects once. Pages subscribe with `onCollectionChange()` from `#lib/realtime.ts` (bursts coalesce into one refresh) and react with `query().refresh()` for remote queries, `invalidateAll()` for load data. After a reconnect everything is invalidated once.

## Ordering

Sort `manual` is the default. `position` stays 0 until a note is dragged, `positionOf()` falls back to creation time so new notes land first. A drop takes the midpoint of its neighbours (`positionBetween()`).

## Schema changes

- No versioned migrations before the first release. Edit `pb_schema.json`, then `POST /api/migration` with `SERVER_AUTH_SECRET`: `bootstrap.ts` imports the schema and drops fields it no longer lists (the import alone keeps them).
- A new field touches `pb_schema.json`, `schemas.ts`, the queries that write it, and any remote function schema that accepts it.
- PocketBase refuses to change a field's type. Give the field a new id in `pb_schema.json` and add a dev one off in `bootstrap.ts` that drops the old field, adds the new one and refills it (`retypeViewIcons` is the pattern).
- After the first release, data changes become versioned migrations run from the same endpoint.
