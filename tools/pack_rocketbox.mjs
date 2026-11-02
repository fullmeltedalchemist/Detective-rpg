// Packs Microsoft Rocketbox avatars (MIT) for the web.
//   1. tools/fbx_convert/run.py converts FBX -> raw GLB (three.js, in headless Chrome)
//   2. this script: merges per-material primitives, sets hair/eyelash cards to alpha-test,
//      strips textures (loaded separately per quality preset), writes a full mesh and a
//      decimated LOD for the low preset.
//   3. textures: tools/rocketbox_textures.py
// Usage: node tools/pack_rocketbox.mjs <rawDir>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, joinPrimitives, simplify } from '@gltf-transform/functions';
import { PropertyType } from '@gltf-transform/core';
import { MeshoptSimplifier } from 'meshoptimizer';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const rawDir = process.argv[2];
const out = path.join(root, 'public', 'assets', 'humans', 'rb');
fs.mkdirSync(out, { recursive: true });
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
await MeshoptSimplifier.ready;
// Drop props baked into some avatars that we don't want (SWAT weapons etc.)
const DROP = /(shotgun|machinegun|helmet)$/i;

for (const f of fs.readdirSync(rawDir).filter((n) => n.endsWith('.raw.glb'))) {
  const name = f.replace('.raw.glb', '');
  for (const [suffix, ratio] of [['', 1], ['_lod', 0.42]]) {
    const doc = await io.read(path.join(rawDir, f));
    const r = doc.getRoot();
    for (const m of r.listMaterials()) {
      const n = m.getName();
      m.setBaseColorTexture(null); m.setNormalTexture(null); m.setMetallicRoughnessTexture(null); m.setEmissiveTexture(null);
      m.setMetallicFactor(0); m.setRoughnessFactor(0.7);
      if (/opacity/i.test(n)) { m.setAlphaMode('MASK'); m.setAlphaCutoff(0.45); m.setDoubleSided(true); }
      else m.setAlphaMode('OPAQUE');
    }
    for (const mesh of r.listMeshes()) for (const prim of mesh.listPrimitives()) {
      if (DROP.test(prim.getMaterial()?.getName() ?? '')) mesh.removePrimitive(prim);
    }
    // three.js UVs use a bottom-left origin; glTF / PlayCanvas use top-left: flip V once
    const flipped = new Set();
    for (const mesh of r.listMeshes()) for (const prim of mesh.listPrimitives()) {
      const uv = prim.getAttribute('TEXCOORD_0');
      if (!uv || flipped.has(uv)) continue;
      flipped.add(uv);
      const a = uv.getArray();
      for (let i = 1; i < a.length; i += 2) a[i] = 1 - a[i];
    }
    // merge primitives that share a material (the converter splits them per material run)
    for (const mesh of r.listMeshes()) {
      const groups = new Map();
      for (const prim of mesh.listPrimitives()) {
        const k = prim.getMaterial();
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(prim);
      }
      for (const [, prims] of groups) {
        if (prims.length < 2) continue;
        const joined = joinPrimitives(prims);
        for (const p of prims) { mesh.removePrimitive(p); p.dispose(); }
        mesh.addPrimitive(joined);
      }
    }
    const steps = [dedup({ propertyTypes: [PropertyType.ACCESSOR, PropertyType.MESH, PropertyType.TEXTURE] }), weld(), prune({ keepAttributes: true })];
    if (ratio < 1) steps.push(simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.004, lockBorder: true }));
    await doc.transform(...steps);
    const target = path.join(out, `${name}${suffix}.glb`);
    await io.write(target, doc);
    const prims = r.listMeshes().flatMap((m) => m.listPrimitives());
    const tris = prims.reduce((s, p) => s + (p.getIndices()?.getCount() ?? 0) / 3, 0);
    console.log(`${name}${suffix}`.padEnd(26), `${(fs.statSync(target).size / 1024).toFixed(0)} KB`, `${prims.length} prims`, `${tris} tris`, prims.map((p) => p.getMaterial()?.getName()).join(','));
  }
}
