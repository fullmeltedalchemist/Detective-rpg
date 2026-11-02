# CASE FILES — MASTER GAME EXPANSION DIRECTIVE

## Project

Repository: `fullmeltedalchemist/Detective-rpg`

Current game: Case Files — Detective RPG

We are continuing development of the EXISTING PlayCanvas + TypeScript game. Do not restart, replace the game engine, or abandon the currently working first investigation.

**Primary goal:** Build a beautiful, immersive, 3D open-world detective, police, and crime RPG that lets the player decide how to behave, who to investigate, how to enforce the law, and whether to become an honest or corrupt authority figure.

The game must remain playable in iPhone Safari throughout development, with eventual PC and mobile releases.

The following is the complete long-term feature vision. Preserve it in a permanent master design document. Implement it in stages rather than attempting to complete everything in one update.

---

# 1. Realistic Third-Person Shooting — PUBG-Style Mechanics

I want shooting to feel satisfying, responsive, tactical, and realistic, taking inspiration from PUBG's gameplay mechanics without copying its copyrighted assets.

Build toward:

- Third-person over-the-shoulder shooting and optional first-person aiming.
- Aim down sights (ADS), hip firing, shoulder switching, camera zoom, and adjustable sensitivity.
- Realistic recoil patterns, muzzle climb, weapon sway, accuracy, effective range, and movement-based accuracy penalties.
- Projectile travel time, bullet drop, projectile velocity, penetration rules, and distinct weapon characteristics.
- Handguns, revolvers, shotguns, rifles, and other unlockable firearms.
- Fire modes where appropriate: semi-automatic, burst, and automatic.
- Ammunition, magazines, reloading, reserve ammunition, and weapon switching.
- Weapon attachments such as optics, flashlights, suppressors, grips, and extended magazines.
- Gunshot sounds, muzzle flashes, cartridge ejection, environmental impacts, and appropriate hit reactions.
- Realistic aiming and shooting animations.
- Intelligent enemies that take cover, retreat, surrender, flank, return fire, or flee.
- Optional aiming assistance for mobile, without completely aiming for the player.
- The ability to shoot hostile suspects, civilians, or other characters, with the world reacting appropriately.

Players should not be restricted to predetermined shootout missions. Firearms should work naturally as part of the open world.

Criminal, legal, career, and reputation consequences must exist for unjustified violence.

# 2. Hand-to-Hand Fighting and Physical Arrests

Build a full melee and physical-interaction system.

Features:

- Punching and combinations.
- Blocking, dodging, and stamina.
- Physical confrontations with suspects and civilians.
- Grappling and takedown animations.
- Nonlethal restraint and arrest options.
- Handcuffing standing, kneeling, or surrendered suspects.
- Searching people and confiscating weapons or contraband.
- Resistance during arrest and attempts to escape.
- Suspects who surrender, negotiate, resist, or attack.
- Injuries, knockdowns, unconsciousness, and recovery where appropriate.
- NPCs reacting to nearby fights and calling emergency services.
- Backup officers who can help restrain dangerous suspects.

Use meaningful animations and physics, not generic button-triggered success messages.

# 3. Drug Dealers, Gangs, and Criminal Organizations

Create an interconnected criminal underworld in the city.

Include:

- Drug dealers operating in different neighborhoods.
- Street-level transactions and suspicious activity.
- Drug possession and trafficking offenses.
- Drug houses, stash locations, criminal businesses, and organized crime networks.
- Rival gangs, territorial disputes, threats, retaliations, and criminal hierarchy.
- Drug busts, undercover operations, raids, and surveillance.
- Arrests, searches, warrants, informants, and confiscation of contraband.
- Evidence needed to establish criminal activity and connect suspects to larger organizations.
- Criminal suspects who cooperate, lie, escape, or provide intelligence.

**Corrupt gameplay options:**

- Accept bribes to ignore criminal activity.
- Protect criminal organizations in exchange for money.
- Steal seized money or contraband.
- Manipulate investigation outcomes.
- Sell information or deliberately sabotage investigations.
- Form secret relationships with criminals while maintaining the appearance of being a detective.

These activities must have genuine consequences and create new gameplay branches.

# 4. Good Detective, Bad Cop, and Morality

The player must have real freedom rather than being forced down one predetermined moral path.

Support honest, corrupt, and morally ambiguous playstyles.

Honest decisions:

- Investigate crimes properly.
- Respect evidence and procedure.
- Protect civilians.
- Release innocent people.
- Refuse bribes.
- Expose police corruption.
- Build trust with the public.

Corrupt decisions:

