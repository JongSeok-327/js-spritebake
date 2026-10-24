# Changelog

## Unreleased

- Add a command-line interface (`cli.mjs`) that runs the editor pipeline in headless Chrome/Edge.
- Add a Claude Code plugin with a `spritebake` skill that drives the CLI.
- Lower the minimum Python version to 3.9 so macOS's bundled `python3` works; `start.command` prefers a newer Python when installed.
- Add macOS system fonts and a favicon. `npm start` works on macOS.
- README screenshots now show a kong-survivors character walk; `tests/capture-previews.mjs` regenerates them, and browser checks no longer overwrite them.
- Rewrite the English, Korean and Japanese READMEs around quick start, CLI and skill usage.

## 1.0.0

First public release under the JS SpriteBake name.

- Import a local video and extract an end-exclusive, evenly sampled range.
- Remove solid-color backgrounds, adjust feathering and suppress spill.
- Preserve one shared crop and scale across an animation.
- Inspect animation, sheet layout, onion skin and individual frames.
- Suggest adjacent duplicate frames, preserve merged duration, retain application history and support undo.
- Export transparent PNG sheets, individual PNGs and timing JSON in a ZIP.
- Save and restore processing settings.
- Provide Windows and macOS launchers and English, Korean and Japanese documentation.
- Serve only application assets on IPv4 loopback, with host/origin checks and browser security headers.
- Start with an empty workspace. Personal development videos are excluded from the public package.

Earlier 0.x builds were local prototypes and are not separate public releases.
