"""Save system: slots, autosave + Continue, load after reload, export/import, bad saves.
  python3 tests/save.py [url]
"""
import sys, time, os, json
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:4173/?quality=low&norender=1'
os.makedirs('tests/out', exist_ok=True)


def check(name, cond, detail=''):
    print(('PASS ' if cond else 'FAIL ') + name + (f'  [{detail}]' if detail != '' else ''), flush=True)
    if not cond:
        raise SystemExit(1)


def g(page, expr):
    return page.evaluate(f'() => {{ const g = window.__game, s = g.state, st = g.combat.standing; return {expr}; }}')


def run(page, js):
    page.evaluate(f'() => {{ const g = window.__game, s = g.state, st = g.street; {js} }}')


def game_time(page, secs, until=None, timeout=200):
    page.evaluate('() => { window.__gt0 = window.__game.time; }')
    t0 = time.time()
    while time.time() - t0 < timeout:
        if page.evaluate('() => window.__game.time - window.__gt0') >= secs: return True
        if until and page.evaluate(f'() => {{ const g = window.__game, s = g.state; return !!({until}); }}'): return True
        time.sleep(0.15)
    return False


def wait_ready(page):
    page.wait_for_selector('.loading.ready', timeout=240000)


def start(page, which='.start:not(.continue)'):
    page.locator(f'.loading {which}').first.evaluate('b => b.click()')
    page.wait_for_function("document.querySelector('.loading').classList.contains('done')")
    game_time(page, 0.5)


def choose(page, text):
    btns = page.locator('.dialogue.show .choice', has_text=text)
    check(f'dialogue choice "{text}"', btns.count() > 0, page.locator('.dialogue .choices').inner_text() if page.locator('.dialogue.show').count() else 'no dialogue')
    btns.first.evaluate('b => b.click()'); time.sleep(0.3)


def close_dialogue(page):
    for _ in range(4):
        if page.locator('.dialogue.show').count() == 0: return
        page.locator('.dialogue.show .choice').last.evaluate('b => b.click()'); time.sleep(0.3)


def open_menu(page):
    page.evaluate('() => window.__game.input.press("menu")'); game_time(page, 0.2)
    check('menu open', page.locator('.menu.show').count() == 1)


def slot_info(page, slot):
    return page.locator(f'.slot[data-slot="{slot}"] small').inner_text()


def toast(page):
    return page.locator('.toast').inner_text()


