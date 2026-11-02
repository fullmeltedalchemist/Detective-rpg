# Feature status

Legend: ✅ working & tested · 🟡 partial / placeholder · ⬜ not started.
"Tested" means automated browser tests in headless Chrome (software WebGL) unless it says **real device**.

## v0.1 — First playable (branch `main`, live at detective-rpg-case-files.netlify.app)
- ✅ Harbor Street neighbourhood, café / bank / station interiors, sliding doors
- ✅ Third-person movement, camera, touch joystick + look, keyboard/mouse
- ✅ Police cruiser driving, siren, prisoner transport
- ✅ Case 9-114 "The Night Drop": evidence, footage, questioning, confession, arrest, booking, money recovery
- ✅ Wrongful-arrest consequences
- ✅ Diagnostics overlay, quality presets, dynamic resolution
- 🟡 Real iPhone performance — not yet measured on a real device

## Phase A — Combat foundation (branch `phase-a-combat`, preview at detective-rpg-dev.netlify.app)
- ✅ Real motion-captured-style animation clips (UAL1/UAL2): idle, walk, jog, sprint, crouch, talk, drive, kneel, pistol aim/shoot/reload, punches, hook, block, hit reactions, knockback, death, get-up
- ✅ Pistol (semi-auto, 15-rd) and bolt-action rifle (5-rd, bolt cycling); rifle taken from the cruiser trunk
- ✅ Over-the-shoulder aiming, ADS zoom, shoulder swap (C), crosshair with live spread
- ✅ Recoil (camera kick + partial recovery), movement accuracy penalty, spread bloom
- ✅ Ammo, magazines, reserve, reloading with animation, dry-fire auto-reload
- ✅ Simulated projectiles with travel time and bullet drop; hit detection against world boxes and per-bone character hit volumes (head/torso/limbs)
- ✅ Health & damage (headshot / limb multipliers, range falloff), player health regen, player injury → hospital respawn
- ✅ Hostile AI: perception, standoff, verbal surrender orders, cover selection, peek-and-fire bursts, flanking/relocation, retreat, surrender, weapon drop
- ✅ Civilians flee/cower from gunfire and when aimed at; staff duck
- ✅ Punch combos (jab → cross → hook), stamina, blocking, knock-outs, takedown, handcuffing surrendered/downed suspects
- ✅ Consequences: incident log, public trust, professional standing, IA attention, morality; witnesses; IA escalation → suspension (firearm confiscated)
- ✅ Test encounter "Back Lot on Oak Ave" (2 armed suspects + lookout) with incident report
- ✅ Mobile combat controls: Fire (hold, drag to aim), left-side Fire, Aim/Block toggle, Reload, Weapon cycle; touch aim assist
- ✅ Procedural gunshot/impact/punch/reload sounds (WebAudio)
- 🟡 Rifle uses the pistol aiming animations (no CC0 rifle clips yet) — looks acceptable but not right
- 🟡 No strafing clips — aiming while moving plays forward locomotion
- ⬜ NPC melee attacks against the player (block works only against gunfire damage reduction placeholder)
- ⬜ Attachments, fire-mode switching, penetration
- ⬜ Backup officers, calling for help
- ⬜ Gamepad

## Phase A.1 — Hit reactions + visual pass (branch `phase-a-combat`, v0.3.0)
- ✅ Characters: 16 Microsoft Rocketbox avatars (MIT) — realistic proportions, modelled clothing, faces, hair; UAL animations retargeted at runtime; LOD meshes + 512 px textures on Low
- ✅ Hit reactions: spring flinch away from the shot by region (head/torso/arm/leg), rate-limited heavy reaction clip (never restarts under rapid fire), stagger, limp and wound-clutch from injuries
- ✅ One coherent fall: a fatal hit plays a single fall away from the shooter, the body is held still on the ground, corpses never re-animate
- ✅ Knock-outs: stay down (even if hit again) until the timer ends, then one get-up
- ✅ Civilians: panic episodes — pedestrians flee then hide once, staff duck once and stand when it is quiet (no repeated squatting)
- ✅ Environment: foliage-card trees and hedges (ambientCG leaf scans), bark/cobble/worn-asphalt materials, building cornices, parapets, window jambs and sills, plinths, rooftop units and water tanks, fire escapes, shutters, hydrants, security lights
- ✅ High preset: SSAO, bloom, ACES grading, vignette (CameraFrame); car paint clear coat, glass, emissive lamps
- ✅ Review kit: `/health.json` (version + commit), `/preview/` page with screenshots, before/after comparisons, test results, performance numbers (mirrored in `docs/preview/`)
- 🟡 No physics ragdoll (kept off for iPhone cost); falls are animated and turned away from the shooter
- 🟡 Vehicles are still the Kenney low-poly models (better materials only) — no suitable free realistic cars found
- 🟡 All testing in headless Chrome with software rendering — real iPhone frame rates not yet measured

