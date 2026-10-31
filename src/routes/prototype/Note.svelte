<script lang="ts">
    import { Bell, Repeat } from '@lucide/svelte'
    import { CELL, PIGMENTS, pattern, seedOf, snap, type Pigment } from './paper.ts'
    import { LABELS, type Note } from './notes.ts'
    import Squares from './Squares.svelte'
    import Tick from './Tick.svelte'

    // PROPS
    let { note, ontoggle }: { note: Note, ontoggle: (item: number) => void } = $props()

    let seed = $derived(seedOf(note.id))

    // HEIGHT | snapped to whole cells, so every note starts and ends on a grid line
    let contentHeight = $state(0)
    let height = $derived(contentHeight ? snap(contentHeight + 2 * CELL) : undefined)

    // MARKDOWN | just enough syntax for the prototype
    function blocks(body: string){
        return body.split('\n').map((line) => {
            if(line.startsWith('# ')) return { kind: 'heading', text: line.slice(2) }
            if(line.startsWith('- ')) return { kind: 'item', text: line.slice(2) }
            if(line.startsWith('> ')) return { kind: 'quote', text: line.slice(2) }
            return { kind: 'line', text: line }
        })
    }

    // IMAGE | pixel mosaic as a stand in for a photo, sky on top and sunset below
    const SKY: Pigment[][] = [['cobalt', 'cobalt', 'violet'], ['cobalt', 'powder'], ['powder', 'powder', 'rose'], ['rose', 'marigold'], ['marigold', 'tangerine', 'lemon'], ['tangerine', 'vermilion'], ['umber', 'charcoal', 'vermilion']]

    let figureWidth = $state(0)
    let mosaic = $derived(pattern(seed, Math.max(1, Math.floor(figureWidth / CELL)), SKY.length, () => 0.93, (_x, y) => SKY[y]))

    let labels = $derived(LABELS.filter((label) => note.labels.includes(label.name)))
</script>

<article class="note" style:height={height ? `${height}px` : undefined} style:--wash={note.pigment ? PIGMENTS[note.pigment] : undefined}>
    <div class="content" bind:clientHeight={contentHeight}>
        {#if note.title}
            <h3 class="title type-title">{note.title}</h3>
        {/if}

        <!-- BODY -->
        {#if note.kind === 'text' && note.body}
            <p class="body">{note.body}</p>

        {:else if note.kind === 'markdown'}
            <div class="body markdown">
                {#each blocks(note.body) as block, line (line)}
                    {#if block.kind === 'heading'}<p class="heading">{block.text}</p>
                    {:else if block.kind === 'item'}<p class="item">{block.text}</p>
                    {:else if block.kind === 'quote'}<p class="quote">{block.text}</p>
                    {:else}<p>{block.text}</p>{/if}
                {/each}
            </div>

        {:else if note.kind === 'list'}
            <ul class="body">
                {#each note.items as item, position (position)}
                    <li>
                        <button class={['check', item.done && 'done']} onclick={() => ontoggle(position)}>
                            <Tick on={item.done} seed={seed + position} color={note.pigment ? PIGMENTS[note.pigment] : 'var(--ink)'} />
                            <span>{item.text}</span>
                        </button>
                    </li>
                {/each}
            </ul>

        {:else if note.kind === 'image'}
            <figure class="body" bind:clientWidth={figureWidth}>
                <Squares pattern={mosaic} {seed} />
                <figcaption>{note.caption}</figcaption>
            </figure>
        {/if}

        <!-- FOOTER -->
        {#if labels.length || note.reminder}
            <footer class="type-meta">
                {#each labels as label (label.name)}
                    <span class="label"><i style:background={PIGMENTS[label.pigment]}></i>{label.name}</span>
                {/each}

                {#if note.reminder}
                    {@const Icon = note.reminder.startsWith('every') ? Repeat : Bell}
                    <span class="reminder"><Icon size={11} strokeWidth={2.4} />{note.reminder}</span>
                {/if}
            </footer>
        {/if}
    </div>
</article>

<style>
    /* No card, the note is just text on the paper | half a cell more at the sides gives it room */
    .note {
        --side: calc(var(--cell) * 1.5);

        padding: var(--cell) var(--side);
        transition: height var(--duration-base) var(--ease-out);
    }

    /* Narrow phone columns can't spare the extra room */
    @container (width < 220px) {
        .note {
            --side: var(--cell);
        }
    }

    .content {
        display: flex;
        flex-direction: column;
        gap: calc(var(--cell) / 2);
        line-height: var(--cell);
    }

    .title {
        font-size: 15px;
    }

    .body {
        color: var(--ink-soft);
    }

    /* MARKDOWN */
    .markdown .heading {
        color: var(--ink);
        font-weight: 650;
    }

    .markdown .item::before {
        content: '';
        display: inline-block;
        width: 6px;
        height: 6px;
        margin: 0 8px 1px 1px;
        background: var(--wash, var(--ink));
    }

    .markdown .quote {
        font-style: italic;
        color: var(--ink);
    }

    /* LIST */
    ul {
        display: flex;
        flex-direction: column;
    }

    .check {
        display: flex;
        gap: calc(var(--cell) / 2);
        align-items: center;
        width: 100%;
        text-align: left;
        cursor: pointer;
        color: inherit;
    }

    .check span {
        transition: color var(--duration-base) var(--ease-out);
    }

    .done span {
        color: var(--ink-faint);
        text-decoration: line-through;
        text-decoration-color: var(--wash, var(--ink));
    }

    /* IMAGE | bleeds into the side padding until it sits on the grid again */
    figure {
        margin-inline: calc(var(--cell) - var(--side));
        display: flex;
        flex-direction: column;
        gap: calc(var(--cell) / 2);
    }

    figcaption {
        padding-inline: calc(var(--side) - var(--cell));
        font-style: italic;
    }

    /* FOOTER */
    footer {
        display: flex;
        flex-wrap: wrap;
        gap: 0 calc(var(--cell) / 2);
        align-items: center;
        color: var(--ink-faint);
    }

    .label, .reminder {
        display: inline-flex;
        gap: 5px;
        align-items: center;
        color: var(--ink-soft);
    }

    .label i {
        width: 6px;
        height: 6px;
    }
</style>
