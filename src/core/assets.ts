import * as pc from 'playcanvas';

type Kind = 'texture' | 'container' | 'hdr';

interface Entry { key: string; kind: Kind; url: string; srgb?: boolean }

/** Small asset manager: queue, load with progress, fetch by key. */
export class Assets {
  private entries: Entry[] = [];
  private loaded = new Map<string, pc.Asset>();
  private failed: string[] = [];

  constructor(private app: pc.Application) {}

  texture(key: string, url: string, srgb = true) { this.entries.push({ key, kind: 'texture', url, srgb }); }
  model(key: string, url: string) { this.entries.push({ key, kind: 'container', url }); }
  hdr(key: string, url: string) { this.entries.push({ key, kind: 'hdr', url }); }

  async loadAll(onProgress: (p: number, label: string) => void): Promise<void> {
    const total = this.entries.length;
    let done = 0;
    const queue = [...this.entries];
    this.entries = [];
    // Limited parallelism keeps mobile Safari happy.
    const worker = async () => {
      while (queue.length) {
        const e = queue.shift()!;
        try {
          await this.loadOne(e);
        } catch (err) {
          console.warn('Asset failed', e.url, err);
          this.failed.push(e.key);
        }
        done++;
        onProgress(done / total, e.key);
      }
    };
    await Promise.all([worker(), worker(), worker(), worker(), worker(), worker()]);
  }

  get failedKeys() { return this.failed; }

  private loadOne(e: Entry): Promise<pc.Asset> {
    return new Promise((resolve, reject) => {
      let asset: pc.Asset;
      if (e.kind === 'container') {
        asset = new pc.Asset(e.key, 'container', { url: e.url });
      } else if (e.kind === 'hdr') {
        asset = new pc.Asset(e.key, 'texture', { url: e.url }, { type: pc.TEXTURETYPE_RGBE, mipmaps: false });
      } else {
        asset = new pc.Asset(e.key, 'texture', { url: e.url }, { srgb: e.srgb !== false, anisotropy: 4 } as any);
      }
      asset.once('load', () => {
        if (e.kind === 'texture') {
          const t = asset.resource as pc.Texture;
          t.addressU = pc.ADDRESS_REPEAT;
          t.addressV = pc.ADDRESS_REPEAT;
          t.anisotropy = 4;
        }
        this.loaded.set(e.key, asset);
        resolve(asset);
      });
      asset.once('error', (err: unknown) => reject(err));
      this.app.assets.add(asset);
      this.app.assets.load(asset);
    });
  }

  tex(key: string): pc.Texture | null {
    return (this.loaded.get(key)?.resource as pc.Texture) ?? null;
  }

  container(key: string): pc.ContainerResource | null {
    return (this.loaded.get(key)?.resource as pc.ContainerResource) ?? null;
  }

  /** Instantiate a model; returns an empty entity if missing (never silently fakes success). */
  instance(key: string): pc.Entity {
    const c = this.container(key);
    if (!c) {
      console.warn('Missing model', key);
      const e = new pc.Entity(`missing:${key}`);
      return e;
    }
    const e = c.instantiateRenderEntity({ castShadows: true, receiveShadows: true });
    e.name = key;
    return e;
  }
}
