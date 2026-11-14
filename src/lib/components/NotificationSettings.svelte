<script lang="ts">
    import { PUBLIC_NTFY_URL } from '$app/env/public';
    import { invalidateAll } from '$app/navigation';
    import { onAndroidEvent } from '#lib/android.ts';
    import { androidApp, browserPushBlocker, browserPushEndpoint, browserPushOn, disableBrowserPush, enableBrowserPush } from '#lib/device_notifications.ts';
    import { unfold } from '#lib/motion.ts';
    import { notify } from '#lib/notifications.svelte.ts';
    import type { TestChannel } from '#lib/reminders.ts';
    import { safeAction } from '#lib/safe_action.ts';
    import type { User } from '#lib/schemas/users.ts';
    import { tip } from '#lib/tooltip.svelte.ts';
    import Button from '#lib/ui/Button.svelte';
    import Switch from '#lib/ui/Switch.svelte';
    import { Check, Dices, Send } from '@lucide/svelte';
    import { onMount, untrack } from 'svelte';
    import { sendTestReminder, setAppPaused, setNtfyPaused, setNtfyTopic } from '../../routes/api/reminders.remote';

    // PROPS
    let { user }: { user: User } = $props()

    // THIS DEVICE | only known in the browser, so these rows wait for the mount
    let app = $state<ReturnType<typeof androidApp>>(null)
    let mounted = $state(false)

    let phoneOn = $derived(!user.appPaused)     // Stored on the account, so a browser switches the phones too
    let phoneAllowed = $state(true)
    let instantOn = $state(false)          // Per phone, so it lives in the app and not on the account

    let browserBlocker = $state<string | null>(null)
    let browserOn = $state(false)
    let browserBusy = $state(false)

    function readPhone(){
        phoneAllowed = app?.notificationsAllowed?.() ?? true
        instantOn = app?.instantOn?.() ?? false
    }

    function setInstant(on: boolean){
        instantOn = on
        app?.setInstant?.(on)
    }

    onMount(() => {
        app = androidApp()
        mounted = true
        if(app){
            readPhone()
            return onAndroidEvent(readPhone)
        }

        browserBlocker = browserPushBlocker()
        if(!browserBlocker) browserPushOn().then((on) => browserOn = on)
    })

    async function setPhone(on: boolean){
        phoneOn = on
        if(await safeAction(setAppPaused(!on))) await invalidateAll()
        else phoneOn = !on
    }

    async function setBrowser(on: boolean){
        browserBusy = true
        const done = await safeAction((async () => {
            if(!on){
                await disableBrowserPush()
                return true
            }
            if(await enableBrowserPush(user.id)) return true
            notify('This browser blocks notifications for this site.', { type: 'error' })
            return false
        })())
        if(done) browserOn = on
        browserBusy = false
    }

    // NTFY | the switch shows the form right away, but only counts once a topic is saved
    let topic = $state(untrack(() => user.ntfyTopic ?? ''))
    let savingTopic = $state(false)
    let ntfyOpen = $state(untrack(() => !!user.ntfyTopic && !user.ntfyPaused))

    let stored = $derived(user.ntfyTopic ?? '')
    let subscribeUrl = $derived(PUBLIC_NTFY_URL && stored ? `${PUBLIC_NTFY_URL.replace(/\/$/, '')}/${stored}` : null)

    // Long and random, the topic name is the only thing that keeps strangers out on an open ntfy server
    function randomTopic() {
        const bytes = crypto.getRandomValues(new Uint8Array(12))
        topic = 'notifica-' + Array.from(bytes, (byte) => byte.toString(36).padStart(2, '0')).join('').slice(0, 20)
    }

    async function setNtfy(on: boolean){
        ntfyOpen = on
        if(on && !topic) randomTopic()
        if(stored && await safeAction(setNtfyPaused(!on))) await invalidateAll()
    }

    async function saveTopic() {
        savingTopic = true
        if(await safeAction(setNtfyTopic(topic.trim()))) await invalidateAll()
        savingTopic = false
    }

    // TEST
    let testing = $state<TestChannel | null>(null)

    async function test(channel: TestChannel) {

        // The app shows its own, a phone without the live connection never hears the server's
        if(channel === 'phone' && app?.testNotification){
            app.testNotification()
            return
        }

        testing = channel
        const endpoint = channel === 'browser' ? await browserPushEndpoint() : undefined
        if(await safeAction(sendTestReminder({ channel, endpoint }))) notify('Test sent.')
        testing = null
    }
