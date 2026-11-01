<script lang="ts">
    import { Check } from '@lucide/svelte';

    // PROPS
    let { shown }: { shown: boolean } = $props()
</script>

<!-- Marks the picked option, springs in when it gets picked -->
<span class={['badge grid size-7 shrink-0 place-items-center rounded-full bg-accent text-on-accent', !shown && 'off']} aria-hidden="true">
    <Check class="size-4" strokeWidth={3} />
</span>

<style>
    .badge {
        transition: scale var(--duration-base) var(--ease-spring), opacity var(--duration-fast) var(--ease-out);
    }

    .badge.off {
        scale: 0.4;
        opacity: 0;
    }
</style>
