<script lang="ts">
    import type { LucideProps } from '@lucide/svelte';

    // Holds an icon's place while it loads | takes an icon's props, only the class matters
    // eslint-disable-next-line svelte/no-unused-props
    let { class: className }: LucideProps = $props()
</script>

<svg class={className} viewBox="0 0 24 24" aria-hidden="true"></svg>
