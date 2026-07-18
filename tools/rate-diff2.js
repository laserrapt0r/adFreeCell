/* adFreeCell - recompute difficulty for deals 1..32000 with the current engine
 * solver (symmetry + safe-autoplay + a 3-heuristic portfolio). Difficulty =
 * search effort (min nodes over the heuristics); only the fastest way to crack a
 * deal counts, so a deal one heuristic struggles with but another finds easy is
 * rated easy. Finer tiers than before.
 *
 *   node tools/rate-diff2.js bench [count] [cap]
 *   node tools/rate-diff2.js worker <cap> <start> <end> <id>   # -> diff2-part-<id>.json
 *   node tools/rate-diff2.js merge <cap>                       # -> js/difficulty.js
 */
'use strict';
const fs = require('fs'), path = require('path');
global.window = global;
require(path.join(__dirname, '..', 'js', 'deal.js'));
require(path.join(__dirname, '..', 'js', 'engine.js'));
const E = window.FreeCellEngine;

function canonHash(s) {
  const _ch = [];
  for (let k = 0; k < 8; k++) { const col = s.tableau[k]; let h = 2166136261; for (let j = 0; j < col.length; j++) { h = (h ^ col[j].uid) >>> 0; h = Math.imul(h, 16777619) >>> 0; } _ch.push(h); }
  _ch.sort((a, b) => a - b);
  let a = 2166136261, b = 2166136261;
  for (let k = 0; k < 8; k++) { a = Math.imul(a ^ _ch[k], 16777619) >>> 0; b = Math.imul(b ^ _ch[k], 0x85ebca6b) >>> 0; }
  const fr = []; for (let i = 0; i < 4; i++) if (s.free[i]) fr.push(s.free[i].uid); fr.sort((x, y) => x - y);
  for (let i = 0; i < fr.length; i++) { a = Math.imul(a ^ fr[i], 16777619) >>> 0; b = Math.imul(b ^ fr[i], 0x85ebca6b) >>> 0; }
  for (let sf = 0; sf < 4; sf++) { const v = s.foundations[sf] + 1 + sf * 20; a = Math.imul(a ^ v, 16777619) >>> 0; b = Math.imul(b ^ v, 0x85ebca6b) >>> 0; }
  return (a & 0x7FFFFFFF) * 4194304 + (b & 0x3FFFFF);
}
function buried(s) { let b = 0; for (let suit = 0; suit < 4; suit++) { const need = s.foundations[suit] + 1; if (need > 13) continue; for (let c = 0; c < 8; c++) { const col = s.tableau[c]; for (let i = 0; i < col.length; i++) { if (col[i].suit === suit && col[i].rank === need) { b += col.length - 1 - i; break; } } } } return b; }
function isBlack(su) { return su === 0 || su === 3; }
function runs(s) { let r = 0; for (let c = 0; c < 8; c++) { const col = s.tableau[c]; for (let i = col.length - 1; i > 0; i--) { const a = col[i], b = col[i - 1]; if (b.rank === a.rank + 1 && (isBlack(b.suit) !== isBlack(a.suit))) r++; else break; } } return r; }
function emc(s) { let e = 0, c = 0; for (let i = 0; i < 4; i++) if (!s.free[i]) c++; for (let k = 0; k < 8; k++) if (!s.tableau[k].length) e++; return [e, c]; }
const H = [
  s => { const [e, c] = emc(s); const v = E.foundationSum(s) * 6 + e * 3 + c - buried(s) * 2 + runs(s) + 40; return v < 0 ? 0 : v; },       // run
  s => { const [e, c] = emc(s); const v = E.foundationSum(s) * 7 + e * 4 + c * 2 - buried(s) * 4 + 90; return v < 0 ? 0 : v; },              // bur4
  s => { const [e, c] = emc(s); const v = E.foundationSum(s) * 6 + e * 3 + c - buried(s) * 2 + 40; return v < 0 ? 0 : v; },                  // base
];
function solveMoves(s) { const m = E.legalMoves(s), o = []; let fe = -1, fc = -1; for (let k = 0; k < 8; k++) if (!s.tableau[k].length) { fe = k; break; } for (let i = 0; i < 4; i++) if (!s.free[i]) { fc = i; break; } for (const mv of m) { const d = mv.dst; if (d.kind === 'tableau' && !s.tableau[d.col].length) { if (d.col !== fe) continue; } else if (d.kind === 'free') { if (d.i !== fc) continue; } o.push(mv); } return o; }
function auto(s) { let sm; while ((sm = E.nextSafeMove(s))) { E.applyMove(s, sm.src, sm.dst); } }
function solve1(g, cap, SC) {
  let s0 = E.newGame(g); auto(s0); if (E.isWon(s0)) return 0;
  const SMAX = 800, bk = []; for (let i = 0; i < SMAX; i++) bk.push([]);
  const seen = new Set(); seen.add(canonHash(s0));
  let top = Math.min(SC(s0), SMAX - 1); bk[top].push(s0); let nodes = 0;
  while (true) {
    while (top >= 0 && !bk[top].length) top--;
    if (top < 0) return cap;
    if (++nodes > cap) return cap;
    const st = bk[top].pop();
    if (E.isWon(st) || (E.foundationSum(st) >= 36 && E.canAutoFinish(st))) return nodes;
    for (const mv of solveMoves(st)) { const ns = E.clone(st); E.applyMove(ns, mv.src, mv.dst); auto(ns); const k = canonHash(ns); if (seen.has(k)) continue; seen.add(k); let sc = Math.min(SC(ns), SMAX - 1); if (sc < 0) sc = 0; bk[sc].push(ns); if (sc > top) top = sc; }
  }
}
// effort: run first (fast, solves most); only if run is slow/fails do we also try
// the other heuristics and take the min, so easy deals stay cheap to rate
function effort(g, cap) { let e = solve1(g, cap, H[0]); if (e > 1500) e = Math.min(e, solve1(g, cap, H[1]), solve1(g, cap, H[2])); return e; }

