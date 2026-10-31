import { Marked, type Token, type Tokens } from 'marked';

// Notes may be shared later, so nothing in one can run code in someone else's browser
const SAFE_URL = /^(https?:|mailto:)/i

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
        if(token.type === 'list') return (token as Tokens.List).items.map((item) => `• ${plain(item.tokens).trim()}`).join('\n') + '\n'
        if(token.type === 'space' || token.type === 'hr' || token.type === 'br') return '\n'

        const text = 'tokens' in token && token.tokens ? plain(token.tokens) : 'text' in token ? String(token.text) : ''
        return BLOCKS.has(token.type) ? text + '\n' : text
    }).join('')
}
