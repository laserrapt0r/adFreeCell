/* adFreeCell - tiny Web Audio sound effects. No audio files: every sound is
   synthesized on the fly, so it works fully offline. Card actions are built from
   a short, bright burst of filtered noise — the crisp "snap" of card stock — on
   a bus that skips the warm low-pass so the click survives; a soft low tone adds
   the "tok" of the table. Reward/feedback cues (foundation, win, bad) keep their
   gentle sine "voice" through the warm low-pass. */
(function () {
  'use strict';

  var ctx = null;
  var master = null;
  var bright = null;
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
      // a separate "bright" bus for the card snaps: it SKIPS the warm low-pass so
      // the crisp high-frequency click of card stock survives (that transient is
      // exactly what makes it read as a card).
      bright = ctx.createGain(); bright.gain.value = 0.5; bright.connect(ctx.destination);
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

  // a short, bright burst of filtered noise = the crisp "snap"/"flick" of card
  // stock. Instant onset (a click), fast decay, routed to the bright bus so it
  // keeps its high end. `type` defaults to a broad high-pass (a snap); 'bandpass'
  // gives a more focused "shh" (a slide). `freq` sets the character.
  function noise(t0, dur, peak, freq, type, q) {
    var src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    var f = ctx.createBiquadFilter();
    f.type = type || 'highpass'; f.frequency.value = freq || 1900; f.Q.value = q || 0.6;
    var g = ctx.createGain();
    g.gain.setValueAtTime(peak || 0.12, t0);                       // instant click onset
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);         // fast decay
    src.connect(f); f.connect(g); g.connect(bright);
    src.start(t0); src.stop(t0 + dur + 0.02);
  }

  var SOUNDS = {
    // pick up: a light, quick paper flick (bright, very short)
    pick: function (t) { noise(t, 0.028, 0.11, 2600); },
    // place / release: a crisp card snap + a soft low "tok" as it lands on felt
    place: function (t) { noise(t, 0.03, 0.20, 1800); tone(120, t, 0.055, 0.13); },
    // into a free cell: a short slide ("shh") that clicks into the slot
    cell: function (t) { noise(t, 0.05, 0.12, 1500, 'bandpass', 0.7); noise(t + 0.045, 0.02, 0.13, 2600); },
    // onto a foundation: the card snaps home, then a soft rewarding rising chime
    foundation: function (t) { noise(t, 0.03, 0.17, 2100); tone(523.25, t + 0.02, 0.17, 0.11); tone(783.99, t + 0.10, 0.22, 0.09); },
    // invalid move -> a soft, low, non-buzzy "nope" (was a harsh sawtooth)
    bad: function (t) { tone(196, t, 0.18, 0.11); tone(155.56, t + 0.09, 0.22, 0.09); },
    // dealing (played many times quickly) -> a quick, light card tick
    deal: function (t) { noise(t, 0.02, 0.13, 2200); },
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
