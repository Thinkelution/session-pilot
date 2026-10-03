'use strict';
// CLI behind the slash commands: status | handoff | history | doctor | mode | snooze | setup
const fs = require('fs');
const os = require('os');
const path = require('path');
const L = require('./lib');

const [cmd = 'status', ...args] = process.argv.slice(2);
const policy = L.loadPolicy();
const cwd = process.env.PWD || process.cwd();
const tp = L.latestTranscript(cwd);
const sid = (tp || '').split('/').pop().replace('.jsonl', '');
const entries = L.readTranscript(tp);
const SETTINGS = process.env.SESSION_PILOT_SETTINGS || path.join(os.homedir(), '.claude', 'settings.json');
const PREV = path.join(L.STATE_DIR, 'prev-statusline.json');
const say = (...l) => console.log(l.join('\n'));

function readSettings() {
  try { return { ok: true, data: JSON.parse(fs.readFileSync(SETTINGS, 'utf8')) }; }
  catch (e) { return { ok: e.code === 'ENOENT', data: {}, missing: e.code === 'ENOENT', err: e.message }; }
}
const isOurs = sl => !!(sl && (sl.command || '').includes(path.join(L.STATE_DIR, 'bin')));

function status() {
  const c = L.contextStats(entries, policy);
  if (!c) return say('No session data found for this folder yet. Send a message first, then try again.');
  const t = L.totals(entries);
  const a = L.assess(c.pct, policy);
  const turns = L.runwayTurns(entries, c, policy);
  const hit = Math.round((t.cacheRead / Math.max(1, t.cacheRead + t.cacheWrite + t.input)) * 100);
  const st = L.sessionState(sid).state;
  const dupes = Object.values(st.reads).filter(n => n >= (policy.dupReadWarn || 99)).length;
  const sl = (readSettings().data || {}).statusLine;
  const snooze = L.snoozedUntil();
  const next = a.level === 'critical' ? `Compact now:  ${L.COMPACT_HINT}\n             (or finish this step and start a fresh session)`
    : a.level === 'compact' ? `Compact when this step is done:  ${L.COMPACT_HINT}`
    : a.level === 'warn' ? 'Keep tool output tight and avoid re-reading files. No action needed yet.'
    : 'Nothing to do. Carry on.';
  say(
    `${a.emoji} ${a.label} — ${Math.round(c.pct * 100)}% of context used (${L.fmt(c.tokens)} / ${L.fmt(c.window)})`,
    turns != null ? `Runway: about ${turns} more turns before it gets critical` : 'Runway: not enough history to estimate yet',
    `Cache: ${hit}% of input was served from cache ${hit >= 80 ? '(good)' : '(low: long gaps or big edits to early context)'}`,
    `Waste: ${dupes} file(s) re-read often · ${st.bigOutputs} oversized tool output(s)`,
    `Mode: ${policy.mode} · Snooze: ${snooze ? 'until ' + new Date(snooze).toLocaleTimeString() : 'off'} · Status line: ${isOurs(sl) ? 'on' : 'off (run /session-pilot:setup)'}`,
    '',
    `Next step: ${next}`,
  );
}

function handoff() {
  const file = L.writeHandoff(cwd, sid, entries, policy);
  say(`Handoff written: ${file}`, '', fs.readFileSync(file, 'utf8'));
}

function history() {
  let lines = [];
  try { lines = fs.readFileSync(`${L.STATE_DIR}/metrics.jsonl`, 'utf8').trim().split('\n').map(l => JSON.parse(l)); } catch (_) {}
  if (!lines.length) return say('No history yet. Metrics are logged at the end of each turn.');
  const by = {};
  for (const m of lines) by[m.session] = m;
  say('session   folder                  context  turns  output');
  for (const m of Object.values(by).slice(-15)) {
    say(`${String(m.session).slice(0, 8)}  ${String(m.cwd || '').slice(-22).padEnd(22)}  ${String(Math.round(m.ctxPct * 100) + '%').padEnd(7)}  ${String(m.turns).padEnd(5)}  ${L.fmt(m.output)}`);
  }
}

function mode() {
  const want = (args[0] || '').toLowerCase();
  if (!want) {
    return say(`Current mode: ${L.getMode()}`,
      'quiet     only critical alerts (80%+), no waste or idle notes',
      'balanced  alerts at 60% / 75% / 88%, waste and idle notes (default)',
      'proactive alerts at 50% / 65% / 80%, stricter waste detection',
      '', 'Change it with: /session-pilot:mode quiet|balanced|proactive');
  }
  if (!L.PRESETS[want]) return say(`Unknown mode "${want}". Use quiet, balanced or proactive.`);
  L.writeJson(L.MODE_FILE, { mode: want });
  say(`Mode set to ${want}. Takes effect on the next message.`);
}

