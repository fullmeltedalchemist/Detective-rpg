"""Capture review screenshots of a build from scripted camera positions.

  python3 tests/capture_preview.py URL OUTDIR [--only name,name] [--env-only]

Waits for the software renderer's shader warm-up (counts real update events instead of
sleeping), places the camera for each named view, and saves PNGs plus a JSON summary.
--env-only captures only views that exist in every build (used for before/after comparisons).
Headless Chrome uses SwiftShader (CPU rendering): FPS numbers recorded here are NOT phone numbers.
"""
import sys, os, json, time
from playwright.sync_api import sync_playwright

URL, OUT = sys.argv[1], sys.argv[2]
ONLY = None
if '--only' in sys.argv:
    ONLY = set(sys.argv[sys.argv.index('--only') + 1].split(','))
ENV_ONLY = '--env-only' in sys.argv
os.makedirs(OUT, exist_ok=True)

P = 'const g = window.__game;'
# name, title, setup JS, wait-frames, env (exists in v0.1 too)
VIEWS = [
    ('street_main', 'Main St looking east from the crossing', f'{P} g.player.place(4, -2, 250); g.cam.yaw = 250; g.cam.pitch = -8; g.cam.distance = g.cam.targetDistance = 6; g.cam.snapTo(g.player.pos);', 40, True),
    ('street_cafe', 'Café Luna and First Civic Bank storefronts', f'{P} g.player.place(19, -2, 0); g.cam.yaw = 345; g.cam.pitch = -2; g.cam.distance = g.cam.targetDistance = 7; g.cam.snapTo(g.player.pos);', 40, True),
    ('street_station', 'Precinct 9 police station', f'{P} g.player.place(24, 2.5, 180); g.cam.yaw = 172; g.cam.pitch = -4; g.cam.distance = g.cam.targetDistance = 7.5; g.cam.snapTo(g.player.pos);', 40, True),
    ('park', 'Pocket park, trees and hedges', f'{P} g.player.place(-24, -9.5, 180); g.cam.yaw = 205; g.cam.pitch = -10; g.cam.distance = g.cam.targetDistance = 6; g.cam.snapTo(g.player.pos);', 40, True),
    ('alley', 'Crime-scene alley beside the bank', f'{P} g.player.place(27.5, -12, 0); g.cam.yaw = 0; g.cam.pitch = -14; g.cam.distance = g.cam.targetDistance = 4; g.cam.snapTo(g.player.pos);', 40, True),
    ('interior_cafe', 'Interior: Café Luna', f'{P} g.player.place(18, -12.5, 0); g.cam.yaw = 0; g.cam.pitch = -10; g.cam.distance = g.cam.targetDistance = 3.5; g.cam.snapTo(g.player.pos);', 40, True),
    ('interior_bank', 'Interior: First Civic Bank', f'{P} g.player.place(39, -12, 0); g.cam.yaw = 0; g.cam.pitch = -8; g.cam.distance = g.cam.targetDistance = 4; g.cam.snapTo(g.player.pos);', 40, True),
    ('interior_station', 'Interior: Precinct 9 lobby', f'{P} g.player.place(24, 11, 180); g.cam.yaw = 180; g.cam.pitch = -10; g.cam.distance = g.cam.targetDistance = 4; g.cam.snapTo(g.player.pos);', 40, True),
    ('characters', 'Characters: detective, sergeant, café owner, teller, suspects',
     f'''{P} g.player.place(15.6, 1.2, 180); const ids = ['okafor','rosa','nina','dale','victor','thug2'];
       ids.forEach((id, i) => {{ const n = g.npc(id); n.def.stationary = true; n.def.home = [16.6 + i * 0.95, 1.2, 180]; n.teleport(16.6 + i * 0.95, 1.2, 180); n.setState('idle'); }});
       g.cam.yaw = 0; g.cam.pitch = -3; g.cam.distance = g.cam.targetDistance = 5.2; g.cam.height = 1.1; g.cam.snapTo(new g.player.pos.constructor(18.6, 0.15, 1.2));''', 60, False),
    ('character_closeup', 'Close-up: the detective (Rocketbox avatar, UAL animation)',
     f'{P} g.player.place(16, 1, 180); g.cam.yaw = 0; g.cam.pitch = -2; g.cam.distance = g.cam.targetDistance = 2.0; g.cam.height = 1.45; g.cam.snapTo(g.player.pos);', 50, False),
    ('combat_aim', 'Combat: aiming down sights with the service pistol',
     f"{P} g.cam.height = 1.55; g.player.place(14, 2, 0); g.cam.yaw = 200; g.cam.pitch = -4; g.combat.player.equip('pistol'); g.input.aimHeld = true; g.cam.snapTo(g.player.pos);", 50, False),
    ('combat_lot', 'Combat: armed suspects in the back lot (Oak Ave)',
     f"{P} g.input.aimHeld = false; g.combat.player.equip('pistol'); g.player.place(-11, 27.5, -90); g.cam.yaw = 90; g.cam.pitch = -6; g.cam.distance = g.cam.targetDistance = 3; g.cam.snapTo(g.player.pos);", 50, False),
    ('driving', 'Driving the police cruiser with siren',
     f"{P} g.input.aimHeld = false; g.combat.player.equip('fists'); const c = g.car; g.player.place(c.x - 1.9, c.z, 0); g.input.press('vehicle');", 10, True),
    ('driving2', 'Cruiser on Main St',
     f"{P} if (g.driving) {{ g.car.place(-2.5, -3, 270); g.car.sirenOn = true; g.cam.yaw = 90; g.cam.pitch = -12; g.cam.snapTo(g.car.entity.getPosition()); }}", 60, False),
]

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    page = b.new_page(viewport={'width': 960, 'height': 540})
    page.set_default_timeout(300000)
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)[:300]))
    page.on('console', lambda m: m.type == 'error' and errors.append(m.text[:300]))
    t0 = time.time()
    page.goto(URL)
    page.wait_for_selector('.loading.ready', timeout=300000)
    load_s = time.time() - t0
    page.evaluate("document.querySelector('.start').click()")
    page.wait_for_function('window.__game && window.__game.started', timeout=120000)
    page.evaluate("() => { window.__n = 0; window.__game.app.on('update', () => window.__n++); }")
    page.wait_for_function('window.__n > 20', polling=1000)
    summary = {'url': URL, 'load_seconds': round(load_s, 1), 'views': [], 'errors': errors}
    for name, title, js, frames, env in VIEWS:
        if ONLY and name not in ONLY: continue
        if ENV_ONLY and not env: continue
        try:
            page.evaluate(f'() => {{ {js} }}')
        except Exception as e:
            summary['views'].append({'name': name, 'title': title, 'error': str(e)[:200]}); continue
        page.evaluate('() => { window.__n = 0; }')
        page.wait_for_function(f'window.__n > {frames}', polling=1000)
        if name == 'driving':
            continue  # setup step only
        page.screenshot(path=f'{OUT}/{name}.png', timeout=300000)
        diag = page.evaluate("() => (document.querySelector('.diag') || {}).textContent || ''")
        summary['views'].append({'name': name, 'title': title, 'file': f'{name}.png', 'overlay': diag})
        print('captured', name, flush=True)
    summary['health'] = page.evaluate("() => fetch('health.json').then(r => r.ok ? r.json() : null).catch(() => null)")
    json.dump(summary, open(f'{OUT}/capture.json', 'w'), indent=1)
    b.close()
