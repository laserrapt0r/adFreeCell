/* adFreeCell - rendering, input and game flow.
   Cards are absolutely-positioned DOM elements; their target positions are
   computed from the engine state on every render, so the view is always a pure
   function of the state. Input supports both drag-and-drop and tap-to-move. */
(function () {
  'use strict';

  var E = window.FreeCellEngine;
  var D = window.FreeCellDeal;
  var T = function () { return window.I18n.t.apply(null, arguments); };

  // suit index -> foundation slot is the same index: 0 club,1 diamond,2 heart,3 spade
  var SUIT_IS_RED = [false, true, true, false];
  var SUIT_LETTER = ['c', 'd', 'h', 's']; // card artwork file/ids use these

  // ---- element refs ----
  var app = document.getElementById('app');
  var play = document.getElementById('play');
  var cardsLayer = document.getElementById('cards');
  var hudGame = document.getElementById('hud-game');
  var hudMoves = document.getElementById('hud-moves');
  var hudTime = document.getElementById('hud-time');
  var hudTimeWrap = document.getElementById('hud-time-wrap');
  var btnUndo = document.getElementById('btn-undo');
  var btnRedo = document.getElementById('btn-redo');
  var btnAuto = document.getElementById('btn-autofinish');
  var toastEl = document.getElementById('toast');
  var fx = document.getElementById('fx-canvas');

  // ---- runtime state ----
  var state = null;
  var undoStack = [], redoStack = [];
  var cardEls = {};            // uid -> element
  var slotEls = { free: [], foundation: [], column: [] };
  var m = {};                  // layout metrics
  var selected = null;         // { src, uids } tap-selection
  var won = false;
  var finishing = false;
  var timerId = null, startTs = 0, elapsedBase = 0, timing = false;

  // ================= layout =================
  var R = 314 / 225;           // card aspect (h / w)

  function computeMetrics() {
    var W = play.clientWidth, H = play.clientHeight;
    var Ncol = 8;
    var k = 0.15;              // gap as a fraction of card width
    var sg = 0.36;             // gap between top zone and tableau (x card height)
    var L0 = 13;               // design column length used to size cards
    var fr = 0.26;             // max fan as a fraction of card height

    var cwByW = W / (Ncol + (Ncol + 1) * k);
    var cwByH = H / (2 * k + R * (2 + sg + (L0 - 1) * fr));
    var cw = Math.min(cwByW, cwByH);
    cw = Math.max(30, Math.min(cw, 150));

    var gap = k * cw;
    var ch = R * cw;
    var boardW = Ncol * cw + (Ncol - 1) * gap;
    var originX = Math.max(gap, (W - boardW) / 2);
    var topY = gap * 1.2;
    var tableauY = topY + ch + sg * ch;

    // fan adapts to the longest current column so it always fits the height
    var maxLen = 1;
    if (state) for (var c = 0; c < 8; c++) maxLen = Math.max(maxLen, state.tableau[c].length);
    var availH = H - tableauY - gap;
    var fanMax = fr * ch;
    var fan = fanMax;
    if (maxLen > 1) fan = Math.min(fanMax, Math.max(ch * 0.13, (availH - ch) / (maxLen - 1)));

    var colX = [], i;
    for (i = 0; i < 8; i++) colX.push(originX + i * (cw + gap));

    m = {
      W: W, H: H, cw: cw, ch: ch, gap: gap,
      topY: topY, tableauY: tableauY, fan: fan,
      colX: colX,
      freeX: [colX[0], colX[1], colX[2], colX[3]],
      foundX: [colX[4], colX[5], colX[6], colX[7]],
    };
    play.style.setProperty('--cw', cw + 'px');
    play.style.setProperty('--ch', ch + 'px');
  }

  function positionSlots() {
    for (var i = 0; i < 4; i++) {
      place(slotEls.free[i], m.freeX[i], m.topY);
      place(slotEls.foundation[i], m.foundX[i], m.topY);
      place(slotEls.column[i], m.colX[i], m.tableauY);
    }
    for (i = 4; i < 8; i++) place(slotEls.column[i], m.colX[i], m.tableauY);
  }
  function place(el, x, y) { el.style.transform = 'translate(' + x + 'px,' + y + 'px)'; }

  // uid <-> suit/rank helpers (uid = suit*13 + rank, rank 1..13)
  function uidSuit(uid) { return Math.floor((uid - 1) / 13); }
  function uidRank(uid) { return uid - uidSuit(uid) * 13; }

  // where every card should currently sit
  function computePositions() {
    var pos = {};
    var i, c, d, uid;
    for (i = 0; i < 4; i++) if (state.free[i]) pos[state.free[i].uid] = { x: m.freeX[i], y: m.topY, z: 5 };
    for (var suit = 0; suit < 4; suit++) {
      for (var rank = 1; rank <= state.foundations[suit]; rank++) {
        uid = suit * 13 + rank;
        pos[uid] = { x: m.foundX[suit], y: m.topY, z: rank };
      }
    }
    for (c = 0; c < 8; c++) {
      var col = state.tableau[c];
      for (d = 0; d < col.length; d++) {
        pos[col[d].uid] = { x: m.colX[c], y: m.tableauY + d * m.fan, z: 10 + d };
      }
    }
    return pos;
  }

  function render(animate) {
    if (!state) return;
    computeMetrics();
    positionSlots();
    var pos = computePositions();
    for (var uid in cardEls) {
      var el = cardEls[uid];
      var p = pos[uid];
      if (!p) continue;
      if (!animate) el.classList.add('no-anim');
      el.style.transform = 'translate(' + p.x + 'px,' + p.y + 'px)';
      el.style.zIndex = p.z;
      if (!animate) void el.offsetWidth; // flush, then re-enable transition
      if (!animate) el.classList.remove('no-anim');
    }
    updateSuitPips();
  }

  function updateSuitPips() {
    // hide the empty-slot pip when a foundation has cards
    for (var s = 0; s < 4; s++) {
      slotEls.foundation[s].style.opacity = state.foundations[s] > 0 ? '0' : '1';
    }
    for (var i = 0; i < 4; i++) slotEls.free[i].style.opacity = state.free[i] ? '0' : '1';
    for (var c = 0; c < 8; c++) slotEls.column[c].style.opacity = state.tableau[c].length ? '0' : '1';
  }

  // ================= build =================
  function buildSlots() {
    cardsLayer.innerHTML = '';
    slotEls = { free: [], foundation: [], column: [] };
    var SUIT_PIP = D.SUIT_SYMBOL;
    var i, el;
    for (i = 0; i < 4; i++) {
      el = mkSlot('free'); slotEls.free.push(el); cardsLayer.appendChild(el);
    }
    for (i = 0; i < 4; i++) {
      el = mkSlot('foundation ' + (SUIT_IS_RED[i] ? 'suit-red' : 'suit-black'));
      el.innerHTML = '<span class="pip">' + SUIT_PIP[i] + '</span>';
      slotEls.foundation.push(el); cardsLayer.appendChild(el);
    }
    for (i = 0; i < 8; i++) { el = mkSlot('column'); slotEls.column.push(el); cardsLayer.appendChild(el); }
  }
  function mkSlot(cls) { var el = document.createElement('div'); el.className = 'slot ' + cls; return el; }

  function buildCards() {
    // remove old cards, keep slots
    for (var uid in cardEls) if (cardEls[uid].parentNode) cardEls[uid].parentNode.removeChild(cardEls[uid]);
    cardEls = {};
    for (var suit = 0; suit < 4; suit++) {
      for (var rank = 1; rank <= 13; rank++) {
        var id = suit * 13 + rank;
        var el = document.createElement('div');
        el.className = 'card';
        el.dataset.uid = id;
        var svgId = 'card_' + rank + SUIT_LETTER[suit];
        // the card box matches the native 225:314 ratio, so the default
        // preserveAspectRatio (meet) fills it exactly without distortion.
        el.innerHTML = '<svg viewBox="0 0 225 314">' +
          '<use href="#' + svgId + '" xlink:href="#' + svgId + '"/></svg>';
        cardEls[id] = el;
        cardsLayer.appendChild(el);
      }
    }
  }

  // ================= locating cards =================
  function locate(uid) {
    var i, c, d;
    for (i = 0; i < 4; i++) if (state.free[i] && state.free[i].uid === uid) return { kind: 'free', i: i };
    var suit = uidSuit(uid), rank = uidRank(uid);
    if (rank <= state.foundations[suit]) return { kind: 'foundation', suit: suit };
    for (c = 0; c < 8; c++) {
      var col = state.tableau[c];
      for (d = 0; d < col.length; d++) if (col[d].uid === uid) return { kind: 'tableau', col: c, index: d };
    }
    return null;
  }

  // the movable run starting at a card, or null if not grabbable
  function grabbable(uid) {
    var loc = locate(uid);
    if (!loc) return null;
    if (loc.kind === 'free') return { src: { kind: 'free', i: loc.i }, uids: [uid] };
    if (loc.kind === 'tableau') {
      var col = state.tableau[loc.col];
      if (!E.isRun(col, loc.index)) return null;
      var uids = col.slice(loc.index).map(function (c) { return c.uid; });
      return { src: { kind: 'tableau', col: loc.col, index: loc.index }, uids: uids };
    }
    return null; // foundation cards are locked
  }

  // ================= geometry hit-testing for drops =================
  function targetAt(x, y) {
    // top zone
    if (y >= m.topY - m.gap * 0.5 && y <= m.topY + m.ch + m.gap * 0.6) {
      var i;
      for (i = 0; i < 4; i++) if (within(x, m.freeX[i])) return { kind: 'free', i: i };
      for (i = 0; i < 4; i++) if (within(x, m.foundX[i])) return { kind: 'foundation-zone' };
    }
    // tableau zone (anything at or below the tableau start)
    if (y >= m.tableauY - m.gap) {
      for (var c = 0; c < 8; c++) if (within(x, m.colX[c])) return { kind: 'tableau', col: c };
    }
    return null;
  }
  function within(x, slotX) { return x >= slotX - m.gap * 0.5 && x <= slotX + m.cw + m.gap * 0.5; }

  // resolve an abstract target into a concrete destination for a run
  function resolveDest(target, uids) {
    if (!target) return null;
    var lead = { suit: uidSuit(uids[0]), rank: uidRank(uids[0]) };
    if (target.kind === 'foundation-zone') {
      if (uids.length === 1 && E.canToFoundation(state, lead)) return { kind: 'foundation', i: lead.suit };
      return null;
    }
    if (target.kind === 'free') {
      if (uids.length === 1 && !state.free[target.i]) return { kind: 'free', i: target.i };
      // fall back to any empty free cell
      if (uids.length === 1) for (var f = 0; f < 4; f++) if (!state.free[f]) return { kind: 'free', i: f };
      return null;
    }
    if (target.kind === 'tableau') return { kind: 'tableau', col: target.col };
    return null;
  }

  // best automatic destination for a single card (used by tap-to-home / double)
  function autoDest(uid) {
    var suit = uidSuit(uid), rank = uidRank(uid);
    if (E.canToFoundation(state, { suit: suit, rank: rank })) return { kind: 'foundation', i: suit };
    return null;
  }

  // ================= moves =================
  function pushUndo() { undoStack.push(E.clone(state)); if (undoStack.length > 2000) undoStack.shift(); }

  function doMove(src, dst, opts) {
    opts = opts || {};
    var snap = E.clone(state);
    var res = E.applyMove(state, src, dst);
    if (!res.ok) return false;
    if (!opts.noUndoPush) { undoStack.push(snap); redoStack = []; }
    startTiming();
    playMoveSound(dst);
    render(true);
    afterMove(opts.silent);
    return true;
  }

  function playMoveSound(dst) {
    if (dst.kind === 'foundation') window.Sfx.play('foundation');
    else if (dst.kind === 'free') window.Sfx.play('cell');
    else window.Sfx.play('place');
  }

  function afterMove(silent) {
    clearSelection();
    updateHud();
    updateButtons();
    saveCurrent();
    if (E.isWon(state)) { onWin(); return; }
    if (window.Storage.autoCollect && !finishing) { safeSweep(); }
    else { maybeAutoFinish(); }
  }

  // auto-collect obviously-safe cards, one at a time (animated)
  function safeSweep() {
    var mv = E.nextSafeMove(state);
    if (!mv) { maybeAutoFinish(); return; }
    var snap = E.clone(state);
    E.applyMove(state, mv.src, mv.dst);
    undoStack.push(snap); redoStack = [];
    window.Sfx.play('foundation');
    render(true);
    updateHud(); updateButtons(); saveCurrent();
    if (E.isWon(state)) { onWin(); return; }
    setTimeout(safeSweep, 150);
  }

  function maybeAutoFinish() {
    updateButtons();
    if (!won && !finishing && E.canAutoFinish(state) && !E.isWon(state)) {
      finishing = true;
      finishSweep();
    }
  }

  // greedily send everything home (only ever called when the game is winnable)
  function finishSweep() {
    var mv = E.nextFoundationMove(state);
    if (!mv) { finishing = false; if (E.isWon(state)) onWin(); return; }
    var snap = E.clone(state);
    E.applyMove(state, mv.src, mv.dst);
    undoStack.push(snap); redoStack = [];
    window.Sfx.play('foundation');
    render(true);
    updateHud(); updateButtons();
    setTimeout(finishSweep, 110);
  }

  // ================= input =================
  var drag = null;
  var DRAG_THRESH = 6;

  function relPoint(e) {
    var r = play.getBoundingClientRect();
    var pt = (e.touches && e.touches[0]) || e;
    return { x: pt.clientX - r.left, y: pt.clientY - r.top };
  }

  function onPointerDown(e) {
    if (won && !finishing) return;
    if (finishing) return;
    var cardEl = e.target.closest ? e.target.closest('.card') : null;
    var p = relPoint(e);
    if (!cardEl) {
      // tapping empty space / a slot: if we have a selection, treat as a move target
      handleEmptyTap(p);
      return;
    }
    var uid = +cardEl.dataset.uid;
    var g = grabbable(uid);
    if (!g) { // locked card (e.g. foundation) -> ignore, clear selection
      clearSelection();
      return;
    }
    var pos = computePositions();
    var origins = g.uids.map(function (u) { return { uid: u, x: pos[u].x, y: pos[u].y }; });
    drag = {
      uid: uid, g: g, origins: origins,
      startX: p.x, startY: p.y, moved: false,
    };
    window.Sfx.unlock();
    document.addEventListener('pointermove', onPointerMove, { passive: false });
    document.addEventListener('pointerup', onPointerUp);
    e.preventDefault();
  }

  function onPointerMove(e) {
    if (!drag) return;
    var p = relPoint(e);
    var dx = p.x - drag.startX, dy = p.y - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESH) return;
    if (!drag.moved) {
      drag.moved = true;
      window.Sfx.play('pick');
      var zc = 1000;
      drag.g.uids.forEach(function (u) { cardEls[u].classList.add('dragging'); cardEls[u].style.zIndex = zc++; });
      clearSelection();
    }
    e.preventDefault();
    drag.origins.forEach(function (o) {
      cardEls[o.uid].style.transform = 'translate(' + (o.x + dx) + 'px,' + (o.y + dy) + 'px)';
    });
    // live highlight of a valid drop target
    highlightDrop(resolveDest(targetAt(p.x, p.y), drag.g.uids));
  }

  function onPointerUp(e) {
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    if (!drag) return;
    var d = drag; drag = null;
    highlightDrop(null);
    d.g.uids.forEach(function (u) { cardEls[u].classList.remove('dragging'); });

    if (!d.moved) { handleTap(d.uid, d.g); render(true); return; }

    var p = relPoint(e);
    var dest = resolveDest(targetAt(p.x, p.y), d.g.uids);
    if (dest && doMove(d.g.src, dest)) return;
    window.Sfx.play('bad');
    render(true); // snap back
  }

  function handleTap(uid, g) {
    if (selected && sameSrc(selected.src, g.src)) {
      // tapped the selected card again -> send home if possible, else deselect
      if (g.uids.length === 1) {
        var dest = autoDest(uid);
        if (dest) { doMove(g.src, dest); return; }
      }
      clearSelection();
      return;
    }
    if (selected) {
      // try to move the current selection onto this card's column/zone
      var loc = locate(uid);
      var target = null;
      if (loc.kind === 'tableau') target = { kind: 'tableau', col: loc.col };
      else if (loc.kind === 'foundation') target = { kind: 'foundation-zone' };
      else if (loc.kind === 'free') target = { kind: 'free', i: loc.i };
      var dest = resolveDest(target, selected.uids);
      if (dest && doMove(selected.src, dest)) return;
      // otherwise re-select the tapped card
    }
    setSelection(g);
  }

  function handleEmptyTap(p) {
    if (!selected) return;
    var dest = resolveDest(targetAt(p.x, p.y), selected.uids);
    if (dest && doMove(selected.src, dest)) return;
    clearSelection();
    render(true);
  }

  function sameSrc(a, b) {
    if (a.kind !== b.kind) return false;
    if (a.kind === 'free') return a.i === b.i;
    return a.col === b.col && a.index === b.index;
  }
  function setSelection(g) {
    clearSelection();
    selected = g;
    g.uids.forEach(function (u) { cardEls[u].classList.add('selected'); });
  }
  function clearSelection() {
    if (selected) selected.uids.forEach(function (u) { cardEls[u] && cardEls[u].classList.remove('selected'); });
    selected = null;
  }
  function highlightDrop(dest) {
    slotEls.free.concat(slotEls.foundation, slotEls.column).forEach(function (s) { s.classList.remove('drop-ok'); });
    if (!dest) return;
    if (dest.kind === 'free') slotEls.free[dest.i].classList.add('drop-ok');
    else if (dest.kind === 'foundation') slotEls.foundation[dest.i].classList.add('drop-ok');
    else if (dest.kind === 'tableau') slotEls.column[dest.col].classList.add('drop-ok');
  }

  // ================= game lifecycle =================
  function newGame(number, resumeState) {
    won = false; finishing = false;
    undoStack = []; redoStack = [];
    clearSelection();
    stopTiming();
    if (resumeState) {
      state = resumeState.state;
      elapsedBase = resumeState.elapsedMs || 0;
    } else {
      state = E.newGame(number);
      elapsedBase = 0;
    }
    buildCards();
    render(false);
    dealAnimation();
    updateHud(); updateButtons();
    if (resumeState && state.moves > 0) startTiming(); // resumed mid-game -> keep clock
    saveCurrent();
    if (!D.isSolvableClassic(state.number) && state.number === 11982) toast(T('unsolvable'));
  }

  function dealAnimation() {
    // brief staggered entrance from the top-centre
    var pos = computePositions();
    var order = [];
    for (var uid in pos) order.push(+uid);
    order.forEach(function (uid, idx) {
      var el = cardEls[uid];
      el.classList.add('no-anim');
      el.style.transform = 'translate(' + (m.W / 2 - m.cw / 2) + 'px,' + (-m.ch) + 'px)';
      void el.offsetWidth;
      el.classList.remove('no-anim');
      setTimeout(function () {
        el.style.transform = 'translate(' + pos[uid].x + 'px,' + pos[uid].y + 'px)';
        window.Sfx.play('deal');
      }, 8 * idx);
    });
  }

  function restart() {
    if (!state) return;
    newGame(state.number);
  }

  function undo() {
    if (!undoStack.length) return;
    finishing = false;
    redoStack.push(E.clone(state));
    state = undoStack.pop();
    won = false;
    clearSelection();
    render(true);
    updateHud(); updateButtons(); saveCurrent();
  }
  function redo() {
    if (!redoStack.length) return;
    undoStack.push(E.clone(state));
    state = redoStack.pop();
    clearSelection();
    render(true);
    updateHud(); updateButtons(); saveCurrent();
    if (E.isWon(state)) onWin();
  }

  function hint() {
    if (won) return;
    var mv = findHint();
    if (!mv) { toast(T('hintNone')); return; }
    mv.uids.forEach(function (u) {
      cardEls[u].classList.add('hintful');
      setTimeout(function () { cardEls[u].classList.remove('hintful'); }, 1700);
    });
  }

  // a "useful" move: foundation first, then a tableau move that frees space
  function findHint() {
    var i, c;
    // 1) any card that can go home
    var acc = E.accessibleCards(state);
    for (i = 0; i < acc.length; i++) {
      if (E.canToFoundation(state, acc[i].card)) return { uids: [acc[i].card.uid] };
    }
    // 2) a tableau run that can move onto another column
    for (c = 0; c < 8; c++) {
      var col = state.tableau[c];
      for (var d = 0; d < col.length; d++) {
        if (!E.isRun(col, d)) continue;
        var run = col.slice(d);
        for (var t = 0; t < 8; t++) {
          if (t === c) continue;
          var dcol = state.tableau[t];
          var toEmpty = dcol.length === 0;
          if (run.length > E.maxSupermove(state, toEmpty)) continue;
          if (toEmpty || E.canStack(run[0], dcol[dcol.length - 1])) {
            // avoid pointless moves of a full column onto an empty one
            if (toEmpty && d === 0) continue;
            return { uids: run.map(function (x) { return x.uid; }) };
          }
        }
        break; // only the top run of a column is worth checking
      }
    }
    // 3) move a card to a free cell
    for (c = 0; c < 8; c++) {
      var cc = state.tableau[c];
      if (cc.length && E.freeEmptyCount(state) > 0) return { uids: [cc[cc.length - 1].uid] };
    }
    return null;
  }

  function onWin() {
    if (won) return;
    won = true; finishing = false;
    stopTiming();
    var secs = Math.round((elapsedBase) / 1000);
    window.Storage.recordResult(state.number, true, secs, state.moves);
    window.Storage.clearCurrent();
    window.Sfx.play('win');
    document.getElementById('win-msg').textContent = T('wonMsg', { moves: state.moves, time: fmtTime(secs) });
    setTimeout(function () { show('overlay-win'); confetti(); }, 500);
    updateButtons();
  }

  // ================= HUD / timer =================
  function updateHud() {
    hudGame.textContent = '#' + state.number;
    hudMoves.textContent = state.moves;
    hudTimeWrap.style.display = window.Storage.showTimer ? '' : 'none';
    hudTime.textContent = fmtTime(Math.round(elapsedNow() / 1000));
  }
  function updateButtons() {
    btnUndo.disabled = undoStack.length === 0;
    btnRedo.disabled = redoStack.length === 0;
    var canFin = state && !won && !E.isWon(state) && E.canAutoFinish(state);
    btnAuto.classList.toggle('hidden', !canFin);
  }
  function elapsedNow() { return elapsedBase + (timing ? (Date.now() - startTs) : 0); }
  function startTiming() {
    if (timing || won) return;
    timing = true; startTs = Date.now();
    timerId = setInterval(function () { updateHud(); }, 1000);
  }
  function stopTiming() {
    if (timing) { elapsedBase += Date.now() - startTs; timing = false; }
    if (timerId) { clearInterval(timerId); timerId = null; }
  }
  function fmtTime(s) {
    var mm = Math.floor(s / 60), ss = s % 60;
    return mm + ':' + (ss < 10 ? '0' : '') + ss;
  }

  // ================= persistence =================
  function saveCurrent() {
    if (won) return;
    window.Storage.saveCurrent({ number: state.number, state: state, elapsedMs: elapsedNow() });
  }

  // ================= toast & confetti =================
  var toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2200);
  }

  function confetti() {
    var ctx = fx.getContext('2d');
    var dpr = window.devicePixelRatio || 1;
    fx.width = innerWidth * dpr; fx.height = innerHeight * dpr; ctx.scale(dpr, dpr);
    var colors = ['#ffd166', '#37c978', '#ff6b6b', '#7cc7ff', '#f78fb3', '#fff'];
    var parts = [];
    for (var i = 0; i < 160; i++) parts.push({
      x: Math.random() * innerWidth, y: -20 - Math.random() * innerHeight * 0.4,
      vx: (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 4,
      s: 5 + Math.random() * 7, rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.3,
      c: colors[i % colors.length],
    });
    var t0 = Date.now();
    (function frame() {
      var el = Date.now() - t0;
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      parts.forEach(function (p) {
        p.x += p.vx; p.y += p.vy; p.vy += 0.05; p.rot += p.vr;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6); ctx.restore();
      });
      if (el < 3200) requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, innerWidth, innerHeight);
    })();
  }

  // ================= overlays =================
  function show(id) { document.getElementById(id).classList.add('show'); }
  function hide(id) { document.getElementById(id).classList.remove('show'); }

  // ================= wiring =================
  var deferredInstall = null;

  function wire() {
    document.getElementById('btn-new').onclick = function () { openSelect(); };
    document.getElementById('btn-restart').onclick = function () {
      if (state && state.moves > 0 && !won && !confirm(T('restartConfirm'))) return;
      restart();
    };
    btnUndo.onclick = undo;
    btnRedo.onclick = redo;
    document.getElementById('btn-hint').onclick = hint;
    btnAuto.onclick = function () { if (!finishing) { finishing = true; finishSweep(); } };

    document.getElementById('btn-help').onclick = function () { show('overlay-howto'); };
    document.getElementById('btn-howto-close').onclick = function () { hide('overlay-howto'); };
    document.getElementById('btn-stats').onclick = function () { renderStats(); show('overlay-stats'); };
    document.getElementById('btn-stats-close').onclick = function () { hide('overlay-stats'); };
    document.getElementById('btn-stats-reset').onclick = function () {
      if (confirm(T('resetStatsConfirm'))) { window.Storage.resetStats(); renderStats(); }
    };
    document.getElementById('btn-settings').onclick = function () { show('overlay-settings'); };
    document.getElementById('btn-settings-close').onclick = function () { hide('overlay-settings'); };

    // win overlay
    document.getElementById('btn-win-again').onclick = function () { hide('overlay-win'); restart(); };
    document.getElementById('btn-win-next').onclick = function () {
      hide('overlay-win'); newGame(D.randomSolvableNumber());
    };

    // select overlay
    document.getElementById('btn-select-cancel').onclick = function () { hide('overlay-select'); };
    document.getElementById('btn-select-random').onclick = function () {
      document.getElementById('select-number').value = D.randomSolvableNumber();
    };
    document.getElementById('btn-select-start').onclick = function () {
      var v = parseInt(document.getElementById('select-number').value, 10);
      if (!v || v < 1) v = D.randomSolvableNumber();
      hide('overlay-select'); newGame(v);
    };
    document.getElementById('select-number').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') document.getElementById('btn-select-start').click();
    });

    // close overlays by tapping the backdrop
    document.querySelectorAll('.overlay').forEach(function (ov) {
      ov.addEventListener('pointerdown', function (e) { if (e.target === ov && ov.id !== 'overlay-win') ov.classList.remove('show'); });
    });

    // settings controls
    buildLangSelect();
    seg('set-theme', window.Storage.theme, function (v) { window.Storage.setTheme(v); app.dataset.theme = v; });
    seg('set-autocollect', window.Storage.autoCollect ? '1' : '0', function (v) { window.Storage.setAutoCollect(v === '1'); });
    seg('set-sound', window.Storage.soundOn ? '1' : '0', function (v) { window.Storage.setSound(v === '1'); });
    seg('set-timer', window.Storage.showTimer ? '1' : '0', function (v) { window.Storage.setShowTimer(v === '1'); updateHud(); });

    document.getElementById('btn-share').onclick = shareApp;
    var bi = document.getElementById('btn-install');
    bi.onclick = function () { if (deferredInstall) { deferredInstall.prompt(); deferredInstall = null; bi.classList.add('hidden'); } };
    window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferredInstall = e; bi.classList.remove('hidden'); });

    // input on the board
    play.addEventListener('pointerdown', onPointerDown);
    // block the browser context menu / long-press selection on cards
    play.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    // keyboard shortcuts
    document.addEventListener('keydown', function (e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      else if (e.key.toLowerCase() === 'u') undo();
      else if (e.key.toLowerCase() === 'h') hint();
      else if (e.key.toLowerCase() === 'n') openSelect();
    });

    window.addEventListener('resize', function () { render(false); });
    document.addEventListener('i18n:changed', function () { updateHud(); });
    window.addEventListener('beforeunload', saveCurrent);
    document.addEventListener('visibilitychange', function () { if (document.hidden) { saveCurrent(); } });
  }

  function openSelect() {
    document.getElementById('select-number').value = state ? state.number : '';
    show('overlay-select');
    setTimeout(function () { document.getElementById('select-number').focus(); }, 50);
  }

  function seg(id, val, cb) {
    var box = document.getElementById(id);
    box.querySelectorAll('button').forEach(function (b) {
      b.classList.toggle('active', b.dataset.val === String(val));
      b.onclick = function () {
        box.querySelectorAll('button').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        cb(b.dataset.val);
      };
    });
  }

  function buildLangSelect() {
    var sel = document.getElementById('set-lang');
    sel.innerHTML = '';
    window.I18n.supported.forEach(function (code) {
      var o = document.createElement('option');
      o.value = code; o.textContent = window.I18n.names[code] || code;
      if (code === window.I18n.lang) o.selected = true;
      sel.appendChild(o);
    });
    sel.onchange = function () { window.I18n.setLang(sel.value); };
  }

  function renderStats() {
    var s = window.Storage.stats();
    var rate = s.played ? Math.round((s.won / s.played) * 100) : 0;
    var rows = [
      [s.played, T('played')],
      [s.won, T('won')],
      [rate + '%', T('winRate')],
      [s.currentStreak, T('currentStreak')],
      [s.bestStreak, T('bestStreak')],
      [s.bestTimeSec != null ? fmtTime(s.bestTimeSec) : '–', T('bestTime')],
      [s.fewestMoves != null ? s.fewestMoves : '–', T('fewestMoves')],
    ];
    document.getElementById('stats-grid').innerHTML = rows.map(function (r) {
      return '<div class="stat-box"><div class="stat-num">' + r[0] + '</div><div class="stat-cap">' + r[1] + '</div></div>';
    }).join('');
  }

  function shareApp() {
    var url = location.origin + location.pathname;
    var data = { title: 'adFreeCell', text: T('tagline'), url: url };
    if (navigator.share) navigator.share(data).catch(function () {});
    else if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { toast(T('linkCopied')); });
    else toast(url);
  }

  // ================= boot =================
  function boot() {
    if (window.CARDS_SPRITE_INJECT) window.CARDS_SPRITE_INJECT();
    window.I18n.apply(document);
    app.dataset.theme = window.Storage.theme;
    buildSlots();
    wire();

    // deep link ?game=123, else resume, else fresh random
    var params = new URLSearchParams(location.search);
    var g = parseInt(params.get('game'), 10);
    if (g && g > 0) { newGame(g); return; }
    var saved = window.Storage.loadCurrent();
    if (saved && saved.state && !E.isWon(saved.state)) newGame(saved.number, saved);
    else newGame(D.randomSolvableNumber());
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
