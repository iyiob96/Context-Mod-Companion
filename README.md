# Context Mod Companion

A Claude Code mod that puts a context-window band above the prompt box. It shows your [RTK](https://github.com/rtk-ai/rtk) token savings, and a pixel Yemeni companion stands beside it. His mood follows how much context you have left. Its one-click setup also installs RTK and [Matt Pocock's skills](https://github.com/mattpocock/skills).

![The band above the prompt, with the companion standing to its right](assets/band.png)

## Install

Pick one.

### One line (recommended)

Paste into a terminal. It installs the plugin, Matt Pocock's skills and RTK, hooks RTK into Claude Code, and adds the Bash-only line to your CLAUDE.md. Run it again any time; it skips what's already done.

**Windows (PowerShell):**

```powershell
irm https://raw.githubusercontent.com/iyiob96/Context-Mod-Companion/main/install.ps1 | iex
```

**macOS / Linux:**

```bash
curl -fsSL https://raw.githubusercontent.com/iyiob96/Context-Mod-Companion/main/install.sh | sh
```

Then restart Claude Code.

### From the Claude desktop app

1. Paste `https://github.com/iyiob96/Context-Mod-Companion` into the app's plugin settings and install **yemeni-context-band**.
2. Open a new session. The band shows a **Finish setup** row listing what's missing. Click **Finish setup** and it does the rest (see [what setup does](#what-setup-does)).
3. Restart Claude Code.

### From a Claude Code terminal session

```
/plugin install yemeni-context-band --marketplace iyiob96/Context-Mod-Companion
```

Then click **Finish setup** in the band, or run `/companion-setup`.

## What setup does

The band checks four things each time a session starts. If any is missing, it shows a **Finish setup** row; `/companion-setup` does the same from the prompt.

| Step | How |
| --- | --- |
| Install RTK | Windows: `winget install rtk-ai.rtk`; macOS: `brew install rtk`; Linux: RTK's official install script |
| Hook RTK into Claude Code | `rtk init -g` |
| Bash-only line in your CLAUDE.md | Adds the line below to `~/.claude/CLAUDE.md` once. RTK only compresses output from the Bash tool, and on Windows Claude may use PowerShell instead |
| Matt Pocock's skills | Adds Anthropic's official plugin marketplace if needed, then installs `mattpocock-skills` |

> Use the Bash tool for shell commands (git, npm, builds, tests, linters, docker) so RTK can compress their output. Only use PowerShell for Windows-specific tasks such as winget, .ps1 scripts or the registry.

RTK ([rtk-ai/rtk](https://github.com/rtk-ai/rtk), Apache-2.0) and Matt Pocock's skills are separate projects. Setup installs them from their official sources; this repo doesn't bundle them. Click **Later** to put setup off for the session. The band works without RTK and shows `RTK –`.

After setup, run `/mattpocock-skills:setup-matt-pocock-skills` in a project to set up Matt Pocock's skills there.

## What you get

| Part | What it shows |
| --- | --- |
| Context | Tokens used out of your window, the auto-compact point, a % used badge, a bar split by category (system prompt, tools, MCP tools, agents, memory files, skills, messages) and a legend with token counts |
| ⚡ RTK | Total tokens RTK has saved, from `rtk gain` |
| Companion | A chibi Yemeni man in traditional dress (turban, khanjar, bandoliers) with no background. Click him and he raises his hand and says "Salam" |

The band pops up after the first prompt you send in a session.

![All four moods, at rest and waving](assets/moods-and-wave.png)

| Context left | Mood |
| --- | --- |
| More than 80% | Happy: closed-eye grin, rosy cheeks, gentle bob |
| 60–80% | Normal: calm, slight smile, blinks |
| 40–60% | Worried: raised brows, wavy mouth, sweat drop |
| 40% or less | Devastated: tears, wailing, slumped |

The full drawing (bar chart, animated companion, click to wave) is for the Claude Code desktop app. In a terminal the band falls back to text blocks and a half-block pixel companion, and clicking him does nothing.

## Turn it off or on

```
claude plugin disable yemeni-context-band@context-mod-companion
claude plugin enable yemeni-context-band@context-mod-companion
```

## Develop

```
hooks/register.tsx   the band, the companion's drawing and click, first-run setup
hooks/character.ts   the pixel companion: palette, 24x40 grid per mood and pose
hooks/setup.ts       setup steps, texts and plain helpers
types/index.d.ts     state contract
tests/               claude plugin test suites
install.ps1 / .sh    one-line installers
```

Check your changes with:

```
claude plugin validate .
claude plugin test .
```

The companion was drawn from a reference photo of traditional Yemeni dress, in a chunky pixel-art style.

## License

MIT
