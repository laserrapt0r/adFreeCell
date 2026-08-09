/* adFreeCell - HUMAN-oriented difficulty rating for deals 1..32000.
 *
 * Old metric (rate-diff2) measured solver search effort, which tracks how well a
 * search heuristic happens to be guided - not how hard a deal is for a person
 * (and it was computed with a move generator that lacked split-run moves).
 *
 * New metric: FORGIVINGNESS. Simulate a casual-but-competent player many times:
 * greedy human-plausible move choice with randomised tie-breaking, eager (not
 * always safe!) foundation sends, free cells as a fallback, no lookahead. The
 * fraction of simulated games won is the probability that ordinary play wins -
 * high = easy, near zero = you must actually plan. Solver effort (min nodes,
 * fixed engine) is only used to split the very top: "no naive win AND even the
 * solver has to work" = Extrem.
 *
 *   node tools/rate-human.js bench [count]
 *   node tools/rate-human.js worker <start> <end> <id>   # -> diff3-part-<id>.json
 *   node tools/rate-human.js merge                       # -> js/difficulty.js
 */
'use strict';
const fs = require('fs'), path = require('path');
global.window = global;
require(path.join(__dirname, '..', 'js', 'deal.js'));
require(path.join(__dirname, '..', 'js', 'engine.js'));
const E = window.FreeCellEngine;

// ---------- shared helpers (canonical hash reused from rate-diff2) ----------
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
function auto(s) { let sm; while ((sm = E.nextSafeMove(s))) { E.applyMove(s, sm.src, sm.dst); } }

// ---------- the "casual player" policy ----------
// Deterministic seeds per (deal, rollout) so the whole rating is reproducible.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function leadOf(s, mv) { return mv.src.kind === 'free' ? s.free[mv.src.i] : s.tableau[mv.src.col][mv.src.index]; }
function scoreHuman(s, mv, last) {
  const lead = leadOf(s, mv);
  let sc;
  if (mv.dst.kind === 'foundation') {
    // safe sends were already auto-collected, so what's left here is the
    // eager-but-risky send: often taken (the classic human blunder), not always
    sc = 58;
  } else if (mv.dst.kind === 'free') {
    sc = 14;                                     // a stash - used to dig, not as a plan
  } else {
    const dstCol = s.tableau[mv.dst.col];
    if (dstCol.length === 0) {
      sc = 30;                                   // an empty column is precious...
      if (lead.rank === 13) sc += 12;            // ...and kings feel "right" there
    } else {
      sc = 55;                                   // building runs is the bread and butter
    }
  }
  // source bonuses apply to every destination (a cell dump that frees a
  // home-able card is exactly how humans dig)
  if (mv.src.kind === 'tableau') {
    if (mv.src.index === 0) sc += 25;            // empties a column
    else {
      const col = s.tableau[mv.src.col];
      const below = col[mv.src.index - 1];
      if (E.canToFoundation(s, below)) sc += 22; // uncovers a card that can go home
      // digging: if a currently-needed foundation card sits buried under this
      // run, clearing cards off it is THE basic human plan - every step of the
      // dig gets more attractive the closer it gets to the target
      for (let i = mv.src.index - 1; i >= 0; i--) {
        const c = col[i];
        if (s.foundations[c.suit] + 1 === c.rank) {
          sc += Math.max(0, 26 - 4 * (mv.src.index - 1 - i));
          break;
        }
      }
    }
  } else if (mv.src.kind === 'free') {
    sc += 12;                                    // clearing a cell feels good
  }
  // don't immediately shuttle the same card back where it just came from
  if (last && lead.uid === last.uid &&
      ((mv.dst.kind === 'tableau' && last.from.kind === 'tableau' && mv.dst.col === last.from.col) ||
       (mv.dst.kind === 'free' && last.from.kind === 'free'))) sc -= 100;
  return sc;
}
// one simulated game; returns true if won
function rollout(deal, seed) {
  const rnd = mulberry32(seed);
  const s = E.newGame(deal);
  auto(s);
  const visited = new Set([canonHash(s)]);
  let last = null;
  for (let step = 0; step < 400; step++) {
    if (E.isWon(s) || E.canAutoFinish(s)) return true;
    const moves = E.legalMoves(s);
    if (!moves.length) return false;
    // score, then prefer everything close to the best (randomised greedy); with
    // a small probability consider ALL moves - models weaker/experimental play
    const scored = moves.map(mv => ({ mv, sc: scoreHuman(s, mv, last) }));
    scored.sort((x, y) => y.sc - x.sc);
    const sloppy = rnd() < 0.12;
    const margin = sloppy ? 1000 : 25;
    const cut = scored[0].sc - margin;
    const cands = scored.filter(x => x.sc >= cut);
    const rest = scored.filter(x => x.sc < cut);   // fallback: a human stuck on their
    // favourite ideas tries the unattractive moves before giving up
    for (let i = cands.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = cands[i]; cands[i] = cands[j]; cands[j] = t; }
    let applied = false;
    for (const cand of cands.concat(rest)) {
      const ns = E.clone(s);
      if (!E.applyMove(ns, cand.mv.src, cand.mv.dst).ok) continue;
      auto(ns);
      const key = canonHash(ns);
      if (visited.has(key)) continue;             // going in circles - a human notices
      visited.add(key);
      const lead = leadOf(s, cand.mv);
      last = { uid: lead.uid, from: cand.mv.src };
      // adopt ns as the new state (cheap: copy fields over)
      s.free = ns.free; s.foundations = ns.foundations; s.tableau = ns.tableau; s.moves = ns.moves;
      applied = true;
      break;
    }
    if (!applied) return false;                   // truly stuck: every move revisits
  }
  return false;                                   // ran out of patience (move cap)
}
// adaptive win-rate: 16 rollouts; only clearly-not-easy deals get the full 40
function winRate(deal) {
  let w = 0, n = 0;
  for (; n < 16; n++) if (rollout(deal, deal * 1000 + n)) w++;
  if (w >= 12) return { w, n };
  for (; n < 40; n++) if (rollout(deal, deal * 1000 + n)) w++;
  return { w, n };
}

