# Case Files — Detective RPG

Mobile-first 3D open-world detective game. PlayCanvas Engine + TypeScript + Vite, deployed on Netlify.

**Live build:** https://detective-rpg-case-files.netlify.app

## Develop
```bash
npm install
npm run dev          # local server (also reachable from a phone on the same Wi-Fi)
npm run build        # typecheck + production build into dist/
```

## Tests
```bash
npm run build && npx vite preview --port 4173 &
python3 tests/smoke.py   # plays Case 9-114 end to end through the real input/UI paths
python3 tests/touch.py   # emulated iPhone: joystick, camera drag, interact button
python3 tests/shot.py http://localhost:4173/?quality=low tests/out/x --views   # screenshots
```

## Layout
- `src/core` — game loop, camera, assets, quality presets
- `src/input` — keyboard/mouse + virtual joystick and touch look
- `src/world` — collision, merged static geometry, buildings/interiors, the Harbor Street map, props
- `src/entities` — procedurally animated characters, player, NPCs, police car
- `src/gameplay` — case state, dialogue trees, booking rules
- `src/ui` — HUD, dialogue, notebook, settings, diagnostics overlay
- `tools/` — asset fetch/pack scripts (Poly Haven CC0 → WebP/GLB)

## Asset licences
- Textures, HDRI and props: [Poly Haven](https://polyhaven.com/license) — CC0
- Characters and vehicles: [Kenney](https://kenney.nl) — CC0 (placeholder art, via pmndrs/market-assets)
- Engine: PlayCanvas — MIT
