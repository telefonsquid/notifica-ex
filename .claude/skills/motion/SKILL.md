---
name: motion
description: Easing and duration tokens, the helpers in motion.ts (rise, sink, unfold, morph, stagger, measure, glide), grid glides and masonry, view transitions between pages, reduced motion. Use when anything moves, appears, disappears or changes size.
---

# Motion

Motion is deliberate: everything that changes place or size glides, nothing pops. Keep it calm, no springs on navigation.

## Tokens

- Easings in `src/app.css` `@theme`: `--ease-out`, `--ease-in`, `--ease-in-out`, `--ease-emphasized`, `--ease-spring`.
- Durations on `:root`: instant 90, fast 160, base 280, slow 460, page 560 ms. All drop to 1ms under `prefers-reduced-motion`.
- `#lib/motion.ts` reads them for JS: `duration(name)`, `cssEasing(name)`, `easing` (cached bezier functions). Under reduced motion durations come back as 0.

## Helpers in `#lib/motion.ts`

| Helper | Use |
|---|---|
| `rise` / `sink` | Soft appear and disappear (popovers, tooltips, toasts) |
| `appear` | `rise` with the delay for what only an open note has |
| `stagger` | Delay for lists that come in together |
| `unfold` | Height changes inside a card, `in:` and `out:` both. Animates size, padding, margin and flex gap with a symmetric easing, so swapping two branches keeps the sum steady |
| `morph` | Attachment, lets a band's height follow its content. Its own easing while the card is open and settled, the glide's while it closes. Animates to the height the layout grants, never past a capped scroll area, and never clips scroll areas (that reset the scroll and looped) |
| `measure` / `glide` | FLIP for grids: `measure()` before the update, `glide()` after. `glide()` takes a duration token, `slow` by default, a closing note goes back with `base` |
| `withoutLeaving` | Filters out cells mid outro |

## Grid glides

- Cells carry `data-flip`, the part that resizes `data-flip-body`. The cell keeps its final size for the grid while the body animates width and height under `[data-resizing]`, so text reflows instead of stretching.
- A resizing cell keeps its final spot and only its body travels, a full size cell far off stretched the page into scrollbars.
- `measure()` and the cell height `glide()` holds skip `inert` elements (Svelte sets `inert` on everything mid outro), so leaving parts count as gone and the grid doesn't jump when they finish.
- Opening and closing a card call the page's `snapshot()` themselves, since a card's blocks can update before the page's `$effect.pre`.
- The page's glide runs from `queueMicrotask` + `flushSync`. `tick()` waits a frame in async mode.
- `html` keeps `scrollbar-gutter: stable`, the grid `overflow-anchor: none`.
- A floating note (`afloat` on the cell, from `NoteOpening`) is centred with `translate: -50% -50%` on its frame, so its top moves while its height glides. `data-flip-centred` makes `glide()` take dy from the centres. The ghost's `::before` fades in through `@starting-style` and out with `closing`, its 100vmax spread is the dim, no scrim element.

## Masonry

`#lib/masonry.ts` places every cell explicitly on 1px grid rows, each in the column (or column pair for a wide card) that ends highest, in sort order. CSS only sets the column count, the vertical gap is `--note-row-gap`. It repacks through a ResizeObserver, a new cell gets watched and its first report packs it, so a change never packs twice. `glide()` takes it as its layout step so cards glide straight to the packed spot. Leaving cells taken out of the flow by `floatCell()` (`data-floating`) are skipped. The `data-*` attributes the glides and the packer rely on are listed at the top of `#lib/relayout.ts`. `pack()` reads every span before it writes a placement: one read per placement forces a full layout each time, which cost seconds at 500 notes.

An open card (`.wide`) keeps `--note-open-gap` from its neighbour on the side its label tabs show, above it only when a note sits there. `pack()` clears all placements to count the columns, so it holds the grid's height with `min-height` meanwhile: the collapsed page would clamp the scroll position to the top.

The grid has `overflow-anchor: none`, so the browser never anchors the scroll. Packs from the observers and image loads (`pack(grid, true)`) anchor it themselves instead: the first card fully on screen stays where it was, else a card above the screen that grew or shrank (a window box swapped for its real card, a late image) pulls the page up or down under the reader. No anchoring while a card is open, resizing, dragged or floating, those move the page themselves. Glides and window resizes pack unanchored.

## Long lists

Above `CARD_WINDOW_FROM` (200) visible notes, `#lib/card_window.svelte.ts` keeps only cards within `REACH` of the screen. The others stay in the grid as empty boxes of their remembered height, `estimatedHeight()` until they were seen once, so masonry, `measure()` and `glide()` need no special case. The open card and the first `CARDS_ALWAYS_SHOWN` always render. Browser find only sees rendered cards, the app's search sees all.

## Page changes

- View transitions from the root layout. `.vt-rail`, `.vt-page`, `.vt-rail-indicator` and `.vt-toolbar` name the moving parts. The indicator glides with in-out.
- Within one route (switching views) `data-transition="same-page"` unnames `.vt-page`, so the page shows live and shared cards glide via `glide()`, snapshotted in the page's `onNavigate` since the async batch swaps cells before `$effect.pre`. Leaving cards fade in place (`leave`), the ones off screen hide at once. Their transition still needs a duration: Svelte never removes a card whose outro ended instantly while others in its each block still run.
- Rail icons carry `.vt-rail-icon` (`match-element`, class `rail-icon`) so their layers sit above the indicator. The name sits on a still wrapper, the hover tilt on the svg inside: Firefox loses the new snapshot of a named element with its own transform.
- Icons crossfade with the indicator's timing. The toolbar shows live (old image hidden, new one unanimated). A part present on one side only fades with the page (`:only-child`, `:not()` never matches on these pseudos).

## Card patterns

- Open only controls fade under `.folded` first, then fold away while the card shrinks. Open only parts (`.extra`) fade in after the card grew.
- New notes grow out of the create button and shrink back into it when empty. The shrink places the note every frame, its width following the body.
- Reminder band changes unfold only once the card finished growing (`settled`), before that the glide covers them.
- Segmented controls (`#lib/ui/Glider.svelte`) and tab indicators glide one thumb to the pick.
- Tooltips show after 250 ms with a soft `rise`.

## Rules

- Never hardcode a duration or easing, use the tokens.
- Every new animation must collapse under reduced motion (tokens do this for you).
- Prefer animating size on a body inside a still cell over moving the cell.
