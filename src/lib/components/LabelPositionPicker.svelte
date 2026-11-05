<script lang="ts">
    import type { LabelPosition } from '#lib/preferences.ts';
    import PreferencePicker from './PreferencePicker.svelte';
    import { setLabelPosition } from '../../routes/api/settings.remote';

    let { current }: { current: LabelPosition } = $props()

    const OPTIONS = [{ value: 'top', name: 'Top' }, { value: 'bottom', name: 'Bottom' }] as const
</script>

<PreferencePicker options={OPTIONS} attribute="labels" {current} save={setLabelPosition}>
    {#snippet miniature(position: LabelPosition)}
        <!-- A card with two tabs on the chosen edge -->
        <div class={['mini relative my-2 flex h-16 w-20 shrink-0 flex-col gap-1.5 rounded-control border border-line-strong p-2.5', position]} aria-hidden="true">
            <div class="mini-tabs absolute left-2.5 flex gap-1">
                <span class="mini-tab note-mark w-5" data-note="tangerine-solid"></span>
                <span class="mini-tab note-mark w-7" data-note="cobalt"></span>
            </div>
            <span class="h-1.5 w-3/4 rounded-full bg-ink-faint"></span>
            <span class="h-1 w-full rounded-full bg-line-strong"></span>
            <span class="h-1 w-2/3 rounded-full bg-line-strong"></span>
        </div>
    {/snippet}
</PreferencePicker>

<style>
    .mini-tabs {
        bottom: 100%;
        align-items: end;
    }

    .mini.bottom .mini-tabs {
        top: 100%;
        bottom: auto;
        align-items: start;
    }

    .mini-tab {
        height: 0.1875rem;
        border-radius: 0.25rem 0.25rem 0 0;
        transition: height var(--duration-base) var(--ease-spring);
    }

    .mini.bottom .mini-tab {
        border-radius: 0 0 0.25rem 0.25rem;
    }

    /* Tabs open up on hover as they do on real cards */
    :global(.option:hover) .mini-tab {
        height: 0.5rem;
    }
</style>
