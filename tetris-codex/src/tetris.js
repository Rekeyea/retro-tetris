/* ============================================================
   TETRIS CORE — board, pieces, SRS kicks, 7-bag, scoring
   ============================================================ */
(function (global) {
  "use strict";

  var COLS = 10, ROWS = 20;

  // piece definitions: spawn matrix, color, name
  var PIECES = {
    I: { m: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], color: "#00f0ff", name: "I" },
    O: { m: [[1,1],[1,1]],                            color: "#ffe600", name: "O" },
    T: { m: [[0,1,0],[1,1,1],[0,0,0]],                color: "#ff00e5", name: "T" },
    S: { m: [[0,1,1],[1,1,0],[0,0,0]],                color: "#00ff6a", name: "S" },
    Z: { m: [[1,1,0],[0,1,1],[0,0,0]],                color: "#ff3b3b", name: "Z" },
    J: { m: [[1,0,0],[1,1,1],[0,0,0]],                color: "#2e6bff", name: "J" },
    L: { m: [[0,0,1],[1,1,1],[0,0,0]],                color: "#ff9a00", name: "L" }
  };

  // SRS wall kick tables (x right +, y down +)
  var KICKS = {
    "0>1": [[-1,0],[-1,-1],[0,-2],[-1,2]],
    "1>0": [[1,0],[1,1],[0,2],[1,-2]],
    "1>2": [[1,0],[1,1],[0,2],[1,-2]],
    "2>1": [[-1,0],[-1,-1],[0,-2],[-1,2]],
    "2>3": [[1,0],[1,-1],[0,-2],[1,2]],
    "3>2": [[-1,0],[-1,1],[0,2],[-1,-2]],
    "3>0": [[-1,0],[-1,1],[0,2],[-1,-2]],
    "0>3": [[1,0],[1,-1],[0,-2],[1,2]]
  };
  var KICKS_I = {
    "0>1": [[-2,0],[2,0],[-2,-1],[2,2],[-2,2]],
    "1>0": [[2,0],[-2,0],[2,1],[-2,-2],[2,-2]],
    "1>2": [[-1,0],[1,0],[-1,2],[1,-2],[-1,-2]],
    "2>1": [[1,0],[-1,0],[1,-2],[-1,2],[1,2]],
    "2>3": [[2,0],[-2,0],[2,1],[-2,-2],[2,-2]],
    "3>2": [[-2,0],[2,0],[-2,-1],[2,2],[-2,2]],
    "3>0": [[1,0],[-1,0],[1,-2],[-1,2],[1,2]],
    "0>3": [[-1,0],[1,0],[-1,2],[1,-2],[-1,-2]]
  };

  function rotateMatrix(m, dir) {
    var n = m.length;
    var out = [];
    for (var y = 0; y < n; y++) {
      out.push([]);
      for (var x = 0; x < n; x++) {
        if (dir > 0) out[y].push(m[n - 1 - x][y]);
        else out[y].push(m[x][n - 1 - y]);
      }
    }
    return out;
  }

  function Piece(type) {
    this.type = type;
    this.mat = PIECES[type].m.map(function (r) { return r.slice(); });
    this.color = PIECES[type].color;
    this.x = 0; this.y = 0;
    this.rot = 0;
    this.reset();
  }

  Piece.prototype.reset = function () {
    var n = this.mat.length;
    this.x = Math.floor((COLS - n) / 2);
    this.y = this.type === "I" ? -1 : -2;
    this.rot = 0;
    this.mat = PIECES[this.type].m.map(function (r) { return r.slice(); });
  };

  Piece.prototype.corners = function () {
    var n = this.mat.length;
    var cells = [];
    for (var y = 0; y < n; y++)
      for (var x = 0; x < n; x++)
        if (this.mat[y][x]) cells.push([this.x + x, this.y + y]);
    return cells;
  };

  /* ================= GAME ================= */

  function Game() {
    this.reset();
  }

  var GM = Game.prototype;

  GM.reset = function () {
    this.grid = [];
    for (var y = 0; y < ROWS; y++) {
      this.grid.push(new Array(COLS).fill(0));
    }
    this.bag = [];
    this.queue = [];
    this.fillQueue();
    this.current = null;
    this.hold = null;
    this.holdUsed = false;
    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this.over = false;
    this.state = "title"; // title | play | pause | over
    this.dropTimer = 0;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.clearing = null; // { rows:[], t } animation
    this.highScore = 0;
    try { this.highScore = +localStorage.getItem("tetris_vhs_hi") || 0; } catch (e) {}
  };

  GM.newGame = function () {
    this.reset();
    this.state = "play";
    this.spawn();
  };

  GM.fillQueue = function () {
    while (this.queue.length < 7) {
      if (!this.bag.length) {
        this.bag = ["I","O","T","S","Z","J","L"];
        for (var i = this.bag.length - 1; i > 0; i--) {
          var j = Math.random() * (i + 1) | 0;
          var t = this.bag[i]; this.bag[i] = this.bag[j]; this.bag[j] = t;
        }
      }
      this.queue.push(this.bag.pop());
    }
  };

  GM.spawn = function () {
    this.fillQueue();
    var type = this.queue.shift();
    this.fillQueue();
    this.current = new Piece(type);
    this.dropTimer = 0;
    this.lockTimer = 0;
    this.lockResets = 0;
    if (this.collides(this.current, 0, 0)) {
      this.gameOver();
    }
  };

  GM.gameOver = function () {
    this.over = true;
    this.state = "over";
    if (this.score > this.highScore) {
      this.highScore = this.score;
      try { localStorage.setItem("tetris_vhs_hi", this.score); } catch (e) {}
    }
  };

  GM.collides = function (p, dx, dy, mat) {
    mat = mat || p.mat;
    var n = mat.length;
    for (var y = 0; y < n; y++) {
      for (var x = 0; x < n; x++) {
        if (!mat[y][x]) continue;
        var gx = p.x + x + dx, gy = p.y + y + dy;
        if (gx < 0 || gx >= COLS || gy >= ROWS) return true;
        if (gy >= 0 && this.grid[gy][gx]) return true;
      }
    }
    return false;
  };

  GM.gravity = function () {
    // seconds per row — accelerates with level
    return Math.max(0.045, 0.85 * Math.pow(0.86, this.level - 1));
  };

  GM.move = function (dx) {
    if (!this.current || this.state !== "play") return false;
    if (!this.collides(this.current, dx, 0)) {
      this.current.x += dx;
      this.onGroundMove();
      return true;
    }
    return false;
  };

  GM.rotate = function (dir) {
    if (!this.current || this.state !== "play") return false;
    var p = this.current;
    if (p.type === "O") return false;
    var next = (p.rot + (dir > 0 ? 1 : 3)) % 4;
    var nm = rotateMatrix(p.mat, dir);
    var table = (p.type === "I" ? KICKS_I : KICKS)["" + p.rot + ">" + next];
    for (var i = 0; i < table.length; i++) {
      var kx = table[i][0], ky = table[i][1];
      if (!this.collides(p, kx, ky, nm)) {
        p.mat = nm;
        p.x += kx;
        p.y += ky;
        p.rot = next;
        this.onGroundMove();
        return true;
      }
    }
    return false;
  };

  GM.onGroundMove = function () {
    if (this.current && this.collides(this.current, 0, 1)) {
      if (this.lockResets < 15) {
        this.lockTimer = 0;
        this.lockResets++;
      }
    }
  };

  GM.softDrop = function () {
    if (!this.current || this.state !== "play") return false;
    if (!this.collides(this.current, 0, 1)) {
      this.current.y++;
      this.score += 1;
      this.dropTimer = 0;
      return true;
    }
    return false;
  };

  GM.hardDrop = function () {
    if (!this.current || this.state !== "play") return null;
    var d = 0;
    while (!this.collides(this.current, 0, 1)) { this.current.y++; d++; }
    this.score += d * 2;
    this.dropTimer = 0;
    var p = this.current;
    var info = { d: d, color: p.color, x: p.x, n: p.mat.length };
    this.lockPiece();
    return info;
  };

  GM.ghostY = function () {
    if (!this.current) return 0;
    var gy = this.current.y;
    while (!this.collides(this.current, 0, gy + 1 - this.current.y)) gy++;
    return gy;
  };

  GM.holdPiece = function () {
    if (!this.current || this.state !== "play" || this.holdUsed) return false;
    var cur = this.current.type;
    if (this.hold) {
      this.current = new Piece(this.hold);
      this.hold = cur;
    } else {
      this.hold = cur;
      this.spawn();
    }
    this.holdUsed = true;
    this.dropTimer = 0;
    this.lockTimer = 0;
    this.lockResets = 0;
    return true;
  };

  GM.lockPiece = function () {
    var p = this.current;
    var cells = p.corners();
    var aboveTop = false;
    for (var i = 0; i < cells.length; i++) {
      var gx = cells[i][0], gy = cells[i][1];
      if (gy < 0) { aboveTop = true; continue; }
      this.grid[gy][gx] = p.color;
    }
    this.current = null;
    this.holdUsed = false;

    if (aboveTop) { this.gameOver(); return; }

    // find full rows
    var rows = [];
    for (var y = 0; y < ROWS; y++) {
      var full = true;
      for (var x = 0; x < COLS; x++) if (!this.grid[y][x]) { full = false; break; }
      if (full) rows.push(y);
    }

    if (rows.length) {
      var self = this;
      this.clearing = {
        rows: rows, t: 0,
        colors: rows.map(function (r) { return self.grid[r].slice(); })
      };
    } else {
      this.spawn();
    }
  };

  GM.finishClear = function () {
    var n = this.clearing.rows.length;
    var rows = this.clearing.rows;
    // remove rows
    for (var i = 0; i < rows.length; i++) {
      this.grid.splice(rows[i], 1);
      this.grid.unshift(new Array(COLS).fill(0));
    }
    // scoring (guideline, x level)
    var base = [0, 100, 300, 500, 800][n];
    this.score += base * this.level;
    this.lines += n;
    var newLevel = Math.floor(this.lines / 10) + 1;
    this.levelUp = newLevel > this.level;
    this.level = newLevel;
    this.clearing = null;
    this.spawn();
  };

  // update(dt) returns events for the UI layer
  GM.update = function (dt) {
    var ev = [];
    if (this.state !== "play") return ev;

    if (this.clearing) {
      this.clearing.t += dt;
      if (this.clearing.t >= 0.28) {
        ev.push({
          type: "cleared",
          rows: this.clearing.rows.length,
          rowsList: this.clearing.rows.slice(),
          colors: this.clearing.colors
        });
        this.finishClear();
      }
      return ev;
    }

    if (!this.current) return ev;

    // lock delay
    if (this.collides(this.current, 0, 1)) {
      this.lockTimer += dt;
      if (this.lockTimer >= 0.5) {
        ev.push({ type: "lock" });
        this.lockPiece();
      }
      return ev;
    }
    this.lockTimer = 0;

    this.dropTimer += dt;
    var g = this.gravity();
    while (this.dropTimer >= g) {
      this.dropTimer -= g;
      if (!this.collides(this.current, 0, 1)) {
        this.current.y++;
      } else {
        this.dropTimer = 0;
        break;
      }
    }
    return ev;
  };

  global.Tetris = { Game: Game, COLS: COLS, ROWS: ROWS, PIECES: PIECES, Piece: Piece };
})(window);
