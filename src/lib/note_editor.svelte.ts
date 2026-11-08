import type MarkdownEditor from '#lib/components/MarkdownEditor.svelte';

// Tiptap is heavy, it loads on the first hover or opening and a skeleton stands in until then
let component = $state.raw<typeof MarkdownEditor>()
let loading: Promise<unknown> | undefined

export const noteEditor = {
    get component(){ return component },

    load(){
        loading ??= import('#lib/components/MarkdownEditor.svelte').then((module) => component = module.default)
        return loading
    }
}
