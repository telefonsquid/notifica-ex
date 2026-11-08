<script lang="ts">
    import { attachmentUrl } from '#lib/attachments.ts';
    import { formatBytes, type FileInfo } from '#lib/limits.ts';
    import { appear, unfold } from '#lib/motion.ts';
    import { tip } from '#lib/tooltip.svelte.ts';
    import { Download, LoaderCircle, Paperclip, X } from '@lucide/svelte';

    // The files on a note | a list while open, one faint line on the closed card

    // PROPS
    let {
        note,
        attachments,
        fileInfo,
        sending,
        open,
        onremove
    }: {
        note: string
        attachments: string[]
        fileInfo: FileInfo | null
        sending: { key: string, name: string, bytes: number, share: number }[]      // On their way up, share runs from 0 to 1
        open: boolean
        onremove: (name: string) => void
    } = $props()

    let count = $derived(attachments.length + sending.length)
</script>

{#if open}
    <ul class="grid grid-cols-1 gap-1" in:appear out:unfold>
        {#each attachments as name (name)}
            {@const info = fileInfo?.[name]}
            {@const shown = info?.name ?? name}
            <li class="row flex items-center gap-1 rounded-control border border-line pr-1">
                <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- the url is resolved already -->
                <a class="flex min-w-0 flex-1 items-center gap-2 py-1.5 pl-2.5 text-sm text-ink" href={attachmentUrl(note, name)} download={shown} {@attach tip('Download')}>
                    <Download class="size-4 shrink-0 text-ink-faint" />
                    <span class="min-w-0 flex-1 truncate">{shown}</span>
                    {#if info}<span class="type-meta shrink-0 text-ink-faint">{formatBytes(info.bytes)}</span>{/if}
                </a>
                <button class="icon-button" aria-label={`Remove ${shown}`} onclick={() => onremove(name)}><X class="size-4" /></button>
            </li>
        {/each}
        {#each sending as file (file.key)}
            <li class="relative flex items-center gap-2 overflow-hidden rounded-control border border-line py-1.5 pr-3 pl-2.5 text-sm text-ink-muted">
                <LoaderCircle class="size-4 shrink-0 animate-spin text-ink-faint" />
                <span class="min-w-0 flex-1 truncate">{file.name}</span>
                <span class="type-meta shrink-0 text-ink-faint">{formatBytes(file.bytes)}</span>
                <span class="progress absolute bottom-0 left-0 h-0.5 w-full bg-accent" style:--share={file.share}></span>
            </li>
        {/each}
    </ul>
{:else if count}
    <p class="type-meta pointer-events-none flex items-center gap-1.5 text-ink-faint" in:appear out:unfold>
        <Paperclip class="size-3.5" />
        {count === 1 ? '1 file' : `${count} files`}
    </p>
{/if}

<style>
    .row {
        transition: border-color var(--duration-fast) var(--ease-out);
    }

    .row:hover {
        border-color: var(--theme-line-strong);
    }

    .progress {
        transform: scaleX(var(--share));
        transform-origin: left;
        transition: transform var(--duration-fast) linear;
    }
</style>
