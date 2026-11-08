// Agent toolbox for this repo | one call for what sessions kept rebuilding from shell snippets
// Run as bin/agent-cli <command> [--json], bin/agent-cli <command> --help for its options

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(import.meta.path), '..')
const DOCKER_DESKTOP = 'C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe'
const CONTAINERS = ['notifica-ex-pb', 'notifica-ex-ntfy']
const WEB_URL = 'http://127.0.0.1:55560'

type Args = { pos: string[], flags: Record<string, string | true> }
type Command = { summary: string, help: string, run: (args: Args, json: boolean) => Promise<number> }


// ==================================================================================================================================================================
// HELPERS
// ==================================================================================================================================================================

function parseArgs(argv: string[]): Args {
    const pos: string[] = []
    const flags: Record<string, string | true> = {}
    for(let i = 0; i < argv.length; i++) {
        const a = argv[i]
        if(!a.startsWith('--')) { pos.push(a); continue }
        const [key, inline] = a.slice(2).split('=', 2)
        if(inline !== undefined) flags[key] = inline
        else if(argv[i + 1] && !argv[i + 1].startsWith('--') && VALUE_FLAGS.has(key)) flags[key] = argv[++i]
        else flags[key] = true
    }
    return { pos, flags }
}

const VALUE_FLAGS = new Set(['filter', 'fields', 'sort', 'limit', 'only', 'expand'])

// Reads .env without exporting it, values stay out of the shell history
function readEnv(): Record<string, string> {
    const file = join(ROOT, '.env')
    if(!existsSync(file)) return {}
    const env: Record<string, string> = {}
    for(const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^#]*?))\s*(?:#.*)?$/)
        if(m) env[m[1]] = m[2] ?? m[3] ?? m[4] ?? ''
    }
    return env
}

function pbUrl(env: Record<string, string>): string {
    return (env.INTERNAL_POCKETBASE_URL || 'http://127.0.0.1:8091').replace('//localhost', '//127.0.0.1')
}

async function probe(url: string, ms = 2500): Promise<number | 'down'> {
    try { return (await fetch(url, { signal: AbortSignal.timeout(ms) })).status }
    catch { return 'down' }
}

async function sh(cmd: string[], opts: { cwd?: string } = {}): Promise<{ code: number, out: string }> {
    try {
        const p = Bun.spawn(cmd, { cwd: opts.cwd ?? ROOT, stdout: 'pipe', stderr: 'pipe' })
        const [out, err] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()])
        return { code: await p.exited, out: out + err }
    } catch(e) {
        return { code: 127, out: String(e) }
    }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

function emit(json: boolean, data: unknown, text: string): void {
    console.log(json ? JSON.stringify(data) : text)
}

function readJson(path: string): { version?: string } | null {
    try { return JSON.parse(readFileSync(join(ROOT, path), 'utf8')) } catch { return null }
}

type PbField = { name: string, type: string, system?: boolean, required?: boolean, collectionId?: string, maxSelect?: number }
type FieldRow = { name: string, type: string, required: boolean, to?: string, many?: boolean }


// ==================================================================================================================================================================
// STACK
// ==================================================================================================================================================================

async function stackStatus() {
    const env = readEnv()
    const ps = await sh(['docker', 'ps', '-a', '--filter', 'name=notifica-ex', '--format', '{{.Names}}\t{{.State}}'])
    const daemon = ps.code === 0
    const containers: Record<string, string> = Object.fromEntries(CONTAINERS.map(c => [c, daemon ? 'missing' : 'unknown']))
    if(daemon) for(const line of ps.out.trim().split('\n')) {
        const [name, state] = line.split('\t')
        if(name in containers) containers[name] = state
    }

    const [pb, ntfy, web] = await Promise.all([
        probe(`${pbUrl(env)}/api/health`),
        probe(`${(env.NTFY_URL || 'http://127.0.0.1:8092').replace('//localhost', '//127.0.0.1')}/v1/health`),
        probe(`${WEB_URL}/api/health`),
    ])
    return { docker: daemon ? 'up' : 'down', containers, health: { pb, ntfy, web } }
}

function stackText(s: Awaited<ReturnType<typeof stackStatus>>): string {
    const lines = [`docker ${s.docker}`]
    for(const [n, st] of Object.entries(s.containers)) lines.push(`${n} ${st}`)

    // Web answers 204 when it and PocketBase are fine, 503 when only PocketBase is missing
    lines.push(`pb:8091 ${s.health.pb}  ntfy:8092 ${s.health.ntfy}  web:55560 ${s.health.web}`)
    if(s.health.web === 'down') lines.push('web not running: preview_start {name:"web"}')
    return lines.join('\n')
}

