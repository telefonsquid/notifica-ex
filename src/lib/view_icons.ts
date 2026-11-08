import { browser } from '$app/env';
import type { IconComponent } from '#lib/lucide_icons.ts';
import BlankIcon from '#lib/ui/BlankIcon.svelte';
import { Archive, Bell, BookOpen, Briefcase, Calendar, CircleDashed, Clock, Code, Coffee, Flame, GraduationCap, Heart, House, Inbox, Leaf, Lightbulb, ListChecks, Music, Palette, Pin, Plane, ShoppingCart, Star, StickyNote, Tag } from '@lucide/svelte';
import { SvelteMap } from 'svelte/reactivity';

// ICONS | stored by name, so the view collection never depends on the icon library
const CURATED: Record<string, IconComponent> = {
    'sticky-note': StickyNote,
    'bell': Bell,
    'archive': Archive,
    'star': Star,
    'pin': Pin,
    'list-checks': ListChecks,
    'calendar': Calendar,
    'clock': Clock,
    'book-open': BookOpen,
    'briefcase': Briefcase,
    'house': House,
    'heart': Heart,
    'lightbulb': Lightbulb,
    'tag': Tag,
    'inbox': Inbox,
    'flame': Flame,
    'leaf': Leaf,
    'music': Music,
    'plane': Plane,
    'shopping-cart': ShoppingCart,
    'code': Code,
    'graduation-cap': GraduationCap,
    'palette': Palette,
    'coffee': Coffee
}

// The picker's first page
export const VIEW_ICONS = Object.keys(CURATED)

const loaded = new SvelteMap<string, IconComponent>()
const requested = new Set<string>()

// The picker's icons right away, any other lucide icon blank until its file arrived | unknown names get a dashed circle
export function viewIcon(name: string): IconComponent {
    const icon = CURATED[name] ?? loaded.get(name)
    if(icon) return icon

    if(browser && !requested.has(name)){
        requested.add(name)
        import('#lib/lucide_icons.ts')
            .then(({ importIcon }) => importIcon(name))
            .then((component) => loaded.set(name, component ?? CircleDashed))
            .catch(() => requested.delete(name))        // A lost download gets another try on the next render
    }
    return BlankIcon
}
