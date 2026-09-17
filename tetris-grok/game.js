/* Retro Tetris — game logic + retro paper/crayon rendering + rolling film grain */
(function () {
  'use strict';

  /* ================= constants ================= */

  const COLS = 10, ROWS = 20, CELL = 34;
  const W = COLS * CELL, H = ROWS * CELL;

  const boardCanvas = document.getElementById('board');
  const holdCanvas = document.getElementById('hold');
  const nextCanvas = document.getElementById('next');
  const grainCanvas = document.getElementById('grain');
  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlay-title');
  const overlaySub = document.getElementById('overlay-sub');
  const scoreEl = document.getElementById('score');
  const levelEl = document.getElementById('level');
  const linesEl = document.getElementById('lines');
  const musicBtn = document.getElementById('music-btn');
  const sfxBtn = document.getElementById('sfx-btn');

  const { SFX, Music } = window.RetroAudio;

  /* ================= crayon palette (from the reference) ================= */

  const COLORS = {
    I: { base: '#4d94b3', dark: '#2e6d86', name: 'teal' },
    J: { base: '#5b7fb5', dark: '#3a5684', name: 'blue' },
    L: { base: '#d08a3c', dark: '#9c6222', name: 'orange' },
    O: { base: '#d4b53f', dark: '#9c8222', name: 'yellow' },
    S: { base: '#6f9c54', dark: '#4c7234', name: 'green' },
    T: { base: '#8a6fae', dark: '#5f4a80', name: 'purple' },
    Z: { base: '#c0564d', dark: '#8c372f', name: 'red' },
  };

  /* ================= shapes (SRS) ================= */

  const SHAPES = {
    I: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
    J: [[1,0,0],[1,1,1],[0,0,0]],
    L: [[0,0,1],[1,1,1],[0,0,0]],
    O: [[1,1],[1,1]],
    S: [[0,1,1],[1,1,0],[0,0,0]],
    T: [[0,1,0],[1,1,1],[0,0,0]],
    Z: [[1,1,0],[0,1,1],[0,0,0]],
  };

  const KICKS_JLSTZ = {
    '0>1': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
    '1>0': [[0,0],[1,0],[1,-1],[0,2],[1,2]],
    '1>2': [[0,0],[1,0],[1,-1],[0,2],[1,2]],
    '2>1': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
    '2>3': [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
    '3>2': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
    '3>0': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
    '0>3': [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
  };

  const KICKS_I = {
    '0>1': [[0,0],[-2,0],[1,1],[-2,-1],[1,0]],
    '1>0': [[0,0],[2,0],[-1,-1],[2,1],[-1,0]],
    '1>2': [[0,0],[-1,0],[2,-1],[-1,1],[2,0]],
    '2>1': [[0,0],[1,0],[-2,1],[1,-1],[-2,0]],
    '2>3': [[0,0],[2,0],[-1,-1],[2,1],[-1,0]],
    '3>2': [[0,0],[-2,0],[1,1],[-2,-1],[1,0]],
    '3>0': [[0,0],[1,0],[-2,1],[1,-1],[-2,0]],
    '0>3': [[0,0],[-1,0],[2,-1],[-1,1],[2,0]],
  };

  /* ================= deterministic rng ================= */

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hash2(x, y, c) {
    let h = (x * 374761393 + y * 668265263 + c * 2246822519) | 0;
    h = (h ^ (h >>> 13)) * 1274126177 | 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  /* ================= canvas setup ================= */

  const DPR = Math.min(2, window.devicePixelRatio || 1);

  function setupCanvas(canvas, w, h) {
    canvas.width = w * DPR;
    canvas.height = h * DPR;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    const c = canvas.getContext('2d');
    c.scale(DPR, DPR);
    return c;
  }

  const bctx = setupCanvas(boardCanvas, W, H);
  const holdCtx = setupCanvas(holdCanvas, 120, 70);
  const nextCtx = setupCanvas(nextCanvas, 120, 220);
  const gctx = grainCanvas.getContext('2d');

  function sizeGrain() {
    grainCanvas.width = Math.floor(window.innerWidth / 2);
    grainCanvas.height = Math.floor(window.innerHeight / 2);
  }
  sizeGrain();
  window.addEventListener('resize', sizeGrain);

  /* ================= paper background ================= */

  function makePaper() {
    const c = document.createElement('canvas');
    c.width = 900; c.height = 900;
    const x = c.getContext('2d');
    const rnd = mulberry32(1234);

    x.fillStyle = '#e3d9c2';
    x.fillRect(0, 0, 900, 900);

    // large soft stains
    for (let i = 0; i < 26; i++) {
      const cx = rnd() * 900, cy = rnd() * 900, r = 60 + rnd() * 220;
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      const dark = rnd() > 0.4;
      g.addColorStop(0, dark ? 'rgba(120,96,58,0.07)' : 'rgba(255,250,235,0.08)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g;
      x.fillRect(cx - r, cy - r, r * 2, r * 2);
    }

    // faint graph-paper grid
    x.strokeStyle = 'rgba(90,110,140,0.10)';
    x.lineWidth = 1;
    for (let i = 0; i <= 900; i += 24) {
      x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 900); x.stroke();
      x.beginPath(); x.moveTo(0, i); x.lineTo(900, i); x.stroke();
    }

    // speckle noise
    for (let i = 0; i < 5000; i++) {
      const px = rnd() * 900, py = rnd() * 900;
      const a = rnd() * 0.05;
      x.fillStyle = rnd() > 0.5 ? `rgba(80,60,30,${a})` : `rgba(255,255,240,${a})`;
      x.fillRect(px, py, 1.5, 1.5);
    }

    // edge darkening
    const eg = x.createRadialGradient(450, 450, 300, 450, 450, 640);
    eg.addColorStop(0, 'rgba(0,0,0,0)');
    eg.addColorStop(1, 'rgba(90,70,40,0.22)');
    x.fillStyle = eg;
    x.fillRect(0, 0, 900, 900);

    document.body.style.backgroundImage = `url(${c.toDataURL()})`;
    document.body.style.backgroundSize = '900px 900px';
  }
  makePaper();

  /* ================= sketched grid layer (static) ================= */

  const gridLayer = document.createElement('canvas');
  gridLayer.width = W * DPR; gridLayer.height = H * DPR;
  (function drawGrid() {
    const x = gridLayer.getContext('2d');
    x.scale(DPR, DPR);
    const rnd = mulberry32(777);

    // parchment inside the board
    x.fillStyle = 'rgba(255,251,238,0.35)';
    x.fillRect(0, 0, W, H);

    function wobblyLine(x1, y1, x2, y2, seed) {
      const r = mulberry32(seed);
      const len = Math.hypot(x2 - x1, y2 - y1);
      const steps = Math.max(2, Math.floor(len / 16));
      const nx = -(y2 - y1) / len, ny = (x2 - x1) / len;
      x.beginPath();
      x.moveTo(x1 + (r() - 0.5) * 1.6, y1 + (r() - 0.5) * 1.6);
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const off = (r() - 0.5) * 2.2;
        x.lineTo(x1 + (x2 - x1) * t + nx * off, y1 + (y2 - y1) * t + ny * off);
      }
      x.stroke();
    }

    x.lineCap = 'round';
    for (let pass = 0; pass < 2; pass++) {
      x.strokeStyle = pass === 0 ? 'rgba(59,51,39,0.42)' : 'rgba(59,51,39,0.18)';
      x.lineWidth = pass === 0 ? 1.4 : 1;
      for (let i = 0; i <= COLS; i++) {
        wobblyLine(i * CELL, 0, i * CELL, H, 1000 + i * 31 + pass * 7);
      }
      for (let j = 0; j <= ROWS; j++) {
        wobblyLine(0, j * CELL, W, j * CELL, 5000 + j * 37 + pass * 11);
      }
    }

    // board frame (heavier ink)
    x.strokeStyle = 'rgba(45,38,28,0.85)';
    x.lineWidth = 2.4;
    wobblyLine(0, 0, W, 0, 42);
    wobblyLine(W, 0, W, H, 43);
    wobblyLine(W, H, 0, H, 44);
    wobblyLine(0, H, 0, 0, 45);
  })();

  /* ================= crayon block textures ================= */

  const blockTextures = {};

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) + amt, g = ((n >> 8) & 255) + amt, b = (n & 255) + amt;
    r = Math.max(0, Math.min(255, r)); g = Math.max(0, Math.min(255, g)); b = Math.max(0, Math.min(255, b));
    return `rgb(${r},${g},${b})`;
  }

  function makeBlockTexture(color) {
    const c = document.createElement('canvas');
    c.width = CELL * DPR; c.height = CELL * DPR;
    const x = c.getContext('2d');
    x.scale(DPR, DPR);
    const rnd = mulberry32(color.base.length * 7919 + color.base.charCodeAt(1));

    // rounded wobbly square clip
    const m = 2.5, r = 4;
    x.beginPath();
    x.moveTo(m + r, m);
    x.lineTo(CELL - m - r, m); x.arcTo(CELL - m, m, CELL - m, m + r, r);
    x.lineTo(CELL - m, CELL - m - r); x.arcTo(CELL - m, CELL - m, CELL - m - r, CELL - m, r);
    x.lineTo(m + r, CELL - m); x.arcTo(m, CELL - m, m, CELL - m - r, r);
    x.lineTo(m, m + r); x.arcTo(m, m, m + r, m, r);
    x.closePath();
    x.save();
    x.clip();

    // base fill with soft vertical gradient
    const g = x.createLinearGradient(0, 0, 0, CELL);
    g.addColorStop(0, shade(color.base, 14));
    g.addColorStop(1, shade(color.base, -10));
    x.fillStyle = g;
    x.fillRect(0, 0, CELL, CELL);

    // crayon scratch strokes
    for (let i = 0; i < 46; i++) {
      const px = rnd() * CELL, py = rnd() * CELL;
      const ang = rnd() * Math.PI;
      const len = 3 + rnd() * 9;
      const light = rnd() > 0.45;
      x.strokeStyle = light
        ? `rgba(255,255,245,${0.05 + rnd() * 0.10})`
        : `rgba(0,0,0,${0.04 + rnd() * 0.08})`;
      x.lineWidth = 0.8 + rnd() * 1.4;
      x.beginPath();
      x.moveTo(px, py);
      x.lineTo(px + Math.cos(ang) * len, py + Math.sin(ang) * len);
      x.stroke();
    }

    // inner shadow near edges
    const eg = x.createRadialGradient(CELL / 2, CELL / 2, CELL * 0.25, CELL / 2, CELL / 2, CELL * 0.75);
    eg.addColorStop(0, 'rgba(0,0,0,0)');
    eg.addColorStop(1, 'rgba(30,20,10,0.18)');
    x.fillStyle = eg;
    x.fillRect(0, 0, CELL, CELL);
    x.restore();

    // sketchy outline (two passes)
    x.strokeStyle = 'rgba(35,28,18,0.55)';
    x.lineWidth = 1.4;
    x.stroke();
    x.strokeStyle = 'rgba(35,28,18,0.2)';
    x.lineWidth = 2.4;
    x.stroke();

    // small white corner glint
    x.fillStyle = 'rgba(255,255,250,0.35)';
    x.beginPath();
    x.arc(m + 4, m + 4, 1.6, 0, Math.PI * 2);
    x.fill();

    return c;
  }

  Object.keys(COLORS).forEach(k => { blockTextures[k] = makeBlockTexture(COLORS[k]); });

  /* ================= film grain tile ================= */

  const GRAIN_TILE = 256;
  const grainTile = document.createElement('canvas');
  grainTile.width = GRAIN_TILE; grainTile.height = GRAIN_TILE;
  (function () {
    const x = grainTile.getContext('2d');
    const img = x.createImageData(GRAIN_TILE, GRAIN_TILE);
    const rnd = mulberry32(99);
    for (let i = 0; i < img.data.length; i += 4) {
      // mostly light (multiply blend -> subtle), dark specks for grain
      const v = rnd();
      let g = 235 + Math.floor(rnd() * 20);
      if (v > 0.965) g = 120 + Math.floor(rnd() * 80);
      if (v < 0.01) g = 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = g;
      img.data[i + 3] = 255;
    }
    x.putImageData(img, 0, 0);
  })();

  let grainPattern = null;
  function refreshGrainPattern() {
    grainPattern = gctx.createPattern(grainTile, 'repeat');
  }
  refreshGrainPattern();

  /* ================= game state ================= */

  const STATE = { READY: 0, PLAYING: 1, PAUSED: 2, CLEARING: 3, OVER: 4 };

  let grid;            // ROWS x COLS of null | pieceKey
  let bag = [];
  let queue = [];
  let piece = null;    // {key, rot, x, y, rx, ry (visual floats), spin}
  let holdKey = null;
  let holdUsed = false;
  let score = 0, lines = 0, level = 1;
  let state = STATE.READY;
  let dropTimer = 0;
  let clearing = null; // {rows:[], t:0}
  let shake = 0;
  let grainBoost = 0;  // extra grain energy after line clears
  let floats = [];     // floating score texts
  let dust = [];       // lock dust puffs
  let lockFlash = null;// {x,y,key,t} squash highlight
  let lastTime = 0;
  let grainX = 0, grainY = 0;
  let flicker = 0;
  let scratch = null;  // occasional film scratch line {x, life}

  function gravityMs() {
    return Math.max(60, 800 * Math.pow(0.82, level - 1));
  }

  function refillQueue() {
    while (queue.length < 5) {
      if (bag.length === 0) {
        bag = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];
        for (let i = bag.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [bag[i], bag[j]] = [bag[j], bag[i]];
        }
      }
      queue.push(bag.pop());
    }
  }

  function spawnPiece() {
    refillQueue();
    const key = queue.shift();
    refillQueue();
    const shape = SHAPES[key];
    const p = {
      key, rot: 0,
      x: Math.floor((COLS - shape[0].length) / 2),
      y: key === 'I' ? -1 : 0,
      rx: 0, ry: 0,
      spin: 0,
    };
    p.rx = p.x; p.ry = p.y;
    piece = p;
    holdUsed = false;
    dropTimer = 0;
    drawSidePanels();
    if (collides(p, 0, 0)) {
      gameOver();
    }
  }

  function rotateMatrix(m, dir) {
    const n = m.length;
    const out = Array.from({ length: n }, () => Array(n).fill(0));
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++)
        out[dir > 0 ? x : n - 1 - x][dir > 0 ? n - 1 - y : y] = m[y][x];
    return out;
  }

  function cellsOf(p, dx, dy) {
    const shape = SHAPES[p.key];
    let m = shape;
    for (let i = 0; i < p.rot; i++) m = rotateMatrix(m, 1);
    const out = [];
    for (let y = 0; y < m.length; y++)
      for (let x = 0; x < m.length; x++)
        if (m[y][x]) out.push([p.x + x + dx, p.y + y + dy]);
    return out;
  }

  function collides(p, dx, dy) {
    return cellsOf(p, dx, dy).some(([x, y]) =>
      x < 0 || x >= COLS || y >= ROWS || (y >= 0 && grid[y][x])
    );
  }

  function collideAt(x, y) {
    return x < 0 || x >= COLS || y >= ROWS || (y >= 0 && grid[y][x]);
  }

  /* ================= actions ================= */

  function move(dx) {
    if (state !== STATE.PLAYING || !piece) return;
    if (!collides(piece, dx, 0)) {
      piece.x += dx;
      SFX.move();
    } else {
      SFX.denied();
    }
  }

  function rotate(dir) {
    if (state !== STATE.PLAYING || !piece) return;
    if (piece.key === 'O') { SFX.rotate(); return; }
    const from = piece.rot;
    const to = (piece.rot + dir + 4) % 4;
    const table = piece.key === 'I' ? KICKS_I : KICKS_JLSTZ;
    const kicks = table[`${from}>${to}`];
    for (const [kx, ky] of kicks) {
      if (!collides(piece, kx, -ky)) {
        piece.x += kx;
        piece.y -= ky;
        piece.rot = to;
        piece.spin = dir;
        SFX.rotate();
        return;
      }
    }
    SFX.denied();
  }

  function softDrop() {
    if (state !== STATE.PLAYING || !piece) return;
    if (!collides(piece, 0, 1)) {
      piece.y++;
      dropTimer = 0;
      score += 1;
      updateHud(false);
      SFX.softDrop();
    }
  }

  function hardDrop() {
    if (state !== STATE.PLAYING || !piece) return;
    let d = 0;
    while (!collides(piece, 0, d + 1)) d++;
    piece.y += d;
    score += d * 2;
    shake = Math.min(8, 3 + d * 0.15);
    SFX.hardDrop();
    lockPiece();
  }

  function hold() {
    if (state !== STATE.PLAYING || !piece || holdUsed) return;
    SFX.hold();
    const cur = piece.key;
    if (holdKey) {
      piece = makeFromKey(holdKey);
      holdKey = cur;
    } else {
      holdKey = cur;
      spawnPiece();
      return;
    }
    holdUsed = true;
    dropTimer = 0;
    drawSidePanels();
    if (collides(piece, 0, 0)) gameOver();
  }

  function makeFromKey(key) {
    const shape = SHAPES[key];
    const p = {
      key, rot: 0,
      x: Math.floor((COLS - shape[0].length) / 2),
      y: key === 'I' ? -1 : 0,
      rx: 0, ry: 0, spin: 0,
    };
    p.rx = p.x; p.ry = p.y;
    return p;
  }

  function lockPiece() {
    const cells = cellsOf(piece, 0, 0);
    let topOut = false;
    for (const [x, y] of cells) {
      if (y < 0) { topOut = true; continue; }
      grid[y][x] = piece.key;
    }
    // dust puffs where the piece landed
    const bottom = Math.max(...cells.map(([, y]) => y));
    for (const [x] of cells) {
      if (bottom - 0 >= 0) {
        dust.push({ x: x * CELL + CELL / 2, y: (bottom + 1) * CELL, t: 0, key: piece.key });
      }
    }
    lockFlash = { x: piece.x, y: piece.y, key: piece.key, t: 0 };
    SFX.lock();

    if (topOut) { gameOver(); return; }

    const full = [];
    for (let y = 0; y < ROWS; y++)
      if (grid[y].every(v => v)) full.push(y);

    if (full.length) {
      state = STATE.CLEARING;
      clearing = { rows: full, t: 0 };
      grainBoost = 1;
      shake = Math.min(10, 4 + full.length * 2);
      const pts = [0, 100, 300, 500, 800][full.length] * level;
      score += pts;
      lines += full.length;
      const newLevel = Math.floor(lines / 10) + 1;
      if (newLevel > level) {
        level = newLevel;
        setTimeout(() => SFX.levelUp(), 300);
        floats.push({ text: 'LEVEL ' + String(level).padStart(2, '0'), x: W / 2, y: H / 2, t: 0, big: true });
      }
      const labels = ['', 'NICE!', 'GOOD!', 'GREAT!', 'TETRIS!'];
      floats.push({ text: labels[full.length] + ' +' + pts, x: W / 2, y: H * 0.4, t: 0, big: full.length === 4 });
      if (full.length === 4) SFX.tetris();
      else if (full.length === 3) SFX.clear3();
      else if (full.length === 2) SFX.clear2();
      else SFX.clear1();
      updateHud(true);
    } else {
      updateHud(false);
      spawnPiece();
    }
  }

  function finishClearing() {
    const rows = clearing.rows;
    for (const y of rows) {
      grid.splice(y, 1);
      grid.unshift(Array(COLS).fill(null));
    }
    clearing = null;
    state = STATE.PLAYING;
    spawnPiece();
  }

  function gameOver() {
    state = STATE.OVER;
    SFX.gameOver();
    Music.stop();
    showOverlay('GAME OVER', 'score ' + score + '  ·  press R to retry');
  }

  function showOverlay(title, sub) {
    overlayTitle.textContent = title;
    overlaySub.textContent = sub;
    overlay.classList.remove('hidden');
  }
  function hideOverlay() { overlay.classList.add('hidden'); }

  function updateHud(pop) {
    scoreEl.textContent = score;
    levelEl.textContent = String(level).padStart(2, '0');
    linesEl.textContent = lines;
    if (pop) {
      scoreEl.classList.remove('pop');
      void scoreEl.offsetWidth;
      scoreEl.classList.add('pop');
    }
  }

  function newGame() {
    grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    bag = []; queue = [];
    holdKey = null; holdUsed = false;
    score = 0; lines = 0; level = 1;
    floats = []; dust = [];
    clearing = null;
    state = STATE.PLAYING;
    hideOverlay();
    updateHud(false);
    drawSidePanels();
    spawnPiece();
  }

  /* ================= side panels (next / hold) ================= */

  function drawMini(ctx, key, cx, cy, size) {
    const shape = SHAPES[key];
    // trim empty rows/cols
    let minX = 9, maxX = -1, minY = 9, maxY = -1;
    for (let y = 0; y < shape.length; y++)
      for (let x = 0; x < shape[0].length; x++)
        if (shape[y][x]) {
          minX = Math.min(minX, x); maxX = Math.max(maxX, x);
          minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        }
    const w = (maxX - minX + 1) * size, h = (maxY - minY + 1) * size;
    const tx = cx - w / 2, ty = cy - h / 2;
    for (let y = minY; y <= maxY; y++)
      for (let x = minX; x <= maxX; x++)
        if (shape[y][x]) {
          ctx.drawImage(blockTextures[key], tx + (x - minX) * size, ty + (y - minY) * size, size, size);
        }
  }

  function drawSidePanels() {
    // hold
    holdCtx.clearRect(0, 0, 120, 70);
    if (holdKey) {
      holdCtx.globalAlpha = holdUsed ? 0.35 : 1;
      drawMini(holdCtx, holdKey, 60, 35, 22);
      holdCtx.globalAlpha = 1;
    } else {
      holdCtx.strokeStyle = 'rgba(59,51,39,0.3)';
      holdCtx.setLineDash([4, 4]);
      holdCtx.strokeRect(35, 18, 50, 34);
      holdCtx.setLineDash([]);
    }

    // next (3 pieces, first bigger)
    nextCtx.clearRect(0, 0, 120, 220);
    const items = queue.slice(0, 3);
    items.forEach((k, i) => {
      nextCtx.globalAlpha = i === 0 ? 1 : 0.55 - i * 0.12;
      drawMini(nextCtx, k, 60, 32 + i * 72, i === 0 ? 22 : 16);
    });
    nextCtx.globalAlpha = 1;
  }

  /* ================= main render ================= */

  function drawCell(ctx, key, px, py, scale) {
    const s = (scale || 1);
    ctx.drawImage(blockTextures[key], px, py, CELL * s, CELL * s);
  }

  function drawGhost(ctx, p) {
    let d = 0;
    while (!collides(p, 0, d + 1)) d++;
    if (d === 0) return;
    const cells = cellsOf(p, 0, d);
    ctx.save();
    ctx.strokeStyle = 'rgba(59,51,39,0.4)';
    ctx.lineWidth = 1.6;
    ctx.setLineDash([5, 4]);
    for (const [x, y] of cells) {
      if (y < 0) continue;
      const px = x * CELL + 3, py = y * CELL + 3;
      ctx.strokeRect(px, py, CELL - 6, CELL - 6);
    }
    ctx.restore();
  }

  function drawPiece(ctx, p, alpha) {
    const cells = cellsOf(p, 0, 0);
    const cx = (p.rx + 0.5) * CELL, cy = (p.ry + 0.5) * CELL;
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    // spin squash effect right after a rotation
    if (p.spin) {
      const s = 1 + Math.sin(Math.min(1, p.spinT || 0) * Math.PI) * 0.06;
      ctx.translate(cx, cy);
      ctx.scale(s, 2 - s);
      ctx.translate(-cx, -cy);
    }
    for (const [x, y] of cells) {
      if (y < 0) continue;
      // stable per-cell jitter so the crayon look doesn't flicker
      const jx = (hash2(x, y, p.key.length) - 0.5) * 2;
      const jy = (hash2(y, x, p.key.length) - 0.5) * 2;
      drawCell(ctx, p.key, x * CELL + jx, y * CELL + jy);
    }
    ctx.restore();
  }

  function render() {
    bctx.clearRect(0, 0, W, H);
    bctx.save();

    // screen shake
    if (shake > 0.2) {
      bctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    }

    bctx.drawImage(gridLayer, 0, 0, W, H);

    // stacked blocks
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const k = grid[y][x];
        if (!k) continue;
        const jx = (hash2(x, y, k.length * 3) - 0.5) * 2;
        const jy = (hash2(y, x, k.length * 5) - 0.5) * 2;
        let py = y * CELL + jy;

        // line-clear animation: flash + shake + lift
        if (clearing && clearing.rows.includes(y)) {
          const t = clearing.t;
          py += Math.sin(t * Math.PI * 2 + x * 0.6) * 3 * (1 - t);
          bctx.save();
          bctx.globalAlpha = 1 - t * 0.7;
          drawCell(bctx, k, x * CELL + jx + Math.sin(t * 40 + x) * 2 * (1 - t), py);
          bctx.globalAlpha = (1 - t) * (0.5 + 0.5 * Math.sin(t * Math.PI * 6));
          bctx.fillStyle = '#fffbe8';
          bctx.fillRect(x * CELL + 2, y * CELL + 2, CELL - 4, CELL - 4);
          bctx.restore();
        } else {
          drawCell(bctx, k, x * CELL + jx, py);
        }
      }
    }

    // ghost + active piece
    if ((state === STATE.PLAYING || state === STATE.PAUSED) && piece) {
      drawGhost(bctx, piece);
      drawPiece(bctx, piece);
    }

    // lock dust puffs
    for (const d of dust) {
      const a = 1 - d.t;
      if (a <= 0) continue;
      bctx.save();
      bctx.globalAlpha = a * 0.5;
      bctx.fillStyle = COLORS[d.key].base;
      const r = 4 + d.t * 14;
      bctx.beginPath();
      bctx.arc(d.x, d.y - d.t * 10, r, 0, Math.PI * 2);
      bctx.fill();
      bctx.restore();
    }

    // floating texts
    for (const f of floats) {
      const a = 1 - f.t;
      if (a <= 0) continue;
      bctx.save();
      bctx.globalAlpha = a;
      bctx.fillStyle = '#3b3327';
      bctx.font = (f.big ? 'bold 42px' : 'bold 28px') + " 'Caveat', cursive";
      bctx.textAlign = 'center';
      bctx.translate(f.x, f.y - f.t * 50);
      bctx.rotate(-0.06);
      bctx.fillText(f.text, 0, 0);
      bctx.restore();
    }

    bctx.restore();
  }

  /* ================= grain render (rolling film) ================= */

  function renderGrain(dt, rolling) {
    const gw = grainCanvas.width, gh = grainCanvas.height;
    if (!grainPattern) refreshGrainPattern();

    // rolling: continuous diagonal scroll while playing
    if (rolling) {
      grainX = (grainX + dt * 60) % GRAIN_TILE;
      grainY = (grainY + dt * 95) % GRAIN_TILE;
    }
    // frame flicker (film projection wobble)
    flicker = 0.5 + Math.sin(performance.now() * 0.02) * 0.06 + (Math.random() - 0.5) * 0.08;
    if (grainBoost > 0) flicker += grainBoost * 0.25;

    gctx.globalAlpha = 0.5 * flicker + 0.12;
    gctx.save();
    gctx.translate((Math.random() - 0.5) * 8 - grainX, (Math.random() - 0.5) * 8 - grainY);
    gctx.fillStyle = grainPattern;
    gctx.fillRect(-16, -16, gw + 32, gh + 32);
    gctx.restore();

    // occasional vertical film scratch
    if (scratch && scratch.life > 0) {
      gctx.globalAlpha = 0.12 * scratch.life;
      gctx.fillStyle = '#2a2015';
      gctx.fillRect(scratch.x, 0, 1.5, gh);
      scratch.life -= dt * 3;
    } else if (Math.random() < 0.004) {
      scratch = { x: Math.random() * gw, life: 1 };
    }

    // dust motes
    gctx.globalAlpha = 0.1;
    gctx.fillStyle = '#1a140c';
    for (let i = 0; i < 5; i++) {
      if (Math.random() < 0.3) gctx.fillRect(Math.random() * gw, Math.random() * gh, 2, 2);
    }
    gctx.globalAlpha = 1;
  }

  /* ================= main loop ================= */

  function frame(time) {
    const dt = Math.min(0.05, (time - lastTime) / 1000 || 0);
    lastTime = time;

    if (state === STATE.PLAYING && piece) {
      // gravity
      dropTimer += dt * 1000;
      if (dropTimer >= gravityMs()) {
        dropTimer = 0;
        if (!collides(piece, 0, 1)) {
          piece.y++;
        } else {
          lockPiece();
        }
      }

      // smooth visual follow (great movement feel)
      const follow = 1 - Math.pow(0.0001, dt); // fast ease
      piece.rx += (piece.x - piece.rx) * follow;
      piece.ry += (piece.y - piece.ry) * follow;

      // spin squash decay
      if (piece.spin) {
        piece.spinT = (piece.spinT || 0) + dt * 6;
        if (piece.spinT >= 1) { piece.spin = 0; piece.spinT = 0; }
      }
    }

    if (state === STATE.CLEARING && clearing) {
      clearing.t += dt / 0.45;
      if (clearing.t >= 1) finishClearing();
    }

    shake = Math.max(0, shake - dt * 30);
    grainBoost = Math.max(0, grainBoost - dt * 1.6);
    for (const d of dust) d.t += dt * 2.2;
    dust = dust.filter(d => d.t < 1);
    for (const f of floats) f.t += dt * 0.8;
    floats = floats.filter(f => f.t < 1);
    if (lockFlash) { lockFlash.t += dt * 4; if (lockFlash.t > 1) lockFlash = null; }

    render();
    renderGrain(dt, state === STATE.PLAYING || state === STATE.CLEARING);

    requestAnimationFrame(frame);
  }

  /* ================= input ================= */

  window.addEventListener('keydown', (e) => {
    SFX.unlock();

    if (e.repeat) {
      if (['ArrowLeft', 'ArrowRight', 'ArrowDown'].includes(e.key)) {
        e.preventDefault();
        if (e.key === 'ArrowLeft') move(-1);
        else if (e.key === 'ArrowRight') move(1);
        else softDrop();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowLeft':  e.preventDefault(); move(-1); break;
      case 'ArrowRight': e.preventDefault(); move(1); break;
      case 'ArrowDown':  e.preventDefault(); softDrop(); break;
      case 'ArrowUp':    e.preventDefault(); rotate(1); break;
      case 'x': case 'X': rotate(1); break;
      case 'z': case 'Z': rotate(-1); break;
      case ' ':          e.preventDefault(); hardDrop(); break;
      case 'c': case 'C': hold(); break;
      case 'p': case 'P':
        if (state === STATE.PLAYING) {
          state = STATE.PAUSED;
          showOverlay('PAUSED', 'press P to resume');
          SFX.pause();
        } else if (state === STATE.PAUSED) {
          state = STATE.PLAYING;
          hideOverlay();
          SFX.pause();
        }
        break;
      case 'm': case 'M':
        toggleMusic();
        break;
      case 'r': case 'R':
        if (state === STATE.OVER || state === STATE.PAUSED || state === STATE.PLAYING) newGame();
        break;
      case 'Enter':
        if (state === STATE.READY || state === STATE.OVER) newGame();
        break;
    }
  });

  function toggleMusic() {
    SFX.unlock();
    const on = Music.toggle();
    musicBtn.textContent = '♪ MUSIC: ' + (on ? 'ON' : 'OFF');
    musicBtn.classList.toggle('on', on);
  }

  musicBtn.addEventListener('click', () => { toggleMusic(); musicBtn.blur(); });
  sfxBtn.addEventListener('click', () => {
    SFX.unlock();
    const on = !SFX.sfx;
    SFX.setSfx(on);
    sfxBtn.textContent = 'SFX: ' + (on ? 'ON' : 'OFF');
    sfxBtn.classList.toggle('on', on);
    sfxBtn.blur();
  });

  // start music on first user gesture (autoplay policy)
  window.addEventListener('keydown', () => SFX.unlock(), { once: true });

  /* ================= boot ================= */

  grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  updateHud(false);
  drawSidePanels();
  showOverlay('RETRO TETRIS', 'press ENTER to start  ·  M for music');
  requestAnimationFrame(frame);
})();
