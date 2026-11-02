# Case Files — build review kit

- **Version:** 0.3.0  ·  **Branch:** `phase-a-combat`  ·  **Commit:** [`0dd95d8`](https://github.com/fullmeltedalchemist/Detective-rpg/commit/0dd95d8485a131a00f20691effc4c45c58434cf6)
- **Dev preview (playable):** https://detective-rpg-dev.netlify.app  ·  **Stable v0.1:** https://detective-rpg-case-files.netlify.app
- **Testing environment:** Headless Chrome on a 2-core Linux container with SwiftShader (CPU) WebGL 2. Touch tests use iPhone emulation. NOT real iPhone hardware.

## Automated tests

- **Case 9-114 regression (smoke.py)** — 68 passed, 0 failed
- **Touch controls, emulated iPhone (touch.py)** — 9 passed, 0 failed
- **Combat (combat.py)** — 30 passed, 0 failed
- **Hit reactions (hits.py)** — 28 passed, 0 failed

## Screenshots (current build)

### Main St looking east from the crossing
![street_main](shots/street_main.webp)

Before (v0.1) vs after — mean pixel change 11.4%
![street_main compare](shots/street_main_compare.webp)

### Café Luna and First Civic Bank storefronts
![street_cafe](shots/street_cafe.webp)

Before (v0.1) vs after — mean pixel change 13.9%
![street_cafe compare](shots/street_cafe_compare.webp)

### Precinct 9 police station
![street_station](shots/street_station.webp)

Before (v0.1) vs after — mean pixel change 14.9%
![street_station compare](shots/street_station_compare.webp)

### Pocket park, trees and hedges
![park](shots/park.webp)

Before (v0.1) vs after — mean pixel change 15.9%
![park compare](shots/park_compare.webp)

### Crime-scene alley beside the bank
![alley](shots/alley.webp)

Before (v0.1) vs after — mean pixel change 6.0%
![alley compare](shots/alley_compare.webp)

### Interior: Café Luna
![interior_cafe](shots/interior_cafe.webp)

Before (v0.1) vs after — mean pixel change 16.6%
![interior_cafe compare](shots/interior_cafe_compare.webp)

### Interior: First Civic Bank
![interior_bank](shots/interior_bank.webp)

Before (v0.1) vs after — mean pixel change 9.9%
![interior_bank compare](shots/interior_bank_compare.webp)

### Interior: Precinct 9 lobby
![interior_station](shots/interior_station.webp)

Before (v0.1) vs after — mean pixel change 8.0%
![interior_station compare](shots/interior_station_compare.webp)

### Characters: detective, sergeant, café owner, teller, suspect, witnesses
![characters](shots/characters.webp)

### Close-up: the detective (Rocketbox avatar, UAL animation)
![character_closeup](shots/character_closeup.webp)

### Combat: aiming down sights with the service pistol
![combat_aim](shots/combat_aim.webp)

### Combat: armed suspects in the back lot (Oak Ave)
![combat_lot](shots/combat_lot.webp)

### Cruiser on Main St
![driving2](shots/driving2.webp)

## Hit reactions (frames captured by tests/hits.py)

**First shot: flinches and drops into cover (a bystander ducks once)**
![hit_flinch](shots/hit_flinch.webp)

**Repeated hits while ducking: flinches only, no squat cycling or restarts**
![hit_repeated](shots/hit_repeated.webp)

**Fatal hit: one fall, blended from the current pose**
![death_fall_1](shots/death_fall_1.webp)

**Falling backwards, away from the shooter**
![death_fall_2](shots/death_fall_2.webp)

**At rest: body held still on the ground**
![death_fall_3](shots/death_fall_3.webp)

**Knocked out: stays down until recovery begins**
![knockout](shots/knockout.webp)

**Recovered: gets up once, after the knock-out ends**
![knockout_recover](shots/knockout_recover.webp)

## Performance (software rendering — not phone numbers)

FPS below is software-rendered on a CPU and is NOT representative of a phone GPU. Real-device numbers must come from the in-game overlay on an iPhone.

- `characters`: FPS now 11  (98.7 ms) | 5s avg 10  1% low 10  session 10 | draws 477  shadow 0.0 ms | res 768×432 @0.80x | quality medium +dyn   | v0.3.0 · 57a6ce1
- `character_closeup`: FPS now 10  (99.5 ms) | 5s avg 10  1% low 10  session 10 | draws 446  shadow 0.0 ms | res 768×432 @0.80x | quality medium +dyn   | v0.3.0 · 57a6ce1
