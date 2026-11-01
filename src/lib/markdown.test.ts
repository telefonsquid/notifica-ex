import { describe, expect, test } from 'bun:test';
import { markdownToText, renderMarkdown, tasksOf, toggleTask } from '#lib/markdown.ts';

// CHECKLISTS ====================================================================================================
// Cards tick tasks by their index among the rendered checkboxes, so all three must agree
const SOURCES: Record<string, string> = {
    plain: '- [ ] a\n- [x] b',
    nested: '- [ ] a\n  - [ ] a1\n- [ ] b',
    ordered: '1. [ ] one\n2. [x] two',
    quote: '> - [ ] q\n- [ ] after',
    fence: '```\n- [ ] not\n```\n- [ ] yes',
    tildeFence: '~~~\n- [ ] no\n~~~\n- [ ] yes',
    fenceInList: '- [ ] a\n  ```\n  - [ ] not\n  ```\n- [ ] b',
    indentedCode: 'text\n\n    - [ ] code\n\n- [ ] yes',
    noSpace: '- [ ]no-space\n- [ ] real',
    empty: '- [ ]\n- [ ] b',
    markers: '* [ ] s\n+ [X] p',
    loose: '- [ ] a\n\n  continued\n- [ ] b',
    comment: '<!-- - [ ] x -->\n- [ ] y',
}

describe('checklists', () => {
    for(const [name, source] of Object.entries(SOURCES)){
        test(name, () => {
            const tasks = tasksOf(source)
            expect((renderMarkdown(source).match(/class="task"/g) ?? []).length).toBe(tasks.length)

            tasks.forEach((done, index) => {
                expect(tasksOf(toggleTask(source, index))).toEqual(tasks.map((item, i) => i === index ? !done : item))
            })
        })
    }

    test('an index without a task changes nothing', () => {
        expect(toggleTask('- [ ] a', 3)).toBe('- [ ] a')
    })
})



// SAFETY ====================================================================================================
describe('rendering', () => {
    test('raw html shows as text', () => {
        expect(renderMarkdown('<img src=x onerror=alert(1)>')).not.toContain('<img')
    })

    test('unsafe links lose their target', () => {
        expect(renderMarkdown('[x](javascript:alert(1))')).not.toContain('href')
        expect(renderMarkdown('[x](https://example.com)')).toContain('href="https://example.com"')
    })
})

describe('plain text', () => {
    test('lists keep their marks', () => {
        expect(markdownToText('# Title\n\n- [x] done\n- open')).toBe('Title\n\n☑ done\n• open')
    })
})
