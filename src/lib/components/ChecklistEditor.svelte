<script lang="ts">
    import { newItem } from '#lib/notes.ts';
    import type { NoteItem } from '#lib/schemas.ts';
    import { Plus, Square, SquareCheck, X } from '@lucide/svelte';
    import { tick } from 'svelte';

    // PROPS
    let { items = $bindable() }: { items: NoteItem[] } = $props()

    let list: HTMLUListElement

    async function focus(id: string, atEnd = false){
        await tick()
        const input = list.querySelector<HTMLInputElement>(`input[data-id="${id}"]`)
        input?.focus()
        if(atEnd && input) input.setSelectionRange(input.value.length, input.value.length)
    }

    function add(after?: number){
        const item = newItem()
        items.splice(after === undefined ? items.length : after + 1, 0, item)
        focus(item.id)
    }

    function remove(index: number){
        items.splice(index, 1)
        const previous = items[Math.max(0, index - 1)]
        if(previous) focus(previous.id, true)
    }

    // KEYBOARD | enter starts the next row, backspace on an empty row joins the one above
    function keydown(event: KeyboardEvent, index: number){
        if(event.key === 'Enter' && !event.isComposing){
            event.preventDefault()
            add(index)
        }
        if(event.key === 'Backspace' && !items[index].text && items.length > 1){
            event.preventDefault()
            remove(index)
        }
    }
</script>

<ul class="flex flex-col" bind:this={list}>
    {#each items as item, index (item.id)}
        <li class="group flex items-center gap-2">
            <button
                class={['motion-interactive shrink-0 p-1', item.done ? 'text-accent' : 'text-ink-faint hover:text-ink']}
                aria-label={item.done ? 'Mark as open' : 'Mark as done'}
                aria-pressed={item.done}
                onclick={() => item.done = !item.done}
            >
                {#if item.done}<SquareCheck class="size-4" />{:else}<Square class="size-4" />{/if}
            </button>
            <input
                data-id={item.id}
                bind:value={item.text}
                class={['min-w-0 flex-1 bg-transparent py-1.5 outline-none placeholder:text-ink-faint', item.done && 'text-ink-faint line-through']}
                placeholder="Item"
                aria-label={`Item ${index + 1}`}
                onkeydown={(event) => keydown(event, index)}
            />
            <button class="motion-interactive shrink-0 p-1 text-ink-faint opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 hover:text-ink" aria-label="Remove item" onclick={() => remove(index)}>
                <X class="size-4" />
            </button>
        </li>
    {/each}
</ul>

<button class="motion-interactive mt-1 flex items-center gap-2 p-1 text-ink-faint hover:text-ink" onclick={() => add()}>
    <Plus class="size-4" /> Add item
</button>
