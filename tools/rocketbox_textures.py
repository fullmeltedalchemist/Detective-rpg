#!/usr/bin/env python3
"""Convert Rocketbox TGA textures to web-ready WebP at two quality tiers.
  colour/opacity -> 1024 (high) and 512 (low/medium); normal -> 512 (all tiers)
Output: public/assets/humans/rb/tex/{1024,512}/<material>_{color,normal}.webp
Usage: python3 tools/rocketbox_textures.py <rocketbox repo> Name [Name...]
"""
import os, sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'assets', 'humans', 'rb', 'tex')
repo, names = sys.argv[1], sys.argv[2:]
for tier in ('1024', '512'):
    os.makedirs(os.path.join(OUT, tier), exist_ok=True)
SKIP = ('shotgun', 'machinegun', 'helmet', 'specular')

for n in names:
    tdir = os.path.join(repo, 'Assets', 'Avatars', n, 'Textures')
    for f in sorted(os.listdir(tdir)):
        if not f.endswith('.tga') or any(k in f for k in SKIP):
            continue
        stem = f[:-4]
        im = Image.open(os.path.join(tdir, f))
        is_normal = stem.endswith('_normal')
        has_alpha = 'opacity' in stem
        im = im.convert('RGBA' if has_alpha else 'RGB')
        tiers = [('512', 512)] if is_normal else [('1024', 1024), ('512', 512)]
        for tier, size in tiers:
            out = os.path.join(OUT, tier, f'{stem}.webp')
            if os.path.exists(out):
                continue
            im.resize((size, size), Image.LANCZOS).save(out, 'WEBP', quality=84 if not is_normal else 90, method=5)
        print('  ', n.split('/')[-1], stem)