</script>

<div class="grid gap-4">
    <ul class="grid grid-cols-1 gap-px overflow-hidden rounded-card border border-line bg-line">
        <li class="row">
            <span class="text-ink">Android Notifications</span>
            {#if phoneOn && phoneAllowed}{@render testButton('phone')}{/if}
            {#if phoneOn && !phoneAllowed}
                <Button style="ghost" onclick={() => app?.openNotificationSettings?.()}>Allow</Button>
            {/if}
            <Switch checked={phoneOn} label="Reminders in the Android app" onchange={setPhone} />
        </li>
        {#if mounted && !app}
            <li class="row">
                <span class="text-ink">Browser Notifications</span>
                {#if browserBlocker}<span class="text-ink-faint">{browserBlocker}</span>{/if}
                {#if browserOn}{@render testButton('browser')}{/if}
                <Switch checked={browserOn} label="Reminders in this browser" disabled={!!browserBlocker || browserBusy} onchange={setBrowser} />
            </li>
        {/if}

        {#if PUBLIC_NTFY_URL}
            <li class="grid bg-card">
                <div class="row">
                    <span class="text-ink">ntfy Notifications</span>
                    {#if stored && !user.ntfyPaused}{@render testButton('ntfy')}{/if}
                    <Switch checked={ntfyOpen} label="Reminders through ntfy" onchange={setNtfy} />
                </div>

                {#if ntfyOpen}
                    <div class="grid gap-3 px-card pb-4" transition:unfold>
                        <form class="flex flex-wrap gap-2" onsubmit={(event) => { event.preventDefault(); saveTopic(); }}>
                            <input bind:value={topic} placeholder="Topic" aria-label="ntfy topic" class="field h-11 min-w-0 flex-1" />
                            <Button type="button" style="ghost" icon={Dices} onclick={randomTopic}>Random</Button>
                            <Button type="submit" icon={Check} loading={savingTopic} disabled={topic.trim() === stored}>Save</Button>
                        </form>
                        {#if subscribeUrl}
                            <p class="text-ink-muted">Subscribe address <code class="rounded bg-line px-1.5 py-0.5 text-ink break-all">{subscribeUrl}</code></p>
                        {/if}
                    </div>
                {/if}
            </li>
        {/if}
    </ul>

    {#if app?.setInstant && phoneOn}
        <div class="grid overflow-hidden rounded-card border border-line bg-card" transition:unfold>
            <div class="row">
                <span class="text-ink">Instant updates</span>
                <Switch checked={instantOn} label="Instant updates on this phone" onchange={setInstant} />
            </div>
            <p class="px-card pb-4 text-ink-muted">
                Reminders added or changed in a browser reach this phone at once, not within 15 minutes.
                It keeps a live connection to the server, which shows a small silent notification and uses more battery.
                Only this phone, reminders already synced ring on time either way.
            </p>
        </div>
    {/if}
</div>

{#snippet testButton(channel: TestChannel)}
    <Button style="ghost" class="w-11 px-0!" icon={Send} loading={testing === channel} aria-label="Send a test" onclick={() => test(channel)} {@attach tip('Send a test')} />
{/snippet}

<style>
    .row {
        display: flex;
        gap: 0.75rem;
        align-items: center;
        min-height: 3.5rem;
        padding-inline: var(--layout-card-padding);
        background: var(--theme-card);
    }

    .row > :global(:first-child) {
        flex: 1;
    }
</style>
