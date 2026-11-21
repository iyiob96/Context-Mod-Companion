import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement } from 'claude-code'

import type { Prayer, Rtk, Segment, Setup, SetupStep, Usage } from '../types'
import { cityOf, countdown, localNow, nextPrayer, parseTimings, timingsUrl, userTimeZone } from './prayer'
import { characterGrid, EYES, HEIGHT, PALETTE, SKIN, WIDTH } from './character'
import type { Mood } from './character'
import {
  hasBashLine,
  hasMarketplace,
  isEnabled,
  isHooked,
  MATT_ID,
  missingSummary,
  OFFICIAL_MARKETPLACE,
  OFFICIAL_MARKETPLACE_URL,
  RTK_INSTALL,
  RTK_MANUAL,
  SETUP_COMMAND,
  STEP_LABEL,
  STEP_ORDER,
  withBashLine,
} from './setup'

const isShown = atom({ plugin: 'yemeni-context-band', key: 'isShown' } as const, false)
const usageAtom = atom({ plugin: 'yemeni-context-band', key: 'usage' } as const, null)
const rtkAtom = atom({ plugin: 'yemeni-context-band', key: 'rtk' } as const, null)
const rtkBaseline = atom({ plugin: 'yemeni-context-band', key: 'rtkBaseline' } as const, null)
const prayerAtom = atom({ plugin: 'yemeni-context-band', key: 'prayer' } as const, null as Prayer | null)
const setupAtom = atom({ plugin: 'yemeni-context-band', key: 'setup' } as const, null as Setup | null)

const ACCENT = '#e0875a'
const RTK = '#7ccf8a'
const GOLD = '#d4a72c'
const RADIUS = 2 // px, shared by the legend swatches and the % badge
const SCALE = 3 // CSS px per character pixel
const FREE = '#3a3f4b'
const BUFFER = '#7b8190'
const SEGMENT_COLORS: [RegExp, string][] = [
  [/system prompt/i, '#6c8cff'],
  [/system tools|^tools/i, '#9aa3b5'],
  [/mcp/i, '#a479f2'],
  [/agent/i, '#7ccf8a'],
  [/memory/i, '#f2a65a'],
  [/skill/i, '#f28ab8'],
  [/message/i, '#e86a5c'],
]
const FALLBACK = ['#5cc8d6', '#d6c35c', '#8fd65c', '#d65c8f']

function colorOf(s: Segment, i: number): string {
  if (s.kind === 'free') return FREE
  if (s.kind === 'buffer') return BUFFER
  return SEGMENT_COLORS.find(([re]) => re.test(s.name))?.[1] ?? FALLBACK[i % FALLBACK.length]!
}

// Legend labels as /context names them, lowercased, a few shortened to fit five a row.
const SHORT_LABEL: Record<string, string> = { 'mcp server instructions': 'mcp ins.', 'custom agents': 'agents' }
const legendLabel = (name: string) => SHORT_LABEL[name.toLowerCase()] ?? name.toLowerCase()

const AUK_AUDIT_PROMPT =
  "Use the auk-design-auditor subagent to audit a document against the AUK design system. Ask me which file to audit first. If that subagent isn't available in this session, tell me to start a session in the AUK Design System folder."
const SECURITY_AUDIT_PROMPT =
  'Run a security audit of this project with the security-audit skill. Before you start, recommend a targeted or a full audit with its rough cost, and wait for my yes.'

function fmt(n: number): string {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
  if (n >= 1_000) return `${+(n / 1_000).toFixed(n >= 100_000 ? 0 : 1)}k`
  return `${Math.round(n)}`
}

function moodOf(leftPct: number): Mood {
  if (leftPct > 80) return 'happy'
  if (leftPct > 60) return 'normal'
  if (leftPct > 40) return 'worried'
  return 'devastated'
}

// ---------- data ----------

async function refreshUsage($: EngineInterface): Promise<void> {
  const u = await $.session.usage({ breakdown: 'summary' })
  const b = u.context.breakdown
  const usage: Usage = {
    tokens: u.context.tokens ?? null,
    window: u.context.window,
    percent: u.context.percent ?? null,
    compactAt: b?.isAutoCompactEnabled ? (b.autoCompactThreshold ?? null) : null,
    segments: (b?.categories ?? [])
      .filter(c => c.kind !== 'deferred' && c.tokens > 0)
      .map(c => ({ name: c.name, tokens: c.tokens, kind: c.kind })),
    barMax: b?.rawMaxTokens ?? u.context.window,
  }
  await update($, usageAtom, () => usage)
}

