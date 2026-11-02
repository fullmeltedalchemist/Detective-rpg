"""Hit-reaction regression test.

Fires real projectiles through the ballistics system and counts animation clip starts
per character, to prove reactions don't restart on every bullet, falls play once,
knocked-out people stay down until recovery, and civilians don't squat repeatedly.
Also measures which way each fall clip moves the body (for FALL_YAW).
  python3 tests/hits.py [url] [--frames]   (--frames saves image sequences for the preview page)
"""
import sys, time, os, json, math
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith('--') else 'http://localhost:4173/?quality=low&norender=1'
FRAMES = '--frames' in sys.argv
OUT = 'tests/out'
os.makedirs(OUT, exist_ok=True)
results = []


def check(name, cond, detail=''):
    results.append({'name': name, 'pass': bool(cond), 'detail': str(detail)})
    print(('PASS ' if cond else 'FAIL ') + name + (f'  [{detail}]' if detail else ''), flush=True)
    if not cond:
        json.dump(results, open(f'{OUT}/hits_results.json', 'w'), indent=1)
        raise SystemExit(1)


def g(page, expr):
    return page.evaluate(f'() => {{ const g = window.__game; return {expr}; }}')


def game_time(page, secs, timeout=150):
    page.evaluate('() => { window.__gt0 = window.__game.time; }')
    t0 = time.time()
    while time.time() - t0 < timeout and page.evaluate('() => window.__game.time - window.__gt0') < secs:
        time.sleep(0.1)


def shoot(page, npc, frm, bone='spine_03', dmg=20):
    """Fire a real bullet from `frm` (x,z) at the NPC's bone."""
    page.evaluate(f'''() => {{ const g = window.__game, n = g.npc("{npc}"), b = n.character.bonePos("{bone}");
      const o = new b.constructor({frm[0]}, b.y, {frm[1]}); const d = b.clone().sub(o).normalize();
      g.combat.ballistics.fire(o, d, 400, "player", {dmg}, 2, 0.7, 60, "pistol"); }}''')


def starts(page, npc):
    return g(page, f'Object.assign({{}}, g.npc("{npc}").character.clipStarts)')


def diff(a, b):
    return {k: b.get(k, 0) - a.get(k, 0) for k in set(a) | set(b) if b.get(k, 0) - a.get(k, 0)}


def setup(page, npc, x, z, yaw=0, stationary=True, hp=100):
    page.evaluate(f'''() => {{ const g = window.__game, n = g.npc("{npc}"); n.character.revive(); n.hp = {hp}; n.consciousness = 100;
      n.def.home = [{x}, {z}, {yaw}]; n.def.stationary = {str(stationary).lower()}; n.teleport({x}, {z}, {yaw}); n.setState("idle");
      n.character.crouch = false; n.character.pose = "normal"; }}''')


def pelvis_range(page, npc, secs):
    """Max/min pelvis height of an NPC sampled on EVERY frame for `secs` of game time."""
    page.evaluate(f'''() => {{ const g = window.__game, c = g.npc("{npc}").character; window.__pel = [9, -9, 0];
      window.__pelFn = () => {{ const y = c.bonePos("pelvis").y; window.__pel[0] = Math.min(window.__pel[0], y); window.__pel[1] = Math.max(window.__pel[1], y); window.__pel[2]++; }};
      g.app.on("update", window.__pelFn); }}''')
    game_time(page, secs)
    r = page.evaluate('() => { window.__game.app.off("update", window.__pelFn); return window.__pel; }')
    check(f'pelvis sampled on every frame ({npc})', r[2] >= 10, f'{r[2]} frames')
    return r[0], r[1]


def snap(page, name):
    if FRAMES:
        page.evaluate('() => window.__renderOnce && window.__renderOnce()')
        page.evaluate('() => new Promise(r => setTimeout(r, 50))')
        page.evaluate('() => window.__renderOnce && window.__renderOnce()')
        page.screenshot(path=f'{OUT}/{name}.png', timeout=300000)


