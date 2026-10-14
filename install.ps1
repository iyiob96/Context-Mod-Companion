# Context Mod Companion: one-line installer for Windows.
#
#   irm https://raw.githubusercontent.com/iyiob96/Context-Mod-Companion/main/install.ps1 | iex
#
# Installs the yemeni-context-band plugin, Matt Pocock's skills, and RTK, hooks
# RTK into Claude Code, and adds the Bash-only line to your CLAUDE.md. Safe to
# run again: every step is skipped when it is already done.

$ErrorActionPreference = 'Stop'

$Repo = 'https://github.com/iyiob96/Context-Mod-Companion.git'
$Official = 'https://github.com/anthropics/claude-plugins-official.git'
$BashLine = 'Use the Bash tool for shell commands (git, npm, builds, tests, linters, docker) so RTK can compress their output. Only use PowerShell for Windows-specific tasks such as winget, .ps1 scripts or the registry.'

function Step($text) { Write-Host "-> $text" -ForegroundColor Cyan }
function Ok($text) { Write-Host "   OK $text" -ForegroundColor Green }

# Claude Code: on PATH (CLI install) or inside the Claude desktop app.
function Find-Claude {
    $onPath = Get-Command claude -ErrorAction SilentlyContinue
    if ($onPath) { return $onPath.Source }
    $roots = @("$env:APPDATA\Claude\claude-code", "$env:USERPROFILE\.local\bin")
    $roots += Get-ChildItem "$env:LOCALAPPDATA\Packages" -Directory -Filter 'Claude_*' -ErrorAction SilentlyContinue |
        ForEach-Object { "$($_.FullName)\LocalCache\Roaming\Claude\claude-code" }
    $exe = $roots | Where-Object { Test-Path $_ } |
        ForEach-Object { Get-ChildItem $_ -Recurse -Filter claude.exe -ErrorAction SilentlyContinue } |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($exe) { return $exe.FullName }
    throw 'Claude Code was not found. Install the Claude desktop app (or Claude Code) and open it once, then run this again.'
}

# RTK: on PATH, or where winget put it (PATH updates reach new shells only).
function Find-Rtk {
    $onPath = Get-Command rtk -ErrorAction SilentlyContinue
    if ($onPath) { return $onPath.Source }
    $candidates = @("$env:LOCALAPPDATA\Microsoft\WinGet\Links\rtk.exe")
    $candidates += Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Directory -Filter 'rtk-ai.rtk_*' -ErrorAction SilentlyContinue |
        ForEach-Object { "$($_.FullName)\rtk.exe" }
    return $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
}

$claude = Find-Claude
Step "Using Claude Code at $claude"

$markets = (& $claude plugin marketplace list --json | ConvertFrom-Json)
$plugins = (& $claude plugin list --json | ConvertFrom-Json)

Step 'Context Mod Companion plugin'
if ($markets.name -contains 'context-mod-companion') { & $claude plugin marketplace update context-mod-companion | Out-Null }
else { & $claude plugin marketplace add $Repo }
if ($plugins.id -contains 'yemeni-context-band@context-mod-companion') { Ok 'already installed' }
else { & $claude plugin install yemeni-context-band@context-mod-companion --scope user }

Step "Matt Pocock's skills"
if ($plugins.id -contains 'mattpocock-skills@claude-plugins-official') { Ok 'already installed' }
else {
    if (-not ($markets.name -contains 'claude-plugins-official')) { & $claude plugin marketplace add $Official }
    & $claude plugin install mattpocock-skills@claude-plugins-official --scope user
}

Step 'RTK'
$rtk = Find-Rtk
if ($rtk) { Ok (& $rtk --version) }
else {
    winget install --id rtk-ai.rtk -e --source winget --accept-package-agreements --accept-source-agreements --silent
    $rtk = Find-Rtk
    if (-not $rtk) { throw 'RTK did not install. Run: winget install rtk-ai.rtk, then run this again.' }
    Ok (& $rtk --version)
}

Step 'Hook RTK into Claude Code'
& $rtk init -g --auto-patch --no-trust-filters | Out-Null
Ok 'rtk init -g'

Step 'Bash-only line in CLAUDE.md'
$configDir = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { "$env:USERPROFILE\.claude" }
$md = Join-Path $configDir 'CLAUDE.md'
$text = if (Test-Path $md) { [IO.File]::ReadAllText($md) } else { '' }
if ($text.Contains('so RTK can compress their output')) { Ok 'already there' }
else {
    New-Item -ItemType Directory -Force $configDir | Out-Null
    $sep = if ($text -eq '' -or $text.EndsWith("`n`n")) { '' } elseif ($text.EndsWith("`n")) { "`n" } else { "`n`n" }
    [IO.File]::WriteAllText($md, "$text$sep$BashLine`n", (New-Object Text.UTF8Encoding $false))
    Ok "added to $md"
}

Write-Host ''
Write-Host 'All set. Restart Claude Code (desktop app or terminal) to load everything.' -ForegroundColor Green
Write-Host "Then run /mattpocock-skills:setup-matt-pocock-skills in a project to set up Matt Pocock's skills there."
