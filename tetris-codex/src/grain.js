/* ============================================================
   FILM GRAIN / VHS OVERLAY
   - rolling vertical grain (the "film is moving" look)
   - per-frame shimmer + tile flicker
   - scanlines, chroma drift, vignette, rolling tracking band
   ============================================================ */
(function (global) {
  "use strict";

  var TILE = 256;
  var NTILES = 6;

  function FilmGrain(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.W = canvas.width;
    this.H = canvas.height;
    this.rollY = 0;
    this.tiles = [];
    this.scanlineCv = null;
    this.vignetteCv = null;
    this.buildTiles();
    this.buildScanlines();
    this.buildVignette();
  }

  var G = FilmGrain.prototype;

  G.buildTiles = function () {
    for (var i = 0; i < NTILES; i++) {
      var cv = document.createElement("canvas");
      cv.width = TILE; cv.height = TILE;
      var c = cv.getContext("2d");
      var img = c.createImageData(TILE, TILE);
      var d = img.data;
      for (var p = 0; p < TILE * TILE; p++) {
        // mid-gray noise with a touch of contrast
        var v = 96 + Math.random() * 96; // 96..192
        var o = p * 4;
        d[o] = v; d[o + 1] = v; d[o + 2] = v;
        d[o + 3] = 255;
      }
      c.putImageData(img, 0, 0);
      this.tiles.push(cv);
    }
  };

  G.buildScanlines = function () {
    var cv = document.createElement("canvas");
    cv.width = this.W; cv.height = this.H;
    var c = cv.getContext("2d");
    c.fillStyle = "rgba(0,0,0,0.16)";
    for (var y = 0; y < this.H; y += 3) {
      c.fillRect(0, y, this.W, 1);
    }
    this.scanlineCv = cv;
  };

  G.buildVignette = function () {
    var cv = document.createElement("canvas");
    cv.width = this.W; cv.height = this.H;
    var c = cv.getContext("2d");
    var g = c.createRadialGradient(
      this.W / 2, this.H / 2, Math.min(this.W, this.H) * 0.42,
      this.W / 2, this.H / 2, Math.max(this.W, this.H) * 0.72
    );
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.55)");
    c.fillStyle = g;
    c.fillRect(0, 0, this.W, this.H);
    this.vignetteCv = cv;
  };

  /**
   * Render the full retro overlay.
   * @param {number} t    seconds (global clock)
   * @param {number} dt   seconds since last frame
   * @param {number} intensity 0..1  (extra grain when action happens)
   */
  G.render = function (t, dt, intensity) {
    var ctx = this.ctx;
    var W = this.W, H = this.H;

    /* --- rolling grain --- */
    // organic rolling speed: base + slow wobble (film feed)
    var speed = 90 + 55 * Math.sin(t * 0.13) + 30 * Math.sin(t * 0.31 + 2.0);
    this.rollY = (this.rollY + speed * dt) % (TILE * 2);

    var tile = this.tiles[Math.floor(t * 24) % NTILES]; // flicker ~24fps
    var jy = Math.round(this.rollY);
    var jx = Math.round((Math.random() * 2 - 1) * 4);   // per-frame jitter

    ctx.save();
    ctx.globalCompositeOperation = "overlay";
    ctx.globalAlpha = 0.16 + intensity * 0.14;
    for (var y = -TILE; y < H + TILE; y += TILE) {
      for (var x = -TILE; x < W + TILE; x += TILE) {
        ctx.drawImage(tile, x + jx, y + jy);
      }
    }
    ctx.restore();

    /* --- scanlines --- */
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.drawImage(this.scanlineCv, 0, 0);
    ctx.restore();

    /* --- chroma drift: two thin color fringes that wander --- */
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    var fx = Math.sin(t * 0.7) * 3 + Math.sin(t * 2.3) * 1.5;
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = "rgba(255,0,90,0.5)";
    ctx.fillRect(fx, 0, 2, H);
    ctx.fillStyle = "rgba(0,255,220,0.5)";
    ctx.fillRect(-fx, 0, 2, H);
    ctx.restore();

    /* --- rolling VHS tracking band (occasional) --- */
    var bandCycle = 7.3;
    var bt = (t % bandCycle) / bandCycle;
    if (bt < 0.16) {
      var by = -80 + (bt / 0.16) * (H + 160);
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      var grad = ctx.createLinearGradient(0, by - 46, 0, by + 46);
      grad.addColorStop(0, "rgba(255,255,255,0)");
      grad.addColorStop(0.5, "rgba(255,255,255,0.10)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, by - 46, W, 92);
      // smeared bright line
      ctx.globalAlpha = 0.20;
      ctx.fillStyle = "#e8f6ff";
      ctx.fillRect(0, by + Math.sin(t * 9) * 3, W, 2);
      ctx.restore();
    }

    /* --- rare white dust specks --- */
    if (Math.random() < 0.35) {
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = "#fff";
      var n = 1 + (Math.random() * 3 | 0);
      for (var s = 0; s < n; s++) {
        ctx.fillRect(Math.random() * W | 0, Math.random() * H | 0, 1 + (Math.random() * 2 | 0), 1);
      }
      ctx.restore();
    }

    /* --- vignette (on top) --- */
    ctx.drawImage(this.vignetteCv, 0, 0);
  };

  global.FilmGrain = FilmGrain;
})(window);
