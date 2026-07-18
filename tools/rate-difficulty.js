/* adFreeCell - offline difficulty rating for the classic 1..32000 deals.
 *
 * A memory-safe best-first FreeCell solver. Difficulty is proxied by the search
 * effort (nodes expanded) needed to reach a winnable state; deals that resist
 * the node budget are the hardest tier. #11982 is the one unsolvable deal.
 *
 * Frontier states are stored as compact canonical strings (columns sorted, so
 * symmetric positions collapse) and decoded on expansion, so memory stays bounded.
 *
 * Usage:
 *   node tools/rate-difficulty.js bench [count] [cap]     # quick benchmark
 *   node tools/rate-difficulty.js run [cap]               # full 1..32000 (resumable)
 *
 * Writes checkpoints to tools/difficulty-progress.json and, when finished,
 * js/difficulty.js (compact, one tier char per deal).
 */
'use strict';
const fs = require('fs');
const path = require('path');
global.window = global;
require(path.join(__dirname, '..', 'js', 'deal.js'));
const D = window.FreeCellDeal;

const suitOf = c => (c / 13) | 0, rankOf = c => c % 13 + 1, isRed = c => { const s = (c / 13) | 0; return s === 1 || s === 2; };
const canStack = (a, b) => rankOf(b) === rankOf(a) + 1 && isRed(b) !== isRed(a);

function rootCols(n) { return D.deal(n).columns.map(col => col.map(c => c.suit * 13 + (c.rank - 1))); }

// ----- compact canonical encode / decode -----
function encode(cols, free, found) {
  const parts = [];
  for (let k = 0; k < 8; k++) { let s = ''; const col = cols[k]; for (let j = 0; j < col.length; j++) s += String.fromCharCode(col[j] + 1); parts.push(s); }
  parts.sort();
  let fr = ''; const fs = free.filter(x => x >= 0).sort((a, b) => a - b); for (let i = 0; i < fs.length; i++) fr += String.fromCharCode(fs[i] + 1);
  return parts.join('|') + '/' + fr + '/' +
    String.fromCharCode(found[0] + 1, found[1] + 1, found[2] + 1, found[3] + 1);
}
function decode(key) {
  const slash = key.lastIndexOf('/'), slash2 = key.lastIndexOf('/', slash - 1);
  const colsStr = key.slice(0, slash2), freeStr = key.slice(slash2 + 1, slash), foundStr = key.slice(slash + 1);
  const colParts = colsStr.split('|'), cols = [];
  for (let k = 0; k < 8; k++) { const s = colParts[k] || ''; const col = []; for (let j = 0; j < s.length; j++) col.push(s.charCodeAt(j) - 1); cols.push(col); }
  const free = [-1, -1, -1, -1]; for (let i = 0; i < freeStr.length; i++) free[i] = freeStr.charCodeAt(i) - 1;
  const found = [foundStr.charCodeAt(0) - 1, foundStr.charCodeAt(1) - 1, foundStr.charCodeAt(2) - 1, foundStr.charCodeAt(3) - 1];
  return { cols, free, found };
}

