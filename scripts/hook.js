'use strict';
// Single dispatcher for all hook events. Never blocks the session: every path fails open.
// Alerts go to the user directly (systemMessage); Claude only gets a short "already shown" note.
const fs = require('fs');
const L = require('./lib');

const event = process.argv[2];
let input = {};
try { input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch (_) {}

const policy = L.loadPolicy();
const snoozed = !!L.snoozedUntil();

function emit({ user, claude }) {
  if (!user && !claude) return;
  const out = {};
  if (user) out.systemMessage = user;
  if (claude) out.hookSpecificOutput = { hookEventName: event, additionalContext: claude };
  process.stdout.write(JSON.stringify(out));
}

const SHOWN = '[session-pilot] The user has already been shown this alert directly. Do not repeat it.';

function userAlert(level, pct, turns) {
  const left = turns != null ? ` (~${turns} turns left)` : '';
  if (level === 'warn') return `🟡 Context is ${pct}% full${left}. Nothing to do yet; keep tool output tight.`;
  if (level === 'compact') return `🟠 Context is ${pct}% full${left}. Good time to compact:\n   ${L.COMPACT_HINT}\n   (handoff saved automatically)`;
  return `🔴 Context is ${pct}% full${left}. Compact now:\n   ${L.COMPACT_HINT}\n   or finish this step and start fresh. Handoff saved; it will be offered next session.`;
}

function onSessionStart() {
  L.syncBin();
  // Seed the mode from the plugin's userConfig on first run only; /session-pilot:mode owns it afterwards.
  if (!fs.existsSync(L.MODE_FILE)) {
    const m = (process.env.CLAUDE_PLUGIN_OPTION_MODE || 'balanced').toLowerCase();
    L.writeJson(L.MODE_FILE, { mode: L.PRESETS[m] ? m : 'balanced' });
  }
  const user = [];
  let claude = null;

  const welcomed = `${L.STATE_DIR}/welcomed`;
  if (!fs.existsSync(welcomed)) {
    fs.writeFileSync(welcomed, new Date().toISOString());
    user.push(`✈ session-pilot is active (${L.getMode()} mode). Run /session-pilot:setup to add the status line, or /session-pilot:status anytime.`);
  }

  const file = L.handoffFile(input.cwd);
  try {
    const st = fs.statSync(file);
    const ageH = (Date.now() - st.mtimeMs) / 36e5;
    if (ageH <= policy.handoffMaxAgeHours) {
      user.push(`📎 Handoff from your last session here (${ageH.toFixed(1)}h ago) was given to Claude as orientation.`);
      claude = `[session-pilot] Handoff from the previous session in this folder (${ageH.toFixed(1)}h ago). Use it as orientation only; confirm with the user before relying on it.\n\n${fs.readFileSync(file, 'utf8').slice(0, 2500)}`;
    }
  } catch (_) {}
  emit({ user: user.join('\n'), claude });
}

function onUserPromptSubmit() {
  const entries = L.readTranscript(input.transcript_path);
  const c = L.contextStats(entries, policy);
  if (!c) return;
  const { state, save } = L.sessionState(input.session_id);
  const pct = Math.round(c.pct * 100);
  const turns = L.runwayTurns(entries, c, policy);
  const a = L.assess(c.pct, policy);
  const user = [];

  L.writeJson(L.liveFile(input.session_id), { ts: Date.now(), pct, tokens: c.tokens, window: c.window, runway: turns });

  if (!snoozed) {
    if (a.level && !state.advised[a.level]) {
      state.advised[a.level] = true;
      if (a.level !== 'warn') L.writeHandoff(input.cwd, input.session_id, entries, policy);
      user.push(userAlert(a.level, pct, turns));
    }
    // Reset advice after the context shrinks (compaction happened).
    if (!a.level) state.advised = {};

    // Prompt cache goes cold after idle time; a big cold context is expensive to resume.
    if (c.timestamp && c.tokens >= policy.cacheIdleMinContextTokens) {
      const idleMin = (Date.now() - Date.parse(c.timestamp)) / 6e4;
      if (idleMin >= policy.cacheIdleMinutes && !state.idleAdvised) {
        state.idleAdvised = true;
        user.push(`⏳ ${Math.round(idleMin)} min idle with ${L.fmt(c.tokens)} tokens of context. The cache has likely expired, so this turn re-reads everything at full price. If the task changed, compact or start fresh.`);
      }
    } else {
      state.idleAdvised = false;
    }
  }
  save();
  if (user.length) emit({ user: user.join('\n'), claude: SHOWN });
}

function onPostToolUse() {
  if (snoozed) return;
  const { state, save } = L.sessionState(input.session_id);
  const user = [];
  const ti = input.tool_input || {};
  if (input.tool_name === 'Read' && ti.file_path) {
    state.reads[ti.file_path] = (state.reads[ti.file_path] || 0) + 1;
    if (state.reads[ti.file_path] === policy.dupReadWarn) {
      user.push(`♻ ${ti.file_path} has been read ${policy.dupReadWarn} times this session. Claude was told to reuse the earlier read.`);
    }
  }
  if ((input.tool_name === 'Edit' || input.tool_name === 'Write') && ti.file_path) {
    delete state.reads[ti.file_path];
  }
  const resp = input.tool_response;
  const size = resp == null ? 0 : (typeof resp === 'string' ? resp.length : JSON.stringify(resp).length);
  if (size > policy.bigOutputChars) {
    state.bigOutputs++;
    if (state.bigOutputs === 1 || state.bigOutputs % 5 === 0) {
      user.push(`📦 ${input.tool_name} returned ~${L.fmt(size)} characters, which eats context fast. Claude was told to narrow queries and use subagents for broad searches.`);
    }
  }
  save();
  if (user.length) {
    emit({ user: user.join('\n'), claude: '[session-pilot] Context waste detected (repeat read or very large output). Reuse earlier reads, use offset/limit, narrow searches, and delegate broad exploration to a subagent. Do not mention this note to the user; they already saw it.' });
  }
}

function onPreCompact() {
  const entries = L.readTranscript(input.transcript_path);
  L.writeHandoff(input.cwd, input.session_id, entries, policy);
}

function onStop() {
  const entries = L.readTranscript(input.transcript_path);
  const c = L.contextStats(entries, policy);
  if (!c) return;
  const t = L.totals(entries);
  L.writeJson(L.liveFile(input.session_id), {
    ts: Date.now(), pct: Math.round(c.pct * 100), tokens: c.tokens, window: c.window,
    runway: L.runwayTurns(entries, c, policy),
  });
  L.logMetric({
    ts: new Date().toISOString(), session: input.session_id, cwd: input.cwd,
    model: c.model, ctxTokens: c.tokens, ctxPct: +c.pct.toFixed(3), ...t,
  });
}

const handlers = {
  SessionStart: onSessionStart, UserPromptSubmit: onUserPromptSubmit,
  PostToolUse: onPostToolUse, PreCompact: onPreCompact, Stop: onStop,
};

try { L.heartbeat(event); if (handlers[event]) handlers[event](); } catch (_) { /* fail open */ }
process.exit(0);
