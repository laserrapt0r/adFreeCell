/* adFreeCell - the FreeCell rules engine (no DOM, fully testable).
 *
 * Standard FreeCell rules:
 *  - 52 cards dealt face up into 8 tableau columns.
 *  - 4 free cells (each holds one card) and 4 foundations (one per suit).
 *  - Tableau builds down in alternating colours; foundations build up by suit
 *    from Ace to King.
 *  - You move one card at a time. Moving a run of several cards at once is a
 *    convenience for a sequence of single moves and is therefore limited to
 *    (1 + free cells) x 2^(empty columns) cards - halved when the target is an
 *    empty column. The game never lets you make a move you couldn't do by hand.
 */
(function () {
  'use strict';

  var Deal = window.FreeCellDeal;
  var isRed = Deal.isRed;

  function newGame(number) {
    var dealt = Deal.deal(number);
    var tableau = dealt.columns.map(function (col) {
      return col.map(function (c) {
        // stable per-card id for the view layer; cards never mutate
        return { suit: c.suit, rank: c.rank, uid: c.suit * 13 + c.rank };
      });
    });
    return {
      number: dealt.number,
      free: [null, null, null, null],
      foundations: [0, 0, 0, 0], // top rank per suit (0 = empty)
      tableau: tableau,
      moves: 0,
    };
  }

  function clone(s) {
    return {
      number: s.number,
      moves: s.moves,
      free: s.free.slice(),
      foundations: s.foundations.slice(),
      tableau: s.tableau.map(function (c) { return c.slice(); }),
    };
  }

  function freeEmptyCount(s) {
    var n = 0;
    for (var i = 0; i < 4; i++) if (!s.free[i]) n++;
    return n;
  }
  function emptyColCount(s) {
    var n = 0;
    for (var i = 0; i < 8; i++) if (s.tableau[i].length === 0) n++;
    return n;
  }

  // Largest run you may move in one action. If the destination is an empty
  // column it cannot double as a manoeuvring space, so capacity halves.
  function maxSupermove(s, toEmptyColumn) {
    var empty = emptyColCount(s);
    if (toEmptyColumn && empty > 0) empty -= 1;
    return (1 + freeEmptyCount(s)) * Math.pow(2, empty);
  }

  // Do cards[i..end] form a valid descending, alternating-colour run?
  function isRun(cards, start) {
    for (var i = start; i < cards.length - 1; i++) {
      var a = cards[i], b = cards[i + 1];
      if (a.rank !== b.rank + 1) return false;
      if (isRed(a) === isRed(b)) return false;
    }
    return true;
  }

  function canStack(card, onto) {
    return onto.rank === card.rank + 1 && isRed(onto) !== isRed(card);
  }
  function canToFoundation(s, card) {
    return s.foundations[card.suit] === card.rank - 1;
  }

  /* Collect the cards a source refers to (a single card, or a tableau run).
     Returns null if the reference is not a legal pick-up. */
  function pickup(s, src) {
    if (src.kind === 'free') {
      var fc = s.free[src.i];
      return fc ? [fc] : null;
    }
    if (src.kind === 'tableau') {
      var col = s.tableau[src.col];
      if (src.index < 0 || src.index >= col.length) return null;
      if (!isRun(col, src.index)) return null;
      return col.slice(src.index);
    }
    return null;
  }

  /* Validate + apply a move. Mutates s on success. Returns a result object
     { ok, run, from, to } (run = array of moved cards) or { ok:false }. */
  function applyMove(s, src, dst) {
    var run = pickup(s, src);
    if (!run) return { ok: false };
    var lead = run[0];

    // destination checks
    if (dst.kind === 'foundation') {
      if (run.length !== 1) return { ok: false };
      if (dst.i !== lead.suit || !canToFoundation(s, lead)) return { ok: false };
    } else if (dst.kind === 'free') {
      if (run.length !== 1 || s.free[dst.i]) return { ok: false };
    } else if (dst.kind === 'tableau') {
      var col = s.tableau[dst.col];
      var toEmpty = col.length === 0;
      // no-op move onto itself
      if (src.kind === 'tableau' && src.col === dst.col) return { ok: false };
      if (!toEmpty && !canStack(lead, col[col.length - 1])) return { ok: false };
      if (run.length > maxSupermove(s, toEmpty)) return { ok: false };
    } else {
      return { ok: false };
    }

    // remove from source
    if (src.kind === 'free') s.free[src.i] = null;
    else s.tableau[src.col].length = src.index;

    // add to destination
    if (dst.kind === 'foundation') s.foundations[dst.i] = lead.rank;
    else if (dst.kind === 'free') s.free[dst.i] = lead;
    else for (var k = 0; k < run.length; k++) s.tableau[dst.col].push(run[k]);

    s.moves++;
    return { ok: true, run: run, from: src, to: dst };
  }

  function isWon(s) {
    return s.foundations[0] === 13 && s.foundations[1] === 13 &&
           s.foundations[2] === 13 && s.foundations[3] === 13;
  }

  // The classic "safe" auto-play test: sending this card home can never strip a
  // card another column still needs.
  function isSafeAutoplay(s, card) {
    if (!canToFoundation(s, card)) return false;
    var r = card.rank;
    if (r <= 2) return true; // aces & twos are always safe
    var f = s.foundations;
    var red = isRed(card);
    var opp = red ? [0, 3] : [1, 2];           // opposite-colour suits
    var sameOther = red ? (card.suit === 1 ? 2 : 1) : (card.suit === 0 ? 3 : 0);
    var oppMin = Math.min(f[opp[0]], f[opp[1]]);
    return oppMin >= r - 1 && f[sameOther] >= r - 2;
  }

  // Every accessible card (free cells + column tops), with its source.
  function accessibleCards(s) {
    var out = [];
    for (var i = 0; i < 4; i++) if (s.free[i]) out.push({ card: s.free[i], src: { kind: 'free', i: i } });
    for (var c = 0; c < 8; c++) {
      var col = s.tableau[c];
      if (col.length) out.push({ card: col[col.length - 1], src: { kind: 'tableau', col: c, index: col.length - 1 } });
    }
    return out;
  }

  // One safe auto-collect move, or null.
  function nextSafeMove(s) {
    var acc = accessibleCards(s);
    for (var i = 0; i < acc.length; i++) {
      if (isSafeAutoplay(s, acc[i].card)) return { src: acc[i].src, dst: { kind: 'foundation', i: acc[i].card.suit } };
    }
    return null;
  }

  // One greedy foundation move (ignores safety), or null - used for auto-finish.
  function nextFoundationMove(s) {
    var acc = accessibleCards(s);
    for (var i = 0; i < acc.length; i++) {
      if (canToFoundation(s, acc[i].card)) return { src: acc[i].src, dst: { kind: 'foundation', i: acc[i].card.suit } };
    }
    return null;
  }

  // Can the whole game be finished with foundation-only moves from here?
  function canAutoFinish(s) {
    var t = clone(s);
    var m;
    while ((m = nextFoundationMove(t))) applyMove(t, m.src, m.dst);
    return isWon(t);
  }

  function foundationSum(s) { return s.foundations[0] + s.foundations[1] + s.foundations[2] + s.foundations[3]; }

  // All legal moves from a state, as { src, dst } objects.
  function legalMoves(s) {
    var out = [], i, c, t;
    var acc = accessibleCards(s);
    for (i = 0; i < acc.length; i++)
      if (canToFoundation(s, acc[i].card)) out.push({ src: acc[i].src, dst: { kind: 'foundation', i: acc[i].card.suit } });
    for (c = 0; c < 8; c++) {
      var col = s.tableau[c];
      for (var d = 0; d < col.length; d++) {
        if (!isRun(col, d)) continue;
        var run = col.slice(d), lead = run[0];
        for (t = 0; t < 8; t++) {
          if (t === c) continue;
          var dc = s.tableau[t], empty = dc.length === 0;
          if (run.length > maxSupermove(s, empty)) continue;
          if (empty || canStack(lead, dc[dc.length - 1])) {
            if (empty && d === 0) continue; // moving a whole column onto empty is pointless
            out.push({ src: { kind: 'tableau', col: c, index: d }, dst: { kind: 'tableau', col: t } });
          }
        }
        break; // only the topmost movable run of a column
      }
    }
    for (i = 0; i < 4; i++) {
      var fc = s.free[i]; if (!fc) continue;
      for (t = 0; t < 8; t++) {
        var dc2 = s.tableau[t], empty2 = dc2.length === 0;
        if (empty2 || canStack(fc, dc2[dc2.length - 1])) out.push({ src: { kind: 'free', i: i }, dst: { kind: 'tableau', col: t } });
      }
    }
    for (c = 0; c < 8; c++) {
      var cc = s.tableau[c]; if (!cc.length) continue;
      for (i = 0; i < 4; i++) if (!s.free[i]) { out.push({ src: { kind: 'tableau', col: c, index: cc.length - 1 }, dst: { kind: 'free', i: i } }); break; }
    }
    return out;
  }

  function stateKey(st) {
    return st.free.map(function (c) { return c ? c.uid : 0; }).sort(function (a, b) { return a - b; }).join(',') + '/' +
      st.foundations.join(',') + '/' +
      st.tableau.map(function (col) { return col.map(function (x) { return x.uid; }).join('.'); }).sort().join('|');
  }

  /* Greedy best-first search for a move that leads to a win. Returns
     { solved:true, move } (move may be null if already essentially won),
     { capped:true } if the node budget ran out, or
     { unsolvable:true } if the whole reachable space was explored with no win. */
  function findSolutionMove(s, maxNodes) {
    maxNodes = maxNodes || 50000;
    if (isWon(s)) return { solved: true, move: null };
    var start = clone(s);
    var seen = {}; seen[stateKey(start)] = true;
    var stack = [{ s: start, first: null }];
    var nodes = 0;
    while (stack.length) {
      if (nodes++ > maxNodes) return { capped: true };
      var node = stack.pop(), st = node.s;
      if (isWon(st) || (foundationSum(st) >= 36 && canAutoFinish(st))) return { solved: true, move: node.first };
      var moves = legalMoves(st);
      var cands = [];
      for (var i = 0; i < moves.length; i++) {
        var ns = clone(st);
        applyMove(ns, moves[i].src, moves[i].dst);
        var k = stateKey(ns);
        if (seen[k]) continue;
        cands.push({ ns: ns, k: k, h: foundationSum(ns), mv: moves[i] });
      }
      cands.sort(function (a, b) { return a.h - b.h; }); // best (highest foundations) popped first
      for (var j = 0; j < cands.length; j++) {
        seen[cands[j].k] = true;
        stack.push({ s: cands[j].ns, first: node.first || cands[j].mv });
      }
    }
    return { unsolvable: true };
  }

  // Full move sequence to a winnable state (for "watch the solution"), or null.
  // Best-first by foundation progress with parent pointers -> a directed,
  // much shorter solution than a depth-first dive, and memory-light.
  function solvePath(s, maxNodes) {
    maxNodes = maxNodes || 60000;
    if (isWon(s)) return [];
    var start = clone(s);
    var seen = {}; seen[stateKey(start)] = true;
    var nodeMove = [null], nodeParent = [-1]; // per node index (for path reconstruction)
    var buckets = []; for (var b = 0; b < 53; b++) buckets.push([]);
    var top = foundationSum(start); buckets[top].push({ idx: 0, s: start });
    var nodes = 0;
    function recon(idx) { var p = []; for (var j = idx; j > 0; j = nodeParent[j]) p.push(nodeMove[j]); return p.reverse(); }
    while (true) {
      while (top >= 0 && buckets[top].length === 0) top--;
      if (top < 0) return null;
      if (nodes++ > maxNodes) return null;
      var node = buckets[top].pop(), st = node.s;
      if (isWon(st) || (foundationSum(st) >= 36 && canAutoFinish(st))) return recon(node.idx);
      var moves = legalMoves(st);
      for (var i = 0; i < moves.length; i++) {
        var ns = clone(st);
        applyMove(ns, moves[i].src, moves[i].dst);
        var k = stateKey(ns);
        if (seen[k]) continue;
        seen[k] = true;
        var ni = nodeMove.length;
        nodeMove.push(moves[i]); nodeParent.push(node.idx);
        var f = foundationSum(ns);
        buckets[f].push({ idx: ni, s: ns });
        if (f > top) top = f;
      }
    }
  }

  window.FreeCellEngine = {
    newGame: newGame,
    clone: clone,
    applyMove: applyMove,
    pickup: pickup,
    isRun: isRun,
    canStack: canStack,
    canToFoundation: canToFoundation,
    maxSupermove: maxSupermove,
    freeEmptyCount: freeEmptyCount,
    emptyColCount: emptyColCount,
    isWon: isWon,
    isSafeAutoplay: isSafeAutoplay,
    accessibleCards: accessibleCards,
    nextSafeMove: nextSafeMove,
    nextFoundationMove: nextFoundationMove,
    canAutoFinish: canAutoFinish,
    foundationSum: foundationSum,
    legalMoves: legalMoves,
    findSolutionMove: findSolutionMove,
    solvePath: solvePath,
  };
})();
