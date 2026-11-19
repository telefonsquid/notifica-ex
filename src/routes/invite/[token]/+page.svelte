<script lang="ts">
    import { goto } from '$app/navigation'
    import { resolve } from '$app/paths'
    import { page } from '$app/state'
    import AuthPage from '#lib/components/AuthPage.svelte'
    import { notify } from '#lib/notifications.svelte.ts'
    import { safeAction } from '#lib/safe_action.ts'
    import { acceptInvite } from '../../api/contacts.remote'

    let { data } = $props()

    let invite = $derived(data.invite)
    let usable = $derived(invite.state === 'open')

    let message = $derived.by(() => {
        switch(invite.state){
            case 'open': return `${invite.inviter.name} invited you. Once connected you can share notes with each other.`
            case 'known': return `You and ${invite.inviter.name} are already connected.`
            case 'own': return 'This is your own invite link. Send it to the person you want to connect with.'
            default: return 'This invite link is no longer valid. It may have been used, revoked or run out. Ask for a new one.'
        }
    })

    // Anything but a fresh link only leads back to the notes
    async function submit() {
        if(usable){
            const inviter = await safeAction(acceptInvite(page.params.token ?? ''))
            if(!inviter) return false
            notify(`Connected with ${inviter.name}.`)
        }
        await goto(resolve('/(app)/[[view]]', {}), { refreshAll: true })
        return true
    }
</script>

<AuthPage title="Invite" action={usable ? 'Connect' : 'Go to notes'} onsubmit={submit}>
    <p class="text-ink">{message}</p>
</AuthPage>
