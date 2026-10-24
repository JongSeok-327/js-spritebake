# Included sample and demo assets

`dist/samples/walk-demo.mp4` is a 2-second, 512 × 512, 24 FPS H.264 video on a solid green background (about 53 KiB). It depicts a simple geometric walking character drawn specifically for JS SpriteBake. It contains no user artwork, personal footage, generated character footage or downloaded third-party media.

The original drawing and recording code is in [tests/fixtures/generate-video.js](../tests/fixtures/generate-video.js). The bundled MP4 was trimmed and encoded from its browser-recorded WebM using FFmpeg. FFmpeg is a maintainer tool here; it is **not required to run the app** and is not bundled.

The frame counter is intentional: it helps distinguish source frames while testing extraction. This is a functional sample, not an example of finished character art. Your own video's original style is retained; the app does not redraw it.

`docs/assets/demo.gif` compares this input video with an animation made from the app's exported PNG frames. The editor screenshots use the same public sample. The project-created sample, screenshots and demo are included under the project's [MIT license](../LICENSE), as are the code and documentation.

In the editor, choose **Try sample video**. It loads this bundled file from the local server into a browser Blob, restores default settings, extracts the first second into 12 frames and plays the result. No internet connection or external video service is involved. Nothing loads automatically on startup.

Use `?lang=en`, `?lang=ko` or `?lang=ja` on the local app URL to open a particular interface language. The language selector updates this URL and retains your current video and frame edits. Without a language parameter, the app uses a supported browser language, falling back to English. It does not save language preferences in cookies or localStorage.
