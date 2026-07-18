/* adFreeCell - card model and the classic Microsoft FreeCell deal.
 *
 * FreeCell games are numbered. The very same numbers used by the original
 * Windows FreeCell (1 .. 32000) reproduce the exact same layouts here, using
 * Microsoft's linear-congruential shuffle. That makes every game shareable and
 * repeatable: "Game #617" is the same board for everyone, forever.
 */
(function () {
  'use strict';

  // Suit order matches Microsoft's deck AND the SVG-cards element ids.
  //   0 = clubs, 1 = diamonds, 2 = hearts, 3 = spades
  var SUIT_ID = ['club', 'diamond', 'heart', 'spade'];
  var SUIT_SYMBOL = ['♣', '♦', '♥', '♠']; // ♣ ♦ ♥ ♠
  var RANK_ID = [null, '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'jack', 'queen', 'king'];
  var RANK_LABEL = [null, 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

  // Only game #11982 is unsolvable among Microsoft's classic 1..32000 deals.
  var UNSOLVABLE_CLASSIC = { 11982: true };
  var MAX_CLASSIC = 32000;

  function isRed(card) { return card.suit === 1 || card.suit === 2; }        // diamonds / hearts
  function cardId(card) { return SUIT_ID[card.suit] + '_' + RANK_ID[card.rank]; }
  function cardKey(card) { return card.suit * 13 + card.rank; }              // 1..? unique per card
  function cardLabel(card) { return RANK_LABEL[card.rank] + SUIT_SYMBOL[card.suit]; }

  function makeCard(deckIndex) {
    // Microsoft card value 0..51 -> suit = value % 4, rank = value / 4 + 1
    return { suit: deckIndex % 4, rank: Math.floor(deckIndex / 4) + 1 };
  }

  // Microsoft's PRNG (the classic MS C runtime LCG). Kept in double precision
  // (values stay well under 2^53) so it is exact without 32-bit bitwise tricks.
  function makeRng(seed) {
    var state = seed >>> 0;
    return function next() {
      state = (state * 214013 + 2531011) % 4294967296; // mod 2^32
      return Math.floor(state / 65536) % 32768;         // (state >> 16) & 0x7fff
    };
  }

  /* Deal a game. Returns { number, columns } where columns is 8 arrays of
     cards, bottom (least accessible, index 0) to top (accessible, last). */
  function deal(gameNumber) {
    var n = Math.floor(Number(gameNumber));
    if (!isFinite(n) || n < 1) n = 1;
    var rng = makeRng(n);
    var deck = [];
    for (var i = 0; i < 52; i++) deck.push(i);
    var columns = [[], [], [], [], [], [], [], []];
    var left = 52;
    for (var d = 0; d < 52; d++) {
      var j = rng() % left;
      var value = deck[j];
      deck[j] = deck[left - 1];
      left--;
      columns[d % 8].push(makeCard(value));
    }
    return { number: n, columns: columns };
  }

  /* A random, guaranteed-solvable classic game (1..32000, skipping #11982).
     rngFloat is an injectable 0..1 source so callers can stay deterministic. */
  function randomSolvableNumber(rngFloat) {
    var r = rngFloat || Math.random;
    var n;
    do { n = 1 + Math.floor(r() * MAX_CLASSIC); } while (UNSOLVABLE_CLASSIC[n]);
    return n;
  }

  window.FreeCellDeal = {
    deal: deal,
    makeCard: makeCard,
    isRed: isRed,
    cardId: cardId,
    cardKey: cardKey,
    cardLabel: cardLabel,
    randomSolvableNumber: randomSolvableNumber,
    isSolvableClassic: function (n) { return n >= 1 && n <= MAX_CLASSIC && !UNSOLVABLE_CLASSIC[n]; },
    UNSOLVABLE_CLASSIC: UNSOLVABLE_CLASSIC,
    MAX_CLASSIC: MAX_CLASSIC,
    SUIT_ID: SUIT_ID,
    SUIT_SYMBOL: SUIT_SYMBOL,
    RANK_ID: RANK_ID,
    RANK_LABEL: RANK_LABEL,
  };
})();
