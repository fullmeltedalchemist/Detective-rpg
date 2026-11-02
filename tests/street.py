"""Phase B — Case 9-201 "Corner Business": street dealing, observation, searches, bribes.

Each scenario runs on a fresh page load:
  A. honest bust: watch a sale, stop the buyer, see the van re-up, controlled buy, stop + search,
     refuse the bribe, search the van, book -> charged
  B. foot chase: the dealer runs, a real sprint (keyboard) catches him, tackle, search WITHOUT
     probable cause -> booked -> case dismissed
  C. bribe: take the money (corruption recorded), weekly envelope, arrest him later -> he talks
  D. lookout: driving the cruiser up to the corner gets you made; the corner shuts down
  python3 tests/street.py [url]
"""
import sys, time, os
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:4173/?quality=low&norender=1'
os.makedirs('tests/out', exist_ok=True)


def check(name, cond, detail=''):
    print(('PASS ' if cond else 'FAIL ') + name + (f'  [{detail}]' if detail != '' else ''), flush=True)
    if not cond:
        raise SystemExit(1)


def g(page, expr):
    return page.evaluate(f'() => {{ const g = window.__game, s = g.state, st = g.street; return {expr}; }}')


def run(page, js):
    page.evaluate(f'() => {{ const g = window.__game, s = g.state, st = g.street; {js} }}')


def game_time(page, secs, until=None, timeout=240):
    page.evaluate('() => { window.__gt0 = window.__game.time; }')
    t0 = time.time()
    while time.time() - t0 < timeout:
        if page.evaluate('() => window.__game.time - window.__gt0') >= secs: return True
        if until and page.evaluate(f'() => {{ const g = window.__game, s = g.state, st = g.street; return !!({until}); }}'): return True
        time.sleep(0.15)
    return False


def choose(page, text):
    btns = page.locator('.dialogue.show .choice', has_text=text)
    if btns.count() == 0:
        info = page.locator('.dialogue .line').inner_text() + ' || ' + page.locator('.dialogue .choices').inner_text() if page.locator('.dialogue.show').count() else 'no dialogue open'
        check(f'dialogue choice "{text}" present', False, info)
    btns.first.evaluate('b => b.click()')
    time.sleep(0.3)


def line(page):
    return page.locator('.dialogue .line').inner_text() if page.locator('.dialogue.show').count() else ''


def close_dialogue(page):
    for _ in range(4):
        if page.locator('.dialogue.show').count() == 0: return
        c = page.locator('.dialogue.show .choice')
        c.last.evaluate('b => b.click()')
        time.sleep(0.3)


def examine_go(page):
    btn = page.locator('.examine.show button.go')
    check('examine action available', btn.count() == 1)
    btn.evaluate('b => b.click()')
    time.sleep(0.3)


def close_report(page):
    page.evaluate("() => { const b = document.querySelector('.report.show button'); if (b) b.click(); }")
    time.sleep(0.3)


def prompt(page):
    return g(page, 'document.querySelector(".btn.primary span").textContent')


def interact(page):
    page.evaluate('() => window.__game.input.press("interact")')
    game_time(page, 0.1)


def act(page, action, secs=2.4):
    """Press the Cuff/Search button and wait for the timed action to finish."""
    page.evaluate(f'() => window.__game.input.press("{action}")')
    game_time(page, 0.15)
    game_time(page, secs, until='!g.arrests.busy')
    game_time(page, 0.1)


def buttons(page):
    return g(page, '[...document.querySelectorAll(".arrest .btn:not(.hidden) span")].map(e => e.textContent)')


def found(page):
    return g(page, 'document.querySelector(".found.show") ? document.querySelector(".found").innerText : ""')


def place(page, x, z, yaw=0, cam=None):
    page.evaluate(f'() => {{ const g = window.__game; g.player.place({x}, {z}, {yaw}); {f"g.cam.yaw = {cam};" if cam is not None else ""} g.cam.snapTo(g.player.pos); }}')
    game_time(page, 0.15)


