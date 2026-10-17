#!/bin/sh
# Context Mod Companion: one-line installer for macOS and Linux.
#
#   curl -fsSL https://raw.githubusercontent.com/iyiob96/Context-Mod-Companion/main/install.sh | sh
#
# Installs the yemeni-context-band plugin, Matt Pocock's skills, and RTK, hooks
# RTK into Claude Code, and adds the Bash-only line to your CLAUDE.md. Safe to
# run again: every step is skipped when it is already done.
set -eu

REPO=https://github.com/iyiob96/Context-Mod-Companion.git
OFFICIAL=https://github.com/anthropics/claude-plugins-official.git
BASH_LINE='Use the Bash tool for shell commands (git, npm, builds, tests, linters, docker) so RTK can compress their output. Only use PowerShell for Windows-specific tasks such as winget, .ps1 scripts or the registry.'

step() { printf '\033[36m-> %s\033[0m\n' "$1"; }
ok() { printf '\033[32m   OK %s\033[0m\n' "$1"; }
die() { printf '\033[31m%s\033[0m\n' "$1" >&2; exit 1; }

# Claude Code: on PATH (CLI install) or inside the Claude desktop app.
find_claude() {
  if command -v claude >/dev/null 2>&1; then command -v claude; return; fi
  for f in "$HOME/.local/bin/claude" "$HOME/.claude/local/claude"; do
    [ -x "$f" ] && { echo "$f"; return; }
  done
  for d in "$HOME/Library/Application Support/Claude/claude-code" "$HOME/.config/Claude/claude-code"; do
    [ -d "$d" ] || continue
    f=$(find "$d" -type f -name claude -perm -u+x 2>/dev/null | sort | tail -n 1)
    [ -n "$f" ] && { echo "$f"; return; }
  done
  die 'Claude Code was not found. Install the Claude desktop app (or Claude Code) and open it once, then run this again.'
}

find_rtk() {
  if command -v rtk >/dev/null 2>&1; then command -v rtk; return; fi
  for f in "$HOME/.local/bin/rtk" "$HOME/.cargo/bin/rtk" /opt/homebrew/bin/rtk /usr/local/bin/rtk; do
    [ -x "$f" ] && { echo "$f"; return; }
  done
}

CLAUDE=$(find_claude)
step "Using Claude Code at $CLAUDE"

markets=$("$CLAUDE" plugin marketplace list --json)
plugins=$("$CLAUDE" plugin list --json)
has() { printf '%s' "$1" | grep -q "\"$2\""; }

step 'Context Mod Companion plugin'
if has "$markets" context-mod-companion; then "$CLAUDE" plugin marketplace update context-mod-companion >/dev/null
else "$CLAUDE" plugin marketplace add "$REPO"; fi
if has "$plugins" 'yemeni-context-band@context-mod-companion'; then ok 'already installed'
else "$CLAUDE" plugin install yemeni-context-band@context-mod-companion --scope user; fi

step "Matt Pocock's skills"
if has "$plugins" 'mattpocock-skills@claude-plugins-official'; then ok 'already installed'
else
  has "$markets" claude-plugins-official || "$CLAUDE" plugin marketplace add "$OFFICIAL"
  "$CLAUDE" plugin install mattpocock-skills@claude-plugins-official --scope user
fi

step 'RTK'
RTK=$(find_rtk || true)
if [ -z "$RTK" ]; then
  if [ "$(uname -s)" = Darwin ] && command -v brew >/dev/null 2>&1; then brew install rtk
  else curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh; fi
  RTK=$(find_rtk || true)
  [ -n "$RTK" ] || die 'RTK did not install. See https://github.com/rtk-ai/rtk, then run this again.'
fi
ok "$("$RTK" --version)"

step 'Hook RTK into Claude Code'
"$RTK" init -g --auto-patch --no-trust-filters >/dev/null
ok 'rtk init -g'

step 'Bash-only line in CLAUDE.md'
CONFIG_DIR=${CLAUDE_CONFIG_DIR:-$HOME/.claude}
MD="$CONFIG_DIR/CLAUDE.md"
# Also look in files CLAUDE.md imports with `@file` lines.
has_bash_line() {
  [ -f "$MD" ] || return 1
  grep -q 'so RTK can compress their output' "$MD" && return 0
  for f in $(sed -n 's/^@\([^[:space:]]*\)[[:space:]]*$/\1/p' "$MD"); do
    grep -qs 'so RTK can compress their output' "$CONFIG_DIR/$f" && return 0
  done
  return 1
}
if has_bash_line; then ok 'already there'
else
  mkdir -p "$CONFIG_DIR"
  if [ -s "$MD" ]; then printf '\n%s\n' "$BASH_LINE" >> "$MD"; else printf '%s\n' "$BASH_LINE" > "$MD"; fi
  ok "added to $MD"
fi

echo
printf '\033[32mAll set. Restart Claude Code (desktop app or terminal) to load everything.\033[0m\n'
echo "Then run /mattpocock-skills:setup-matt-pocock-skills in a project to set up Matt Pocock's skills there."
