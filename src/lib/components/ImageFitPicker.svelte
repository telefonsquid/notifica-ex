<script lang="ts">
    import type { ImageFit } from '#lib/preferences.ts';
    import PreferencePicker from './PreferencePicker.svelte';

    let { current }: { current: ImageFit } = $props()

    const OPTIONS = [{ value: 'cropped', name: 'Cropped' }, { value: 'whole', name: 'Whole' }] as const
</script>

<PreferencePicker options={OPTIONS} name="images" {current}>
    {#snippet miniature(fit: ImageFit)}
        <!-- A card topped by a tall picture, cut or whole -->
        <div class={['my-2 flex h-16 w-20 shrink-0 flex-col overflow-hidden rounded-control border border-line-strong', fit]} aria-hidden="true">
            <div class="picture relative h-9 shrink-0 overflow-hidden">
                <span class="subject absolute left-1/2 -translate-x-1/2"></span>
            </div>
            <div class="flex flex-col gap-1 p-2">
                <span class="h-1 w-3/4 rounded-full bg-ink-faint"></span>
                <span class="h-1 w-1/2 rounded-full bg-line-strong"></span>
            </div>
        </div>
    {/snippet}
</PreferencePicker>

<style>
    /* A tall picture: sky on top, ground below, only its middle fits the cropped frame */
    .subject {
        background: linear-gradient(var(--theme-secondary) 0 45%, var(--theme-accent) 45% 100%);
    }

    .cropped .subject {
        top: -0.75rem;
        width: 100%;
        height: 3.75rem;
    }

    .whole .subject {
        top: 0;
        width: 1.35rem;
        height: 100%;
    }

    .whole .picture {
        background: var(--theme-line);
    }
</style>
