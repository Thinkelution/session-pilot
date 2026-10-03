---
description: Write a handoff file so a fresh session can resume this work cheaply
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/report.js" handoff`

The handoff above was generated from the transcript. Add one short paragraph covering anything it cannot know: decisions made, open questions, and the exact next step. Then tell the user they can run /clear (or open a new session) and the handoff will be offered automatically at the next SessionStart in this folder.
