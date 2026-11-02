#!/usr/bin/env python3
"""Compose foliage cluster cards from ambientCG CC0 leaf scans (LeafSet009/010).

Each card is a 1024x1024 RGBA texture densely packed with individually scattered,
rotated and colour-varied leaves (darker toward the middle for a fake ambient-occlusion
look) plus a few twigs. Trees are built in-engine from many of these cards.
Output: public/assets/tex/foliage/{card_maple,card_round}.webp (+512 versions)
Usage: python3 tools/build_foliage.py <dir containing LeafSet009/ and LeafSet010/>
"""
import os, sys, random, math
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

src = sys.argv[1]
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'assets', 'tex', 'foliage')
os.makedirs(OUT, exist_ok=True)


def leaves(set_id, cols, rows):
    c = Image.open(f'{src}/{set_id}/{set_id}_2K-PNG_Color.png').convert('RGB')
    o = Image.open(f'{src}/{set_id}/{set_id}_2K-PNG_Opacity.png').convert('L')
    rgba = c.copy(); rgba.putalpha(o)
    W, H = c.size
    out = []
    for j in range(rows):
        for i in range(cols):
            cell = rgba.crop((i * W // cols, j * H // rows, (i + 1) * W // cols, (j + 1) * H // rows))
            bbox = cell.getchannel('A').point(lambda v: 255 if v > 30 else 0).getbbox()
            if bbox: out.append(cell.crop(bbox))
    return out


def card(leafset, name, seed, hue_shift=(1.0, 1.0, 1.0), count=170, size=(70, 120)):
    rnd = random.Random(seed)
    S = 1024
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    # twigs first (behind leaves)
    for _ in range(9):
        a = rnd.uniform(0, math.tau); r0 = rnd.uniform(20, 120); r1 = rnd.uniform(280, 470)
        x0, y0 = S / 2 + math.cos(a) * r0, S / 2 + math.sin(a) * r0
        x1, y1 = S / 2 + math.cos(a) * r1, S / 2 + math.sin(a) * r1
        draw.line([(x0, y0), (x1, y1)], fill=(72, 56, 40, 255), width=rnd.randint(5, 9))
    placed = []
    for k in range(count):
        # denser toward the centre, ragged edge
        r = (rnd.random() ** 0.65) * 440
        a = rnd.uniform(0, math.tau)
        x, y = S / 2 + math.cos(a) * r, S / 2 + math.sin(a) * r
        lf = rnd.choice(leafset)
        sz = rnd.uniform(*size) * (1.15 - r / 900)
        lf = lf.resize((max(8, int(sz * lf.width / lf.height)), max(8, int(sz))), Image.LANCZOS)
        lf = lf.rotate(math.degrees(a) - 90 + rnd.uniform(-50, 50), expand=True, resample=Image.BICUBIC)
        # colour variation + depth darkening (inner leaves darker)
        depth = 1 - r / 440
        rgb = lf.convert('RGB')
        rgb = ImageEnhance.Brightness(rgb).enhance(rnd.uniform(0.72, 1.08) * (1 - depth * 0.38))
        rgb = ImageEnhance.Color(rgb).enhance(rnd.uniform(0.85, 1.15))
        rr, gg, bb = rgb.split()
        rr = rr.point(lambda v: int(v * hue_shift[0])); gg = gg.point(lambda v: min(255, int(v * hue_shift[1]))); bb = bb.point(lambda v: int(v * hue_shift[2]))
        lf2 = Image.merge('RGB', (rr, gg, bb)); lf2.putalpha(lf.getchannel('A'))
        placed.append((depth, x, y, lf2))
    # draw inner (darker) first so bright outer leaves sit on top
    for depth, x, y, lf in sorted(placed, key=lambda p: -p[0]):
        img.alpha_composite(lf, (int(x - lf.width / 2), int(y - lf.height / 2)))
    # bleed colour into transparent pixels to avoid dark fringes with mipmaps
    a = img.getchannel('A')
    bled = img.convert('RGB').filter(ImageFilter.MaxFilter(9))
    base = Image.composite(img.convert('RGB'), bled, a)
    base.putalpha(a)
    base.save(os.path.join(OUT, f'{name}.webp'), 'WEBP', quality=88, method=5)
    base.resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, f'{name}_512.webp'), 'WEBP', quality=86, method=5)
    print('card', name)


maple = leaves('LeafSet010', 2, 2)
round_ = leaves('LeafSet009', 3, 2)
print(len(maple), 'maple leaves,', len(round_), 'round leaves')
card(maple, 'card_maple', 1, hue_shift=(0.92, 1.0, 0.85), count=190, size=(60, 105))
card(round_, 'card_round', 2, hue_shift=(0.85, 1.0, 0.8), count=230, size=(50, 90))
card(round_, 'card_hedge', 3, hue_shift=(0.75, 0.95, 0.7), count=320, size=(40, 70))
