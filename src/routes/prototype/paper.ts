// SHEET ====================================================================================================

// Edge of one grid cell in px | every size on the sheet is a whole number of cells
export const CELL = 18;

// Rounds a length up to the next grid line
export function snap(length: number) {
    return Math.ceil(length / CELL) * CELL;
}



// RANDOMNESS ====================================================================================================

// Seeded so server and browser draw the same pattern
export function random(seed: number) {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Turns an id into a seed, so every note keeps its own pattern
export function seedOf(text: string) {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) {
        hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
    }
    return hash >>> 0;
}

function pick<T>(rnd: () => number, list: readonly T[]): T {
    return list[Math.floor(rnd() * list.length)];
}

// Smooth noise over cells, neighbours get similar values
function lattice(seed: number, scale: number) {
    const at = (i: number, j: number) => random(seed ^ Math.imul(i, 73856093) ^ Math.imul(j, 19349663))();
    const smooth = (t: number) => t * t * (3 - 2 * t);

    return (x: number, y: number) => {
        const u = x / scale;
        const v = y / scale;
        const i = Math.floor(u);
        const j = Math.floor(v);
        const s = smooth(u - i);
        const t = smooth(v - j);

        const top = at(i, j) + (at(i + 1, j) - at(i, j)) * s;
        const bottom = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * s;
        return top + (bottom - top) * t;
    };
}



// PIGMENTS ====================================================================================================

// Picked from the crayon drawing reference, tangerine and powder blue stay in from the brand palette
export const PIGMENTS = {
    crimson: '#d81f3d',
    vermilion: '#ee3b2b',
    rose: '#ff78ac',
    magenta: '#df1f80',
    salmon: '#ff8a72',
    tangerine: '#ff5a12',
    marigold: '#ffa20f',
    lemon: '#ffd51f',
    leaf: '#2fa845',
    teal: '#00a39b',
    powder: '#86cbdb',
    cobalt: '#2457d8',
    violet: '#6b40c9',
    umber: '#8f5530',
    charcoal: '#1f1c1a',
} as const;

export type Pigment = keyof typeof PIGMENTS;

// Charcoal is the most common square, oranges and browns stay rare
export const MIXED: Pigment[] = [
    'charcoal', 'charcoal', 'charcoal', 'charcoal', 'charcoal',
    'crimson', 'crimson', 'vermilion', 'rose', 'magenta', 'magenta', 'salmon',
    'lemon', 'lemon', 'leaf', 'leaf', 'teal', 'teal', 'powder',
    'cobalt', 'cobalt', 'cobalt', 'violet', 'violet', 'tangerine', 'marigold',
];

// Mostly one pigment with a few strays from the full set
export function family(pigment: Pigment): Pigment[] {
    return [...Array<Pigment>(24).fill(pigment), ...MIXED];
}



// PATTERNS ====================================================================================================

export type Cell = { x: number; y: number; pigment: Pigment };
export type Pattern = { width: number; height: number; cells: Cell[] };
type Chance = (x: number, y: number) => number;
type Pigments = Pigment[] | ((x: number, y: number) => Pigment[]);

// Every cell rolls its own chance, the core of all patterns below
export function pattern(seed: number, width: number, height: number, chance: Chance, pigments: Pigments = MIXED): Pattern {
    const rnd = random(seed);
    const cells: Cell[] = [];
    const taken = new Map<number, Pigment>();

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (rnd() >= chance(x, y)) continue;
            const allowed = typeof pigments === 'function' ? pigments(x, y) : pigments;

            // Neighbours often share a pigment, so colour comes in runs and blocks
            const near = rnd() < 0.5 ? taken.get(y * width + x - 1) ?? taken.get((y - 1) * width + x) : taken.get((y - 1) * width + x) ?? taken.get(y * width + x - 1);
            const pigment = near && allowed.includes(near) && rnd() < 0.4 ? near : pick(rnd, allowed);

            taken.set(y * width + x, pigment);
            cells.push({ x, y, pigment });
        }
    }

    return { width, height, cells };
}

// Bunches squares into blocks with gaps between, a few patches turn into checkerboards
export function clumped(seed: number, chance: Chance): Chance {
    const lumps = lattice(seed, 2.6);
    const boards = lattice(seed + 1, 3.4);

    return (x, y) => {
        if (boards(x, y) > 0.68 && (x + y) % 2) return 0;
        return chance(x, y) * (0.15 + 1.9 * lumps(x, y) ** 1.3);
    };
}