async function refreshRtk($: EngineInterface): Promise<void> {
  const bin = await findRtk($)
  if (!bin) return
  const { exitCode, stdout } = await $.process.run([bin, 'gain', '--format', 'json'], { timeoutMs: 10_000 })
  if (exitCode !== 0) return
  const s = JSON.parse(stdout).summary
  if (!s || typeof s.total_saved !== 'number') return
  let base = await read($, rtkBaseline)
  if (base === null || base > s.total_saved) {
    base = s.total_saved as number
    await update($, rtkBaseline, () => base)
  }
  const rtk: Rtk = {
    total: s.total_saved,
    session: s.total_saved - base,
    avgPct: s.avg_savings_pct ?? 0,
    commands: s.total_commands ?? 0,
  }
  await update($, rtkAtom, () => rtk)
}

const quietly = (p: Promise<unknown>) => p.catch(() => undefined)

// Fetches today's prayer times once per day (and when the city changes).
async function refreshPrayer($: EngineInterface): Promise<void> {
  // TZ overrides the machine's timezone (an IANA name such as Asia/Aden).
  const tz = (await $.env.get('TZ')) || userTimeZone()
  const city = tz ? cityOf(tz) : null
  if (!tz || !city) return
  const { date } = localNow(tz, await $.clock.now())
  const have = await read($, prayerAtom)
  if (have?.date === date && have.timeZone === tz) return
  const { ok, text } = await $.http.fetch(timingsUrl(date, city))
  const timings = ok ? parseTimings(text) : null
  if (timings) await update($, prayerAtom, () => ({ date, timeZone: tz, city, timings }))
}

// ---------- setup (RTK, its hook, the Bash line, Matt Pocock's skills) ----------

async function runQuiet($: EngineInterface, argv: string[], timeoutMs = 60_000) {
  try {
    return await $.process.run(argv, { timeoutMs })
  } catch {
    return null
  }
}

// RTK may be installed but not yet on this process's PATH (winget adds it
// for new processes only), so look where its installers put it too.
let rtkPath: string | null = null

async function findRtk($: EngineInterface): Promise<string | null> {
  if (rtkPath) return rtkPath
  const local = await $.env.get('LOCALAPPDATA')
  const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))
  const candidates = ['rtk']
  if (local) {
    candidates.push(`${local}/Microsoft/WinGet/Links/rtk.exe`)
    try {
      for (const d of await $.fs.list(`${local}/Microsoft/WinGet/Packages`))
        if (d.name.startsWith('rtk-ai.rtk_')) candidates.push(`${local}/Microsoft/WinGet/Packages/${d.name}/rtk.exe`)
    } catch {
      // no winget packages folder
    }
  }
  if (home) candidates.push(`${home}/.local/bin/rtk`, `${home}/.cargo/bin/rtk`)
  candidates.push('/opt/homebrew/bin/rtk', '/usr/local/bin/rtk')
  for (const c of candidates) {
    const r = await runQuiet($, [c, '--version'], 10_000)
    if (r && r.exitCode === 0) return (rtkPath = c)
  }
  return null
}

async function claudeBin($: EngineInterface): Promise<string> {
  return (await $.env.get('CLAUDE_CODE_EXECPATH')) ?? 'claude'
}

async function platform($: EngineInterface): Promise<'windows' | 'mac' | 'linux'> {
  if ((await $.env.get('OS')) === 'Windows_NT') return 'windows'
  const r = await runQuiet($, ['uname', '-s'], 5_000)
  return r?.stdout.trim() === 'Darwin' ? 'mac' : 'linux'
}

async function claudeMdPath($: EngineInterface): Promise<string | null> {
  const dir = await $.env.get('CLAUDE_CONFIG_DIR')
  if (dir) return `${dir}/CLAUDE.md`
  const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))
  return home ? `${home}/.claude/CLAUDE.md` : null
}

async function readTextQuiet($: EngineInterface, path: string): Promise<string | null> {
  try {
    return String(await $.fs.read(path))
  } catch {
    return null
  }
}