async function stackUp(json: boolean): Promise<number> {
    let s = await stackStatus()

    // Docker Desktop takes up to a minute after a reboot
    if(s.docker === 'down') {
        if(!existsSync(DOCKER_DESKTOP)) { emit(json, { error: 'docker desktop not found' }, 'docker desktop not found'); return 1 }
        Bun.spawn([DOCKER_DESKTOP], { stdout: 'ignore', stderr: 'ignore' }).unref()
        for(let i = 0; i < 60 && (await sh(['docker', 'info'])).code !== 0; i++) await sleep(2000)
    }

    const stopped = CONTAINERS.filter(c => s.containers[c] !== 'running')
    if(stopped.length) await sh(['docker', 'start', ...stopped])

    for(let i = 0; i < 20; i++) {
        s = await stackStatus()
        if(s.health.pb === 200 && s.health.ntfy === 200) break
        await sleep(1000)
    }
    emit(json, s, stackText(s))
    return s.health.pb === 200 && s.health.ntfy === 200 ? 0 : 1
}


// ==================================================================================================================================================================
// POCKETBASE
// ==================================================================================================================================================================

async function superuserToken(env: Record<string, string>): Promise<string> {
    const res = await fetch(`${pbUrl(env)}/api/collections/_superusers/auth-with-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity: env.POCKETBASE_SUPERUSER_EMAIL, password: env.POCKETBASE_SUPERUSER_PASSWORD }),
        signal: AbortSignal.timeout(5000),
    })
    if(!res.ok) throw new Error(`superuser auth ${res.status}`)
    return (await res.json()).token
}

// Read only on purpose | writes go through the app so access rules and migrations stay the only way in
async function pb(args: Args, json: boolean): Promise<number> {
    const env = readEnv()
    const base = pbUrl(env)
    const token = await superuserToken(env).catch((e: Error) => e)
    if(token instanceof Error) { emit(json, { error: token.message }, `error ${token.message} (stack up?)`); return 1 }
    const get = async (path: string) => {
        const res = await fetch(`${base}${path}`, { headers: { Authorization: token }, signal: AbortSignal.timeout(10000) })
        const body = await res.json().catch(() => null)
        if(!res.ok) throw new Error(`${res.status} ${body?.message ?? ''}`.trim())
        return body
    }

    const [collection, id] = args.pos

    // No collection given: list them with record counts
    if(!collection) {
        const list = await get('/api/collections?perPage=200&fields=name,type')
        const rows = await Promise.all(list.items.map(async (c: { name: string, type: string }) => {
            const count = c.type === 'view' || c.name.startsWith('_') ? null : (await get(`/api/collections/${c.name}/records?perPage=1&fields=id`).catch(() => null))?.totalItems ?? null
            return { name: c.name, type: c.type, count }
        }))
        emit(json, rows, rows.map(r => `${r.name} ${r.type}${r.count === null ? '' : ' ' + r.count}`).join('\n'))
        return 0
    }

    // Schema of one collection
    if(args.flags.schema) {
        const c = await get(`/api/collections/${collection}`)
        const fields: FieldRow[] = (c.fields as PbField[]).filter(f => !f.system || f.name === 'id').map(f => ({ name: f.name, type: f.type, required: !!f.required, ...(f.collectionId ? { to: f.collectionId } : {}), ...((f.maxSelect ?? 0) > 1 ? { many: true } : {}) }))
        const rules = Object.fromEntries(['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule'].map(r => [r, c[r]]))
        emit(json, { name: c.name, type: c.type, fields, rules, indexes: c.indexes }, [
            ...fields.map(f => `${f.name} ${f.type}${f.required ? '!' : ''}${f.many ? '[]' : ''}`),
            ...Object.entries(rules).map(([k, v]) => `${k}: ${v === null ? 'superuser only' : JSON.stringify(v)}`),
        ].join('\n'))
        return 0
    }

    const q = new URLSearchParams()
    for(const k of ['filter', 'sort', 'fields', 'expand']) if(typeof args.flags[k] === 'string') q.set(k, args.flags[k] as string)

    if(id) {
        const rec = await get(`/api/collections/${collection}/records/${id}?${q}`)
        emit(json, rec, JSON.stringify(rec, null, 1))
        return 0
    }

    q.set('perPage', String(Number(args.flags.limit) || 20))
    if(!q.has('sort')) q.set('sort', '-updated')
    const page = await get(`/api/collections/${collection}/records?${q}`).catch(async (e: Error) => {

        // Collections without an updated field reject the default sort
        if(args.flags.sort || !e.message.startsWith('400')) throw e
        q.delete('sort')
        return get(`/api/collections/${collection}/records?${q}`)
    })
    emit(json, page, [`${page.items.length}/${page.totalItems}`, ...page.items.map((r: unknown) => JSON.stringify(r))].join('\n'))
    return 0
}


// ==================================================================================================================================================================
// VERIFY
// ==================================================================================================================================================================

type Step = { name: string, ok: boolean, seconds: number, problems: string[] }

async function runCheck(): Promise<string[]> {
    const r = await sh(['bun', 'run', 'check', '--output', 'machine'])
    const problems = r.out.split('\n').filter(l => / (ERROR|WARNING) /.test(l)).map(l => {
        const m = l.match(/ (ERROR|WARNING) "([^"]+)" (\d+:\d+) "(.*)"$/)
        return m ? `${m[1].toLowerCase()} ${m[2]}:${m[3]} ${m[4].replace(/\\n/g, ' ')}` : l.trim()
    })
    return r.code === 0 && !problems.some(p => p.startsWith('error')) ? problems : problems.length ? problems : [r.out.trim().split('\n').slice(-15).join('\n')]
}

async function runLint(): Promise<string[]> {
    const r = await sh(['bunx', 'eslint', '.', '--format', 'json'])
    let report: { filePath: string, messages: { severity: number, line: number, column: number, ruleId: string | null, message: string }[] }[]
    try { report = JSON.parse(r.out.slice(r.out.indexOf('['))) } catch { return r.code === 0 ? [] : [r.out.trim().split('\n').slice(-15).join('\n')] }
    return report.flatMap(f => f.messages.map(m => `${m.severity === 2 ? 'error' : 'warn'} ${f.filePath.slice(ROOT.length + 1).replace(/\\/g, '/')}:${m.line}:${m.column} ${m.message} (${m.ruleId ?? 'parse'})`))
}

async function runTest(): Promise<string[]> {
    const r = await sh(['bun', 'test'])
    if(r.code === 0) return []

    // Keep the failing test names and the lines around each assertion
    const lines = r.out.split('\n')
    const keep = lines.filter((l, i) => /\(fail\)|error:|Expected|Received|^\s+at .*\.test\.ts/.test(l) || /^\s*\d+ fail/.test(l) || (i > 0 && /error:/.test(lines[i - 1])))
    return keep.length ? keep.slice(0, 40) : lines.slice(-20)
}

async function verify(args: Args, json: boolean): Promise<number> {
    const runners: Record<string, () => Promise<string[]>> = { check: runCheck, lint: runLint, test: runTest }
    const only = typeof args.flags.only === 'string' ? args.flags.only.split(',') : Object.keys(runners)
    const unknown = only.filter(n => !(n in runners))
    if(unknown.length) { emit(json, { error: `unknown step ${unknown}` }, `unknown step ${unknown}`); return 2 }

    const steps: Step[] = await Promise.all(only.map(async name => {
        const start = performance.now()
        const problems = await runners[name]()
        const ok = !problems.some(p => !p.startsWith('warn'))
        return { name, ok, seconds: Math.round((performance.now() - start) / 100) / 10, problems }
    }))

    emit(json, steps, steps.map(s => [`${s.name} ${s.ok ? 'ok' : 'FAIL'} ${s.seconds}s${s.problems.length ? ` (${s.problems.length})` : ''}`, ...s.problems.map(p => '  ' + p)].join('\n')).join('\n'))
    return steps.every(s => s.ok) ? 0 : 1
}


// ==================================================================================================================================================================
// MIGRATE AND VERSIONS
// ==================================================================================================================================================================

async function migrate(_args: Args, json: boolean): Promise<number> {
    const env = readEnv()
    const res = await fetch(`${WEB_URL}/api/migration`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.SERVER_AUTH_SECRET}` },
        signal: AbortSignal.timeout(60000),
    }).catch(() => null)
    if(!res) { emit(json, { status: 'down' }, 'web down: preview_start {name:"web"}'); return 1 }
    const body = (await res.text()).slice(0, 500)
    emit(json, { status: res.status, body }, `${res.status} ${body}`)
    return res.ok ? 0 : 1
}

