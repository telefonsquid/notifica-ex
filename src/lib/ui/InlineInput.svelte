<script lang="ts">
    import type { ClassValue, HTMLInputAttributes } from 'svelte/elements';

    type BaseAttributes = Omit<HTMLInputAttributes, 'class' | 'value' | 'onchange' | 'onkeydown'>;

    // PROPS
    let {
        value,
        label,
        class: className = '',
        onsave,
        ...others
    }: {
        value: string                                   // the stored text, the field follows it while not being edited
        label: string
        class?: ClassValue
        onsave: (value: string) => Promise<unknown>     // a falsy result puts the stored text back
    } & BaseAttributes = $props()

    // SAVE | on Enter or leaving the field, an empty or unchanged text puts the stored one back
    function change(input: HTMLInputElement){
        const next = input.value.trim()
        if(!next || next === value){
            input.value = value
            return
        }
        onsave(next).then((result) => {
            if(!result) input.value = value
        })
    }
</script>

<!-- Reads as plain text until focused, a rename right in place -->
<input
    {value}
    aria-label={label}
    class={['min-w-0 bg-transparent outline-none', className]}
    onchange={(event) => change(event.currentTarget)}
    onkeydown={(event) => { if(event.key === 'Enter') event.currentTarget.blur() }}
    {...others}
/>