// CLAUDE.md plus the files it imports with `@file` lines, as Claude Code reads it.
// shortcut: follows one level of imports (Claude Code follows up to five), upgrade if nested imports show up.
async function claudeMdWithImports($: EngineInterface, path: string): Promise<string | null> {
  const md = await readTextQuiet($, path)
  if (md === null) return null
  const dir = path.replace(/[\\/][^\\/]*$/, '')
  const imports = [...md.matchAll(/^@(\S+)\s*$/gm)].map(m => (/^([a-zA-Z]:)?[\\/]/.test(m[1]!) ? m[1]! : `${dir}/${m[1]}`))
  const texts = await Promise.all(imports.map(f => readTextQuiet($, f)))
  return [md, ...texts].filter(t => t !== null).join('\n')
}

async function checkSetup($: EngineInterface): Promise<SetupStep[]> {
  const missing: SetupStep[] = []
  const rtk = await findRtk($)
  if (!rtk) missing.push('rtk', 'hook')
  else {
    const shown = await runQuiet($, [rtk, 'init', '-g', '--show'])
    if (!shown || !isHooked(shown.stdout)) missing.push('hook')
  }
  const md = await claudeMdPath($)
  if (!hasBashLine(md ? await claudeMdWithImports($, md) : null)) missing.push('bash')
  const list = await runQuiet($, [await claudeBin($), 'plugin', 'list', '--json'])
  if (list && list.exitCode === 0 && !isEnabled(list.stdout, MATT_ID)) missing.push('matt')
  return missing
}

async function setProgress($: EngineInterface, progress: string) {
  await update($, setupAtom, s => (s ? { ...s, progress } : s))
}

async function doStep($: EngineInterface, step: SetupStep): Promise<string> {
  if (step === 'rtk') {
    const os = await platform($)
    const r = await runQuiet($, RTK_INSTALL[os], 600_000)
    rtkPath = null
    return (await findRtk($)) ? '✓ Installed RTK' : `✗ Couldn't install RTK (${r ? (r.stderr || r.stdout).trim().slice(-200) : 'installer not found'}). ${RTK_MANUAL}`
  }
  if (step === 'hook') {
    const rtk = await findRtk($)
    if (!rtk) return '✗ Skipped the RTK hook: RTK is not installed'
    const r = await runQuiet($, [rtk, 'init', '-g', '--auto-patch', '--no-trust-filters'])
    return r && r.exitCode === 0 ? '✓ Hooked RTK into Claude Code' : `✗ \`rtk init -g\` failed: ${(r?.stderr || r?.stdout || '').trim().slice(-200)}`
  }
  if (step === 'bash') {
    const path = await claudeMdPath($)
    if (!path) return '✗ Could not find your home folder for CLAUDE.md'
    const md = (await readTextQuiet($, path)) ?? ''
    if (!hasBashLine(await claudeMdWithImports($, path))) await $.fs.write(path, withBashLine(md))
    return `✓ Added the Bash-only line to ${path}`
  }
  const claude = await claudeBin($)
  const markets = await runQuiet($, [claude, 'plugin', 'marketplace', 'list', '--json'])
  if (!markets || !hasMarketplace(markets.stdout, OFFICIAL_MARKETPLACE)) {
    await runQuiet($, [claude, 'plugin', 'marketplace', 'add', OFFICIAL_MARKETPLACE_URL], 300_000)
  }
  const r = await runQuiet($, [claude, 'plugin', 'install', MATT_ID, '--scope', 'user'], 300_000)
  return r && r.exitCode === 0 ? "✓ Installed Matt Pocock's skills" : `✗ Couldn't install Matt Pocock's skills: ${(r?.stderr || r?.stdout || '').trim().slice(-200)}`
}

// Runs every missing step in order; the band shows progress, then results.
async function runSetup($: EngineInterface): Promise<string[]> {
  const current = await read($, setupAtom)
  if (current?.phase === 'running') return []
  const missing = await checkSetup($)
  await update($, setupAtom, () => ({ missing, phase: 'running' as const, progress: 'checking…', results: [] as string[] }))
  const results: string[] = []
  for (const step of STEP_ORDER.filter(s => missing.includes(s))) {
    await setProgress($, `${STEP_LABEL[step]}…`)
    results.push(await doStep($, step))
  }
  const left = await checkSetup($)
  await update($, setupAtom, () => ({ missing: left, phase: 'done' as const, progress: '', results }))
  void quietly(refreshRtk($))
  $.ui.toast(left.length ? `Setup finished with ${left.length} step(s) left` : 'Setup complete. Restart Claude Code to load everything.')
  return results
}