- Plant evidence and frame innocent suspects.
- Falsify reports and conceal evidence.
- Take bribes.
- Intimidate or threaten suspects.
- Abuse police authority.
- Steal seized money.
- Protect criminal businesses.
- Cover up unlawful shootings or other misconduct.
- Manipulate witnesses.
- Abuse the criminal justice system for personal gain.

Design independent reputation variables for public trust, criminal influence, professional standing, internal affairs attention, and personal morality.

Different characters should respond to the player's history.

Police misconduct can lead to investigations, suspension, dismissal, prosecution, or a criminal career. Corruption should offer possible advantages but also carry escalating risks.

# 5. Deep Investigation and Detective Gameplay

Preserve and improve the first existing case, "The Night Drop."

Develop reusable systems for:

- Homicides, robberies, disappearances, kidnappings, assaults, burglaries, fraud, organized crime, and other cases.
- Crime-scene photography.
- Fingerprints, footprints, weapons, blood evidence, surveillance footage, and forensic reports.
- Collecting, examining, transporting, and documenting evidence.
- Evidence chains of custody.
- Interviewing witnesses.
- Interrogating suspects using dialogue choices and evidence.
- Searching locations and obtaining warrants.
- Following leads and building connections between suspects.
- Multiple suspects with different motives.
- False leads, conflicting testimony, and deceptive witnesses.
- Cases with more than one possible outcome.
- Solving crimes through deduction rather than following objective markers alone.

Add handcrafted major investigations alongside smaller procedural crimes.

# 6. A Fully Interactive Open World

The long-term goal is a beautiful, living city and surrounding region.

Include:

- Downtown, suburbs, wealthy neighborhoods, industrial districts, rough neighborhoods, parks, and rural surroundings.
- Functional roads, intersections, traffic lights, and traffic.
- Pedestrians with schedules, relationships, routines, homes, and jobs.
- Realistic weather, day/night cycles, street lighting, and changing environments.
- Enterable houses, apartments, police facilities, businesses, and public buildings.
- Cafés, restaurants, banks, gas stations, convenience stores, clothing stores, garages, and other locations.
- Buying food, drinks, clothing, equipment, and other items.
- Ordering and consuming food or drinks at businesses.
- Shopping, paying, talking with staff, and interacting with objects.
- NPCs who remember prior encounters.
- Dynamic crimes that occur with or without player involvement.
- Random events, secrets, hidden locations, and side activities.

Avoid decorative buildings everywhere that cannot be entered or used.

Build interactive locations gradually with a consistent interaction framework.

# 7. Driving and Vehicle Systems

Expand the existing police cruiser system.

Features:

- Several usable vehicle types.
- Entering and exiting vehicles.
- Improved handling, suspension, acceleration, braking, and collisions.
- Vehicle damage and repair.
- Police lights, sirens, and radio.
- Traffic stops and citations.
- Searching vehicles and arresting occupants.
- Vehicle pursuits, roadblocks, and backup.
- Suspect vehicles that evade police.
- Transporting handcuffed prisoners.
- Vehicle ownership, garages, customization, and upgrades.
- Vehicle-mounted cameras and other police equipment.
- Driving through both urban and rural areas.

Eventually support AI traffic, vehicle theft, and appropriate consequences for reckless driving or attacking civilians.

# 8. Police Station Management and Career Progression

Start with a modest precinct and eventually build a much larger department.

Allow the player to:

- Earn legitimate pay and funding.
- Purchase equipment and vehicles.
- Upgrade evidence laboratories.
- Improve interrogation rooms.
- Expand jail cells.
- Upgrade garages, offices, surveillance, computers, and equipment.
- Recruit detectives, patrol officers, forensic technicians, and specialists.
- Assign officers to patrols and investigations.
- Dispatch backup and coordinate operations.
- Manage station budgets and resources.
- Unlock advanced investigation and tactical equipment.
- Earn promotions and take leadership positions.
- Eventually become chief or take control of larger police operations.

The station should visibly change as upgrades are purchased.

# 9. Justice, Courts, Punishments, and Prisons

Build a deeper fictional justice system where arrests lead to meaningful outcomes.

Include:

- Suspect booking.
- Charges based on evidence.
- Interrogations and case reports.
- Prosecutors, defense attorneys, judges, and trials.
- Convictions and acquittals.
- Bail, fines, probation, community service, and imprisonment.
- Different prison sentences based on offenses.
- Prison facilities and prisoner management.
- Appeals and the possibility of wrongful convictions.
- Different ways the player can influence legal outcomes.
- Bribery, falsified evidence, corrupt officials, and unjust sentences.

For the darkest criminal cases, the fictional setting should also support capital punishment, including an electric-chair execution sequence as part of the game's justice and corruption storylines.

