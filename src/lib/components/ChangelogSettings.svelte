<script lang="ts">
    import { getAbout } from '../../routes/api/about.remote';

    // DATA
    let about = $derived(await getAbout())

    const DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

    function day(date: string){
        const parsed = new Date(`${date}T00:00:00Z`)
        return Number.isNaN(parsed.getTime()) ? date : DATE.format(parsed)
    }
</script>

<ol class="grid gap-8">
    {#each about.releases as release (release.version)}
        <li class="grid gap-2">
            <div class="flex items-baseline gap-3">
                <h3 class="type-title text-ink tabular-nums">{release.version}</h3>
                <time class="type-meta ml-auto text-ink-faint" datetime={release.date}>{day(release.date)}</time>
            </div>
            <ul class="changes grid gap-1.5 text-ink-muted">
                {#each release.changes as change, index (index)}
                    <li>{change}</li>
                {/each}
            </ul>
        </li>
    {/each}
</ol>

<style>
    /* Each change after a short dash, wrapped lines stay clear of it */
    .changes li {
        position: relative;
        padding-left: 1.25rem;
    }

    .changes li::before {
        content: '';
        position: absolute;
        top: 0.7em;
        left: 0.25rem;
        width: 0.5rem;
        height: 1px;
        background: var(--theme-line-strong);
    }
</style>
