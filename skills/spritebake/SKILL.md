---
name: spritebake
description: Turn a local video clip (MP4, WebM, MOV) into a transparent sprite sheet PNG or a ZIP of sheet + individual frame PNGs + timing JSON, removing a solid (green/blue/any color) background. Use this whenever the user wants to make sprites, a sprite sheet, sprite atlas, frame animation, or game character animation frames from a video, wants to chroma-key / remove a green-screen background from video frames, or asks to extract evenly spaced frames from a clip for a game engine (Godot, Unity, Phaser, etc.) — even if they don't name JS SpriteBake.
---

# JS SpriteBake

The CLI runs the JS SpriteBake editor's own pipeline in headless Chrome/Edge, so results match the web editor exactly.

## Locate the CLI

`cli.mjs` sits two folders above this file (`<this skill dir>/../../cli.mjs`). If it is missing (the skill folder was copied on its own), ask the user where the JS SpriteBake folder is. Do not reimplement the pipeline with FFmpeg or Python.

Requirements: Node.js 22+ and desktop Chrome or Edge. Check with `node --version`; if Chrome/Edge lives in an unusual place, pass `--browser <path>`.

## Run

```sh
node <repo>/cli.mjs <video> [options]
```

Progress goes to stderr; the only stdout line is the output file path. Exit code 1 means failure, and the message after `spritebake:` says why (the app's own messages are Korean; translate them for the user).

| Option | Meaning | Default |
| --- | --- | --- |
| `--start`, `--end` | Range in seconds, end exclusive | 0 → min(1, duration) |
| `--frames` | Frames to sample evenly, 2–64 | 12 |
| `--resolution` | Processing limit 512 / 1024 / 2048 | 1024 |
| `--key-color` | Background to remove, `#rrggbb` | `#00ff00` |
| `--tolerance` / `--softness` / `--despill` | 1–60 / 0–20 / 0–100 | 30 / 8 / 75 |
| `--no-key` | Keep the background | |
| `--cell` | Cell size 128 / 256 / 512 / 1024 | 256 |
| `--columns` | Sheet columns, 1–16 | 4 |
| `--no-crop` | Skip the shared content crop | |
| `--fps` | Playback FPS in the JSON | frames ÷ range |
| `--dedupe` | Merge adjacent duplicate frames, keeping total duration | |
| `--preset` | Settings JSON saved from the editor; flags override it | |
| `--format` | `zip` (sheet, frames, JSON, settings) or `png` (sheet only) | `zip` |
| `--out` | Output directory | current directory |

## Choosing settings

- **Range**: for a walk/run loop, use one cycle. If the user doesn't know the cycle, keep the default first second and tell them they can tune it in the editor.
- **Background color**: ask, or look at a frame if the user says "the background" without a color. Pure green `#00ff00` is the default; blue screens are often `#0000ff` or close to it.
- **Fringes or holes**: green edges left → raise `--despill` or `--tolerance`; parts of the character disappear → lower `--tolerance`.
- **ZIP vs PNG**: game engines usually want the ZIP, because its JSON keeps per-frame `durationMs` (important after `--dedupe`). Use PNG when the user only wants the image.
- Keep `frames × width × height` modest: start at 12–24 frames and 1024 resolution. The app refuses jobs that need too much memory, and the error tells you to lower one of them.

## After running

Show the output path, frame count and sheet size from the `Extracted …` line. Look at the PNG sheet to check the background is gone before reporting success; for a ZIP, extract only the sheet into a temporary directory and delete it afterwards. For fine edits (per-frame offsets, excluding specific frames, picking the key color by clicking), point the user to the web editor: `start.command` (macOS) / `start.cmd` (Windows), or `python3 server.py`.
