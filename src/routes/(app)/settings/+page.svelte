<script lang="ts">
    import { page } from '$app/state'
    import AboutSettings from '#lib/components/AboutSettings.svelte'
    import AccountSettings from '#lib/components/AccountSettings.svelte'
    import Administration from '#lib/components/Administration.svelte'
    import AutoColorPriority from '#lib/components/AutoColorPriority.svelte'
    import ChangelogSettings from '#lib/components/ChangelogSettings.svelte'
    import ImageFitPicker from '#lib/components/ImageFitPicker.svelte'
    import LabelFields from '#lib/components/LabelFields.svelte'
    import LabelPositionPicker from '#lib/components/LabelPositionPicker.svelte'
    import NotificationSettings from '#lib/components/NotificationSettings.svelte'
    import SettingsSection from '#lib/components/SettingsSection.svelte'
    import SettingsTabs from '#lib/components/SettingsTabs.svelte'
    import ThemePicker from '#lib/components/ThemePicker.svelte'
    import UserAdmin from '#lib/components/UserAdmin.svelte'
    import ViewSettings from '#lib/components/ViewSettings.svelte'
    import { linkedView } from '#lib/links.ts'
    import { onCollectionChange } from '#lib/realtime.ts'
    import { SettingsScroll } from '#lib/settings_scroll.svelte.ts'
    import { hasPermission } from '#lib/user.ts'
    import { Bell, CircleUserRound, Info, Palette, PanelsTopLeft, ScrollText, ShieldCheck, Tag, Users } from '@lucide/svelte'
    import { getLabels } from '../../api/labels.remote'
    import type { PageProps } from './$types';

    // PROPS
    let { data }: PageProps = $props();

    // LABELS
    let labels = $derived(await getLabels())

    $effect(() => onCollectionChange('labels', () => getLabels().refresh()));

    // SECTIONS | each one lives here, the tabs and the stage follow | the app group sits apart from the settings
    const SECTIONS = [
        { id: 'appearance', label: 'Appearance', icon: Palette, body: appearanceSection },
        { id: 'views', label: 'Views', icon: PanelsTopLeft, body: viewsSection },
        { id: 'labels', label: 'Labels', icon: Tag, body: labelsSection },
        { id: 'notifications', label: 'Notifications', icon: Bell, body: notificationsSection },
        { id: 'account', label: 'Account', icon: CircleUserRound, body: accountSection },
        { id: 'users', label: 'Users', icon: Users, body: usersSection, admin: true },
        { id: 'about', label: 'About', icon: Info, body: aboutSection, group: 'app' },
        { id: 'changelog', label: 'Changelog', icon: ScrollText, body: changelogSection, group: 'app' },
        { id: 'administration', label: 'Administration', icon: ShieldCheck, body: administrationSection, admin: true, group: 'app' }
    ]

    let sections = $derived(SECTIONS.filter((section) => !section.admin || hasPermission(data.user, 'admin')))

    const scroll = new SettingsScroll(() => sections.map((section) => section.id))

    // The rail's Edit view lands here through viewSettingsLink() and opens that view's filters
    let editing = $state<string | null>(null)

    $effect(() => {
        const id = linkedView(page.url)
        if (!id || !scroll.stage) return
        editing = id
        requestAnimationFrame(() => scroll.go('views'))
    });
</script>

{#snippet appearanceSection()}
    <div class="grid gap-10">
        <div>
            <h3 class="type-meta mb-4 text-ink-faint">Theme</h3>
            <ThemePicker current={data.preferences.theme} />
        </div>
        <div>
            <h3 class="type-meta mb-4 text-ink-faint">Label tabs</h3>
            <LabelPositionPicker current={data.preferences.labels} />
        </div>
        <div>
            <h3 class="type-meta mb-4 text-ink-faint">Images</h3>
            <ImageFitPicker current={data.preferences.images} />
        </div>
    </div>
{/snippet}

{#snippet viewsSection()}
    <ViewSettings {labels} bind:expanded={editing} />
{/snippet}

{#snippet labelsSection()}
    {#if labels.length}
        <ul class="grid grid-cols-1 gap-px overflow-hidden rounded-card border border-line bg-line">
            {#each labels as label (label.id)}
                <li class="flex items-center gap-3 bg-card py-2 pr-2 pl-card">
                    <LabelFields {label} class="py-1.5 text-ink" />
                </li>
            {/each}
        </ul>
        <AutoColorPriority {labels} />
    {:else}
        <p class="text-ink-faint">No labels yet. Add them right in a note.</p>
    {/if}
{/snippet}

{#snippet notificationsSection()}
    <NotificationSettings user={data.user} />
{/snippet}

{#snippet accountSection()}
    <AccountSettings user={data.user} />
{/snippet}

{#snippet usersSection()}
    <UserAdmin userId={data.user.id} />
{/snippet}

{#snippet aboutSection()}
    <AboutSettings />
{/snippet}

{#snippet changelogSection()}
    <ChangelogSettings />
{/snippet}

{#snippet administrationSection()}
    <Administration />
{/snippet}

<svelte:head>
    <title>Settings · notifica-ex</title>
</svelte:head>

<div class="settings mx-auto w-full max-w-content">
    <SettingsTabs {sections} current={scroll.tab} onpick={scroll.go} />

    <!-- STAGE | scrolls on its own and snaps each section to the top, the neighbours peek in at the edges -->
    <div bind:this={scroll.stage} class="stage" onscroll={scroll.follow} onscrollend={scroll.land}>
        <div class="track">
            {#each sections as section (section.id)}
                <SettingsSection id={section.id} title={section.label} current={scroll.tab === section.id} onselect={() => scroll.go(section.id)}>
                    {@render section.body()}
                </SettingsSection>
            {/each}
        </div>
    </div>
</div>

<style>
    /* LAYOUT | exactly the window minus the page padding, the stage scrolls instead of the page */
    .settings {
        --peek: 2.5rem;
        display: grid;
        grid-template-rows: minmax(0, 1fr);
        height: calc(100dvh - var(--page-top) - var(--page-bottom));
    }

    @media (width >= 40rem) {
        .settings {
            --peek: 4rem;
            grid-template-rows: auto minmax(0, 1fr);
            gap: 1rem;
        }
    }

    @media (width >= 64rem) {
        .settings {
            grid-template-columns: 12rem minmax(0, 1fr);
            grid-template-rows: none;
            gap: 3rem;
        }
    }

    /* STAGE | the neighbours fade out towards its edges */
    .stage {
        min-height: 0;
        overflow-y: auto;
        overscroll-behavior: contain;
        scroll-snap-type: y mandatory;
        scroll-padding-top: var(--peek);
        scrollbar-width: none;
        container-type: size;
        mask-image: linear-gradient(transparent, #000 var(--peek), #000 calc(100% - var(--peek)), transparent);
    }

    /* One column for every section, a wide row inside must not stretch them past the screen */
    .track {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: 1.5rem;
        max-width: 48rem;
        padding-top: var(--peek);
    }
</style>
