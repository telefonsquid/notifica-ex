<script lang="ts">
    import { page } from '$app/state';
    import { uploadAttachment } from '#lib/attachments.ts';
    import { readTakeout, type ImportFile, type Takeout } from '#lib/google_import.ts';
    import { shrink, uploadImage } from '#lib/images.ts';
    import { unfold } from '#lib/motion.ts';
    import { notify } from '#lib/notifications.svelte.ts';
    import { safeAction } from '#lib/safe_action.ts';
    import { LIMITS } from '#lib/schema_limits.ts';
    import type { ImportResult } from '#lib/schemas/imports.ts';
    import Button from '#lib/ui/Button.svelte';
    import { Download, FolderOpen, X } from '@lucide/svelte';
    import { importNotes } from '../../routes/api/imports.remote';

    // Notes and tasks from a Google Takeout export, read in the browser and sent in batches

    type Problem = Takeout['problems'][number]

    // READING
    let input = $state<HTMLInputElement>()
    let reading = $state(false)
    let takeout = $state<Takeout | null>(null)

    const counts = $derived.by(() => {
        if(!takeout) return null
        const notes = takeout.notes.filter((note) => note.source.startsWith('keep:')).length
        const files = [...takeout.files.values()].reduce((sum, files) => sum + files.length, 0)
        const reminders = takeout.notes.reduce((sum, note) => sum + (note.reminders?.length ?? 0), 0)
        return { notes, lists: takeout.notes.length - notes, files, reminders }
    })

    async function read(picked: FileList | null) {
        if(!picked?.length) return
        reading = true
        result = null
        try {
            takeout = await readTakeout([...picked], Intl.DateTimeFormat().resolvedOptions().timeZone)
            if(!takeout.notes.length) notify('No Keep notes or Tasks found in that export.', { type: 'error' })
        } catch (err) {
            notify(err instanceof Error ? err.message : 'Could not read the export.', { type: 'error' })
        }
        reading = false
        if(input) input.value = ''
    }

    // IMPORTING
    let importing = $state(false)
    let progress = $state({ done: 0, total: 0 })
    let result = $state<{ created: number, reminders: number, existing: number, problems: Problem[] } | null>(null)

    async function start() {
        if(!takeout) return
        const { notes, files } = takeout
        importing = true
        progress = { done: 0, total: notes.length }

        // Notes first, so a failed upload later never costs a note
        const created: ImportResult['created'] = []
        let existing = 0
        for(let at = 0; at < notes.length; at += LIMITS.IMPORT_BATCH){
            const batch = notes.slice(at, at + LIMITS.IMPORT_BATCH)
            const answer = await safeAction(importNotes(batch))
            if(!answer) break
            created.push(...answer.created)
            existing += answer.existing
            progress = { done: at + batch.length, total: notes.length }
        }

        // FILES | only for notes new this time, the others have theirs already
        const problems = [...takeout.problems]
        const uploads = created.flatMap(({ source, id }) => (files.get(source) ?? []).map((file) => ({ id, file, title: notes.find((note) => note.source === source)?.title || file.name })))
        progress = { done: 0, total: uploads.length }
        for(const { id, file, title } of uploads){
            const problem = await upload(id, file)
            if(problem) problems.push({ title, reason: problem })
            progress = { done: progress.done + 1, total: uploads.length }
        }

        result = { created: created.length, reminders: created.reduce((sum, note) => sum + note.reminders, 0), existing, problems }
        takeout = null
        importing = false
    }

    // Null once uploaded, else the reason it wasn't
    async function upload(note: string, file: ImportFile): Promise<string | null> {
        const limits = page.data.limits
        try {
            if(file.field === 'images'){
                const image = await shrink(await file.read())
                if(image.size > limits.imageBytes) return `${file.name} is bigger than images may be`
                await uploadImage(note, image)
                return null
            }

            if(!limits.attachments) return `${file.name} left out, attachments are turned off`
            const attachment = await file.read()
            if(attachment.size > limits.attachmentBytes) return `${file.name} is bigger than attachments may be`
            await uploadAttachment(note, attachment, () => {})
            return null
        } catch (err) {
            return err instanceof Error ? err.message : `Could not upload ${file.name}`
        }
    }

    function plural(count: number, word: string) {
        return `${count} ${word}${count === 1 ? '' : 's'}`
    }
</script>

<div class="grid gap-4">
    <h3 class="type-meta text-ink-faint">Import from Google</h3>

    <input bind:this={input} type="file" accept=".zip,.json,application/zip,application/json" multiple hidden onchange={(event) => read(event.currentTarget.files)} />

    <div class="grid grid-cols-1 gap-px overflow-hidden rounded-card border border-line bg-line">
        <div class="flex items-center justify-between gap-4 bg-card py-3 pr-3 pl-card">
            <span class="min-w-0 text-ink-muted">
                {#if importing}
                    {progress.total ? `${progress.done} of ${progress.total}` : 'Starting'}
                {:else if counts}
                    <span class="text-ink">{plural(counts.notes, 'note')}, {plural(counts.lists, 'task list')}, {plural(counts.files, 'file')}{counts.reminders ? `, ${plural(counts.reminders, 'reminder')}` : ''}</span>
                {:else}
                    Keep and Tasks from Takeout
                {/if}
            </span>
            {#if takeout && !importing}
                <span class="flex shrink-0 items-center gap-1">
                    <button type="button" class="icon-button" aria-label="Close" onclick={() => (takeout = null)}><X class="size-4" /></button>
                    <Button type="button" icon={Download} disabled={!takeout.notes.length} onclick={start}>Import</Button>
                </span>
            {:else}
                <Button type="button" style="ghost" icon={FolderOpen} loading={reading || importing} onclick={() => input?.click()}>Choose</Button>
            {/if}
        </div>

        {#if result}
            <div class="grid gap-2 bg-card px-card py-3" transition:unfold>
                <p class="text-ink">{plural(result.created, 'note')} imported{result.reminders ? ` with ${plural(result.reminders, 'reminder')}` : ''}{result.existing ? `, ${result.existing} already there` : ''}.</p>
                {#each result.problems as problem, index (index)}
                    <p class="type-meta text-ink-faint"><span class="normal-case text-ink-muted">{problem.title}</span> · {problem.reason}</p>
                {/each}
            </div>
        {/if}
    </div>

    <p class="-mt-2 text-sm text-ink-faint">Takeout leaves out Keep reminders. Open tasks with a date get a reminder at their time, or at 7:00 if they only have a day, repeating ones keep repeating.</p>
</div>
