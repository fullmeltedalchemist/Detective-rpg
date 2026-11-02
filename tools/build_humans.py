#!/usr/bin/env python3
"""Paint clothing onto the CC0 Quaternius "Universal Base Characters" textures.

The base characters ship as unclothed bodies. Each outfit is painted directly into the
character's UV space: every triangle is classified by its dominant skin bone (torso,
upper/lower arm, thigh, calf, foot, head, hands) plus its bind-pose position, then filled
with fabric colour and subtle procedural weave. Clothed areas also get a flattened normal
map so muscles don't show through cloth.

Output: public/assets/humans/outfits/<id>_{diff,nor}.webp (512px)
Usage:  python3 tools/build_humans.py <path to "Universal Base Characters[Standard]">
"""
import json, os, sys, struct
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'assets', 'humans', 'outfits')
SIZE = 1024

C = lambda h: tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))

# id: body, skin, outfit
OUTFITS = {
    'detective': ('m', 'light', dict(jacket=C('#2b2f36'), shirt=C('#e9e6df'), tie=C('#6a1c22'), pants=C('#30343b'), shoes=C('#141414'), belt=C('#1a1410'), sleeves='long')),
    'okafor': ('f', 'dark', dict(shirt=C('#1d2a44'), pants=C('#1a2236'), shoes=C('#121212'), belt=C('#0e0e0e'), sleeves='long', badge=True)),
    'rosa': ('f', 'light', dict(shirt=C('#e8dcc4'), pants=C('#24262a'), shoes=C('#2a1d16'), apron=C('#2f5a46'), sleeves='short')),
    'nina': ('f', 'light', dict(shirt=C('#a9c3dd'), pants=C('#5c5f66'), shoes=C('#1d1d1f'), belt=C('#2a2a2a'), sleeves='long')),
    'dale': ('m', 'light', dict(shirt=C('#b4231d'), pants=C('#3d5a80'), shoes=C('#e9e9e4'), sleeves='short')),
    'victor': ('m', 'dark', dict(shirt=C('#8d9096'), pants=C('#5a5a3c'), shoes=C('#4a3222'), sleeves='short')),
    'civ_m1': ('m', 'dark', dict(shirt=C('#3f6e52'), pants=C('#b9a77e'), shoes=C('#5a3b26'), belt=C('#3a2a1c'), sleeves='short')),
    'civ_f1': ('f', 'dark', dict(shirt=C('#c99a2e'), pants=C('#1f2024'), shoes=C('#3a2a20'), sleeves='long')),
    'civ_f2': ('f', 'light', dict(shirt=C('#ece9e2'), pants=C('#4a6d93'), shoes=C('#d8d6d0'), sleeves='short')),
    'thug1': ('m', 'light', dict(shirt=C('#1b1c1f'), pants=C('#2b3340'), shoes=C('#111111'), sleeves='long', hood=True)),
    'thug2': ('m', 'dark', dict(jacket=C('#3b4030'), shirt=C('#222222'), pants=C('#1c1c1c'), shoes=C('#151515'), sleeves='long')),
    'lookout': ('m', 'light', dict(shirt=C('#26365a'), pants=C('#707378'), shoes=C('#ececec'), sleeves='long')),
    'officer_m': ('m', 'dark', dict(shirt=C('#1d2a44'), pants=C('#1a2236'), shoes=C('#121212'), belt=C('#0e0e0e'), sleeves='short', badge=True)),
}

TEX = {
    ('m', 'light'): 'T_Superhero_Male_Ligh.png', ('m', 'dark'): 'T_Superhero_Male_Dark.png',
    ('f', 'light'): 'T_Superhero_Female_Light_BaseColor.png', ('f', 'dark'): 'T_Superhero_Female_Dark_BaseColor.png',
}
NOR = {'m': 'T_Superhero_Male_Normal.png', 'f': 'T_Superhero_Female_Normal.png'}
GLTF = {'m': 'Superhero_Male_FullBody.gltf', 'f': 'Superhero_Female_FullBody.gltf'}
BODY_MESH = {'m': 'Sphere.005_Retopology.004', 'f': 'Superhero_Female'}

CT = {5120: 'b', 5121: 'B', 5122: 'h', 5123: 'H', 5125: 'I', 5126: 'f'}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}


