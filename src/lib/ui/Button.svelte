<script lang="ts">
    import RisoIcon from '#lib/ui/RisoIcon.svelte';
    import { LoaderCircle } from '@lucide/svelte';
    import type { Component, Snippet } from 'svelte';
    import type { ClassValue, HTMLButtonAttributes } from 'svelte/elements';

    type BaseAttributes = Omit<HTMLButtonAttributes, 'style' | 'class' | 'children'>;

    // PROPS
    let {
        style = 'primary',
        class: className = '',
        href,
        icon: Icon,
        loading = false,
        disabled,
        children,
        ...others
    }: {
        style?: ButtonStyle
        class?: ClassValue
        href?: string                   // renders a link that looks like a button
        icon?: Component<{ class?: string }>
        loading?: boolean
        disabled?: boolean
        children?: Snippet
    } & BaseAttributes = $props()

    // STYLES | primary and secondary are printed like the logo
    type ButtonStyle = 'primary' | 'secondary' | 'ghost'
    const styles: Record<ButtonStyle, string> = {
        primary:   'riso-print riso-print-ink',
        secondary: 'riso-print riso-print-paper',
        ghost:     'sinks text-ink-muted hover:text-ink hover:bg-accent-soft',
    }
</script>

<svelte:element
    this={href ? 'a' : 'button'}
    {href}
    class={[
        'button motion-interactive inline-flex h-11 items-center justify-center gap-2 rounded-control px-5 select-none type-title text-sm',
        'disabled:pointer-events-none disabled:opacity-45',
        styles[style],
        className
    ]}
    disabled={href ? undefined : disabled || loading}
    aria-busy={loading}
    {...others}
>
    {#if loading}
        <LoaderCircle class="size-4 animate-spin" />
    {:else if Icon}
        <RisoIcon icon={Icon} class="size-4" />
    {/if}
    {@render children?.()}
</svelte:element>

<style>
    /* Ghost buttons have no print to press, they sink instead | release springs back */
    .sinks:active {
        scale: 0.96;
        transition-duration: var(--duration-instant);
    }

    .button:not(:active) {
        transition-timing-function: var(--ease-spring);
    }
</style>
