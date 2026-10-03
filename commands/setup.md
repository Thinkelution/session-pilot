---
description: Add the session-pilot status line (guided, reversible)
argument-hint: "[undo]"
allowed-tools: Bash(node:*), AskUserQuestion
---

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/report.js" setup ${ARGUMENTS:-check}`

Read the output above.
- If the argument was "undo", report the result in one line and stop.
- If STATUS says "already configured", say so in one line and stop.
- Otherwise show the user the STATUS and WILL DO lines in plain words, then ask with AskUserQuestion: "Add the session-pilot status line?" with options "Yes, add it" and "No, skip". Only on "Yes", run exactly: node "${CLAUDE_PLUGIN_ROOT}/scripts/report.js" setup apply
  Then relay its result in two lines at most.