def talk(page, npc):
    run(page, f'g.talkTo(g.npc("{npc}"));')
    time.sleep(0.3)


def incidents(page):
    return g(page, 'g.combat.standing.incidents.map(i => i.type)')


def open_case(page):
    talk(page, 'officer1')
    choose(page, "I'll take it.")
    close_dialogue(page)


def new_page(b):
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
    game_time(page, 1.0)
    return ctx, page, errors


def force_deal(page):
    run(page, 'st.andreIndoorsUntil = 0; st.nextDealAt = st.t; st.dealsSinceReup = 0;')


with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])

    # =============================== A. honest bust ===============================
    ctx, page, errors = new_page(b)
    check('dealer, lookout and buyer exist', g(page, '["dealer","kara","andre"].every(id => !!g.npc(id))'))
    check('new avatars loaded', g(page, 'g.assets.failedKeys.length') == 0, g(page, 'g.assets.failedKeys'))
    open_case(page)
    check('case 9-201 opened by Delgado', g(page, 's.flag("drugCaseOpen") && s.has("tipDelgado")'))
    check('marked buy money issued', g(page, 's.buyMoney') == 100)

    # watch from down the block, facing east toward the corner
    place(page, 44.5, -6.4, 90, cam=270)
    force_deal(page)
    ok = game_time(page, 60, until='s.has("obsDeal")')
    check('a buyer walks up and a hand-to-hand sale happens in view', ok and g(page, 's.has("obsDeal")'), g(page, '[st.phase, st.dealsTotal, g.npc("andre").state]'))
    check('both sides play the hand-off animation', g(page, '(g.npc("dealer").character.clipStarts["Interact"] || 0) >= 1 && (g.npc("andre").character.clipStarts["Interact"] || 0) >= 1'),
          g(page, '[g.npc("dealer").character.clipStarts, g.npc("andre").character.clipStarts]'))
    check('sale counted as seen by the detective', g(page, 'st.dealsSeen') >= 1)

    # the buyer walks off west, past the detective: stop him
    game_time(page, 30, until='st.dealsTotal >= 1 && (Math.hypot(g.npc("andre").x - g.player.x, g.npc("andre").z - g.player.z) < 3.5 || g.npc("andre").state === "hold")')
    check('the sale completes and the buyer leaves', g(page, 'st.dealsTotal') >= 1, g(page, '[st.phase, g.npc("andre").state]'))
    andre_pos = g(page, '[g.npc("andre").x, g.npc("andre").z]')
    place(page, andre_pos[0] + 1.2, andre_pos[1] + 0.3, 270)
    talk(page, 'andre')
    choose(page, 'I watched you buy')
    check("buyer's baggie seized after a witnessed sale", g(page, 's.has("buyerBaggie")'))
    check('lawful: no illegal-search incident for the buyer', 'illegal_search' not in incidents(page), incidents(page))
    choose(page, 'Tell me who sold it')
    check('buyer names the dealer (statement)', g(page, 's.has("statementAndre") && s.flag("andreFlipped")'))
    close_dialogue(page)

    # re-up at the van, seen from across the street
    place(page, 46.5, -6.5, 90, cam=270)  # same sidewalk, looking east along it
    run(page, 'st.dealsSinceReup = 2; st.nextDealAt = st.t;')
    ok = game_time(page, 60, until='s.has("obsVan")')
    check('dealer re-ups from the van and the detective sees it', ok and g(page, 's.has("obsVan")'), g(page, '[st.phase, g.npc("dealer").state, g.npc("dealer").x.toFixed(1)]'))
    game_time(page, 20, until='st.phase === "waiting" && g.npc("dealer").state === "idle" && Math.hypot(g.npc("dealer").x - 59.5, g.npc("dealer").z + 7.9) < 0.6')

    # controlled buy
    run(page, 'st.nextDealAt = st.t + 999;')
    place(page, 60.6, -7.0, 270)
    talk(page, 'dealer')
    choose(page, 'You good?')
    check('dealer offers to sell to a plainclothes detective', 'Forty a bag' in line(page), line(page))
    choose(page, 'Pay $40')
    check('controlled buy recorded, $40 of buy money spent', g(page, 's.has("controlledBuy") && s.buyMoney === 60'))
    close_dialogue(page)

    # the stop: he complies (forced), hands up
    run(page, 'st.forceStop = "comply";')
    talk(page, 'dealer')
    choose(page, 'Police. Hands where I can see them')
    close_dialogue(page)
    check('dealer stops and raises his hands', g(page, 'g.npc("dealer").state') == 'surrender')
    game_time(page, 0.3)
    check('Cuff and Search buttons both offered for a stopped suspect', 'Search' in ' '.join(buttons(page)) and 'Cuff' in ' '.join(buttons(page)), buttons(page))
    act(page, 'search')
    check('pat-down is a timed action with an animation (detective played a hand clip)', g(page, '(g.player.character.clipStarts["Interact"] || 0) >= 1'))
    check('pat-down: pills, cash and burner phone seized', g(page, 's.has("baggies") && s.has("dealerCash") && s.has("burner")'))
    check('finds shown on a card, no modal window', 'baggies' in found(page) and not g(page, 'g.hud.modalOpen'), found(page))
    check('search was lawful (probable cause)', g(page, 's.flag("drugSearchLawful") && !s.flag("drugSearchUnlawful")'))

    # the bribe — refused
    talk(page, 'dealer')
    check('dealer offers a bribe', 'nobody has to know' in line(page), line(page))
    choose(page, 'Put it away')
    close_dialogue(page)
    check('bribe refused and recorded', g(page, 's.flag("bribeRefused")') and 'refused_bribe' in incidents(page), incidents(page))
    game_time(page, 3, until='g.prisoner && !g.arrests.busy')
    check('cuffing action plays after the dialogue (handcuff click, progress)', g(page, 'g.prisoner && g.prisoner.id') == 'dealer')
    check('dealer in handcuffs', g(page, 'g.prisoner && g.prisoner.id') == 'dealer' and g(page, 'g.npc("dealer").state') == 'cuffed')

    # the van
    place(page, 56.0, -5.6, 0)
    check('van search prompt (has his key)', 'Search the van' in prompt(page), prompt(page))
    interact(page)
    choose(page, 'Seize everything')
    close_dialogue(page)
    check('van stash and ledger seized', g(page, 's.has("vanStash") && s.has("ledger") && !s.flag("stashSkimmed")'))

    # book him
    trust0 = g(page, 'g.combat.standing.publicTrust')
    run(page, 'const A = g.refs.anchors; g.player.place(A.booking.x, A.booking.z - 0.6, 0); g.npc("dealer").teleport(A.booking.x + 1.0, A.booking.z - 1.2);')
    game_time(page, 0.3)
    check('booking prompt', 'Book' in prompt(page), prompt(page))
    interact(page)
    stamp = page.locator('.report.show .stamp').inner_text() if page.locator('.report.show').count() else ''
    body = page.locator('.report.show').inner_text() if page.locator('.report.show').count() else ''
    check('dealer CHARGED', stamp == 'CHARGED', stamp)
    check('charges list sale, possession and trafficking', all(k in body for k in ['controlled buy', 'Possession with intent', 'Trafficking']), body[:300])
    check('dealer jailed, case closed', g(page, 's.jailed.has("dealer") && s.flag("drugCaseClosed")'))
    check('drug bust recorded and public trust rose', 'drug_bust' in incidents(page) and g(page, 'g.combat.standing.publicTrust') > trust0, incidents(page))
    close_report(page)
    page.evaluate('() => window.__game.hud.openNotebook(window.__game.state, { title: "t", text: "t" })')
    nb = page.locator('.notebook.show').inner_text()
    nbl = nb.lower()
    check('notebook shows Case 9-201 (closed) and buy money', 'corner business · closed' in nbl and 'marked buy money: $60' in nbl, nb[-700:])
    page.evaluate('() => window.__game.hud.closeNotebook()')
    check('no page errors (A)', not errors, ' | '.join(errors[:3]))
    page.screenshot(path='tests/out/street_A.png')
    ctx.close()

    # ====================== B. chase, tackle, illegal search ======================
    ctx, page, errors = new_page(b)
    open_case(page)
    check('dealer runs slower than a sprinting detective', g(page, 'g.npc("dealer").evadeSpeed < g.player.runSpeed'), g(page, '[g.npc("dealer").evadeSpeed, g.player.runSpeed]'))
    run(page, 'st.nextDealAt = st.t + 999; st.forceStop = "run";')
    place(page, 61.6, -7.9, 270, cam=90)
    talk(page, 'dealer')
    choose(page, 'Police. Hands where I can see them')
    close_dialogue(page)
    check('dealer bolts', g(page, 'g.npc("dealer").state') == 'evade')
    # real sprint: Shift + W toward the west (camera yaw 90 -> forward is -x)
    page.evaluate('() => { window.__game.cam.yaw = 90; }')
    page.keyboard.down('Shift'); page.keyboard.down('w')
    caught = game_time(page, 14, until='Math.hypot(g.npc("dealer").x - g.player.x, g.npc("dealer").z - g.player.z) < 1.5')
    page.keyboard.up('w'); page.keyboard.up('Shift')
    gap = g(page, 'Math.hypot(g.npc("dealer").x - g.player.x, g.npc("dealer").z - g.player.z)')
    check('sprinting detective catches up within 14 s', caught and gap < 1.9, f'gap {gap:.2f} m, dealer at x={g(page, "g.npc(\"dealer\").x"):.1f}')
    check('tackle prompt on a fleeing suspect', prompt(page) == 'Tackle', prompt(page))
    interact(page)
    check('tackled to the ground', g(page, 'g.npc("dealer").state') == 'down')
    check('tackling a fleeing suspect is not excessive force', 'excessive_force' not in incidents(page), incidents(page))
    game_time(page, 2.5)
    check('Cuff button shows straight away for a tackled suspect', any(b.startswith('Cuff') for b in buttons(page)), buttons(page))
    act(page, 'search')
    check('search WITHOUT probable cause is flagged', g(page, 's.flag("drugSearchUnlawful")') and 'illegal_search' in incidents(page), incidents(page))
    check('card warns about the missing probable cause', 'probable cause' in found(page).lower(), found(page))
    act(page, 'cuff')
    check('dealer cuffed (on the ground, with the cuffing action)', g(page, 'g.prisoner && g.prisoner.id') == 'dealer')
    game_time(page, 1.5)
    run(page, 'const A = g.refs.anchors; g.player.place(A.booking.x, A.booking.z - 0.6, 0); g.npc("dealer").teleport(A.booking.x + 1.0, A.booking.z - 1.2);')
    game_time(page, 0.3)
    interact(page)
    stamp = page.locator('.report.show .stamp').inner_text() if page.locator('.report.show').count() else ''
    body = page.locator('.report.show').inner_text() if page.locator('.report.show').count() else ''
    check('case DISMISSED: evidence suppressed', stamp == 'RELEASED' and 'Suppressed' in body, f'{stamp} | {body[:200]}')
    check('dismissal recorded; dealer back on the street', 'case_dismissed' in incidents(page) and not g(page, 's.jailed.has("dealer")'), incidents(page))
    close_report(page)
    check('no page errors (B)', not errors, ' | '.join(errors[:3]))
    ctx.close()

    # ================================ C. the bribe ================================
    ctx, page, errors = new_page(b)
    open_case(page)
    run(page, 'st.nextDealAt = st.t + 999; st.forceStop = "comply"; g.collectEvidence("obsDeal");')
    place(page, 60.6, -7.0, 270)
    talk(page, 'dealer')
    choose(page, 'Police. Hands where I can see them')
    close_dialogue(page)
    game_time(page, 0.3)
    act(page, 'search')
    m0 = g(page, 'g.combat.standing.summary()')
    talk(page, 'dealer')
    choose(page, 'Take the money')
    close_dialogue(page)
    m1 = g(page, 'g.combat.standing.summary()')
    check('bribe taken: $640 in your pocket, evidence gone', g(page, 's.money === 640 && s.flag("dealerBribed") && !s.has("baggies") && !s.has("dealerCash")'), g(page, '[s.money, [...s.evidence]]'))
    check('corruption recorded: morality down, criminal ties up', m1['morality'] <= m0['morality'] - 20 and m1['influence'] >= m0['influence'] + 15 and 'took_bribe' in incidents(page), f'{m0} -> {m1}')
    game_time(page, 3)
    check('dealer released, back to his corner', g(page, 'g.npc("dealer").state') in ('idle', 'goto') and g(page, 'g.prisoner') is None)
    place(page, 60.6, -7.0, 270)
    game_time(page, 12, until='Math.hypot(g.npc("dealer").x - 59.5, g.npc("dealer").z + 7.9) < 0.8')
    talk(page, 'dealer')
    choose(page, 'envelope')
    check('weekly envelope: +$200', g(page, 's.money') == 840, g(page, 's.money'))
    close_dialogue(page)
    ia0 = g(page, 'g.combat.standing.iaHeat')
    talk(page, 'dealer')
    choose(page, "It's over")
    close_dialogue(page)
    game_time(page, 3, until='g.prisoner && !g.arrests.busy')
    check('turned on him: dealer cuffed', g(page, 'g.prisoner && g.prisoner.id') == 'dealer')
    game_time(page, 2.0, until='!g.arrests.busy && g.prisoner')
    check('fresh search possible after the bribe', any(b.startswith('Search') for b in buttons(page)), buttons(page))
    act(page, 'search')
    run(page, 'const A = g.refs.anchors; g.player.place(A.booking.x, A.booking.z - 0.6, 0); g.npc("dealer").teleport(A.booking.x + 1.0, A.booking.z - 1.2);')
    game_time(page, 0.3)
    interact(page)
    body = page.locator('.report.show').inner_text() if page.locator('.report.show').count() else ''
    check('booked — and he tells Okafor about the bribe', 'took $640' in body and g(page, 'g.combat.standing.iaHeat') >= ia0 + 15, f"{body[-200:]} | IA {ia0} -> {g(page, 'g.combat.standing.iaHeat')}")
    close_report(page)
    check('no page errors (C)', not errors, ' | '.join(errors[:3]))
    ctx.close()

    # ================================ D. the lookout ===============================
    ctx, page, errors = new_page(b)
    open_case(page)
    check('lookout on her phone, dealer with folded arms', g(page, 'g.npc("kara").character.idleStyle === "phone" && g.npc("dealer").character.idleStyle === "foldArms"'))
    run(page, 'g.player.place(40, -2, 90); g.car.place(42.5, -3.4, 90); g.input.press("vehicle");')
    game_time(page, 0.6)
    check('in the cruiser', g(page, 'g.driving'))
    run(page, 'g.car.place(46.5, -3.4, 90);')
    ok = game_time(page, 5, until='st.recentlyWarned')
    check('lookout warns the corner when the cruiser rolls up', ok)
    game_time(page, 0.5)
    check('dealer stops dealing and lays low', g(page, 'st.phase') == 'laylow', g(page, 'st.phase'))
    run(page, 'g.input.press("vehicle");')
    game_time(page, 0.6)
    run(page, 'g.npc("dealer").release("idle"); g.npc("dealer").teleport(59.5, -7.9, 0);')
    place(page, 60.6, -7.0, 270)
    talk(page, 'dealer')
    choose(page, 'You good?')
    check('a spooked dealer will not sell to you', "Corner's hot" in line(page) or 'cop' in line(page), line(page))
    close_dialogue(page)
    check('no page errors (D)', not errors, ' | '.join(errors[:3]))
    ctx.close()
    b.close()
print('ALL STREET TESTS PASSED')