const MAX = 32000, UNSOLVABLE = 11982;
const mode = process.argv[2] || 'bench';

if (mode === 'bench') {
  const count = parseInt(process.argv[3] || '200', 10), cap = parseInt(process.argv[4] || '250000', 10);
  const sample = []; for (let i = 0; i < count; i++) sample.push(1 + Math.floor((i / count) * MAX));
  let tot = 0, mx = 0; const t0 = Date.now();
  for (const g of sample) { if (g === UNSOLVABLE) continue; const e = effort(g, cap); tot += e; mx = Math.max(mx, e); }
  const ms = Date.now() - t0;
  console.log(`bench N=${count} cap=${cap}: ${(ms / count).toFixed(1)}ms/game est32000-1thread=${(ms / count * MAX / 60000).toFixed(1)}min avgNodes=${Math.round(tot / count)} max=${mx}`);
} else if (mode === 'worker') {
  const cap = parseInt(process.argv[3], 10), start = parseInt(process.argv[4], 10), end = parseInt(process.argv[5], 10), id = process.argv[6];
  const CP = path.join(__dirname, `diff2-part-${id}.json`), LOG = path.join(__dirname, 'difficulty2.log');
  let nodes, done;
  if (fs.existsSync(CP)) { const cp = JSON.parse(fs.readFileSync(CP, 'utf8')); nodes = cp.nodes; done = cp.done; }
  else { nodes = new Array(end - start + 1).fill(-2); done = start - 1; }
  const t0 = Date.now();
  for (let n = done + 1; n <= end; n++) {
    nodes[n - start] = (n === UNSOLVABLE) ? -1 : effort(n, cap);
    if (n % 250 === 0 || n === end) {
      fs.writeFileSync(CP, JSON.stringify({ start, end, done: n, cap, nodes }));
      const el = (Date.now() - t0) / 1000, rate = (n - done) / el;
      fs.appendFileSync(LOG, `[w${id}] n=${n}/${end} ${rate.toFixed(1)}/s ETA ${((end - n) / rate / 60).toFixed(0)}m\n`);
    }
  }
  fs.appendFileSync(LOG, `[w${id}] DONE ${start}..${end} in ${((Date.now() - t0) / 60000).toFixed(1)}min\n`);
} else if (mode === 'merge') {
  const cap = parseInt(process.argv[3] || '250000', 10);
  const arr = new Array(MAX + 1).fill(-2);
  for (const f of fs.readdirSync(__dirname).filter(f => /^diff2-part-.*\.json$/.test(f))) {
    const cp = JSON.parse(fs.readFileSync(path.join(__dirname, f), 'utf8'));
    for (let n = cp.start; n <= cp.done; n++) arr[n] = cp.nodes[n - cp.start];
  }
  // tier thresholds from the effort distribution of solved deals
  const ef = []; for (let n = 1; n <= MAX; n++) if (n !== UNSOLVABLE && arr[n] >= 0 && arr[n] < cap) ef.push(arr[n]);
  ef.sort((a, b) => a - b);
  const q = p => ef[Math.min(ef.length - 1, Math.floor(p * ef.length))];
  // 6 tiers by percentile: very easy .. extreme; capped (>=cap) = extreme too
  const TH = [q(0.45), q(0.72), q(0.88), q(0.965), q(0.995)];
  let out = '';
  for (let n = 1; n <= MAX; n++) {
    const v = arr[n]; let t;
    if (n === UNSOLVABLE || v === -1) t = 9;
    else if (v < 0) t = 0;
    else if (v >= cap) t = 6;
    else if (v <= TH[0]) t = 1; else if (v <= TH[1]) t = 2; else if (v <= TH[2]) t = 3;
    else if (v <= TH[3]) t = 4; else if (v <= TH[4]) t = 5; else t = 6;
    out += String(t);
  }
  const js = `/* adFreeCell - precomputed difficulty tiers for deals 1..32000.
 * Generated by tools/rate-diff2.js: search effort (min nodes over the engine's
 * heuristics, with symmetry reduction + safe-autoplay). 6 tiers, finer than before.
 * Tier char: 1 Sehr leicht, 2 Leicht, 3 Mittel, 4 Schwer, 5 Sehr schwer, 6 Extrem,
 * 9 unlösbar, 0 unbekannt.  Node thresholds: ${TH.join(', ')} (cap ${cap}).
 */
window.Difficulty = { tiers: "${out}" };
`;
  fs.writeFileSync(path.join(__dirname, '..', 'js', 'difficulty.js'), js);
  const counts = {}; for (const ch of out) counts[ch] = (counts[ch] || 0) + 1;
  console.log('DONE thresholds', TH, 'counts', counts);
}
