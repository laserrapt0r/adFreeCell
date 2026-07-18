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
  var RANK_LABEL = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']; // screen-reader rank text

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
  var lastMove = null;         // { uid, src, dst } - for hint anti-oscillation
  var hintTimer = null, hintRAF = 0;
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

    // pull the free-cell group left and the foundation group right so the two
    // sets of four read as clearly separate (uses spare horizontal margin)
    var sep = Math.min(cw * 0.55, Math.max(0, originX - gap));
    m = {
      W: W, H: H, cw: cw, ch: ch, gap: gap,
      topY: topY, tableauY: tableauY, fan: fan,
      colX: colX,
      freeX: [colX[0] - sep, colX[1] - sep, colX[2] - sep, colX[3] - sep],
      foundX: [colX[4] + sep, colX[5] + sep, colX[6] + sep, colX[7] + sep],
    };
    if (window.Storage.lefty) { var sw = m.freeX; m.freeX = m.foundX; m.foundX = sw; } // free cells right, foundations left
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
        el.className = 'card' + (SUIT_IS_RED[suit] ? ' red-suit' : ' black-suit');
        el.dataset.uid = id;
        el.setAttribute('role', 'img');
        el.setAttribute('aria-label', cardName(id));
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

  // ---------- screen-reader announcements ----------
  var srLive = null, srNonce = 0;
  function announce(msg) {
    if (!srLive) srLive = document.getElementById('sr-live');
    if (srLive) srLive.textContent = msg + (srNonce++ % 2 ? ' ' : ''); // vary so repeats re-read
  }
  function cardOf(uid) { uid = +uid; return { suit: Math.floor((uid - 1) / 13), rank: ((uid - 1) % 13) + 1 }; }
  function cardName(uidOrCard) {
    var c = (uidOrCard && typeof uidOrCard === 'object') ? uidOrCard : cardOf(uidOrCard);
    return RANK_LABEL[c.rank] + ' ' + T('srSuits')[c.suit];
  }
  function destPhrase(dst) {
    if (dst.kind === 'foundation') return T('srFoundation');
    if (dst.kind === 'free') return T('srFree');
    return T('srColumn') + ' ' + (dst.col + 1);
  }
  function kbDesc() { // what the keyboard cursor is currently on
    if (kb.row === 'top') {
      if (kb.i < 4) { var f = state.free[kb.i]; return T('srFree') + ' ' + (kb.i + 1) + ', ' + (f ? cardName(f) : T('srEmpty')); }
      var s = kb.i - 4, top = state.foundations[s];
      return T('srFoundation') + ' ' + T('srSuits')[s] + ', ' + (top ? RANK_LABEL[top] : T('srEmpty'));
    }
    var col = state.tableau[kb.i];
    return T('srColumn') + ' ' + (kb.i + 1) + ', ' + (col.length ? cardName(col[col.length - 1]) : T('srEmpty'));
  }

  function doMove(src, dst, opts) {
    opts = opts || {};
    var snap = E.clone(state);
    var res = E.applyMove(state, src, dst);
    if (!res.ok) return false;
    lastMove = { uid: res.run[0].uid, src: src, dst: dst };
    if (!opts.noUndoPush) { undoStack.push(snap); redoStack = []; }
    announce(cardName(res.run[0]) + ' ' + T('srTo') + ' ' + destPhrase(dst));
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
    clearHintVisual();
    updateHud();
    updateButtons();
    saveCurrent();
    scheduleDeadEndCheck();
    if (E.isWon(state)) { onWin(); return; }
    if (window.Storage.autoCollect && !finishing) { safeSweep(); }
    else { maybeAutoFinish(); }
  }

  // Warn (debounced) when the position is provably unwinnable. The solver only
  // returns "unsolvable" when it can exhaust the reachable space within the cap,
  // i.e. in genuinely dead (usually late-game) positions.
  var deadEndTimer = null, deadEndShown = false;
  function scheduleDeadEndCheck() {
    if (deadEndTimer) { clearTimeout(deadEndTimer); deadEndTimer = null; }
    if (!window.Storage.deadEndWarn || !state || won || finishing) { setDeadEnd(false); return; }
    deadEndTimer = setTimeout(function () {
      if (won || finishing || !state || !window.Storage.deadEndWarn) return;
      var res = E.findSolutionMove(state, 30000);
      setDeadEnd(!!res.unsolvable);
    }, 450);
  }
  function setDeadEnd(on) {
    var el = document.getElementById('hud-deadend');
    if (el) el.classList.toggle('hidden', !on);
    if (on && !deadEndShown) { toast(T('deadEnd')); announce(T('deadEnd')); deadEndShown = true; }
    else if (!on) deadEndShown = false;
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
    updateHud(); updateButtons(); saveCurrent(); scheduleDeadEndCheck();
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
    clearHintVisual();
    if (kb.active) kbHide();
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
      // reveal the placeholder behind the picked-up cards right away if the
      // source becomes empty (render() restores the correct state on drop)
      var src = drag.g.src;
      if (src.kind === 'free') slotEls.free[src.i].style.opacity = '1';
      else if (src.kind === 'tableau' && src.index === 0) slotEls.column[src.col].style.opacity = '1';
      clearSelection();
      highlightLegalTargets(drag.g);
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
    clearLegalTargets();
    d.g.uids.forEach(function (u) { cardEls[u].classList.remove('dragging'); });

    if (!d.moved) { handleTap(d.uid, d.g); render(true); return; }

    var p = relPoint(e);
    var dest = resolveDest(targetAt(p.x, p.y), d.g.uids);
    if (dest && doMove(d.g.src, dest)) return;
    window.Sfx.play('bad');
    render(true); // snap back
  }

  function oneClick() { return window.Storage.oneClick; }

  var lastTapUid = -1, lastTapTime = 0;
  // double-click/tap a card -> fly it home if it can go to a foundation,
  // otherwise into the first open free cell
  function doubleClickAction(uid) {
    clearSelection();
    var g = grabbable(uid);
    if (!g || g.uids.length !== 1) return;
    var dest = autoDest(uid); // foundation if legal
    if (!dest) { for (var i = 0; i < 4; i++) if (!state.free[i]) { dest = { kind: 'free', i: i }; break; } }
    if (dest) doMove(g.src, dest); else window.Sfx.play('bad');
  }

  function handleTap(uid, g) {
    var now = Date.now();
    if (uid === lastTapUid && now - lastTapTime < 350) { lastTapUid = -1; doubleClickAction(uid); return; }
    lastTapUid = uid; lastTapTime = now;
    // with an active selection, a tap on a different card = move there
    if (selected && !sameSrc(selected.src, g.src)) {
      var loc = locate(uid);
      var target = loc.kind === 'tableau' ? { kind: 'tableau', col: loc.col }
        : loc.kind === 'foundation' ? { kind: 'foundation-zone' } : { kind: 'free', i: loc.i };
      var dest = resolveDest(target, selected.uids);
      if (dest && doMove(selected.src, dest)) return;
      // fall through and treat the tapped card fresh
    }
    // tapped the already-selected card again
    if (selected && sameSrc(selected.src, g.src)) {
      if (!oneClick() && g.uids.length === 1) {
        var d = autoDest(uid); if (d) { doMove(g.src, d); return; }
      }
      clearSelection();
      return;
    }
    // no usable selection: one-click auto-moves; otherwise select
    if (oneClick()) {
      var auto = bestAutoDest(g);
      if (auto && doMove(g.src, auto)) return;
      // nowhere obvious -> select so the user can pick (e.g. a free cell)
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
    highlightLegalTargets(g);
    announce(cardName(g.uids[0]) + (g.uids.length > 1 ? ' +' + (g.uids.length - 1) : '') + ', ' + T('srSelected'));
  }
  function clearSelection() {
    if (selected) selected.uids.forEach(function (u) { cardEls[u] && cardEls[u].classList.remove('selected'); });
    selected = null;
    clearLegalTargets();
  }
  function highlightDrop(dest) {
    slotEls.free.concat(slotEls.foundation, slotEls.column).forEach(function (s) { s.classList.remove('drop-ok'); });
    if (!dest) return;
    if (dest.kind === 'free') slotEls.free[dest.i].classList.add('drop-ok');
    else if (dest.kind === 'foundation') slotEls.foundation[dest.i].classList.add('drop-ok');
    else if (dest.kind === 'tableau') slotEls.column[dest.col].classList.add('drop-ok');
  }

  // ---- highlight every legal destination for a picked-up run ----
  function highlightLegalTargets(g) {
    clearLegalTargets();
    var lead = { suit: uidSuit(g.uids[0]), rank: uidRank(g.uids[0]) };
    var one = g.uids.length === 1;
    if (one && E.canToFoundation(state, lead)) slotEls.foundation[lead.suit].classList.add('legal-target');
    if (one) for (var i = 0; i < 4; i++)
      if (!state.free[i] && !(g.src.kind === 'free' && g.src.i === i)) slotEls.free[i].classList.add('legal-target');
    for (var c = 0; c < 8; c++) {
      if (g.src.kind === 'tableau' && g.src.col === c) continue;
      var col = state.tableau[c];
      if (col.length === 0) {
        if (g.uids.length <= E.maxSupermove(state, true) && !(g.src.kind === 'tableau' && g.src.index === 0))
          slotEls.column[c].classList.add('legal-target');
      } else if (E.canStack(lead, col[col.length - 1]) && g.uids.length <= E.maxSupermove(state, false)) {
        cardEls[col[col.length - 1].uid].classList.add('legal-target');
      }
    }
  }
  function clearLegalTargets() {
    for (var u in cardEls) cardEls[u].classList.remove('legal-target');
    slotEls.free.concat(slotEls.foundation, slotEls.column).forEach(function (s) { s.classList.remove('legal-target'); });
  }

  // best automatic destination for a click/tap: foundation, then a tableau build
  function bestAutoDest(g) {
    var lead = { suit: uidSuit(g.uids[0]), rank: uidRank(g.uids[0]) };
    if (g.uids.length === 1 && E.canToFoundation(state, lead)) return { kind: 'foundation', i: lead.suit };
    var emptyCol = -1;
    for (var c = 0; c < 8; c++) {
      if (g.src.kind === 'tableau' && g.src.col === c) continue;
      var col = state.tableau[c];
      if (col.length === 0) { if (emptyCol < 0) emptyCol = c; continue; }
      if (E.canStack(lead, col[col.length - 1]) && g.uids.length <= E.maxSupermove(state, false)) return { kind: 'tableau', col: c };
    }
    if (emptyCol >= 0 && g.uids.length <= E.maxSupermove(state, true) && !(g.src.kind === 'tableau' && g.src.index === 0))
      return { kind: 'tableau', col: emptyCol };
    return null;
  }

  // ---------- keyboard control (cursor + Enter, reusing selection/move) ----------
  var kb = { active: false, row: 'tab', i: 0 }; // row 'top' (free/foundation) or 'tab' (columns), i 0..7
  function kbElement() {
    if (kb.row === 'top') return kb.i < 4 ? slotEls.free[kb.i] : slotEls.foundation[kb.i - 4];
    var col = state.tableau[kb.i];
    return col.length ? cardEls[col[col.length - 1].uid] : slotEls.column[kb.i];
  }
  function paintCursor() {
    for (var u in cardEls) cardEls[u].classList.remove('kb-cursor');
    slotEls.free.concat(slotEls.foundation, slotEls.column).forEach(function (s) { s.classList.remove('kb-cursor'); });
    if (!kb.active || won) return;
    var el = kbElement(); if (el) el.classList.add('kb-cursor');
  }
  function kbHide() { kb.active = false; paintCursor(); }
  function kbNav(fn) { if (kb.active) fn(); else kb.active = true; paintCursor(); announce(kbDesc()); }
  function grabColumnRun(col) {
    var column = state.tableau[col];
    if (!column.length) return null;
    var d = column.length - 1;
    while (d > 0 && E.isRun(column, d - 1)) d--; // longest movable run at the accessible end
    return grabbable(column[d].uid);
  }
  function kbEnter() {
    if (!kb.active) { kb.active = true; paintCursor(); return; }
    if (selected) {
      var dest = kb.row === 'top' ? (kb.i < 4 ? { kind: 'free', i: kb.i } : { kind: 'foundation-zone' }) : { kind: 'tableau', col: kb.i };
      var d = resolveDest(dest, selected.uids);
      if (d && doMove(selected.src, d)) { paintCursor(); return; }
      window.Sfx.play('bad');
      return;
    }
    var g = null;
    if (kb.row === 'top' && kb.i < 4 && state.free[kb.i]) g = grabbable(state.free[kb.i].uid);
    else if (kb.row === 'tab') g = grabColumnRun(kb.i);
    if (g) { setSelection(g); window.Sfx.play('pick'); paintCursor(); }
    else window.Sfx.play('bad');
  }
  function onKeyGame(e) {
    var k = e.key;
    if (k === 'ArrowLeft') { e.preventDefault(); kbNav(function () { kb.i = Math.max(0, kb.i - 1); }); }
    else if (k === 'ArrowRight') { e.preventDefault(); kbNav(function () { kb.i = Math.min(7, kb.i + 1); }); }
    else if (k === 'ArrowUp') { e.preventDefault(); kbNav(function () { kb.row = 'top'; }); }
    else if (k === 'ArrowDown') { e.preventDefault(); kbNav(function () { kb.row = 'tab'; }); }
    else if (k === 'Enter' || k === ' ') { e.preventDefault(); kbEnter(); }
    else if (k === 'Escape') { clearSelection(); }
    else return false;
    return true;
  }

  // ================= game lifecycle =================
  function newGame(number, resumeState) {
    won = false; finishing = false;
    lastMove = null;
    undoStack = []; redoStack = [];
    cancelWinAnimation();
    hintPlan = hintPlanKeys = null;
    clearSelection();
    clearHintVisual();
    setDeadEnd(false);
    stopTiming();
    if (resumeState) {
      state = deserializeState(resumeState.state);
      undoStack = (resumeState.undo || []).map(deserializeState);
      redoStack = (resumeState.redo || []).map(deserializeState);
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
    announce(T('srNewGame', { n: state.number }));
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
    updateHud(); updateButtons(); saveCurrent(); scheduleDeadEndCheck();
  }
  function redo() {
    if (!redoStack.length) return;
    undoStack.push(E.clone(state));
    state = redoStack.pop();
    clearSelection();
    render(true);
    updateHud(); updateButtons(); saveCurrent(); scheduleDeadEndCheck();
    if (E.isWon(state)) onWin();
  }

  function hint() {
    if (won || finishing) return;
    var h = computeHint();
    if (!h) { toast(T('hintNone')); return; }
    if (h.unsolvable) { toast(T('hintStuck')); return; }
    showHintVisual(h);
  }

  // A hint that never goes in circles. Independent greedy hints can oscillate
  // (a card out to a free cell, then straight back), so instead we follow one
  // consistent solution line: prefer a provably-safe card home, otherwise the
  // next move along a cached winning line, recomputed only once the player has
  // left it. Returns { uids, dest } or { unsolvable }.
  var hintPlan = null, hintPlanKeys = null;
  function hintKey(s) {
    return JSON.stringify([
      s.free.map(function (c) { return c ? c.uid : 0; }),
      s.foundations,
      s.tableau.map(function (col) { return col.map(function (c) { return c.uid; }); }),
    ]);
  }
  function rebuildHintPlan(path) {
    hintPlan = path; hintPlanKeys = [];
    var cur = E.clone(state);
    for (var i = 0; i < path.length; i++) { hintPlanKeys.push(hintKey(cur)); E.applyMove(cur, path[i].src, path[i].dst); }
  }
  function computeHint() {
    var visited = gameVisited();                      // positions already reached on this line
    // 1. a card that can always safely go home — never a mistake, never a loop
    var sm = E.nextSafeMove(state);
    if (sm) return moveToHint(sm);
    // 2. follow the cached winning line while we're still on it, else compute one
    var idx = hintPlanKeys ? hintPlanKeys.indexOf(hintKey(state)) : -1;
    if (idx < 0) {                                    // off the plan -> a fresh line (portfolio; no time limit, so it always aims for the full solution)
      var path = E.solvePath(state, 200000);
      if (path && path.length) { rebuildHintPlan(path); idx = 0; }
    }
    var mv = (idx >= 0 && hintPlan && idx < hintPlan.length) ? hintPlan[idx] : null;
    // 3. no-revisit guarantee: never send the player back to a position they have
    //    already been in this game. This makes looping impossible even on the rare
    //    deals we can't fully solve in the budget, and always makes real progress.
    if (!mv || revisits(mv, visited)) {
      var prog = bestProgressMove(visited);
      if (prog) mv = prog;
    }
    if (mv) return moveToHint(mv);
    // every legal move would send the player back to a position already seen on
    // this line -> refuse to loop and say so honestly (rather than cycle forever)
    return { unsolvable: true };
  }
  // positions on the current line (the undo history holds exactly those; undone
  // branches live in the redo stack, so re-doing a move is never blocked)
  function gameVisited() {
    var v = new Set();
    for (var i = 0; i < undoStack.length; i++) v.add(hintKey(undoStack[i]));
    return v;
  }
  // key of the position after a move settles (move + any safe auto-collect), so it
  // lines up with the positions recorded in the undo history
  function settledKey(mv) {
    var t = E.clone(state);
    if (!E.applyMove(t, mv.src, mv.dst).ok) return null;
    if (window.Storage.autoCollect) { var s2; while ((s2 = E.nextSafeMove(t))) E.applyMove(t, s2.src, s2.dst); }
    return hintKey(t);
  }
  function revisits(mv, visited) { var k = settledKey(mv); return k != null && visited.has(k); }
  // best-scoring legal move that leads somewhere new (never a revisit)
  function bestProgressMove(visited) {
    var moves = E.legalMoves(state), best = null, bestScore = -Infinity;
    for (var i = 0; i < moves.length; i++) {
      var k = settledKey(moves[i]);
      if (k == null || visited.has(k)) continue;
      var sc = scoreMove(moves[i]);
      if (sc > bestScore) { bestScore = sc; best = moves[i]; }
    }
    return best;
  }

  function leadCardOf(src) {
    return src.kind === 'free' ? state.free[src.i] : state.tableau[src.col][src.index];
  }

  // ranked heuristic: favour progress that doesn't waste tempo
  function heuristicMove() {
    var moves = E.legalMoves(state), best = null, bestScore = -Infinity;
    for (var i = 0; i < moves.length; i++) {
      var sc = scoreMove(moves[i]);
      if (sc > bestScore) { bestScore = sc; best = moves[i]; }
    }
    return best;
  }
  function scoreMove(mv) {
    var lead = leadCardOf(mv.src), s;
    if (mv.dst.kind === 'foundation') {
      s = E.isSafeAutoplay(state, lead) ? 100 : 8;
    } else if (mv.dst.kind === 'free') {
      s = -15;
    } else {
      s = state.tableau[mv.dst.col].length === 0 ? 28 : 52;
      if (mv.src.kind === 'tableau' && mv.src.index === 0) s += 80;   // empties a column
      if (mv.src.kind === 'free') s += 45;                            // frees a cell
      if (mv.src.kind === 'tableau' && mv.src.index > 0 &&
          E.canToFoundation(state, state.tableau[mv.src.col][mv.src.index - 1])) s += 20; // uncovers a home-able card
    }
    if (lastMove && lead.uid === lastMove.uid && locEquals(mv.dst, lastMove.src)) s -= 1000; // anti-oscillation
    return s;
  }
  function locEquals(dst, src) {
    if (dst.kind === 'tableau' && src.kind === 'tableau') return dst.col === src.col;
    if (dst.kind === 'free' && src.kind === 'free') return dst.i === src.i;
    return false;
  }
  function moveToHint(mv) {
    var uids = mv.src.kind === 'free'
      ? [state.free[mv.src.i].uid]
      : state.tableau[mv.src.col].slice(mv.src.index).map(function (c) { return c.uid; });
    var dest;
    if (mv.dst.kind === 'foundation') dest = { kind: 'foundation', suit: mv.dst.i };
    else if (mv.dst.kind === 'free') dest = { kind: 'free', i: mv.dst.i };
    else dest = { kind: 'tableau', col: mv.dst.col };
    return { src: mv.src, uids: uids, dest: dest };
  }

  // ---- hint presentation: pulse the source, ring the target, draw an arrow ----
  function destElement(dest) {
    if (dest.kind === 'foundation') return slotEls.foundation[dest.suit];
    if (dest.kind === 'free') return slotEls.free[dest.i];
    var col = state.tableau[dest.col];
    return col.length ? cardEls[col[col.length - 1].uid] : slotEls.column[dest.col];
  }
  // The hint flies the card(s) to their destination and then snaps them back
  // instantly. It only retargets the cards' own layout transforms (the very ones
  // render() sets), so it can never be off — no canvas or coordinate maths.
  var hintFlying = false;
  function hintDropPos(dest) {
    if (dest.kind === 'foundation') return { x: m.foundX[dest.suit], y: m.topY };
    if (dest.kind === 'free') return { x: m.freeX[dest.i], y: m.topY };
    var col = state.tableau[dest.col];
    return { x: m.colX[dest.col], y: m.tableauY + col.length * m.fan };
  }
  function motionReduced() {
    var mo = window.Storage.motion;
    if (mo === 'reduced') return true;
    if (mo === 'full') return false;
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }
  function showHintVisual(h) {
    clearHintVisual();
    announce(T('srHint', { card: cardName(h.uids[0]), dest: destPhrase(h.dest) }));
    var target = destElement(h.dest);
    if (target) target.classList.add('hint-target');
    if (motionReduced()) { // no fly: just pulse the source + ring the target
      h.uids.forEach(function (uid) { cardEls[uid].classList.add('hintful'); });
      hintTimer = setTimeout(clearHintVisual, 1500);
      return;
    }
    var dp = hintDropPos(h.dest);
    hintFlying = true;
    // reveal the placeholder behind the flying card if its source empties
    // (clearHintVisual -> render restores the real state afterwards)
    if (h.src.kind === 'free') slotEls.free[h.src.i].style.opacity = '1';
    else if (h.src.kind === 'tableau' && h.src.index === 0) slotEls.column[h.src.col].style.opacity = '1';
    h.uids.forEach(function (uid, k) {
      var el = cardEls[uid];
      el.classList.remove('no-anim');
      el.classList.add('hint-fly');   // slower transition for a clearly visible glide
      el.style.zIndex = 2000 + k;
      el.style.transform = 'translate(' + dp.x + 'px,' + (dp.y + k * m.fan) + 'px)';
    });
    hintTimer = setTimeout(clearHintVisual, 1050); // slow glide (~.55s) + hold, then snap back
  }
  function clearHintVisual() {
    if (hintTimer) { clearTimeout(hintTimer); hintTimer = null; }
    for (var u in cardEls) cardEls[u].classList.remove('hint-target', 'hintful', 'hint-fly');
    slotEls.free.concat(slotEls.foundation, slotEls.column).forEach(function (sl) { sl.classList.remove('hint-target'); });
    if (hintFlying) { hintFlying = false; render(false); } // snap the flown cards back to their real spots
  }

  // ---- "watch the solution": the solver plays a solution out, abortable ----
  // The solver's solution is one consistent (if long) line; playing it move by
  // move is reliable. Pace + batching bound the demo to ~26s regardless of
  // length: short solutions play at a watchable speed, long ones fast-forward.
  var demoing = false, demoTimer = null;
  function showSolution() {
    if (demoing || won || finishing) return;
    var path = E.solvePath(state, 200000, 2500);
    if (!path || !path.length) { toast(T('hintStuck')); return; } // couldn't solve in budget
    demoing = true;
    clearHintVisual(); clearSelection(); setDeadEnd(false);
    toast(T('solutionShowing'));
    var queue = path.slice();
    var TARGET_MS = 26000, MIN_PACE = 10, MAX_TICKS = TARGET_MS / MIN_PACE;
    var batch = Math.max(1, Math.ceil(path.length / MAX_TICKS));       // moves per frame for very long lines
    var pace = batch > 1 ? MIN_PACE : Math.max(MIN_PACE, Math.min(360, Math.round(TARGET_MS / path.length)));
    (function step() {
      if (!demoing) return;
      for (var b = 0; b < batch; b++) {
        var mv = queue.shift() || E.nextFoundationMove(state);
        if (!mv || E.isWon(state)) { finishDemo(); return; }
        demoMove(mv, batch > 1);
      }
      demoTimer = setTimeout(step, pace);
    })();
  }
  function demoMove(mv, silent) { // apply + render only; no undo/win/auto-collect pipeline
    if (!E.applyMove(state, mv.src, mv.dst).ok) return;
    if (!silent) playMoveSound(mv.dst);
    render(true);
    updateHud(); updateButtons();
  }
  function finishDemo() {
    demoing = false; if (demoTimer) { clearTimeout(demoTimer); demoTimer = null; }
    toast(T('solutionShown'));
    var num = state.number;
    setTimeout(function () { if (!demoing) newGame(num); }, 1200); // reset so it isn't recorded as solved
  }
  function abortDemo() {
    if (!demoing) return;
    demoing = false; if (demoTimer) { clearTimeout(demoTimer); demoTimer = null; }
    newGame(state.number);
  }

  function onWin() {
    if (won) return;
    won = true; finishing = false;
    announce(T('srWon'));
    stopTiming();
    var secs = Math.round((elapsedBase) / 1000);
    window.Storage.recordResult(state.number, true, secs, state.moves);
    window.Storage.clearCurrent();
    window.Sfx.play('win');
    document.getElementById('win-msg').textContent = T('wonMsg', { moves: state.moves, time: fmtWonTime(secs) });
    document.getElementById('win-progress').textContent = T('wonProgress', { number: state.number, n: window.Storage.solvedCount() });
    if (!window.Storage.tipShown && window.Storage.solvedCount() >= 10) pendingTip = true; // gentle one-time ask
    clearSelection(); clearHintVisual(); setDeadEnd(false);
    var reveal = function () { show('overlay-win'); confetti(); };
    if (motionReduced()) setTimeout(reveal, 400);   // respect reduced motion: skip the bounce
    else startWinAnimation(reveal);
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
  // time with an explicit unit, so "4:11" on the win screen can't be read as hours
  function fmtWonTime(s) {
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    if (s >= 3600) {
      var h = Math.floor(s / 3600);
      return h + ':' + pad(Math.floor((s % 3600) / 60)) + ':' + pad(s % 60) + ' h';
    }
    return Math.floor(s / 60) + ':' + pad(s % 60) + ' min';
  }

  // ================= persistence =================
  // compact (uid-based) state serialization so the undo/redo history can be
  // persisted across a reload without bloating localStorage
  function cardFromUid(uid) { var suit = uidSuit(uid); return { suit: suit, rank: uid - suit * 13, uid: uid }; }
  function serializeState(s) {
    return {
      n: s.number, m: s.moves,
      f: s.free.map(function (c) { return c ? c.uid : 0; }),
      d: s.foundations.slice(),
      t: s.tableau.map(function (col) { return col.map(function (c) { return c.uid; }); }),
    };
  }
  function deserializeState(o) {
    return {
      number: o.n, moves: o.m,
      free: o.f.map(function (u) { return u ? cardFromUid(u) : null; }),
      foundations: o.d.slice(),
      tableau: o.t.map(function (col) { return col.map(cardFromUid); }),
    };
  }
  function saveCurrent() {
    if (won) return;
    var CAP = 400; // keep the last N undo/redo steps
    window.Storage.saveCurrent({
      number: state.number,
      state: serializeState(state),
      undo: undoStack.slice(-CAP).map(serializeState),
      redo: redoStack.slice(-CAP).map(serializeState),
      elapsedMs: elapsedNow(),
    });
  }

  // ================= toast & confetti =================
  var toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2200);
  }

  // ---- win animation: the foundation cards bounce out across the board ----
  // (like the classic FreeCell victory). Click/key speeds it up, then skips;
  // the win overlay only appears once it is done.
  var WIN_VARIANTS = 3;
  var winAnimating = false, winCleanup = null;
  function cancelWinAnimation() {
    if (!winAnimating) return;
    winAnimating = false;
    if (winCleanup) winCleanup();
    winCleanup = null;
  }
  function startWinAnimation(onDone) {
    var W = play.clientWidth, H = play.clientHeight, cw = m.cw, ch = m.ch;
    var floor = H - ch, GRAV = 0.5, REST = 0.72;
    var variant = Math.floor(Math.random() * WIN_VARIANTS);
    // launch order: peel King -> Ace, cycling the four foundations (top card first)
    var parts = [];
    for (var rank = 13; rank >= 1; rank--) {
      for (var suit = 3; suit >= 0; suit--) {
        var uid = suit * 13 + rank, el = cardEls[uid];
        if (el) parts.push({ el: el, suit: suit, launched: false, done: false, x: m.foundX[suit], y: m.topY });
      }
    }
    var next = 0, launchTimer = 0, launchEvery = 3, frames = 0, speed = 1, skip = false, safety = null;

    function launch(p, idx) {
      p.launched = true; p.x = m.foundX[p.suit]; p.y = m.topY;
      // fly toward the far edge (away from the foundations) so the cards sweep
      // across the whole table and stay visible — works for both hand layouts.
      var cx = p.x + cw / 2, far = cx < W / 2 ? 1 : -1, R = Math.random;
      if (variant === 0) { p.vx = far * (5 + R() * 4); p.vy = -(3 + R() * 5); }        // cascade across
      else if (variant === 1) { p.vx = far * (3 + R() * 3); p.vy = -(12 + R() * 6); }  // fountain: up high, drift across
      else { p.vx = far * (7 + R() * 5); p.vy = -(2 + R() * 4); }                       // comet: fast low streak
      p.el.classList.add('win-fly');
      p.el.style.zIndex = 1000 + idx;
    }
    function step() {
      if (next < parts.length && ++launchTimer >= launchEvery) { launchTimer = 0; launch(parts[next], next + 1); next++; }
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        if (!p.launched || p.done) continue;
        p.vy += GRAV; p.x += p.vx; p.y += p.vy;
        if (p.y >= floor && p.vy > 0) {
          p.y = floor;
          if (p.vy < 1.5) p.vy = 0;                     // grounded: keep sliding at constant speed
          else { p.vy = -p.vy * REST; p.vx *= 0.985; }  // real bounce loses a little horizontal speed
        }
        if (p.x < -2 * cw || p.x > W + 2 * cw || p.y > H + 2 * ch) p.done = true;
      }
    }
    function allDone() { if (next < parts.length) return false; for (var i = 0; i < parts.length; i++) if (!parts[i].done) return false; return true; }
    function draw() { for (var i = 0; i < parts.length; i++) { var p = parts[i]; if (p.launched && !p.done) p.el.style.transform = 'translate(' + p.x + 'px,' + p.y + 'px)'; } }

    function frame() {
      if (!winAnimating) return;
      var steps = skip ? 60 : speed;
      for (var s = 0; s < steps && !allDone(); s++) step();
      draw();
      frames++;
      if (skip || allDone() || frames > 1500) { finish(); return; }
      requestAnimationFrame(frame);
    }
    function onBoost() { if (speed < 4) speed = 4; else skip = true; } // 1st input: faster, 2nd: skip to the end
    function onKey(e) { if (e.key !== 'Tab') onBoost(); }
    function reset() {
      if (safety) { clearTimeout(safety); safety = null; }
      play.removeEventListener('pointerdown', onBoost);
      document.removeEventListener('keydown', onKey, true);
      for (var i = 0; i < parts.length; i++) { parts[i].el.classList.remove('win-fly'); parts[i].el.style.zIndex = ''; }
    }
    function finish() {
      if (!winAnimating) return;
      winAnimating = false; winCleanup = null;
      reset();
      render(false);   // snap cards back onto the foundations behind the overlay
      onDone();
    }

    winAnimating = true; winCleanup = reset;
    play.addEventListener('pointerdown', onBoost);
    document.addEventListener('keydown', onKey, true);
    safety = setTimeout(function () { skip = true; finish(); }, 14000); // never get stuck without the overlay
    requestAnimationFrame(frame);
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

    document.getElementById('btn-browse').onclick = openBrowse;
    document.getElementById('btn-browse-close').onclick = function () { hide('overlay-browse'); };
    document.getElementById('browse-prev').onclick = function () { browse.page--; browseRender(); };
    document.getElementById('browse-next').onclick = function () { browse.page++; browseRender(); };
    // wire both filter rows
    (function () {
      var wire = function (sel, key, attr) {
        document.querySelectorAll(sel + ' .filt').forEach(function (b) {
          b.onclick = function () {
            document.querySelectorAll(sel + ' .filt').forEach(function (x) { x.classList.remove('active'); });
            b.classList.add('active'); browse[key] = b.dataset[attr]; browse.page = 0; browseBuild(); browseRender();
          };
        });
      };
      wire('#browse-filters', 'filter', 'filt');
      wire('#browse-solvedfilters', 'solved', 'solved');
    })();
    document.getElementById('browse-grid').addEventListener('click', function (e) {
      var cell = e.target.closest('.deal-cell'); if (!cell) return;
      hide('overlay-browse'); newGame(+cell.dataset.n);
    });
    document.getElementById('btn-stats-close').onclick = function () { hide('overlay-stats'); };
    document.getElementById('btn-stats-reset').onclick = function () {
      if (confirm(T('resetStatsConfirm'))) { window.Storage.resetStats(); renderStats(); }
    };
    document.getElementById('btn-settings').onclick = function () { show('overlay-settings'); };
    document.getElementById('btn-settings-close').onclick = function () { hide('overlay-settings'); };
    document.getElementById('btn-solution').onclick = function () { hide('overlay-settings'); showSolution(); };
    // any interaction stops the solution demo
    ['pointerdown', 'keydown'].forEach(function (ev) {
      document.addEventListener(ev, function (e) { if (demoing) { abortDemo(); e.stopPropagation(); e.preventDefault(); } }, true);
    });

    // win overlay
    document.getElementById('btn-win-again').onclick = function () { hide('overlay-win'); restart(); maybeShowTip(); };
    document.getElementById('btn-win-next').onclick = function () {
      hide('overlay-win'); newGame(D.randomSolvableNumber()); maybeShowTip();
    };

    // select overlay
    document.getElementById('btn-select-cancel').onclick = function () { hide('overlay-select'); };
    document.getElementById('btn-select-random').onclick = function () {
      document.getElementById('select-number').value = D.randomSolvableNumber();
      updateSelectStatus();
    };
    document.getElementById('btn-select-unsolved').onclick = function () {
      var n = window.Storage.nextUnsolved(state ? state.number : 0);
      if (n == null) { toast(T('allSolved')); return; }
      hide('overlay-select'); newGame(n);
    };
    document.querySelectorAll('#select-diff .diff-btn').forEach(function (b) {
      b.onclick = function () { hide('overlay-select'); newGame(randomOfTier(+b.dataset.tier)); };
    });
    document.getElementById('btn-select-start').onclick = function () {
      var v = parseInt(document.getElementById('select-number').value, 10);
      if (!v || v < 1) v = D.randomSolvableNumber();
      if (v > 32000) v = 32000;
      hide('overlay-select'); newGame(v);
    };
    document.getElementById('select-number').addEventListener('input', updateSelectStatus);
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
    seg('set-motion', window.Storage.motion, function (v) { window.Storage.setMotion(v); app.dataset.motion = v; });
    seg('set-deadend', window.Storage.deadEndWarn ? '1' : '0', function (v) { window.Storage.setDeadEndWarn(v === '1'); scheduleDeadEndCheck(); });
    seg('set-autocollect', window.Storage.autoCollect ? '1' : '0', function (v) { window.Storage.setAutoCollect(v === '1'); });
    seg('set-oneclick', window.Storage.oneClick ? '1' : '0', function (v) { window.Storage.setOneClick(v === '1'); });
    seg('set-sound', window.Storage.soundOn ? '1' : '0', function (v) { window.Storage.setSound(v === '1'); });
    seg('set-timer', window.Storage.showTimer ? '1' : '0', function (v) { window.Storage.setShowTimer(v === '1'); updateHud(); });
    seg('set-lefty', window.Storage.lefty ? '1' : '0', function (v) { window.Storage.setLefty(v === '1'); render(false); });

    document.getElementById('btn-share').onclick = shareApp;
    document.getElementById('btn-donate').onclick = openDonate;
    document.getElementById('btn-tip-send').onclick = function () { openDonate(); hideTip(); };
    document.getElementById('btn-tip-later').onclick = hideTip;
    document.getElementById('overlay-tip').addEventListener('pointerdown', function (e) {
      if (e.target.id === 'overlay-tip') hideTip();
    });
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
      if (document.querySelector('.overlay.show')) return; // overlays handle their own keys
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
      var kl = e.key.toLowerCase();
      if (kl === 'u') { undo(); return; }
      if (kl === 'h') { hint(); return; }
      if (kl === 'n') { openSelect(); return; }
      if (!won) onKeyGame(e);
    });

    window.addEventListener('resize', function () { render(false); });
    document.addEventListener('i18n:changed', function () { updateHud(); });
    window.addEventListener('beforeunload', saveCurrent);
    document.addEventListener('visibilitychange', function () { if (document.hidden) { saveCurrent(); } });
  }

  // difficulty tiers (from js/difficulty.js, if computed)
  var Diff = (window.Difficulty && window.Difficulty.tiers) ? window.Difficulty : null;
  function tierOf(n) { return (!Diff || n < 1 || n > Diff.tiers.length) ? 0 : (+Diff.tiers[n - 1]) || 0; }
  function tierName(t) { return (t >= 1 && t <= 4) ? T('diff' + t) : ''; }
  function randomOfTier(tier) {
    if (!Diff) return D.randomSolvableNumber();
    for (var i = 0; i < 4000; i++) { var n = 1 + Math.floor(Math.random() * Diff.tiers.length); if (n !== 11982 && tierOf(n) === tier) return n; }
    return D.randomSolvableNumber();
  }

  // ---------- deal browser (paginated, filter by difficulty / solved) ----------
  var BROWSE_PAGE = 120;
  var browse = { filter: 'all', solved: 'all', page: 0, list: [] };
  function browseBuild() {
    var list = [];
    for (var n = 1; n <= 32000; n++) {
      var t = tierOf(n);
      if (browse.filter === '9') { if (t !== 9) continue; }
      else if (browse.filter !== 'all' && String(t) !== browse.filter) continue;
      var solved = window.Storage.isSolved(n);
      if (browse.solved === 'open' && solved) continue;
      if (browse.solved === 'done' && !solved) continue;
      list.push(n);
    }
    browse.list = list;
  }
  function browseRender() {
    var pages = Math.max(1, Math.ceil(browse.list.length / BROWSE_PAGE));
    browse.page = Math.max(0, Math.min(browse.page, pages - 1));
    var start = browse.page * BROWSE_PAGE;
    var slice = browse.list.slice(start, start + BROWSE_PAGE);
    var cur = state ? state.number : -1;
    document.getElementById('browse-grid').innerHTML = slice.map(function (n) {
      var cls = 'deal-cell tier-' + tierOf(n);
      if (window.Storage.isSolved(n)) cls += ' solved';
      if (n === cur) cls += ' current';
      return '<div class="' + cls + '" data-n="' + n + '">' + n + '</div>';
    }).join('');
    document.getElementById('browse-page').textContent = browse.list.length
      ? T('pageFmt', { p: browse.page + 1, total: pages }) : T('noneFound');
    document.getElementById('browse-progress').textContent = T('progressFmt', { n: window.Storage.solvedCount() });
    document.getElementById('browse-prev').disabled = browse.page === 0;
    document.getElementById('browse-next').disabled = browse.page >= pages - 1;
  }
  function openBrowse() {
    document.getElementById('browse-filters').style.display = Diff ? '' : 'none';
    browseBuild();
    var idx = browse.list.indexOf(state ? state.number : -1);
    browse.page = idx >= 0 ? Math.floor(idx / BROWSE_PAGE) : 0;
    browseRender();
    show('overlay-browse');
  }

  function openSelect() {
    var inp = document.getElementById('select-number');
    inp.value = state ? state.number : '';
    document.getElementById('select-diff').classList.toggle('hidden', !Diff);
    updateSelectStatus();
    show('overlay-select');
    setTimeout(function () { inp.focus(); inp.select(); }, 50);
  }
  function updateSelectStatus() {
    document.getElementById('select-progress').textContent = T('progressFmt', { n: window.Storage.solvedCount() });
    var v = parseInt(document.getElementById('select-number').value, 10);
    var el = document.getElementById('select-status');
    el.className = 'select-status';
    if (!v || v < 1 || v > 32000) { el.textContent = ''; return; }
    var msg;
    if (v === 11982) { msg = T('statusUnsolvable'); el.classList.add('is-unsolvable'); }
    else if (window.Storage.isSolved(v)) { msg = T('statusSolved'); el.classList.add('is-solved'); }
    else msg = T('statusUnsolved');
    var t = tierOf(v);
    if (t >= 1 && t <= 4) msg += ' · ' + tierName(t);
    el.textContent = msg;
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
    document.getElementById('stats-progress').textContent = T('progressFmt', { n: window.Storage.solvedCount() });
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
    renderStatsTiers();
  }
  function renderStatsTiers() {
    var el = document.getElementById('stats-tiers');
    if (!Diff) { el.innerHTML = ''; return; }
    var total = { 1: 0, 2: 0, 3: 0, 4: 0 }, solved = { 1: 0, 2: 0, 3: 0, 4: 0 };
    for (var i = 0; i < Diff.tiers.length; i++) { var t = +Diff.tiers[i]; if (t >= 1 && t <= 4) total[t]++; }
    for (var n = 1; n <= 32000; n++) { if (window.Storage.isSolved(n)) { var tt = tierOf(n); if (tt >= 1 && tt <= 4) solved[tt]++; } }
    var colors = { 1: '#37c978', 2: '#ffd166', 3: '#f2724b', 4: '#e11d48' };
    var html = '';
    for (var tier = 1; tier <= 4; tier++) {
      var pct = total[tier] ? Math.round((solved[tier] / total[tier]) * 100) : 0;
      html += '<div class="stats-tier-row">' +
        '<span class="stats-tier-name">' + T('diff' + tier) + '</span>' +
        '<span class="stats-tier-bar"><span class="stats-tier-fill" style="width:' + pct + '%;background:' + colors[tier] + '"></span></span>' +
        '<span class="stats-tier-num">' + solved[tier] + ' / ' + total[tier] + '</span></div>';
    }
    el.innerHTML = html;
  }

  function shareApp() {
    var url = location.origin + location.pathname;
    var data = { title: 'adFreeCell', text: T('tagline'), url: url };
    if (navigator.share) navigator.share(data).catch(function () {});
    else if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { toast(T('linkCopied')); });
    else toast(url);
  }

  // ================= donation / tip =================
  var PAYPAL_URL = 'https://www.paypal.com/paypalme/TommyWurzbacher';
  var pendingTip = false;
  function openDonate() { try { window.open(PAYPAL_URL, '_blank', 'noopener'); } catch (e) { location.href = PAYPAL_URL; } }
  function showTip() { show('overlay-tip'); window.Storage.setTipShown(true); }
  function hideTip() { hide('overlay-tip'); }
  function maybeShowTip() { // one-time gentle ask, after the win screen is dismissed
    if (!pendingTip) return;
    pendingTip = false;
    setTimeout(showTip, 350);
  }

  // ================= boot =================
  function boot() {
    if (window.CARDS_SPRITE_INJECT) window.CARDS_SPRITE_INJECT();
    window.I18n.apply(document);
    app.dataset.theme = window.Storage.theme;
    app.dataset.motion = window.Storage.motion;
    buildSlots();
    wire();

    // deep link ?game=123, else resume, else fresh random
    var params = new URLSearchParams(location.search);
    var g = parseInt(params.get('game'), 10);
    if (g && g > 0) { newGame(g); return; }
    var saved = window.Storage.loadCurrent();
    if (saved && saved.state && saved.state.t) newGame(saved.number, saved);
    else newGame(D.randomSolvableNumber());
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
