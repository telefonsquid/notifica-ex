<script lang="ts">
    import type { ClassValue } from 'svelte/elements';

    // PROPS
    let { name, class: className = '' }: { name: string, class?: ClassValue } = $props()

    // First letters of the first two words, an email counts as one word
    let letters = $derived(name.trim().split(/\s+/).slice(0, 2).map((word) => word[0]?.toUpperCase() ?? '').join('') || '?')
</script>

<!-- A person as a small round badge, the name is up to whoever places it -->
<span class={['type-meta grid size-6 shrink-0 place-items-center rounded-full bg-secondary-soft tracking-normal text-secondary', className]} aria-hidden="true">{letters}</span>
