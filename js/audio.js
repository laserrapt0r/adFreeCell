/* adFreeCell - tiny Web Audio sound effects. No audio files: every sound is
   synthesized on the fly, so it works fully offline. */
(function () {
  'use strict';

  var ctx = null;
  var master = null;

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    } catch (e) { ctx = null; return false; }
    return true;
  }

  function on() { return !(window.Storage && Storage.soundOn === false); }

  // one short enveloped tone
  function tone(freq, t0, dur, type, peak) {
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak || 0.3, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  // filtered noise burst (for the soft "flick" of placing a card)
  function noise(t0, dur, cutoff, peak) {
    var n = Math.floor(ctx.sampleRate * dur);
    var buf = ctx.createBuffer(1, n, ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    var src = ctx.createBufferSource(); src.buffer = buf;
    var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff || 2200;
    var g = ctx.createGain(); g.gain.value = peak || 0.25;
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0);
  }

  var SOUNDS = {
    pick: function (t) { tone(520, t, 0.06, 'sine', 0.16); },
    place: function (t) { noise(t, 0.09, 2600, 0.2); tone(300, t, 0.05, 'sine', 0.1); },
    cell: function (t) { tone(660, t, 0.07, 'triangle', 0.18); },
    foundation: function (t) { tone(700, t, 0.09, 'sine', 0.22); tone(1050, t + 0.05, 0.12, 'sine', 0.18); },
    bad: function (t) { tone(150, t, 0.14, 'sawtooth', 0.12); },
    deal: function (t) { noise(t, 0.05, 3200, 0.14); },
    win: function (t) {
      var notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
      for (var i = 0; i < notes.length; i++) tone(notes[i], t + i * 0.11, 0.4, 'triangle', 0.24);
    },
  };

  var Audio = {
    unlock: function () { ensure(); },
    play: function (name) {
      if (!on() || !ensure()) return;
      var fn = SOUNDS[name];
      if (fn) try { fn(ctx.currentTime); } catch (e) { /* ignore */ }
    },
  };

  window.Sfx = Audio;
})();
