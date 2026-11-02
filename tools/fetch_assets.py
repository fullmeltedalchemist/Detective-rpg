#!/usr/bin/env python3
"""Fetch CC0 assets from Poly Haven and produce web-ready versions.

Textures -> public/assets/tex/{512,1k}/<name>_{diff,nor,arm}.webp
HDRI     -> public/assets/env/<name>.hdr (1k) and sky jpg
Models   -> raw glTF in tools/.cache/models/<name>/ (packed to GLB by pack_models.mjs)

All Poly Haven assets are CC0 (https://polyhaven.com/license).
"""
import io, json, os, sys, urllib.request
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "tools", ".cache")
PUB = os.path.join(ROOT, "public", "assets")

TEXTURES = {
    # name: maps to fetch
    "asphalt_02": ["diff", "nor_gl", "arm"],
    "concrete_pavement": ["diff", "nor_gl", "arm"],
    "brick_wall_10": ["diff", "nor_gl", "arm"],
    "brick_wall_02": ["diff", "nor_gl", "arm"],
    "beige_wall_001": ["diff", "nor_gl", "arm"],
    "white_stucco": ["diff", "nor_gl", "arm"],
    "concrete_tile_facade": ["diff", "nor_gl", "arm"],
    "wood_floor": ["diff", "nor_gl", "arm"],
    "marble_tiles": ["diff", "nor_gl", "arm"],
    "grey_tiles": ["diff", "nor_gl", "arm"],
    "painted_plaster_wall": ["diff", "nor_gl", "arm"],
    "leafy_grass": ["diff", "nor_gl", "arm"],
    "concrete_floor_02": ["diff", "nor_gl", "arm"],
}

HDRI = "qwantani_late_afternoon_puresky"

MODELS = [
    "street_lamp_02", "modular_street_seating", "metal_trash_can", "utility_box_01",
    "planter_box_01", "potted_plant_04", "round_wooden_table_02", "bar_chair_round_01",
    "CashRegister_01", "metal_office_desk", "steel_frame_shelves_01", "security_camera_01",
    "cardboard_box_01", "trashbag", "WetFloorSign_01", "cigarette_pack", "vintage_lighter",
    "clipboard", "SchoolChair_01", "Television_01", "office_notepads", "water_manhole_cover",
    "croissant", "Sofa_01", "exterior_aircon_unit", "wooden_crate_01", "standing_chalkboard_01",
    "hanging_picture_frame_01", "wall_clock", "plastic_monobloc_chair_01", "shrub_03",
    # Phase A weapons
    "service_pistol", "bolt_action_rifle_7_62", "wooden_military_crate", "concrete_road_barrier_02", "metal_jerrycan", "old_tyre", "plastic_crate_01",
]


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "detective-rpg-asset-fetch"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def api(path):
    return json.loads(get("https://api.polyhaven.com" + path))


def fetch_textures():
    for name, maps in TEXTURES.items():
        files = api(f"/files/{name}")
        for m in maps:
            key = {"diff": "Diffuse", "nor_gl": "nor_gl", "arm": "arm"}[m]
            entry = files.get(key) or files.get(m)
            if not entry:
                print("  missing map", name, m); continue
            url = entry["1k"]["jpg"]["url"]
            short = "nor" if m == "nor_gl" else m
            out1k = os.path.join(PUB, "tex", "1k", f"{name}_{short}.webp")
            out512 = os.path.join(PUB, "tex", "512", f"{name}_{short}.webp")
            if os.path.exists(out1k) and os.path.exists(out512):
                continue
            img = Image.open(io.BytesIO(get(url))).convert("RGB")
            os.makedirs(os.path.dirname(out1k), exist_ok=True)
            os.makedirs(os.path.dirname(out512), exist_ok=True)
            img.save(out1k, "WEBP", quality=82)
            img.resize((512, 512), Image.LANCZOS).save(out512, "WEBP", quality=82)
            print("  tex", name, short)


def fetch_hdri():
    files = api(f"/files/{HDRI}")
    out = os.path.join(PUB, "env", f"{HDRI}.hdr")
    if not os.path.exists(out):
        os.makedirs(os.path.dirname(out), exist_ok=True)
        with open(out, "wb") as f:
            f.write(get(files["hdri"]["1k"]["hdr"]["url"]))
        print("  hdri", HDRI)


def fetch_models():
    for name in MODELS:
        d = os.path.join(CACHE, "models", name)
        if os.path.exists(os.path.join(d, "done")):
            continue
        files = api(f"/files/{name}")
        g = files["gltf"]["1k"]["gltf"]
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, os.path.basename(g["url"])), "wb") as f:
            f.write(get(g["url"]))
        for rel, inc in g.get("include", {}).items():
            p = os.path.join(d, rel)
            os.makedirs(os.path.dirname(p), exist_ok=True)
            with open(p, "wb") as f:
                f.write(get(inc["url"]))
        open(os.path.join(d, "done"), "w").close()
        print("  model", name)


if __name__ == "__main__":
    what = sys.argv[1:] or ["tex", "hdri", "models"]
    if "tex" in what: fetch_textures()
    if "hdri" in what: fetch_hdri()
    if "models" in what: fetch_models()
    print("done")
