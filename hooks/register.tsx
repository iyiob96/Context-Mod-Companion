import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Rtk, Segment, Usage } from '../types'
import { characterGrid, EYES, HEIGHT, PALETTE, SKIN, WIDTH } from './character'
import type { Mood } from './character'
import { hasBashLine, INSTALL_TEXT, isHooked, RTK_COMMAND, setupReport, withBashLine } from './rtk-setup'

const isShown = atom({ plugin: 'yemeni-context-band', key: 'isShown' } as const, false)
const usageAtom = atom({ plugin: 'yemeni-context-band', key: 'usage' } as const, null)
const rtkAtom = atom({ plugin: 'yemeni-context-band', key: 'rtk' } as const, null)
const rtkBaseline = atom({ plugin: 'yemeni-context-band', key: 'rtkBaseline' } as const, null)

const ACCENT = '#e0875a'
const RTK = '#7ccf8a'
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
  const { exitCode, stdout } = await $.process.run(['rtk', 'gain', '--format', 'json'], { timeoutMs: 10_000 })
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

// ---------- /rtk-setup ----------

async function runQuiet($: EngineInterface, argv: string[]) {
  try {
    return await $.process.run(argv, { timeoutMs: 60_000 })
  } catch {
    return null
  }
}

async function rtkVersion($: EngineInterface): Promise<string | null> {
  const r = await runQuiet($, ['rtk', '--version'])
  return r && r.exitCode === 0 ? r.stdout.trim() : null
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

async function rtkSetup($: EngineInterface): Promise<string> {
  const version = await rtkVersion($)
  if (!version) return INSTALL_TEXT
  const shown = await runQuiet($, ['rtk', 'init', '-g', '--show'])
  const wasHooked = !!shown && isHooked(shown.stdout)
  let init: { ok: boolean; output: string } | null = null
  if (!wasHooked) {
    const r = await runQuiet($, ['rtk', 'init', '-g', '--auto-patch', '--no-trust-filters'])
    init = { ok: !!r && r.exitCode === 0, output: r ? r.stderr || r.stdout : 'could not start rtk' }
  }
  const path = await claudeMdPath($)
  const md = path ? await readTextQuiet($, path) : null
  return setupReport({ version, wasHooked, init, claudeMd: path ?? '~/.claude/CLAUDE.md', hasBash: hasBashLine(md) })
}

async function addBashLine($: EngineInterface): Promise<string> {
  const path = await claudeMdPath($)
  if (!path) return 'Could not find your home folder. Add the Bash line to ~/.claude/CLAUDE.md yourself (see /rtk-setup).'
  const md = (await readTextQuiet($, path)) ?? ''
  if (hasBashLine(md)) return `✓ \`${path}\` already has the Bash line. Nothing changed.`
  await $.fs.write(path, withBashLine(md))
  return `✓ Added the Bash line to \`${path}\`. It applies from your next session.`
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
      name: RTK_COMMAND,
      description: 'Install and hook RTK into Claude Code (token savings for the context band)',
      argumentHint: '[bash]',
    })
    if (!(await rtkVersion($))) $.ui.toast('Context companion: RTK not found. Run /rtk-setup to set it up.')
    void quietly(refreshRtk($))
    return result
  })

  on('command.run', { command: RTK_COMMAND }, async ($, e) => ({
    text: e.args.trim().toLowerCase() === 'bash' ? await addBashLine($) : await rtkSetup($),
  }))

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
    if (e.props.hasSurvey || !(await read($, isShown))) return next(e)

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

    if (e.surface === 'terminal') {
      const { Box, Text, Raster } = $.ui.resolve(e)
      const art = characterRaster(mood)
      const barWidth = Math.max(10, e.props.bodyColumns - WIDTH - 8)
      return (
        <Box flexDirection="row" alignItems="flex-end" gap={2}>
          <Box flexDirection="column" flexGrow={1} borderStyle="round" borderDimColor paddingX={1}>
            <Box flexDirection="row" justifyContent="space-between">
              <Box flexDirection="row" gap={1}>
                <Text color={ACCENT} bold>◆ context</Text>
                <Text dimColor>{headline}</Text>
                <Text bold color={ACCENT}>{`[${Math.round(pct)}%]`}</Text>
              </Box>
              <Text color={RTK} bold>{`⚡ RTK ${rtkTotal}`}</Text>
            </Box>
            <Box flexDirection="row">
              {usage ? textBar(usage, barWidth).map(p => <Text color={p.color}>{p.text}</Text>) : <Text dimColor>…</Text>}
            </Box>
            <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
              {legend.map(({ s, color }) => (
                <Box flexDirection="row" gap={1}>
                  <Text color={color}>■</Text>
                  <Text dimColor>{`${s.name.toLowerCase()} ${fmt(s.tokens)}`}</Text>
                </Box>
              ))}
            </Box>
          </Box>
          <Raster key="yemeni" columns={art.columns} rows={art.rows} cells={art.cells} />
        </Box>
      )
    }

    const table = $.ui.resolve(e)
    const { Box, Text } = table
    const Svg = 'Svg' in table ? table.Svg : undefined

    // Layout A: the band is a framed card; he stands on his own to its right,
    // feet level with the band's bottom edge, right above the prompt.
    return (
      <Box flexDirection="row" alignItems="flex-end" gap={2}>
        <Box flexDirection="row" alignItems="center" gap={2} flexGrow={1} flexShrink={1} borderStyle="round" borderDimColor paddingX={1}>
          <Box flexDirection="column" flexGrow={1} flexShrink={1} gap={1}>
            <Box flexDirection="row" justifyContent="space-between" alignItems="center">
              <Text color={ACCENT} bold>◆ context</Text>
              <Box flexDirection="row" gap={1} alignItems="center">
                <Text dimColor>{headline}</Text>
                <Text bold color="#1b1b1b" backgroundColor={left > 40 ? '#9be3a0' : left > 30 ? '#f2c14e' : '#f07a6a'}>
                  {` ${Math.round(pct)}% `}
                </Text>
              </Box>
            </Box>
            {Svg && usage ? <Svg source={barSvg(usage)} alt={`Context ${Math.round(pct)}% used`} /> : null}
            <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
              {legend.map(({ s, color }) => (
                <Box flexDirection="row" gap={1}>
                  <Text color={color}>■</Text>
                  <Text dimColor>{s.name.toLowerCase()}</Text>
                  <Text bold>{fmt(s.tokens)}</Text>
                </Box>
              ))}
            </Box>
          </Box>
          <Text bold color={RTK}>{`⚡ RTK ${rtkTotal}`}</Text>
        </Box>
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
    )
  })
}
