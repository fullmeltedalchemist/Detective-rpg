import { NodeIO } from '@gltf-transform/core';
const io = new NodeIO();
const doc = await io.read(process.argv[2]);
const r = doc.getRoot();
for (const n of r.listNodes().slice(0, 6)) console.log(n.getName(), n.getScale(), n.getRotation(), n.getTranslation());
console.log('skins', r.listSkins().length, 'joints', r.listSkins()[0].listJoints().length, 'mats', r.listMaterials().map(m=>m.getName()+':'+m.getAlphaMode()));
for (const m of r.listMeshes()) for (const p of m.listPrimitives()) console.log(m.getName(), p.getMaterial()?.getName(), p.getIndices()?.getCount()/3, Object.keys(p.listSemantics?p.listSemantics():{}), p.listSemantics());