with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    ctx = b.new_context(viewport={'width': 640, 'height': 360}, accept_downloads=True)
    page = ctx.new_page()
    page.set_default_timeout(120000)
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(URL)
    wait_ready(page)
    check('fresh browser: no Continue button', page.locator('.loading .start.continue').count() == 0)
    start(page)

    # ---------- make real progress ----------
    run(page, 'g.talkTo(g.npc("okafor"));'); time.sleep(0.3)
    choose(page, 'What happened?'); close_dialogue(page)
    run(page, 'g.talkTo(g.npc("officer1"));'); time.sleep(0.3)
    choose(page, "I'll take it."); close_dialogue(page)
    run(page, 'st.nextDealAt = st.t + 999; st.forceStop = "comply"; g.collectEvidence("obsDeal"); g.player.place(60.6, -7.0, 270);')
    game_time(page, 0.3)
    run(page, 'g.talkTo(g.npc("dealer"));'); time.sleep(0.3)
    choose(page, 'Police. Hands where I can see them'); close_dialogue(page)
    game_time(page, 0.3)
    page.evaluate('() => window.__game.input.press("search")'); game_time(page, 2.6, until='!g.arrests.busy && s.flag("dealerSearched")')
    page.evaluate('() => window.__game.input.press("cuff")'); game_time(page, 2.6, until='g.prisoner && !g.arrests.busy')
    check('dealer in custody', g(page, 'g.prisoner && g.prisoner.id') == 'dealer')
    run(page, 'const A = g.refs.anchors; g.player.place(A.booking.x, A.booking.z - 0.6, 0); g.npc("dealer").teleport(A.booking.x + 1.0, A.booking.z - 1.2);')
    game_time(page, 0.3)
    page.evaluate('() => window.__game.input.press("interact")'); game_time(page, 0.3)
    check('dealer booked and jailed', g(page, 's.jailed.has("dealer") && s.flag("drugCaseClosed")'))
    page.evaluate("() => { const b = document.querySelector('.report.show button'); if (b) b.click(); }"); time.sleep(0.3)
    check('autosave written after the booking', page.evaluate('() => !!localStorage.getItem("casefiles.save.auto")'))
    # a death, money, a weapon, ammo and a position
    run(page, 'g.npc("thug1").damage(500, "bullet", "player", "torso", null); s.money = 1234; g.combat.player.giveWeapon("rifle"); g.combat.player.restoreAmmo({ pistol: { mag: 7, reserve: 21 } }); g.player.place(-5.5, 3.2, 90);')
    game_time(page, 0.5)
    snap = g(page, '({ flags: [...s.flags].sort(), ev: [...s.evidence].sort(), money: s.money, buy: s.buyMoney, trust: st.publicTrust, ia: st.iaHeat, mor: st.morality, prof: st.professional, incidents: st.incidents.length, owned: [...g.combat.player.owned].sort(), ammo: g.combat.player.ammoSnapshot().pistol, x: g.player.x, z: g.player.z })')

    # ---------- save to slot 2 through the menu ----------
    open_menu(page)
    check('menu lists autosave and three slots', page.locator('.slot').count() == 4)
    page.locator('.slot[data-slot="2"] button[data-a="save"]').evaluate('b => b.click()'); time.sleep(0.3)
    check('slot 2 saved (summary shown)', '9-201 closed' in slot_info(page, '2') and '$1234' in slot_info(page, '2'), slot_info(page, '2'))

    # ---------- load slot 2 (reload) ----------
    page.locator('.slot[data-slot="2"] button[data-a="load"]').evaluate('b => b.click()')
    page.wait_for_load_state('load'); wait_ready(page)
    check('after Load the start button resumes the shift', 'Resume' in page.locator('.loading .start').first.inner_text(), page.locator('.loading .start').first.inner_text())
    start(page, '.start')
    got = g(page, '({ flags: [...s.flags].sort(), ev: [...s.evidence].sort(), money: s.money, buy: s.buyMoney, trust: st.publicTrust, ia: st.iaHeat, mor: st.morality, prof: st.professional, incidents: st.incidents.length, owned: [...g.combat.player.owned].sort(), ammo: g.combat.player.ammoSnapshot().pistol, x: g.player.x, z: g.player.z })')
    for k in ['flags', 'ev', 'money', 'buy', 'trust', 'ia', 'mor', 'prof', 'incidents', 'owned', 'ammo']:
        check(f'restored: {k}', got[k] == snap[k], f'{snap[k]} -> {got[k]}')
    check('restored: player position', abs(got['x'] - snap['x']) < 0.6 and abs(got['z'] - snap['z']) < 0.6, f"{snap['x']:.1f},{snap['z']:.1f} -> {got['x']:.1f},{got['z']:.1f}")
    check('restored: the dealer is still in a cell', g(page, 'g.npc("dealer").state') == 'jailed')
    check('restored: the dead stay dead (body removed)', g(page, '!g.npc("thug1").alive && !g.npc("thug1").character.visible'))
    check('restored: arrests list', g(page, 's.arrests.length') >= 1)

    # ---------- Continue from the autosave ----------
    run(page, 's.money = 777; g.autosave();')
    page.reload(); wait_ready(page)
    check('Continue offered with a summary', page.locator('.loading .start.continue').count() == 1 and '$777' in page.locator('.loading .start.continue').inner_text(), page.locator('.loading').inner_text()[:200])
    start(page, '.start.continue')
    check('Continue restored the autosave', g(page, 's.money') == 777 and g(page, 's.flag("drugCaseClosed")'))

    # ---------- quality change keeps progress ----------
    open_menu(page)
    page.locator('.seg[data-k="q"] button[data-v="medium"]').evaluate('b => b.click()')
    page.wait_for_load_state('load'); wait_ready(page)
    start(page, '.start')
    check('quality change kept the progress', g(page, 's.money') == 777 and g(page, 's.jailed.has("dealer")'))
    page.evaluate('() => localStorage.setItem("casefiles.quality", "low")')

    # ---------- export / import ----------
    open_menu(page)
    with page.expect_download() as dl:
        page.locator('.slot[data-slot="2"] button[data-a="export"]').evaluate('b => b.click()')
    path = 'tests/out/save_export.json'
    dl.value.save_as(path)
    data = json.load(open(path))
    check('export is a versioned Case Files save', data.get('version') == 1 and data['state']['money'] == 1234)
    page.locator('.imp input').set_input_files(path); time.sleep(0.6)
    check('import into the first empty slot', 'Slot 1' in toast(page) and '$1234' in slot_info(page, '1'), toast(page))
    bad = 'tests/out/save_bad.json'
    open(bad, 'w').write('{"hello": 1}')
    page.locator('.imp input').set_input_files(bad); time.sleep(0.6)
    check('a file that is not a save is rejected', 'Import failed' in toast(page), toast(page))
    newer = dict(data); newer['version'] = 99
    newer_path = 'tests/out/save_newer.json'
    open(newer_path, 'w').write(json.dumps(newer))
    page.locator('.imp input').set_input_files(newer_path); time.sleep(0.6)
    check('a save from a newer game version is rejected', 'newer version' in toast(page), toast(page))
    page.evaluate('() => localStorage.setItem("casefiles.save.3", "{corrupt")')
    page.evaluate('() => window.__game.hud.closeMenu()'); open_menu(page)
    check('a corrupted slot shows as empty instead of crashing', slot_info(page, '3') == 'Empty', slot_info(page, '3'))
    check('no page errors', not errors, ' | '.join(errors[:3]))
    b.close()
print('ALL SAVE TESTS PASSED')
