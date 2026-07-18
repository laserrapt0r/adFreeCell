/* adFreeCell - self-test. Runs with plain Node, no dependencies:
 *     node tools/test.js
 * Verifies the Microsoft deal, the rules engine, and that the engine permits a
 * full legal solution to a win. */
'use strict';
global.window = global;
require('../js/deal.js');
require('../js/engine.js');
const D = window.FreeCellDeal;
const E = window.FreeCellEngine;

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) pass++; else { fail++; console.log('  FAIL:', name); } }
const C = (suit, rank) => ({ suit, rank, uid: suit * 13 + rank });

// ---------- 1. Deal reproduces Windows FreeCell Game #1 ----------
(function () {
  const SUIT = ['C', 'D', 'H', 'S'], RANK = [null, 'A', '2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K'];
  const lbl = c => RANK[c.rank] + SUIT[c.suit];
  const got = D.deal(1).columns.map(col => col.map(lbl).join(' '));
  const expect = [
    'JD KD 2S 4C 3S 6D 6S', '2D KC KS 5C TD 8S 9C', '9H 9S 9D TS 4S 8D 2H',
    'JC 5S QD QH TH QS 6H', '5D AD JS 4H 8H 6C', '7H QC AS AC 2C 3D',
    '7C KH AH 4D JH 8C', '5H 3H 3C 7S 7D TC',
  ];
  for (let i = 0; i < 8; i++) ok('deal#1 col' + (i + 1), got[i] === expect[i]);
  const all = D.deal(1).columns.flat();
  ok('deal#1 has 52 cards', all.length === 52);
  ok('deal#1 all unique', new Set(all.map(c => c.suit * 13 + c.rank)).size === 52);
})();

// ---------- 2. Engine rules ----------
(function () {
  ok('isRun valid', E.isRun([C(3, 7), C(2, 6), C(0, 5)], 0));
  ok('isRun rejects same colour', !E.isRun([C(3, 7), C(3, 6)], 0));
  ok('isRun rejects rank gap', !E.isRun([C(3, 7), C(2, 5)], 0));
  ok('canStack red6 on black7', E.canStack(C(2, 6), C(3, 7)));
  ok('canStack rejects same colour', !E.canStack(C(0, 6), C(3, 7)));

  const noEmpties = s => { for (let i = 0; i < 8; i++) if (!s.tableau[i].length) s.tableau[i] = [C(0, 13)]; return s; };
  const blank = () => ({ number: 0, moves: 0, free: [null, null, null, null], foundations: [0, 0, 0, 0], tableau: [[], [], [], [], [], [], [], []] });

  let s = noEmpties(blank());
  ok('capacity 4free/0empty = 5', E.maxSupermove(s, false) === 5);
  s.free = [C(0, 2), null, null, null];
  ok('capacity 3free/0empty = 4', E.maxSupermove(s, false) === 4);
  s = blank(); s.tableau[0] = [C(0, 5)];
  ok('capacity 4free/7empty', E.maxSupermove(s, false) === 5 * Math.pow(2, 7));
  ok('capacity to empty halves', E.maxSupermove(s, true) === 5 * Math.pow(2, 6));

  s = blank(); s.tableau[0] = [C(3, 1)];
  ok('ace to foundation', E.applyMove(s, { kind: 'tableau', col: 0, index: 0 }, { kind: 'foundation', i: 3 }).ok && s.foundations[3] === 1);
  s.tableau[1] = [C(3, 4)];
  ok('reject rank gap to foundation', !E.applyMove(s, { kind: 'tableau', col: 1, index: 0 }, { kind: 'foundation', i: 3 }).ok);

  s = noEmpties(blank());
  s.free = [C(0, 2), C(0, 3), C(0, 4), null];   // capacity 2
  s.tableau[0] = [C(3, 7), C(2, 6), C(0, 5)];    // a 3-run
  s.tableau[1] = [C(1, 8)];
  ok('reject 3-run over capacity 2', !E.applyMove(s, { kind: 'tableau', col: 0, index: 0 }, { kind: 'tableau', col: 1 }).ok);
  s.tableau[0] = [C(3, 7), C(2, 6)];             // a 2-run
  ok('allow 2-run at capacity 2', E.applyMove(s, { kind: 'tableau', col: 0, index: 0 }, { kind: 'tableau', col: 1 }).ok);

  s = blank();
  ok('ace always safe', E.isSafeAutoplay({ ...s, foundations: [0, 0, 0, 0] }, C(3, 1)));
  s.foundations = [4, 4, 4, 4];
  ok('heart5 safe when blacks>=4', E.isSafeAutoplay(s, C(2, 5)));
  s.foundations = [3, 4, 4, 4];
  ok('heart5 unsafe when a black=3', !E.isSafeAutoplay(s, C(2, 5)));
})();

// ---------- 3. Engine permits a full solution to a win ----------
function solve(number, maxNodes) {
  const key = s => s.free.map(c => c ? c.uid : 0).slice().sort((a, b) => a - b).join(',') + '/' +
    s.foundations.join(',') + '/' + s.tableau.map(c => c.map(x => x.uid).join('.')).slice().sort().join('|');
  function legal(s) {
    const out = [], acc = E.accessibleCards(s);
    for (const a of acc) if (E.canToFoundation(s, a.card)) out.push({ src: a.src, dst: { kind: 'foundation', i: a.card.suit }, pri: 0 });
    for (let c = 0; c < 8; c++) { const col = s.tableau[c];
      for (let d = 0; d < col.length; d++) { if (!E.isRun(col, d)) continue; const run = col.slice(d), lead = run[0];
        for (let t = 0; t < 8; t++) { if (t === c) continue; const dc = s.tableau[t], empty = dc.length === 0;
          if (run.length > E.maxSupermove(s, empty)) continue;
          if (empty || E.canStack(lead, dc[dc.length - 1])) { if (empty && d === 0) continue;
            out.push({ src: { kind: 'tableau', col: c, index: d }, dst: { kind: 'tableau', col: t }, pri: 1 }); } }
        break; } }
    for (let i = 0; i < 4; i++) { const fc = s.free[i]; if (!fc) continue;
      for (let t = 0; t < 8; t++) { const dc = s.tableau[t], empty = dc.length === 0;
        if (empty || E.canStack(fc, dc[dc.length - 1])) out.push({ src: { kind: 'free', i }, dst: { kind: 'tableau', col: t }, pri: 1 }); } }
    for (let c = 0; c < 8; c++) { const col = s.tableau[c]; if (!col.length) continue;
      for (let i = 0; i < 4; i++) if (!s.free[i]) { out.push({ src: { kind: 'tableau', col: c, index: col.length - 1 }, dst: { kind: 'free', i }, pri: 2 }); break; } }
    return out;
  }
  const seen = new Set([key(E.newGame(number))]);
  const stack = [{ s: E.newGame(number) }]; let nodes = 0;
  while (stack.length) { if (nodes++ > maxNodes) return false;
    const { s } = stack.pop();
    if (E.isWon(s) || E.canAutoFinish(s)) return true;
    legal(s).map(mv => { const ns = E.clone(s); E.applyMove(ns, mv.src, mv.dst); return { ns, k: key(ns), h: ns.foundations.reduce((a, b) => a + b, 0), pri: mv.pri }; })
      .filter(x => !seen.has(x.k)).sort((a, b) => (a.h - b.h) || (b.pri - a.pri))
      .forEach(x => { seen.add(x.k); stack.push({ s: x.ns }); });
  }
  return false;
}
[1, 2, 5, 617, 1000].forEach(n => ok('solvable game #' + n, solve(n, 300000)));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
