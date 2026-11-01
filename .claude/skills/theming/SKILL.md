---
name: theming
description: Colour and layout tokens of notifica-ex, how themes, note colours and per-device preferences reach the first paint. Read before touching app.css, a theme file, note_colors.css or anything with a colour.
---

# Theming

- **Palette** in `src/app.css` `@theme`. Themes in `#lib/themes/*.css` set `--theme-*` colors and may override the `--layout-*` defaults (widths, gutters, gaps, paddings, radii). `@theme inline` maps both onto utilities like `bg-card`, `text-ink-muted`, `p-card`, `w-rail`. Components use those utilities only, never palette colors directly.
- **Theme choice** is a cookie, rendered into `%theme%` by `hooks.server.ts` so the first paint is right. `#lib/themes/switch.ts` reveals the new theme as a circle from the click point.
- **Label tabs** sit on the top or bottom card edge, a per-device `labels` cookie (`#lib/preferences.ts`) rendered into `<html data-labels>` the same way. Both pickers read the `<html>` attribute, not the load data, which keeps the first page load's value across client navigation.
- **Note colours**: see Decisions in `AGENTS.md`. `#lib/note_colors.css` paints `.note-surface` and `.note-mark` from `data-note`, themes supply the tints and stickies as `--theme-note-*`, solids sit in the `:root` defaults of `app.css`.
- **Utilities** in `app.css` carry the recurring shapes: `field` for inputs and selects, `popover` for floating panels, `menu`, `menu-item`, `menu-separator` for bits menus, `icon-button`, `motion-interactive`, `note-grid`, and the type roles `type-display`, `type-title`, `type-meta`. A custom utility with more properties sorts before single property ones, so `field bg-raised` or `field h-11` override as expected. Never name a component class like one of them, `Input.svelte` once used `field` and broke.

## Adding a theme

1. `src/lib/themes/<name>.css` with a `[data-theme='<name>']` block setting every `--theme-*` token the others set, `--theme-note-*` included.
2. Import it in `app.css` after the default one.
3. Add it to `THEMES` in `#lib/themes/index.ts`, the picker and the cookie check follow from there.
