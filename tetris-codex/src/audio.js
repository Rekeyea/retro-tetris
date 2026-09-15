/* ============================================================
   AUDIO ENGINE — synthesized SFX + optional synthwave music
   (Web Audio API, no external samples)
   ============================================================ */
(function (global) {
  "use strict";

  function AudioEngine() {
    this.ctx = null;
    this.master = null;
    this.sfxBus = null;
    this.musicBus = null;
    this.delay = null;
    this.delayFb = null;
    this.delayWet = null;
    this.noiseBuf = null;

    this.musicOn = true;
    this.sfxOn = true;
    this.musicPlaying = false;
    this.seq = null;          // music scheduler state
    this.timer = null;
  }

  var A = AudioEngine.prototype;

  A.midi = function (m) { return 440 * Math.pow(2, (m - 69) / 12); };

  /** Must be called from a user gesture. */
  A.unlock = function () {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume();
      return;
    }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    var comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 20;
    comp.ratio.value = 6;
    comp.attack.value = 0.004;
    comp.release.value = 0.25;
    this.master.connect(comp);
    comp.connect(this.ctx.destination);

    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = this.sfxOn ? 0.85 : 0;
    this.sfxBus.connect(this.master);

    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = this.musicOn ? 0.55 : 0;
    this.musicBus.connect(this.master);

    // dotted-8th feedback delay for the arp
    this.delay = this.ctx.createDelay(1.0);
    this.delay.delayTime.value = 0.375;
    this.delayFb = this.ctx.createGain();
    this.delayFb.gain.value = 0.34;
    this.delayWet = this.ctx.createGain();
    this.delayWet.gain.value = 0.22;
    this.delay.connect(this.delayFb);
    this.delayFb.connect(this.delay);
    this.delay.connect(this.delayWet);
    this.delayWet.connect(this.musicBus);

    // shared noise buffer
    var len = this.ctx.sampleRate * 1.0;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    var d = this.noiseBuf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  };

  /* ---------------- low-level voices ---------------- */

  A.blip = function (opt) {
    if (!this.ctx) return;
    var t = opt.when != null ? opt.when : this.ctx.currentTime;
    var dur = opt.dur || 0.08;
    var o = this.ctx.createOscillator();
    o.type = opt.type || "square";
    o.frequency.setValueAtTime(opt.f0, t);
    if (opt.f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, opt.f1), t + dur);
    var g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(opt.gain || 0.2, t + (opt.attack || 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    var bus = opt.bus || this.sfxBus;
    var node = o;
    if (opt.filter) {
      var f = this.ctx.createBiquadFilter();
      f.type = opt.filter.type || "lowpass";
      f.frequency.value = opt.filter.freq;
      f.Q.value = opt.filter.q || 0.8;
      o.connect(f); node = f;
    }
    node.connect(g);
    g.connect(bus);
    if (opt.send) { g.connect(this.delay); }
    o.start(t);
    o.stop(t + dur + 0.05);
  };

  A.noise = function (opt) {
    if (!this.ctx) return;
    var t = opt.when != null ? opt.when : this.ctx.currentTime;
    var dur = opt.dur || 0.1;
    var src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    var f = this.ctx.createBiquadFilter();
    f.type = opt.type || "highpass";
    f.frequency.value = opt.freq || 4000;
    f.Q.value = opt.q || 0.7;
    var g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(opt.gain || 0.2, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(opt.bus || this.sfxBus);
    src.start(t);
    src.stop(t + dur + 0.05);
  };

  /* ---------------- SFX ---------------- */

  A.move     = function () { this.blip({ type: "square", f0: 190, f1: 150, dur: 0.045, gain: 0.10 }); };
  A.rotate   = function () { this.blip({ type: "square", f0: 300, f1: 520, dur: 0.06, gain: 0.12 }); };
  A.softDrop = function () { this.blip({ type: "square", f0: 140, f1: 110, dur: 0.035, gain: 0.07 }); };
  A.hardDrop = function () {
    this.noise({ type: "lowpass", freq: 900, dur: 0.12, gain: 0.30 });
    this.blip({ type: "sine", f0: 160, f1: 45, dur: 0.14, gain: 0.35 });
  };
  A.lock     = function () { this.blip({ type: "triangle", f0: 220, f1: 180, dur: 0.05, gain: 0.12 }); };
  A.hold     = function () { this.blip({ type: "square", f0: 420, f1: 300, dur: 0.07, gain: 0.12 }); };
  A.pause    = function () {
    this.blip({ type: "square", f0: 392, dur: 0.09, gain: 0.12 });
    this.blip({ type: "square", f0: 262, dur: 0.12, gain: 0.12, when: this.ctx ? this.ctx.currentTime + 0.10 : 0 });
  };
  A.select   = function () { this.blip({ type: "square", f0: 520, f1: 780, dur: 0.09, gain: 0.14 }); };

  A.clearLines = function (n) {
    if (!this.ctx) return;
    var t = this.ctx.currentTime;
    var notes = n >= 4 ? [523, 659, 784, 1047, 1319] : [523, 659, 784].slice(0, n + 1);
    for (var i = 0; i < notes.length; i++) {
      this.blip({ type: "square", f0: notes[i], dur: 0.09, gain: 0.16, when: t + i * 0.055, send: true });
    }
    this.noise({ type: "highpass", freq: 6000, dur: 0.15, gain: 0.10 });
  };

  A.levelUp = function () {
    if (!this.ctx) return;
    var t = this.ctx.currentTime;
    [440, 554, 659, 880].forEach(function (f, i) {
      this.blip({ type: "sawtooth", f0: f, dur: 0.12, gain: 0.14, when: t + i * 0.07,
                 filter: { type: "lowpass", freq: 2400 }, send: true }, this);
    }, this);
  };

  A.gameOver = function () {
    if (!this.ctx) return;
    var t = this.ctx.currentTime;
    [392, 330, 262, 196, 131].forEach(function (f, i) {
      this.blip({ type: "triangle", f0: f, f1: f * 0.97, dur: 0.22, gain: 0.18, when: t + i * 0.16 });
    }, this);
    this.noise({ type: "lowpass", freq: 500, dur: 0.6, gain: 0.12, when: t + 0.1 });
  };

  /* ---------------- MUSIC (synthwave loop, A minor) ---------------- */

  // 4 bars, 16 steps each. Chords: Am  F  C  G
  var CHORDS = [
    { root: 45, tones: [45, 48, 52, 57, 60] },  // Am
    { root: 41, tones: [41, 45, 48, 53, 57] },  // F
    { root: 48, tones: [48, 52, 55, 60, 64] },  // C
    { root: 43, tones: [43, 47, 50, 55, 59] }   // G
  ];
  var ARP = [0, 1, 2, 3, 1, 2, 3, 4, 0, 1, 2, 3, 2, 3, 4, 3];
  var BASS = [0, 0, 12, 0, 0, 12, 0, 12]; // per 8th note

  A.musicStep = function (step, when) {
    var bar = Math.floor(step / 16) % 4;
    var s16 = step % 16;
    var ch = CHORDS[bar];
    var self = this;

    // kick: 4 on the floor
    if (s16 % 4 === 0) {
      this.blip({ type: "sine", f0: 150, f1: 42, dur: 0.13, gain: 0.5, when: when, bus: this.musicBus });
    }
    // snare on 2 & 4
    if (s16 === 4 || s16 === 12) {
      this.noise({ type: "bandpass", freq: 1800, q: 0.8, dur: 0.14, gain: 0.22, when: when, bus: this.musicBus });
      this.blip({ type: "triangle", f0: 200, f1: 140, dur: 0.08, gain: 0.12, when: when, bus: this.musicBus });
    }
    // hats
    if (s16 % 2 === 0) {
      this.noise({ type: "highpass", freq: 8500, dur: 0.035, gain: s16 % 4 === 0 ? 0.07 : 0.045, when: when, bus: this.musicBus });
    } else if (s16 === 6 || s16 === 14) {
      this.noise({ type: "highpass", freq: 8000, dur: 0.12, gain: 0.05, when: when, bus: this.musicBus });
    }
    // bass 8ths
    if (s16 % 2 === 0) {
      var b = ch.root + BASS[s16 / 2];
      this.blip({ type: "sawtooth", f0: this.midi(b), dur: 0.16, gain: 0.16, when: when,
                 bus: this.musicBus, filter: { type: "lowpass", freq: 700, q: 1.2 } });
    }
    // arp 16ths
    var a = ch.tones[ARP[s16] % ch.tones.length];
    this.blip({ type: "square", f0: this.midi(a + 12), dur: 0.09, gain: 0.055, when: when,
                bus: this.musicBus, send: true });
    // pad on bar start
    if (s16 === 0) {
      var pad = [ch.tones[0] + 12, ch.tones[1] + 12, ch.tones[2] + 12];
      for (var i = 0; i < pad.length; i++) {
        this.blip({ type: "sawtooth", f0: this.midi(pad[i]), dur: 1.9, gain: 0.028, when: when,
                    bus: this.musicBus, filter: { type: "lowpass", freq: 1100, q: 0.5 }, attack: 0.3 });
      }
    }
  };

  A.startMusic = function () {
    if (!this.ctx || this.musicPlaying) return;
    this.musicPlaying = true;
    var step = 0;
    var nextTime = this.ctx.currentTime + 0.08;
    var stepDur = 60 / 120 / 4; // 120 BPM, 16th notes
    var self = this;
    this.seq = { step: step, nextTime: nextTime, stepDur: stepDur };
    this.timer = setInterval(function () {
      if (!self.musicPlaying) return;
      while (self.seq.nextTime < self.ctx.currentTime + 0.14) {
        self.musicStep(self.seq.step % 64, self.seq.nextTime);
        self.seq.step++;
        self.seq.nextTime += self.seq.stepDur;
      }
    }, 25);
  };

  A.stopMusic = function () {
    this.musicPlaying = false;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  };

  A.toggleMusic = function () {
    this.musicOn = !this.musicOn;
    if (this.ctx) {
      this.musicBus.gain.setTargetAtTime(this.musicOn ? 0.55 : 0, this.ctx.currentTime, 0.05);
    }
    if (this.musicOn) this.startMusic(); else this.stopMusic();
    return this.musicOn;
  };

  A.toggleSfx = function () {
    this.sfxOn = !this.sfxOn;
    if (this.ctx) this.sfxBus.gain.setTargetAtTime(this.sfxOn ? 0.85 : 0, this.ctx.currentTime, 0.02);
    return this.sfxOn;
  };

  /** quick dip in the music when big things happen */
  A.duck = function (amount, dur) {
    if (!this.ctx || !this.musicOn) return;
    var t = this.ctx.currentTime;
    var g = this.musicBus.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0.55 * (1 - amount), t + 0.03);
    g.linearRampToValueAtTime(0.55, t + dur);
  };

  global.AudioEngine = AudioEngine;
})(window);
