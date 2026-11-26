import { Marked, type Token, type Tokens } from 'marked';

// Notes may be shared later, so nothing in one can run code in someone else's browser
const SAFE_URL = /^(https?:|mailto:)/i

export function isSafeUrl(url: string): boolean {
    return SAFE_URL.test(url)
}

function escape(text: string): string {
    return text.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
}

const marked = new Marked({
    gfm: true,
    breaks: true,
    renderer: {

        // Raw html shows up as the text it is
        html({ text }: Tokens.HTML | Tokens.Tag) {
            return escape(text)
        },

        link({ href, title, tokens }: Tokens.Link) {
            const text = this.parser.parseInline(tokens)
            if(!SAFE_URL.test(href)) return text
            return `<a href="${escape(href)}"${title ? ` title="${escape(title)}"` : ''} target="_blank" rel="noopener noreferrer">${text}</a>`
        },

        // Clickable on cards, the card finds it by its position among the others
        checkbox({ checked }: Tokens.Checkbox) {
            return `<input type="checkbox" class="task"${checked ? ' checked' : ''} aria-label="Task"> `
        },

        image({ href, text }: Tokens.Image) {
            if(!/^https?:/i.test(href)) return escape(text)
            return `<img src="${escape(href)}" alt="${escape(text)}" loading="lazy">`
        },

    },
})

export function renderMarkdown(source: string): string {
    return marked.parse(filled(source), { async: false })
}

// An empty task needs some text after its box, else marked shows the raw brackets
const EMPTY_TASK = /^(\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+\[[ xX]\])\s*$/

function filled(source: string): string {
    let inCode = false
    return source.split('\n').map((line) => {
        if(FENCE.test(line)) inCode = !inCode
        return !inCode && EMPTY_TASK.test(line) ? line.replace(EMPTY_TASK, `$1 ${BLANK}`) : line
    }).join('\n')
}

const BLANK = '​'

// Plain text for places that show markdown as is, like push notifications
export function markdownToText(source: string): string {
    return plain(marked.lexer(filled(source))).replaceAll(BLANK, '').replace(/\n{3,}/g, '\n\n').trim()
}

const BLOCKS = new Set(['paragraph', 'heading', 'code', 'blockquote'])

function plain(tokens: Token[]): string {
    return tokens.map((token) => {
        if(token.type === 'list') return (token as Tokens.List).items.map((item) => `${item.task ? (item.checked ? '☑' : '☐') : '•'} ${plain(item.tokens).trim()}`).join('\n') + '\n'
        if(token.type === 'space' || token.type === 'hr' || token.type === 'br') return '\n'

        const text = 'tokens' in token && token.tokens ? plain(token.tokens) : 'text' in token ? String(token.text) : ''
        return BLOCKS.has(token.type) ? text + '\n' : text
    }).join('')
}



// CHECKLISTS ====================================================================================================

// Done state of every task, in reading order
export function tasksOf(source: string): boolean[] {
    const done: boolean[] = []
    collectTasks(marked.lexer(filled(source)), done)
    return done
}

function collectTasks(tokens: Token[], done: boolean[]){
    for(const token of tokens){
        if(token.type === 'list'){
            for(const item of (token as Tokens.List).items){
                if(item.task) done.push(!!item.checked)
                collectTasks(item.tokens, done)
            }
        }
        else if('tokens' in token && token.tokens) collectTasks(token.tokens, done)
    }
}

