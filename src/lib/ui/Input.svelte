<script lang="ts">
    import type { ClassValue, HTMLInputAttributes } from 'svelte/elements';

    type BaseAttributes = Omit<HTMLInputAttributes, 'class' | 'value'>;

    // PROPS
    let {
        id,
        label,
        value = $bindable(''),
        class: className = '',
        ...others
    }: {
        id: string
        label: string
        value?: string
        class?: ClassValue
    } & BaseAttributes = $props()
</script>

<!-- Label sits inside the field and shrinks to the top once there is something to show -->
<div class={['floating relative', className]}>
    <input
        {id}
        bind:value
        placeholder=" "
        class="peer motion-interactive h-14 w-full rounded-control border border-line bg-raised px-4 pt-5 text-ink outline-none hover:border-line-strong focus:border-accent"
        {...others}
    />
    <label
        for={id}
        class="label pointer-events-none absolute top-1/2 left-4 origin-left -translate-y-1/2 text-ink-faint"
    >
        {label}
    </label>
</div>

<style>
    .label {
        transition: translate var(--duration-base) var(--ease-out), scale var(--duration-base) var(--ease-out), color var(--duration-fast) var(--ease-out);
    }

    /* Keeps the vertical centering of the base translate and lifts on top of it */
    .floating:focus-within .label,
    input:not(:placeholder-shown) + .label {
        translate: 0 calc(-50% - 0.8rem);
        scale: 0.78;
        color: var(--theme-ink-muted);
    }

    .floating:focus-within .label {
        color: var(--theme-accent);
    }

    /* Field never draws the global focus ring, the accent border replaces it */
    input:focus-visible {
        outline: none;
    }
</style>
