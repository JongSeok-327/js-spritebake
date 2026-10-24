"""Builds docs/assets/walkthrough-<lang>.gif from frames recorded by capture-walkthrough.mjs.

Maintainer tool; needs Pillow (python3 -m pip install pillow). Usage: python3 tests/make-walkthrough-gif.py <lang>
"""
import json
from pathlib import Path
import sys

from PIL import Image

lang = sys.argv[1] if len(sys.argv) > 1 else 'en'
root = Path(__file__).resolve().parents[1]
source = root / '.qa' / f'walkthrough-{lang}'
frames = json.loads((source / 'frames.json').read_text())
images, durations, previous = [], [], None
for frame in frames:
    image = Image.open(source / frame['name']).convert('RGB')
    if previous is not None and image.tobytes() == previous:
        durations[-1] += frame['ms']  # Merge unchanged frames into one longer frame.
        continue
    previous = image.tobytes()
    # An adaptive palette per frame keeps the dark UI and the character's colors clean.
    images.append(image.quantize(colors=96, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE))
    durations.append(frame['ms'])
durations = [max(20, round(ms / 10) * 10) for ms in durations]
target = root / 'docs' / 'assets' / f'walkthrough-{lang}.gif'
images[0].save(target, save_all=True, append_images=images[1:], duration=durations, loop=0, optimize=True)
print(f'{target} {target.stat().st_size // 1024} KiB, {len(images)} frames, {sum(durations) / 1000:.1f}s')
