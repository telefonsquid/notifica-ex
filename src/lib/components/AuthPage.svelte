<script lang="ts">
    import { Moon, Sun } from '@lucide/svelte';
    import { cssEasing, duration, rise } from '#lib/motion.ts';
    import type { ThemeName } from '#lib/themes/index.ts';
    import { switchTheme } from '#lib/themes/switch.ts';
    import { tip } from '#lib/tooltip.svelte.ts';
    import Button from '#lib/ui/Button.svelte';
    import Logo from '#lib/ui/Logo.svelte';
    import { onMount, type Snippet } from 'svelte';
    import { setPreference } from '../../routes/api/settings.remote';

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
    let theme = $state<ThemeName>('platinum')
    onMount(() => {
        theme = document.documentElement.dataset.theme as ThemeName
        mounted = true
    })

    // THEME | the settings are out of reach before login, so the switch sits here too
    function toggleTheme(event: MouseEvent){
        theme = theme === 'charcoal' ? 'platinum' : 'charcoal'
        setPreference({ name: 'theme', value: theme }).catch(() => {})      // The switch itself must not wait for the network
        switchTheme(theme, event.detail === 0 ? undefined : { x: event.clientX, y: event.clientY })
    }

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
        {@const dark = theme === 'charcoal'}
        <button
            type="button"
            class="theme-toggle icon-button absolute top-4 right-4"
            aria-label={dark ? 'Light theme' : 'Dark theme'}
            onclick={toggleTheme}
            {@attach tip(dark ? 'Light theme' : 'Dark theme')}
        >
            {#if dark}<Sun class="size-5" />{:else}<Moon class="size-5" />{/if}
        </button>

        <div class="grid w-full max-w-xs gap-10" in:rise>
            <Logo class="justify-self-center" />
            <form bind:this={form} class="sheet grid gap-3" onsubmit={submit}>
                {@render children()}
                <Button type="submit" class="submit mt-2 w-full" loading={submitting}>{action}</Button>
            </form>
        </div>
    {/if}
</main>

<style>
    .theme-toggle {
        color: var(--theme-riso-orange);
    }

    /* FIELDS | white paper, black on the dark sheet, a blue pass slipped out underneath, orange once focused */
    .sheet :global(.floating) {
        isolation: isolate;
    }

    .sheet :global(.floating)::before {
        content: '';
        position: absolute;
        inset: 0;
        z-index: -1;
        border-radius: var(--layout-radius-control);
        background: var(--theme-riso-blue);
        translate: 3px 2.5px;
        transition: translate var(--duration-base) var(--ease-spring), background-color var(--duration-fast) var(--ease-out);
    }

    .sheet :global(.floating:hover)::before {
        translate: 4.5px 3.75px;
    }

    .sheet :global(.floating:focus-within)::before {
        background: var(--theme-riso-orange);
    }

    .sheet :global(input),
    .sheet :global(input:hover),
    .sheet :global(input:focus) {
        border-color: transparent;
        background: var(--theme-riso-field);
    }

    /* SUBMIT | orange over a pink pass, both as layers since the button's own background paints under its children */
    .sheet :global(.submit) {
        position: relative;
        isolation: isolate;
        background: transparent;
        box-shadow: none;
        color: var(--theme-riso-on-ink);
        text-shadow: none;
        font-size: 1rem;
    }

    .sheet :global(.submit)::before,
    .sheet :global(.submit)::after {
        content: '';
        position: absolute;
        inset: 0;
        z-index: -1;
        border-radius: inherit;
    }

    .sheet :global(.submit)::before {
        background: var(--theme-riso-pink);
        translate: 4px 3px;
        transition: translate var(--duration-base) var(--ease-spring);
    }

    .sheet :global(.submit)::after {
        background: var(--theme-riso-orange);
        mix-blend-mode: var(--theme-riso-ink-blend);
    }

    /* Drums drift apart on hover, a press brings them back in register */
    .sheet :global(.submit:hover)::before {
        translate: 6px 4.5px;
    }

    .sheet :global(.submit:active)::before {
        translate: 0 0;
        transition-duration: var(--duration-instant);
    }
</style>
