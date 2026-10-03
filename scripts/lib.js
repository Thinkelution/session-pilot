'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOME = os.homedir();
const STATE_DIR = path.join(process.env.SESSION_PILOT_HOME || path.join(HOME, '.claude', 'session-pilot'));
const PLUGIN_ROOT = path.join(__dirname, '..');

function ensureDir(d) {
  try { fs.mkdirSync(d, { recursive: true }); } catch (_) {}
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return fallback; }
}

function writeJson(file, data) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// Policy = bundled defaults < user overrides (~/.claude/session-pilot/policy.json).
function loadPolicy() {
  const defaults = readJson(path.join(PLUGIN_ROOT, 'config', 'default-policy.json'), {});
  const user = readJson(path.join(STATE_DIR, 'policy.json'), {});
  return Object.assign({}, defaults, user);
}

function readTranscript(file) {
  if (!file) return [];
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); } catch (_) { return []; }
  const out = [];
  for (const line of raw.split('\n')) {
    if (!line) continue;
    try { out.push(JSON.parse(line)); } catch (_) {}
  }
  return out;
}

// Context size = what the most recent main-thread assistant turn actually sent.
function contextStats(entries, policy) {
  let last = null;
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (e.type === 'assistant' && !e.isSidechain && e.message && e.message.usage) { last = e; break; }
  }
  if (!last) return null;
  const u = last.message.usage;
  const tokens = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
  const model = last.message.model || '';
  let window = policy.windowTokens || 200000;
  if (/\[1m\]/i.test(model) || tokens > window) window = 1000000;
  return { tokens, window, pct: tokens / window, model, timestamp: last.timestamp || null };
}

function totals(entries) {
  const t = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0, turns: 0 };
  for (const e of entries) {
    if (e.type !== 'assistant' || !e.message || !e.message.usage) continue;
    const u = e.message.usage;
    t.input += u.input_tokens || 0;
    t.cacheRead += u.cache_read_input_tokens || 0;
    t.cacheWrite += u.cache_creation_input_tokens || 0;
    t.output += u.output_tokens || 0;
    t.turns++;
  }
  return t;
}

function userText(e) {
  if (e.type !== 'user' || e.isMeta || !e.message) return null;
  const c = e.message.content;
  let text = '';
  if (typeof c === 'string') text = c;
  else if (Array.isArray(c)) text = c.filter(b => b && b.type === 'text').map(b => b.text).join('\n');
  text = text.trim();
  if (!text || text.startsWith('<')) return null;
  return text;
}

// Deterministic work summary: recent asks, files touched, last assistant note.
function summarize(entries, policy) {
  const prompts = [];
  const edited = new Set();
  const read = new Set();
  let lastAssistantText = '';
  for (const e of entries) {
    const t = userText(e);
    if (t) prompts.push(t);
    if (e.type === 'assistant' && e.message && Array.isArray(e.message.content)) {
      for (const b of e.message.content) {
        if (b.type === 'tool_use' && b.input) {
          const p = b.input.file_path || b.input.notebook_path;
          if (!p) continue;
          if (b.name === 'Edit' || b.name === 'Write' || b.name === 'NotebookEdit') edited.add(p);
          else if (b.name === 'Read') read.add(p);
        }
        if (b.type === 'text' && b.text && !e.isSidechain) lastAssistantText = b.text;
      }
    }
  }
  const n = policy.handoffPrompts || 5;
  return {
    prompts: prompts.slice(-n).map(p => p.slice(0, 400)),
    edited: [...edited].slice(-25),
    read: [...read].filter(p => !edited.has(p)).slice(-15),
    lastAssistantText: lastAssistantText.slice(0, 800),
  };
}

function sessionState(id) {
  const file = path.join(STATE_DIR, 'sessions', `${id || 'unknown'}.json`);
  const s = readJson(file, null) || { reads: {}, advised: {}, bigOutputs: 0 };
  return { state: s, save: () => writeJson(file, s) };
}

function handoffFile(cwd) {
  const key = Buffer.from(cwd || 'none').toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, 40);
  return path.join(STATE_DIR, 'handoffs', `${key}.md`);
}

function writeHandoff(cwd, sessionId, entries, policy) {
  const s = summarize(entries, policy);
  const c = contextStats(entries, policy);
  const md = [
    `# Session handoff (${new Date().toISOString()})`,
    `Session: ${sessionId} · cwd: ${cwd}`,
    c ? `Context at handoff: ${Math.round(c.pct * 100)}% (${c.tokens} tokens)` : '',
    '',
    '## Recent requests',
    ...s.prompts.map(p => `- ${p.replace(/\n/g, ' ')}`),
    '',
    '## Files edited',
    ...(s.edited.length ? s.edited.map(f => `- ${f}`) : ['- (none)']),
    '',
    '## Files read (not edited)',
    ...(s.read.length ? s.read.map(f => `- ${f}`) : ['- (none)']),
    '',
    '## Last assistant note',
    s.lastAssistantText || '(none)',
    '',
  ].join('\n');
  const file = handoffFile(cwd);
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, md);
  return file;
}

function logMetric(obj) {
  ensureDir(STATE_DIR);
  try { fs.appendFileSync(path.join(STATE_DIR, 'metrics.jsonl'), JSON.stringify(obj) + '\n'); } catch (_) {}
}

function latestTranscript(cwd) {
  const dir = path.join(HOME, '.claude', 'projects', (cwd || process.cwd()).replace(/[^A-Za-z0-9]/g, '-'));
  let best = null;
  try {
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.jsonl')) continue;
      const p = path.join(dir, f);
      const m = fs.statSync(p).mtimeMs;
      if (!best || m > best.m) best = { p, m };
    }
  } catch (_) {}
  return best && best.p;
}

const fmt = n => (n >= 1000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}k` : String(n));

module.exports = {
  STATE_DIR, loadPolicy, readTranscript, contextStats, totals, summarize,
  sessionState, handoffFile, writeHandoff, logMetric, latestTranscript, readJson, fmt,
};
