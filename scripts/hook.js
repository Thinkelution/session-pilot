'use strict';
// Single dispatcher for all hook events. Never blocks the session: every path fails open.
const fs = require('fs');
const L = require('./lib');

const event = process.argv[2];
let input = {};
try { input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch (_) {}

const policy = L.loadPolicy();

function emit(additionalContext) {
  if (!additionalContext) return;
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: event, additionalContext },
  }));
}

function levelFor(pct) {
  if (pct >= policy.criticalAt) return 'critical';
  if (pct >= policy.compactAt) return 'compact';
  if (pct >= policy.warnAt) return 'warn';
  return null;
}

const ADVICE = {
  warn: p => `[session-pilot] Context is ${p}% full. Mention this briefly to the user; suggest keeping tool output tight and avoiding re-reading files. No action needed yet.`,
  compact: p => `[session-pilot] Context is ${p}% full. Tell the user in one line that it is a good time to run /compact (or start a fresh session if the task is changing). A handoff has been saved automatically.`,
  critical: p => `[session-pilot] Context is ${p}% full — auto-compaction is imminent. Tell the user now: run /compact, or finish the current step and start a fresh session. Avoid reading large files.`,
};

function onSessionStart() {
  const file = L.handoffFile(input.cwd);
  let st;
  try { st = fs.statSync(file); } catch (_) { return; }
  const ageH = (Date.now() - st.mtimeMs) / 36e5;
  if (ageH > policy.handoffMaxAgeHours) return;
  const body = fs.readFileSync(file, 'utf8').slice(0, 2500);
  emit(`[session-pilot] Handoff from the previous session in this folder (${ageH.toFixed(1)}h ago). Use it as orientation only; confirm with the user before relying on it.\n\n${body}`);
}

function onUserPromptSubmit() {
  const entries = L.readTranscript(input.transcript_path);
  const c = L.contextStats(entries, policy);
  if (!c) return;
  const { state, save } = L.sessionState(input.session_id);
  const notes = [];
  const pct = Math.round(c.pct * 100);

  const lvl = levelFor(c.pct);
  if (lvl && !state.advised[lvl]) {
    state.advised[lvl] = true;
    if (lvl !== 'warn') L.writeHandoff(input.cwd, input.session_id, entries, policy);
    notes.push(ADVICE[lvl](pct));
  }
  // Reset advice after the context shrinks (compaction happened).
  if (!lvl) state.advised = {};

  // Prompt cache goes cold after idle time; a big cold context is expensive to resume.
  if (c.timestamp && c.tokens >= policy.cacheIdleMinContextTokens) {
    const idleMin = (Date.now() - Date.parse(c.timestamp)) / 6e4;
    if (idleMin >= policy.cacheIdleMinutes && !state.idleAdvised) {
      state.idleAdvised = true;
      notes.push(`[session-pilot] ${Math.round(idleMin)} min idle with ${L.fmt(c.tokens)} tokens of context: the prompt cache has likely expired, so this turn re-reads everything at full price. If the task changed, suggest /compact or a fresh session.`);
    }
  } else {
    state.idleAdvised = false;
  }
  save();
  emit(notes.join('\n'));
}

function onPostToolUse() {
  const { state, save } = L.sessionState(input.session_id);
  const notes = [];
  const ti = input.tool_input || {};
  if (input.tool_name === 'Read' && ti.file_path) {
    state.reads[ti.file_path] = (state.reads[ti.file_path] || 0) + 1;
    if (state.reads[ti.file_path] === policy.dupReadWarn) {
      notes.push(`[session-pilot] ${ti.file_path} has now been read ${policy.dupReadWarn} times this session. Rely on earlier reads or use offset/limit instead of re-reading it in full.`);
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
      notes.push(`[session-pilot] ${input.tool_name} returned about ${L.fmt(size)} characters. Prefer narrower queries (grep/head/limit/filters) and delegate broad exploration to a subagent so it does not fill this context.`);
    }
  }
  save();
  emit(notes.join('\n'));
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
  L.logMetric({
    ts: new Date().toISOString(), session: input.session_id, cwd: input.cwd,
    model: c.model, ctxTokens: c.tokens, ctxPct: +c.pct.toFixed(3), ...t,
  });
}

const handlers = {
  SessionStart: onSessionStart, UserPromptSubmit: onUserPromptSubmit,
  PostToolUse: onPostToolUse, PreCompact: onPreCompact, Stop: onStop,
};

try { if (handlers[event]) handlers[event](); } catch (_) { /* fail open */ }
process.exit(0);
