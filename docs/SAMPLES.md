# Included sample and demo assets

`dist/samples/walk-demo.mp4` is a 2-second, 512 × 512, 24 FPS H.264 video on a solid green background (about 97 KiB). It shows Kong, the player character of the author's game *kong-survivors*, walking in place: eight walk poses, one cycle per second, each pose centred on a multiple of 1/8 s so that even sampling lands mid-pose. It contains no third-party media.

The author drew Kong and owns the character. The eight poses are the game's existing sprite frames (`kong_v3/walk_00`–`walk_07`, 256 px), composited onto `#00ff00` at 448 px and recorded with the browser's `MediaRecorder`. Because the poses were already transparent before recording, the sample keys more cleanly than typical camera or generated footage.

`docs/assets/demo.gif` puts the sample's source frames next to the transparent frames the CLI exports from it (8 frames, `--cell 512`). It was assembled with Pillow, a maintainer tool that is **not required to run the app**. The editor screenshots come from `node tests/capture-previews.mjs <server URL>`, which loads this sample in each interface language. The walkthrough GIFs (`docs/assets/walkthrough-<lang>.gif`) are recorded with `node tests/capture-walkthrough.mjs <server URL> <lang>` and assembled with `python3 tests/make-walkthrough-gif.py <lang>`. The pointer in them is drawn by the recording script.

The sample, screenshots and demo are included under the project's [MIT license](../LICENSE), as are the code and documentation. That covers these files; it does not grant rights to use the Kong character in other works.

In the editor, choose **Try sample video**. It loads this bundled file from the local server into a browser Blob, restores default settings, extracts the first second into 8 frames and plays the result. No internet connection or external video service is involved. Nothing loads automatically on startup.

Use `?lang=en`, `?lang=ko` or `?lang=ja` on the local app URL to open a particular interface language. The language selector updates this URL and retains your current video and frame edits. Without a language parameter, the app uses a supported browser language, falling back to English. It does not save language preferences in cookies or localStorage.

The automated browser check still records its own geometric walking video from [tests/fixtures/generate-video.js](../tests/fixtures/generate-video.js); it does not depend on this sample's artwork.
