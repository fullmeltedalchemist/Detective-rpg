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
    # ---- hit-reaction sequence (camera framed on the victim, player hidden) ----
    if not ENV_ONLY and (not ONLY or 'hits' in ONLY):
        def wait_game(sec):
            page.evaluate('() => { window.__t0 = window.__game.time; }')
            page.wait_for_function(f'window.__game.time - window.__t0 >= {sec}', polling=500)
        def shot(name, title):
            page.screenshot(path=f'{OUT}/{name}.png', timeout=300000)
            summary['views'].append({'name': name, 'title': title, 'file': f'{name}.png'})
            print('captured', name, flush=True)
        def fire(npc, dmg):
            page.evaluate(f'''() => {{ const g = window.__game, n = g.npc("{npc}"), b = n.character.bonePos("spine_03");
              const o = new b.constructor(n.x, b.y, n.z - 8); const d = b.clone().sub(o).normalize();
              g.combat.ballistics.fire(o, d, 400, "player", {dmg}, 2, 0.7, 60, "pistol"); }}''')
        page.evaluate(f'''() => {{ {P} if (g.driving) g.input.press('vehicle'); }}''')
        wait_game(0.3)
        page.evaluate(f'''() => {{ {P} g.player.place(16, -12, 0); g.player.character.visible = false;
          const n = g.npc('civ6'); n.def.stationary = true; n.hp = 10000; n.def.home = [14, 2.5, 180]; n.teleport(14, 2.5, 180); n.setState('idle');
          g.debugFocus = new n.pos.constructor(14, 0.15, 2.5); g.cam.yaw = 330; g.cam.pitch = -6; g.cam.distance = g.cam.targetDistance = 4.2; g.cam.height = 1.2; g.cam.snapTo(g.debugFocus); }}''')
        wait_game(1.0)
        fire('civ6', 30); wait_game(0.12); shot('hit_flinch', 'Hit reaction: flinch away from the shot (spring, never restarts)')
        fire('civ6', 30); wait_game(0.25); fire('civ6', 30); wait_game(0.25)
        shot('hit_repeated', 'Repeated hits: ducks once and stays down (no squat cycling)')
        page.evaluate(f'''() => {{ {P} const n = g.npc('civ6'); n.hp = 40; }}''')
        fire('civ6', 30); wait_game(0.05); fire('civ6', 30); wait_game(0.35); shot('death_fall_1', 'Fatal hit: one fall, cross-faded from the current pose')
        wait_game(0.5); shot('death_fall_2', 'Falling backwards, away from the shooter')
        wait_game(2.0); shot('death_fall_3', 'At rest: body held still on the ground')
        page.evaluate(f'''() => {{ {P} const n = g.npc('civ2'); n.def.stationary = true; n.def.home = [17.5, 2.5, 180]; n.teleport(17.5, 2.5, 180); n.setState('idle');
          g.debugFocus = new n.pos.constructor(17.5, 0.15, 2.5); g.cam.snapTo(g.debugFocus); }}''')
        wait_game(0.6)
        page.evaluate(f'''() => {{ {P} const n = g.npc('civ2'); n.knockOut(6, new n.pos.constructor(17.5, 0, -5)); }}''')
        wait_game(2.8); shot('knockout', 'Knocked out: stays down until recovery begins')
        wait_game(5.5); shot('knockout_recover', 'Recovered: gets up once, after the knock-out ends')
        page.evaluate(f'() => {{ {P} g.debugFocus = null; g.player.character.visible = true; }}')
    summary['health'] = page.evaluate("() => fetch('health.json').then(r => r.ok ? r.json() : null).catch(() => null)")
    json.dump(summary, open(f'{OUT}/capture.json', 'w'), indent=1)
    b.close()