// ---------- drawing ----------

function gridRects(grid: string[]): string {
  const rects: string[] = []
  grid.forEach((row, y) => {
    let x = 0
    while (x < row.length) {
      const ch = row[x]!
      let end = x + 1
      while (end < row.length && row[end] === ch) end++
      const fill = PALETTE[ch]
      if (ch !== '.' && fill) rects.push(`<rect x="${x}" y="${y}" width="${end - x}" height="1" fill="${fill}"/>`)
      x = end
    }
  })
  return rects.join('')
}

// "Salam" in a 5-row pixel font, for the speech bubble.
const GLYPHS: Record<string, string[]> = {
  S: ['###', '#..', '###', '..#', '###'],
  a: ['...', '.##', '#.#', '#.#', '.##'],
  l: ['#', '#', '#', '#', '#'],
  m: ['.....', '####.', '#.#.#', '#.#.#', '#.#.#'],
}

function pixelText(text: string, x0: number, y0: number, fill: string): { svg: string; width: number } {
  const out: string[] = []
  let x = x0
  for (const ch of text) {
    const g = GLYPHS[ch]
    if (!g) continue
    g.forEach((row, y) => [...row].forEach((c, dx) => c === '#' && out.push(`<rect x="${x + dx}" y="${y0 + y}" width="1" height="1" fill="${fill}"/>`)))
    x += g[0]!.length + 1
  }
  return { svg: out.join(''), width: x - x0 - 1 }
}

// Rows of headroom above him for the bubble.
const HEADROOM = 11
const GREET = '2.6s'

function bubbleSvg(): string {
  const text = pixelText('Salam', 0, 0, '#9b1b1e')
  const w = text.width + 4 // 1px border + 1px padding each side
  const x0 = Math.max(0, Math.floor((WIDTH - w) / 2))
  const ink = '#1a1a1a'
  const parts = [
    // body with clipped corners, then border
    `<rect x="${x0 + 1}" y="1" width="${w - 2}" height="7" fill="#fbf7ee"/>`,
    `<rect x="${x0 + 1}" y="0" width="${w - 2}" height="1" fill="${ink}"/>`,
    `<rect x="${x0 + 1}" y="8" width="${w - 2}" height="1" fill="${ink}"/>`,
    `<rect x="${x0}" y="1" width="1" height="7" fill="${ink}"/>`,
    `<rect x="${x0 + w - 1}" y="1" width="1" height="7" fill="${ink}"/>`,
    // tail pointing down at his head
    `<rect x="${x0 + 8}" y="8" width="3" height="1" fill="#fbf7ee"/>`,
    `<rect x="${x0 + 7}" y="8" width="1" height="2" fill="${ink}"/>`,
    `<rect x="${x0 + 8}" y="9" width="2" height="1" fill="#fbf7ee"/>`,
    `<rect x="${x0 + 10}" y="9" width="1" height="1" fill="${ink}"/>`,
    `<rect x="${x0 + 8}" y="10" width="2" height="1" fill="${ink}"/>`,
    `<g transform="translate(${x0 + 2} 2)">${text.svg}</g>`,
  ]
  return `<g visibility="hidden">${parts.join('')}<set attributeName="visibility" to="visible" begin="hit.click" dur="${GREET}"/><animateTransform attributeName="transform" type="translate" values="0 2;0 0" dur="0.15s" begin="hit.click" fill="freeze"/></g>`
}

