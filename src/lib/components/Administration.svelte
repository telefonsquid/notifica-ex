<script lang="ts">
    import { invalidateAll } from '$app/navigation';
    import LimitFields from '#lib/components/LimitFields.svelte';
    import { effectiveLimits, formatBytes } from '#lib/limits.ts';
    import { unfold } from '#lib/motion.ts';
    import { safeAction } from '#lib/pocketbase.ts';
    import { onCollectionChange } from '#lib/realtime.ts';
    import { ChevronDown } from '@lucide/svelte';
    import { getAdministration, saveDefaultLimits, saveUserLimits } from '../../routes/api/administration.remote';

    // DATA
    let administration = $derived(await getAdministration())

    $effect(() => onCollectionChange('users', () => getAdministration().refresh()))

    let expanded = $state<string | null>(null)

    // The admin's own limits may have changed and realtime doesn't cover the defaults
    async function saveDefaults(changes: Parameters<typeof saveDefaultLimits>[0]){
        if(await safeAction(saveDefaultLimits(changes))) await invalidateAll()
    }
</script>

<div class="grid gap-10">
    <div>
        <h3 class="type-meta mb-4 text-ink-faint">Defaults</h3>
        <LimitFields values={administration.defaults} onsave={(changes) => saveDefaults(changes as Parameters<typeof saveDefaultLimits>[0])} />
    </div>

    <div>
        <h3 class="type-meta mb-4 text-ink-faint">Users</h3>
        <ul class="grid grid-cols-1 gap-px overflow-hidden rounded-card border border-line bg-line">
            {#each administration.users as user (user.id)}
                {@const limits = effectiveLimits(administration.defaults, user.limits)}
                <li class="bg-card">
                    <button class="flex w-full items-center gap-x-4 py-3 pr-3 pl-card text-left" aria-expanded={expanded === user.id} onclick={() => expanded = expanded === user.id ? null : user.id}>
                        <span class="min-w-0 flex-1">
                            <span class={['type-title block truncate', user.state === 'active' ? 'text-ink' : 'text-ink-faint']}>{user.name || user.email}</span>
                            <span class="type-meta block truncate text-ink-faint">{user.email}</span>
                        </span>
                        <span class="type-meta shrink-0 text-ink-muted tabular-nums">{formatBytes(user.used)} of {formatBytes(limits.storageBytes)}</span>
                        <ChevronDown class={['chevron size-4 shrink-0 text-ink-faint', expanded === user.id && 'turned']} />
                    </button>
                    {#if expanded === user.id}
                        <div class="px-card pb-card" transition:unfold>
                            <LimitFields values={limits} overrides={user.limits ?? {}} onsave={(changes) => safeAction(saveUserLimits({ id: user.id, limits: changes }))} />
                        </div>
                    {/if}
                </li>
            {/each}
        </ul>
    </div>
</div>

<style>
    :global(.chevron) {
        transition: rotate var(--duration-base) var(--ease-emphasized);
    }

    :global(.chevron.turned) {
        rotate: 180deg;
    }
</style>
