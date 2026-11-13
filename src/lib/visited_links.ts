// VISITED LINKS
// Browsers hide :visited from other sites' history and the Android webview never sets it,
// so links opened from a note are remembered here, per device

const KEY = 'visited-links'
const LIMIT = 500           // Oldest drop out first

let style: HTMLStyleElement | null = null

function read(): string[] {
    try {
        const list = JSON.parse(localStorage.getItem(KEY) ?? '[]')
        return Array.isArray(list) ? list.filter((href) => typeof href === 'string') : []
    } catch {
        return []
    }
}

// One rule that matches every remembered href, the colour itself lives in markdown.css
function paint(list: string[]) {
    style ??= document.head.appendChild(document.createElement('style'))
    style.textContent = list.length ? `.markdown a:is(${list.map((href) => `[href="${CSS.escape(href)}"]`).join(',')}) { color: var(--link-visited); }` : ''
}

export function markVisited(href: string) {
    const list = [...read().filter((item) => item !== href), href].slice(-LIMIT)
    try { localStorage.setItem(KEY, JSON.stringify(list)) } catch { /* Storage full or blocked, the colour then lasts until reload */ }
    paint(list)
}

// Installed once in the root layout | the rich editor opens links itself and reports them through markVisited
export function trackVisitedLinks() {
    paint(read())

    function record(event: MouseEvent) {
        if(event.type === 'auxclick' && event.button !== 1) return
        const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('.markdown a[href]') : null
        if(!link || link.closest('[contenteditable="true"]')) return

        markVisited(link.getAttribute('href')!)
    }

    document.addEventListener('click', record, true)
    document.addEventListener('auxclick', record, true)
    return () => {
        document.removeEventListener('click', record, true)
        document.removeEventListener('auxclick', record, true)
        style?.remove()
        style = null
    }
}
