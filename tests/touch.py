"""Touch-control test in an emulated landscape phone: joystick drag moves the player,
right-side drag rotates the camera, the on-screen interact button opens a dialogue.
  python3 tests/touch.py [url]
"""
import sys, time, os
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:4173/?quality=low&norender=1'
os.makedirs('tests/out', exist_ok=True)


def check(name, cond, detail=''):
    print(('PASS ' if cond else 'FAIL ') + name + (f'  [{detail}]' if detail else ''))
    if not cond:
        raise SystemExit(1)


def game_time(page, secs, timeout=120):
    page.evaluate('() => { window.__gt0 = window.__game.time; }')
    t0 = time.time()
    while time.time() - t0 < timeout and page.evaluate('() => window.__game.time - window.__gt0') < secs:
        time.sleep(0.2)


with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    ctx = b.new_context(viewport={'width': 640, 'height': 296}, device_scale_factor=1, is_mobile=True, has_touch=True,
                        user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1')
    page = ctx.new_page()
    page.set_default_timeout(120000)
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(URL)
    page.wait_for_selector('.loading.ready', timeout=240000)
    page.tap('.start')
    page.wait_for_function("document.querySelector('.loading').classList.contains('done')")
    check('touch UI enabled', page.evaluate("document.body.classList.contains('touch')"))
    check('joystick visible', page.locator('.joy-zone').is_visible())
    check('interact button visible', page.locator('.btn.primary').is_visible())
    cdp = ctx.new_cdp_session(page)

    def touch(kind, pts):
        cdp.send('Input.dispatchTouchEvent', {'type': kind, 'touchPoints': [{'x': x, 'y': y, 'id': i} for i, (x, y) in pts]})

    # joystick: press in the lower-left zone and push up
    x0 = page.evaluate('window.__game.player.z')
    touch('touchStart', [(0, (100, 230))])
    for k in range(1, 6):
        touch('touchMove', [(0, (100, 230 - k * 12))])
    game_time(page, 1.2)
    touch('touchEnd', [])
    x1 = page.evaluate('window.__game.player.z')
    moved = abs(x1 - x0)
    check('joystick moves the detective', moved > 0.8, f'{moved:.2f} m')

    # camera drag on the right half
    yaw0 = page.evaluate('window.__game.cam.yaw')
    touch('touchStart', [(1, (450, 120))])
    for k in range(1, 8):
        touch('touchMove', [(1, (450 + k * 15, 120))])
    touch('touchEnd', [])
    game_time(page, 0.2)
    yaw1 = page.evaluate('window.__game.cam.yaw')
    check('right-side drag rotates camera', abs(yaw1 - yaw0) > 10, f'{yaw0:.0f} -> {yaw1:.0f}')

    # walk to the sergeant and tap the on-screen interact button
    page.evaluate('() => { const g = window.__game, a = g.refs.anchors.booking; g.player.place(a.x, a.z, 0); }')
    game_time(page, 0.3)
    check('interact button armed', 'disabled' not in page.get_attribute('.btn.primary', 'class'), page.inner_text('.btn.primary'))
    page.tap('.btn.primary')
    game_time(page, 0.3)
    check('dialogue opened by tapping interact', page.locator('.dialogue.show').count() == 1)
    page.screenshot(path='tests/out/touch_dialogue.png')
    page.locator('.dialogue.show .choice').first.tap()
    check('dialogue choice tappable', page.inner_text('.dialogue .line').startswith('Robbery'))
    check('no page errors', not errors, ' | '.join(errors[:3]))
    b.close()
