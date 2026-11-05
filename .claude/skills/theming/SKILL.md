---
name: theming
description: Token layers (color, layout, spacing, radius, motion durations), themes and switching, note colours, device preferences. Use when touching app.css, a theme file, note colours or anything that picks a colour or size.
---

# Theming

## Token layers

1. **Palette**: raw colour scales (tangerine, charcoal, platinum, ...) in `src/app.css` `@theme`. Never used by components.
2. **Theme tokens**: `src/lib/themes/<name>.css` sets `--theme-*` per `[data-theme]`: canvas, card, raised, line(-strong), ink(-muted/-faint), accent(-soft), on-accent, secondary(-soft) and the note tints `--theme-note-*`. A theme may also override the `--layout-*` defaults.
3. **Defaults** on `:root` in `app.css`: layout (rail width, topbar height, content max and gutter, note min/max/gap, card padding, card and control radius), `--theme-signature`, the solid note colours, the `--spacing` density, the `--duration-*` tokens.
4. **Utilities**: `@theme inline` maps theme and layout tokens onto `bg-card`, `text-ink-muted`, `border-line`, `p-card`, `w-rail`, `rounded-card` and so on. Components use these only.

A new token goes into every theme file (or the `:root` defaults if it is theme independent) and into `@theme inline` if a utility should exist.

## Themes

- Platinum (light, default) and Charcoal (dark). Tangerine accent, Powder Blue secondary in both.
- `#lib/themes/index.ts` holds the `THEMES` registry, `themeNameSchema`, `DEFAULT_THEME` and `THEME_COOKIE`. A new theme needs an entry there and its CSS file imported in `app.css`.
- The choice is a cookie. `hooks.server.ts` renders it into `%theme%` on `<html>`, so the first paint is right.
- `#lib/themes/switch.ts` reveals the new theme as a circle growing from the click point (view transition).
- Pickers read the `<html>` attribute, not the load data, which keeps the first page load's value across client navigation.

## Device preferences

Same pattern as the theme: a cookie per device, rendered into an `<html data-*>` attribute by `hooks.server.ts`. `#lib/preferences.ts` holds them. Example: `labels` (top or bottom card edge for label tabs) becomes `<html data-labels>`, `images` (cropped or whole) becomes `<html data-images>`. Their pickers share `PreferencePicker`.

## Note colours

- Names from `NOTE_COLORS` (tints, solids, stickies, textures), shared by notes and labels and stored as the name, never a hex value.
- Adding one: `schemas.ts`, both `color` selects in `pocketbase/pb_schema.json`, `#lib/note_colors.css`, and its place in `COLOR_GROUPS` (`#lib/notes.ts`).
- Elements set `data-note`. `note_colors.css` paints `.note-surface` and `.note-mark` from it.
- Tints and stickies come from each theme's `--theme-note-*`. Solids are the same in every theme and sit in the `:root` defaults.
- `COLOR_GROUPS` orders every picker: Soft, Sticky, Solid, Texture, 18 each so a group fills two rows of nine.
- Its WHITE INK and DARK INK groups override the `--theme-*` tokens inside the note, so components get readable ink without knowing about the colour.
- Inside a coloured note `--theme-accent` changes. Anything that must stay the app accent (selection wash) uses `--theme-signature`, resolved on `:root`.
- The colour picker trigger wears a rainbow ring so it never blends into a note of its own colour.

## Rules

- No palette colours or hex values in components.
- CSS comments are `/* */`.
- Durations and easings belong to the `motion` skill.
