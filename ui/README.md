# session-pilot-ui

Optional companion to session-pilot. A **mod**: code that runs inside Claude Code with your permissions, so install it only if you are comfortable with that.

- **Band above the prompt:** `🟡 62% 124k/200k · ~9 turns left · Filling up` with **Compact**, **✨ Optimize prompt**, **Details** and **Hide** buttons, and a second line `5h limit 48% (resets in 2h 10m) · weekly limit 31% (resets in 3d 4h)` when your plan reports limits. It shows time until each limit resets; the app does not report a count of resets remaining.
- **Optimize prompt:** type a draft, press the button, and a small model (Haiku, a few hundred tokens of your usage) rewrites it into a clearer prompt in the box. You review and send; **Undo** restores your original. It sees the assistant's last reply so short follow-ups such as "more space between lines?" can be expanded, and it will not replace your draft with questions: if it cannot improve the draft without guessing, it leaves it unchanged and tells you. The label adds "(short draft)" when your draft looks vague. In the terminal, Compact runs `/compact` for you with a focus on decisions, TODOs, file paths and failing tests. In the Desktop app, plugins cannot trigger compaction directly yet, so Compact puts that `/compact …` command in your prompt box and you press Enter (a draft you had typed is saved; **Undo** restores it). Details (`≡`) and Hide (`✕`) are icon buttons.
- **`/pilot` pane:** per-turn context history with growth, runway, and a Compact button.
- **Toast** when a turn ends above 75% (optional).
- **Asks first:** after your first reply it asks whether to show the band (always, only when filling up, or never) whether to pop up alerts, and the overall alert mode (balanced, quiet or proactive), which it writes to the file the core session-pilot plugin reads. Answers are remembered across sessions; change them any time with `/pilot-settings`. Dismissing the question means it asks again next session.

Works in the terminal and the Desktop app's Code tab. It does not draw in the VS Code extension, cloud sessions, or Cowork/chat workspaces. Requires Claude Code v2.1.287 or later.

```bash
claude plugin install session-pilot-ui@thinkelution
```
