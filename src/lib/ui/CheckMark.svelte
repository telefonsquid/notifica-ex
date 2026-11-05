<script lang="ts">
    import { Check } from '@lucide/svelte';

    let { active }: { active: boolean } = $props()
</script>

<!-- The pick on a big option card, springs in -->
<span class={['check grid size-7 place-items-center rounded-full bg-accent text-on-accent', !active && 'off']}>
    <Check class="size-4" strokeWidth={3} />
</span>

<style>
    .check {
        transition: scale var(--duration-base) var(--ease-spring), opacity var(--duration-fast) var(--ease-out);
    }

    .off {
        scale: 0.4;
        opacity: 0;
    }
</style>
