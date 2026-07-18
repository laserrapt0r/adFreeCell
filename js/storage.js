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