// Lines that may hold a task, marked decides which really do
const TASK_LINE = /^(\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+\[)([ xX])\]/
const FENCE = /^\s*(```|~~~)/

// Flips the task at that index of tasksOf, the source stays as it is when there is none
export function toggleTask(source: string, index: number): string {
    const before = tasksOf(source)
    if(index < 0 || index >= before.length) return source

    // Only the task at the index may change, the parser has the last word on what counts as one
    const flipsOnly = (candidate: string) => {
        const after = tasksOf(candidate)
        return after.length === before.length && after.every((done, i) => i === index ? done !== before[i] : done === before[i])
    }

    // Usually the nth candidate line, edge cases like indented code fall back to trying them in turn
    const lines = candidateLines(source)
    const guess = lines[index] !== undefined ? flip(source, lines[index]) : null
    if(guess && flipsOnly(guess)) return guess

    for(const line of lines){
        const candidate = flip(source, line)
        if(flipsOnly(candidate)) return candidate
    }
    return source
}

// Line numbers that look like a task outside fenced code
function candidateLines(source: string): number[] {
    const found: number[] = []
    let inCode = false
    source.split('\n').forEach((line, i) => {
        if(FENCE.test(line)) inCode = !inCode
        else if(!inCode && TASK_LINE.test(line)) found.push(i)
    })
    return found
}

function flip(source: string, lineNumber: number): string {
    const lines = source.split('\n')
    lines[lineNumber] = lines[lineNumber].replace(TASK_LINE, (_, start: string, mark: string) => `${start}${mark === ' ' ? 'x' : ' '}]`)
    return lines.join('\n')
}

// Order of a list after one of its items got ticked or unticked, checked ones last | that item lands at the end of its part
export function sunkOrder(done: boolean[], index: number): number[] {
    const rank = (i: number) => (done[i] ? 2 : 0) + (i === index ? 1 : 0)
    return [...done.keys()].sort((a, b) => rank(a) - rank(b) || a - b)
}

const EMPTY_LINE = /^[\s>]*$/

// Moves checked items below open ones in the list of that task, subtasks travel along
// No order means nothing moved, also for lists whose place in the source stays unclear
export function sinkTask(source: string, index: number): { source: string, order: number[] | null } {
    const still = { source, order: null }
    const list = taskListAt(source, index)
    const candidates = candidateLines(source)
    if(!list || candidates.length !== tasksOf(source).length) return still

    const order = sunkOrder(list.items.map((item) => !!item.checked), list.starts.indexOf(index))
    if(order.every((from, to) => from === to)) return still

    // Each item reaches to the next one, the last as far as the parser says
    const lines = source.split('\n')
    const starts = list.starts.map((task) => candidates[task])
    const last = starts.length - 1
    const end = starts[last] + list.items[last].raw.trimEnd().split('\n').length
    const blocks = starts.map((start, i) => lines.slice(start, starts[i + 1] ?? end))

    // Empty lines between items keep their place
    const gaps = blocks.map((block) => {
        const size = block.length - 1 - block.findLastIndex((line) => !EMPTY_LINE.test(line))
        return size ? block.splice(-size) : []
    })

    const moved = order.flatMap((from, to) => [...blocks[from], ...gaps[to]])
    const result = [...lines.slice(0, starts[0]), ...moved, ...lines.slice(end)].join('\n')

    // The parser has the last word here too, same items in the new order
    const text = (item: Tokens.ListItem) => item.text.trim()
    const after = taskListAt(result, list.starts[0])
    const intact = after?.items.length === order.length && after.items.every((item, i) => text(item) === text(list.items[order[i]]))
    return intact ? { source: result, order } : still
}

// The checklist one task stands in, with the index of each item's own task
type TaskList = { items: Tokens.ListItem[], starts: number[] }

function taskListAt(source: string, index: number): TaskList | null {
    let count = 0
    let found: TaskList | null = null

    const walk = (tokens: Token[]) => {
        for(const token of tokens){
            if(token.type === 'list'){
                const { items, ordered } = token as Tokens.List
                const starts: number[] = []
                for(const item of items){
                    starts.push(count)
                    if(item.task) count++
                    walk(item.tokens)
                }
                if(!ordered && items.every((item) => item.task) && starts.includes(index)) found = { items, starts }
            }
            else if('tokens' in token && token.tokens) walk(token.tokens)
        }
    }
    walk(marked.lexer(filled(source)))
    return found
}
