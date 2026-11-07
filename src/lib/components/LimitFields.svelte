<script lang="ts">
    import { GB, MB, type FileLimits, type LimitOverrides } from '#lib/limits.ts';
    import { LIMITS } from '#lib/schema_limits.ts';
    import { tip } from '#lib/tooltip.svelte.ts';
    import NumberField from '#lib/ui/NumberField.svelte';
    import Switch from '#lib/ui/Switch.svelte';
    import { RotateCcw } from '@lucide/svelte';

    type Changes = { [K in keyof FileLimits]?: FileLimits[K] | null }

    // The four file limits of the server, or of one account when overrides are given

    // PROPS
    let {
        values,
        overrides,
        onsave
    }: {
        values: FileLimits
        overrides?: LimitOverrides | null
        onsave: (changes: Changes) => void      // A null takes a limit back to the default
    } = $props()

    const SIZES = [
        { key: 'attachmentBytes', label: 'Largest attachment', unit: 'MB', size: MB, min: 1, max: LIMITS.UPLOAD_BYTES / MB },
        { key: 'imageBytes', label: 'Largest image', unit: 'MB', size: MB, min: 1, max: LIMITS.UPLOAD_BYTES / MB },
        { key: 'storageBytes', label: 'Storage', unit: 'GB', size: GB, min: 0, max: LIMITS.STORAGE_BYTES / GB }
    ] as const

    // SAVING | a moment after the last change, so walking the arrows sends one request
    const WAIT = 400
    let waiting: Changes = {}
    let timer: ReturnType<typeof setTimeout> | undefined

    function change<K extends keyof FileLimits>(key: K, value: FileLimits[K]){
        if(values[key] === value && !(key in waiting)) return
        waiting[key] = value
        clearTimeout(timer)
        timer = setTimeout(flush, WAIT)
    }

    function flush(){
        clearTimeout(timer)
        if(!Object.keys(waiting).length) return
        const changes = waiting
        waiting = {}
        onsave(changes)
    }

    function reset(key: keyof FileLimits){
        delete waiting[key]
        flush()
        onsave({ [key]: null })
    }

    // Leaving before the wait is over still saves
    $effect(() => flush)
</script>

{#snippet back(key: keyof FileLimits)}
    {#if overrides && key in overrides}
        <button type="button" class="icon-button" aria-label="Back to the default" onclick={() => reset(key)} {@attach tip('Back to the default')}>
            <RotateCcw class="size-4" />
        </button>
    {/if}
{/snippet}

<dl class="grid grid-cols-1 gap-px overflow-hidden rounded-card border border-line bg-line">
    <div class="flex min-h-14 items-center justify-between gap-3 bg-card py-2 pr-3 pl-card">
        <dt class="min-w-0 flex-1 text-ink-muted">File attachments</dt>
        <dd class="flex items-center gap-2">
            {@render back('attachments')}
            <Switch checked={values.attachments} label="File attachments" onchange={(checked) => change('attachments', checked)} />
        </dd>
    </div>
    {#each SIZES as field (field.key)}
        <div class="flex min-h-14 items-center justify-between gap-3 bg-card py-2 pr-3 pl-card">
            <dt class="min-w-0 flex-1 text-ink-muted">{field.label}</dt>
            <dd class="flex items-center gap-2">
                {@render back(field.key)}
                <NumberField class="w-24" value={values[field.key] / field.size} min={field.min} max={field.max} label={`${field.label} in ${field.unit}`} onchange={(value) => change(field.key, Math.round(value * field.size))} />
                <span class="w-6 text-sm text-ink-faint">{field.unit}</span>
            </dd>
        </div>
    {/each}
</dl>
