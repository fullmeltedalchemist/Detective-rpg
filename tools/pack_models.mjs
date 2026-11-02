// Packs cached glTF models into optimized GLBs for the web.
// Usage: node tools/pack_models.mjs
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, textureCompress, resample } from '@gltf-transform/functions';
import sharp from 'sharp';
import draco3d from 'draco3dgltf';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = path.join(root, 'public', 'assets', 'models');
fs.mkdirSync(out, { recursive: true });
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
});

const sources = [];
for (const dir of ['models', 'kenney']) {
  const base = path.join(root, 'tools', '.cache', dir);
  if (!fs.existsSync(base)) continue;
  for (const name of fs.readdirSync(base)) {
    const d = path.join(base, name);
    const gltf = fs.readdirSync(d).find((f) => f.endsWith('.gltf'));
    if (gltf) sources.push({ name, file: path.join(d, gltf), kind: dir });
  }
}

// Small hand props get smaller textures.
const tiny = new Set(['cigarette_pack', 'vintage_lighter', 'croissant', 'office_notepads', 'clipboard', 'wall_clock', 'water_manhole_cover']);

for (const s of sources) {
  const target = path.join(out, `${s.name}.glb`);
  if (fs.existsSync(target) && !process.argv.includes('--force')) continue;
  const doc = await io.read(s.file);
  const size = tiny.has(s.name) ? 256 : 512;
  await doc.transform(
    dedup(),
    prune(),
    weld(),
    resample(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [size, size], quality: 82 }),
  );
  // Write uncompressed geometry so the engine needs no Draco decoder.
  doc.getRoot().listExtensionsUsed().filter((e) => e.extensionName === 'KHR_draco_mesh_compression').forEach((e) => e.dispose());
  await io.write(target, doc);
  console.log(s.name.padEnd(28), (fs.statSync(target).size / 1024).toFixed(0) + ' KB');
}