export function scatter(seed: number, width: number, height: number, density = 0.3, pigments?: Pigments) {
    return pattern(seed, width, height, () => density, pigments);
}

// Thins out toward one side, like squares drifting apart
export function fade(seed: number, width: number, height: number, toward: 'down' | 'right' | 'left', density = 0.7, pigments?: Pigments) {
    return pattern(seed, width, height, clumped(seed, (x, y) => {
        const progress = toward === 'down' ? y / height : toward === 'right' ? x / width : 1 - x / width;
        return density * (1 - progress) ** 1.4;
    }), pigments);
}

// Strip along one edge of a block, dense where it touches and fraying at both ends
export function band(seed: number, width: number, height: number, away: 'up' | 'down', density = 0.75) {
    return pattern(seed, width, height, clumped(seed, (x, y) => {
        const distance = away === 'down' ? y : height - 1 - y;
        const ends = Math.min(1, Math.min(x + 1, width - x) / 5);
        return density * (1 - distance / height) ** 1.6 * ends;
    }));
}



// DRAWING ====================================================================================================

export type Square = {
    path: string;
    color: string;
    turn: number;
};

function point(x: number, y: number) {
    return `${x.toFixed(2)} ${y.toFixed(2)}`;
}

// Solid square with slightly uneven edges and a few specks where the ink skipped
function block(rnd: () => number, x: number, y: number, size: number, unit: number) {
    const corners = [[x, y], [x + size, y], [x + size, y + size], [x, y + size]];
    const outline: string[] = [];

    corners.forEach(([ax, ay], side) => {
        const [bx, by] = corners[(side + 1) % 4];
        for (let k = 0; k < 3; k++) {
            const t = k / 3;
            outline.push(point(ax + (bx - ax) * t + (rnd() - 0.5) * 0.5 * unit, ay + (by - ay) * t + (rnd() - 0.5) * 0.5 * unit));
        }
    });

    let path = `M${outline.join(' L')}Z`;

    // Holes never cover more than 5 percent of the square
    let budget = size * size * 0.05 * rnd();
    const count = Math.floor(rnd() ** 1.4 * 8);

    for (let i = 0; i < count; i++) {
        const radius = (0.45 + rnd() * 1.05) * unit;
        const area = Math.PI * radius * radius;
        if (area > budget) continue;
        budget -= area;

        const cx = x + unit + rnd() * (size - 2 * unit);
        const cy = y + unit + rnd() * (size - 2 * unit);
        const speck: string[] = [];
        for (let k = 0; k < 6; k++) {
            const angle = (k / 6 + rnd() * 0.1) * Math.PI * 2;
            const reach = radius * (0.65 + rnd() * 0.5);
            speck.push(point(cx + Math.cos(angle) * reach, cy + Math.sin(angle) * reach));
        }
        path += ` M${speck.join(' L')}Z`;
    }

    return path;
}

// Single filled square for checkboxes
export function solid(seed: number, x: number, y: number, size: number) {
    return block(random(seed), x, y, size, size / CELL);
}

// Same pigment, slightly different batch of ink each time | charcoal turns light on dark paper
function shade(rnd: () => number, pigment: Pigment) {
    const base = pigment === 'charcoal' ? `var(--graphite, ${PIGMENTS.charcoal})` : PIGMENTS[pigment];
    const light = ((rnd() - 0.5) * 0.05).toFixed(3);
    const chroma = (0.93 + rnd() * 0.12).toFixed(2);
    const hue = ((rnd() - 0.5) * 8).toFixed(1);
    return `oklch(from ${base} calc(l + ${light}) calc(c * ${chroma}) calc(h + ${hue}))`;
}

// One square per cell
export function draw(source: Pattern, seed: number, size = CELL): Square[] {
    const rnd = random(seed);
    const unit = size / CELL;

    return source.cells.map((cell) => {
        // Most nearly fill their cell and touch their neighbours, some bleed over the lines
        const inset = (rnd() < 0.3 ? -0.7 * rnd() : 0.1 + rnd() * 0.8) * unit;
        const edge = size - inset * 2;
        const x = cell.x * size + inset + (rnd() - 0.5) * 0.7 * unit;
        const y = cell.y * size + inset + (rnd() - 0.5) * 0.7 * unit;

        return {
            path: block(rnd, x, y, edge, unit),
            color: shade(rnd, cell.pigment),
            turn: rnd() < 0.6 ? (rnd() - 0.5) * 3.5 : 0,
        };
    });
}
