# Contributing to JS SpriteBake

Reports and small improvements are welcome. This is a personal convenience tool, so focused changes that make real sprite work easier are especially useful.

## Run and check

Use Python 3.9+ and Chrome/Edge. Node.js 22+ is needed for the CLI and JavaScript tests, not for the editor.

```sh
python3 server.py
python3 -m unittest discover -s tests -p "test_*.py"
node --test tests/core.test.mjs
npm run check
```

On Windows use `py -3` or `python` instead of `python3`. Optional browser checks, with the server still running:

```sh
node tests/browser-check.mjs http://127.0.0.1:8765
```

The browser script creates its own geometric walking video using canvas and MediaRecorder. A nonstandard Chrome path can be supplied through `SPRITE_TEST_BROWSER`. Temporary profiles and downloads are stored under `.qa/`, which must remain untracked. The check also runs `cli.mjs` once. README screenshots are only rewritten with `UPDATE_PREVIEWS=1`.

## Useful reports

- Include OS, Python version, browser/version and the operation that failed.
- For video problems include container, codec and dimensions if known.
- Share a tiny reproducible example you have permission to publish, or describe how to generate one.
- Keep private videos, exported JSON containing private filenames, logs, credentials and browser profiles out of issues and commits.
- Report sensitive security findings through the process in [SECURITY.md](SECURITY.md).

## Changes

Preserve shared scaling, source timestamps, transparent output and per-frame timing. Keep normal usage free of package installation and external requests. Follow [DESIGN.md](DESIGN.md) for visual changes. Update all three READMEs, and `skills/spritebake/SKILL.md` for CLI changes, when a change affects setup or use. Tests should check observable behavior, especially saved output and timing.

By contributing, you agree to provide your contribution under this project's [MIT license](LICENSE). This does not change the license or ownership of unrelated media.
