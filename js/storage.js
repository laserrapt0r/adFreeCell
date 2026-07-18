/* adFreeCell - settings, statistics and resume state (localStorage). */
(function () {
  'use strict';

  var KEY = 'adfreecell.save.v1';

  var defaults = {
    lang: null,           // null -> auto-detect
    soundOn: true,
    autoCollect: true,    // auto-send safe cards to the foundations
    oneClick: true,       // single click/tap auto-moves a card to its best spot
    showTimer: true,
    theme: 'felt',        // 'felt' | 'midnight' | 'slate'
    tipShown: false,
    stats: {
      played: 0, won: 0,
      currentStreak: 0, bestStreak: 0,
      bestTimeSec: null, fewestMoves: null,
    },
    solved: {},           // { [gameNumber]: true }
    current: null,        // resume: { number, state, moves, elapsedMs, startedFresh }
  };

  function load() {
    var data = {};
    try { data = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { data = {}; }
    var s = JSON.parse(JSON.stringify(defaults));
    for (var k in defaults) if (k in data) s[k] = data[k];
    // merge nested stats so new fields survive
    s.stats = Object.assign({}, defaults.stats, data.stats || {});
    s.solved = data.solved || {};
    return s;
  }

  var state = load();
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* quota */ } }

  var Storage = {
    get lang() { return state.lang; },
    setLang: function (l) { state.lang = l; persist(); },
    get soundOn() { return state.soundOn; },
    setSound: function (v) { state.soundOn = !!v; persist(); },
    get autoCollect() { return state.autoCollect; },
    setAutoCollect: function (v) { state.autoCollect = !!v; persist(); },
    get oneClick() { return state.oneClick; },
    setOneClick: function (v) { state.oneClick = !!v; persist(); },
    get showTimer() { return state.showTimer; },
    setShowTimer: function (v) { state.showTimer = !!v; persist(); },
    get theme() { return state.theme; },
    setTheme: function (t) { state.theme = t; persist(); },
    get tipShown() { return state.tipShown; },
    setTipShown: function (v) { state.tipShown = !!v; persist(); },

    stats: function () { return Object.assign({}, state.stats); },
    isSolved: function (n) { return !!state.solved[n]; },

    // ---- campaign progress over the classic 1..32000 deals (11982 unsolvable) ----
    solvedCount: function () {
      var n = 0;
      for (var k in state.solved) if (state.solved[k]) n++;
      return n;
    },
    // lowest unsolved solvable deal after `from` (wraps around); null if all solved
    nextUnsolved: function (from) {
      var MAX = 32000, UNS = 11982, start = (from | 0);
      for (var i = 1; i <= MAX; i++) {
        var n = ((start + i - 1) % MAX) + 1;
        if (n !== UNS && !state.solved[n]) return n;
      }
      return null;
    },
    // a random unsolved solvable deal; null if all solved
    randomUnsolved: function (rnd) {
      var MAX = 32000, UNS = 11982, r = rnd || Math.random;
      if (this.solvedCount() >= MAX - 1) return this.nextUnsolved(0);
      for (var tries = 0; tries < 400; tries++) {
        var n = 1 + Math.floor(r() * MAX);
        if (n !== UNS && !state.solved[n]) return n;
      }
      return this.nextUnsolved(Math.floor(r() * MAX));
    },

    // record the outcome of a finished game
    recordResult: function (number, won, timeSec, moves) {
      var st = state.stats;
      st.played++;
      if (won) {
        st.won++;
        st.currentStreak++;
        if (st.currentStreak > st.bestStreak) st.bestStreak = st.currentStreak;
        if (st.bestTimeSec == null || timeSec < st.bestTimeSec) st.bestTimeSec = timeSec;
        if (st.fewestMoves == null || moves < st.fewestMoves) st.fewestMoves = moves;
        state.solved[number] = true;
      } else {
        st.currentStreak = 0;
      }
      persist();
    },

    // resume support
    saveCurrent: function (obj) { state.current = obj; persist(); },
    loadCurrent: function () { return state.current; },
    clearCurrent: function () { state.current = null; persist(); },

    resetAll: function () {
      var lang = state.lang;
      state = JSON.parse(JSON.stringify(defaults));
      state.lang = lang;
      persist();
    },
    resetStats: function () {
      state.stats = JSON.parse(JSON.stringify(defaults.stats));
      state.solved = {};
      persist();
    },
  };

  window.Storage = Storage;
})();
