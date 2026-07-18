/* adFreeCell - tiny Web Audio sound effects. No audio files: every sound is
   synthesized on the fly, so it works fully offline. The palette is deliberately
   soft and warm — pure low sine tones with gentle attack/decay and a global
   low-pass, so nothing clicks or buzzes. */
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
      master.gain.value = 0.42;
      // a gentle low-pass rolls off any harshness for a warm, mellow character
      var warm = ctx.createBiquadFilter();
      warm.type = 'lowpass'; warm.frequency.value = 2200; warm.Q.value = 0.2;
      master.connect(warm); warm.connect(ctx.destination);
    } catch (e) { ctx = null; return false; }
    return true;
  }

  function on() { return !(window.Storage && Storage.soundOn === false); }

  // one soft enveloped tone: gentle attack (no click) and a smooth exponential
  // decay (no abrupt cut), so it sounds rounded and cosy.
  function tone(freq, t0, dur, peak, type) {
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak || 0.14, t0 + 0.02);   // soft attack
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);          // smooth fade-out
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  var SOUNDS = {
    // pick up: a soft warm blip, a touch higher than the drop (a gentle "lift")
    pick: function (t) { tone(392, t, 0.11, 0.11); },
    // place / release (very frequent) -> a warm, muffled low "thump", no noise
    place: function (t) { tone(196, t, 0.17, 0.16); tone(392, t, 0.10, 0.05); },
    // into a free cell -> a gentle mid tone
    cell: function (t) { tone(330, t, 0.14, 0.12); },
    // onto a foundation -> a soft, rewarding rising two-note chime
    foundation: function (t) { tone(523.25, t, 0.17, 0.14); tone(783.99, t + 0.08, 0.22, 0.11); },
    // invalid move -> a soft, low, non-buzzy "nope" (was a harsh sawtooth)
    bad: function (t) { tone(196, t, 0.18, 0.11); tone(155.56, t + 0.09, 0.22, 0.09); },
    // dealing (played many times quickly) -> a very quiet, short soft tick
    deal: function (t) { tone(294, t, 0.07, 0.05); },
    // win -> a warm root pad under a soft pentatonic bloom
    win: function (t) {
      var notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
      tone(261.63, t, 0.95, 0.09);
      for (var i = 0; i < notes.length; i++) tone(notes[i], t + i * 0.12, 0.6, 0.14);
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
