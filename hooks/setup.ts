// First-run setup: everything the band needs besides itself. RTK
// (https://github.com/rtk-ai/rtk) and Matt Pocock's skills are separate
// projects; this plugin installs them from their official sources and never
// bundles them. The engine calls live in register.tsx; this file holds the
// steps, the words and the plain logic.

import type { SetupStep } from '../types'

export const SETUP_COMMAND = 'companion-setup'

export const STEP_LABEL: Record<SetupStep, string> = {
  rtk: 'install RTK',
  hook: 'hook RTK into Claude Code',
  bash: 'add a Bash-only line to your CLAUDE.md',
  matt: "install Matt Pocock's skills",
}

export const STEP_ORDER: SetupStep[] = ['rtk', 'hook', 'bash', 'matt']

export const MATT_ID = 'mattpocock-skills@claude-plugins-official'
export const OFFICIAL_MARKETPLACE = 'claude-plugins-official'
export const OFFICIAL_MARKETPLACE_URL = 'https://github.com/anthropics/claude-plugins-official.git'

export const BASH_LINE =
  'Use the Bash tool for shell commands (git, npm, builds, tests, linters, docker) so RTK can compress their output. Only use PowerShell for Windows-specific tasks such as winget, .ps1 scripts or the registry.'
const BASH_MARK = 'so RTK can compress their output'

export const RTK_INSTALL: Record<'windows' | 'mac' | 'linux', string[]> = {
  windows: ['winget', 'install', '--id', 'rtk-ai.rtk', '-e', '--source', 'winget', '--accept-package-agreements', '--accept-source-agreements', '--silent'],
  mac: ['brew', 'install', 'rtk'],
  linux: ['sh', '-c', 'curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh'],
}

export const RTK_MANUAL = [
  'Install RTK yourself, then run /companion-setup again:',
  '- Windows: `winget install rtk-ai.rtk`',
  '- macOS: `brew install rtk`',
  '- Linux: `curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh`',
].join('\n')

export const isHooked = (showOutput: string) =>
  /\[ok\] Hook/.test(showOutput) && /\[ok\] settings\.json/.test(showOutput)

export const hasBashLine = (md: string | null) => !!md?.includes(BASH_MARK)

export function withBashLine(md: string): string {
  const sep = md === '' || md.endsWith('\n\n') ? '' : md.endsWith('\n') ? '\n' : '\n\n'
  return `${md}${sep}${BASH_LINE}\n`
}

// `claude plugin list --json`: is the plugin there and enabled?
export function isEnabled(listJson: string, id: string): boolean {
  try {
    const list = JSON.parse(listJson) as { id?: string; enabled?: boolean }[]
    return list.some(p => p.id === id && p.enabled !== false)
  } catch {
    return false
  }
}

export function hasMarketplace(listJson: string, name: string): boolean {
  try {
    return (JSON.parse(listJson) as { name?: string }[]).some(m => m.name === name)
  } catch {
    return false
  }
}

export const missingSummary = (missing: SetupStep[]) =>
  STEP_ORDER.filter(s => missing.includes(s)).map(s => STEP_LABEL[s]).join(', ')
