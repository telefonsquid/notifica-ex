import type { ViewIcon } from '#lib/schemas.ts';
import { Archive, Bell, BookOpen, Briefcase, Calendar, Clock, Code, Coffee, Flame, GraduationCap, Heart, House, Inbox, Leaf, Lightbulb, ListChecks, Music, Palette, Pin, Plane, ShoppingCart, Star, StickyNote, Tag } from '@lucide/svelte';

// ICONS | stored by name, so the view collection never depends on the icon library
export const VIEW_ICON_COMPONENTS: Record<ViewIcon, typeof Bell> = {
    'sticky-note': StickyNote,
    'bell': Bell,
    'archive': Archive,
    'star': Star,
    'pin': Pin,
    'list-checks': ListChecks,
    'calendar': Calendar,
    'clock': Clock,
    'book': BookOpen,
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
