#!/bin/sh
set -eu
cd -- "$(dirname -- "$0")"
if ! command -v python3 >/dev/null 2>&1; then
    printf '%s\n' 'Python 3.11 or newer is required.' 'Download: https://www.python.org/downloads/'
    exit 1
fi
exec python3 server.py
