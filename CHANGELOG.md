# Changelog

## 1.1.0

- Add English, Korean and Japanese interfaces, including help, status messages and accessibility labels.
- Follow the browser language on first use and support explicit `?lang=en`, `?lang=ko` and `?lang=ja` links. Switching language retains video and frame edits without cookies or localStorage.
- Include a 2-second walking sample (Kong from *kong-survivors*) and a one-click sample workflow that extracts and previews 8 frames.
- Show an animated input/output comparison and editor screenshots in all three READMEs, with sample provenance and licensing. `tests/capture-previews.mjs` regenerates the screenshots; browser checks no longer overwrite them.
- Add a command-line interface (`cli.mjs`) that runs the editor pipeline in headless Chrome/Edge.
- Add a Claude Code plugin with a `spritebake` skill that drives the CLI.
- Lower the minimum Python version to 3.9 so macOS's bundled `python3` works; `start.command` prefers a newer Python when installed.
- Add macOS system fonts and a favicon. `npm start` works on macOS.
- Rewrite the READMEs around quick start, sample, CLI and skill usage.
- Verify sample seeking through a local Blob, translation completeness, preserved edits and responsive layouts.

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