async function versions(_args: Args, json: boolean): Promise<number> {
    const pkg = readJson('package.json')
    const tauri = readJson('src-tauri/tauri.conf.json')
    const cargo = readFileSync(join(ROOT, 'src-tauri/Cargo.toml'), 'utf8').match(/^version\s*=\s*"([^"]+)"/m)?.[1]
    const changelog = readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8').match(/^## (\S+)/m)?.[1]
    const app = { 'package.json': pkg?.version, 'tauri.conf.json': tauri?.version, 'Cargo.toml': cargo, 'CHANGELOG.md': changelog }

    const libs = Object.fromEntries(['svelte', '@sveltejs/kit', 'vite', 'typescript', 'tailwindcss', 'pocketbase', '@tiptap/core', 'bits-ui', 'zod', '@tauri-apps/cli']
        .map(n => [n, readJson(`node_modules/${n}/package.json`)?.version ?? null]))
    const pbVersion = readFileSync(join(ROOT, 'pocketbase/Dockerfile'), 'utf8').match(/PB_VERSION=(\S+)/)?.[1]
    const ntfy = readEnv().NTFY_VERSION || readFileSync(join(ROOT, 'docker-compose-example.yml'), 'utf8').match(/NTFY_VERSION:-([^}]+)\}/)?.[1]

    const [tag, bun] = await Promise.all([sh(['git', 'describe', '--tags', '--abbrev=0']), sh(['bun', '--version'])])
    const lastTag = tag.code === 0 ? tag.out.trim() : null
    const since = lastTag ? (await sh(['git', 'log', '--format=%s', `${lastTag}..HEAD`])).out.trim().split('\n').filter(Boolean) : []

    const inStep = new Set(Object.values(app)).size === 1
    const data = { app, inStep, lastTag, commitsSinceTag: since, libs: { ...libs, bun: bun.out.trim(), 'pocketbase(server)': pbVersion, ntfy } }
    emit(json, data, [
        `app ${Object.entries(app).map(([k, v]) => `${k}=${v}`).join(' ')}${inStep ? '' : ' MISMATCH'}`,
        `tag ${lastTag} +${since.length} commits`,
        ...since.map(s => '  ' + s),
        Object.entries(data.libs).map(([k, v]) => `${k} ${v}`).join('  '),
    ].join('\n'))
    return inStep ? 0 : 1
}


