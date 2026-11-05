<script lang="ts">
    // PROPS
    let {
        checked,
        label,
        disabled = false,
        onchange
    }: {
        checked: boolean
        label: string
        disabled?: boolean
        onchange: (checked: boolean) => void
    } = $props()
</script>

<button type="button" role="switch" class={['switch', checked && 'on']} aria-checked={checked} aria-label={label} {disabled} onclick={() => onchange(!checked)}>
    <span class="thumb"></span>
</button>

<style>
    .switch {
        flex-shrink: 0;
        width: 2.75rem;
        height: 1.625rem;
        padding: 0.1875rem;
        border-radius: 9999px;
        background: var(--theme-line-strong);
        transition: background-color var(--duration-base) var(--ease-out), opacity var(--duration-fast) var(--ease-out);
    }

    .switch.on {
        background: var(--theme-accent);
    }

    .switch:disabled {
        opacity: 0.5;
    }

    .thumb {
        display: block;
        width: 1.25rem;
        height: 1.25rem;
        border-radius: 9999px;
        background: var(--theme-card);
        transition: translate var(--duration-base) var(--ease-emphasized);
    }

    .on .thumb {
        translate: 1.125rem 0;
    }
</style>
