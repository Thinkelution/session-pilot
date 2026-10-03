import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Sample } from '../types'

const PANE = 'pilot'
const history = atom({ plugin: 'session-pilot-ui', key: 'history' } as const, [])
const isHidden = atom({ plugin: 'session-pilot-ui', key: 'isHidden' } as const, false)

const WARN = 60
const COMPACT = 75
const CRITICAL = 88
const HINT = 'keep: decisions made, open TODOs, file paths, failing tests'

const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}k` : String(n))

function level(pct: number) {
  if (pct >= CRITICAL) return { emoji: '🔴', label: 'Act now', color: 'red', n: 3 }
  if (pct >= COMPACT) return { emoji: '🟠', label: 'Compact soon', color: 'yellow', n: 2 }
  if (pct >= WARN) return { emoji: '🟡', label: 'Filling up', color: 'yellow', n: 1 }
  return { emoji: '🟢', label: 'Healthy', color: 'green', n: 0 }
}

// Turns left before the critical threshold, from the average growth over recent turns.
function runway(list: Sample[]): number | null {
  const recent = list.slice(-9)
  const growth: number[] = []
  for (let i = 1; i < recent.length; i++) {
    if (recent[i].tokens > recent[i - 1].tokens) growth.push(recent[i].tokens - recent[i - 1].tokens)
  }
  if (!growth.length) return null
  const avg = growth.reduce((a, b) => a + b, 0) / growth.length
  const last = recent[recent.length - 1]
  if (avg < 200) return null
  return Math.max(0, Math.round(((CRITICAL / 100) * last.window - last.tokens) / avg))
}

async function sample($: any) {
  const u = await $.session.usage()
  const c = u.context
  if (c.tokens === undefined || c.percent === undefined) return u
  const s: Sample = { tokens: c.tokens, pct: c.percent, window: c.window }
  await update($, history, list => {
    const lastTokens = list.length ? list[list.length - 1].tokens : -1
    // A drop means the session was compacted or cleared: start the series over.
    const base = s.tokens < lastTokens * 0.7 ? [] : list
    return [...base, s].slice(-60)
  })
  return u
}

async function compact($: any) {
  $.ui.toast('Compacting…')
  const r = await $.session.compact({ instructions: HINT })
  await update($, history, () => [])
  return r
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'pilot', description: 'Show session-pilot context details in a pane' })
    return next(e)
  })

  on('command.run', { command: 'pilot' }, async $ => {
    await sample($)
    await $.ui.open({ id: PANE, title: 'Session pilot' })
    return { text: 'Session pilot pane opened.' }
  })

  on('turn.complete', async ($, e, next) => {
    if (!e.agentId) {
      const u = await sample($)
      const pct = u.context.percent
      // First time a turn crosses each line, a toast; the band shows the rest.
      if (pct !== undefined && level(pct).n >= 2) {
        $.ui.toast(`${level(pct).emoji} Context ${Math.round(pct)}% full. Use the Compact button above the prompt.`)
      }
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const list = await read($, history)
    const hidden = await read($, isHidden)
    if (e.props.hasSurvey || hidden || list.length === 0) return next(e)

    const last = list[list.length - 1]
    const lv = level(last.pct)
    const left = runway(list)
    const u = await $.session.usage()
    const five = u.rateLimits.find((r: { kind: string }) => r.kind === 'five_hour')
    const { Box, Text, Button } = $.ui.resolve(e)

    return (
      <Box>
        <Text color={lv.color} bold>
          {lv.emoji} {Math.round(last.pct)}%{' '}
        </Text>
        <Text dimColor>
          {fmt(last.tokens)}/{fmt(last.window)}
          {left !== null && lv.n < 3 ? ` · ~${left} turns left` : ''}
          {five ? ` · 5h ${Math.round(five.percentUsed)}%` : ''}
          {lv.n >= 1 ? ` · ${lv.label}` : ''}
          {'  '}
        </Text>
        {lv.n >= 1 && <Button key="compact" label="Compact" onPress={() => compact($)} />}
        <Button key="details" label="Details" onPress={() => $.ui.open({ id: PANE, title: 'Session pilot', focus: true })} />
        <Button key="hide" label="Hide" onPress={() => update($, isHidden, () => true)} />
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const list = await read($, history)
    const { Box, Text, Button } = $.ui.resolve(e)
    if (list.length === 0) {
      return (
        <Box flexDirection="column">
          <Text dimColor>No context data yet. Send a message first.</Text>
        </Box>
      )
    }
    const last = list[list.length - 1]
    const lv = level(last.pct)
    const left = runway(list)
    const room = Math.max(3, (e.viewport?.rows ?? 24) - 9)
    const rows = list.slice(-room)

    return (
      <Box flexDirection="column">
        <Text color={lv.color} bold>
          {lv.emoji} {lv.label}: {Math.round(last.pct)}% of context ({fmt(last.tokens)} / {fmt(last.window)})
        </Text>
        <Text dimColor>
          {left !== null ? `About ${left} more turns before it gets critical.` : 'Not enough history for a runway estimate yet.'}
        </Text>
        <Text> </Text>
        <Text bold>Recent turns</Text>
        {rows.map((s, i) => {
          const prev = i > 0 ? rows[i - 1].tokens : null
          const delta = prev === null ? '' : `  ${s.tokens >= prev ? '+' : '-'}${fmt(Math.abs(s.tokens - prev))}`
          const bar = '█'.repeat(Math.round(s.pct / 10)) + '░'.repeat(10 - Math.round(s.pct / 10))
          return (
            <Text dimColor>
              {bar} {String(Math.round(s.pct)).padStart(3)}%  {fmt(s.tokens).padStart(6)}
              {delta}
            </Text>
          )
        })}
        <Text> </Text>
        <Box>
          <Button key="compact" label="Compact now" onPress={() => compact($)} />
          <Text> </Text>
          <Button key="show" label="Show band" onPress={() => update($, isHidden, () => false)} />
        </Box>
        <Text dimColor>Compact keeps: {HINT}</Text>
      </Box>
    )
  })
}
