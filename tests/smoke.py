"""End-to-end smoke test of the first case, driving the real input + UI paths.

Runs headless Chrome (software WebGL) against a served build:
  python3 tests/smoke.py [url]
Exits non-zero on the first failed check. Screenshots go to tests/out/.
"""
import sys, time, os, json
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:4173/?quality=low&norender=1'
OUT = 'tests/out'
os.makedirs(OUT, exist_ok=True)
results = []


def check(name, cond, detail=''):
    results.append((name, bool(cond), detail))
    print(('PASS ' if cond else 'FAIL ') + name + (f'  [{detail}]' if detail else ''))
    if not cond:
        raise SystemExit(1)


def g(page, expr):
    return page.evaluate(f'() => {{ const g = window.__game; return {expr}; }}')


def place(page, x, z, yaw=0):
    page.evaluate(f'() => {{ const g = window.__game; g.player.place({x}, {z}, {yaw}); g.cam.snapTo(g.player.pos); }}')
    wait_frames(page, 2)


def interact(page):
    page.evaluate('() => window.__game.input.press("interact")')
    wait_frames(page, 2)


def choose(page, text):
    btns = page.locator('.dialogue.show .choice', has_text=text)
    check(f'dialogue choice "{text}" present', btns.count() > 0, (page.locator('.dialogue .who').inner_text() + ': ' + page.locator('.dialogue .line').inner_text() + ' || ' + page.locator('.dialogue .choices').inner_text()) if btns.count() == 0 else '')
    btns.first.evaluate('b => b.click()')
    time.sleep(0.4)


def examine_go(page):
    btn = page.locator('.examine.show button.go')
    check('examine action available', btn.count() == 1)
    btn.evaluate('b => b.click()')
    time.sleep(0.4)


def prompt(page):
    return g(page, 'document.querySelector(".btn.primary span").textContent + "|" + document.querySelector(".prompt").textContent')


def hold_key(page, key, game_secs, until=None, timeout=90):
    """Hold a key for a given amount of *game* time (software GL renders slowly)."""
    page.evaluate('() => { window.__gt0 = window.__game.time; }')
    page.keyboard.down(key)
    t0 = time.time()
    while time.time() - t0 < timeout:
        if page.evaluate('() => window.__game.time - window.__gt0') >= game_secs: break
        if until and page.evaluate(f'() => {{ const g = window.__game; return {until}; }}'): break
        time.sleep(0.2)
    page.keyboard.up(key)
    wait_frames(page, 2)


def wait_frames(page, n=2):
    page.evaluate(f'() => new Promise(r => {{ let k = 0; const f = () => {{ if (++k >= {n}) {{ window.__game.app.off("update", f); r(); }} }}; window.__game.app.on("update", f); }})')


