'use strict';
// Status line: 🟡 62% · ~9 turns left · /compact soon · 5h 41%
// Uses the context numbers Claude Code passes on stdin; runway comes from the small file hooks keep up to date.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const L = require('./lib');

let raw = '';
try { raw = fs.readFileSync(0, 'utf8'); } catch (_) {}
let input = {};
try { input = JSON.parse(raw || '{}'); } catch (_) {}

const policy = L.loadPolicy();
const cw = input.context_window || {};
let pct = cw.used_percentage;
let tokens = null;
let window = cw.context_window_size || policy.windowTokens;

if (pct == null && input.transcript_path) {
  const c = L.contextStats(L.readTranscript(input.transcript_path), policy);
  if (c) { pct = c.pct * 100; tokens = c.tokens; window = c.window; }
}

const parts = [];
if (pct == null) {
  parts.push('ctx --');
} else {
  const frac = pct / 100;
  const a = L.assess(frac, policy);
  const live = L.readJson(L.liveFile(input.session_id), {});
  const bits = [`${a.emoji} ${Math.round(pct)}%`];
  if (live.runway != null && a.level !== 'critical') bits.push(`~${live.runway} turns left`);
  if (a.level === 'critical') bits.push('/compact now');
  else if (a.level === 'compact') bits.push('/compact soon');
  parts.push(bits.join(' · '));
}
const lim = input.rate_limits || {};
if (lim.five_hour && lim.five_hour.used_percentage != null) parts.push(`5h limit ${Math.round(lim.five_hour.used_percentage)}%`);
if (lim.seven_day && lim.seven_day.used_percentage != null) parts.push(`weekly ${Math.round(lim.seven_day.used_percentage)}%`);
if (L.snoozedUntil()) parts.push('💤');

let out = parts.join(' · ');

// If setup wrapped a pre-existing status line, run it and show both.
const prev = L.readJson(path.join(L.STATE_DIR, 'prev-statusline.json'), null);
if (prev && prev.command) {
  try {
    const p = execSync(prev.command, { input: raw, timeout: 1500, stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
    if (p) out = `${p.split('\n')[0]} │ ${out}`;
  } catch (_) {}
}
process.stdout.write(out);
