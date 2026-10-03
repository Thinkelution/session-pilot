'use strict';
// Status line: model · context bar · tokens. Add to settings.json as a statusLine command.
const fs = require('fs');
const L = require('./lib');

let input = {};
try { input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch (_) {}
const policy = L.loadPolicy();
const c = L.contextStats(L.readTranscript(input.transcript_path), policy);
const model = (input.model && input.model.display_name) || '';

if (!c) { process.stdout.write(model ? `${model} · ctx --` : 'ctx --'); process.exit(0); }

const pct = Math.round(c.pct * 100);
const color = c.pct >= policy.compactAt ? 31 : c.pct >= policy.warnAt ? 33 : 32;
const filled = Math.min(10, Math.round(c.pct * 10));
const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);
process.stdout.write(`${model ? model + ' · ' : ''}\x1b[${color}m${bar} ${pct}%\x1b[0m ${L.fmt(c.tokens)}/${L.fmt(c.window)}`);