// Clicking him (desktop draws the Svg in a script-less frame, where SMIL still
// runs) swaps in the waving pose and pops the bubble for a moment; no state.
function characterSvg(mood: Mood): string {
  const blink =
    mood === 'devastated'
      ? ''
      : EYES.map(
          r =>
            `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${SKIN}" opacity="0"><animate attributeName="opacity" values="0;0;1;0" keyTimes="0;0.93;0.96;1" dur="${mood === 'worried' ? 2.2 : 4.5}s" repeatCount="indefinite"/></rect>`,
        ).join('')
  const bob =
    mood === 'happy'
      ? `<animateTransform attributeName="transform" type="translate" values="0 0;0 -0.5;0 0" dur="1.6s" repeatCount="indefinite"/>`
      : mood === 'worried'
        ? `<animateTransform attributeName="transform" type="translate" values="0 0;0.3 0;0 0;-0.3 0;0 0" dur="0.5s" repeatCount="indefinite"/>`
        : ''
  const rest = `<g>${gridRects(characterGrid(mood, 'rest'))}${blink}<set attributeName="visibility" to="hidden" begin="hit.click" dur="${GREET}"/></g>`
  const wave = `<g visibility="hidden">${gridRects(characterGrid(mood, 'wave'))}<set attributeName="visibility" to="visible" begin="hit.click" dur="${GREET}"/></g>`
  const H = HEIGHT + HEADROOM
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${H}" width="${WIDTH * SCALE}" height="${H * SCALE}" shape-rendering="crispEdges">${bubbleSvg()}<g transform="translate(0 ${HEADROOM})"><g>${bob}${rest}${wave}</g></g><rect id="hit" x="0" y="${HEADROOM}" width="${WIDTH}" height="${HEIGHT}" fill="transparent" pointer-events="all" style="cursor:pointer"><title>Say salam</title></rect></svg>`
}

const swatchSvg = (color: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="10" height="10"><rect width="10" height="10" rx="${RADIUS}" fill="${color}"/></svg>`

function badgeSvg(text: string, fill: string): { source: string; width: number } {
  const width = 9 * text.length + 12
  return {
    width,
    source: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 20" width="${width}" height="20"><rect width="${width}" height="20" rx="${RADIUS}" fill="${fill}"/><text x="${width / 2}" y="14.5" text-anchor="middle" font-family="-apple-system, 'Segoe UI', system-ui, sans-serif" font-size="14" font-weight="600" fill="#1b1b1b">${text}</text></svg>`,
  }
}

const dividerSvg = (height: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 ${height}" width="1" height="${height}"><rect width="1" height="${height}" fill="#888888" fill-opacity="0.5"/></svg>`

function barSvg(usage: Usage): string {
  const W = 1000
  const H = 14
  const total = Math.max(usage.barMax, 1)
  const segs = usage.segments.length
    ? usage.segments
    : [
        { name: 'used', tokens: usage.tokens ?? 0, kind: 'used' as const },
        { name: 'free', tokens: Math.max(usage.window - (usage.tokens ?? 0), 0), kind: 'free' as const },
      ]
  let x = 0
  const parts = segs.map((s, i) => {
    const w = (s.tokens / total) * W
    const rect =
      s.kind === 'buffer'
        ? `<rect x="${x}" y="0" width="${w}" height="${H}" fill="url(#hatch)"/>`
        : `<rect x="${x}" y="0" width="${w}" height="${H}" fill="${colorOf(s, i)}"/>`
    x += w
    return rect
  })
  const marker =
    usage.compactAt !== null
      ? `<rect x="${Math.min((usage.compactAt / total) * W, W - 3)}" y="0" width="3" height="${H}" fill="${ACCENT}"/>`
      : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" preserveAspectRatio="none"><defs><pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="${FREE}"/><rect width="3" height="8" fill="${BUFFER}"/></pattern><clipPath id="c"><rect width="${W}" height="${H}" rx="4"/></clipPath></defs><g clip-path="url(#c)"><rect width="${W}" height="${H}" fill="${FREE}"/>${parts.join('')}${marker}</g></svg>`
}

// Terminal: one Raster of half blocks, two pixel rows per cell.
function characterRaster(mood: Mood): { cells: string; columns: number; rows: number } {
  const grid = characterGrid(mood)
  const rows = Math.ceil(HEIGHT / 2)
  const words = new Uint32Array(WIDTH * rows * 3)
  const DEFAULT = 0x01000000
  const hex = (ch: string | undefined) => {
    const c = ch && ch !== '.' ? PALETTE[ch] : undefined
    return c ? parseInt(c.slice(1), 16) : DEFAULT
  }
  for (let r = 0; r < rows; r++) {
    for (let x = 0; x < WIDTH; x++) {
      const i = (r * WIDTH + x) * 3
      words[i] = 0x2580 // ▀
      words[i + 1] = hex(grid[r * 2]?.[x])
      words[i + 2] = hex(grid[r * 2 + 1]?.[x])
    }
  }
  return { cells: toBase64(new Uint8Array(words.buffer)), columns: WIDTH, rows }
}

function toBase64(bytes: Uint8Array): string {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!, b = bytes[i + 1], c = bytes[i + 2]
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0)
    out += A[(n >> 18) & 63]! + A[(n >> 12) & 63]! + (b === undefined ? '=' : A[(n >> 6) & 63]!) + (c === undefined ? '=' : A[n & 63]!)
  }
  return out
}

