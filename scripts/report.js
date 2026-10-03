'use strict';
// CLI: node report.js status|handoff|history  (used by the slash commands)
const fs = require('fs');
const L = require('./lib');

const cmd = process.argv[2] || 'status';
const policy = L.loadPolicy();
const cwd = process.env.PWD || process.cwd();
const tp = L.latestTranscript(cwd);
const entries = L.readTranscript(tp);

function status() {
  const c = L.contextStats(entries, policy);
  if (!c) return console.log('No transcript data found for this folder yet.');
  const t = L.totals(entries);
  const hit = t.cacheRead / Math.max(1, t.cacheRead + t.cacheWrite + t.input);
  const next = c.pct >= policy.compactAt ? 'Compact or start fresh now.'
    : c.pct >= policy.warnAt ? 'Getting full: avoid big reads, consider compacting soon.' : 'Healthy.';
  console.log([
    `Model: ${c.model}`,
    `Context: ${L.fmt(c.tokens)} / ${L.fmt(c.window)} (${Math.round(c.pct * 100)}%) — ${next}`,
    `Turns: ${t.turns} · output ${L.fmt(t.output)} · cache-read ${L.fmt(t.cacheRead)} · cache-write ${L.fmt(t.cacheWrite)}`,
    `Cache hit rate: ${Math.round(hit * 100)}%`,
  ].join('\n'));
  const s = L.summarize(entries, policy);
  const dupes = Object.entries(L.sessionState(
    (tp || '').split('/').pop().replace('.jsonl', '')).state.reads).filter(([, n]) => n >= policy.dupReadWarn);
  if (dupes.length) console.log('Repeated reads: ' + dupes.map(([f, n]) => `${f} ×${n}`).join(', '));
  if (s.edited.length) console.log(`Files edited this session: ${s.edited.length}`);
}

function handoff() {
  const file = L.writeHandoff(cwd, (tp || '').split('/').pop().replace('.jsonl', ''), entries, policy);
  console.log(`Handoff written: ${file}\n\n` + fs.readFileSync(file, 'utf8'));
}

function history() {
  let lines = [];
  try { lines = fs.readFileSync(`${L.STATE_DIR}/metrics.jsonl`, 'utf8').trim().split('\n').map(l => JSON.parse(l)); } catch (_) {}
  if (!lines.length) return console.log('No history yet. Metrics are logged at the end of each turn.');
  const bySession = {};
  for (const m of lines) bySession[m.session] = m;
  const rows = Object.values(bySession).slice(-15);
  console.log('session    cwd-tail                 peak-ctx  turns  output');
  for (const m of rows) {
    console.log(`${String(m.session).slice(0, 8)}  ${String(m.cwd || '').slice(-22).padEnd(22)}  ${String(Math.round(m.ctxPct * 100) + '%').padEnd(8)}  ${String(m.turns).padEnd(5)}  ${L.fmt(m.output)}`);
  }
}

({ status, handoff, history }[cmd] || status)();
