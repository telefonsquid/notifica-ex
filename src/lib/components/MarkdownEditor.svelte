<script lang="ts">
    import { isSafeUrl } from '#lib/markdown.ts';
    import { sortable } from '#lib/drag_list.ts';
    import { appear } from '#lib/motion.ts';
    import { tip } from '#lib/tooltip.svelte.ts';
    import { Bold, Check, FileCode, Heading, Italic, Link, List, ListOrdered, ListTodo, Unlink, X } from '@lucide/svelte';
    import { Editor, type NodeViewRenderer } from '@tiptap/core';
    import { BulletList, ListItem, OrderedList, TaskItem, TaskList } from '@tiptap/extension-list';
    import { Placeholder } from '@tiptap/extensions';
    import { Markdown } from '@tiptap/markdown';
    import { Fragment } from '@tiptap/pm/model';
    import type { ViewMutationRecord } from '@tiptap/pm/view';
    import StarterKit from '@tiptap/starter-kit';
    import { untrack } from 'svelte';

    const PLACEHOLDER = 'Write something'

    // PROPS
    let {
        value = $bindable(''),
        autofocus = false
    }: {
        value?: string          // markdown source, rich and raw mode both write it
        autofocus?: boolean
    } = $props()

    let raw = $state(false)
    let editor = $state.raw<Editor>()
    let version = $state(0)     // bumps on every editor change so the toolbar reads it again
    let linking = $state(false)
    let href = $state('')

    // TOOLBAR | groups get a line between them
    type Chain = ReturnType<Editor['chain']>
    type Format = { label: string, icon: typeof Bold, name: string, attributes?: Record<string, unknown>, run: (chain: Chain) => Chain }

    const FORMATS: Format[][] = [
        [
            { label: 'Bold', icon: Bold, name: 'bold', run: (chain) => chain.toggleBold() },
            { label: 'Italic', icon: Italic, name: 'italic', run: (chain) => chain.toggleItalic() },
            { label: 'Heading', icon: Heading, name: 'heading', attributes: { level: 2 }, run: (chain) => chain.toggleHeading({ level: 2 }) }
        ],
        [
            { label: 'Bullet list', icon: List, name: 'bulletList', run: (chain) => chain.toggleBulletList() },
            { label: 'Numbered list', icon: ListOrdered, name: 'orderedList', run: (chain) => chain.toggleOrderedList() },
            { label: 'Checklist', icon: ListTodo, name: 'taskList', run: (chain) => chain.toggleTaskList() }
        ]
    ]

    // LIST ITEMS | a handle on the left drags the item through sortable(), its neighbours glide aside
    // The drag styles the rows itself, the editor must not read them back as edits
    const draggingStyle = (mutation: ViewMutationRecord, node: Node) => mutation.type === 'attributes' && mutation.target === node && ['style', 'data-lifted', 'data-sorting'].includes(mutation.attributeName ?? '')

    function sortableList(tag: 'ul' | 'ol', type: string): NodeViewRenderer {
        return ({ editor, getPos, HTMLAttributes }) => {
            const list = withAttributes(document.createElement(tag), HTMLAttributes)
            if(type === 'taskList') list.dataset.type = type
            const detach = sortable((from, to) => moveItem(editor, getPos(), from, to), { handleOnly: true })(list)
            return { dom: list, contentDOM: list, ignoreMutation: (mutation) => draggingStyle(mutation, list), destroy: () => detach?.() }
        }
    }

    // Unset attributes stay off, a numbered list would read type="null"
    function withAttributes<T extends HTMLElement>(element: T, attributes: Record<string, unknown>){
        for(const [name, value] of Object.entries(attributes)) if(value != null) element.setAttribute(name, String(value))
        return element
    }

    function dragHandle(){
        const handle = document.createElement('span')
        handle.className = 'drag-handle'
        handle.contentEditable = 'false'
        handle.dataset.dragHandle = ''
        handle.setAttribute('aria-hidden', 'true')
        return handle
    }

    const SortableBulletList = BulletList.extend({ addNodeView: () => sortableList('ul', 'bulletList') })
    const SortableOrderedList = OrderedList.extend({ addNodeView: () => sortableList('ol', 'orderedList') })
    const SortableTaskList = TaskList.extend({ addNodeView: () => sortableList('ul', 'taskList') })

    // The text goes in a box of its own, the handle beside it is no part of the note
    const HandledListItem = ListItem.extend({
        addNodeView(){
            return ({ HTMLAttributes }) => {
                const item = withAttributes(document.createElement('li'), HTMLAttributes)
                const content = document.createElement('div')
                item.append(dragHandle(), content)
                return { dom: item, contentDOM: content, ignoreMutation: (mutation) => draggingStyle(mutation, item) }
            }
        }
    })

    const HandledTaskItem = TaskItem.extend({
        addNodeView(){
            const base = this.parent?.()
            if(!base) return null
            return (props) => {
                const view = base(props)
                view.dom.prepend(dragHandle())
                return { ...view, ignoreMutation: (mutation) => draggingStyle(mutation, view.dom) }
            }
        }
    })

    function moveItem(instance: Editor, at: number | undefined, from: number, to: number){
        const list = at === undefined ? null : instance.state.doc.nodeAt(at)
        if(at === undefined || !list) return
        const items = [...Array(list.childCount).keys()].map((index) => list.child(index))
        items.splice(to, 0, ...items.splice(from, 1))
        instance.view.dispatch(instance.state.tr.replaceWith(at + 1, at + list.nodeSize - 1, Fragment.fromArray(items)))
    }

    // EDITOR | built from the current text whenever rich mode comes back
    function mount(element: HTMLElement){
        const instance = untrack(() => new Editor({
            element,
            extensions: [
                StarterKit.configure({
                    heading: { levels: [1, 2, 3] },
                    dropcursor: { color: 'var(--theme-accent)', width: 2 },
                    link: { openOnClick: false, autolink: true, isAllowedUri: (url) => isSafeUrl(url) },
                    bulletList: false,
                    orderedList: false,
                    listItem: false,
                }),
                SortableBulletList,
                SortableOrderedList,
                HandledListItem,
                SortableTaskList,
                HandledTaskItem.configure({ nested: true }),
                Placeholder.configure({ placeholder: PLACEHOLDER }),
                Markdown,
            ],
            content: value,
            contentType: 'markdown',
            editorProps: {
                attributes: { class: 'markdown min-h-32 text-ink-muted outline-none', 'aria-label': 'Text', 'data-claims-escape': '', 'data-note-text': '' },
                handleClick: (_view, _pos, event) => followLink(event),
            },
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

    // A click on a link's arrow or with Ctrl opens it, a plain click places the caret for editing
    function followLink(event: MouseEvent): boolean {
        const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null
        if(!link || !isSafeUrl(link.href)) return false

        const rects = link.getClientRects()
        const last = rects[rects.length - 1]
        const onArrow = !!last && event.clientX >= last.right - parseFloat(getComputedStyle(link).fontSize)
        if(!onArrow && !event.ctrlKey && !event.metaKey) return false

        window.open(link.href, '_blank', 'noopener,noreferrer')
        return true
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

<div class="editor flex flex-col gap-2">

    <!-- TEXT -->
    {#if raw}
        <textarea
            data-note-text
            bind:value
            placeholder={PLACEHOLDER}
            aria-label="Markdown source"
            class="field-sizing-content min-h-32 resize-none bg-transparent font-mono text-sm leading-relaxed text-ink-muted outline-none placeholder:text-ink-faint"
        ></textarea>
    {:else}
        <div class="rich" {@attach mount}></div>
    {/if}

    <!-- TOOLBAR | formatting only exists in rich mode, the source toggle sits quietly at the end | drifts in with the other controls of an opening note -->
    <div class="open-only -mx-2 flex min-h-8 items-center gap-0.5" in:appear|global>
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
                {#each FORMATS as group, index (index)}
                    {#each group as format (format.name)}
                        {@const on = active(format.name, format.attributes)}
                        <button class={['tool', on && 'on']} aria-label={format.label} {@attach tip(format.label)} aria-pressed={on} onclick={() => format.run(editor!.chain().focus()).run()}><format.icon class="size-3.5" /></button>
                    {/each}
                    <span class="mx-1 h-4 w-px bg-line"></span>
                {/each}
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

    /* DRAG HANDLE | at the row's end, only while the item is hovered | the text scrolls in its own box, which clips anything left of it */
    .rich :global(li:has(> .drag-handle)) {
        position: relative;
        padding-right: 1.4em;
    }

    .rich :global(.drag-handle) {
        position: absolute;
        top: 0.25em;
        right: 0;
        width: 0.9em;
        height: 1.1em;
        cursor: grab;
        opacity: 0;
        background-color: var(--theme-ink-faint);
        mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Ccircle cx='9' cy='5' r='1.8'/%3E%3Ccircle cx='9' cy='12' r='1.8'/%3E%3Ccircle cx='9' cy='19' r='1.8'/%3E%3Ccircle cx='15' cy='5' r='1.8'/%3E%3Ccircle cx='15' cy='12' r='1.8'/%3E%3Ccircle cx='15' cy='19' r='1.8'/%3E%3C/svg%3E") center / contain no-repeat;
        transition: opacity var(--duration-fast) var(--ease-out), background-color var(--duration-fast) var(--ease-out);
    }

    .rich :global(li:hover:not(:has(li:hover)) > .drag-handle) {
        opacity: 1;
    }

    .rich :global(.drag-handle:hover) {
        background-color: var(--theme-ink);
    }

    .rich :global(.drag-handle:active) {
        cursor: grabbing;
    }

    /* A touch on the handle drags instead of scrolling */
    .rich :global(.drag-handle) {
        touch-action: none;
    }

    /* The held item lifts as a small card of the note's colour, its handle stays in sight */
    .rich :global(li[data-lifted]) {
        border-radius: calc(var(--layout-radius-control) - 0.25rem);
        background-color: var(--note-bg, var(--theme-card));
        box-shadow: 0 0.5rem 1.25rem -0.5rem rgb(0 0 0 / 0.35), 0 0 0 1px var(--theme-line);
    }

    .rich :global(li[data-lifted] > .drag-handle) {
        opacity: 1;
        background-color: var(--theme-ink);
    }

    /* Touch has no hover to find it by, the handle always shows there | some phones claim hover, a coarse pointer gives them away */
    @media (hover: none), (pointer: coarse) {
        .rich :global(.drag-handle) {
            opacity: 1;
        }
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
