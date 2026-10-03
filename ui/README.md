# session-pilot-ui

Optional companion to session-pilot. A **mod**: code that runs inside Claude Code with your permissions, so install it only if you are comfortable with that.

- **Band above the prompt:** `🟡 62% 124k/200k · ~9 turns left · 5h 41% · Filling up` with **Compact**, **Details** and **Hide** buttons. Compact runs `/compact` for you with a focus on decisions, TODOs, file paths and failing tests.
- **`/pilot` pane:** per-turn context history with growth, runway, and a Compact button.
- **Toast** when a turn ends above 75%.

Works in the terminal and the Desktop app's Code tab. It does not draw in the VS Code extension, cloud sessions, or Cowork/chat workspaces. Requires Claude Code v2.1.287 or later.

```bash
claude plugin install session-pilot-ui@thinkelution
```
