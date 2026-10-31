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
    return marked.parse(source, { async: false })
}

// Plain text for places that show markdown as is, like push notifications
export function markdownToText(source: string): string {
    return plain(marked.lexer(source)).replace(/\n{3,}/g, '\n\n').trim()
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
    collectTasks(marked.lexer(source), done)
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

// Same order as tasksOf, code blocks hold no tasks
const TASK_LINE = /^(\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+\[)([ xX])\]/
const FENCE = /^\s*(```|~~~)/

export function toggleTask(source: string, index: number): string {
    let inCode = false
    let seen = 0
    const lines = source.split('\n')

    for(let i = 0; i < lines.length; i++){
        if(FENCE.test(lines[i])){
            inCode = !inCode
            continue
        }
        const match = !inCode && lines[i].match(TASK_LINE)
        if(!match) continue
        if(seen++ === index){
            const mark = match[2] === ' ' ? 'x' : ' '
            lines[i] = match[1] + mark + lines[i].slice(match[1].length + 1)
            break
        }
    }
    return lines.join('\n')
}
