"""Visual check: load the built game in headless Chrome (software GL) and take screenshots
from scripted camera positions.
Usage: python3 tests/shot.py URL OUTPREFIX [--mobile] [--views]
"""
import sys, time, os, json
from playwright.sync_api import sync_playwright

url = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:4173/'
out = sys.argv[2] if len(sys.argv) > 2 else 'tests/out/shot'
os.makedirs(os.path.dirname(out), exist_ok=True)
mobile = '--mobile' in sys.argv

VIEWS = [
    # name, player x, z, cam yaw, pitch, dist
    ('start', None, None, None, None, None),
    ('street_east', 4, -2, 250, -10, 6),
    ('mobile_cafe', 16, -3, 335, -9, 4.5),
    ('cafe_front', 18, -4, 180 + 180, -8, 5),
    ('cafe_inside', 18, -13, 180 + 180, -12, 3.5),
    ('alley', 27.5, -12, 0 + 180 + 180, -18, 4),
    ('bank_inside', 39, -12, 360, -10, 4),
    ('station_inside', 24, 11, 180, -12, 4),
    ('park', -20, -6, 200, -12, 6),
]

def log_errors(logs):
    for line in logs:
        l = line.lower()
        if 'error' in l or 'warn' in l or 'fail' in l:
            print('  ', line[:400])

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    if mobile:
        ctx = b.new_context(viewport={'width': 852, 'height': 393}, device_scale_factor=1, is_mobile=True, has_touch=True,
                            user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1')
    else:
        ctx = b.new_context(viewport={'width': 960, 'height': 540}, device_scale_factor=1)
    page = ctx.new_page()
    page.set_default_timeout(120000)
    logs = []
    page.on('console', lambda m: logs.append(f'{m.type}: {m.text}'))
    page.on('pageerror', lambda e: logs.append(f'PAGEERROR: {e}'))
    t0 = time.time()
    page.goto(url)
    try:
        page.wait_for_selector('.loading.ready', timeout=240000)
    except Exception as e:
        log_errors(logs); raise
    print(f'loaded in {time.time()-t0:.1f}s')
    page.evaluate("document.querySelector('.start').click()")
    page.wait_for_function("document.querySelector('.loading').classList.contains('done')")
    time.sleep(3)
    views = VIEWS if '--views' in sys.argv else VIEWS[:1]
    for name, x, z, yaw, pitch, dist in views:
        if x is not None:
            page.evaluate(f'''() => {{ const g = window.__game; g.player.place({x}, {z}, 0); g.cam.yaw = {yaw}; g.cam.pitch = {pitch};
              g.cam.distance = g.cam.targetDistance = {dist}; g.cam.snapTo(g.player.pos); }}''')
            time.sleep(1.5)
        page.screenshot(path=f'{out}_{name}.png', timeout=180000)
        print('shot', name)
    info = page.evaluate('() => ({ fps: window.__game.debug.fps, diag: document.querySelector(".diag").textContent })')
    print(json.dumps(info))
    log_errors(logs)
    b.close()
