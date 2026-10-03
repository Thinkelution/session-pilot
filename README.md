# session-pilot

Closed-loop session optimizer for Claude Code (and Cowork where plugins and hooks are supported). Zero dependencies; Node 18+.
Site: https://thinkelution.github.io/session-pilot/

## Why use it
- Know when a session is filling up, with a turns-left estimate, before replies degrade.
- Compact with focus (decisions, TODOs, file paths, failing tests) and get a handoff saved first.
- See 5-hour and weekly plan limits next to context, with time until reset.
- Cut waste: repeated reads, oversized output, vague prompts (✨ Optimize prompt).
- Resume cleanly: handoffs are offered at the next session start in that folder.

## Install
```bash
claude plugin marketplace add Thinkelution/session-pilot
claude plugin install session-pilot@thinkelution
```
Then, in a session, run `/session-pilot:setup`. It asks before changing anything, keeps any status line you already have (shown first, then session-pilot after `│`), backs up your settings, and can be reverted with `/session-pilot:setup undo`.

Prefer clicking? In a Claude Code chat type `/plugin`, add the marketplace `Thinkelution/session-pilot`, and install from the menu.

For local development: `claude --plugin-dir /path/to/session-pilot`.

## What you see
- **Status line:** `🟡 62% · ~9 turns left · 5h limit 48% · weekly 31%`, turning `🟠 … /compact soon` and `🔴 … /compact now`.
- **Direct alerts:** shown to you, with the exact command to run. Claude is told you already saw them and does not repeat them.
- **Handoff:** saved at 75%+ and before every compaction; offered to Claude at the next session start in that folder.
- **Waste notes:** files re-read repeatedly, oversized tool output, and an idle-cache warning.

## Optional live UI (Claude Code terminal and Desktop Code tab)
```bash
claude plugin install session-pilot-ui@thinkelution
```
A band above the prompt with the context state, a one-click **Compact** button (in the Desktop app it fills `/compact …` for you to confirm with Enter; the band refreshes after compaction), a **✨ Optimize prompt** button, and 5-hour/weekly limits with time until reset, plus a `/pilot` details pane. It is a *mod*: code that runs inside Claude Code with your permissions, so it is a separate, optional install. Requires Claude Code v2.1.287+. It does not draw in the VS Code extension, cloud sessions or Cowork/chat; the hook alerts still work there. Details: [ui/README.md](ui/README.md).

## Commands
| Command | Purpose |
|---|---|
| `/session-pilot:status` | Health, runway, waste, and one next step |
| `/session-pilot:setup [undo]` | Guided, reversible status line setup |
| `/session-pilot:mode [quiet\|balanced\|proactive]` | How chatty it is |
| `/session-pilot:snooze [30m\|1h\|4h\|off]` | Pause alerts |
| `/session-pilot:handoff` | Write a handoff now |
| `/session-pilot:history` | Recent sessions |
| `/session-pilot:doctor` | Check the install and get fixes |

## Modes
| Mode | Alerts at | Extras |
|---|---|---|
| quiet | 80% / 90% | no waste or idle notes |
| balanced (default) | 60% / 75% / 88% | waste and idle notes |
| proactive | 50% / 65% / 80% | stricter waste detection |

The initial mode comes from the plugin's `mode` setting; afterwards `/session-pilot:mode` owns it.
Fine-tune any value from `config/default-policy.json` in `~/.claude/session-pilot/policy.json`.

## How it works
Hooks (SessionStart, UserPromptSubmit, PostToolUse, PreCompact, Stop) read the session transcript, estimate runway from recent context growth, and emit user-visible messages. They only advise and always fail open. They cannot rewrite prompts, inject text at PreCompact, or run `/compact`; that is a platform limit.

The status line script is copied to `~/.claude/session-pilot/bin/` on each session start so it keeps working after plugin updates.

## Roadmap
- Per-project profiles
- Model/effort routing advice
- Quality guard (detect degradation after compaction)
- Cowork-specific signals (untested today)
- Cost reporting (ingest ccusage / token-usage data)
- HTML dashboard of context over time