// ---------- solver effort (top-end separator; same as rate-diff2) ----------
function buried(s) { let b = 0; for (let suit = 0; suit < 4; suit++) { const need = s.foundations[suit] + 1; if (need > 13) continue; for (let c = 0; c < 8; c++) { const col = s.tableau[c]; for (let i = 0; i < col.length; i++) { if (col[i].suit === suit && col[i].rank === need) { b += col.length - 1 - i; break; } } } } return b; }
function isBlack(su) { return su === 0 || su === 3; }
function runs(s) { let r = 0; for (let c = 0; c < 8; c++) { const col = s.tableau[c]; for (let i = col.length - 1; i > 0; i--) { const a = col[i], b = col[i - 1]; if (b.rank === a.rank + 1 && (isBlack(b.suit) !== isBlack(a.suit))) r++; else break; } } return r; }
function emc(s) { let e = 0, c = 0; for (let i = 0; i < 4; i++) if (!s.free[i]) c++; for (let k = 0; k < 8; k++) if (!s.tableau[k].length) e++; return [e, c]; }
const H = [
  s => { const [e, c] = emc(s); const v = E.foundationSum(s) * 6 + e * 3 + c - buried(s) * 2 + runs(s) + 40; return v < 0 ? 0 : v; },
  s => { const [e, c] = emc(s); const v = E.foundationSum(s) * 7 + e * 4 + c * 2 - buried(s) * 4 + 90; return v < 0 ? 0 : v; },
  s => { const [e, c] = emc(s); const v = E.foundationSum(s) * 6 + e * 3 + c - buried(s) * 2 + 40; return v < 0 ? 0 : v; },
];
function solveMoves(s) { const m = E.legalMoves(s), o = []; let fe = -1, fc = -1; for (let k = 0; k < 8; k++) if (!s.tableau[k].length) { fe = k; break; } for (let i = 0; i < 4; i++) if (!s.free[i]) { fc = i; break; } for (const mv of m) { const d = mv.dst; if (d.kind === 'tableau' && !s.tableau[d.col].length) { if (d.col !== fe) continue; } else if (d.kind === 'free') { if (d.i !== fc) continue; } o.push(mv); } return o; }
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
const EFFORT_CAP = 45000;
function effort(g) { let e = solve1(g, EFFORT_CAP, H[0]); if (e > 1500) e = Math.min(e, solve1(g, EFFORT_CAP, H[1]), solve1(g, EFFORT_CAP, H[2])); return e; }

// ---------- rate one deal ----------
function rate(g) {
  const { w, n } = winRate(g);
  // solver effort only where it matters: the hard tail (and a thin band above it
  // so the merge step can move thresholds without a re-run)
  const e = (w / n) <= 0.20 ? effort(g) : null;
  return { g, w, n, e };
}

