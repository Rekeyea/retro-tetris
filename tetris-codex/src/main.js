/* ============================================================
   MAIN — render loop, input (DAS/ARR), effects, screens
   ============================================================ */
(function (global) {
  "use strict";

  var canvas = document.getElementById("game");
  var ctx = canvas.getContext("2d");
  var W = canvas.width, H = canvas.height;

  var CELL = 28;
  var BX = 380, BY = 90;                 // board origin
  var BW = Tetris.COLS * CELL, BH = Tetris.ROWS * CELL;

  var audio = new AudioEngine();
  var grain = new FilmGrain(canvas);
  var game = new Tetris.Game();

  var t = 0, last = performance.now();
  var booted = false;

  /* ---------------- effects state ---------------- */
  var shakeMag = 0, flash = 0, levelFlash = 0;
  var particles = [], floaters = [], rain = [];
  var stars = [];
  (function () {
    for (var i = 0; i < 70; i++) {
      stars.push({ x: Math.random() * W, y: Math.random() * H,
                   s: Math.random() * 1.6 + 0.4, v: Math.random() * 9 + 4,
                   tw: Math.random() * 6.28 });
    }
    for (var j = 0; j < 14; j++) {
      rain.push(newRainPiece(Math.random() * H));
    }
  })();

  function newRainPiece(y) {
    var types = Object.keys(Tetris.PIECES);
    var type = types[Math.random() * types.length | 0];
    return {
      type: type,
      mat: Tetris.PIECES[type].m,
      color: Tetris.PIECES[type].color,
      x: Math.random() * W,
      y: y != null ? y : -80,
      v: Math.random() * 40 + 26,
      rot: Math.random() * 6.28,
      vr: (Math.random() - 0.5) * 1.2
    };
  }

  /* ---------------- color helpers ---------------- */
  function hexRGB(h) {
    return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  }
  function mixHex(h, target, amt) {
    var c = hexRGB(h);
    var r = Math.round(c[0] + (target - c[0]) * amt);
    var g = Math.round(c[1] + (target - c[1]) * amt);
    var b = Math.round(c[2] + (target - c[2]) * amt);
    return "rgb(" + r + "," + g + "," + b + ")";
  }
  function rgba(h, a) {
    var c = hexRGB(h);
    return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")";
  }

  /* ---------------- block sprites ---------------- */
  var blockSprites = {};
  var ghostSprite = null;

  function makeBlockSprite(color) {
    var s = CELL, pad = 4;
    var cv = document.createElement("canvas");
    cv.width = s + pad * 2; cv.height = s + pad * 2;
    var c = cv.getContext("2d");
    // neon halo
    c.globalAlpha = 0.22;
    c.fillStyle = color;
    c.fillRect(pad - 2, pad - 2, s + 4, s + 4);
    c.globalAlpha = 1;
    // body
    var g = c.createLinearGradient(pad, pad, pad, pad + s);
    g.addColorStop(0, mixHex(color, 255, 0.38));
    g.addColorStop(0.45, color);
    g.addColorStop(1, mixHex(color, 0, 0.42));
    c.fillStyle = g;
    c.fillRect(pad, pad, s, s);
    // gloss
    c.fillStyle = "rgba(255,255,255,0.38)";
    c.fillRect(pad + 2, pad + 2, s - 4, 3);
    c.fillStyle = "rgba(255,255,255,0.10)";
    c.fillRect(pad + 2, pad + 2, 3, s - 4);
    // inner border
    c.strokeStyle = "rgba(0,0,0,0.55)";
    c.lineWidth = 2;
    c.strokeRect(pad + 1, pad + 1, s - 2, s - 2);
    return cv;
  }

  Object.keys(Tetris.PIECES).forEach(function (k) {
    blockSprites[k] = makeBlockSprite(Tetris.PIECES[k].color);
  });

  (function () {
    var s = CELL, pad = 4;
    ghostSprite = document.createElement("canvas");
    ghostSprite.width = s + pad * 2; ghostSprite.height = s + pad * 2;
    var c = ghostSprite.getContext("2d");
    c.strokeStyle = "rgba(255,255,255,0.55)";
    c.lineWidth = 2;
    c.strokeRect(pad + 1, pad + 1, s - 2, s - 2);
    c.fillStyle = "rgba(255,255,255,0.08)";
    c.fillRect(pad + 2, pad + 2, s - 4, s - 4);
  })();

  function drawBlock(color, px, py) {
    ctx.drawImage(blockSprites[color] || blockSprites["T"], px - 4, py - 4);
  }
  function drawGhost(px, py) {
    ctx.drawImage(ghostSprite, px - 4, py - 4);
  }

  /* ---------------- layout helpers ---------------- */
  var LX = 70, LW = 270;    // left panel
  var RX = 700, RW = 270;   // right panel

  function panel(x, y, w, h) {
    ctx.fillStyle = "rgba(9,13,28,0.62)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "rgba(0,240,255,0.28)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    ctx.strokeStyle = "rgba(255,0,229,0.12)";
    ctx.strokeRect(x + 5, y + 5, w - 10, h - 10);
  }

  function label(text, x, y, color) {
    RetroFont.drawText(ctx, text, x, y, 2, color || "#6f8fc0", { align: "center" });
  }

  function value(text, x, y, color, scale) {
    RetroFont.drawText(ctx, text, x, y, scale || 3, color || "#ffffff", { align: "center", glow: 7 });
  }

  function inset(x, y, w, h) {
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "rgba(255,255,255,0.14)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }

  function pieceBounds(mat) {
    var minx = 99, miny = 99, maxx = -1, maxy = -1;
    for (var y = 0; y < mat.length; y++)
      for (var x = 0; x < mat.length; x++)
        if (mat[y][x]) {
          if (x < minx) minx = x;
          if (x > maxx) maxx = x;
          if (y < miny) miny = y;
          if (y > maxy) maxy = y;
        }
    return { minx: minx, miny: miny, maxx: maxx, maxy: maxy };
  }

  /** draw a piece (mat,color) centered inside a box */
  function drawPieceInBox(mat, color, boxX, boxY, boxW, boxH) {
    var b = pieceBounds(mat);
    var pw = (b.maxx - b.minx + 1) * CELL;
    var ph = (b.maxy - b.miny + 1) * CELL;
    var ox = boxX + (boxW - pw) / 2 - b.minx * CELL;
    var oy = boxY + (boxH - ph) / 2 - b.miny * CELL;
    for (var y = 0; y < mat.length; y++)
      for (var x = 0; x < mat.length; x++)
        if (mat[y][x]) drawBlock(color, ox + x * CELL, oy + y * CELL);
  }

  /* ---------------- logo ---------------- */
  var LOGO_COLORS = ["#ff9a00", "#ffe600", "#00ff6a", "#00f0ff", "#ff00e5", "#ff3b3b"];

  function drawLogo(cx, y, scale) {
    var word = "TETRIS";
    var w = RetroFont.textWidth(word, scale);
    var x = cx - w / 2;
    for (var i = 0; i < word.length; i++) {
      RetroFont.drawText(ctx, word[i], x + i * 6 * scale, y, scale, LOGO_COLORS[i], { glow: 10 });
    }
  }

  /* ---------------- HUD ---------------- */
  function drawHUD() {
    // left panel
    panel(LX, 90, LW, 560);
    label("HOLD", LX + LW / 2, 112);
    inset(LX + (LW - 112) / 2, 130, 112, 56);
    if (game.hold) {
      var p = Tetris.PIECES[game.hold];
      var alpha = game.holdUsed ? 0.35 : 1;
      ctx.globalAlpha = alpha;
      drawPieceInBox(p.m, p.color, LX + (LW - 112) / 2, 130, 112, 56);
      ctx.globalAlpha = 1;
    }

    label("SCORE", LX + LW / 2, 230);
    value(String(game.score).padStart(7, "0"), LX + LW / 2, 252);
    label("LEVEL", LX + LW / 2, 330);
    value(String(game.level).padStart(2, "0"), LX + LW / 2, 352, levelFlash > 0 ? "#ffffff" : "#7df9ff");
    label("LINES", LX + LW / 2, 420);
    value(String(game.lines).padStart(4, "0"), LX + LW / 2, 442);
    label("HI-SCORE", LX + LW / 2, 500);
    value(String(game.highScore).padStart(7, "0"), LX + LW / 2, 522, "#ffd75e");

    // right panel
    panel(RX, 90, RW, 560);
    label("NEXT", RX + RW / 2, 112);
    for (var i = 0; i < 5; i++) {
      var ny = 130 + i * 66;
      inset(RX + (RW - 112) / 2, ny, 112, 56);
      var type = game.queue[i];
      if (type) {
        var pc = Tetris.PIECES[type];
        ctx.globalAlpha = i === 0 ? 1 : 0.75 - i * 0.08;
        drawPieceInBox(pc.m, pc.color, RX + (RW - 112) / 2, ny, 112, 56);
        ctx.globalAlpha = 1;
      }
    }

    // audio status
    var ay = 480;
    label("MUSIC [" + (audio.musicOn ? "ON" : "OFF") + "]", RX + RW / 2, ay, audio.musicOn ? "#7df9ff" : "#5a6478");
    label("SOUND [" + (audio.sfxOn ? "ON" : "OFF") + "]", RX + RW / 2, ay + 24, audio.sfxOn ? "#7df9ff" : "#5a6478");

    // controls
    var cy = 540;
    var hints = [
      "ARROWS    MOVE",
      "UP / X    ROTATE",
      "Z         ROT CCW",
      "SPACE     HARD DROP",
      "C         HOLD",
      "P         PAUSE"
    ];
    for (var hI = 0; hI < hints.length; hI++) {
      RetroFont.drawText(ctx, hints[hI], RX + 26, cy + hI * 17, 2, "#5f7396");
    }
  }

  /* ---------------- board ---------------- */
  function drawBoard() {
    // back wall
    ctx.fillStyle = "rgba(4,7,16,0.88)";
    ctx.fillRect(BX, BY, BW, BH);
    // grid
    ctx.strokeStyle = "rgba(140,180,255,0.06)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var x = 1; x < Tetris.COLS; x++) {
      ctx.moveTo(BX + x * CELL + 0.5, BY);
      ctx.lineTo(BX + x * CELL + 0.5, BY + BH);
    }
    for (var y = 1; y < Tetris.ROWS; y++) {
      ctx.moveTo(BX, BY + y * CELL + 0.5);
      ctx.lineTo(BX + BW, BY + y * CELL + 0.5);
    }
    ctx.stroke();

    // placed blocks
    for (var gy = 0; gy < Tetris.ROWS; gy++) {
      for (var gx = 0; gx < Tetris.COLS; gx++) {
        var c = game.grid[gy][gx];
        if (c) drawBlock(c, BX + gx * CELL, BY + gy * CELL);
      }
    }

    // clearing rows flash
    if (game.clearing) {
      var k = game.clearing.t / 0.28;
      for (var ri = 0; ri < game.clearing.rows.length; ri++) {
        var row = game.clearing.rows[ri];
        var wob = Math.sin(t * 34 + ri * 2) * 3 * k;
        var a = 0.35 + 0.65 * Math.abs(Math.sin(t * 30 + ri));
        ctx.fillStyle = "rgba(255,255,255," + (a * (0.5 + k * 0.5)).toFixed(3) + ")";
        ctx.fillRect(BX + wob, BY + row * CELL, BW, CELL);
      }
    }

    // ghost + current piece
    if (game.current && game.state === "play" && !game.clearing) {
      var p = game.current;
      var gY = game.ghostY();
      var cells = [];
      for (var yy = 0; yy < p.mat.length; yy++)
        for (var xx = 0; xx < p.mat.length; xx++)
          if (p.mat[yy][xx]) cells.push([xx, yy]);
      for (var ci = 0; ci < cells.length; ci++) {
        var gx2 = p.x + cells[ci][0], gy2 = gY + cells[ci][1];
        if (gy2 >= 0) drawGhost(BX + gx2 * CELL, BY + gy2 * CELL);
      }
      for (var pi = 0; pi < cells.length; pi++) {
        var px2 = p.x + cells[pi][0], py2 = p.y + cells[pi][1];
        if (py2 >= 0) drawBlock(p.color, BX + px2 * CELL, BY + py2 * CELL);
      }
    }

    // border
    var bl = levelFlash > 0 ? "rgba(255,255,255," + (0.5 + levelFlash * 0.5) + ")" : "rgba(0,240,255,0.5)";
    ctx.strokeStyle = bl;
    ctx.lineWidth = 2;
    ctx.strokeRect(BX - 2, BY - 2, BW + 4, BH + 4);
    ctx.strokeStyle = "rgba(0,240,255,0.10)";
    ctx.lineWidth = 8;
    ctx.strokeRect(BX - 6, BY - 6, BW + 12, BH + 12);
  }

  /* ---------------- particles / floaters ---------------- */
  function burst(x, y, color, n, power) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * 6.28;
      var sp = (Math.random() * 0.7 + 0.3) * power;
      particles.push({
        x: x, y: y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - power * 0.4,
        life: 0.6 + Math.random() * 0.5, max: 1.1,
        size: 2 + Math.random() * 4, color: color
      });
    }
  }

  function floater(text, x, y, color, scale) {
    floaters.push({ text: text, x: x, y: y, color: color, scale: scale || 3, life: 1.3, max: 1.3 });
  }

  function updateFX(dt) {
    shakeMag *= Math.exp(-dt * 5.5);
    if (shakeMag < 0.05) shakeMag = 0;
    flash = Math.max(0, flash - dt * 2.6);
    levelFlash = Math.max(0, levelFlash - dt * 1.4);

    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.vy += 620 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
    for (var f = floaters.length - 1; f >= 0; f--) {
      var fl = floaters[f];
      fl.y -= 34 * dt;
      fl.life -= dt;
      if (fl.life <= 0) floaters.splice(f, 1);
    }
    for (var s = 0; s < stars.length; s++) {
      var st = stars[s];
      st.y += st.v * dt;
      st.tw += dt * 3;
      if (st.y > H) { st.y = -2; st.x = Math.random() * W; }
    }
    if (game.state === "title") {
      for (var r = 0; r < rain.length; r++) {
        var rp = rain[r];
        rp.y += rp.v * dt;
        rp.rot += rp.vr * dt;
        if (rp.y > H + 60) rain[r] = newRainPiece(-60);
      }
    }
  }

  function drawFX() {
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    for (var f = 0; f < floaters.length; f++) {
      var fl = floaters[f];
      var a = Math.min(1, fl.life / fl.max * 1.6);
      var sc = fl.scale * (1 + (1 - fl.life / fl.max) * 0.15);
      RetroFont.drawText(ctx, fl.text, fl.x, fl.y, Math.round(sc * 10) / 10, fl.color,
        { align: "center", glow: 8, alpha: a });
    }
  }

  /* ---------------- background ---------------- */
  function drawBackground() {
    ctx.fillStyle = "#05060d";
    ctx.fillRect(0, 0, W, H);
    // stars
    for (var i = 0; i < stars.length; i++) {
      var st = stars[i];
      ctx.globalAlpha = 0.25 + 0.25 * Math.sin(st.tw);
      ctx.fillStyle = "#9fc8ff";
      ctx.fillRect(st.x, st.y, st.s, st.s);
    }
    ctx.globalAlpha = 1;
    // soft glow behind board
    var g = ctx.createRadialGradient(BX + BW / 2, BY + BH / 2, 60, BX + BW / 2, BY + BH / 2, 460);
    g.addColorStop(0, "rgba(0,120,255,0.10)");
    g.addColorStop(0.55, "rgba(120,0,255,0.05)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  function drawRain() {
    ctx.save();
    for (var i = 0; i < rain.length; i++) {
      var rp = rain[i];
      ctx.globalAlpha = 0.10;
      ctx.fillStyle = rp.color;
      var s = 18;
      for (var y = 0; y < rp.mat.length; y++)
        for (var x = 0; x < rp.mat.length; x++)
          if (rp.mat[y][x]) ctx.fillRect(rp.x + x * s, rp.y + y * s, s - 2, s - 2);
    }
    ctx.restore();
  }

  /* ---------------- overlays ---------------- */
  function drawTitle() {
    drawRain();
    var bob = Math.sin(t * 1.3) * 7;
    drawLogo(W / 2, 150 + bob, 8);
    RetroFont.drawText(ctx, "V H S   E D I T I O N", W / 2, 150 + bob + 72, 3, "#7df9ff", { align: "center", glow: 8 });

    if (Math.sin(t * 4) > -0.35) {
      RetroFont.drawText(ctx, "PRESS ENTER TO START", W / 2, 400, 3, "#ffffff", { align: "center", glow: 8 });
    }
    RetroFont.drawText(ctx, "OR CLICK / TAP", W / 2, 432, 2, "#8fa3c8", { align: "center" });

    RetroFont.drawText(ctx, "HI-SCORE  " + String(game.highScore).padStart(7, "0"), W / 2, 490, 3, "#ffd75e", { align: "center", glow: 6 });
    RetroFont.drawText(ctx, "M MUSIC    S SOUND", W / 2, 530, 2, "#5f7396", { align: "center" });
  }

  function drawPause() {
    ctx.fillStyle = "rgba(2,4,10,0.72)";
    ctx.fillRect(BX, BY, BW, BH);
    RetroFont.drawText(ctx, "PAUSED", BX + BW / 2, BY + 200, 5, "#7df9ff", { align: "center", glow: 10 });
    if (Math.sin(t * 4) > -0.35) {
      RetroFont.drawText(ctx, "P TO RESUME", BX + BW / 2, BY + 290, 2, "#cfe6ff", { align: "center" });
    }
  }

  function drawGameOver() {
    ctx.fillStyle = "rgba(2,4,10,0.78)";
    ctx.fillRect(BX, BY, BW, BH);
    RetroFont.drawText(ctx, "GAME OVER", BX + BW / 2, BY + 170, 5, "#ff3b3b", { align: "center", glow: 12 });
    RetroFont.drawText(ctx, "SCORE", BX + BW / 2, BY + 260, 2, "#8fa3c8", { align: "center" });
    RetroFont.drawText(ctx, String(game.score).padStart(7, "0"), BX + BW / 2, BY + 282, 3, "#ffffff", { align: "center", glow: 7 });
    if (game.score >= game.highScore && game.score > 0) {
      RetroFont.drawText(ctx, "NEW HI-SCORE!", BX + BW / 2, BY + 330, 2, "#ffd75e", { align: "center", glow: 6 });
    }
    if (Math.sin(t * 4) > -0.35) {
      RetroFont.drawText(ctx, "PRESS ENTER TO RESTART", BX + BW / 2, BY + 390, 2, "#cfe6ff", { align: "center" });
    }
  }

  /* ---------------- input ---------------- */
  var keys = { left: false, right: false, down: false };
  var das = { dir: 0, t: 0, arr: 0 };
  var sdTimer = 0, sfxMoveGate = 0;

  function tryMove(dx) {
    if (game.move(dx)) {
      if (t - sfxMoveGate > 0.04) { audio.move(); sfxMoveGate = t; }
      return true;
    }
    return false;
  }

  function boot() {
    if (booted) return;
    booted = true;
    audio.unlock();
    if (audio.musicOn) audio.startMusic();
    var b = document.getElementById("boot");
    if (b) b.classList.add("hidden");
  }

  function startGame() {
    boot();
    game.newGame();
    audio.select();
  }

  function togglePause() {
    if (game.state === "play") {
      game.state = "pause";
      audio.pause();
    } else if (game.state === "pause") {
      game.state = "play";
      audio.select();
    }
  }

  window.addEventListener("keydown", function (e) {
    var code = e.code;
    boot();
    if (["ArrowLeft", "ArrowRight", "ArrowDown", "ArrowUp", "Space"].indexOf(code) >= 0) e.preventDefault();

    if (code === "Enter") {
      if (game.state === "title" || game.state === "over") startGame();
      else if (game.state === "pause") togglePause();
      return;
    }
    if (code === "KeyM") {
      var on = audio.toggleMusic();
      audio.select();
      floater("MUSIC " + (on ? "ON" : "OFF"), W / 2, H - 90, "#7df9ff", 2);
      return;
    }
    if (code === "KeyS") {
      var sOn = audio.toggleSfx();
      floater("SOUND " + (sOn ? "ON" : "OFF"), W / 2, H - 90, "#7df9ff", 2);
      return;
    }
    if (code === "KeyP" || code === "Escape") {
      if (game.state === "play" || game.state === "pause") togglePause();
      return;
    }
    if (game.state !== "play") return;
    if (e.repeat) return;

    switch (code) {
      case "ArrowLeft":
        keys.left = true; das.dir = -1; das.t = 0; das.arr = 0;
        tryMove(-1);
        break;
      case "ArrowRight":
        keys.right = true; das.dir = 1; das.t = 0; das.arr = 0;
        tryMove(1);
        break;
      case "ArrowDown":
        keys.down = true;
        if (game.softDrop()) { audio.softDrop(); }
        sdTimer = 0;
        break;
      case "ArrowUp":
      case "KeyX":
        if (game.rotate(1)) audio.rotate();
        break;
      case "KeyZ":
        if (game.rotate(-1)) audio.rotate();
        break;
      case "Space":
        var drop = game.hardDrop();
        if (drop) {
          audio.hardDrop();
          shakeMag = Math.max(shakeMag, 5 + drop.d * 0.35);
          var cx = BX + (drop.x + drop.n / 2) * CELL;
          cx = Math.max(BX + 20, Math.min(BX + BW - 20, cx));
          burst(cx, BY + BH - 14, drop.color, 10, 190);
        }
        break;
      case "KeyC":
      case "ShiftLeft":
      case "ShiftRight":
        if (game.holdPiece()) audio.hold();
        break;
    }
  });

  window.addEventListener("keyup", function (e) {
    if (e.code === "ArrowLeft") {
      keys.left = false;
      if (keys.right) { das.dir = 1; das.t = 0; das.arr = 0; }
      else das.dir = 0;
    }
    if (e.code === "ArrowRight") {
      keys.right = false;
      if (keys.left) { das.dir = -1; das.t = 0; das.arr = 0; }
      else das.dir = 0;
    }
    if (e.code === "ArrowDown") keys.down = false;
  });

  canvas.addEventListener("pointerdown", function () {
    boot();
    if (game.state === "title" || game.state === "over") startGame();
  });

  /* ---------------- events from core ---------------- */
  function onCleared(ev) {
    var n = ev.rows;
    var base = [0, 100, 300, 500, 800][n];
    var pts = base * game.level;
    audio.clearLines(n);

    // particles from the cleared rows (colors captured before removal)
    for (var ri = 0; ri < ev.rowsList.length; ri++) {
      var row = ev.rowsList[ri];
      var rowColors = ev.colors[ri];
      for (var col = 0; col < Tetris.COLS; col++) {
        var c = rowColors[col];
        if (c) burst(BX + col * CELL + CELL / 2, BY + row * CELL + CELL / 2, c, 2, 240);
      }
    }

    var midY = BY + ev.rowsList[0] * CELL;
    if (n === 4) {
      flash = 0.85;
      shakeMag = Math.max(shakeMag, 16);
      floater("TETRIS!", BX + BW / 2, midY - 30, "#00f0ff", 5);
      floater("+" + pts, BX + BW / 2, midY + 20, "#ffffff", 3);
      audio.duck(0.55, 0.6);
    } else {
      shakeMag = Math.max(shakeMag, 4 + n * 3);
      floater("+" + pts, BX + BW / 2, midY - 10, "#ffffff", 3);
    }

    if (game.levelUp) {
      game.levelUp = false;
      levelFlash = 1;
      audio.levelUp();
      floater("LEVEL " + game.level, BX + BW / 2, BY + 90, "#ffd75e", 4);
    }
  }

  /* ---------------- update & render ---------------- */
  var wasOver = false;

  function update(dt) {
    // DAS / ARR
    if (game.state === "play" && !game.clearing) {
      if (das.dir !== 0) {
        das.t += dt;
        if (das.t >= 0.16) {
          das.arr += dt;
          while (das.arr >= 0.045) {
            das.arr -= 0.045;
            if (!tryMove(das.dir)) { das.arr = 0; break; }
          }
        }
      }
      // soft drop repeat
      if (keys.down) {
        sdTimer += dt;
        while (sdTimer >= 0.035) {
          sdTimer -= 0.035;
          if (!game.softDrop()) { sdTimer = 0; break; }
          if (t - sfxMoveGate > 0.05) { audio.softDrop(); sfxMoveGate = t; }
        }
      }
    }

    var evs = game.update(dt);
    for (var i = 0; i < evs.length; i++) {
      var ev = evs[i];
      if (ev.type === "lock") audio.lock();
      else if (ev.type === "cleared") onCleared(ev);
    }

    if (game.state === "over" && !wasOver) {
      audio.gameOver();
      shakeMag = Math.max(shakeMag, 10);
    }
    wasOver = game.state === "over";

    updateFX(dt);
  }

  function render() {
    drawBackground();

    // shake
    var sx = 0, sy = 0;
    if (shakeMag > 0) {
      sx = (Math.random() * 2 - 1) * shakeMag;
      sy = (Math.random() * 2 - 1) * shakeMag;
    }
    ctx.save();
    ctx.translate(Math.round(sx), Math.round(sy));

    if (game.state === "title") {
      drawTitle();
    } else {
      drawHUD();
      drawBoard();
      drawFX();
      if (game.state === "pause") drawPause();
      if (game.state === "over") drawGameOver();
    }

    // white flash
    if (flash > 0) {
      ctx.globalAlpha = Math.min(0.85, flash);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(-20, -20, W + 40, H + 40);
      ctx.globalAlpha = 1;
    }

    ctx.restore();

    // rolling film grain (always on top, not shaken)
    grain.render(t, 1 / 60, Math.min(1, shakeMag / 12 + flash * 0.6));
  }

  function frame(now) {
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    t += dt;
    update(dt);
    render();
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
})(window);
