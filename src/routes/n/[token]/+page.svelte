<script lang="ts">
    import { invalidateAll } from '$app/navigation'
    import { resolve } from '$app/paths'
    import { page } from '$app/state'
    import { formatBytes } from '#lib/limits.ts'
    import { rise } from '#lib/motion.ts'
    import { noteEditor } from '#lib/note_editor.svelte.ts'
    import { loginPath } from '#lib/return_path.ts'
    import { safeAction } from '#lib/safe_action.ts'
    import { IMAGE_THUMB } from '#lib/schema_limits.ts'
    import type { LinkedNote } from '#lib/schemas/notes.ts'
    import Button from '#lib/ui/Button.svelte'
    import Logo from '#lib/ui/Logo.svelte'
    import Markdown from '#lib/ui/Markdown.svelte'
    import { Download } from '@lucide/svelte'
    import { onMount, untrack } from 'svelte'
    import { saveLinkedNote } from '../../api/links.remote'

    /*
        A note opened through its link without an account.
        Read links only show it, write links edit title and text, saved a moment after typing stops.
    */

    let { data } = $props()

    let note = $derived(data.note)
    let token = $derived(page.params.token ?? '')
    let editable = $derived(note?.mode === 'write')

    // DRAFT | follows the server until the visitor types
    let title = $state('')
    let body = $state('')
    let base = $state('')
    let dirty = $state(false)
    let saving = $state(false)
    let stale = $state(false)      // Someone saved in between, only a reload helps

    $effect.pre(() => {
        const current = note
        untrack(() => { if(current && !dirty) adopt(current) })
    })

    function adopt(saved: LinkedNote){
        title = saved.title
        body = saved.body
        base = saved.updated
    }

    // SAVING ==================================================================
    const SAVE_AFTER = 800      // ms without typing
    let timer: ReturnType<typeof setTimeout> | undefined

    function changed(){
        dirty = true
        clearTimeout(timer)
        timer = setTimeout(save, SAVE_AFTER)
    }

    async function save(){
        if(stale) return
        if(saving){ changed(); return }

        saving = true
        const sent = { title, body }
        const saved = await safeAction(saveLinkedNote({ token, ...sent, base }).catch((err) => {
            if(err?.status !== 409) throw err
            stale = true
            return null
        }))
        saving = false
        if(!saved) return

        // Typing that went on meanwhile stays and goes up next
        base = saved.updated
        if(title === sent.title && body === sent.body) dirty = false
    }

    // Unsaved words would be lost with the page
    function flush(){
        if(!dirty || stale) return
        clearTimeout(timer)
        save()
    }

    // FRESHNESS | coming back to the tab shows what changed meanwhile
    function refresh(){
        if(document.visibilityState === 'visible' && !dirty && !saving) invalidateAll()
    }

    onMount(() => { if(editable) noteEditor.load() })
</script>

<svelte:head>
    <title>{note?.title || 'Note'} · Notifica Ex</title>
</svelte:head>

<svelte:document onvisibilitychange={refresh} />
<svelte:window onpagehide={flush} />

<main class="mx-auto grid min-h-dvh w-full max-w-2xl content-start gap-8 px-gutter py-10">
    <header class="flex items-center justify-between gap-4">
        <a href={resolve('/(app)/[[view]]', {})} aria-label="Notifica Ex"><Logo /></a>
        <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- loginPath resolves it -->
        <a class="type-meta text-ink-muted hover:text-ink" href={loginPath(page.url)}>Log in to keep it</a>
    </header>

    {#if !note}
        <p class="text-ink" in:rise>This link is no longer valid. The owner may have turned it off or made a new one.</p>
    {:else}
        <article class="note-surface grid gap-4 rounded-card border border-line p-card text-ink" data-note={note.color || undefined} in:rise>
            <p class="type-meta text-ink-faint">
                Shared by {note.owner}{editable ? ', anyone with the link may edit' : ''}
                {#if editable}<span class="float-right">{stale ? '' : saving ? 'Saving' : dirty ? 'Unsaved' : 'Saved'}</span>{/if}
            </p>

            {#if stale}
                <div class="flex flex-wrap items-center gap-3 rounded-control border border-line-strong p-3 text-sm">
                    <span class="flex-1">Someone changed the note meanwhile. Your last words are not saved, copy them before you reload.</span>
                    <Button onclick={() => location.reload()}>Reload</Button>
                </div>
            {/if}

            <!-- TEXT | the rendered body holds the place until the editor loaded -->
            {#if editable}
                <input class="title type-title w-full bg-transparent text-xl outline-none" placeholder="Title" aria-label="Title" bind:value={() => title, (value) => { title = value; changed() }} />
                {#if noteEditor.component}
                    <noteEditor.component bind:value={() => body, (value) => { if(value === body) return; body = value; changed() }} />
                {:else}
                    <Markdown source={body} class="min-h-32 text-ink-muted" />
                {/if}
            {:else}
                {#if note.title}<h1 class="type-title text-xl">{note.title}</h1>{/if}
                <Markdown source={note.body} class="text-ink-muted" />
            {/if}

            <!-- FILES -->
            {#if note.images.length}
                <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {#each note.images as name (name)}
                        {@const url = resolve('/n/[token]/images/[name]', { token, name })}
                        <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- the url is resolved already -->
                        <a href={url} target="_blank" rel="noopener"><img class="aspect-square w-full rounded-control object-cover" src={`${url}?thumb=${IMAGE_THUMB}`} alt="" loading="lazy" /></a>
                    {/each}
                </div>
            {/if}
            {#if note.attachments.length}
                <ul class="grid gap-1">
                    {#each note.attachments as name (name)}
                        {@const info = note.fileInfo?.[name]}
                        <li>
                            <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- the url is resolved already -->
                            <a class="flex items-center gap-2 rounded-control border border-line px-2.5 py-1.5 text-sm hover:border-line-strong" href={resolve('/n/[token]/attachments/[name]', { token, name })} download={info?.name ?? name}>
                                <Download class="size-4 shrink-0 text-ink-faint" />
                                <span class="min-w-0 flex-1 truncate">{info?.name ?? name}</span>
                                {#if info}<span class="type-meta text-ink-faint">{formatBytes(info.bytes)}</span>{/if}
                            </a>
                        </li>
                    {/each}
                </ul>
            {/if}
        </article>
    {/if}
</main>
