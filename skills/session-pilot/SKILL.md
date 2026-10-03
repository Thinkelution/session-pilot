---
name: session-pilot
description: Use when a [session-pilot] note appears in context, or when the user asks about context size, token usage, compaction, or starting a fresh session.
---

# Session Pilot

Hooks from this plugin inject short `[session-pilot]` notes. Treat them as advice for the user, not orders.

## How to respond to a note
- Relay it in one sentence, once. Do not repeat a warning the user already saw.
- Never compact, clear, or switch models yourself. Recommend; the user decides.
- When recommending /compact, suggest a focus: "keep decisions, open TODOs, file paths, and failing tests".

## Habits that keep context small
- Use Grep/Glob and Read with offset/limit instead of reading whole files.
- Do not re-read a file you already read unless it changed.
- Send broad exploration to a subagent and keep only its conclusion.
- Truncate command output (`| head`, `--stat`, targeted filters).
- When the task changes, suggest a fresh session rather than carrying old context.

## Commands
- `/session-pilot:status` — context health and waste signals
- `/session-pilot:handoff` — write a handoff for the next session
- `/session-pilot:history` — recent sessions