Give the player ways to influence sentencing and, after gaining sufficient authority or corrupt influence, potentially control extreme punishment decisions.

These features should connect to the actual legal systems within the fictional world instead of being disconnected menu choices.

# 10. Persistent NPC Lives and Consequences

NPCs should not merely stand around waiting for interactions.

Develop systems for:

- Daily routines.
- Home and work locations.
- Friendships, enemies, and families.
- Criminal histories.
- Witness memory.
- Fear, trust, hostility, and cooperation.
- Recognition of the player.
- Reactions to arrests, shootings, threats, and corruption.
- Criminal retaliation and informant relationships.
- Recurring suspects and ongoing stories.
- NPCs whose lives change based on player decisions.

The city should remember the player's actions.

# 11. Equipment, Inventory, and Progression

Create an equipment and upgrade framework for:

- Firearms and ammunition.
- Handcuffs and restraints.
- Tasers and other nonlethal tools.
- Body armor.
- Flashlights.
- Radios.
- Forensic kits.
- Cameras and surveillance equipment.
- Vehicle tools.
- Detective notebooks and case files.
- Weapon customization and upgrades.
- Player skills and career progression.

Allow customized loadouts for patrols and investigations.

# 12. Save Games and Player Freedom

Implement persistent saving and loading.

Support multiple save slots and preserve:

- Active investigations.
- Evidence and case outcomes.
- NPC relationships and hostility.
- Arrests and imprisonment.
- Reputation, corruption, and morality.
- Weapons, inventory, money, and vehicles.
- Police station upgrades.
- Player location and world progression.

Keep saves backward-compatible when practical and offer backups or exports.

---

# IMMEDIATE DEVELOPMENT PRIORITY

We want to begin implementing these features, not just discussing them.

However, do not add all 12 systems at once.

## Phase A — Combat Foundation

Implement the first genuinely playable version of third-person shooting and melee fighting.

Deliver:

1. Equippable handgun and one rifle.
2. Third-person aiming, ADS, firing, recoil, ammunition, and reloading.
3. Proper hit detection against characters and the environment.
4. Damage and health systems.
5. Enemy reactions, surrender, and basic defensive behavior.
6. Punching, blocking, and at least one nonlethal takedown.
7. Real character and weapon animations.
8. Mobile-friendly aim, shoot, reload, and melee controls.
9. Consequences for attacking innocent civilians.
10. A small test encounter in the existing neighborhood.

Evaluate integration with the game's current custom collision system before selecting the ballistic and physics implementation.

The existing case must remain playable.

## Phase B — Drug Dealers and Street Crime

Add functioning dealer NPCs, suspicious transactions, confrontations, arrests, contraband evidence, undercover dialogue, and one complete drug investigation.

Include at least one choice between an honest bust and taking a bribe.

## Phase C — Morality and Corruption

Expand the reputation system with persistent good and bad decisions.

Introduce evidence planting, false arrests, bribery, misconduct investigation, and branching NPC reactions.

## Phase D — World and Station Expansion

Expand interactive businesses, NPC schedules, police equipment, upgrades, additional vehicles, and dynamic crimes.

## Phase E — Advanced Systems

Work toward the full justice system, sentencing, prisons, department leadership, deeper gang networks, procedural investigations, advanced combat AI, and the larger city.

---

# DEVELOPMENT RULES

- Keep developing the existing repository.
- Preserve all currently working gameplay.
- No destructive rewrites without approval.
- Use modular TypeScript files, not a giant single script.
- Keep the code well organized and expandable.
- Preserve existing case functionality and add regression tests.
- Improve the visuals as new features are introduced.
- Use legally licensed assets and keep proper license documentation.
- Use proper animations, not unconvincing placeholder movements.
- Avoid single-button interactions that merely announce completion.
- Optimize for mobile Safari and maintain separate PC-quality settings.
- Aim for stable 30 FPS on the actual target phone.
- Add gamepad support when practical.
- Develop in small, testable increments.
- Provide a new Netlify preview URL after every successful update.
- Verify builds and browser tests before claiming functionality.
- Distinguish browser-emulated testing from real iPhone testing.
- Never overwrite a stable playable version without maintaining a recovery path.
- Track completed, partially implemented, and unimplemented features honestly.

# FIRST ACTION

Inspect the current repository, preserve the working game, and begin Phase A.

Before changing any core systems, identify the files and components that combat will interact with.

Then implement the first working combat milestone on a separate development branch, test it, and provide a playable Netlify preview.

Do not stop after writing a plan. I want actual, playable development progress.

**The ultimate goal is a deep, beautiful, open-world detective and crime game where players can enforce the law, break the law, investigate the city, and live with the consequences of their choices.**
