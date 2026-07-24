/* adFreeCell - tiny Web Audio sound effects. No audio files: every sound is
   synthesized on the fly, so it works fully offline. Card actions are a short
   burst of band-passed noise in the low-mids — the papery "pat" of a card, with
   a soft (not clicky) onset — on a bus with its own gentle low-pass so it never
   turns harsh; a soft low tone adds the "tok" of the table. Reward/feedback cues
   (foundation, win, bad) keep their gentle sine "voice" through the warm low-pass. */
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
      // a separate bus for the card sounds: it has more presence than the warm
      // "voice" bus, but its own gentle low-pass rolls off the harsh top end so a
      // card reads as papery (a soft pat), not a sharp digital click.
      bright = ctx.createGain(); bright.gain.value = 0.5;
      var brightLp = ctx.createBiquadFilter();
      brightLp.type = 'lowpass'; brightLp.frequency.value = 3600; brightLp.Q.value = 0.4;
      bright.connect(brightLp); brightLp.connect(ctx.destination);
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

  // a short burst of band-passed noise = the papery "pat"/"flick" of a card. The
  // band-pass sits in the low-mids (where card paper actually resonates), and the
  // attack is quick but soft (a few ms), so it's a rounded pat, not a hard click.
  // `freq` sets the character; low Q = broad "shh", high Q = focused tap.
  function noise(t0, dur, peak, freq, type, q) {
    var src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    var f = ctx.createBiquadFilter();
    f.type = type || 'bandpass'; f.frequency.value = freq || 850; f.Q.value = q || 1;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak || 0.12, t0 + 0.004);  // quick but soft onset
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);          // short decay
    src.connect(f); f.connect(g); g.connect(bright);
    src.start(t0); src.stop(t0 + dur + 0.02);
  }

  var SOUNDS = {
    // pick up: a light, soft paper flick (low-mid, short and quiet)
    pick: function (t) { noise(t, 0.035, 0.08, 750, 'bandpass', 1.1); },
    // place / release: a papery pat + a soft low "tok" as it lands on felt
    place: function (t) { noise(t, 0.05, 0.11, 820, 'bandpass', 0.9); tone(140, t, 0.07, 0.13); },
    // into a free cell: a short slide ("shh") that settles into the slot
    cell: function (t) { noise(t, 0.075, 0.07, 1000, 'bandpass', 0.5); noise(t + 0.06, 0.035, 0.09, 720, 'bandpass', 1.2); },
    // onto a foundation: a soft card pat, then a gentle rewarding rising chime
    foundation: function (t) { noise(t, 0.045, 0.10, 880, 'bandpass', 0.9); tone(523.25, t + 0.02, 0.17, 0.10); tone(783.99, t + 0.10, 0.22, 0.08); },
    // invalid move -> a soft, low, non-buzzy "nope" (was a harsh sawtooth)
    bad: function (t) { tone(196, t, 0.18, 0.11); tone(155.56, t + 0.09, 0.22, 0.09); },
    // dealing: fired once per card, ~8ms apart for all 52. If every tick were
    // identical they'd reinforce into a pitched machine-gun buzz, so each one is
    // randomised (centre freq + level) and uses a broad, low-Q filter — 52 of them
    // overlapping then read as a soft, natural paper riffle instead of a tone.
    deal: function (t) {
      var f = 1100 + Math.random() * 900;
      noise(t, 0.02, 0.045 + Math.random() * 0.03, f, 'bandpass', 0.5);
    },
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
