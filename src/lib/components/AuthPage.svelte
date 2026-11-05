<script lang="ts">
    import { cssEasing, duration, rise } from '#lib/motion.ts';
    import Button from '#lib/ui/Button.svelte';
    import Logo from '#lib/ui/Logo.svelte';
    import { onMount, type Snippet } from 'svelte';

    /*
        Shell of the logged out pages: logo, a short form and one button.
        A failed submit shakes the form.
    */

    // PROPS
    let {
        title,
        action,
        onsubmit,
        children
    }: {
        title: string                                   // browser tab
        action: string                                  // label of the submit button
        onsubmit: () => Promise<boolean>                // false shakes the form and lets it be sent again
        children: Snippet                               // the inputs
    } = $props()

    let submitting = $state(false)
    let form = $state<HTMLFormElement>()

    // ENTRANCE | intros only play for elements added after hydration
    let mounted = $state(false)
    onMount(() => { mounted = true })

    async function submit(event: SubmitEvent){
        event.preventDefault()
        submitting = true
        if(await onsubmit()) return
        shake()
        submitting = false
    }

    // A short headshake instead of only a red toast
    function shake(){
        form?.animate(
            { translate: ['0', '-10px', '8px', '-5px', '3px', '0'] },
            { duration: duration('slow'), easing: cssEasing('out') }
        )
    }
</script>

<svelte:head>
    <title>{title} · notifica-ex</title>
</svelte:head>

<main class="grid min-h-dvh place-items-center px-gutter py-12">
    {#if mounted}
        <div class="grid w-full max-w-xs gap-8" in:rise>
            <Logo wordmark class="justify-self-center" />
            <form bind:this={form} class="grid gap-3" onsubmit={submit}>
                {@render children()}
                <Button type="submit" class="mt-2 w-full" loading={submitting}>{action}</Button>
            </form>
        </div>
    {/if}
</main>
