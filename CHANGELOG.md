# Changelog

## 1.1.0

- Add English, Korean and Japanese interfaces, including help, status messages and accessibility labels.
- Follow the browser language on first use and support explicit `?lang=en`, `?lang=ko` and `?lang=ja` links. Switching language retains video and frame edits without cookies or localStorage.
- Include an original 2-second walking MP4 and a one-click sample workflow that extracts and previews 12 frames.
- Show an animated input/output comparison and editor screenshots in all three READMEs, with sample provenance and licensing.
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
