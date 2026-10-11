import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, SessionUsage } from 'claude-code'

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

function engineBottom(on: On, percent: () => number) {
  on('session.usage', () => ({ value: usage(percent()) }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: RTK, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('session.measure', ($, e) => ({ changed: e.changed }))
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
  expect(await before.find({ type: 'Text', text: /context/ })).toBeUndefined()
  await before.unmount()

  await $.prompt.submit({ text: 'hi', wait: false, origin: { kind: 'user' } } as never)
  await measure($, pct)

  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Text', text: /context/ })).toBeDefined()
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
