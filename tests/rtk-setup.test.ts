import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const ok = (stdout: string) => ({ exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false })
const fail = { exitCode: 1, stdout: '', stderr: 'not found', isStdoutTruncated: false, isStderrTruncated: false }
const HOOKED = '[ok] Hook: rtk hook claude\n[ok] settings.json: RTK hook configured'

function bottom(on: On, opts: { hasRtk: boolean; claudeMd: string | null; writes: string[] }) {
  on('process.run', ($, e) => {
    if (!opts.hasRtk) return { value: fail }
    const args = e.argv.join(' ')
    if (args === 'rtk --version') return { value: ok('rtk 0.50.0\n') }
    if (args === 'rtk init -g --show') return { value: ok(HOOKED) }
    return { value: ok(JSON.stringify({ summary: { total_saved: 1, avg_savings_pct: 1, total_commands: 1 } })) }
  })
  on('env.get', ($, e) => ({ value: e.name === 'USERPROFILE' ? 'C:/Users/me' : undefined }))
  on('fs.read', () => (opts.claudeMd === null ? { deny: 'missing' } : { value: opts.claudeMd }))
  on('fs.write', ($, e) => {
    opts.writes.push(e.text)
    return { value: undefined }
  })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: e } as never))
}

async function runSetup($: Engine, args = '') {
  const result = await $.command.run({ command: 'rtk-setup', args } as never)
  return String((result as { text?: string }).text)
}

test('without RTK it gives install steps', async ($, on) => {
  bottom(on, { hasRtk: false, claudeMd: null, writes: [] })
  const text = await runSetup($)
  expect(text).toContain('winget install rtk-ai.rtk')
  expect(text).toContain('brew install rtk')
})

test('with RTK hooked it offers, then adds, the Bash line once', async ($, on) => {
  const writes: string[] = []
  const opts = { hasRtk: true, claudeMd: '# mine\n' as string | null, writes }
  bottom(on, opts)

  const text = await runSetup($)
  expect(text).toContain('already hooked')
  expect(text).toContain('/rtk-setup bash')

  expect(await runSetup($, 'bash')).toContain('Added the Bash line')
  expect(writes[0]).toContain('# mine\n\nUse the Bash tool')

  opts.claudeMd = writes[0]!
  expect(await runSetup($, 'bash')).toContain('Nothing changed')
  expect(writes).toHaveLength(1)
})
