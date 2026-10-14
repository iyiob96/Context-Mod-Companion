import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const PLUGIN = 'yemeni-context-band'
const out = (exitCode: number, stdout = '') => ({ exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false })
const HOOKED = '[ok] Hook: rtk hook claude\n[ok] settings.json: RTK hook configured'
const BASH = 'Use the Bash tool for shell commands (git, npm, builds, tests, linters, docker) so RTK can compress their output.'

type Machine = { hasRtk: boolean; hooked: boolean; claudeMd: string; hasMatt: boolean; ran: string[] }

// A fake machine beneath the plugin: processes, env and files.
function machine(on: On, m: Machine) {
  on('process.run', ($, e) => {
    const cmd = e.argv.join(' ')
    m.ran.push(cmd)
    if (cmd.startsWith('winget install')) {
      m.hasRtk = true
      return { value: out(0) }
    }
    if (cmd === 'rtk --version') return { value: m.hasRtk ? out(0, 'rtk 0.50.0') : out(1) }
    if (cmd.startsWith('rtk')) {
      if (!m.hasRtk) return { value: out(1) }
      if (cmd === 'rtk init -g --show') return { value: out(0, m.hooked ? HOOKED : '[--] Hook') }
      if (cmd.startsWith('rtk init -g --auto-patch')) {
        m.hooked = true
        return { value: out(0) }
      }
      if (cmd.startsWith('rtk gain')) return { value: out(0, JSON.stringify({ summary: { total_saved: 1, total_commands: 1, avg_savings_pct: 1 } })) }
    }
    if (cmd === 'claude.exe plugin list --json') return { value: out(0, JSON.stringify(m.hasMatt ? [{ id: 'mattpocock-skills@claude-plugins-official', enabled: true }] : [])) }
    if (cmd === 'claude.exe plugin marketplace list --json') return { value: out(0, '[]') }
    if (cmd.startsWith('claude.exe plugin marketplace add')) return { value: out(0) }
    if (cmd.startsWith('claude.exe plugin install mattpocock-skills')) {
      m.hasMatt = true
      return { value: out(0) }
    }
    return { value: out(1) }
  })
  on('env.get', ($, e) => {
    const env: Record<string, string> = { OS: 'Windows_NT', USERPROFILE: 'C:/Users/me', CLAUDE_CODE_EXECPATH: 'claude.exe' }
    return { value: env[e.name] }
  })
  on('fs.read', () => ({ value: m.claudeMd }))
  on('fs.write', ($, e) => {
    m.claudeMd = e.text
    return { value: undefined }
  })
  on('fs.list', () => ({ deny: 'none' }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: e } as never))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
}

const BAND = {
  plugin: PLUGIN,
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 120 } as never,
} as const

async function start($: Engine) {
  await $.session.start({ cwd: 'C:/work', source: 'startup' } as never)
}

test('a fresh machine gets a Finish setup button that sets everything up', async ($, on) => {
  const m: Machine = { hasRtk: false, hooked: false, claudeMd: '# mine\n', hasMatt: false, ran: [] }
  machine(on, m)
  await start($)

  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Text', text: /install RTK, hook RTK into Claude Code, add a Bash-only line to your CLAUDE\.md, install Matt Pocock's skills/ })).toBeDefined()
    await ui.unmount()
  }

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.press({ key: 'setup-run' })
  expect(m.hasRtk && m.hooked && m.hasMatt).toBe(true)
  expect(m.claudeMd).toContain(`# mine\n\n${BASH}`)
  expect(m.ran.some(c => c.startsWith('claude.exe plugin marketplace add https://github.com/anthropics/claude-plugins-official.git'))).toBe(true)
  expect(await ui.find({ type: 'Text', text: /Restart Claude Code/ })).toBeDefined()
  await ui.press({ key: 'ok' })
  expect(await ui.find({ type: 'Text', text: /Finish setup|Restart Claude Code/ })).toBeUndefined()
  await ui.unmount()
})

test('a machine that is already set up shows no setup row', async ($, on) => {
  const m: Machine = { hasRtk: true, hooked: true, claudeMd: BASH, hasMatt: true, ran: [] }
  machine(on, m)
  await start($)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /Finish setup/ })).toBeUndefined()
  expect(m.ran.some(c => c.startsWith('winget') || c.includes('install'))).toBe(false)
  await ui.unmount()
})

test('/companion-setup only does what is missing', async ($, on) => {
  const m: Machine = { hasRtk: true, hooked: true, claudeMd: '', hasMatt: true, ran: [] }
  machine(on, m)
  const result = (await $.command.run({ command: 'companion-setup', args: '' } as never)) as { text?: string }
  expect(String(result.text)).toContain('Added the Bash-only line')
  expect(m.ran.some(c => c.startsWith('winget') || c.includes('plugin install'))).toBe(false)
})