function textBar(usage: Usage, width: number): { color: string; text: string }[] {
  const total = Math.max(usage.barMax, 1)
  const segs = usage.segments.length
    ? usage.segments
    : [{ name: 'used', tokens: usage.tokens ?? 0, kind: 'used' as const }]
  const out: { color: string; text: string }[] = []
  let used = 0
  segs.forEach((s, i) => {
    if (s.kind === 'free') return
    const n = Math.max(1, Math.round((s.tokens / total) * width))
    if (used + n > width) return
    used += n
    out.push({ color: colorOf(s, i), text: (s.kind === 'buffer' ? '▒' : '█').repeat(n) })
  })
  if (used < width) out.push({ color: FREE, text: '░'.repeat(width - used) })
  return out
}

// ---------- hooks ----------


export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await $.command.register({
      name: SETUP_COMMAND,
      description: "Set up RTK, its hook, the Bash-only CLAUDE.md line and Matt Pocock's skills",
    })
    void quietly(refreshPrayer($))
    // Keeps the prayer countdown current and picks up a new day's times.
    try {
      $.clock.every(60_000, () => {
        $.ui.invalidate('ui.render')
        void quietly(refreshPrayer($))
      })
    } catch {
      // no timer here: the countdown updates with each redraw instead
    }
    void quietly(
      (async () => {
        const missing = await checkSetup($)
        const prev = await read($, setupAtom)
        if (prev?.phase === 'running') return
        await update($, setupAtom, () => ({ missing, phase: (missing.length ? 'idle' : 'hidden') as Setup['phase'], progress: '', results: [] }))
        await refreshRtk($)
      })(),
    )
    return result
  })

  on('command.run', { command: SETUP_COMMAND }, async $ => {
    const results = await runSetup($)
    const left = (await read($, setupAtom))?.missing ?? []
    return {
      text: results.length
        ? [...results, '', left.length ? `Still to do: ${missingSummary(left)}.` : 'All set. Restart Claude Code to load RTK\'s hook and Matt Pocock\'s skills.'].join('\n')
        : 'Everything is already set up.',
    }
  })

  // The band pops up once the first prompt of the session is sent.
  on('prompt.submit', async ($, e, next) => {
    await update($, isShown, () => true)
    void quietly(refreshRtk($))
    return next(e)
  }).catch(($, e, next) => next(e)) // never hold a prompt back over the band

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('context')) await quietly(refreshUsage($))
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    void quietly(refreshRtk($))
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const setup = await read($, setupAtom)
    const shown = await read($, isShown)
    const needsSetup = !!setup && (setup.phase === 'running' || setup.phase === 'done' || (setup.phase === 'idle' && setup.missing.length > 0))
    if (!shown && !needsSetup) return next(e)

    // The first-run setup row: shown until setup is done or put off.
    const ui = $.ui.resolve(e)
    const hide = () => update($, setupAtom, s => (s ? { ...s, phase: 'hidden' as const } : s))
    const setupRow = !needsSetup || !setup ? null : setup.phase === 'running' ? (
      <ui.Box key="setup" flexDirection="row" gap={1} borderStyle="round" borderColor={ACCENT} paddingX={1}>
        <ui.Text color={ACCENT} bold>Setting up</ui.Text>
        <ui.Text dimColor>{setup.progress}</ui.Text>
      </ui.Box>
    ) : setup.phase === 'done' ? (
      <ui.Box key="setup" flexDirection="column" borderStyle="round" borderColor={setup.missing.length ? '#f2c14e' : RTK} paddingX={1}>
        {setup.results.map(r => (
          <ui.Text>{r}</ui.Text>
        ))}
        <ui.Box flexDirection="row" gap={1} alignItems="center">
          <ui.Text dimColor>
            {setup.missing.length
              ? `Still to do: ${missingSummary(setup.missing)}.`
              : "Restart Claude Code to load RTK's hook and Matt Pocock's skills."}
          </ui.Text>
          {setup.missing.length ? <ui.Button key="retry" label="Try again" onPress={() => void runSetup($)} /> : null}
          <ui.Button key="ok" label="OK" onPress={() => void hide()} />
        </ui.Box>
      </ui.Box>
    ) : (
      <ui.Box key="setup" flexDirection="row" gap={1} alignItems="center" flexWrap="wrap" borderStyle="round" borderColor={ACCENT} paddingX={1}>
        <ui.Text color={ACCENT} bold>Finish setup:</ui.Text>
        <ui.Text dimColor>{`${missingSummary(setup.missing)}.`}</ui.Text>
        <ui.Button key="setup-run" variant="primary" label="Finish setup" onPress={() => void runSetup($)} />
        <ui.Button key="setup-later" label="Later" onPress={() => void hide()} />
      </ui.Box>
    )
    // Other mods share this slot: draw theirs below ours instead of replacing it.
    // next(e) rejects only when nothing answers beneath (the test harness).
    const below = await next(e).catch(() => undefined)
    const withSetup = (band: RenderElement | null) =>
      setupRow || below || !band ? (
        <ui.Box flexDirection="column" gap={1}>
          {setupRow}
          {band}
          {below}
        </ui.Box>
      ) : (
        band
      )
    if (!shown) return setupRow ? withSetup(null) : (below ?? <ui.Box />)

    // Toggles savvy-flow's agents panel (bare /agents-info opens or closes it); drawn only where savvy-progress serves it.
    const commands = await $.command.list().catch(() => [])
    const hasAgentsInfo = commands.some(c => c.name === 'agents-info')
    const ultracave = commands.find(c => c.name === 'ultracave' || c.name.endsWith(':ultracave'))?.name
    const agentsButton = hasAgentsInfo ? (
      <ui.Button
        key="agents"
        label="Agents"
        onPress={() => void $.command.run({ command: 'agents-info' }).catch(() => $.ui.toast('Agents panel needs savvy-flow'))}
      />
    ) : null

    // The audits start a turn whose prompt asks before anything big; Ultracave runs the caveman skill.
    const actionButtons = (
      <ui.Box flexDirection="row" gap={1}>
        <ui.Button key="auk-audit" label="AUK design audit" onPress={() => void $.prompt.submit({ text: AUK_AUDIT_PROMPT })} />
        <ui.Button key="security-audit" label="Security audit" onPress={() => void $.prompt.submit({ text: SECURITY_AUDIT_PROMPT })} />
        {ultracave ? <ui.Button key="ultracave" label="Ultracave" onPress={() => void $.command.run({ command: ultracave })} /> : null}
        {agentsButton}
      </ui.Box>
    )

    const usage = await read($, usageAtom)
    const rtk = await read($, rtkAtom)
    const pct = usage?.percent ?? 0
    const left = 100 - pct
    const mood = moodOf(left)
    const window = usage?.window ?? 0

    const legend = (usage?.segments ?? [])
      .map((s, i) => ({ s, color: colorOf(s, i) }))
      .filter(({ s }) => s.kind !== 'buffer')

    const headline = usage
      ? `${usage.tokens !== null ? fmt(usage.tokens) : '–'} of ${fmt(window)}${usage.compactAt !== null ? ` · compacts at ${fmt(usage.compactAt)}` : ''}`
      : 'measuring after the first reply…'

    const rtkTotal = rtk ? fmt(rtk.total) : '–'

    const prayer = await read($, prayerAtom)
    const upcoming = prayer ? nextPrayer(prayer.timings, localNow(prayer.timeZone, await $.clock.now()).minutes) : null
    const prayerText = upcoming ? `🕌 ${upcoming.name} ${upcoming.time} · in ${countdown(upcoming.inMinutes)}` : null

    if (e.surface === 'terminal') {
      const { Box, Text, Raster } = $.ui.resolve(e)
      const art = characterRaster(mood)
      const barWidth = Math.max(10, e.props.bodyColumns - WIDTH - 10)
      return withSetup(
        <Box flexDirection="row" alignItems="stretch" gap={1} borderStyle="round" borderDimColor paddingX={1}>
          <Box flexDirection="column" flexGrow={1} flexShrink={1}>
            <Box flexDirection="row" gap={2}>
              <Text color={ACCENT} bold>◆ Context</Text>
              <Text color={RTK} bold>{`⚡ RTK ${rtkTotal}`}</Text>
              {prayerText ? <Text color={GOLD} bold>{prayerText}</Text> : null}
              <Text dimColor>{headline}</Text>
              <Text bold color={ACCENT}>{`[${Math.round(pct)}%]`}</Text>
            </Box>
            <Box flexDirection="row">
              {usage ? textBar(usage, barWidth).map(p => <Text color={p.color}>{p.text}</Text>) : <Text dimColor>…</Text>}
            </Box>
            <Box flexDirection="row" flexWrap="wrap">
              {legend.map(({ s, color }) => (
                <Box flexDirection="row" gap={1} width="20%">
                  <Text color={color}>■</Text>
                  <Text dimColor>{`${legendLabel(s.name)} ${fmt(s.tokens)}`}</Text>
                </Box>
              ))}
            </Box>
            {actionButtons}
          </Box>
          <Text dimColor>{Array(art.rows).fill('│').join('\n')}</Text>
          <Box flexDirection="column" alignItems="center" justifyContent="flex-end">
            <Raster key="yemeni" columns={art.columns} rows={art.rows} cells={art.cells} />
          </Box>
        </Box>,
      )
    }

    const table = $.ui.resolve(e)
    const { Box, Text } = table
    const Svg = 'Svg' in table ? table.Svg : undefined
    const badge = badgeSvg(`${Math.round(pct)}%`, left > 40 ? '#9be3a0' : left > 30 ? '#f2c14e' : '#f07a6a')

    // One framed card: the context details on the left, a divider, then the
    // companion. Every header item shares one size and weight; corners and the
    // hairline divider are SVG because Box and Text have no radius.
    return withSetup(
      <Box flexDirection="row" alignItems="stretch" gap={2} borderStyle="round" borderDimColor paddingX={1}>
        <Box flexDirection="column" flexGrow={1} flexShrink={1} gap={1}>
          <Box flexDirection="row" justifyContent="space-between" alignItems="center">
            <Box flexDirection="row" gap={2} alignItems="center">
              <Text size="body" weight="semibold" color={ACCENT}>◆ Context</Text>
              <Text size="body" weight="semibold" color={RTK}>{`⚡ RTK ${rtkTotal}`}</Text>
              {prayerText ? <Text size="body" weight="semibold" color={GOLD}>{prayerText}</Text> : null}
            </Box>
            <Box flexDirection="row" gap={1} alignItems="center">
              <Text size="body" weight="semibold" dimColor>{headline}</Text>
              {Svg ? (
                <Svg source={badge.source} alt={`${Math.round(pct)}% used`} width={badge.width} height={20} />
              ) : (
                <Text size="body" weight="semibold">{` ${Math.round(pct)}% `}</Text>
              )}
            </Box>
          </Box>
          {Svg && usage ? <Svg source={barSvg(usage)} alt={`Context ${Math.round(pct)}% used`} /> : null}
          <Box flexDirection="row" flexWrap="wrap">
            {legend.map(({ s, color }) => (
              <Box flexDirection="row" gap={1} width="20%">
                {Svg ? <Svg source={swatchSvg(color)} alt="" width={10} height={10} /> : <Text size="footnote" color={color}>■</Text>}
                <Text size="footnote" dimColor>{legendLabel(s.name)}</Text>
                <Text size="footnote" weight="medium">{fmt(s.tokens)}</Text>
              </Box>
            ))}
          </Box>
          {actionButtons}
        </Box>
        {Svg ? <Svg source={dividerSvg((HEIGHT + HEADROOM) * SCALE)} alt="" width={1} height={(HEIGHT + HEADROOM) * SCALE} /> : null}
        <Box flexDirection="column" alignItems="center" justifyContent="flex-end">
          {Svg ? (
            <Svg
              source={characterSvg(mood)}
              alt={`Pixel Yemeni companion, ${mood}`}
              width={WIDTH * SCALE}
              height={(HEIGHT + HEADROOM) * SCALE}
              isInteractive
            />
          ) : null}
        </Box>
      </Box>,
    )
  })
}
