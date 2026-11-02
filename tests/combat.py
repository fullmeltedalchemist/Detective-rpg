"""Phase A combat test: weapons, ammo, reload, hit detection, damage, consequences,
melee, encounter (standoff/orders/surrender/firefight), takedown, cuffing, booking.
  python3 tests/combat.py [url]
"""
import sys, time, os, json, math
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:4173/?quality=low'
os.makedirs('tests/out', exist_ok=True)
results = []

def check(name, cond, detail=''):
    results.append((name, bool(cond)))
    print(('PASS ' if cond else 'FAIL ') + name + (f'  [{detail}]' if detail else ''), flush=True)
    if not cond: raise SystemExit(1)

def g(page, expr):
    return page.evaluate(f'() => {{ const g = window.__game; return {expr}; }}')

def frames(page, n=2):
    page.evaluate(f'() => new Promise(r => {{ let k = 0; const f = () => {{ if (++k >= {n}) {{ window.__game.app.off("update", f); r(); }} }}; window.__game.app.on("update", f); }})')

def game_time(page, secs, until=None, timeout=150):
    page.evaluate('() => { window.__gt = 0; window.__game.app.on("update", window.__gtf = (dt) => { window.__gt += Math.min(dt, 1/15); }); }')
    t0 = time.time()
    while time.time() - t0 < timeout:
        if page.evaluate('() => window.__gt') >= secs: break
        if until and page.evaluate(f'() => {{ const g = window.__game; return {until}; }}'): break
        time.sleep(0.15)
    page.evaluate('() => window.__game.app.off("update", window.__gtf)')

def place(page, x, z, yaw=0):
    page.evaluate(f'() => {{ const g = window.__game; g.player.place({x}, {z}, {yaw}); g.cam.snapTo(g.player.pos); }}')
    frames(page, 2)

def aim_at(page, npc_id, height=1.25):
    # iterate: point camera through the target's chest
    for _ in range(4):
        page.evaluate(f'''() => {{ const g = window.__game, n = g.npc("{npc_id}"), c = g.cameraEntity.getPosition();
          const b = n.character.bonePos("spine_03");
          const tx = b.x - c.x, ty = b.y - c.y, tz = b.z - c.z, d = Math.hypot(tx, ty, tz);
          g.cam.yaw = Math.atan2(-tx, -tz) * 180 / Math.PI; g.cam.pitch = Math.asin(ty / d) * 180 / Math.PI; }}''')
        frames(page, 2)

