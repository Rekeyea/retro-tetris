# TETRIS · VHS EDITION

A retro Tetris with rolling film grain, synthesized audio, and CRT/VHS presentation.
Zero dependencies — pure HTML5 canvas + Web Audio. No build step, no assets.

## Run

Open `index.html` in any modern browser (double-click works — no server needed).

```
chromium index.html
# or
python3 -m http.server 8000   # then visit http://localhost:8000
```

## Controls

| Key | Action |
|---|---|
| ← / → | Move (DAS/ARR tuned) |
| ↓ | Soft drop |
| ↑ / X | Rotate CW |
| Z | Rotate CCW |
| Space | Hard drop |
| C / Shift | Hold |
| P / Esc | Pause |
| M | Music on/off |
| S | SFX on/off |
| Enter | Start / restart |

## Features

- **Rolling film grain** — pre-generated noise tiles scroll vertically at an
  organic feed speed, flicker at ~24 fps, and jitter per frame, over a base of
  scanlines, wandering chroma fringes, a periodic VHS tracking band, white
  dust specks, and a vignette. Grain intensity reacts to screen shake and
  line-clear flashes.
- **Game feel** — screen shake, particle bursts on line clears, hard-drop
  sparks, floating score popups, "TETRIS!" flash on four-line clears,
  level-up board flash, animated title screen with falling piece rain.
- **Audio** — all SFX synthesized (move, rotate, soft/hard drop, lock, clears,
  level up, hold, pause, game over) plus an optional 120 BPM synthwave loop
  (kick/snare/hats, driving bass, 16th-note arp with dotted-8th feedback
  delay, chord pads) that ducks on big events.
- **Core** — 7-bag randomizer, SRS wall kicks, ghost piece, hold, 5-piece
  next queue, guideline scoring (100/300/500/800 × level), lock delay with
  move resets, level-up every 10 lines, persistent hi-score (localStorage).

## Structure

```
index.html    page shell + script order
style.css     page layout, canvas glow, boot text
src/font.js   5×7 pixel font with pre-rendered glow cache
src/audio.js  Web Audio SFX + synthwave music sequencer
src/grain.js  rolling film grain / VHS overlay
src/tetris.js board, pieces, SRS kicks, 7-bag, scoring
src/main.js   render loop, input (DAS/ARR), effects, screens
```
