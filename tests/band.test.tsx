import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, SessionUsage } from 'claude-code'

declare const setTimeout: (fn: () => void, ms: number) => unknown

const PLUGIN = 'yemeni-context-band'

function usage(percent: number): SessionUsage {
  const window = 1_000_000
  const tokens = (window * percent) / 100
  return {
    startedAt: 0,
    rateLimits: [],
    context: {
      tokens,
      window,
      percent,
      breakdown: {
        categories: [
          { name: 'System prompt', tokens: 4_200, color: 'promptBorder', isDeferred: false, kind: 'used' },
          { name: 'MCP server instructions', tokens: 1_000, color: 'permission', isDeferred: false, kind: 'used' },
          { name: 'Custom agents', tokens: 900, color: 'permission', isDeferred: false, kind: 'used' },
          { name: 'Messages', tokens: tokens - 4_200, color: 'permission', isDeferred: false, kind: 'used' },
          { name: 'Free space', tokens: window - tokens, color: 'inactive', isDeferred: false, kind: 'free' },
        ],
        totalTokens: tokens,
        maxTokens: window,
        rawMaxTokens: window,
        autocompactSource: 'model-default',
        percentage: percent,
        gridRows: [],
        model: 'test',
        memoryFiles: [],
        mcpTools: [],
        agents: [],
        isAutoCompactEnabled: true,
        autoCompactThreshold: 987_000,
        apiUsage: null,
      },
    },
  }
}

const RTK = JSON.stringify({ summary: { total_commands: 164, total_saved: 20_537, avg_savings_pct: 48.05 } })

function engineBottom(on: On, percent: () => number, prompts: string[] = []) {
  on('session.usage', () => ({ value: usage(percent()) }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: RTK, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('prompt.submit', ($, e) => {
    if (e.origin.kind === 'plugin') prompts.push(e.text)
    return { text: e.text }
  })
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('env.get', () => ({ value: undefined }))
  on('fs.list', () => ({ deny: 'none' }))
  on('ui.render', ($, e) => { const { Text } = $.ui.resolve(e); return <Text>engine</Text> })
}

const BAND = {
  plugin: PLUGIN,
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 120 } as never,
} as const

async function measure($: Engine, percent: number) {
  const u = usage(percent)
  await $.session.measure({ context: { tokens: u.context.tokens, window: u.context.window, percent }, rateLimits: [], changed: ['context'] })
}

test('band stays hidden until the first prompt, then shows context and RTK', async ($, on) => {
  let pct = 9
  engineBottom(on, () => pct)

  const before = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await before.find({ type: 'Text', text: /Context/ })).toBeUndefined()
  await before.unmount()

  await $.prompt.submit({ text: 'hi', wait: false, origin: { kind: 'user' } } as never)
  await measure($, pct)
  // RTK's numbers load in the background after the prompt
  for (let i = 0; i < 50; i++) {
    const probe = await $.ui.mount({ ...BAND, surface: 'desktop' })
    const done = await probe.find({ type: 'Text', text: /RTK 20/ })
    await probe.unmount()
    if (done) break
    await new Promise<void>(r => setTimeout(() => r(), 10))
  }

  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Text', text: /Context/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /90k of 1M · compacts at 987k/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /⚡ RTK 20.5k/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /this session|% avg|% left/ })).toBeUndefined()
    await ui.unmount()
  }
})

test('mood follows context left', async ($, on) => {
  let pct = 30
  engineBottom(on, () => pct)
  await $.prompt.submit({ text: 'hi', wait: false, origin: { kind: 'user' } } as never)

  const cases: [number, string][] = [
    [30, 'normal'],
    [50, 'worried'],
    [65, 'devastated'],
    [85, 'devastated'],
  ]
  for (const [p, label] of cases) {
    pct = p
    await measure($, p)
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    const svgs = await ui.findAll({ type: 'Svg' })
    expect(svgs.some(el => String(el.props.alt).endsWith(label))).toBe(true)
    await ui.unmount()
  }
})

test('the Agents button under the companion toggles /agents-info, only when savvy-flow is there', async ($, on) => {
  engineBottom(on, () => 9)
  let hasSavvy = false
  const ran: string[] = []
  on('command.list', () => ({ value: hasSavvy ? [{ name: 'agents-info', description: '', source: 'plugin' }] : [] }) as never)
  on('command.run', ($, e) => {
    ran.push(`${e.command} ${e.args}`)
    return { text: 'opened' }
  })
  await $.prompt.submit({ text: 'hi', wait: false, origin: { kind: 'user' } } as never)
  await measure($, 9)

  const without = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await without.find({ key: 'agents' })).toBeUndefined()
  await without.unmount()

  hasSavvy = true
  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    await ui.press({ key: 'agents' })
    await ui.unmount()
  }
  expect(ran).toEqual(['agents-info ', 'agents-info '])
})