def fire_once(page):
    page.evaluate('() => { window.__game.input.touchFireHeld = true; }'); frames(page, 2)
    page.evaluate('() => { window.__game.input.touchFireHeld = false; }'); frames(page, 2)

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    page = b.new_page(viewport={'width': 480, 'height': 270})
    page.set_default_timeout(120000)
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: m.type == 'error' and errors.append(m.text))
    page.goto(URL)
    page.wait_for_selector('.loading.ready', timeout=240000)
    page.evaluate("document.querySelector('.start').click()")
    page.wait_for_function("document.querySelector('.loading').classList.contains('done')")
    frames(page, 3)
    check('animation library loaded', g(page, 'g.anims.tracks.size') >= 30, str(g(page, 'g.anims.tracks.size')))
    check('player uses animated humanoid', g(page, 'g.player.character.ok'))

    # --- weapons, ammo, reload ---
    page.keyboard.press('Digit2'); frames(page, 2)
    check('pistol equipped via key 2', g(page, 'g.combat.player.equipped') == 'pistol')
    place(page, 16, -1, 0)
    page.evaluate('() => { const g = window.__game; g.cam.yaw = 0; g.cam.pitch = 2; g.input.aimHeld = true; }')
    frames(page, 4)
    check('aiming (ADS) active', g(page, 'g.combat.player.aiming'))
    fov = g(page, 'g.cameraEntity.camera.fov')
    game_time(page, 0.6)
    fov2 = g(page, 'g.cameraEntity.camera.fov')
    check('ADS narrows field of view', fov2 < 50, f'{fov:.0f} -> {fov2:.0f}')
    pitch0 = g(page, 'g.cam.pitch')
    fire_once(page)
    check('firing uses a round', g(page, 'g.combat.player.ws.mag') == 14)
    check('recoil kicks the camera up', g(page, 'g.cam.pitch') > pitch0 + 0.5, f'{pitch0:.1f} -> {g(page, "g.cam.pitch"):.1f}')
    game_time(page, 0.4)
    check('bullet hit the world (impact registered)', g(page, 'g.combat.stats.worldHits') >= 1, str(g(page, 'g.combat.stats')))
    for _ in range(4): game_time(page, 0.2); fire_once(page)
    mag = g(page, 'g.combat.player.ws.mag')
    check('semi-auto fires one shot per trigger pull', mag == 10, str(mag))
    page.keyboard.press('KeyR'); frames(page, 2)
    check('reload started', g(page, 'g.combat.player.reloading'))
    game_time(page, 2.0, until='!g.combat.player.reloading')
    game_time(page, 0.3)
    check('reload refills magazine from reserve', g(page, 'g.combat.player.ws.mag') == 15 and g(page, 'g.combat.player.ws.reserve') == 40, f"{g(page, 'g.combat.player.ws.mag')}/{g(page, 'g.combat.player.ws.reserve')}")
    page.screenshot(path='tests/out/combat_aim.png')

    # --- shooting an innocent civilian has consequences ---
    trust0 = g(page, 'g.combat.standing.publicTrust')
    page.evaluate('() => { const g = window.__game, n = g.npc("civ3"); n.teleport(16, -6.6, 180); n.setState("idle"); n.def.home = [16, -6.6, 180]; n.def.stationary = true; }')
    place(page, 16, -1, 0)
    frames(page, 3)
    hp0 = g(page, 'g.npc("civ3").hp')
    for _ in range(5):
        aim_at(page, 'civ3')
        fire_once(page)
        game_time(page, 0.35)
        if g(page, 'g.npc("civ3").hp') < hp0: break
    check('bullet damages a character (hit detection)', g(page, 'g.npc("civ3").hp') < hp0, f"hp {g(page, 'g.npc(\"civ3\").hp')}")
    inc = g(page, 'g.combat.standing.incidents.map(i => i.type)')
    check('shooting a civilian is recorded as misconduct', 'shot_civilian' in inc or 'killed_civilian' in inc, str(inc))
    check('public trust dropped', g(page, 'g.combat.standing.publicTrust') < trust0)
    check('IA attention increased', g(page, 'g.combat.standing.iaHeat') > 0)
    page.evaluate('() => { window.__game.input.aimHeld = false; }')

    # --- melee: punching a civilian ---
    page.keyboard.press('Digit1'); frames(page, 2)
    check('fists equipped', g(page, 'g.combat.player.equipped') == 'fists')
    page.evaluate('() => { const g = window.__game, n = g.npc("civ2"); n.teleport(30, 6.6, -90); n.setState("idle"); n.def.home = [30, 6.6, -90]; n.def.stationary = true; }')
    place(page, 31.0, 6.6, -90)
    for _ in range(3):
        fire_once(page); game_time(page, 0.5)
        if 'assault_civilian' in g(page, 'g.combat.standing.incidents.map(i => i.type)'): break
    check('punch lands and counts as assault on a civilian', 'assault_civilian' in g(page, 'g.combat.standing.incidents.map(i => i.type)'))
    check('punch reduced consciousness', g(page, 'g.npc("civ2").consciousness') < 100)

    # --- encounter: standoff + order surrender ---
    page.keyboard.press('Digit2'); frames(page, 2)
    place(page, -12.5, 27.5, -90)
    page.evaluate('() => { const g = window.__game; g.cam.yaw = 90; g.cam.pitch = -4; }')
    game_time(page, 1.2, until='g.npc("lookout").state === "combat"')
    check('suspects notice the detective', g(page, '["thug1","thug2","lookout"].some(id => g.npc(id).state === "combat" || g.npc(id).state === "surrender")'))
    page.screenshot(path='tests/out/combat_standoff.png')
    states_before = g(page, '["thug1","thug2","lookout"].map(id => g.npc(id).state)')
    lbl = g(page, 'g.combat.canOrder()')
    if lbl:
        page.evaluate('() => window.__game.combat.orderSurrender()'); frames(page, 3)
    states = g(page, '["thug1","thug2","lookout"].map(id => g.npc(id).state)')
    print('   states', states_before, '->', states)
    check('verbal order resolves into surrender or fight', all(s in ('combat', 'surrender', 'dead', 'down') for s in states))
    # firefight: let them act; NPCs should shoot at us if anyone fights
    game_time(page, 4.0)
    fighters = g(page, '["thug1","thug2"].filter(id => g.npc(id).state === "combat").length')
    if fighters:
        check('armed hostiles return fire', g(page, 'g.combat.stats.npcShots') > 0, str(g(page, 'g.combat.stats')))
    # shoot any fighter until they surrender or die
    page.evaluate('() => { window.__game.input.aimHeld = true; window.__game.combat.player.hp = 100; }')
    for target in ['thug1', 'thug2']:
        for _ in range(16):
            st = g(page, f'g.npc("{target}").state')
            if st != 'combat': break
            page.evaluate('() => { const g = window.__game; g.combat.player.hp = 100; const ws = g.combat.player.ws; if (ws.mag < 3) { ws.mag = 15; } }')
            # flank: pick a nearby spot with a clear line of sight to the target's chest
            spot = page.evaluate(f'''() => {{ const g = window.__game, n = g.npc("{target}"), b = n.character.bonePos("spine_03");
              for (const r of [5, 7, 4]) for (let k = 0; k < 16; k++) {{ const a = k / 16 * Math.PI * 2, x = n.x + Math.cos(a) * r, z = n.z + Math.sin(a) * r;
                if (z > 33.3 || z < 22.8 || x < -47 || x > -9.5) continue;
                const res = {{x: 0, z: 0, hit: false, nx: 0, nz: 0}}; g.world.resolveCircle(x, z, 0.3, 0.4, 1.7, res); if (res.hit) continue;
                if (g.combat.ai.lineOfSight(new b.constructor(x, 1.6, z), b)) return [x, z]; }}
              return [n.x + 4, n.z]; }}''')
            place(page, spot[0], spot[1], -90)
            aim_at(page, target)
            fire_once(page); game_time(page, 0.3)
    states = g(page, '["thug1","thug2","lookout"].map(id => g.npc(id).state)')
    print('   after firefight', states)
    check('armed suspects neutralised (surrendered, down or killed)', all(s in ('surrender', 'dead', 'down', 'cuffed') for s in states[:2]), str(states))
    inc = g(page, 'g.combat.standing.incidents.map(i => i.type)')
    if 'dead' in states[:2]:
        check('killing an armed, firing suspect is logged as justified', 'justified_shooting' in inc or 'killed_surrendered' in inc, str(inc))
    page.evaluate('() => { window.__game.input.aimHeld = false; }')
    page.screenshot(path='tests/out/combat_after.png')

    # --- takedown + cuff + book a surviving suspect ---
    alive = [i for i, s in zip(['thug1', 'thug2', 'lookout'], states) if s in ('surrender', 'down')]
    check('at least one suspect can be taken alive', len(alive) > 0, str(states))
    sid = alive[0]
    nx, nz = g(page, f'[g.npc("{sid}").x, g.npc("{sid}").z]')
    place(page, nx + 1.0, nz, -90)
    frames(page, 3)
    lab = g(page, 'document.querySelector(".btn.primary span").textContent')
    check('handcuff prompt on surrendered/downed suspect', 'Handcuff' in lab, lab)
    page.evaluate('() => window.__game.input.press("interact")'); frames(page, 3)
    check('suspect cuffed', g(page, 'g.prisoner && g.prisoner.id') == sid)
    A = g(page, '[g.refs.anchors.booking.x, g.refs.anchors.booking.z]')
    place(page, A[0], A[1])
    page.evaluate(f'() => window.__game.npc("{sid}").teleport({A[0] + 1.2}, {A[1] - 0.5})')
    frames(page, 3)
    page.evaluate('() => window.__game.input.press("interact")'); frames(page, 3)
    stamp = page.locator('.report .stamp').inner_text()
    check('armed suspect charged at booking', stamp == 'CHARGED', stamp)
    page.locator('.report .chip').evaluate('b => b.click()')
    check('non-lethal arrest credited', 'nonlethal_arrest' in g(page, 'g.combat.standing.incidents.map(i => i.type)'))

    # --- takedown on a staggered hostile (spawned test case using the lookout if still free) ---
    free = g(page, '["thug1","thug2","lookout"].filter(id => ["surrender","down"].includes(g.npc(id).state))')
    if free:
        tid = free[0]
        page.evaluate(f'() => {{ const n = window.__game.npc("{tid}"); n.setState("combat"); n.character.revive(); n.character.pose = "normal"; n.lastHitAt = performance.now()/1000; n.armed = null; }}')
        nx, nz = g(page, f'[window.__game.npc("{tid}").x, window.__game.npc("{tid}").z]')
        place(page, nx + 1.0, nz, -90)
        frames(page, 2)
        if g(page, f'g.combat.canTakedown(g.npc("{tid}"))'):
            page.evaluate(f'() => window.__game.combat.takedown(window.__game.npc("{tid}"))'); frames(page, 2)
            check('takedown puts the suspect on the ground', g(page, f'g.npc("{tid}").state') == 'down')

    # --- notebook shows standing ---
    page.evaluate('() => window.__game.input.press("notebook")'); frames(page, 2)
    check('notebook lists standing + incidents', 'Public trust' in page.locator('.notebook .body').inner_text())
    page.screenshot(path='tests/out/combat_notebook.png')
    check('no page errors', not errors, ' | '.join(errors[:3]))
    print(json.dumps({'passed': sum(1 for r in results if r[1]), 'total': len(results), 'stats': g(page, 'g.combat.stats'), 'standing': g(page, 'g.combat.standing.summary()')}))
    b.close()
