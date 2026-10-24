# JS SpriteBake

**Turn a local video into a transparent sprite sheet.**

English · [한국어](README.ko.md) · [日本語](README.ja.md)

[Download v1.0.0](https://github.com/JongSeok-327/js-spritebake/releases/tag/v1.0.0) · [Editor screenshot](preview.png) · [Sheet preview](preview-sheet.png)

## Why I made this

I kept turning character videos into sprites while working on my projects, and thought a small tool like this would make the process easier. JS SpriteBake started as a personal convenience tool; I'm sharing it in case it helps someone else's workflow too.

## What it does

- Open a video from your computer and select a time range and frame count.
- Remove a solid-color background, adjust edges and reduce color spill.
- Keep a shared crop and scale across the animation; adjust individual positions.
- Preview animation, the output sheet, individual frames and onion skin.
- Suggest adjacent duplicate frames, inspect pairs, apply exclusions and undo them. Merged duplicates retain their playback time.
- Download a transparent PNG sheet or a ZIP with individual PNGs, timing JSON and reusable settings.

**v1.0.0 · MIT · no runtime package installation · no API key**

The editor UI is currently in Korean. These instructions are available in three languages. The public package starts empty; bring your own video.

## Requirements

| Required | Details |
| --- | --- |
| Python | **3.11 or newer**, installed from [python.org](https://www.python.org/downloads/). Verify with the commands below. |
| Browser | A current desktop **Chrome or Edge**. Decoding depends on the browser and operating system; MP4/H.264 is a practical starting point. |
| Computer | Windows or macOS, with enough memory for the selected video and frames. Start with 512–1024px processing and 12–24 frames. |

Python only serves the app files; the browser processes the video. **FFmpeg, Node.js, npm, Git, GPU software, paid accounts and model services are not needed to use the app.** Downloading the project and installing prerequisites initially requires internet access; the downloaded app can run offline.

Verified locally on Windows with Python 3.11 and Chrome. The macOS launcher and instructions use portable Python/browser APIs, but **an actual MacBook has not yet been tested**. Safari, Firefox and phone use are not verified release targets.

## Windows

1. Install Python 3.11+ from the official site. Ensure the Python launcher or `python` command is available; reopen your terminal after installation.
2. Download the repository ZIP or a release ZIP, then **extract the entire folder**. Do not run from inside the ZIP.
3. Double-click **`start.cmd`**. It tries `py -3`, then `python`, and opens your default browser.
4. Keep the command window open while working. To stop, focus that window and press **Ctrl+C**.

Or use PowerShell in the extracted folder:

```powershell
py -3 --version
py -3 server.py
```

If `py` is unavailable but Python is installed:

```powershell
python --version
python server.py
```

If the default browser cannot decode your file, copy the printed local URL into Chrome or Edge.

## macOS / MacBook

1. Install Python 3.11+ from [python.org](https://www.python.org/downloads/). Verify that `python3 --version` meets the requirement.
2. Extract the entire downloaded ZIP.
3. Open Terminal in the project folder and run:

```sh
python3 --version
python3 server.py
```

Keep Terminal open. Stop the server with **Control+C**. The launcher does not rely on Intel- or Apple Silicon-specific binaries; video decoding is provided by your browser.

For optional double-click startup, first make the included script executable in that folder:

```sh
chmod +x start.command
./start.command
```

You can then double-click `start.command` in Finder. If macOS blocks the downloaded script, review its contents and use the Terminal command above; you do not need to disable system security settings. Homebrew is optional, not a requirement.

## Local address and startup options

The default URL is **`http://127.0.0.1:8765`**. If that port is occupied, the app tries the next 19 ports and prints the actual address. Open that address rather than double-clicking `dist/index.html`, which cannot reliably load ES modules and workers from `file://`.

```sh
# macOS; on Windows replace python3 with py -3 or python
python3 server.py --no-browser
python3 server.py --port 8900
```

## Basic workflow

1. Click **영상 파일 열기** (open video), or drag a file onto it.
2. Set **시작 / 끝** (start / end) and **추출 프레임 수** (frame count). The initial range is the first second, with 12 frames. For walking, choose approximately one complete cycle.
3. Click **프레임 추출** (extract). The end timestamp is excluded so a repeated endpoint is less likely.
4. Set the key color or use **원본에서 색 찍기** (pick from source). Adjust removal range, edge softness and spill suppression. Inspect both light and dark preview backgrounds.
5. Click frames to inspect them. Use previous/next, onion skin, inclusion checkboxes and X/Y offsets. **출력 시트** previews the saved layout.
6. Check duplicate proposals. Clicking a pair alternates its two poses. **후보 제외** applies proposals; **되돌리기** restores them. Application history remains visible, and inclusion/position changes recalculate proposals.
7. Use **PNG 시트** or **전체 ZIP 저장** to download results. Save settings before closing the tab if you want to resume later.

**설정 초기화** resets processing, frame selections, offsets and merged timing, then re-extracts the current video's first second with defaults. It keeps the opened video.

Fixed camera, full-body framing, spare room around weapons/accessories and a uniform background usually make better source footage. Pick a background color that is absent from the character. In-place walking is convenient when your game controls movement.

## Exports and timing

| Output | Contents |
| --- | --- |
| `*-sheet.png` | Transparent RGBA grid. |
| `frames/001.png`, etc. | Individual transparent frames in export order, inside the ZIP. |
| `*.json` | Sheet coordinates, source timestamps, offsets, pivot and each frame's `durationMs`. |
| `*-settings.json` | Processing settings and frame edits. It does not include the video. |

Duplicate proposals compare neighboring included frames in a shared coordinate system. Both overall and lower-body differences must meet the threshold. This is a heuristic, not motion understanding or automatic walk-cycle detection.

**When duplicates are merged, use each frame's `durationMs` in your game to preserve timing.** PNG alone cannot store variable frame timing. Manually unchecking a frame removes its duration; applying a duplicate proposal transfers its duration to the previous retained frame. “Include all” restores one base duration per frame.

The default pivot `(0.5, 0.9)` is an output-cell reference, not a detected foot location. X/Y adjustments use output pixels. Preview guides, numbers and onion skin are not written into PNGs. To resume, open the same video, load its settings JSON and extract again. New files use `js-spritebake` / `js-spritebake-preset` format identifiers; earlier prototype settings are still accepted.

## Privacy and local security

- Selected videos are read through browser File/Blob APIs and processed in browser memory. There is **no video upload endpoint**, cloud processing, account, analytics, application cookie, CDN or external font request.
- The included server binds to **`127.0.0.1` only**, not the LAN. It serves app assets from `dist/`, rejects unexpected hosts/origins and file-write methods, disables directory listings, blocks paths resolving outside the app directory and sends a restrictive content security policy.
- Opening the app makes local HTTP requests for its own files and worker. Downloads save files only when requested. Export metadata includes the source filename and processing information; review it before sharing.
- Work is not autosaved. Refreshing or closing the tab loses in-memory edits; download settings and results first. Browser/OS extensions, malware and browser background networking are outside this app's control.

**Local does not mean risk-free.** Use trusted videos and settings files and keep Python and your browser updated. This small local server is not a public hosting server; do not expose it through port forwarding, tunnels or changes to the bind address. Python's own [`http.server` documentation](https://docs.python.org/3/library/http.server.html) also distinguishes basic local serving from production hosting. See [SECURITY.md](SECURITY.md) for scope and reporting.

## Limits and troubleshooting

- 2–64 frames; processing up to 2048px without upscaling the source. Memory and maximum sheet dimensions impose additional limits. Large jobs can still consume substantial RAM; reduce resolution/count if the tab slows down.
- No automatic stabilization, frame interpolation, AI background removal or generation API. Keying can remove matching character colors; blur, shadows and fine hair may need better source footage or manual work.
- MP4/MOV are containers, not codec guarantees. If loading fails, use a browser-supported codec or convert the file with a tool you trust. No converter is bundled.
- If animation looks static, inspect the distinct-source-frame count and extraction interval. A very short range can repeat decoded frames; a long range with too few frames can miss intermediate poses.
- If Python is not found, install it and reopen the terminal. If startup fails on a port, try `--port 8900`. If the browser does not open, copy the printed URL. After updating files, use Ctrl+F5 on Windows or Command+Shift+R on macOS.

## Development

No build or `pip`/`npm install` step is required. Python tests use the standard library; JavaScript checks require Node.js 22+.

```sh
python3 -m unittest discover -s tests -p "test_*.py"
node --test tests/core.test.mjs
npm run check
```

`node tests/browser-check.mjs http://127.0.0.1:8765` runs optional Chrome integration checks against an already-running server. It generates a geometric walking WebM in the browser; it does not need personal footage or external artwork. Set `SPRITE_TEST_BROWSER` if Chrome is installed in a nonstandard location. Browser checks download temporary artifacts into ignored `.qa/`.

## License and references

[MIT](LICENSE). This covers the project's code and documentation, not imported videos or characters. Use source media you have permission to use and check any generation provider's terms separately.

JS SpriteBake's application code was written specifically for this project and does not vendor third-party application code or runtime packages. Workflow/design research is recorded transparently in [ACKNOWLEDGEMENTS.md](ACKNOWLEDGEMENTS.md). See [CHANGELOG.md](CHANGELOG.md) for release details.
