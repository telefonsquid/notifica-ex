---
name: data-model
description: PocketBase collections of notifica-ex, their access rules, how sharing works, how the server reads and writes them, and how schema changes roll out. Read before changing pb_schema.json, schemas.ts, queries.ts or a remote function.
---

# Data model

## Collections

| Collection | Holds | List and view rule |
|---|---|---|
| `users` | accounts, `authorizationLevel` user or admin, `state` active or inactive, `ntfyTopic` | own record, admins all |
| `notes` | `title`, `body` (markdown, checklists included), `color`, `labels`, `images`, `pinned`, `archived`, `owner`, `sharedWith` | owner or shared with |
| `labels` | `name` (unique per owner), `color` | owner |
| `reminders` | the rule (`at`, `repeat`, `every`, `weekdays`, `until`, `timezone`, `task`) and its state (`next`, `sent`, `done`) | owner |
| `views` | `name` (unique per owner), `icon`, `position`, `filter` and `sort` as json | owner |
| `migrations` | versions already applied | none |

Create, update and delete rules are all closed. Every write goes through a remote function in `src/routes/api/*.remote.ts`, which uses the superuser connection from `#lib/server/pocketbase_admin_connection.ts`. The list and view rules only matter for realtime: the browser subscribes with the user's own token, so PocketBase filters events through them. A new collection needs list and view rules before anything subscribes to it.

## Server access

- `#lib/server/queries.ts` wraps every call into a `Result<T>`, `unwrap()` turns a failure into a SvelteKit error with the database reason as `details`.
- `getAllOwned` and `getOwned` filter by `owner`. Notes use `getNotesOf` and `getNoteOf` instead, which also let in people the note is shared with. A record the user may not see fails like a missing one.
- Every remote function argument has a zod schema from `#lib/schemas.ts`, size caps live in `#lib/schema_limits.ts`. Partial updates must not use `.partial()` on objects with defaults or prefaults, zod 4 fills in the defaults of missing keys; `viewChangesSchema` shows the way out.

## Sharing

The owner adds people by email (`shareNote`), they read and edit everything on the note, only the owner deletes it, the others leave it (`deleteNote` does either). `labels` holds everyone's label ids, `updateNote` keeps the ids of others as they were and only takes the caller's own from the request. Reminders stay personal. `getPeople()` returns name and email of everyone one shares with, nothing else of other accounts ever reaches the browser. Rules on a multi relation need `sharedWith.id ?= ...`, `sharedWith ?= ...` silently matches nothing.

## Images

Protected file field `images` on notes, thumbs `640x0` and `1280x0`. Served by `/api/notes/[id]/images/[file]?size=...` after an access check, uploaded one per request to `/api/notes/[id]/images`.

## Schema changes

Until the first release `pocketbase/pb_schema.json` is the schema. `POST /api/migration` imports it on a fresh install, and in dev on every call, dropping fields the file no longer lists. Change the json, the zod schema in `#lib/schemas.ts` and the limits together. After the first release, versioned migrations run from the same endpoint and get recorded in `migrations`.