def read_accessor(d, buf, idx):
    a = d['accessors'][idx]
    bv = d['bufferViews'][a['bufferView']]
    n, comps, ct = a['count'], NC[a['type']], CT[a['componentType']]
    size = struct.calcsize(ct)
    stride = bv.get('byteStride', size * comps)
    off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    out = np.zeros((n, comps), dtype=np.float64)
    raw = buf[off: off + stride * (n - 1) + size * comps]
    dt = np.dtype(ct).newbyteorder('<')
    for c in range(comps):
        out[:, c] = np.frombuffer(raw, dtype=dt, count=n, offset=c * size) if stride == size * comps and c == 0 and False else \
            np.ndarray((n,), dtype=dt, buffer=raw, offset=c * size, strides=(stride,))
    if a.get('normalized') and ct in 'BH':
        out /= (255.0 if ct == 'B' else 65535.0)
    return out


def load_body(base, body):
    gdir = os.path.join(base, 'Base Characters', 'Godot - UE')
    d = json.load(open(os.path.join(gdir, GLTF[body])))
    buf = open(os.path.join(gdir, d['buffers'][0]['uri']), 'rb').read()
    mesh = next(m for m in d['meshes'] if m['name'] == BODY_MESH[body])
    p = mesh['primitives'][0]
    at = p['attributes']
    pos = read_accessor(d, buf, at['POSITION'])
    uv = read_accessor(d, buf, at['TEXCOORD_0'])
    joints = read_accessor(d, buf, at['JOINTS_0']).astype(int)
    weights = read_accessor(d, buf, at['WEIGHTS_0'])
    idx = read_accessor(d, buf, p['indices']).astype(int).reshape(-1, 3)
    names = [d['nodes'][j]['name'] for j in d['skins'][0]['joints']]
    return pos, uv, joints, weights, idx, names


def bone_category(name):
    n = name.lower()
    if n in ('head', 'neck_01'): return 'head'
    if n.startswith(('hand', 'index', 'middle', 'pinky', 'ring', 'thumb')): return 'hand'
    if n.startswith('lowerarm'): return 'lowerarm'
    if n.startswith(('upperarm', 'clavicle')): return 'upperarm'
    if n.startswith('spine'): return 'torso'
    if n == 'pelvis' or n == 'root': return 'pelvis'
    if n.startswith('thigh'): return 'thigh'
    if n.startswith('calf'): return 'calf'
    if n.startswith(('foot', 'ball')): return 'foot'
    return 'torso'


def classify(pos, joints, weights, idx, names, height):
    cats = np.array([bone_category(n) for n in names])
    labels = ['head', 'hand', 'lowerarm', 'upperarm', 'torso', 'pelvis', 'thigh', 'calf', 'foot']
    lab_idx = {l: i for i, l in enumerate(labels)}
    jcat = np.array([lab_idx[c] for c in cats])
    vscore = np.zeros((len(pos), len(labels)))
    for k in range(4):
        np.add.at(vscore, (np.arange(len(pos)), jcat[joints[:, k]]), weights[:, k])
    tri_score = vscore[idx].sum(axis=1)
    tri_cat = np.array(labels)[tri_score.argmax(axis=1)]
    centroid = pos[idx].mean(axis=1)
    return tri_cat, centroid


def region_color(cat, c, o, height, front_sign):
    """Return (rgb, is_cloth) for a triangle with category cat and centroid c."""
    x, y, z = c
    yn = y / height
    belt = 0.535
    front = z * front_sign > 0.02
    sleeves = o.get('sleeves', 'long')
    jacket = o.get('jacket')
    top = jacket or o['shirt']
    if cat == 'head':
        if o.get('hood') and yn < 0.86 and abs(x) > 0.05 and z * front_sign < 0.06: return o['shirt'], True
        if yn < 0.835: return (o['shirt'] if not jacket else o['shirt']), True  # collar
        return None, False
    if cat == 'hand': return None, False
    if cat == 'lowerarm':
        if sleeves == 'long':
            # leave the wrist area as skin
            return top, True
        return None, False
    if cat == 'upperarm':
        if sleeves == 'short' and abs(x) > 0.36: return None, False
        return top, True
    if cat in ('torso', 'pelvis') and yn > belt:
        if o.get('belt') and yn < belt + 0.025: return o['belt'], True
        if o.get('apron') and front and abs(x) < 0.17 and yn < 0.70: return o['apron'], True
        if jacket and front and abs(x) < 0.07 and yn > 0.6:
            if o.get('tie') and abs(x) < 0.022 and yn < 0.80: return o['tie'], True
            return o['shirt'], True
        if o.get('badge') and front and 0.06 < x * (1) < 0.12 and 0.70 < yn < 0.74: return C('#c9a540'), True
        return top, True
    if cat in ('torso', 'pelvis', 'thigh'):
        if o.get('apron') and front and abs(x) < 0.2 and yn > 0.36: return o['apron'], True
        return o['pants'], True
    if cat == 'calf':
        if yn < 0.06: return o['shoes'], True
        return o['pants'], True
    if cat == 'foot': return o['shoes'], True
    return None, False


