#!/usr/bin/env python3
"""Render real UI captures with captions; encode a silent GIF and MP4."""
import json
import os
from pathlib import Path
import subprocess
import sys
import imageio_ffmpeg
from PIL import Image, ImageDraw, ImageFont

out = Path(sys.argv[1]).resolve()
meta = json.loads((out / 'capture.json').read_text())
frames = meta['frames']
width, height, fps = meta['width'], meta['height'] + 84, meta['fps']
work = out / 'frames'
work.mkdir(exist_ok=True)
font_path = os.environ.get('DEMO_FONT', '/System/Library/Fonts/Supplemental/Arial.ttf')
font = ImageFont.truetype(font_path, 22)
small = ImageFont.truetype(font_path, 15)
cache = {}
for i, frame in enumerate(frames):
    key = (frame['file'], frame['caption'])
    target = work / f'frame-{i:05d}.png'
    if target.exists():
        target.unlink()
    if key in cache:
        os.link(cache[key], target)
        continue
    image = Image.new('RGB', (width, height), '#0e171b')
    with Image.open(out / frame['file']) as capture:
        image.paste(capture.convert('RGB'), (0, 0))
    draw = ImageDraw.Draw(image)
    draw.line((24, meta['height'] + 1, width - 24, meta['height'] + 1), fill='#486259')
    assert draw.textlength(frame['caption'], font=font) < width - 48, frame['caption']
    draw.text((24, meta['height'] + 16), frame['caption'], font=font, fill='#c5e6d6')
    draw.text((24, meta['height'] + 49), 'AFM REFACTOR  /  Учебный пример · настоящий интерфейс · сохранённые планы', font=small, fill='#8da5aa')
    image.save(target)
    cache[key] = target
ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
def run(*args):
    subprocess.run([ffmpeg, '-hide_banner', '-loglevel', 'warning', '-y', *map(str, args)], check=True)
pattern = work / 'frame-%05d.png'
run('-framerate', fps, '-i', pattern, '-vf', 'palettegen=max_colors=192:stats_mode=diff', '-frames:v', 1, '-update', 1, out / 'palette.png')
run('-framerate', fps, '-i', pattern, '-i', out / 'palette.png', '-lavfi', 'paletteuse=dither=none:diff_mode=rectangle', '-loop', 0, out / 'refactor-workshop.gif')
with Image.open(work / 'frame-00000.png') as image:
    image.save(out / 'poster.jpg', quality=95)
run('-framerate', fps, '-i', pattern, '-c:v', 'libx264', '-crf', 18, '-preset', 'fast', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out / 'refactor-workshop.mp4')
with Image.open(out / 'refactor-workshop.gif') as gif:
    duration = 0
    for i in range(gif.n_frames):
        gif.seek(i)
        duration += gif.info['duration']
    assert gif.size == (width, height)
    assert abs(duration - len(frames) / fps * 1000) <= 30
    size = (out / 'refactor-workshop.gif').stat().st_size
    assert size < 10 * 1024 * 1024, f'GIF exceeds 10 MiB: {size}'
    result = {'width': width, 'height': height, 'duration_ms': duration, 'bytes': size, 'fps': fps, 'captured_frames': len(frames), 'gif_frames': gif.n_frames, 'browser_errors': meta['errors']}
(out / 'validation.json').write_text(json.dumps(result, indent=2) + '\n')
beats = list(dict.fromkeys(f['beat'] for f in frames))
sheet = Image.new('RGB', (720 * 2, 492 * 4), '#0e171b')
for i, beat in enumerate(beats):
    candidates = [j for j,f in enumerate(frames) if f['beat'] == beat]
    j = candidates[int(len(candidates) * .7)]
    with Image.open(work / f'frame-{j:05d}.png') as image:
        image.resize((720, 492), Image.Resampling.LANCZOS).save(out / f'{beat}.jpg', quality=95)
        sheet.paste(image.resize((720, 492), Image.Resampling.LANCZOS), ((i % 2) * 720, (i // 2) * 492))
sheet.save(out / 'contact-sheet.jpg', quality=95)
print(json.dumps(result))
