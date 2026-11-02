"""Scripted combat screenshots (pistol aim, encounter, punch)."""
import sys, time, os
from playwright.sync_api import sync_playwright
URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:4173/?quality=low'
os.makedirs('tests/out', exist_ok=True)
def frames(page, n=3):
    page.evaluate(f'() => new Promise(r => {{ let k = 0; const f = () => {{ if (++k >= {n}) {{ window.__game.app.off("update", f); r(); }} }}; window.__game.app.on("update", f); }})')
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    page = b.new_page(viewport={'width': 960, 'height': 540})
    logs = []
    page.on('console', lambda m: m.type in ('error','warning') and logs.append(m.text))
    page.on('pageerror', lambda e: logs.append('PAGEERROR ' + str(e)))
    page.goto(URL); page.wait_for_selector('.loading.ready', timeout=240000)
    page.evaluate("document.querySelector('.start').click()"); time.sleep(2)
    # 1: pistol drawn, aiming, in the street
    page.evaluate("""() => { const g = window.__game; g.player.place(14, 2, 0); g.cam.yaw = 200; g.cam.pitch = -6; g.combat.player.equip('pistol'); g.input.aimHeld = true; g.cam.snapTo(g.player.pos); }""")
    frames(page, 12); page.screenshot(path='tests/out/cb_aim.png')
    page.evaluate("() => { window.__game.input.aimHeld = false; }")
    frames(page, 8); page.screenshot(path='tests/out/cb_armed.png')
    # 2: encounter from the Oak Ave side
    page.evaluate("""() => { const g = window.__game; g.player.place(-8, 27, -90); g.cam.yaw = 90; g.cam.pitch = -10; g.cam.snapTo(g.player.pos); }""")
    frames(page, 10); page.screenshot(path='tests/out/cb_lot.png')
    # 3: punch
    page.evaluate("""() => { const g = window.__game; g.combat.player.equip('fists'); g.player.place(20, 6.5, 0); g.cam.yaw = 230; g.cam.pitch = -10; g.cam.snapTo(g.player.pos); g.input.touchFireHeld = true; }""")
    frames(page, 3); page.evaluate("() => { window.__game.input.touchFireHeld = false; }"); frames(page, 4)
    page.screenshot(path='tests/out/cb_punch.png')
    print('\n'.join(logs[:10]))
    b.close()
