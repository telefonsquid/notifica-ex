<script lang="ts">
    import { isSafeUrl } from '#lib/markdown.ts';
    import { rise } from '#lib/motion.ts';
    import { tip } from '#lib/tooltip.svelte.ts';
    import { Bold, Check, FileCode, Heading, Italic, Link, List, ListOrdered, ListTodo, Unlink, X } from '@lucide/svelte';
    import { Editor } from '@tiptap/core';
    import { TaskItem, TaskList } from '@tiptap/extension-list';
    import { Placeholder } from '@tiptap/extensions';
    import { Markdown } from '@tiptap/markdown';
    import StarterKit from '@tiptap/starter-kit';
    import { untrack } from 'svelte';

    // PROPS
    let {
        value = $bindable(''),
        placeholder = 'Write something',
        autofocus = false
    }: {
        value?: string          // markdown source, rich and raw mode both write it
        placeholder?: string
        autofocus?: boolean
    } = $props()

    let raw = $state(false)
    let editor = $state.raw<Editor>()
    let version = $state(0)     // bumps on every editor change so the toolbar reads it again
    let linking = $state(false)
    let href = $state('')

    // EDITOR | built from the current text whenever rich mode comes back
    function mount(element: HTMLElement){
        const instance = untrack(() => new Editor({
            element,
            extensions: [
                StarterKit.configure({
                    heading: { levels: [1, 2, 3] },
                    link: { openOnClick: false, autolink: true, isAllowedUri: (url) => isSafeUrl(url) },
                }),
                TaskList,
                TaskItem.configure({ nested: true }),
                Placeholder.configure({ placeholder }),
                Markdown,
            ],
            content: value,
            contentType: 'markdown',
            editorProps: { attributes: { class: 'markdown min-h-32 text-ink-muted outline-none', 'aria-label': 'Text' } },
            onCreate: ({ editor }) => { if(autofocus) focusEnd(editor) },
            onUpdate: ({ editor }) => value = editor.getMarkdown(),
            onTransaction: () => version++,
        }))
        editor = instance

        return () => {
            instance.destroy()
            editor = undefined
        }
    }

    // The page scrolls the card in itself | Tiptap's focus command scrolls to the growing note first and cuts that short
    function focusEnd(instance: Editor){
        instance.commands.setTextSelection(instance.state.doc.content.size)
        instance.view.focus()
    }

    function active(name: string, attributes?: Record<string, unknown>): boolean {
        void version
        return editor?.isActive(name, attributes) ?? false
    }

    // LINKS | a bare domain gets https, anything that is not a web or mail link is dropped
    function toggleLink(){
        if(!editor) return
        if(editor.isActive('link')){
            editor.chain().focus().extendMarkRange('link').unsetLink().run()
            return
        }
        href = ''
        linking = true
    }

    function applyLink(){
        const text = href.trim()
        const url = /^[a-z]+:/i.test(text) ? text : `https://${text}`
        linking = false
        if(!editor || !text || !isSafeUrl(url)) return

        const chain = editor.chain().focus()
        if(editor.state.selection.empty) chain.insertContent({ type: 'text', text, marks: [{ type: 'link', attrs: { href: url } }] }).run()
        else chain.setLink({ href: url }).run()
    }
</script>

