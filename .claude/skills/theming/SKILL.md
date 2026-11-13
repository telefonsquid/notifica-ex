---
name: theming
description: Token layers (color, layout, spacing, radius, motion durations), themes and switching, note colours, device preferences. Use when touching app.css, a theme file, note colours or anything that picks a colour or size.
---

# Theming

## Token layers

1. **Palette**: raw colour scales (tangerine, charcoal, platinum, ...) in `src/app.css` `@theme`. Never used by components.
2. **Theme tokens**: `src/lib/themes/<name>.css` sets `--theme-*` per `[data-theme]`: canvas, card, raised, line(-strong), ink(-muted/-faint), accent(-soft), on-accent, secondary(-soft) and the note tints `--theme-note-*`. A theme may also override the `--layout-*` defaults. `--layout-bottom-clear` is the room the phone bottom row takes (toasts, menu and page padding sit above it), `--layout-note-tab` the label tab height. A contract test keeps the one column breakpoint wider than two `--layout-note-min` and their gap.
3. **Defaults** on `:root` in `app.css`: layout (rail width, topbar height, content max and gutter, note min/max/gap, card padding, card and control radius), `--theme-signature`, the solid note colours, the `--spacing` density, the `--duration-*` tokens.
4. **Utilities**: `@theme inline` maps theme and layout tokens onto `bg-card`, `text-ink-muted`, `border-line`, `p-card`, `w-rail`, `rounded-card` and so on. Components use these only.

A new token goes into every theme file (or the `:root` defaults if it is theme independent) and into `@theme inline` if a utility should exist.

## Themes

- Platinum (light, default) and Charcoal (dark). Scarlet accent (`--theme-riso-red`, the red where orange overprints pink), Powder Blue secondary in both.
- `#lib/themes/index.ts` holds the `THEMES` registry. A new theme needs an entry there and its CSS file imported in `app.css`.
- The choice is a cookie. `hooks.server.ts` renders it into `%theme%` on `<html>`, so the first paint is right.
- `#lib/themes/switch.ts` reveals the new theme as a circle growing from the click point (view transition).
- Pickers read the `<html>` attribute, not the load data, which keeps the first page load's value across client navigation.

## Device preferences

Same pattern as the theme: a cookie per device, rendered into an `<html data-*>` attribute by `hooks.server.ts`. `#lib/preferences.ts` holds them. Example: `labels` (top or bottom card edge for label tabs) becomes `<html data-labels>`, `images` (cropped or whole) becomes `<html data-images>`, `density` (comfortable or compact) becomes `<html data-density>`, which overrides the note size, gap, card padding, radius and `--spacing` tokens in `app.css`, scoped to `.note-grid` and `.note` so nothing outside the notes changes. Compact keeps two columns on phones through its own container range, `schema_contract.test.ts` checks both one column breakpoints against the note tokens. Their pickers share `PreferencePicker`.

## Note colours

- Names from `NOTE_COLORS` in `#lib/note_colors.ts` (tints, solids, stickies, patterns), shared by notes and labels and stored as the name, never a hex value.
- Adding one: `#lib/note_colors.ts`, both `color` selects in `pocketbase/pb_schema.json`, `#lib/note_colors.css`, and its place in `COLOR_GROUPS` (`#lib/note_colors.ts`).
- Elements set `data-note`. `note_colors.css` paints `.note-surface` and `.note-mark` from it.
- Tints and stickies come from each theme's `--theme-note-*`. Solids are the same in every theme and sit in the `:root` defaults.
- `COLOR_GROUPS` orders every picker: Default (`''`, follows labels and the account default), then Soft, Sticky, Solid with 18 each so a group fills two rows of nine, then Pattern with the 36 of `NOTE_PATTERNS` and the 9 pride flags of `NOTE_FLAGS` as its last row. Soft starts with `plain`, which looks like no colour but stays put when a label would paint the note. The note's `ColorPicker` adds its labels' colours to the Default row as quick picks, nothing else in the picker reacts to labels. Flags get a light wash and dark ink. A retired pattern gets a migration that hands its notes to the replacement (0.4.0-patterns).
- Patterns that move on hover only change `--note-texture-position`, by a fifth at most, so the look stays and only the light shifts.
- The account's default colour (`users.noteColor`, Settings → Appearance → Default note color) lands on new notes marked `colorDefault`, auto colour labels paint over it. See the `data-model` skill.
- Its WHITE INK and DARK INK groups override the `--theme-*` tokens inside the note, so components get readable ink without knowing about the colour.
- Inside a coloured note `--theme-accent` changes. Anything that must stay the app accent (selection wash) uses `--theme-signature`, resolved on `:root`.
- The colour picker trigger wears a rainbow ring so it never blends into a note of its own colour.

## Riso print

The look of the loop logo: flat inks, each over a second pass slipped off register.

- **The slipped pass always sits bottom right of its ink**, the top left edge shows the ink alone. Every element, text shadows and hover drift included, never mirrored. A press brings it back to zero, never past it.
- Inks: `--theme-riso-orange`, `-pink` (fluoro pink on Platinum, a darker grape on Charcoal) and `-blue`, `--theme-riso-red` for what the orange and pink make together (computed, the app accent and every single colour red), `--theme-riso-on-ink` for letters on an ink, `--theme-riso-field` (white or black) for paper. Inks blend through `--theme-riso-ink-blend` (multiply on Platinum, hard-light on Charcoal, where screen glowed magenta and multiply went muddy), but only inside an isolated layer (`isolation: isolate`), so they overprint each other and never mix with the page. The ink sits above its pass and carries the blend, hard-light depends on the order.
- `riso-print` (`app.css`): a fill over a pass 4px 3px apart, as `::after` over `::before`, each slipped half of it from the element so the pair centres on its content (it takes both pseudo elements and makes the element relative, an absolute one sets its position again in scoped CSS). Both drift apart on hover and meet in the middle on press. `riso-print-ink` paints it orange over pink with paper white letters (primary `Button`, create button, active rail and settings tab indicators), `riso-print-paper` field paper over a blue pass, unblended (secondary `Button`, the phone menu buttons).
- Surfaces that aren't pressed (toasts, rail tooltips, the settings phone list) take `background: var(--theme-riso-field)` and `box-shadow: 4px 3px 0` of their pass, no drift. Error toasts use a red pass. Fields have a blue pass, red while focused. Settings titles carry a blue rule over a pink pass. Orange alone stays for the ink fills and the logo, everything else that was orange is red.
- `#lib/ui/RisoIcon.svelte` prints a lucide icon over a pink pass. `--riso-ghost` (0 to 1) hides or shows the pass, the rail shows it only on hover. Inside `riso-print` it prints once and `--riso-icon-blend: normal` keeps white letters off the blend.
- Ghost buttons have no print and sink instead.

## Rules

- No palette colours or hex values in components.
- CSS comments are `/* */`.
- Durations and easings belong to the `motion` skill.
