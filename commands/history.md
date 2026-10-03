---
description: Show recent sessions with peak context and output volume
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/report.js" history`

Point out any session that peaked above 80% context and say what likely caused it if the cwd gives a hint.
