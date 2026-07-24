/* adFreeCell - tiny Web Audio sound effects. No audio files: every sound is
   synthesized on the fly, so it works fully offline. The palette is deliberately
   soft and warm — gentle sine tones for the "voice" of each action, with a short
   burst of band-passed noise layered on for the paper "snap" of a real card. A
   global low-pass keeps it mellow, like cards on a felt table (not a sharp click). */
(function () {
  'use strict';

  var ctx = null;
  var master = null;
  var noiseBuf = null;

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
      // one small buffer of white noise, reused for every card texture
      var len = Math.floor(ctx.sampleRate * 0.25);
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      var nd = noiseBuf.getChannelData(0);
      for (var i = 0; i < len; i++) nd[i] = Math.random() * 2 - 1;
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

  // a short burst of band-passed noise: the "paper" texture of a real card. Very
  // fast attack + short decay = a soft snap/flick; the global low-pass keeps it
  // mellow (a card on felt, not a sharp click). freq sets its character.
  function noise(t0, dur, peak, freq, q) {
    var src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    var f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = freq || 1500; f.Q.value = q || 0.8;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak || 0.1, t0 + 0.004);   // crisp snap onset
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);          // quick fade
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0); src.stop(t0 + dur + 0.02);
  }

  var SOUNDS = {
    // pick up: a light flick of card paper + a soft warm blip (a gentle "lift")
    pick: function (t) { noise(t, 0.04, 0.08, 2100, 0.9); tone(392, t, 0.11, 0.09); },
    // place / release (very frequent) -> a soft card snap on felt over a warm low thump
    place: function (t) { noise(t, 0.06, 0.13, 1500, 0.7); tone(196, t, 0.17, 0.14); tone(392, t, 0.10, 0.045); },
    // into a free cell -> a card sliding into its slot (softer, longer paper) + a gentle mid tone
    cell: function (t) { noise(t, 0.085, 0.09, 1250, 0.5); tone(330, t, 0.14, 0.10); },
    // onto a foundation -> the card snaps home, then a soft rewarding rising chime
    foundation: function (t) { noise(t, 0.05, 0.10, 1700, 0.8); tone(523.25, t, 0.17, 0.13); tone(783.99, t + 0.08, 0.22, 0.10); },
    // invalid move -> a soft, low, non-buzzy "nope" (was a harsh sawtooth)
    bad: function (t) { tone(196, t, 0.18, 0.11); tone(155.56, t + 0.09, 0.22, 0.09); },
    // dealing (played many times quickly) -> a short, quiet card flick
    deal: function (t) { noise(t, 0.035, 0.08, 1800, 0.8); },
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
