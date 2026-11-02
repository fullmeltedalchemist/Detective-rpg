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

## Phases B–E
- ⬜ Not started (see MASTER_DESIGN.md)