with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    ctx = b.new_context(viewport={'width': 480, 'height': 270})
    page = ctx.new_page()
    page.set_default_timeout(120000)
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: m.type == 'error' and errors.append(m.text))
    page.goto(URL)
    page.wait_for_selector('.loading.ready', timeout=240000)
    page.evaluate("document.querySelector('.start').click()")
    page.wait_for_function("document.querySelector('.loading').classList.contains('done')")
    time.sleep(2)
    check('game started', g(page, 'g.started'))
    check('no missing assets', g(page, 'g.assets.failedKeys.length') == 0, str(g(page, 'g.assets.failedKeys')))
    A = g(page, 'Object.fromEntries(Object.entries(g.refs.anchors).map(([k,v]) => [k,[v.x,v.y,v.z]]))')

    # --- movement + collision ---
    x0 = g(page, 'g.player.x'); z0 = g(page, 'g.player.z')
    page.evaluate('() => { const g = window.__game; g.cam.yaw = 0; }')  # camera looks north (-Z)
    hold_key(page, 'KeyW', 1.2)
    z1 = g(page, 'g.player.z')
    check('W moves player forward (north)', z1 < z0 - 1.0, f'{z0:.2f} -> {z1:.2f}')
    # walk into the café's front wall (between window and door) and make sure we stop at it
    place(page, 15.9, -6.5)
    page.evaluate('() => { window.__game.cam.yaw = 0; }')
    hold_key(page, 'KeyW', 2.5)
    zc = g(page, 'g.player.z')
    check('wall collision stops player at café facade', zc > -9.0 and zc < -8.2, f'z={zc:.2f}')
    # walk through the café door
    place(page, 18, -6.5)
    page.evaluate('() => { window.__game.cam.yaw = 0; }')
    hold_key(page, 'KeyW', 3.0)
    zd = g(page, 'g.player.z')
    check('sliding door lets player into café', zd < -10.5, f'z={zd:.2f}')
    page.screenshot(path=f'{OUT}/smoke_cafe_entered.png')

    # --- briefing ---
    place(page, A['booking'][0], A['booking'][2], 0)
    check('prompt offers talking to Okafor', 'Okafor' in prompt(page) or 'Talk' in prompt(page), prompt(page))
    interact(page)
    check('dialogue opened', g(page, 'g.hud.modalOpen'))
    page.screenshot(path=f'{OUT}/smoke_dialogue.png')
    choose(page, 'What happened?')
    choose(page, 'On it.')
    check('briefed flag set', g(page, 'g.state.flag("briefed")'))

    # --- victim interview ---
    place(page, A['cafeCounter'][0], A['cafeCounter'][2])
    interact(page)
    choose(page, 'Tell me what happened.')
    choose(page, 'Anyone suspicious')
    choose(page, 'Anything else?')
    choose(page, 'find who did this')
    check("Rosa's statement recorded", g(page, 'g.state.has("statementRosa")'))

    # --- crime scene ---
    for ev in ['slip', 'cigpack', 'lighter']:
        place(page, A[ev][0] + 0.6, A[ev][2] + 0.6)
        check(f'examine prompt at {ev}', 'Examine' in prompt(page), prompt(page))
        interact(page)
        if ev == 'lighter':
            page.screenshot(path=f'{OUT}/smoke_examine.png')
        examine_go(page)
        check(f'{ev} collected', g(page, f'g.state.has("{ev}")'))
        check(f'{ev} removed from world', not g(page, f'g.refs.evidenceEntities["{ev}"].enabled'))

    # --- bank ---
    place(page, A['footage'][0], A['footage'][2] + 0.6)
    interact(page)
    check('footage locked before permission', page.locator('.examine.show button.go').count() == 0)
    page.locator('.examine.show button.back').evaluate('b => b.click()')
    place(page, A['bankCounter'][0], A['bankCounter'][2])
    interact(page)
    choose(page, 'Did you see anything?')
    choose(page, 'alley camera footage')
    choose(page, 'Thanks.')
    place(page, A['footage'][0], A['footage'][2] + 0.6)
    interact(page)
    examine_go(page)
    check('footage collected', g(page, 'g.state.has("footage")'))

    # --- question Victor (innocent) ---
    vx, vz = g(page, '[g.npc("victor").x, g.npc("victor").z]')
    place(page, vx + 0.9, vz)
    interact(page)
    choose(page, 'Were you in the alley')
    choose(page, 'Leave')
    check("Victor's statement", g(page, 'g.state.has("statementVictor")'))

    # --- question Dale and get confession ---
    dx, dz = g(page, '[g.npc("dale").x, g.npc("dale").z]')
    place(page, dx + 0.9, dz)
    interact(page)
    choose(page, 'Show: Engraved lighter')
    choose(page, 'Show: Bank alley footage')
    check('Dale confessed', g(page, 'g.state.flag("daleConfessed")'))
    page.screenshot(path=f'{OUT}/smoke_confession.png')
    choose(page, 'Arrest Dale')
    wait_frames(page, 2)
    examine_go(page)  # confirm "Handcuff"
    hold_key(page, 'Shift', 3, until='g.prisoner && !g.arrests.busy')  # the cuffing action plays (~1.2 s)
    check('Dale cuffed', g(page, 'g.prisoner && g.prisoner.id') == 'dale')
    check('Dale in cuffed state', g(page, 'g.npc("dale").state') == 'cuffed')

    # prisoner follows on foot
    place(page, dx + 6, dz + 2)
    hold_key(page, 'Shift', 4.0)
    dist = g(page, 'Math.hypot(g.npc("dale").x - g.player.x, g.npc("dale").z - g.player.z)')
    check('cuffed suspect follows the detective', dist < 3.5, f'{dist:.2f} m')
    page.screenshot(path=f'{OUT}/smoke_cuffed.png')

    # --- driving with the suspect ---
    cx, cz = g(page, '[g.car.x, g.car.z]')
    page.evaluate(f'() => {{ const g = window.__game; g.npc("dale").teleport({cx - 2.5}, {cz}); }}')
    place(page, cx - 1.9, cz)
    page.evaluate('() => window.__game.input.press("vehicle")')
    wait_frames(page, 2)
    check('entered police car', g(page, 'g.driving'))
    check('suspect rides in the car', g(page, 'g.npc("dale").state') == 'inCar')
    page.evaluate('() => window.__game.input.press("siren")')
    wait_frames(page, 2)
    hold_key(page, 'KeyW', 2.0)
    moved = g(page, f'Math.hypot(g.car.x - {cx}, g.car.z - {cz})')
    check('car drives forward', moved > 3, f'{moved:.1f} m')
    check('siren toggled on', g(page, 'g.car.sirenOn'))
    page.screenshot(path=f'{OUT}/smoke_driving.png')
    hold_key(page, 'Space', 2.0)
    page.evaluate('() => window.__game.input.press("vehicle")')
    wait_frames(page, 2)
    check('exited police car', not g(page, 'g.driving'))
    check('suspect back on foot and cuffed', g(page, 'g.npc("dale").state') == 'cuffed')

    # --- booking ---
    place(page, A['booking'][0], A['booking'][2])
    page.evaluate(f'() => window.__game.npc("dale").teleport({A["booking"][0] + 1.2}, {A["booking"][2] - 0.5})')
    wait_frames(page, 2)
    check('booking prompt', 'Book' in prompt(page), prompt(page))
    interact(page)
    wait_frames(page, 2)
    page.screenshot(path=f'{OUT}/smoke_report.png')
    check('booking report shown', page.locator('.report.show').count() == 1)
    stamp = page.locator('.report .stamp').inner_text()
    check('Dale charged', stamp == 'CHARGED', stamp)
    page.locator('.report .chip').evaluate('b => b.click()')
    check('Dale jailed', g(page, 'g.npc("dale").state') == 'jailed')
    check('case closed', g(page, 'g.state.flag("caseClosed")'))

    # --- recover and return the money ---
    place(page, A['parkTrash'][0] + 0.8, A['parkTrash'][2] + 0.8)
    interact(page)
    examine_go(page)
    check('bag recovered', g(page, 'g.state.has("bag")'))
    place(page, A['cafeCounter'][0], A['cafeCounter'][2])
    interact(page)
    choose(page, 'Return the bag')
    check('bag returned to Rosa', g(page, 'g.state.flag("bagReturned")'))
    choose(page, 'Leave')
    check('reputation increased', g(page, 'g.state.reputation') >= 5, str(g(page, 'g.state.reputation')))

    # --- wrongful arrest consequence ---
    vx, vz = g(page, '[g.npc("victor").x, g.npc("victor").z]')
    place(page, vx + 0.9, vz)
    interact(page)
    choose(page, 'Arrest Victor')
    wait_frames(page, 2)
    examine_go(page)
    hold_key(page, 'Shift', 3, until='g.prisoner && !g.arrests.busy')  # the cuffing action plays
    check('Victor cuffed', g(page, 'g.prisoner && g.prisoner.id') == 'victor')
    place(page, A['booking'][0], A['booking'][2])
    page.evaluate(f'() => window.__game.npc("victor").teleport({A["booking"][0] + 1.2}, {A["booking"][2] - 0.5})')
    wait_frames(page, 2)
    interact(page)
    wait_frames(page, 2)
    stamp = page.locator('.report .stamp').inner_text()
    check('wrongful arrest detected', stamp == 'WRONGFUL ARREST', stamp)
    page.locator('.report .chip').evaluate('b => b.click()')
    check('Victor now refuses to talk', g(page, 'g.state.hostile.has("victor")'))

    # --- notebook + settings UI ---
    page.evaluate('() => window.__game.input.press("notebook")')
    wait_frames(page, 2)
    check('notebook opens', page.locator('.notebook.show').count() == 1)
    page.screenshot(path=f'{OUT}/smoke_notebook.png')
    page.evaluate('() => window.__game.input.press("notebook")')
    wait_frames(page, 2)
    page.evaluate('() => window.__game.input.press("menu")')
    wait_frames(page, 2)
    check('settings menu opens', page.locator('.menu.show').count() == 1)
    page.evaluate('() => window.__game.input.press("menu")')

    check('no page errors', not errors, ' | '.join(errors[:3]))
    print(json.dumps({'passed': sum(1 for r in results if r[1]), 'total': len(results)}))
    b.close()
