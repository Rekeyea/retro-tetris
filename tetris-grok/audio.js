/* Retro Tetris — Web Audio: SFX + optional chiptune music */
/* All sound is synthesized; no assets required. */

(function () {
  'use strict';

  let ctx = null;
  let masterGain = null;
  let sfxGain = null;
  let musicGain = null;
  let noiseBuffer = null;

  let sfxOn = true;
  let musicOn = false;

  let musicTimer = null;
  let nextNoteTime = 0;
  let noteIndex = 0;

  function ensureCtx() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      masterGain = ctx.createGain();
      masterGain.gain.value = 0.9;
      masterGain.connect(ctx.destination);

      sfxGain = ctx.createGain();
      sfxGain.gain.value = 0.5;
      sfxGain.connect(masterGain);

      musicGain = ctx.createGain();
      musicGain.gain.value = 0.22;
      musicGain.connect(masterGain);

      // 1 second of white noise, reused for thuds/whooshes
      noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  }

  /* ---------- primitives ---------- */

  function blip(freq, dur, type, vol, slideTo) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(sfxGain);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function thud(freq, dur, vol) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * 0.4), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(sfxGain);
    osc.start(t);
    osc.stop(t + dur + 0.02);

    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const ng = ctx.createGain();
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 400;
    ng.gain.setValueAtTime(vol * 0.5, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.6);
    src.connect(f).connect(ng).connect(sfxGain);
    src.start(t);
    src.stop(t + dur);
  }

  function whoosh(dur, vol) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(2400, t + dur);
    f.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.4);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(sfxGain);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  function arp(notes, step, type, vol) {
    if (!ctx) return;
    const t0 = ctx.currentTime;
    notes.forEach((n, i) => {
      const t = t0 + i * step;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type || 'square';
      osc.frequency.value = n;
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + step * 1.8);
      osc.connect(g).connect(sfxGain);
      osc.start(t);
      osc.stop(t + step * 2);
    });
  }

  /* ---------- SFX API ---------- */

  const SFX = {
    unlock() { ensureCtx(); },
    setSfx(on) { sfxOn = on; },
    get sfx() { return sfxOn; },

    move()      { if (sfxOn) blip(220, 0.05, 'square', 0.12); },
    rotate()    { if (sfxOn) blip(330, 0.06, 'triangle', 0.18); },
    denied()    { if (sfxOn) blip(120, 0.07, 'sawtooth', 0.1); },
    hold()      { if (sfxOn) blip(440, 0.06, 'triangle', 0.15); },
    softDrop()  { if (sfxOn) blip(180, 0.03, 'square', 0.08); },
    hardDrop()  { if (sfxOn) { whoosh(0.12, 0.25); thud(150, 0.12, 0.4); } },
    lock()      { if (sfxOn) thud(110, 0.1, 0.3); },
    clear1()    { if (sfxOn) arp([523, 659, 784], 0.06, 'square', 0.2); },
    clear2()    { if (sfxOn) arp([523, 659, 784, 1046], 0.06, 'square', 0.22); },
    clear3()    { if (sfxOn) arp([523, 659, 784, 1046, 1318], 0.055, 'square', 0.24); },
    tetris()    { if (sfxOn) arp([523, 659, 784, 1046, 1318, 1568], 0.05, 'square', 0.26); },
    levelUp()   { if (sfxOn) arp([392, 523, 659, 784], 0.09, 'triangle', 0.3); },
    gameOver()  { if (sfxOn) arp([392, 311, 233, 155], 0.18, 'sawtooth', 0.22); },
    pause()     { if (sfxOn) blip(660, 0.08, 'triangle', 0.15); },
  };

  /* ---------- chiptune music (original loop) ---------- */

  // note names -> frequencies
  const NOTE = {};
  (function buildNoteTable() {
    const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    for (let oct = 2; oct <= 6; oct++) {
      names.forEach((n, i) => {
        const midi = 12 * (oct + 1) + i;
        NOTE[n + oct] = 440 * Math.pow(2, (midi - 69) / 12);
      });
    }
  })();

  // [note or null, beats] — an 8-bar loop, 8th-note grid (1 unit = 1/8 beat)
  const LEAD = [
    // bar 1
    ['E5', 1], [null, 1], ['G5', 1], [null, 1], ['A5', 1], [null, 1], ['G5', 1], [null, 1],
    ['E5', 1], [null, 1], ['C5', 1], [null, 1], ['D5', 1], [null, 1], ['E5', 2],
    // bar 2
    ['A5', 1], [null, 1], ['G5', 1], [null, 1], ['E5', 1], [null, 1], ['D5', 1], [null, 1],
    ['C5', 1], [null, 1], ['D5', 1], [null, 1], ['E5', 2],
    // bar 3
    ['G5', 1], [null, 1], ['E5', 1], [null, 1], ['A5', 1], [null, 1], ['B5', 1], [null, 1],
    ['A5', 1], [null, 1], ['G5', 1], [null, 1], ['E5', 2],
    // bar 4
    ['D5', 1], [null, 1], ['E5', 1], [null, 1], ['F5', 1], [null, 1], ['E5', 1], [null, 1],
    ['D5', 1], [null, 1], ['C5', 1], [null, 1], ['D5', 2],
    // bar 5
    ['E5', 1], [null, 1], ['G5', 1], [null, 1], ['A5', 1], [null, 1], ['G5', 1], [null, 1],
    ['E5', 1], [null, 1], ['C5', 1], [null, 1], ['D5', 1], [null, 1], ['E5', 2],
    // bar 6
    ['A5', 1], [null, 1], ['B5', 1], [null, 1], ['A5', 1], [null, 1], ['G5', 1], [null, 1],
    ['E5', 1], [null, 1], ['G5', 1], [null, 1], ['A5', 2],
    // bar 7
    ['G5', 1], [null, 1], ['F5', 1], [null, 1], ['E5', 1], [null, 1], ['D5', 1], [null, 1],
    ['C5', 1], [null, 1], ['D5', 1], [null, 1], ['E5', 2],
    // bar 8
    ['D5', 1], [null, 1], ['C5', 1], [null, 1], ['D5', 1], [null, 1], ['B4', 1], [null, 1],
    ['C5', 1], [null, 1], [null, 1], ['B4', 1], [null, 2],
  ];

  const BASS = [
    ['E3', 2], [null, 2], ['E3', 2], [null, 2], ['C3', 2], [null, 2], ['D3', 2], [null, 2],
    ['E3', 2], [null, 2], ['A3', 2], [null, 2], ['D3', 2], [null, 2], ['G3', 2], [null, 2],
    ['E3', 2], [null, 2], ['A3', 2], [null, 2], ['C3', 2], [null, 2], ['G3', 2], [null, 2],
    ['D3', 2], [null, 2], ['G3', 2], [null, 2], ['C3', 2], [null, 2], ['D3', 2], [null, 2],
    ['E3', 2], [null, 2], ['E3', 2], [null, 2], ['C3', 2], [null, 2], ['D3', 2], [null, 2],
    ['E3', 2], [null, 2], ['A3', 2], [null, 2], ['D3', 2], [null, 2], ['G3', 2], [null, 2],
    ['E3', 2], [null, 2], ['A3', 2], [null, 2], ['C3', 2], [null, 2], ['G3', 2], [null, 2],
    ['D3', 2], [null, 2], ['C3', 2], [null, 2], ['D3', 2], [null, 2], ['G3', 2], [null, 2],
  ];

  const BPM = 132;
  const EIGHTH = 60 / BPM / 2; // seconds per 1 unit

  function playLeadNote(freq, when, dur) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.16, when);
    g.gain.setValueAtTime(0.16, when + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.001, when + dur);
    osc.connect(g).connect(musicGain);
    osc.start(when);
    osc.stop(when + dur + 0.02);
  }

  function playBassNote(freq, when, dur) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.3, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + dur);
    osc.connect(g).connect(musicGain);
    osc.start(when);
    osc.stop(when + dur + 0.02);
  }

  function schedulerTick() {
    if (!musicOn || !ctx) return;
    const horizon = ctx.currentTime + 0.35;
    if (nextNoteTime < ctx.currentTime) nextNoteTime = ctx.currentTime + 0.05;

    while (nextNoteTime < horizon) {
      const [ln, lb] = LEAD[noteIndex % LEAD.length];
      const [bn, bb] = BASS[noteIndex % BASS.length];
      if (ln) playLeadNote(NOTE[ln], nextNoteTime, EIGHTH * lb * 0.95);
      if (bn) playBassNote(NOTE[bn], nextNoteTime, EIGHTH * bb * 0.95);
      nextNoteTime += EIGHTH;
      noteIndex++;
    }
  }

  const Music = {
    start() {
      if (!ensureCtx() || musicOn) return;
      musicOn = true;
      noteIndex = 0;
      nextNoteTime = ctx.currentTime + 0.1;
      musicTimer = setInterval(schedulerTick, 100);
    },
    stop() {
      musicOn = false;
      if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
    },
    toggle() {
      if (musicOn) this.stop(); else this.start();
      return musicOn;
    },
    get on() { return musicOn; },
  };

  window.RetroAudio = { SFX, Music, ensureCtx };
})();