// ==================================================================================================================================================================
// COMMANDS
// ==================================================================================================================================================================

const COMMANDS: Record<string, Command> = {
    stack: {
        summary: 'dev stack state, or start it',
        help: `stack [status|up] [--json]
  status  docker daemon, notifica-ex-pb/ntfy containers, health of pb:8091 ntfy:8092 web:55560 (default)
  up      start Docker Desktop if needed, start stopped containers, wait for health. Web dev server is not started (use preview_start web)
exit 1 when pb or ntfy unhealthy`,
        run: async (a, json) => {
            if(a.pos[0] === 'up') return stackUp(json)
            const s = await stackStatus()
            emit(json, s, stackText(s))
            return s.health.pb === 200 && s.health.ntfy === 200 ? 0 : 1
        },
    },
    pb: {
        summary: 'read PocketBase as superuser (credentials from .env)',
        help: `pb [collection [id]] [--filter EXPR] [--fields a,b] [--sort -updated] [--limit 20] [--expand rel] [--schema] [--json]
  (none)            collections with type and record count
  collection        newest records, one JSON line each, first line shown/total
  collection id     one record
  --schema          fields (! required, [] multi), access rules, indexes
filter uses PocketBase syntax: --filter "owner='abc' && pinned=true". Read only`,
        run: pb,
    },
    migrate: {
        summary: 'POST /api/migration on the dev server (bootstrap + data migrations)',
        help: `migrate [--json]
sends SERVER_AUTH_SECRET from .env to ${WEB_URL}/api/migration, prints status and body. Needs the web dev server running`,
        run: migrate,
    },
    verify: {
        summary: 'check + lint + test in parallel, only problems printed',
        help: `verify [--only check,lint,test] [--json]
one line per step: name ok|FAIL seconds (problem count), then the problems as file:line:col message
warnings alone do not fail. exit 1 on any failure`,
        run: verify,
    },
    versions: {
        summary: 'app version in all release files, last tag and commits since, library versions',
        help: `versions [--json]
app version in package.json, tauri.conf.json, Cargo.toml, CHANGELOG.md (MISMATCH and exit 1 when they differ)
last tag and the commit subjects since it (changelog input), installed library versions, pocketbase and ntfy image versions`,
        run: versions,
    },
}

function usage(): string {
    return ['agent-cli <command> [--json] | <command> --help', ...Object.entries(COMMANDS).map(([n, c]) => `  ${n.padEnd(9)}${c.summary}`)].join('\n')
}

const [name, ...rest] = Bun.argv.slice(2)
const args = parseArgs(rest)
const command = name ? COMMANDS[name] : undefined

if(!command) {
    console.log(usage())
    process.exit(name && name !== '--help' && name !== 'help' ? 2 : 0)
}
if(args.flags.help) {
    console.log(command.help)
    process.exit(0)
}
try {
    process.exit(await command.run(args, !!args.flags.json))
} catch(e) {
    const message = e instanceof Error ? e.message : String(e)
    emit(!!args.flags.json, { error: message }, `error ${message}`)
    process.exit(1)
}
