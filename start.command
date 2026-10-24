#!/bin/sh
set -eu
cd -- "$(dirname -- "$0")"
# Prefer a newer Python when one is installed next to macOS's bundled python3.
for python in python3.13 python3.12 python3.11 python3.10 python3; do
    if command -v "$python" >/dev/null 2>&1; then
        exec "$python" server.py
    fi
done
printf '%s\n' 'Python 3.9 or newer is required.' 'Download: https://www.python.org/downloads/'
exit 1