with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    page = b.new_page(viewport={'width': 640, 'height': 360})
    page.set_default_timeout(120000)
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(URL)
    page.wait_for_selector('.loading.ready', timeout=240000)
    page.evaluate("document.querySelector('.start').click()")
    page.wait_for_function("document.querySelector('.loading').classList.contains('done')")
    game_time(page, 0.5)
    # keep the player out of the way, camera watching the test spot
    def cam(x, z, yaw=200, pitch=-8, dist=4.5):
        page.evaluate(f'() => {{ const g = window.__game; g.player.place({x}, {z}, 0); g.cam.yaw = {yaw}; g.cam.pitch = {pitch}; g.cam.distance = g.cam.targetDistance = {dist}; g.cam.snapTo(g.player.pos); }}')

    # ---------- 0. avatar arms follow the animation (not swung into the torso) ----------
    arm = page.evaluate('''() => {
      const g = window.__game, res = [];
      for (const id of ['nina', 'dale', 'okafor', 'rosa', 'victor']) {
        const c = g.npc(id).character, m = c.model, t = c.tgtByName;
        let worst = 0;
        for (const sd of ['l', 'r']) for (const [a, b] of [['clavicle_', 'upperarm_'], ['upperarm_', 'lowerarm_'], ['lowerarm_', 'hand_']]) {
          const s = m.findByName(b + sd).getPosition().clone().sub(m.findByName(a + sd).getPosition()).normalize();
          const d = t.get(b + sd).getPosition().clone().sub(t.get(a + sd).getPosition()).normalize();
          worst = Math.max(worst, Math.acos(Math.max(-1, Math.min(1, s.dot(d)))) * 57.3);
        }
        res.push([id, Math.round(worst)]);
      }
      return res; }''')
    check('avatar arm bones follow the animation (all within 3 deg)', all(w <= 3 for _, w in arm), arm)
    setup(page, 'nina', 14, -1.0, 180)
    game_time(page, 1.0)
    gap = page.evaluate('''() => { const c = window.__game.npc('nina').character, sp = c.tgtByName.get('spine_02').getPosition();
      return ['l', 'r'].map(sd => { const h = c.tgtByName.get('hand_' + sd).getPosition(); return Math.hypot(h.x - sp.x, h.z - sp.z); }); }''')
    check('idle hands hang outside the torso (> 0.17 m from the spine)', min(gap) > 0.17, [round(x, 2) for x in gap])

    # ---------- 1. measure fall directions ----------
    falls = {}
    for clip in ['death']:
        setup(page, 'civ3', 14, 2.5, 0)
        cam(14, -1.5, 0, -6, 3)
        p0 = g(page, '(() => { const n = g.npc("civ3"); const p = n.character.bonePos("Head"); return [p.x, p.z]; })()')
        page.evaluate(f'() => {{ const n = window.__game.npc("civ3"); n.setState("down"); n.character.life = "alive"; n.character.{"knockDown" if clip == "knockback" else "die"}(null); }}')
        game_time(page, 2.5)
        p1 = g(page, '(() => { const n = g.npc("civ3"); const p = n.character.bonePos("Head"); return [p.x, p.z]; })()')
        dx, dz = p1[0] - p0[0], p1[1] - p0[1]
        falls[clip] = round(math.degrees(math.atan2(dx, dz)))  # yaw 0 => character faces +Z
        print(f'   {clip}: head moved {math.hypot(dx, dz):.2f} m toward yaw {falls[clip]}')
    json.dump(falls, open(f'{OUT}/fall_yaw.json', 'w'))
    page.evaluate('() => { const n = window.__game.npc("civ3"); n.character.revive(); n.setState("idle"); }')

    # ---------- 2. rapid repeated gunshots on a standing civilian ----------
    setup(page, 'civ3', 14, 2.5, 0, stationary=True, hp=10000)
    cam(13, -2, 20, -6, 4)
    game_time(page, 0.5)
    s0 = starts(page, 'civ3')
    for i in range(8):
        shoot(page, 'civ3', (14 + (i % 3 - 1) * 0.5, -6), bone='spine_03' if i % 2 else 'thigh_l', dmg=30)
        game_time(page, 0.22)
        if i == 2: snap(page, 'hit_seq_1')
        if i == 5: snap(page, 'hit_seq_2')
    game_time(page, 1.0)
    d = diff(s0, starts(page, 'civ3'))
    hits = d.get('Hit_Chest', 0) + d.get('Hit_Head', 0)
    print('   clip starts during 8 shots in ~1.8 s:', d)
    check('8 rapid hits: reaction clip starts at most twice (rate-limited)', hits <= 2, d)
    check('8 rapid hits: no repeated crouch/squat', d.get('Crouch_Idle_Loop', 0) <= 1, d)
    check('8 rapid hits: no fall/death clip on a survivor', d.get('Death01', 0) == 0 and d.get('Hit_Knockback', 0) == 0, d)
    check('wounds recorded (limp / clutch drivers)', g(page, 'g.npc("civ3").character.injury.torso') > 0.2 and g(page, 'g.npc("civ3").character.injury.leg') > 0.2)
    snap(page, 'hit_wounded')

    # ---------- 3. lethal shots: exactly one fall, then still ----------
    setup(page, 'civ3', 14, 2.5, 0, stationary=True, hp=60)
    game_time(page, 0.3)
    s0 = starts(page, 'civ3')
    for i in range(6):
        shoot(page, 'civ3', (14, -6), dmg=30)
        game_time(page, 0.15)
        if i == 2: snap(page, 'death_seq_1')
    s_dead = starts(page, 'civ3')
    game_time(page, 0.5); snap(page, 'death_seq_2')
    game_time(page, 2.5); snap(page, 'death_seq_3')
    after_death = diff(s_dead, starts(page, 'civ3'))
    d = diff(s0, starts(page, 'civ3'))
    falls_started = d.get('Death01', 0) + d.get('Hit_Knockback', 0)
    print('   clip starts while being killed:', d)
    check('NPC died', g(page, 'g.npc("civ3").state') == 'dead')
    check('fatal hits: exactly one fall animation', falls_started == 1, d)
    check('fatal hits: nothing restarts after death (no idle/crouch/get-up)', not after_death, after_death)
    lo, hi = pelvis_range(page, 'civ3', 2.0)
    check('body lies still on the ground after the fall (every frame for 2 s)', hi < 0.4 and hi - lo < 0.03, f'pelvis height {lo:.2f}..{hi:.2f}')
    s1 = starts(page, 'civ3')
    page.evaluate('() => { const n = window.__game.npc("civ3"); n.damage(50, "bullet", "player", "torso", null); }')
    game_time(page, 0.5)
    check('shooting a corpse starts no animations', not diff(s1, starts(page, 'civ3')))
    page.evaluate('() => { const n = window.__game.npc("civ3"); n.character.revive(); n.hp = 100; n.setState("idle"); }')

    # ---------- 4. knockout: one fall, stays down until recovery, gets up once ----------
    setup(page, 'civ2', 18, 2.5, 0, stationary=True)
    cam(17, -2, 20, -6, 4)
    game_time(page, 0.3)
    s0 = starts(page, 'civ2')
    page.evaluate(f'() => {{ const g = window.__game, n = g.npc("civ2"); n.knockOut(5.5, new n.pos.constructor(18, 0, -6)); }}')
    game_time(page, 3.0); snap(page, 'knockdown_1')
    check('knocked-out NPC is lying still', g(page, 'g.npc("civ2").character.lyingStill'))
    lo, hi = pelvis_range(page, 'civ2', 1.0)
    check('knocked-out body never pops up (every frame for 1 s)', hi < 0.4 and hi - lo < 0.03, f'pelvis height {lo:.2f}..{hi:.2f}')
    # extra hits while down must not restart anything
    for _ in range(3):
        page.evaluate('() => { const n = window.__game.npc("civ2"); n.damage(5, "melee", "player", "torso", null); }')
        game_time(page, 0.3)
    check('still down while hit on the ground', g(page, 'g.npc("civ2").state') == 'down')
    game_time(page, 4.5, )
    st = g(page, 'g.npc("civ2").state')
    check('recovery begins only after the knock-out ends', st in ('recover', 'idle'), st)
    game_time(page, 3.0); snap(page, 'knockdown_2')
    d = diff(s0, starts(page, 'civ2'))
    print('   knockdown cycle clip starts:', d)
    check('knockdown: exactly one fall and one get-up', d.get('Death01', 0) + d.get('Hit_Knockback', 0) == 1 and d.get('LayToIdle', 0) == 1, d)
    check('back on their feet', g(page, 'g.npc("civ2").state') in ('idle', 'flee', 'wander', 'watch'), g(page, 'g.npc("civ2").state'))

    # ---------- 4b. knocked down, then killed while falling: one fall, stays down for good ----------
    setup(page, 'civ3', 14, 2.5, 0, stationary=True, hp=100)
    game_time(page, 0.3)
    s0 = starts(page, 'civ3')
    page.evaluate('() => { const g = window.__game, n = g.npc("civ3"); n.knockOut(20, new n.pos.constructor(14, 0, -6)); }')
    game_time(page, 0.4)
    page.evaluate('() => { const n = window.__game.npc("civ3"); n.damage(500, "bullet", "player", "torso", null); }')
    game_time(page, 2.5)
    lo, hi = pelvis_range(page, 'civ3', 2.5)
    d = diff(s0, starts(page, 'civ3'))
    check('killed mid-fall: dead, exactly one fall', g(page, 'g.npc("civ3").state') == 'dead' and d.get('Death01', 0) == 1 and d.get('LayToIdle', 0) == 0, d)
    check('killed mid-fall: body never pops up (every frame for 2.5 s)', hi < 0.4 and hi - lo < 0.03, f'pelvis height {lo:.2f}..{hi:.2f}')
    page.evaluate('() => { const n = window.__game.npc("civ3"); n.character.revive(); n.hp = 100; n.setState("idle"); }')

    # ---------- 5. staff behind the counter under sustained gunfire: duck once ----------
    page.evaluate('() => { const g = window.__game; g.player.place(16, -12, 180); }')
    s0 = starts(page, 'rosa')
    for i in range(6):
        page.evaluate('() => { const g = window.__game; g.combat["civilianReact"](new g.player.pos.constructor(16, 0.15, -12), 30); }')
        game_time(page, 0.7)
    check('staff ducks during gunfire', g(page, 'g.npc("rosa").state') == 'cower')
    d = diff(s0, starts(page, 'rosa'))
    check('staff: crouched once, not repeatedly', d.get('Crouch_Idle_Loop', 0) == 1, d)
    game_time(page, 9.0)
    check('staff stands up after it goes quiet', g(page, 'g.npc("rosa").state') != 'cower', g(page, 'g.npc("rosa").state'))
    d = diff(s0, starts(page, 'rosa'))
    check('staff: one crouch per panic episode', d.get('Crouch_Idle_Loop', 0) == 1, d)

    # ---------- 6. pedestrian under sustained gunfire: runs, then hides once ----------
    setup(page, 'civ1', -30, -7, 90, stationary=False)
    s0 = starts(page, 'civ1')
    for i in range(8):
        page.evaluate('() => { const g = window.__game; g.combat["civilianReact"](new g.player.pos.constructor(-24, 0.15, -7), 40); }')
        game_time(page, 0.8)
    d = diff(s0, starts(page, 'civ1'))
    print('   pedestrian clip starts:', d)
    check('pedestrian ran away', d.get('Sprint_Loop', 0) + d.get('Jog_Fwd_Loop', 0) >= 1, d)
    check('pedestrian: at most one crouch while danger lasts', d.get('Crouch_Idle_Loop', 0) <= 1, d)
    check('pedestrian: no gait flicker (jog/sprint switch at most twice each)', d.get('Jog_Fwd_Loop', 0) <= 2 and d.get('Sprint_Loop', 0) <= 2, d)

    check('no page errors', not errors, ' | '.join(errors[:3]))
    json.dump(results, open(f'{OUT}/hits_results.json', 'w'), indent=1)
    print(json.dumps({'passed': sum(r['pass'] for r in results), 'total': len(results), 'fall_yaw': falls}))
    b.close()
