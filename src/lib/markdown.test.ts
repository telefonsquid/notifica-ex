import { describe, expect, test } from 'bun:test';
import { markdownToText, renderMarkdown, sinkTask, tasksOf, toggleTask } from '#lib/markdown.ts';

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
            expect((renderMarkdown(source).match(/type="checkbox"/g) ?? []).length).toBe(tasks.length)

            tasks.forEach((done, index) => {
                expect(tasksOf(toggleTask(source, index))).toEqual(tasks.map((item, i) => i === index ? !done : item))
            })
        })
    }

    test('an empty task still shows its box', () => {
        expect(renderMarkdown('- [ ] ')).not.toContain('[ ]')
    })

    test('an index without a task changes nothing', () => {
        expect(toggleTask('- [ ] a', 3)).toBe('- [ ] a')
    })
})

// Source, ticked or unticked task, result
const SINKS: Record<string, [string, number, string]> = {
    ticked: ['- [x] a\n- [ ] b\n- [ ] c', 0, '- [ ] b\n- [ ] c\n- [x] a'],
    unticked: ['- [ ] a\n- [x] b\n- [x] c\n- [ ] d', 3, '- [ ] a\n- [ ] d\n- [x] b\n- [x] c'],
    afterChecked: ['- [x] a\n- [ ] b\n- [x] c', 0, '- [ ] b\n- [x] c\n- [x] a'],
    surroundings: ['text\n\n- [x] a\n- [ ] b\n\nmore', 0, 'text\n\n- [ ] b\n- [x] a\n\nmore'],
    subtasksTravel: ['- [x] a\n  - [ ] a1\n  - [x] a2\n- [ ] b', 0, '- [ ] b\n- [x] a\n  - [ ] a1\n  - [x] a2'],
    onlyItsOwnList: ['- [x] a\n  - [x] a1\n  - [ ] a2\n- [ ] b', 1, '- [x] a\n  - [ ] a2\n  - [x] a1\n- [ ] b'],
    loose: ['- [x] a\n\n  continued\n\n- [ ] b\n\n- [ ] c\n', 0, '- [ ] b\n\n- [ ] c\n\n- [x] a\n\n  continued\n'],
    quote: ['> - [x] a\n> - [ ] b\n\nafter', 0, '> - [ ] b\n> - [x] a\n\nafter'],
    empty: ['- [x]\n- [ ] b', 0, '- [ ] b\n- [x]'],
    ordered: ['1. [x] a\n2. [ ] b', 0, '1. [x] a\n2. [ ] b'],
    mixed: ['- [x] a\n- plain\n- [ ] b', 0, '- [x] a\n- plain\n- [ ] b'],
    inPlace: ['- [ ] a\n- [x] b', 1, '- [ ] a\n- [x] b'],
    secondList: ['- [x] a\n- [ ] b\n\ntext\n\n- [x] c\n- [ ] d', 2, '- [x] a\n- [ ] b\n\ntext\n\n- [ ] d\n- [x] c'],
    codeLookalike: ['text\n\n    - [ ] code\n\ntext\n\n- [x] a\n- [ ] b', 0, 'text\n\n    - [ ] code\n\ntext\n\n- [x] a\n- [ ] b'],
}

describe('sinking', () => {
    for(const [name, [source, index, result]] of Object.entries(SINKS)){
        test(name, () => {
            const sunk = sinkTask(source, index)
            expect(sunk.source).toBe(result)
            expect(sunk.order === null).toBe(source === result)
        })
    }
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
