# session-pilot

Closed-loop session optimizer for Claude Code (and Cowork where plugins/hooks are supported). Zero dependencies; Node 18+.

## What it does (v0.1)
| Feature | How |
|---|---|
| Context monitor | Reads real token usage from the transcript; advises at 60% / 75% / 88% |
| Auto handoff | Written at 75%+, before every compaction; offered again at the next SessionStart in that folder |
| Waste detector | Flags files read 3+ times and tool outputs over 20k chars |
| Cache-idle warning | Warns when a large context has sat idle long enough for the prompt cache to expire |
| Status line | Model · context bar · tokens |
| History | Per-session peak context and output, logged at each Stop |

Hooks only add advisory context and never block. They cannot rewrite prompts or run /compact for you; that is a platform limit.

## Install (local)
```bash
claude --plugin-dir /path/to/session-pilot
```

## Status line
Add to `~/.claude/settings.json`:
```json
{ "statusLine": { "type": "command", "command": "node /path/to/session-pilot/scripts/statusline.js" } }
```

## Tuning
Override any key from `config/default-policy.json` in `~/.claude/session-pilot/policy.json`.

## Roadmap
- Policy engine with per-project profiles
- Model/effort routing advice
- Quality guard (detect degradation after compaction)
- Cowork-specific signals
- Ingest ccusage / token-usage data for cost