const fsum = f => f[0] + f[1] + f[2] + f[3];
function autoFinish(cols, free, found) {
  const f = found.slice(), cs = cols.map(c => c.slice()), fr = free.slice(); let mv = true, t = fsum(f);
  while (mv) {
    mv = false;
    for (let i = 0; i < 4; i++) { const c = fr[i]; if (c >= 0 && f[suitOf(c)] === rankOf(c) - 1) { f[suitOf(c)]++; fr[i] = -1; t++; mv = true; } }
    for (let k = 0; k < 8; k++) { const col = cs[k]; if (col.length) { const c = col[col.length - 1]; if (f[suitOf(c)] === rankOf(c) - 1) { f[suitOf(c)]++; col.pop(); t++; mv = true; } } }
  }
  return t === 52;
}
function score(cols, free, found) {
  let empt = 0, cell = 0;
  for (let i = 0; i < 4; i++) if (free[i] < 0) cell++;
  for (let k = 0; k < 8; k++) if (cols[k].length === 0) empt++;
  return fsum(found) * 6 + empt * 3 + cell;
}
function genMoves(cols, free, found) {
  const src = [];
  for (let i = 0; i < 4; i++) if (free[i] >= 0) src.push([free[i], 1, i]);
  for (let k = 0; k < 8; k++) { const col = cols[k]; if (col.length) src.push([col[col.length - 1], 0, k]); }
  const fm = [], bm = [], em = [], cm = [];
  let firstEmpty = -1, firstCell = -1;
  for (let k = 0; k < 8; k++) if (cols[k].length === 0) { firstEmpty = k; break; }
  for (let i = 0; i < 4; i++) if (free[i] < 0) { firstCell = i; break; }
  for (let s = 0; s < src.length; s++) {
    const c = src[s][0], ft = src[s][1], fi = src[s][2];
    if (found[suitOf(c)] === rankOf(c) - 1) fm.push([c, ft, fi, 2, suitOf(c)]);
    for (let k = 0; k < 8; k++) { if (ft === 0 && fi === k) continue; const col = cols[k]; if (col.length && canStack(c, col[col.length - 1])) bm.push([c, ft, fi, 0, k]); }
    if (firstEmpty >= 0 && !(ft === 0 && cols[fi].length === 1)) em.push([c, ft, fi, 0, firstEmpty]);
    if (ft === 0 && firstCell >= 0) cm.push([c, ft, fi, 1, firstCell]);
  }
  return fm.concat(bm, em, cm);
}
function apply(m, cols, free, found) { const c = m[0], ft = m[1], fi = m[2], dt = m[3], di = m[4]; if (ft === 1) free[fi] = -1; else cols[fi].pop(); if (dt === 2) found[di]++; else if (dt === 1) free[di] = c; else cols[di].push(c); }
function undo(m, cols, free, found) { const c = m[0], ft = m[1], fi = m[2], dt = m[3], di = m[4]; if (dt === 2) found[di]--; else if (dt === 1) free[di] = -1; else cols[di].pop(); if (ft === 1) free[fi] = c; else cols[fi].push(c); }

const SCORE_MAX = 52 * 6 + 8 * 3 + 4 + 1;
function solve(n, maxNodes) {
  const cols0 = rootCols(n), free0 = [-1, -1, -1, -1], found0 = [0, 0, 0, 0];
  if (autoFinish(cols0, free0, found0)) return { solved: true, nodes: 0 };
  const buckets = new Array(SCORE_MAX); for (let i = 0; i < SCORE_MAX; i++) buckets[i] = [];
  const rootKey = encode(cols0, free0, found0);
  const seen = new Set([rootKey]);
  let top = score(cols0, free0, found0); buckets[top].push(rootKey);
  let nodes = 0;
  while (true) {
    while (top >= 0 && buckets[top].length === 0) top--;
    if (top < 0) return { solved: false, nodes, exhausted: true };
    if (++nodes > maxNodes) return { solved: false, nodes, capped: true };
    const key = buckets[top].pop();
    const st = decode(key), cols = st.cols, free = st.free, found = st.found;
    if (fsum(found) === 52 || autoFinish(cols, free, found)) return { solved: true, nodes };
    const moves = genMoves(cols, free, found);
    for (let i = 0; i < moves.length; i++) {
      apply(moves[i], cols, free, found);
      const ck = encode(cols, free, found);
      if (!seen.has(ck)) { seen.add(ck); let sc = score(cols, free, found); if (sc >= SCORE_MAX) sc = SCORE_MAX - 1; buckets[sc].push(ck); if (sc > top) top = sc; }
      undo(moves[i], cols, free, found);
    }
  }
}

// ---------------- CLI ----------------
const MAX = 32000, UNSOLVABLE = 11982;
const mode = process.argv[2] || 'bench';

