<script lang="ts">
    import { cssEasing, duration, rise, stagger } from '#lib/motion.ts';
    import Backdrop from '#lib/ui/Backdrop.svelte';
    import Button from '#lib/ui/Button.svelte';
    import Logo from '#lib/ui/Logo.svelte';
    import { ArrowRight } from '@lucide/svelte';
    import { onMount, type Snippet } from 'svelte';

    /*
        Shell of the logged out pages: logo, headline, a short form and one button.
        Everything rises in one after another, a failed submit shakes the form.
    */

    // PROPS
    let {
        title,
        headline,
        intro,
        fields,
        action,
        onsubmit
    }: {
        title: string                                   // browser tab
        headline: Snippet
        intro: string
        fields: Snippet[]                               // one input each, they rise in one after another
        action: string                                  // label of the submit button
        onsubmit: () => Promise<boolean>                // false shakes the form and lets it be sent again
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

    const enter = (index: number) => ({ delay: stagger(index, 70) })
</script>

<svelte:head>
    <title>{title} · notifica-ex</title>
</svelte:head>

<Backdrop />

<main class="relative grid min-h-dvh place-items-center px-gutter py-12">
    {#if mounted}
        <div class="w-full max-w-sm">

            <!-- BRAND -->
            <div in:rise={enter(0)}>
                <Logo wordmark class="mb-14" />
            </div>

            <!-- HEADLINE -->
            <h1 class="type-display mb-3 text-5xl text-ink" in:rise={enter(1)}>{@render headline()}</h1>
            <p class="mb-10 text-ink-muted" in:rise={enter(2)}>{intro}</p>

            <!-- FORM -->
            <form bind:this={form} class="grid gap-3" onsubmit={submit}>
                {#each fields as field, index (field)}
                    <div in:rise={enter(3 + index)}>{@render field()}</div>
                {/each}
                <div class="mt-4" in:rise={enter(3 + fields.length)}>
                    <Button type="submit" class="w-full" loading={submitting}>
                        {action}
                        <ArrowRight class="arrow size-4" />
                    </Button>
                </div>
            </form>

        </div>
    {/if}
</main>

<style>
    /* Arrow nudges forward when the button is hovered */
    form :global(.arrow) {
        transition: translate var(--duration-base) var(--ease-spring);
    }

    form :global(button:hover .arrow) {
        translate: 3px 0;
    }
</style>
