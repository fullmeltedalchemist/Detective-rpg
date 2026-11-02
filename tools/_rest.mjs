import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const [file, ...names] = process.argv.slice(2);
const doc = await io.read(file);
const nodes = doc.getRoot().listNodes();
const byName = Object.fromEntries(nodes.map(n => [n.getName(), n]));
for (const nm of names) { const n = byName[nm]; if (!n) { console.log(nm, 'missing'); continue; } console.log(nm.padEnd(20), n.getWorldMatrix().slice(12,15).map(v=>v.toFixed(3)).join(', ')); }
