<script lang="ts">
    import type { Density } from '#lib/preferences.ts';
    import PreferencePicker from './PreferencePicker.svelte';

    let { current }: { current: Density } = $props()

    const OPTIONS = [{ value: 'comfortable', name: 'Comfortable' }, { value: 'compact', name: 'Compact' }] as const
</script>

<PreferencePicker options={OPTIONS} name="density" {current}>
    {#snippet miniature(density: Density)}
        <!-- A phone screen holding one roomy card or two tight ones -->
        <div class={['my-2 flex h-16 w-20 shrink-0 rounded-control border border-line-strong', density === 'compact' ? 'gap-1 p-1' : 'p-2']} aria-hidden="true">
            {#each { length: density === 'compact' ? 2 : 1 }, index (index)}
                <div class="flex flex-1 flex-col gap-1 rounded-[0.25rem] bg-line p-1.5">
                    <span class="h-1 w-3/4 rounded-full bg-ink-faint"></span>
                    <span class="h-1 w-1/2 rounded-full bg-line-strong"></span>
                </div>
            {/each}
        </div>
    {/snippet}
</PreferencePicker>
