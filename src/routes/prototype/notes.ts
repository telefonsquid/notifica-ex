import type { Pigment } from './paper.ts';

// SAMPLE DATA | stands in for PocketBase until the style is settled

export type NoteItem = { text: string; done: boolean };

export type Note = {
    id: string;
    title: string;
    pigment?: Pigment;
    labels: string[];
    reminder?: string;
    archived?: boolean;
} & (
    | { kind: 'text'; body: string }
    | { kind: 'markdown'; body: string }
    | { kind: 'list'; items: NoteItem[] }
    | { kind: 'image'; caption: string }
);

// The two halves of the app, switched next to the dock
export type View = 'notes' | 'reminders';

export const LABELS: { name: string; pigment: Pigment }[] = [
    { name: 'ideas', pigment: 'tangerine' },
    { name: 'home', pigment: 'marigold' },
    { name: 'work', pigment: 'violet' },
    { name: 'errands', pigment: 'leaf' },
    { name: 'reading', pigment: 'cobalt' },
];

export const NOTES: Note[] = [
    {
        id: 'n1', kind: 'text', title: 'Ask Mira about the lease', pigment: 'marigold', labels: ['home'], reminder: 'tomorrow · 09:00',
        body: 'Deposit back before the move? Also whether the balcony plants can stay until spring.',
    },
    {
        id: 'n2', kind: 'list', title: 'Groceries', pigment: 'leaf', labels: ['errands'],
        items: [
            { text: 'oat milk', done: true },
            { text: 'lemons', done: false },
            { text: 'rye bread', done: false },
            { text: 'coffee beans', done: true },
            { text: 'dill', done: false },
        ],
    },
    {
        id: 'n3', kind: 'markdown', title: 'Sketchbook rules', labels: ['ideas'],
        body: '# One page a day\n- pencil only\n- no erasing\n- date in the corner\n> the wobble is the point',
    },
    { id: 'n4', kind: 'image', title: 'Window light, 7 pm', pigment: 'cobalt', labels: [], caption: 'kitchen, facing west' },
    { id: 'n5', kind: 'text', title: 'Water the fern', pigment: 'teal', labels: ['home'], reminder: 'every 16 h', body: '' },
    {
        id: 'n6', kind: 'list', title: 'Chapter 3', pigment: 'violet', labels: ['work'], reminder: 'fri · 14:00',
        items: [
            { text: 'merge the two method sections', done: true },
            { text: 'redo figure 3.2 with the new data', done: false },
            { text: 'send draft to supervisor', done: false },
        ],
    },
    {
        id: 'n7', kind: 'text', title: 'A clock that only shows seasons', pigment: 'tangerine', labels: ['ideas'],
        body: 'One hand, one turn a year. Squares for weeks, coloured in by hand as they pass. Maybe as a wall print first.',
    },
    { id: 'n8', kind: 'text', title: 'Pick up the film scans', pigment: 'rose', labels: ['errands'], reminder: 'every 3 days · 18:00', body: 'Shop closes at 6, ask for the TIFFs.' },
    {
        id: 'n9', kind: 'list', title: 'To read', labels: ['reading'],
        items: [
            { text: 'Grid Systems, Müller-Brockmann', done: false },
            { text: 'The Shape of Design', done: true },
            { text: 'Notes on the Synthesis of Form', done: false },
        ],
    },
    { id: 'n10', kind: 'text', title: '', labels: [], archived: true, body: 'Tuesday standup moved to 10:30.' },
];