<div class="flex flex-col gap-2">

    <!-- TEXT -->
    {#if raw}
        <textarea
            bind:value
            {placeholder}
            aria-label="Markdown source"
            class="field-sizing-content min-h-32 resize-none bg-transparent font-mono text-sm leading-relaxed text-ink-muted outline-none placeholder:text-ink-faint"
        ></textarea>
    {:else}
        <div class="rich" {@attach mount}></div>
    {/if}

    <!-- TOOLBAR | formatting only exists in rich mode, the source toggle sits quietly at the end | drifts in with the other controls of an opening note -->
    <div class="editor-toolbar -mx-2 flex min-h-8 items-center gap-0.5" in:rise|global={{ y: 4, scale: 1, duration: 'base', delay: 120 }}>
        {#if linking}
            <form class="flex flex-1 items-center gap-1" onsubmit={(event) => { event.preventDefault(); applyLink() }}>
                <Link class="mx-1.5 size-3.5 shrink-0 text-ink-faint" />
                <input
                    bind:value={href}
                    placeholder="Paste a link"
                    aria-label="Link address"
                    class="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-faint"
                    onkeydown={(event) => { if(event.key === 'Escape'){ event.preventDefault(); event.stopPropagation(); linking = false } }}
                    {@attach (node) => node.focus()}
                />
                <button type="button" class="tool" aria-label="Cancel" onclick={() => linking = false}><X class="size-3.5" /></button>
                <button type="submit" class="tool text-accent" aria-label="Add link"><Check class="size-3.5" /></button>
            </form>
        {:else}
            {#if !raw && editor}
                {@const chain = () => editor!.chain().focus()}
                <button class={['tool', active('bold') && 'on']} aria-label="Bold" {@attach tip('Bold')} aria-pressed={active('bold')} onclick={() => chain().toggleBold().run()}><Bold class="size-3.5" /></button>
                <button class={['tool', active('italic') && 'on']} aria-label="Italic" {@attach tip('Italic')} aria-pressed={active('italic')} onclick={() => chain().toggleItalic().run()}><Italic class="size-3.5" /></button>
                <button class={['tool', active('heading', { level: 2 }) && 'on']} aria-label="Heading" {@attach tip('Heading')} aria-pressed={active('heading', { level: 2 })} onclick={() => chain().toggleHeading({ level: 2 }).run()}><Heading class="size-3.5" /></button>
                <span class="mx-1 h-4 w-px bg-line"></span>
                <button class={['tool', active('bulletList') && 'on']} aria-label="Bullet list" {@attach tip('Bullet list')} aria-pressed={active('bulletList')} onclick={() => chain().toggleBulletList().run()}><List class="size-3.5" /></button>
                <button class={['tool', active('orderedList') && 'on']} aria-label="Numbered list" {@attach tip('Numbered list')} aria-pressed={active('orderedList')} onclick={() => chain().toggleOrderedList().run()}><ListOrdered class="size-3.5" /></button>
                <button class={['tool', active('taskList') && 'on']} aria-label="Checklist" {@attach tip('Checklist')} aria-pressed={active('taskList')} onclick={() => chain().toggleTaskList().run()}><ListTodo class="size-3.5" /></button>
                <span class="mx-1 h-4 w-px bg-line"></span>
                <button class={['tool', active('link') && 'on']} aria-label={active('link') ? 'Remove link' : 'Link'} onclick={toggleLink} {@attach tip(active('link') ? 'Remove link' : 'Link')}>
                    {#if active('link')}<Unlink class="size-3.5" />{:else}<Link class="size-3.5" />{/if}
                </button>
            {/if}
            <button class={['tool ml-auto', raw && 'on']} aria-label="Markdown source" {@attach tip(raw ? 'Back to the rich editor' : 'Edit the markdown source')} aria-pressed={raw} onclick={() => raw = !raw}>
                <FileCode class="size-3.5" />
            </button>
        {/if}
    </div>

</div>

<style>
    .tool {
        display: grid;
        place-items: center;
        padding: 0.375rem;
        border-radius: calc(var(--layout-radius-control) - 0.25rem);
        color: var(--theme-ink-faint);
        transition: color var(--duration-fast) var(--ease-out), background-color var(--duration-fast) var(--ease-out);
    }

    .tool:hover {
        color: var(--theme-ink);
        background: var(--theme-line);
    }

    .tool.on {
        color: var(--theme-accent);
    }

    /* Placeholder text from the tiptap extension, only on the empty first line */
    .rich :global(p.is-editor-empty:first-child::before) {
        content: attr(data-placeholder);
        float: left;
        height: 0;
        color: var(--theme-ink-faint);
        pointer-events: none;
    }
</style>
