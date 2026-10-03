---
description: Pause session-pilot alerts for a while (30m, 1h, 4h, off)
argument-hint: "[30m|1h|4h|off]"
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/report.js" snooze $ARGUMENTS`

Print the output above exactly as written. Add nothing else.