def weave(size, seed):
    rng = np.random.default_rng(seed)
    n = rng.normal(0, 1, (size // 4, size // 4))
    img = Image.fromarray(((n - n.min()) / (n.max() - n.min()) * 255).astype(np.uint8)).resize((size, size), Image.BICUBIC)
    a = np.asarray(img, dtype=np.float32) / 255.0
    lines = (np.sin(np.arange(size) * 1.7)[None, :] * 0.5 + 0.5) * 0.06
    return 0.9 + a * 0.14 + lines


def build(base):
    os.makedirs(OUT, exist_ok=True)
    tdir = os.path.join(base, 'Base Characters', 'Textures')
    bodies = {}
    for body in ('m', 'f'):
        pos, uv, joints, weights, idx, names = load_body(base, body)
        height = pos[:, 1].max()
        tri_cat, centroid = classify(pos, joints, weights, idx, names, height)
        bodies[body] = (pos, uv, idx, tri_cat, centroid, height)
        print(f'body {body}: {len(pos)} verts, {len(idx)} tris, h={height:.2f}', {c: int((tri_cat == c).sum()) for c in set(tri_cat)})
    for oid, (body, skin, o) in OUTFITS.items():
        pos, uv, idx, tri_cat, centroid, height = bodies[body]
        base_img = Image.open(os.path.join(tdir, TEX[(body, skin)])).convert('RGB').resize((SIZE, SIZE), Image.LANCZOS)
        nor_img = Image.open(os.path.join(tdir, NOR[body])).convert('RGB').resize((SIZE, SIZE), Image.LANCZOS)
        paint = Image.new('RGB', (SIZE, SIZE), (0, 0, 0))
        mask = Image.new('L', (SIZE, SIZE), 0)
        dp, dm = ImageDraw.Draw(paint), ImageDraw.Draw(mask)
        for t in range(len(idx)):
            col, cloth = region_color(tri_cat[t], centroid[t], o, height, 1)
            if not cloth: continue
            pts = [(uv[v, 0] * SIZE, uv[v, 1] * SIZE) for v in idx[t]]
            dp.polygon(pts, fill=col, outline=col)
            dm.polygon(pts, fill=255, outline=255)
        # dilate to cover UV seams
        mask_d = mask.filter(ImageFilter.MaxFilter(5))
        paint_d = paint.filter(ImageFilter.MaxFilter(5))
        m = np.asarray(mask_d, dtype=np.float32)[..., None] / 255.0
        src = np.asarray(base_img, dtype=np.float32)
        cloth = np.asarray(paint_d, dtype=np.float32)
        # keep a hint of the original shading (AO) under the cloth
        lum = (src.mean(axis=2, keepdims=True) / max(1.0, src.mean())) ** 0.35
        w = weave(SIZE, hash(oid) & 0xffff)[..., None]
        cloth = np.clip(cloth * w * (0.82 + 0.18 * lum), 0, 255)
        out = src * (1 - m) + cloth * m
        Image.fromarray(out.astype(np.uint8)).resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, f'{oid}_diff.webp'), 'WEBP', quality=86)
        # flatten normals on cloth (keep 25% of the muscle detail + fabric weave)
        nsrc = np.asarray(nor_img, dtype=np.float32)
        flat = np.array([128, 128, 255], dtype=np.float32)
        nw = (w - 1.0) * 120
        nflat = np.clip(flat + np.concatenate([nw, nw * 0.6, np.zeros_like(nw)], axis=2), 0, 255)
        nout = nsrc * (1 - m * 0.75) + nflat * (m * 0.75)
        Image.fromarray(nout.astype(np.uint8)).resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, f'{oid}_nor.webp'), 'WEBP', quality=88)
        print('outfit', oid)


if __name__ == '__main__':
    build(sys.argv[1])
