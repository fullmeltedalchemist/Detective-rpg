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
- ✅ New characters: Quaternius CC0 humans with painted outfits + hair (replaces Kenney placeholders)
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
- 🟡 Superhero-proportioned base bodies (the only free option); muscles show through painted clothes
- 🟡 Bodies don't ragdoll; death uses an animation
- ⬜ NPC melee attacks against the player (block works only against gunfire damage reduction placeholder)
- ⬜ Attachments, fire-mode switching, penetration
- ⬜ Backup officers, calling for help
- ⬜ Gamepad

## Phases B–E
- ⬜ Not started (see MASTER_DESIGN.md)
