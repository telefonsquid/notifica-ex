<script lang="ts">
    import type { Snippet } from 'svelte';

    // PROPS
    let {
        id,
        title,
        opensGroup = false,
        children
    }: {
        id: string
        title: string
        opensGroup?: boolean
        children: Snippet
    } = $props()
</script>

<!-- One part of the settings scroll, its heading rule marks where the next one starts -->
<div id={id} class={['section', opensGroup && 'opens-group']} data-section={id} role="tabpanel" aria-label={title}>
    <div class="body">
        <header class="head">
            <h2 class="title">{title}</h2>
            <span class="rule" aria-hidden="true"></span>
        </header>
        {@render children()}
    </div>
</div>

<style>
    .section {
        margin-inline: -0.25rem;
        padding: 0.25rem 0.25rem 1.5rem;
    }

    .section:not(:first-child) {
        padding-top: 2.5rem;
    }

    /* A new group gets a wider gap before it, like the break in the tabs */
    .section.opens-group {
        padding-top: 5rem;
    }

    .body {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: 1.5rem;
        align-items: start;
    }

    /* HEADING | title and a printed rule that runs to the edge */
    .head {
        display: flex;
        gap: 0.75rem;
        align-items: baseline;
    }

    /* A lighter cut keeps the title compact */
    .title {
        font-size: 1.5rem;
        font-weight: 620;
        letter-spacing: -0.02em;
        line-height: 1.1;
    }

    /* Blue ink over a pink pass slipped bottom right */
    .rule {
        flex: 1;
        align-self: center;
        height: 2px;
        margin-left: 0.5rem;
        border-radius: 1px;
        background: var(--theme-riso-blue);
        box-shadow: 1.5px 1.25px 0 var(--theme-riso-pink);
    }
</style>