// ---------- tiering (merge step) ----------
const MAX = 32000, UNSOLVABLE = 11982;
// Calibrated against the full-run quantiles. The simulated player is weaker
// than a real casual human (no undo, no reflection), so the rate cuts sit low:
// a deal the bot wins 30% of the time, a person wins nearly always.
function tierOf(r) {
  if (r.g === UNSOLVABLE) return 9;
  const rate = r.w / r.n;
  if (rate >= 0.30) return 1;   // autopilot wins often -> trivial for a person
  if (rate >= 0.10) return 2;
  if (r.w >= 1) return 3;       // naive play wins occasionally -> some care needed
  // Naive play NEVER won -> deliberate play required. How MUCH planning it
  // takes is what the solver effort separates (computed for this whole band):
  const e = r.e == null ? 0 : r.e;
  if (e < 150) return 3;        // near-greedy solvable: one small idea, likely a bot blind spot
  if (e < 1200) return 4;       // you must actually think, structure still simple
  if (e < 8000) return 5;       // genuine planning
  return 6;                     // Extrem: no naive wins AND even the solver sweats
}

const mode = process.argv[2] || 'bench';
if (mode === 'bench') {
  const count = parseInt(process.argv[3] || '30', 10);
  const anchors = [1, 164, 617, 1941, 6182, 10692, 11982, 21278, 25904, 26576, 29596, 30057];
  const picks = new Set(anchors);
  let g = 5; while (picks.size < count + anchors.length) { picks.add(g); g += 997; }
  const t0 = Date.now();
  for (const d of [...picks].sort((a, b) => a - b)) {
    const t1 = Date.now();
    const r = rate(d);
    console.log(`#${d}\twin ${r.w}/${r.n}\teffort ${r.e == null ? '-' : r.e}\ttier ${tierOf(r)}\t${Date.now() - t1}ms`);
  }
  console.log(`total ${(Date.now() - t0) / 1000}s for ${picks.size} deals -> est. full run: ${Math.round((Date.now() - t0) / picks.size * MAX / 1000 / 60)} CPU-min`);
} else if (mode === 'worker') {
  const start = parseInt(process.argv[3], 10), end = parseInt(process.argv[4], 10), id = process.argv[5];
  const OUT = path.join(__dirname, `diff3-part-${id}.json`);
  const CP = path.join(__dirname, `diff3-part-${id}.progress.json`);
  const out = {};
  let n = 0;
  for (let d = start; d <= end; d++) {
    out[d] = rate(d);
    if (++n % 50 === 0) fs.writeFileSync(CP, JSON.stringify({ start, end, done: n }));
  }
  fs.writeFileSync(OUT, JSON.stringify(out));
  fs.writeFileSync(CP, JSON.stringify({ start, end, done: n, finished: true }));
} else if (mode === 'merge') {
  const parts = fs.readdirSync(__dirname).filter(f => /^diff3-part-\d+\.json$/.test(f));
  const all = {};
  for (const f of parts) Object.assign(all, JSON.parse(fs.readFileSync(path.join(__dirname, f), 'utf8')));
  let tiers = '';
  const dist = {};
  for (let d = 1; d <= MAX; d++) {
    const r = all[d];
    if (!r) { console.error('missing deal', d); process.exit(1); }
    const t = tierOf(r);
    dist[t] = (dist[t] || 0) + 1;
    tiers += t;
  }
  console.log('distribution:', dist);
  for (const a of [1, 1941, 6182, 10692, 11982, 21278, 26576, 29596, 30057]) {
    const r = all[a];
    console.log(`anchor #${a}: win ${r.w}/${r.n} effort ${r.e == null ? '-' : r.e} -> tier ${tiers[a - 1]}`);
  }
  const js = `/* adFreeCell - precomputed difficulty tiers for deals 1..32000.
 * Generated by tools/rate-human.js: HUMAN-oriented forgivingness metric.
 * Primary signal: Monte-Carlo win rate of a casual-but-competent simulated
 * player (greedy human-plausible heuristics, randomised tie-breaks, eager
 * foundation sends, no lookahead; 16-40 rollouts/deal, fixed seeds, engine
 * with the split-run move fix). Secondary (top end only): solver min-node
 * effort - "no naive win AND the solver sweats" = Extrem.
 * Tier char: 1 Sehr leicht (naive win rate >= 30%), 2 Leicht (>= 10%),
 * 3 Mittel (any naive win, or 0 wins + effort < 150), 4 Schwer (0 wins +
 * effort < 1200), 5 Sehr schwer (< 8000), 6 Extrem (>= 8000), 9 unlösbar.
 * Not uniformly distributed by design.
 */
window.Difficulty = { tiers: ${JSON.stringify(tiers)} };
`;
  fs.writeFileSync(path.join(__dirname, '..', 'js', 'difficulty.js'), js);
  console.log('wrote js/difficulty.js');
}
