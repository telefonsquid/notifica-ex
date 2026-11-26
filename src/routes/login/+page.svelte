<script lang="ts">
    import { page } from '$app/state'
    import AuthPage from '#lib/components/AuthPage.svelte'
    import { notify } from '#lib/notifications.svelte.ts';
    import { answerWithPasskey, autofillAvailable, passkeyProblem, passkeysAvailable } from '#lib/passkeys.ts';
    import { safeAction } from '#lib/safe_action.ts';
    import type { PasskeyAnswer } from '#lib/schemas/passkeys.ts';
    import { returnPath } from '#lib/return_path.ts'
    import Button from '#lib/ui/Button.svelte';
    import Input from '#lib/ui/Input.svelte'
    import { KeyRound } from '@lucide/svelte';
    import { onMount } from 'svelte';
    import { loginUser } from '../api/auth.remote'
    import { finishPasskeyLogin, startPasskeyLogin } from '../api/passkeys.remote';

    let email = $state('')
    let password = $state('')

    async function login() {
        if (!(await safeAction(loginUser({ email, password })))) return false;
        enter()
        return true
    }

    // A full load, the way back may be an endpoint rather than a page
    function enter() {
        location.assign(returnPath(page.url))
    }

    // PASSKEY ============================================================
    let offered = $state(false)
    let asking = $state(false)

    async function usePasskey() {
        suggestions?.abort() // A browser runs one passkey request at a time
        asking = true
        try {
            const options = await safeAction(startPasskeyLogin())
            const answer = options && await answerWithPasskey(options)
            if(answer && await finish(answer)) return
        } catch (err) {
            notify(passkeyProblem(err), { type: 'error' })
        }
        asking = false
        suggest()
    }

    async function finish(answer: PasskeyAnswer) {
        if(!await safeAction(finishPasskeyLogin(answer))) return false
        enter()
        return true
    }

    // SUGGESTIONS | passkeys among what the email field offers, renewed before the server's challenge runs out
    const RENEW_AFTER = 9 * 60_000
    let suggestions: AbortController | null = null

    async function suggest() {
        suggestions?.abort()
        const { signal } = suggestions = new AbortController()

        const options = await autofillAvailable() ? await startPasskeyLogin().catch(() => null) : null
        if(!options || signal.aborted) return
        const answer = await answerWithPasskey(options, signal).catch(() => null)
        if(answer && !await finish(answer)) suggest()
    }

    onMount(() => {
        offered = passkeysAvailable()
        suggest()
        const renewal = setInterval(() => { if(!asking) suggest() }, RENEW_AFTER)
        return () => {
            clearInterval(renewal)
            suggestions?.abort()
        }
    })
</script>

<AuthPage title="Login" action="Log in" onsubmit={login}>
    <Input id="email" label="Email" type="email" autocomplete="username webauthn" required bind:value={email} />
    <Input id="password" label="Password" type="password" autocomplete="current-password" required bind:value={password} />
    {#snippet more()}
        {#if offered}
            <Button type="button" style="ghost" class="w-full" icon={KeyRound} loading={asking} onclick={usePasskey}>Use a passkey</Button>
        {/if}
    {/snippet}
</AuthPage>
