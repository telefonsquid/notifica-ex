<script lang="ts">
    import { tip } from '#lib/tooltip.svelte.ts';
    import type { Component } from 'svelte';
    import type { ClassValue } from 'svelte/elements';

    // PROPS
    let {
        icon: Icon,
        label,
        confirmLabel,
        hint,
        confirmHint,
        disabled = false,
        class: className = '',
        onconfirm
    }: {
        icon: Component<{ class?: string }>
        label: string                                   // for screen readers, like "Delete Groceries"
        confirmLabel: string                            // the same once armed, like "Confirm deleting Groceries"
        hint: string                                    // tooltip
        confirmHint: string                             // tooltip once armed, says what the second click does
        disabled?: boolean
        class?: ClassValue
        onconfirm: () => unknown                        // the second click, awaited before the button disarms
    } = $props()

    // ARMED | the first click asks, the second one goes through, leaving the button calls it off
    let armed = $state(false)

    async function click(){
        if(!armed){
            armed = true
            return
        }
        await onconfirm()
        armed = false
    }
</script>

<button
    class={['icon-button', armed && 'bg-accent text-on-accent hover:text-on-accent', className]}
    aria-label={armed ? confirmLabel : label}
    {disabled}
    onclick={click}
    onblur={() => armed = false}
    {@attach tip(armed ? confirmHint : hint)}
>
    <Icon class="size-4" />
</button>
