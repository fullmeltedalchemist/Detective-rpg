import * as pc from 'playcanvas';
import type { CollisionWorld } from './collision';

interface Bucket { material: pc.Material; pos: number[]; nrm: number[]; uv: number[]; idx: number[]; castShadows: boolean }

export interface BoxOpts {
  /** World-space metres per texture repeat. */
  texScale?: number;
  /** Add a collision solid for this box. Default true. */
  collide?: boolean;
  /** Collision blocks camera ray. Default true. */
  blocksCamera?: boolean;
  castShadows?: boolean;
  /** Skip faces: any of 'top','bottom','px','nx','pz','nz'. */
  skip?: string[];
  tag?: string;
  /** Rotate box around Y by 90° steps (0..3) — only used for non-axis props. */
}

/**
 * Accumulates boxes/quads per material and emits merged meshes.
 * One draw call per material per group — key for phone performance.
 */
export class GeometryBuilder {
  private buckets = new Map<pc.Material, Bucket>();

  constructor(private device: pc.GraphicsDevice, private collision?: CollisionWorld) {}

  private bucket(m: pc.Material, castShadows: boolean) {
    let b = this.buckets.get(m);
    if (!b) this.buckets.set(m, (b = { material: m, pos: [], nrm: [], uv: [], idx: [], castShadows }));
    if (castShadows) b.castShadows = true;
    return b;
  }

  /** Axis-aligned box centred at (cx,cy,cz) with size (sx,sy,sz). UVs are world-scaled. */
  box(material: pc.Material, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, opts: BoxOpts = {}) {
    const ts = opts.texScale ?? 3;
    const b = this.bucket(material, opts.castShadows !== false);
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    const skip = opts.skip ?? [];
    // face: normal, u axis, v axis, size along u, size along v; offset uv by world position for seamless tiling
    const faces: [string, number[], number[], number[], number, number, number, number][] = [
      ['px', [1, 0, 0], [0, 0, -1], [0, 1, 0], sz, sy, -cz, cy],
      ['nx', [-1, 0, 0], [0, 0, 1], [0, 1, 0], sz, sy, cz, cy],
      ['top', [0, 1, 0], [1, 0, 0], [0, 0, -1], sx, sz, cx, -cz],
      ['bottom', [0, -1, 0], [1, 0, 0], [0, 0, 1], sx, sz, cx, cz],
      ['pz', [0, 0, 1], [1, 0, 0], [0, 1, 0], sx, sy, cx, cy],
      ['nz', [0, 0, -1], [-1, 0, 0], [0, 1, 0], sx, sy, -cx, cy],
    ];
    for (const [name, n, u, v, su, sv, ou, ov] of faces) {
      if (skip.includes(name)) continue;
      const base = b.pos.length / 3;
      const c = [cx + n[0] * hx, cy + n[1] * hy, cz + n[2] * hz];
      const hu = su / 2, hv = sv / 2;
      const corners: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      for (const [a, bb] of corners) {
        b.pos.push(
          c[0] + u[0] * a * hu + v[0] * bb * hv,
          c[1] + u[1] * a * hu + v[1] * bb * hv,
          c[2] + u[2] * a * hu + v[2] * bb * hv,
        );
        b.nrm.push(n[0], n[1], n[2]);
        b.uv.push((ou + a * hu) / ts, (ov + bb * hv) / ts);
      }
      b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    if (opts.collide !== false && this.collision) {
      const s = this.collision.addBox(cx, cy, cz, sx, sy, sz, opts.tag);
      if (opts.blocksCamera === false) s.blocksCamera = false;
    }
  }

  /** Single quad facing +normal direction. Used for signs and decals. */
  quad(material: pc.Material, center: pc.Vec3, normal: 'px' | 'nx' | 'pz' | 'nz' | 'top', w: number, h: number, uvRect = [0, 0, 1, 1]) {
    const b = this.bucket(material, false);
    const axes: Record<string, [number[], number[], number[]]> = {
      px: [[1, 0, 0], [0, 0, -1], [0, 1, 0]],
      nx: [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
      pz: [[0, 0, 1], [1, 0, 0], [0, 1, 0]],
      nz: [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
      top: [[0, 1, 0], [1, 0, 0], [0, 0, -1]],
    };
    const [n, u, v] = axes[normal];
    const base = b.pos.length / 3;
    const corners: [number, number, number, number][] = [
      [-1, -1, uvRect[0], uvRect[1]], [1, -1, uvRect[2], uvRect[1]], [1, 1, uvRect[2], uvRect[3]], [-1, 1, uvRect[0], uvRect[3]],
    ];
    for (const [a, bb, uu, vv] of corners) {
      b.pos.push(center.x + u[0] * a * w / 2 + v[0] * bb * h / 2, center.y + u[1] * a * w / 2 + v[1] * bb * h / 2, center.z + u[2] * a * w / 2 + v[2] * bb * h / 2);
      b.nrm.push(n[0], n[1], n[2]);
      b.uv.push(uu, vv);
    }
    b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  /** Emit merged meshes under a parent entity. */
  build(name: string, parent: pc.Entity, layers?: number[]): pc.Entity {
    const root = new pc.Entity(name);
    parent.addChild(root);
    const meshInstances: pc.MeshInstance[] = [];
    const casters: pc.MeshInstance[] = [];
    for (const b of this.buckets.values()) {
      if (!b.idx.length) continue;
      const mesh = new pc.Mesh(this.device);
      mesh.setPositions(b.pos);
      mesh.setNormals(b.nrm);
      mesh.setUvs(0, b.uv);
      mesh.setIndices(b.pos.length / 3 > 65535 ? new Uint32Array(b.idx) : new Uint16Array(b.idx));
      const tangents = pc.calculateTangents(b.pos, b.nrm, b.uv, b.idx);
      mesh.setVertexStream(pc.SEMANTIC_TANGENT, tangents, 4);
      mesh.update(pc.PRIMITIVE_TRIANGLES);
      const mi = new pc.MeshInstance(mesh, b.material);
      meshInstances.push(mi);
      if (b.castShadows) casters.push(mi);
    }
    root.addComponent('render', {
      meshInstances,
      castShadows: false,
      receiveShadows: true,
      ...(layers ? { layers } : {}),
    });
    for (const mi of casters) mi.castShadow = true;
    this.buckets.clear();
    return root;
  }
}
