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
  };
})();
