<script lang="ts">
    import { List } from '@lucide/svelte'
    import type { Pigment } from './paper.ts'
    import type { Note } from './notes.ts'
    import Squares from './Squares.svelte'

    // PROPS
    let { onadd }: { onadd: (note: Note) => void } = $props()

    let title = $state('')
    let body = $state('')
    let pigment = $state<Pigment | undefined>()
    let checklist = $state(false)

    const SWATCHES: Pigment[] = ['crimson', 'rose', 'lemon', 'leaf', 'teal', 'cobalt', 'violet']

    // SAVE | a list turns every body line into an item
    function add(){
        if(!title.trim() && !body.trim()) return

        const base = { id: `n${Date.now()}`, title: title.trim(), pigment, labels: [] }
        const lines = body.split('\n').map((line) => line.trim()).filter(Boolean)
        onadd(checklist ? { ...base, kind: 'list', items: lines.map((text) => ({ text, done: false })) } : { ...base, kind: 'text', body: body.trim() })
    }
</script>

<div class="composer">
    <input class="title type-title" placeholder="Title" bind:value={title} />
    <textarea placeholder={checklist ? 'One item per line…' : 'Take a note…'} rows="4" bind:value={body} {@attach (node) => node.focus()}></textarea>

    <div class="tools">
        {#each SWATCHES as swatch, index (swatch)}
            <button class="swatch" aria-label={swatch} aria-pressed={pigment === swatch} onclick={() => pigment = pigment === swatch ? undefined : swatch}>
                <Squares pattern={{ width: 1, height: 1, cells: [{ x: 0, y: 0, pigment: swatch }] }} seed={60 + index} />
            </button>
        {/each}

        <button class={['toggle', checklist && 'active']} aria-label="Checklist" aria-pressed={checklist} onclick={() => checklist = !checklist}>
            <List size={14} />
        </button>

        <button class="add type-meta" onclick={add}>add</button>
    </div>
</div>

<style>
    /* Title, 4 rows of body and the tool row */
    .composer {
        display: flex;
        flex-direction: column;
        padding: calc(var(--cell) / 2) var(--cell);
    }

    input, textarea {
        width: 100%;
        resize: none;
        background: none;
        outline: none;
        line-height: var(--cell);
        color: var(--ink);
    }

    input::placeholder, textarea::placeholder {
        color: var(--ink-faint);
    }

    .title {
        height: calc(var(--cell) * 1.5);
    }

    .tools {
        display: flex;
        align-items: center;
        height: var(--cell);
        margin-top: calc(var(--cell) / 2);
    }

    /* Picked color gets a thin ring, the others step back */
    .swatch {
        border-radius: 2px;
        opacity: 0.55;
        cursor: pointer;
        transition: opacity var(--duration-fast) var(--ease-out);
    }

    .swatch:hover, .swatch[aria-pressed='true'] {
        opacity: 1;
    }

    .swatch[aria-pressed='true'] {
        box-shadow: 0 0 0 1px var(--ink-soft);
    }

    .toggle {
        display: grid;
        place-items: center;
        width: var(--cell);
        height: var(--cell);
        margin-left: auto;
        color: var(--ink-faint);
        cursor: pointer;
        transition: color var(--duration-fast) var(--ease-out);
    }

    .toggle.active {
        color: var(--accent);
    }

    .add {
        margin-left: var(--cell);
        color: var(--accent);
        cursor: pointer;
    }
</style>
