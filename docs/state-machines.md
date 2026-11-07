# State machines

Every place in notifica-ex where something moves through states, written or not. For each: its states, what must always hold, and what moves it. The second half lists what the audit of 2026-11-07 found could actually go wrong, in order of impact.

Keep this file in step with the code: a change to a machine below updates its table in the same commit.

How to read the evidence words:

- **Reproduced**: forced on the real local stack (browser, SvelteKit build, PocketBase, ntfy or a stand in for it).
- **Isolated**: forced in a small script with the same runtime behaviour, not through the app.
- **By reading**: follows from the code, not forced.
- **Not reproduced**: tried and it did not happen.

Contents: [Notes](#notes) · [Reminders](#reminders) · [Accounts and connections](#accounts-and-connections) · [Page state](#page-state) · [Issues](#issues) · [Candidates that held up](#candidates-that-held-up)

---

# Notes

## Note card

Implicit, in `src/lib/components/Note.svelte`. Held by `open` (prop), `id`, `draft`, `saved`, `savedAt`, `deleted`, `leaving`.

| State | Means |
|---|---|
| Fresh | `id` empty, nothing stored yet, the card is open |
| Closed, clean | `draft` equals `saved`, follows the stored note |
| Open, clean | Being edited, nothing to send |
| Dirty | `draft` differs from `saved`, a save is due within 900 ms or waits for the server |
| Saving | A run in `queue` is out |
| Rejected | The server refused the last save, `draft` still differs |
| Gone | `deleted` is set, nothing is sent any more, `save()` answers null so archive, delete, share, images and attachments stop there |

Invariants:

1. `saved` is the JSON of the content the server is known to hold, as far as this card knows.
2. One save at a time per card, a new note gets created exactly once (`queue`).
3. A closed card only adopts the stored note when `draft` equals `saved` and the copy is newer than `savedAt`.
4. A card that is open never changes under the person typing. A save brings along fields the card left alone, they show once the card closes where an editor holds its own text (Tiptap, a focused title).
5. Every unsaved `draft` has a backup, see [Draft backup](#draft-backup).
6. A save never writes a field the person did not change here (see [SM-1](#sm-1-saves-overwrite-changes-made-elsewhere)).

| From | Event | To | Notes |
|---|---|---|---|---|
| Fresh | typing | Dirty | Empty stays Fresh, nothing gets created |
| Fresh | close while empty | removed | Shrinks into the create button |
| Fresh | `save(true)` | Saving | Images and sharing need a stored note |
| Closed, clean | click | Open, clean | |
| Closed, clean | newer note arrives | Closed, clean | Adopts it |
| Open, clean | typing | Dirty | |
| Open, clean | newer note arrives | Open, clean | Not adopted yet, the next save or close brings it |
| Dirty | 900 ms pause, close, unmount, server back | Saving | |
| Saving | success | Clean or Dirty | Sends changed fields only, takes the others from the answer. Dirty when typing went on meanwhile |
| Saving | 404 | Gone | The card leaves the list, typed text becomes a note of its own |
| Saving | any other error | Rejected | `safeAction` toasts, the save resolves with `id` |
| Saving | outage | Rejected | Sent again when `serverStatus.down` clears |
| Rejected | typing | Dirty | |
| Open | navigation, type `link` or `goto` | Saving, then repeats the navigation | Stays when the save failed |
| Open | navigation, type `leave` | `leaving` | No wait, the backup stays for the next page |
| Open | navigation, type `popstate` | Closes first | `closeOverlay()` |
| Any | removed from the list while open | closed | Page effect at `+page.svelte:296` |

## Save queue

Inside the card. Each `save()` chains on the last, reads `draft` when its turn comes, and compares against `saved`. `safeAction` catches every failure, so a run never rejects and the chain can't get stuck. Runs that find nothing new return at once.

## Draft backup

`src/lib/drafts.ts`, `src/lib/draft_restore.ts`. An entry in `localStorage` under `note-draft:<key>`.

| State | Means |
|---|---|
| None | Nothing unsaved |
| Tended | Entry exists, its `tab` holds a Web Lock or is this page |
| Orphaned | Entry exists, its `tab` holds no lock |
| Restoring | One page holds the `note-draft-restore` lock and is sending it |

Invariants:

1. An entry belongs to one account, other accounts on this browser skip it.
2. Only one page restores at a time.
3. A note changed elsewhere meanwhile is never overwritten by a restore, the edits become a note of their own (`restoreOf`).
4. One bad entry never blocks the others (see [SM-6](#sm-6-drafts-that-can-never-be-saved)).
5. An entry the server can never accept doesn't stay forever (see [SM-6](#sm-6-drafts-that-can-never-be-saved)).

| From | Event | To |
|---|---|---|
| None | card turns dirty | Tended |
| Tended | save landed and `draft` equals what was sent | None |
| Tended | page goes | Orphaned |
| Orphaned | next page load, same account | Restoring |
| Restoring | restore is `drop` | None |
| Restoring | restore is `update` or `create`, server took it | None |
| Restoring | server refused | Orphaned, tried again next load |

## Note removal

`src/lib/deletions.ts`. One per delete press, holding one or more notes.

| State | Means |
|---|---|
| Hidden, waiting | In `hiddenNotes` and `waiting`, toast up with Undo |
| Finishing | Out of `waiting`, requests out, still hidden |
| Finished | Gone on the server, out of `hiddenNotes` |
| Refused | Server said no, back on the page, toast says why |
| Undone | Back on the page, the server never heard |
| Sent on leave | Page going, `keepalive` request out, ids in `sessionStorage` |

Invariants:

1. The server hears of a removal only once its toast ended or the page goes.
2. A removal finishes at most once (`waiting.delete` is the gate).
3. A note already gone counts as finished, it never comes back (see [SM-7](#sm-7-removals-that-come-back-or-offer-a-dead-undo)).
4. An Undo offered on screen can still undo (see [SM-7](#sm-7-removals-that-come-back-or-offer-a-dead-undo)).

| From | Event | To |
|---|---|---|
| Hidden, waiting | Undo | Undone |
| Hidden, waiting | toast ends or logout | Finishing |
| Hidden, waiting | `pagehide` | Sent on leave |
| Finishing | all answered | Finished, or Refused for those refused |
| Sent on leave | new page load | Notes stay hidden for that page |
| Sent on leave | page comes back from bfcache | Notes stay hidden, toast goes |

Archive has no state of its own: `offerArchiveUndo` stores at once, Undo writes the old `archived` and `pinned` back.

## Sharing membership

`notes.shared` on the note. A person is owner, collaborator or nobody.

| From | Event | To | Notes |
|---|---|---|---|---|
| Nobody | owner adds them | Collaborator | |
| Collaborator | owner removes them, or `leaveNote` | Nobody | Their reminders go (`deleteRemindersOn`), history stays |
| Collaborator | note deleted | Nobody | Cascade |

Invariant: nobody but the owner changes pin, archive, labels, order or membership, the server strips those fields.

PocketBase sends no realtime event to someone who just lost view access, so their card stays until the next load or their next action on it (see [SM-2](#sm-2-losing-a-note-loses-what-was-typed)).

---

# Reminders

## Reminder

`src/lib/server/reminders.ts`, `src/lib/reminders.ts`. Held by `next`.

| State | `next` | Means |
|---|---|---|
| Waiting | future | Goes off at `next` |
| Due | past, or under 30 s ahead | Next dispatch takes it |
| Retrying | past, under an hour | Reached nobody, tried again each minute |
| Snoozed | future, off the rule | Rule resumes after it |
| Finished | empty | Nothing further, still listed |
| Removed | row gone | Occurrences stay with `reminder` empty |

Invariants:

1. `next` empty or a time, never moved backwards by dispatch.
2. Dispatch never overwrites a `next` someone else wrote meanwhile (see [SM-4](#sm-4-dispatch-acts-on-a-stale-list)).
3. Dispatch never pushes about a reminder deleted meanwhile (see [SM-4](#sm-4-dispatch-acts-on-a-stale-list)).
4. Missed times collapse into one push.
5. `open` equals the number of logged occurrences without `done`, after every change (`countOpenOccurrences`).
6. Delivery is at least once: a crash or outage between push and move on pushes again next run. Phones and browsers tag by occurrence, a retried push is a new occurrence. Accepted.

| From | Event | To |
|---|---|---|
| Waiting | time passes | Due |
| Due | pushed somewhere, or no channel to try | Waiting, Finished when no time is left |
| Due | every channel failed, under an hour late | Retrying, log entry removed |
| Due | every channel failed, an hour late | Waiting or Finished, log entry stays |
| Due | owner left the note | Removed |
| Due | `next` changed during this run | Left as it is |
| Due | row deleted during this run | Skipped |
| Due | owner inactive | Waiting or Finished, nothing logged |
| Retrying | same as Due | |
| Waiting | edit or snooze | Waiting or Snoozed |
| Finished | edit | Waiting |
| Any | delete | Removed |

## Occurrence

One row per time a reminder went off.

| State | `done` | `reminder` |
|---|---|---|
| Plain | never for a non task | set or empty |
| Open | empty, `task` | set |
| Done | time | set |
| Snoozed | time, comment `Snoozed` | set |
| Orphaned | either | empty, reminder removed |

Invariants: never pruned. Done keeps the first press. A signature covers the id, so a button needs no login.

| From | Event | To | Notes |
|---|---|---|---|---|
| Open | Done button, history tick | Done | |
| Open | snooze button | Snoozed | Reminder `next` moves too |
| Done | Done button again | Done | "Already done" |
| Done | Undo in the history | Open | |
| Done | snooze button | Done | Reminder still moves, see [accepted](#accepted) |
| Logged | retry after all channels failed | Row deleted | Done or snooze from a caught up phone then answers 404, accepted |

## Dispatch run

`dispatchDueReminders`. Idle or Running, guarded by `running`, a second call during a run answers "still going". A run reads the due list once, then for each reminder: reread, check, log, deliver, reread, move on, recount.

Invariant: one run at a time in the process. The app runs as one process, a second one would break this.

## Push delivery

`src/lib/server/delivery.ts`. Each channel per owner: not set up (skipped), sent, failed. `deliver` returns no results for an inactive owner. A channel with `ntfyPaused` is skipped. The Android stream counts as reached when a phone listens, one away catches up.

## App stream

`src/routes/api/app-stream/[user]/+server.ts`, `src/lib/server/app_stream.ts`.

| State | Means |
|---|---|
| Rejected | 401 (bad key, inactive, unknown) or 503 (database away) |
| Catching up | Listening, sending what was missed |
| Live | Pushes and heartbeats |
| Ended | Closed by the server or the phone |

Invariants:

1. Nothing a stream does can bring down the server process (see [SM-3](#sm-3-stream-can-crash-the-server)).
2. An ended stream has no timer and no listener left.
3. A key dies with a password change or deactivation, running streams end at once.
4. Catch up doesn't resend what is already done.

| From | Event | To |
|---|---|---|
| (request) | key good | Catching up |
| (request) | key bad | Rejected |
| Catching up | list sent, or list failed | Live |
| Catching up | database gone mid request | Ended, the phone retries |
| Live | phone gone (`cancel`) | Ended |
| Live | `endStreams` | Ended, the next try hears 401 |
| Live | write to a closed stream | Ended |

## Android service

`ReminderService.kt`. Compiled, can't run here, so this table comes from reading.

| State | Means |
|---|---|
| Stopped | `prefs.enabled` off or no url |
| Connecting | In `read()` |
| Listening | Reading lines |
| Waiting | Backoff 2 s to 60 s |

| From | Event | To |
|---|---|---|
| Stopped | `listen(url)` | Connecting |
| Connecting | 200 | Listening |
| Connecting | 401 | Stopped, `prefs.url` cleared until the app hands out a new one |
| Connecting | other failure | Waiting |
| Listening | connection lost | Waiting |
| Waiting | timer | Connecting |
| Any | `reconnect()` from a new address | Connecting |
| Any | `stopListening` | Stopped |

Doubles get dropped by `seen`, the cursor only moves forward. Unverified race: `onStartCommand` during the loop's final `stopSelf()` finds `worker` set and only reconnects a loop already over. Can't be forced without a phone, recorded here, not fixed.

---

# Accounts and connections

## User

`users.state` plus `tokenKey` and `streamEpoch`.

| State | Means |
|---|---|
| Invited | Created active with a set password link, no password of their own yet |
| Active | Can log in |
| Inactive | Rejected on every request, token key rotated |
| Deleted | Row gone, notes and reminders cascade |

| From | Event | To | Effect |
|---|---|---|---|---|
| Invited | sets password | Active | |
| Active | admin deactivates | Inactive | `tokenKey` rotates, streams end (see [SM-3](#sm-3-stream-can-crash-the-server)) |
| Inactive | admin reactivates | Active | Stream key stays good, the phone has to retry |
| Active | password change | Active | `streamEpoch` moves, streams end, phone gets a new key on next open |

Invariant: an inactive user never gets a push and never gets past `hooks.server.ts`. Their reminders move on without logging.

## Session on one request

`hooks.server.ts`.

| Cookie | PocketBase answer | Result |
|---|---|---|
| None or invalid | | Visitor, redirect to login |
| Valid | Record, active | `locals.user` |
| Valid | Record, inactive | Cookie cleared, visitor |
| Valid | 401 or 404 | Cookie cleared, visitor |
| Valid | Connection failure, page | `serverDown`, error page, cookie stays |
| Valid | Connection failure, api or remote | 503, cookie stays |

## Logout

`Rail.svelte`. Sequence: stop device notifications, finish removals, save an open card, log out, disconnect realtime, go to login.

Invariant: logout always reaches the login page when the server answered, unsaved text stays as a backup when the last save failed (see [SM-5](#sm-5-logout-stuck-on-an-unsaved-card)).

## Server status

`#lib/singletons/server_status.svelte.ts`. Up or Down.

| From | Event | To |
|---|---|---|
| Up | 503 from a remote call, or `safeAction` health check fails | Down, `ServerBanner` |
| Down | `/api/health` poll answers | Up, data reloads, saves go out again |

## Realtime connection

`src/lib/realtime.ts`. Disconnected, Connected, Reconnected (invalidates everything once). `connectedOnce` tells first from later. Bursts coalesce, `onCollectionChange` waits while `busy.actions` is above zero, so an answer from a command can't be overwritten by its own older event.

## Bootstrap

`/api/migration`. Fresh (no `migrations` collection): schema import plus first user. Dev: schema import plus dropped fields. Production, not fresh: no schema import, so a new field needs applying by hand until versioned migrations exist.

---

# Page state

## Editing

`editing` in `(app)/[[view]]/+page.svelte`: null, or `{ id, fresh, key, focus }`. One card at a time. Opening another saves the first (it closes, `save` runs). `frozen` holds the grid order while open.

## Selection

`#lib/selection.svelte.ts`. Empty or Selecting, with an anchor. Invariant: a selection and an open card never coexist, drag needs both absent. Escape and back clear it.

## Drag

`drag` on the same page. Idle, Pressed, Dragging. Only mouse and pen, only sort `manual`, only with nothing open or selected. Drop writes one `position`.

## Overlays and back

`#lib/back.ts`. Back sends Escape first. A handler that acted `preventDefault()`s it, back then stops there. Only when nothing took it does the history move.

## Confirm dialog

`#lib/singletons/confirm.svelte.ts`. Closed or Open with one pending answer. A new request answers the old one `false`, so no awaited caller hangs.

## Views

`views.remote.ts`. Invariant: an account has at least one view, the last can't be deleted, `getViews` recreates the starters if none are left. A race deleting the last two heals that way.

## Card window

`#lib/card_window.svelte.ts`. Each card above `CARD_WINDOW_FROM` notes is Near (real card) or Far (empty box of its last height). An open card, a selected one and anything being dragged stay Near.

---

# Issues

Sorted by impact. Each groups what one fix covers.

| Issue | What goes wrong | Impact | Status | Fix commit |
|---|---|---|---|---|
| [SM-8](#sm-8-a-built-app-refuses-its-own-cron) | A built app refuses its own cron and setup | No reminders at all on a real install | Fixed | `8023d8c` |
| [SM-1](#sm-1-saves-overwrite-changes-made-elsewhere) | Saves overwrite changes made elsewhere | Silent data loss | Fixed | `0d05671` |
| [SM-2](#sm-2-losing-a-note-loses-what-was-typed) | Losing a note loses what was typed | Data loss | Fixed | `f870ba2` |
| [SM-3](#sm-3-stream-can-crash-the-server) | A stream can crash the server, ended streams linger | Outage for everyone | Fixed | `b850138` |
| [SM-4](#sm-4-dispatch-acts-on-a-stale-list) | Dispatch acts on a stale list | Lost snoozes and edits, wrong pushes | Fixed | `2bf8872` |
| [SM-5](#sm-5-logout-stuck-on-an-unsaved-card) | Logout stuck on an unsaved card | Stuck session | Fixed | `9ede739` |
| [SM-6](#sm-6-drafts-that-can-never-be-saved) | Drafts that can never be saved | Repeating errors, restores blocked | Fixed | `9ede739` |
| [SM-7](#sm-7-removals-that-come-back-or-offer-a-dead-undo) | Removals that come back or offer a dead Undo | Wrong screen, false promise | Fixed | `aeb6c03` |

## SM-8 A built app refuses its own cron and setup

Reached on every production install, every minute. SvelteKit treats a POST with no `Content-Type` and no `Origin` as a cross site form (`is_csrf_forbidden`), and the dev server doesn't enforce it. PocketBase's cron and the compose `migration` curl sent neither.

**Evidence:** PocketBase's log against a production build, every minute: `Reminder dispatch .../api/reminders/dispatch - Status: 403 - Cross-site POST form submissions are forbidden`. `curl -X POST` with the bearer header on `/api/maintenance` answers 403, the same with `Content-Type: application/json` gets through. So reminders never fired, maintenance never ran, a fresh install never got its schema. The ntfy buttons and the Android app already send JSON.

**Fix:** both cron calls, the compose `migration` and the README commands name a content type. The PocketBase image needs a rebuild. **Test:** `machine_calls.test.ts` checks every call in the cron file and the compose file. Checked live, the PocketBase log has no 403 anymore.

## SM-1 Saves overwrite changes made elsewhere

**Machine:** note card. **Evidence:** reproduced.

Every save sends the whole draft (`Note.svelte:140`). An open card doesn't follow the stored note (invariant 4), so its draft holds what the note was when opened. A title edit there writes back every other field too.

```
G title edit on an open card, other device pinned and changed the body | pinned false body "original" title more AUDIT G
```

Pin and the other device's body were silently undone.

**Fix:** a save sends only the fields changed since the last save (`changedFields`), the answer fills in the rest (`afterSave`). **Test:** `drafts.test.ts`, "saving only what changed".

## SM-2 Losing a note loses what was typed

**Machine:** note card, sharing membership. **Evidence:** reproduced.

Taken off a shared note, PocketBase sends no event, the card stays. Typing into it gets a 404, `gone()` (`Note.svelte:155`) forgets the backup and sets `deleted`.

```
E after being taken off, card still there true
E save | toast This note was deleted or is no longer shared with you.
E still open with a dead card true stored drafts 0
E after reload, card false | typed text saved as a note of its own 0
```

The same happens to a note deleted elsewhere while open.

**Fix:** a 404 takes the card off the list. If title or body were among the unsaved changes they become a note of their own (`rescued`), without someone else's labels and flags. A copy that fails stays in the backup. **Test:** `drafts.test.ts`, "edits on a note that is out of reach".

**Left as it is:** a closed card of a note taken from you stays until the next load or until it gets opened and edited. PocketBase sends no event in that case, and a quick action on it answers with a toast.

## SM-3 Stream can crash the server

**Machine:** app stream, user. **Evidence:** isolated for the crash, by reading for the route and the rest.

`start()` in the stream route starts the heartbeat, then awaits the catch up. `getOccurrencesSince` throws `outage()` when PocketBase just went away (`pbErrorHandler`). A rejected `start` errors the stream without calling `cancel`, so the interval stays and its next `enqueue` throws outside any handler.

```
$ node a_crash.mjs
read rejected outage
UNCAUGHT ERR_INVALID_STATE Invalid state: Controller is already closed
```

Same on Bun. The window is narrow: the key check must pass, then PocketBase must drop before the catch up answers, as when PocketBase restarts while phones reconnect. An uncaught error ends the process for every user.

Related: `setUserState` to inactive doesn't call `endStreams` (`users.remote.ts:91`), the connection stays open, silently, until the phone reconnects. Catch up resends occurrences already done on another device (`getOccurrencesSince` has no `done` filter), so a checked task can pop up again on a phone back online.

**Fix:** `streamFor` in `app_stream.ts` holds the whole stream, a failed catch up ends it cleanly and no timer can throw. Deactivating ends running streams, catch up leaves out what is done. **Test:** `app_stream.test.ts`.

## SM-4 Dispatch acts on a stale list

**Machine:** reminder, dispatch run. **Evidence:** reproduced with a stand in for ntfy whose answer hangs 3 s (timeout in production is 10 s, per channel, and reminders run one after another, so a run can last minutes).

The due list is read once at the start. `next` gets computed from that copy and written over whatever is there by then.

```
B1 repeating, moved to <in 1 h> | after dispatch <tomorrow> | OVERWRITTEN
B2 once, moved to <in 1 h> | after dispatch '' | LOST
C after deleting the waiting one, pushes: ['AUDIT SLOW|buttons:0', 'AUDIT DELETED|buttons:0']
```

So a snooze pressed while a run is going, or an edit in the form, is undone, a once reminder moved to later is finished instead, and a deleted reminder still pushes, without Done buttons since its log entry failed.

Related, by reading: a failed log still pushes (a button free notification, and the history misses it). An inactive owner's reminders keep logging. `describeRule` has no bound while `occurrences.rule` allows 200 characters, a reminder with many rules fails the log every time.

**Fix:** each reminder is read again right before it goes off and before it moves on, deleted ones are skipped and a `next` changed meanwhile stands (`movedOn`). A failed log stays due without a push for the hour, an inactive owner's reminder moves on without a log, the rule line is cut to its field. **Test:** `reminders.test.ts`, "a reminder changed during a dispatch run".

**Left as it is:** milliseconds remain between the last read and the write, PocketBase has no conditional update. A snooze has to land exactly there to get lost.

## SM-5 Logout stuck on an unsaved card

**Machine:** logout, note card. **Evidence:** reproduced.

A mouse press outside closes the card, keyboard or a phone's menu doesn't. Logout then runs `logoutUser` first, `goto('/login')` triggers the card's `beforeNavigate`, which cancels and saves with a session already gone.

```
N keyboard logout with unsaved card | url / | still open true | toast Access denied: User does not have the required authorization level of user
N stored title AUDIT N
```

The person stays on a dead page, the save never lands.

**Fix:** logout saves open cards first (`saveOpenNotes`). The way to `/login` never waits on a card, what still can't be saved stays in the backup for the next load. **Test:** `drafts.test.ts`, "logging out".

## SM-6 Drafts that can never be saved

**Machine:** note card, draft backup. **Evidence:** reproduced.

A draft the server refuses stays in `Rejected` on a closed card, with no way out. The title field takes more text than `NOTE_TITLE` allows, nothing clamps it.

```
H toast after over long title | Title must not be longer than 200 characters.
H closed card after a change elsewhere shows | still the rejected text
H load 2 toast | Title must not be longer than 200 characters. | stored 1
H load 3 toast | Title must not be longer than 200 characters. | stored 1
```

A label deleted meanwhile poisons a restore the same way (by reading). And a broken entry blocks all others, `orphanedDrafts` has an unguarded `JSON.parse` (`drafts.ts:75`):

```
L corrupt entry beside a good one | good restored false | left broken,good | toast (none)
```

Two tabs on one note share a key, so one tab's successful save drops the other's backup (by reading).

**Fix:** a closed card and a restore store what fits (`fitted`) and say so, a title running over moves into the text, only the end of an overlong text gets lost. An open card keeps the toast, the person can still correct it. A restore drops labels gone meanwhile. A broken entry is removed (`parseDraft`), every tab keeps its own backup. **Test:** `drafts.test.ts`, "a draft the server would refuse" and "a stored draft".

## SM-7 Removals that come back or offer a dead Undo

**Machine:** note removal. **Evidence:** reproduced.

A note deleted elsewhere during the Undo time: the finish answers 404 and the note returns as a ghost until reload.

```
F deleted elsewhere too, toast ended | card back true | toast Note not found.
```

Leaving a page and coming back through bfcache: the request was sent, the toast still offers Undo that can't undo.

```
K persisted true | toast Note deleted Undo | note gone on the server
```

The page's own realtime check (`shown` in `+page.svelte:45`) compares against the filtered list, so a delete event for a hidden note looks like its own echo and gets dropped, which is what keeps the ghost.

**Fix:** `removals.ts` holds the waiting list. A 404 counts as done, a finished removal also leaves the list, `shown` compares against the stored list. Coming back through bfcache ends the toast of what was sent, those notes stay gone. **Test:** `removals.test.ts`.

---

# Candidates that held up

Looked at, not bugs. Recorded so nobody hunts them again.

## Not reproduced

- **`open` count race**: parallel Done presses, each recount reading before another's write lands. 8 and 40 parallel presses over 18 rounds (480+ presses), stored count always equal to the real one. Theoretically possible, the next press or dispatch recounts anyway. Not fixed.

## Ruled out by reading

- **Stuck save queue**: `safeAction` catches everything, a run never rejects.
- **Stale `editing`**: the page effect at `+page.svelte:296` closes the editor when the open note vanished.
- **Echo resurrecting a note**: `onCollectionChange` waits on `busy.actions`, a command's answer lands before its older event.

## Accepted

- **Last writer wins on one field**: two people editing the same field overwrite each other. Saves only send what changed since SM-1, the same field stays last writer wins.
- **`tickTask` on a stale card body**: a tick sends the card's whole body, as of the last event. A realtime event updates it within a moment.
- **`shareNote` writes the whole list** from the owner's copy, only the owner ever writes it.
- **`reorderViews` ignores single failures**: the next load shows the real order.
- **Admins deactivating each other**: nothing stops two admins, the first user can be recreated only on an empty database. Left to people.
- **Failed invite mail**: the link shows in the admin UI, recoverable.
- **Snooze edges**: a press on an old notification still moves the reminder, a `next` in the past fires next minute. Snoozing is what was asked.
- **Done or snooze for an occurrence removed by a retry**: 404 on a button of a phone that caught up in that minute, the next push brings a working one.
- **Android `onStartCommand` race**: see [Android service](#android-service), needs a phone.