if (mode === 'bench') {
  const count = parseInt(process.argv[3] || '120', 10), cap = parseInt(process.argv[4] || '100000', 10);
  const sample = []; for (let i = 0; i < count; i++) sample.push(1 + Math.floor((i / count) * MAX));
  let solved = 0, capped = 0, tot = 0, mx = 0; const t0 = Date.now();
  for (const g of sample) { const r = solve(g, cap); if (r.solved) solved++; else capped++; tot += r.nodes; mx = Math.max(mx, r.nodes); }
  const ms = Date.now() - t0;
  console.log(`bench N=${count} cap=${cap}: solved=${solved} (${(100 * solved / count).toFixed(1)}%) capped=${capped}`);
  console.log(`time=${ms}ms  ${(ms / count).toFixed(1)}ms/game  est32000=${(ms / count * MAX / 1000 / 60).toFixed(1)}min  avgNodes=${Math.round(tot / count)} max=${mx}`);
} else if (mode === 'worker') {
  // worker cap start end id  -> processes [start,end], checkpoints its own file
  const cap = parseInt(process.argv[3], 10), start = parseInt(process.argv[4], 10), end = parseInt(process.argv[5], 10), id = process.argv[6];
  const CP = path.join(__dirname, `diff-part-${id}.json`);
  const LOG = path.join(__dirname, 'difficulty.log');
  let nodes, done;
  if (fs.existsSync(CP)) { const cp = JSON.parse(fs.readFileSync(CP, 'utf8')); nodes = cp.nodes; done = cp.done; }
  else { nodes = new Array(end - start + 1).fill(-2); done = start - 1; }
  const t0 = Date.now();
  for (let n = done + 1; n <= end; n++) {
    if (n === UNSOLVABLE) nodes[n - start] = -1;
    else { const r = solve(n, cap); nodes[n - start] = r.solved ? r.nodes : cap; }
    if (n % 250 === 0 || n === end) {
      fs.writeFileSync(CP, JSON.stringify({ id: id, start: start, end: end, done: n, cap: cap, nodes: nodes }));
      const el = (Date.now() - t0) / 1000, rate = (n - done) / el, eta = (end - n) / rate / 60;
      fs.appendFileSync(LOG, `[w${id}] n=${n}/${end} ${rate.toFixed(1)}/s ETA ${eta.toFixed(0)}m\n`);
    }
  }
  fs.appendFileSync(LOG, `[w${id}] DONE ${start}..${end} in ${((Date.now() - t0) / 60000).toFixed(1)}min\n`);
} else if (mode === 'merge') {
  const cap = parseInt(process.argv[3] || '100000', 10);
  const nodesArr = new Array(MAX + 1).fill(-2);
  const files = fs.readdirSync(__dirname).filter(f => /^diff-part-.*\.json$/.test(f));
  for (const f of files) {
    const cp = JSON.parse(fs.readFileSync(path.join(__dirname, f), 'utf8'));
    for (let n = cp.start; n <= cp.done; n++) nodesArr[n] = cp.nodes[n - cp.start];
  }
  // ---- bucket into tiers and write js/difficulty.js ----
  const solvedNodes = [];
  for (let n = 1; n <= MAX; n++) if (n !== UNSOLVABLE && nodesArr[n] >= 0 && nodesArr[n] < cap) solvedNodes.push(nodesArr[n]);
  solvedNodes.sort((a, b) => a - b);
  const q = p => solvedNodes[Math.min(solvedNodes.length - 1, Math.floor(p * solvedNodes.length))];
  const t1 = q(0.40), t2 = q(0.70), t3 = q(0.90); // Leicht/Mittel/Schwer thresholds; >=cap or >t3 = Experte
  // tier chars: '0'..'4' ; 0=unknown 1=leicht 2=mittel 3=schwer 4=experte, '9'=unsolvable
  let out = '';
  for (let n = 1; n <= MAX; n++) {
    const v = nodesArr[n];
    let t;
    if (n === UNSOLVABLE || v === -1) t = 9;
    else if (v < 0) t = 0;
    else if (v >= cap) t = 4;
    else if (v <= t1) t = 1; else if (v <= t2) t = 2; else if (v <= t3) t = 3; else t = 4;
    out += String(t);
  }
  const js = `/* adFreeCell - precomputed difficulty tiers for deals 1..32000.
 * Generated by tools/rate-difficulty.js (best-first search effort).
 * Tier per deal (1-indexed string): 1 Leicht, 2 Mittel, 3 Schwer, 4 Experte, 9 unlösbar, 0 unbekannt.
 * Thresholds (nodes): t1=${t1} t2=${t2} t3=${t3}, cap=${cap}.
 */
window.Difficulty = { cap: ${cap}, t1: ${t1}, t2: ${t2}, t3: ${t3}, tiers: "${out}" };
`;
  fs.writeFileSync(path.join(__dirname, '..', 'js', 'difficulty.js'), js);
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 9: 0, 0: 0 };
  for (const ch of out) counts[ch]++;
  fs.appendFileSync(path.join(__dirname, 'difficulty.log'), `MERGE DONE. tiers: ${JSON.stringify(counts)}\n`);
  console.log('DONE', counts);
}