## Phase B — Drug dealers and street crime (branch `phase-b-street-crime`, v0.4.0)
Case 9-201 "Corner Business" — given by Ofc. Delgado outside Precinct 9 (available any time after the first briefing; becomes the main lead once Case 9-114 is closed).
- ✅ Dealer (Cody Brooks), lookout (Kara Pike) and a regular buyer (Andre Mills) on the Harbor Flats corner, east end of Main St — three new Rocketbox avatars
- ✅ Living street: buyers walk up, cash-for-baggie hand-offs play on both characters, the dealer re-ups from the van every couple of sales, a neighbour (Marcus) buys now and then — whether or not you are watching
- ✅ Observation as evidence: a sale or a van re-up only counts if the detective actually sees it (distance, facing, line of sight)
- ✅ Lookout: rolling up in the cruiser, drawing a gun nearby or walking a prisoner past gets you made — "five-oh!", the corner shuts down, a spooked dealer won't sell and is more likely to run
- ✅ Undercover controlled buy with $100 of marked department money
- ✅ Stop: the dealer complies (hands up, kneels) or bolts down Main St; he runs slower than a sprinting detective — catch him and Tackle (reasonable force, not recorded as misconduct); lose him and he comes back later knowing your face
- ✅ Probable cause and procedure: pat-downs and the van search are lawful only after a witnessed sale, a controlled buy or an informant's statement. Search without it and the DA suppresses the evidence — the case is dismissed and he walks
- ✅ Stopping a buyer after a witnessed sale: seize the baggie, then arrest him or flip him for the dealer's name
- ✅ The bribe: Cody offers his $640 to walk. Refuse (recorded) or take it — corruption is recorded (morality, criminal ties, IA if anyone saw), the evidence disappears, he goes back to dealing and pays a weekly envelope. Arrest him later and he tells Okafor about the bribe
- ✅ Van search with his key: stash, scale, $3,100 and a ledger. Optional: pocket $1,000 of seized cash — the ledger's count exposes the shortfall at booking
- ✅ Booking with real charges from the evidence (possession with intent, sale via controlled buy or observation, trafficking quantity), suppression and dismissal, lookout as accessory, buyer for possession
- ✅ Notebook: per-case sections (no spoilers for unfound Case 9-201 evidence), cash on hand and buy money; residents and Okafor react to how the case went
- ✅ Automated: tests/street.py — honest bust, foot chase + tackle + illegal search, bribe + later exposure, lookout
- ✅ Arrest controls on their own buttons, like the weapons: **Cuff** (G) and **Search** (V) appear next to anyone you can arrest or pat down. Cuffing is a short action (the suspect turns around, hands up, the cuffs click; on the ground if they're down); a pat-down is a timed search whose finds appear on a card while you keep playing — no confirmation boxes
- ✅ Hands-up, kneeling surrender, cuffed and wound-clutch poses rebuilt for the current characters
- ✅ The parked van's tyres (they were rendering inside the body)
- 🟡 The van is the low-poly Kenney model; the supplier "M" is only a lead (future case)
- 🟡 Money has no use yet (shops and station upgrades are Phase D); progress is not saved between sessions (save system planned with Phase C)

## Phases C–E
- ⬜ Not started (see MASTER_DESIGN.md)