function snooze() {
  const a = (args[0] || '').toLowerCase();
  if (!a) {
    const u = L.snoozedUntil();
    return say(u ? `Snoozed until ${new Date(u).toLocaleTimeString()}.` : 'Not snoozed. Use: /session-pilot:snooze 30m | 1h | 4h | off');
  }
  if (a === 'off') { L.writeJson(L.SNOOZE_FILE, { until: 0 }); return say('Snooze cleared. Alerts are back on.'); }
  const m = a.match(/^(\d+)(m|h)$/);
  if (!m) return say('Use a duration like 30m or 2h, or "off".');
  const ms = +m[1] * (m[2] === 'h' ? 36e5 : 6e4);
  L.writeJson(L.SNOOZE_FILE, { until: Date.now() + ms });
  say(`Alerts snoozed for ${a}. The status line keeps updating. Resume early with /session-pilot:snooze off.`);
}

function setup() {
  const action = (args[0] || 'check').toLowerCase();
  const s = readSettings();
  if (!s.ok) return say(`Could not read ${SETTINGS}: ${s.err}`, 'It may contain comments or invalid JSON. Fix it first, or add the status line by hand (see README).');
  const sl = s.data.statusLine;

  if (action === 'check') {
    if (isOurs(sl)) return say('STATUS: already configured. The session-pilot status line is on.');
    if (!sl) return say('STATUS: not configured. No status line is set today.', `WILL DO: add a status line to ${SETTINGS} (backup saved alongside).`);
    return say('STATUS: not configured. You already have a status line:', `  ${sl.command || JSON.stringify(sl)}`,
      'WILL DO: keep your existing status line and add session-pilot after it, separated by │. Undo any time with /session-pilot:setup undo.');
  }
  if (action === 'apply') {
    if (isOurs(sl)) return say('Already configured. Nothing to change.');
    const bin = L.syncBin();
    if (!s.missing) fs.copyFileSync(SETTINGS, `${SETTINGS}.session-pilot.bak`);
    if (sl && sl.command) L.writeJson(PREV, { command: sl.command, original: sl });
    else try { fs.unlinkSync(PREV); } catch (_) {}
    s.data.statusLine = { type: 'command', command: `node "${bin}"`, padding: (sl && sl.padding) || 0 };
    L.ensureDir(path.dirname(SETTINGS));
    fs.writeFileSync(SETTINGS, JSON.stringify(s.data, null, 2) + '\n');
    return say('Done. Status line added.', sl ? 'Your previous status line is kept and shown first.' : '',
      `Backup of your settings: ${SETTINGS}.session-pilot.bak`, 'It appears on your next message. Undo with /session-pilot:setup undo.');
  }
  if (action === 'undo') {
    if (!isOurs(sl)) return say('The session-pilot status line is not active. Nothing to undo.');
    const prev = L.readJson(PREV, null);
    if (prev && prev.original) s.data.statusLine = prev.original; else delete s.data.statusLine;
    fs.writeFileSync(SETTINGS, JSON.stringify(s.data, null, 2) + '\n');
    try { fs.unlinkSync(PREV); } catch (_) {}
    return say(prev ? 'Restored your previous status line.' : 'Removed the session-pilot status line.');
  }
  say('Usage: setup check | apply | undo');
}

function doctor() {
  const rows = [];
  const ok = (good, label, fix) => rows.push(`${good ? '✔' : '✖'} ${label}${!good && fix ? `\n    fix: ${fix}` : ''}`);
  const major = +process.versions.node.split('.')[0];
  ok(major >= 18, `Node ${process.versions.node}`, 'Install Node 18 or newer.');
  let writable = true;
  try { L.ensureDir(L.STATE_DIR); fs.accessSync(L.STATE_DIR, fs.constants.W_OK); } catch (_) { writable = false; }
  ok(writable, `State folder writable (${L.STATE_DIR})`, 'Check permissions on that folder.');

  const hb = L.readJson(path.join(L.STATE_DIR, 'heartbeat.json'), {});
  for (const ev of ['SessionStart', 'UserPromptSubmit', 'PostToolUse', 'Stop']) {
    const t = hb[ev];
    ok(!!t, t ? `Hook ${ev} last ran ${Math.round((Date.now() - t) / 6e4)} min ago` : `Hook ${ev} has never run`,
      'Start a new session after installing, then send a message. If it still never runs, reinstall: claude plugin install session-pilot@thinkelution');
  }
  const sl = (readSettings().data || {}).statusLine;
  ok(isOurs(sl), isOurs(sl) ? 'Status line configured' : 'Status line not configured', 'Run /session-pilot:setup');
  if (isOurs(sl)) {
    const m = (sl.command || '').match(/"([^"]+)"/);
    ok(!!(m && fs.existsSync(m[1])), 'Status line script exists', 'Run /session-pilot:setup undo, then /session-pilot:setup');
  }
  ok(!!tp, tp ? 'Transcript found for this folder' : 'No transcript found for this folder yet', 'Send a message in this session first.');
  say(...rows, '', `Mode: ${policy.mode} · Snooze: ${L.snoozedUntil() ? 'on' : 'off'}`);
}

({ status, handoff, history, doctor, mode, snooze, setup }[cmd] || status)();
