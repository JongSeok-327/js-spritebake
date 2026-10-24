# Security and privacy

## Supported scope

JS SpriteBake 1.0.x is a personal, local application. It is not a hosted service or a hardened public web server. The initial release has automated boundary tests and browser workflow checks; it has not had an independent security audit.

## What the application does

- Starts a Python HTTP server on IPv4 loopback `127.0.0.1` only.
- Serves an allowlisted set of application asset types from the resolved `dist/` directory.
- Accepts GET/HEAD for those assets; rejects file-writing methods and directory listing.
- Checks the Host header, Origin when present, and cross-site fetch metadata. Resolved paths outside the asset directory, including escaping symlinks, are rejected.
- Sends a Content Security Policy limiting scripts, styles, workers and connections to its own origin, with Blob media support. It also disables framing and sends `nosniff`, same-origin resource and no-referrer headers.
- Reads selected videos and setting files in the browser. The server has no upload or processing endpoint and does not receive their contents.
- Generates PNG/ZIP/JSON downloads on request. The original filename, timestamps and edits can appear in exported JSON.

The app code contains no analytics, account system, cookies, external font/CDN requests or model API calls. Local HTTP requests for the app's own assets are expected. Browser/OS networking is outside this statement.

## Boundaries

- A local malicious process or browser extension may have access beyond these controls. Loopback is not an authentication mechanism.
- Video decoding is performed by the browser and OS. Use trusted media and keep them updated, along with Python.
- Large files and frame counts may exhaust memory or make the tab unresponsive. A memory guard reduces some oversized jobs, but is not a complete denial-of-service defense.
- Do not put secrets in `dist/`, add external symlinks there, expose the server through a tunnel/port-forward, or change the bind address to a public/LAN interface.
- Refreshing or closing the tab discards unsaved edits. Downloads are ordinary local files, not encrypted backups.
- These server protections apply to the supplied launcher/server. Serving the static files through another server can change headers and exposure.
- The CLI (`cli.mjs`) starts its own short-lived server on `127.0.0.1` with a random port. It serves only `dist/` files to a headless browser that uses a temporary profile, and both stop when the command ends.

## Reporting a vulnerability

Use the GitHub repository's **Security → Report a vulnerability** option if it is enabled. If it is unavailable, open an issue requesting a private reporting channel without posting exploit details, private paths or sensitive media. No private email address or response-time guarantee is published at this stage.

For routine usage problems, use an issue and include OS, Python/browser versions, file container/codec if known, and minimal reproduction steps. You do not need to upload private source videos.
