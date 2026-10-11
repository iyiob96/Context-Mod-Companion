// RTK (https://github.com/rtk-ai/rtk) is a separate program; this plugin never
// bundles it. /rtk-setup checks for it, hooks it into Claude Code with
// `rtk init -g`, and offers the CLAUDE.md line that keeps Claude on Bash.
// The engine calls live in register.tsx; this file holds the words and the
// plain logic.

export const RTK_COMMAND = 'rtk-setup'

export const BASH_LINE =
  'Use the Bash tool for shell commands (git, npm, builds, tests, linters, docker) so RTK can compress their output. Only use PowerShell for Windows-specific tasks such as winget, .ps1 scripts or the registry.'
const BASH_MARK = 'so RTK can compress their output'

export const INSTALL_TEXT = [
  'RTK is not installed (or not on PATH). Install it, restart Claude Code, then run /rtk-setup again:',
  '',
  '- Windows: `winget install rtk-ai.rtk`',
  '- macOS: `brew install rtk`',
  '- Linux: `curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh`',
  '- Any OS with Rust: `cargo install --git https://github.com/rtk-ai/rtk`',
  '',
  'Until then the band shows "RTK –" and everything else works.',
].join('\n')

export const isHooked = (showOutput: string) =>
  /\[ok\] Hook/.test(showOutput) && /\[ok\] settings\.json/.test(showOutput)

export const hasBashLine = (md: string | null) => !!md?.includes(BASH_MARK)

export function withBashLine(md: string): string {
  const sep = md === '' || md.endsWith('\n\n') ? '' : md.endsWith('\n') ? '\n' : '\n\n'
  return `${md}${sep}${BASH_LINE}\n`
}

export function setupReport(r: {
  version: string
  wasHooked: boolean
  init: { ok: boolean; output: string } | null
  claudeMd: string
  hasBash: boolean
}): string {
  const lines = [`✓ ${r.version} found.`]
  if (r.wasHooked) lines.push('✓ RTK is already hooked into Claude Code.')
  else if (r.init?.ok) lines.push('✓ Ran `rtk init -g`: RTK hook, RTK.md and settings.json are set up. Restart Claude Code to load the hook.')
  else lines.push('✗ `rtk init -g` failed. Run it yourself in a terminal to see why:', '', '```', (r.init?.output ?? '').trim().slice(-1500), '```')

  if (r.hasBash) {
    lines.push('✓ Your CLAUDE.md already tells Claude to use Bash, so RTK sees its commands.')
  } else {
    lines.push(
      '',
      'One more step: RTK only compresses output from the **Bash** tool. On Windows, Claude may use PowerShell instead and skip RTK.',
      `Run \`/rtk-setup bash\` to add this line to \`${r.claudeMd}\`:`,
      '',
      `> ${BASH_LINE}`,
    )
  }
  return lines.join('\n')
}