test('legend shortens long names, and the audit buttons start their prompts', async ($, on) => {
  const prompts: string[] = []
  engineBottom(on, () => 9, prompts)
  await $.prompt.submit({ text: 'hi', wait: false, origin: { kind: 'user' } } as never)
  await measure($, 9)

  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Text', text: /mcp ins\./ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /mcp server instructions/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /^agents( 900)?$/ })).toBeDefined()
    await ui.press({ key: 'auk-audit' })
    await ui.press({ key: 'security-audit' })
    await ui.unmount()
  }
  expect(prompts).toHaveLength(4)
  expect(prompts[0]).toContain('auk-design-auditor')
  expect(prompts[1]).toContain('security-audit skill')
})

test('header shows the next prayer; legend says agents; Ultracave runs the caveman skill', async ($, on) => {
  const ran: string[] = []
  const fetched: string[] = []
  on('session.usage', () => ({ value: usage(9) }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: RTK, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('env.get', ($, e) => ({ value: e.name === 'TZ' ? 'Asia/Aden' : undefined }))
  on('fs.list', () => ({ deny: 'none' }))
  on('fs.read', () => ({ deny: 'none' }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('clock.every', () => ({ value: undefined }))
  on('clock.now', () => ({ value: Date.UTC(2026, 10, 21, 9, 0) }))
  on('command.register', ($, e) => ({ value: e }) as never)
  on('command.list', () => ({ value: [{ name: 'caveman:ultracave', description: '', source: 'plugin' }] }) as never)
  on('command.run', ($, e) => {
    ran.push(e.command)
    return { text: 'ok' }
  })
  on('http.fetch', ($, e) => {
    fetched.push(e.url)
    const timings = { Fajr: '00:01', Dhuhr: '23:57', Asr: '23:58', Maghrib: '23:59', Isha: '23:59' }
    return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify({ data: { timings } }) } } as never
  })
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })

  await $.session.start({ cwd: 'C:/work', source: 'startup' } as never)
  await $.prompt.submit({ text: 'hi', wait: false, origin: { kind: 'user' } } as never)
  await measure($, 9)
  for (let i = 0; i < 50 && !fetched.length; i++) await new Promise<void>(r => setTimeout(() => r(), 10))
  expect(fetched[0]).toContain('address=Aden&method=4')

  for (const surface of ['desktop', 'terminal'] as const) {
    let ui = await $.ui.mount({ ...BAND, surface })
    for (let i = 0; i < 50 && !(await ui.find({ type: 'Text', text: /🕌/ })); i++) {
      await ui.unmount()
      await new Promise<void>(r => setTimeout(() => r(), 10))
      ui = await $.ui.mount({ ...BAND, surface })
    }
    expect(await ui.find({ type: 'Text', text: /🕌 (Fajr|Dhuhr|Asr|Maghrib|Isha) \d\d:\d\d · in / })).toBeDefined()
    await ui.press({ key: 'ultracave' })
    await ui.unmount()
  }
  expect(ran).toEqual(['caveman:ultracave', 'caveman:ultracave'])
})

test('a minute before Dhuhr the chibi calls Salah and the time turns into a gold chip', async ($, on) => {
  on('session.usage', () => ({ value: usage(9) }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: RTK, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('env.get', ($, e) => ({ value: e.name === 'TZ' ? 'Asia/Aden' : undefined }))
  on('fs.list', () => ({ deny: 'none' }))
  on('fs.read', () => ({ deny: 'none' }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('clock.every', () => ({ value: undefined }))
  on('clock.now', () => ({ value: Date.UTC(2026, 10, 21, 9, 0) })) // 12:00 in Aden
  on('command.register', ($, e) => ({ value: e }) as never)
  on('command.list', () => ({ value: [] }) as never)
  on('http.fetch', () => {
    const timings = { Fajr: '04:50', Dhuhr: '12:01', Asr: '15:12', Maghrib: '17:35', Isha: '19:05' }
    return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify({ data: { timings } }) } } as never
  })
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })

  await $.session.start({ cwd: 'C:/work', source: 'startup' } as never)
  await $.prompt.submit({ text: 'hi', wait: false, origin: { kind: 'user' } } as never)
  await measure($, 9)

  let ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const calling = async () => (await ui.findAll({ type: 'Svg' })).some(el => /calling Salah for Dhuhr/.test(String(el.props.alt)))
  for (let i = 0; i < 50 && !(await calling()); i++) {
    await ui.unmount()
    await new Promise<void>(r => setTimeout(() => r(), 10))
    ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  }
  expect(await calling()).toBe(true)
  const svgs = await ui.findAll({ type: 'Svg' })
  expect(svgs.some(el => el.props.alt === '🕌 Dhuhr 12:01 · in 1m')).toBe(true)
  expect(svgs.find(el => /calling Salah/.test(String(el.props.alt)))?.props.width).toBe(108)
  expect(svgs.some(el => /Salah/.test(String(el.props.source)) || /animate/.test(String(el.props.source)))).toBe(true)
  await ui.unmount()
})
