<script lang="ts">
    import { page } from '$app/state'
    import AuthPage from '#lib/components/AuthPage.svelte'
    import { safeAction } from '#lib/safe_action.ts';
    import { returnPath } from '#lib/return_path.ts'
    import Input from '#lib/ui/Input.svelte'
    import { loginUser } from '../api/auth.remote'

    let email = $state('')
    let password = $state('')

    async function login() {
        if (!(await safeAction(loginUser({ email, password })))) return false;
        // A full load, the way back may be an endpoint rather than a page
        location.assign(returnPath(page.url))
        return true
    }
</script>

<AuthPage title="Login" action="Log in" onsubmit={login}>
    <Input id="email" label="Email" type="email" autocomplete="email" required bind:value={email} />
    <Input id="password" label="Password" type="password" autocomplete="current-password" required bind:value={password} />
</AuthPage>
