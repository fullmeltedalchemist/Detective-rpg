// Packs Quaternius CC0 characters, hair, animations and Poly Haven weapons for the web.
//   node tools/pack_humans.mjs
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, textureCompress, resample, simplify } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const q = path.join(root, 'tools', '.cache', 'quaternius');
const outH = path.join(root, 'public', 'assets', 'humans');
const outA = path.join(root, 'public', 'assets', 'anims');
const outW = path.join(root, 'public', 'assets', 'models');
for (const d of [outH, outA, outW]) fs.mkdirSync(d, { recursive: true });
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
await MeshoptSimplifier.ready;
const kb = (f) => (fs.statSync(f).size / 1024).toFixed(0) + ' KB';

// ---- Bodies ----
const bodyDir = path.join(q, 'UBC', 'Base Characters', 'Godot - UE');
for (const [src, dst] of [['Superhero_Male_FullBody.gltf', 'hero_m.glb'], ['Superhero_Female_FullBody.gltf', 'hero_f.glb']]) {
  const doc = await io.read(path.join(bodyDir, src));
  // Drop the roughness map (we drive gloss from a constant) to save memory.
  for (const m of doc.getRoot().listMaterials()) m.setMetallicRoughnessTexture(null);
  await doc.transform(dedup(), prune(), resample(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [512, 512], quality: 85 }));
  const f = path.join(outH, dst);
  await io.write(f, doc);
  console.log(dst.padEnd(30), kb(f));
}

// ---- Hair (skinned to the Head bone) ----
const hairDir = path.join(q, 'UBC', 'Hairstyles', 'Rigged to Head Bone', 'glTF (Godot -Unreal)');
for (const f of fs.readdirSync(hairDir).filter((n) => n.endsWith('.gltf'))) {
  const doc = await io.read(path.join(hairDir, f));
  await doc.transform(dedup(), prune(), weld(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [256, 256], quality: 85 }));
  const out = path.join(outH, f.replace('.gltf', '.glb').toLowerCase());
  await io.write(out, doc);
  console.log(path.basename(out).padEnd(30), kb(out));
}

// ---- Animations (meshes stripped, only the clips we use) ----
const KEEP = new Set([
  'Idle_Loop', 'Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Pistol_Idle_Loop', 'Pistol_Aim_Neutral', 'Pistol_Aim_Up', 'Pistol_Aim_Down',
  'Pistol_Shoot', 'Pistol_Reload', 'Punch_Jab', 'Punch_Cross', 'Hit_Chest', 'Hit_Head', 'Death01', 'Roll', 'Crouch_Idle_Loop',
  'Crouch_Fwd_Loop', 'Idle_Talking_Loop', 'Driving_Loop', 'Fixing_Kneeling', 'Interact', 'PickUp_Table', 'Walk_Formal_Loop',
  'Sitting_Idle_Loop', 'Push_Loop',
  // UAL2
  'Melee_Hook', 'Sword_Block', 'Hit_Knockback', 'LayToIdle', 'Idle_FoldArms_Loop', 'Idle_TalkingPhone_Loop', 'Idle_No_Loop', 'Yes',
  'Idle_Shield_Loop', 'Walk_Carry_Loop',
]);
for (const [src, dst] of [['UAL1_Standard.glb', 'ual1.glb'], ['UAL2_Standard.glb', 'ual2.glb']]) {
  const doc = await io.read(path.join(q, src));
  const r = doc.getRoot();
  for (const a of r.listAnimations()) if (!KEEP.has(a.getName())) { a.listChannels().forEach((c) => c.dispose()); a.listSamplers().forEach((s) => s.dispose()); a.dispose(); }
  for (const n of r.listNodes()) { if (n.getMesh()) n.setMesh(null); if (n.getSkin()) n.setSkin(null); }
  for (const m of r.listMeshes()) m.dispose();
  // Trim channels: no scale, translations only on the hips, fingers only for gun clips.
  const finger = /^(index|middle|pinky|ring|thumb)_/;
  for (const anim of r.listAnimations()) {
    const gun = anim.getName().startsWith('Pistol');
    for (const ch of anim.listChannels()) {
      const node = ch.getTargetNode(); const pth = ch.getTargetPath(); const n = node?.getName() ?? '';
      const drop = pth === 'scale' || (pth === 'translation' && n !== 'pelvis' && n !== 'root') || n.includes('leaf') || (!gun && finger.test(n));
      if (drop) { const smp = ch.getSampler(); ch.dispose(); smp?.dispose(); }
    }
  }
  for (const s of r.listSkins()) s.dispose();
  await doc.transform(resample());
  for (const acc of r.listAccessors()) if (acc.listParents().every((p) => p === r)) acc.dispose();
  await doc.transform(prune({ keepLeaves: true }));
  const f = path.join(outA, dst);
  await io.write(f, doc);
  console.log(dst.padEnd(30), kb(f), r.listAnimations().map((a) => a.getName()).join(','));
}

// ---- Weapons & heavy props: decimate ----
const heavy = { fire_hydrant: 0.06, modular_fire_escape: 0.5, security_light: 0.4, utility_box_02: 0.5, service_pistol: 0.18, bolt_action_rifle_7_62: 0.25, concrete_road_barrier_02: 0.08, wooden_military_crate: 0.2, plastic_crate_01: 0.15, metal_jerrycan: 0.25, old_tyre: 0.35 };
for (const [name, ratio] of Object.entries(heavy)) {
  const d = path.join(root, 'tools', '.cache', 'models', name);
  if (!fs.existsSync(d)) continue;
  const gltf = fs.readdirSync(d).find((f) => f.endsWith('.gltf'));
  const doc = await io.read(path.join(d, gltf));
  await doc.transform(dedup(), prune(), weld(), simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.002 }),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [512, 512], quality: 82 }));
  const f = path.join(outW, `${name}.glb`);
  await io.write(f, doc);
  console.log(`${name}.glb`.padEnd(30), kb(f));
}
