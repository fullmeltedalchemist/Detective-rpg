import * as pc from 'playcanvas';
import { Assets } from './assets';
import { FollowCamera } from './camera';
import { loadQuality, saveQuality, isTouchDevice, type QualityPreset } from './quality';
import { Input } from '../input/input';
import { Hud } from '../ui/hud';
import { CollisionWorld } from '../world/collision';
import { Materials, queueSurfaceTextures } from '../world/materials';
import { buildNeighborhood, type WorldRefs } from '../world/neighborhood';
import { Humanoid, AnimLibrary, yawTowards, type HumanLook } from '../entities/humanoid';
import { Player } from '../entities/player';
import { Car } from '../entities/car';
import { Npc, type NpcDef } from '../entities/npc';
import { GameState, EVIDENCE, type EvidenceId } from '../gameplay/state';
import { currentObjective, dialogueFor, evaluateBooking, type CaseCtx, type BookingResult } from '../gameplay/caseScript';
import { CombatDirector } from '../gameplay/combatDirector';
import { ENCOUNTER_NPCS } from '../gameplay/encounter';
import { WEAPONS } from '../combat/weapons';

const MODELS = [
  'police-car', 'sedan', 'taxi', 'suv', 'hatchback', 'van',
  'street_lamp_02', 'modular_street_seating', 'metal_trash_can', 'utility_box_01', 'planter_box_01', 'potted_plant_04',
  'round_wooden_table_02', 'bar_chair_round_01', 'CashRegister_01', 'metal_office_desk', 'steel_frame_shelves_01',
  'security_camera_01', 'cardboard_box_01', 'trashbag', 'WetFloorSign_01', 'cigarette_pack', 'vintage_lighter', 'clipboard',
  'SchoolChair_01', 'Television_01', 'office_notepads', 'water_manhole_cover', 'croissant', 'Sofa_01', 'exterior_aircon_unit',
  'wooden_crate_01', 'standing_chalkboard_01', 'hanging_picture_frame_01', 'wall_clock', 'plastic_monobloc_chair_01', 'shrub_03',
  'service_pistol', 'bolt_action_rifle_7_62', 'wooden_military_crate', 'concrete_road_barrier_02', 'metal_jerrycan', 'old_tyre', 'plastic_crate_01',
  'fire_hydrant', 'modular_fire_escape', 'rollershutter_door', 'security_light', 'utility_box_02',
];
/** Microsoft Rocketbox avatars (MIT) used in this build, with their texture prefixes. */
export const AVATARS: Record<string, { prefix: string; parts: string[] }> = {
  Business_Male_03: { prefix: 'm020', parts: ['body', 'head', 'opacity'] },
  Business_Male_01: { prefix: 'm005', parts: ['body', 'head', 'opacity'] },
  Business_Male_04: { prefix: 'm015', parts: ['body', 'head'] },
  Business_Female_01: { prefix: 'f014', parts: ['body', 'head', 'opacity'] },
  Security_Female_01: { prefix: 'f170', parts: ['body', 'head', 'pistol', 'hat'] },
  Police_Male_01: { prefix: 'm220', parts: ['body', 'head', 'equipment', 'pistol'] },
  Male_Adult_03: { prefix: 'm004', parts: ['body', 'head', 'opacity'] },
  Male_Adult_06: { prefix: 'm011', parts: ['body', 'head', 'opacity'] },
  Male_Adult_08: { prefix: 'm014', parts: ['body', 'head', 'opacity'] },
  Male_Adult_09: { prefix: 'm017', parts: ['body', 'head', 'opacity'] },
  Male_Adult_16: { prefix: 'm019', parts: ['body', 'head'] },
  Male_Adult_20: { prefix: 'm027', parts: ['body', 'head'] },
  Female_Adult_01: { prefix: 'f001', parts: ['body', 'head', 'opacity'] },
  Female_Adult_04: { prefix: 'f004', parts: ['body', 'head', 'opacity'] },
  Female_Adult_08: { prefix: 'f008', parts: ['body', 'head', 'opacity'] },
  Female_Adult_11: { prefix: 'f011', parts: ['body', 'head', 'opacity'] },
};
const HDRI = 'qwantani_late_afternoon_puresky';
export const BUILD_ID = `v${import.meta.env.VITE_BUILD_VERSION ?? '0.3.0'} · ${(import.meta.env.VITE_BUILD_COMMIT ?? 'dev').slice(0, 7)}`;

interface Interactable {
  id: string;
  pos: pc.Vec3;
  radius: number;
  label: () => string | null;
  act: () => void;
  priority?: number;
}

export class Game {
  app!: pc.Application;
  q: QualityPreset;
  input!: Input;
  hud!: Hud;
  assets!: Assets;
  world = new CollisionWorld();
  refs!: WorldRefs;
  cam!: FollowCamera;
  cameraEntity!: pc.Entity;
  sun!: pc.Entity;
  player!: Player;
  car!: Car;
  parked: Car[] = [];
  npcs: Npc[] = [];
  state = new GameState();
  combat!: CombatDirector;
  /** Game-time clock (seconds, capped per frame) — tests wait on this. */
  time = 0;
  cameraFrame: pc.CameraFrame | null = null;
  anims!: AnimLibrary;
  interactables: Interactable[] = [];
  driving = false;
  prisoner: Npc | null = null;
  started = false;
  private fpsAvg = 60;
  private frameMsAvg = 16;
  private dynRatio = 1;
  private dynTimer = 0;
  private lookSens = 1;
  private shake = 0;
  private recklessCooldown = 0;
  private frameTimes: number[] = [];
  private sessionFrames = 0;
  private sessionTime = 0;
  /** Exposed for automated smoke tests. */
  debug: Record<string, unknown> = {};

  constructor(private canvas: HTMLCanvasElement) {
    this.q = loadQuality();
    try { this.lookSens = parseFloat(localStorage.getItem('casefiles.sens') ?? '1') || 1; } catch { /* */ }
  }

  async init() {
    const ui = document.getElementById('ui')!;
    this.input = new Input(this.canvas, ui);
    this.hud = new Hud(this.input);
    // Performance overlay on by default for the dev preview, or with ?perf=1
    const qs = new URLSearchParams(location.search);
    if (qs.get('perf') === '1' || (location.hostname.includes('-dev') && qs.get('perf') !== '0')) this.hud.diagOn = true;
    if (isTouchDevice()) { this.input.touchMode = true; document.body.classList.add('touch'); }
    this.hud.setLoading(0.02, 'Starting renderer…');

    const app = new pc.Application(this.canvas, {
      graphicsDeviceOptions: {
        antialias: this.q.antialias,
        alpha: false,
        powerPreference: 'high-performance',
        deviceTypes: ['webgl2'],
      } as any,
    });
    this.app = app;
    app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
    app.setCanvasResolution(pc.RESOLUTION_AUTO);
    this.dynRatio = Math.min(window.devicePixelRatio || 1, this.q.maxPixelRatio);
    app.graphicsDevice.maxPixelRatio = this.dynRatio;
    window.addEventListener('resize', () => app.resizeCanvas());
    window.addEventListener('orientationchange', () => setTimeout(() => app.resizeCanvas(), 300));

    this.setupScene();

    // ---- Load assets ----
    this.assets = new Assets(app);
    queueSurfaceTextures(this.assets, this.q);
    this.assets.hdr('sky', `assets/env/${HDRI}.hdr`);
    for (const m of MODELS) this.assets.model(m, `assets/models/${m}.glb`);
    for (const a of ['ual1', 'ual2']) this.assets.model(a, `assets/anims/${a}.glb`);
    for (const card of ['card_maple', 'card_round', 'card_hedge']) {
      const t = this.q.textureSize === '1k' ? card : `${card}_512`;
      this.assets.texture(`foliage:${t}`, `assets/tex/foliage/${t}.webp`, true);
    }
    const lod = this.q.level === 'low';
    const tier = this.q.level === 'high' ? '1024' : '512';
    for (const [key, av] of Object.entries(AVATARS)) {
      this.assets.model(`rb:${key}${lod ? '_lod' : ''}`, `assets/humans/rb/${key}${lod ? '_lod' : ''}.glb`);
      for (const part of av.parts) {
        const stem = `${av.prefix}_${part}`;
        this.assets.texture(`rbt:${tier}/${stem}_color`, `assets/humans/rb/tex/${tier}/${stem}_color.webp`, true);
        if (part !== 'opacity') this.assets.texture(`rbt:512/${stem}_normal`, `assets/humans/rb/tex/512/${stem}_normal.webp`, false);
      }
    }
    app.start();
    await this.assets.loadAll((p, label) => this.hud.setLoading(0.05 + p * 0.85, `Loading ${label}…`));
    if (this.assets.failedKeys.length) console.warn('Failed assets:', this.assets.failedKeys);

    this.hud.setLoading(0.92, 'Building Harbor Street…');
    await new Promise((r) => setTimeout(r, 20));
    this.setupEnvironment();
    this.buildWorld();
    this.hud.setLoading(1, 'Ready');

    app.on('update', (dt: number) => this.update(dt));
    // Test hook: ?norender=1 runs logic/animation without drawing (fast CI on CPU rendering).
    // window.__renderOnce() draws the next frame (for screenshots).
    if (new URLSearchParams(location.search).get('norender') === '1') {
      app.autoRender = false;
      (window as any).__renderOnce = () => { app.renderNextFrame = true; };
    }
    this.hud.onQuality = (lvl) => { saveQuality(lvl); location.reload(); };
    this.hud.onSensitivity = (v) => { this.lookSens = v; try { localStorage.setItem('casefiles.sens', String(v)); } catch { /* */ } };
    const failed = this.assets.failedKeys;
    if (failed.length) this.hud.loadError(`Some assets failed to load: ${failed.join(', ')}`);
    this.hud.ready(() => { this.started = true; this.input.gameStarted = true; this.combat.sfx.unlock(); app.resizeCanvas(); });
    (window as any).__game = this;
  }

  private setupScene() {
    const app = this.app;
    app.scene.ambientLight = new pc.Color(0.28, 0.3, 0.34);
    app.scene.fog.type = pc.FOG_LINEAR;
    app.scene.fog.color = new pc.Color(0.78, 0.74, 0.68);
    app.scene.fog.start = 70;
    app.scene.fog.end = this.q.drawDistance + 60;
    app.scene.skyboxIntensity = 1.0;

    this.cameraEntity = new pc.Entity('camera');
    this.cameraEntity.addComponent('camera', {
      clearColor: new pc.Color(0.62, 0.68, 0.76),
      fov: 58,
      nearClip: 0.12,
      farClip: this.q.drawDistance + 80,
      toneMapping: pc.TONEMAP_ACES,
      gammaCorrection: pc.GAMMA_SRGB,
    });
    app.root.addChild(this.cameraEntity);
    this.cam = new FollowCamera(this.cameraEntity, this.world);

    // Late-afternoon sun (warm, low, from the south-west so the street gets long shadows)
    this.sun = new pc.Entity('sun');
    this.sun.addComponent('light', {
      type: 'directional',
      color: new pc.Color(1, 0.86, 0.68),
      intensity: 2.6,
      castShadows: this.q.shadows,
      shadowType: pc.SHADOW_PCF3_32F,
      shadowResolution: this.q.shadowResolution,
      shadowDistance: this.q.shadowDistance,
      numCascades: this.q.cascades,
      cascadeDistribution: 0.6,
      shadowBias: 0.25,
      normalOffsetBias: 0.06,
    });
    this.sun.setEulerAngles(42, 215, 0);
    app.root.addChild(this.sun);

    // High preset: post-processing (SSAO, bloom, MSAA, grading, vignette)
    if (this.q.level === 'high') {
      try {
        const cf = new pc.CameraFrame(app, this.cameraEntity.camera!);
        cf.rendering.samples = 4;
        cf.rendering.toneMapping = pc.TONEMAP_ACES;
        cf.ssao.type = 'lighting';
        cf.ssao.intensity = 0.55;
        cf.ssao.radius = 0.9;
        cf.ssao.blurEnabled = true;
        cf.bloom.intensity = 0.012;
        cf.bloom.blurLevel = 14;
        cf.grading.enabled = true;
        cf.grading.contrast = 1.06;
        cf.grading.saturation = 1.04;
        cf.vignette.intensity = 0.28;
        cf.vignette.inner = 0.55;
        cf.vignette.outer = 1.1;
        cf.update();
        this.cameraFrame = cf;
      } catch (e) { console.warn('Post-processing unavailable', e); }
    }
  }

  private setupEnvironment() {
    const app = this.app;
    const hdr = this.assets.tex('sky');
    if (!hdr) { console.warn('HDRI missing; using flat ambient'); return; }
    try {
      const sky = pc.EnvLighting.generateSkyboxCubemap(hdr, this.q.level === 'high' ? 512 : 256);
      const lighting = pc.EnvLighting.generateLightingSource(hdr);
      const atlas = pc.EnvLighting.generateAtlas(lighting);
      lighting.destroy();
      app.scene.envAtlas = atlas;
      app.scene.skybox = sky;
      app.scene.skyboxIntensity = 0.75;
      app.scene.ambientLight = new pc.Color(0, 0, 0);
    } catch (e) {
      console.warn('Environment generation failed', e);
    }
  }

  // ------------------------------------------------------------------
  private buildWorld() {
    const app = this.app;
    const root = new pc.Entity('world');
    app.root.addChild(root);
    const mats = new Materials(this.assets, this.q);
    this.refs = buildNeighborhood(app, root, this.world, mats, this.assets, this.q);
    const A = this.refs.anchors;

    this.anims = new AnimLibrary(this.assets);
    const human = (look: HumanLook, name: string) => new Humanoid(this.assets, this.anims, look, name,
      { lod: this.q.level === 'low', texTier: this.q.level === 'high' ? '1024' : '512' });
    // ---- Player ----
    const pc0 = human({ body: 'm', outfit: 'detective', avatar: 'Business_Male_03' }, 'detective');
    root.addChild(pc0.entity);
    this.player = new Player(pc0, this.world);
    this.player.place(A.stationSpawn.x, A.stationSpawn.z, 180);
    this.cam.yaw = 360; // look toward the station (+Z)
    this.cam.snapTo(this.player.pos);

    // ---- Cars ----
    this.car = new Car(this.assets, this.world, 'police-car', 'cruiser');
    root.addChild(this.car.entity);
    this.car.place(A.policeCar.x, A.policeCar.z, 0);
    const parkedDefs: [string, number, number, number][] = [
      ['sedan', 12, 3.6, 90], ['taxi', 33, -3.6, -90], ['hatchback', -14, -3.6, -90], ['suv', -30, 3.6, 90],
      ['van', 56, -3.6, -90], ['sedan', 44.6, 24, 180], ['hatchback', 51.4, 24, 0],
    ];
    for (const [m, x, z, h] of parkedDefs) {
      const c = new Car(this.assets, this.world, m, `parked-${m}`);
      root.addChild(c.entity);
      c.place(x, z, h);
      this.parked.push(c);
      // parked cars are solid (cover, bullets, pedestrians)
      const along = Math.abs(Math.sin(h * pc.math.DEG_TO_RAD)) > 0.5;
      this.world.addBox(x, 0.95, z, along ? 4.4 : 2.1, 1.9, along ? 2.1 : 4.4, 'car');
    }

    // ---- NPCs ----
    const defs: NpcDef[] = [
      { id: 'okafor', name: 'Sgt. Dana Okafor', role: 'Desk sergeant', look: { body: 'f', outfit: 'okafor', avatar: 'Security_Female_01' }, home: [A.sergeant.x, A.sergeant.z, 180], stationary: true, kind: 'staff' },
      { id: 'rosa', name: 'Rosa Alvarez', role: 'Café owner', look: { body: 'f', outfit: 'rosa', avatar: 'Female_Adult_04' }, home: [A.rosa.x, A.rosa.z, 0], stationary: true, kind: 'staff' },
      { id: 'nina', name: 'Nina Park', role: 'Bank teller', look: { body: 'f', outfit: 'nina', avatar: 'Business_Female_01' }, home: [A.nina.x, A.nina.z, 0], stationary: true, kind: 'staff' },
      { id: 'dale', name: 'Dale Mercer', role: 'Bus stop regular', look: { body: 'm', outfit: 'dale', avatar: 'Male_Adult_06' }, home: [A.busStop.x + 0.8, A.busStop.z + 0.6, 0], route: [[-22, -7.3], [-17, -7.4], [-19.5, -6.6]], kind: 'civilian' },
      { id: 'victor', name: 'Victor Lane', role: 'Can collector', look: { body: 'm', outfit: 'victor', avatar: 'Male_Adult_03' }, home: [A.parkBench.x, A.parkBench.z + 0.9, 180], route: [[-26, -23], [-26, -16], [-30, -14], [-22, -14], [-26, -20]], kind: 'civilian' },
      { id: 'civ1', name: 'Marisol Reyes', role: 'Resident', look: { body: 'f', outfit: 'civ_f1', avatar: 'Female_Adult_01' }, home: [-40, -7, 90], route: [[-40, -7], [-12, -7], [-7, -20], [-7, -7], [-40, -7.2]], kind: 'civilian' },
      { id: 'civ2', name: 'June Hollis', role: 'Resident', look: { body: 'f', outfit: 'civ_f2', avatar: 'Female_Adult_08' }, home: [40, 7, -90], route: [[58, 7.2], [12, 7.2], [7, 20], [7, 7], [58, 7]], kind: 'civilian' },
      { id: 'civ3', name: 'Marcus Hale', role: 'Resident', look: { body: 'm', outfit: 'civ_m1', avatar: 'Male_Adult_08' }, home: [60, -7, -90], route: [[64, -7.1], [31, -7.1], [10, -7.1], [31, -7]], kind: 'civilian' },
      { id: 'civ4', name: 'Leon Brandt', role: 'Resident', look: { body: 'm', outfit: 'civ', avatar: 'Business_Male_01' }, home: [-50, 7, 90], route: [[-50, 7.2], [-12, 7.2], [-7, 24], [-7, 8], [-50, 7]], kind: 'civilian' },
      { id: 'civ5', name: 'Grace Whitlock', role: 'Resident', look: { body: 'f', outfit: 'civ', avatar: 'Female_Adult_11' }, home: [8, -30, 0], route: [[7.2, -30], [7.2, -8], [40, -7.2], [7.2, -7.4], [7.2, -30]], kind: 'civilian' },
      { id: 'civ6', name: 'Owen Price', role: 'Resident', look: { body: 'm', outfit: 'civ', avatar: 'Business_Male_04' }, home: [66, 7.2, -90], route: [[66, 7.2], [40, 7.3], [12, 7.2], [40, 7.1]], kind: 'civilian' },
      { id: 'officer1', name: 'Ofc. Sam Delgado', role: 'Patrol officer', look: { body: 'm', outfit: 'officer', avatar: 'Police_Male_01' }, home: [27.5, 6.2, 200], stationary: true, kind: 'staff' },
      ...ENCOUNTER_NPCS,
    ];
    for (const d of defs) {
      const ch = human(d.look, d.id);
      root.addChild(ch.entity);
      const n = new Npc(d, ch, this.world);
      n.teleport(d.home[0], d.home[1], d.home[2]);
      this.npcs.push(n);
    }

    this.combat = new CombatDirector(this);
    this.combat.init(root);
    this.hud.standingHtml = () => {
      const st = this.combat.standing.summary();
      const inc = this.combat.standing.incidents.slice(-6).reverse().map((i) => `<div class="task">${i.label}${i.witnessed ? ' · witnessed' : ''}${i.subject ? ` — ${i.subject}` : ''}</div>`).join('');
      return `<div class="stand"><div><b>${st.trust}</b>Public trust</div><div><b>${st.prof}</b>Professional</div><div><b>${st.ia}</b>IA attention</div><div><b>${st.morality}</b>Morality</div><div><b>${st.influence}</b>Criminal ties</div></div>${inc}${this.combat.standing.suspended ? '<div class="task" style="color:var(--red)">SUSPENDED — firearm confiscated</div>' : ''}`;
    };
    this.registerInteractions();
    this.debug = { anchors: A };
  }

  npc(id: string) { return this.npcs.find((n) => n.id === id)!; }

  private caseCtx(): CaseCtx {
    return {
      state: this.state,
      toast: (m) => this.hud.toast(m),
      addEvidence: (id) => this.collect(id),
      startArrest: (id) => this.confirmArrest(id),
      isCuffed: (id) => this.prisoner?.id === id,
      hasPrisoner: () => !!this.prisoner,
      revealBag: () => { /* bag location now known; it can also be found without the confession */ },
    };
  }

  private collect(id: EvidenceId) {
    if (this.state.add(id)) this.hud.toast(`${EVIDENCE[id].icon}  Added to notebook: ${EVIDENCE[id].name}`);
  }

  // ------------------------------------------------------------------
  private registerInteractions() {
    const A = this.refs.anchors;
    const s = this.state;
    const I = this.interactables;

    // Talk to NPCs (dynamic position)
    for (const n of this.npcs) {
      I.push({
        id: `talk:${n.id}`, pos: n.pos, radius: 2.4, priority: 2,
        label: () => {
          if (n.state === 'jailed' || n.state === 'inCar' || !n.alive || n.state === 'down' || n.state === 'combat' || n.state === 'surrender') return null;
          if (this.prisoner === n) return null;
          if (n.hostile) return null;
          return `Talk to ${n.name.split(' ')[0] === 'Sgt.' ? 'Okafor' : n.name.split(' ')[0]}`;
        },
        act: () => this.talk(n),
      });
    }

    // Booking
    I.push({
      id: 'booking', pos: A.booking, radius: 2.6, priority: 5,
      label: () => (this.prisoner && this.prisoner.pos.distance(A.booking) < 6 ? `Book ${this.prisoner.name.split(' ')[0]}` : null),
      act: () => this.book(),
    });

    // Evidence at the scene
    const evidenceSpot = (id: EvidenceId, title: string, text: string) => {
      I.push({
        id: `ev:${id}`, pos: A[id], radius: 1.5, priority: 3,
        label: () => (s.has(id) ? null : 'Examine'),
        act: () => this.hud.showExamine(title, text, 'Bag as evidence', () => {
          this.collect(id);
          const e = this.refs.evidenceEntities[id];
          if (e) e.enabled = false;
        }),
      });
    };
    evidenceSpot('slip', 'Deposit slip', 'A bank deposit slip, half-trampled. "CAFÉ LUNA — $3,200.00." It was in the stolen bag — the bag was opened or torn right here.');
    evidenceSpot('cigpack', 'Cigarette pack', 'Red Harbor menthols, half-empty. Dry, despite the puddles — dropped within the hour. Rosa mentioned smelling smoke.');
    evidenceSpot('lighter', 'Brass lighter', 'A brass flip lighter wedged by the cardboard boxes. Engraved on the side: "D.M." Still smells of fuel.');

    // Bank footage
    I.push({
      id: 'footage', pos: A.footage, radius: 1.6, priority: 3,
      label: () => (s.has('footage') ? null : s.flag('footageAllowed') ? 'Review footage' : 'Examine monitor'),
      act: () => {
        if (!s.flag('footageAllowed')) {
          this.hud.showExamine('Security monitor', 'A login screen. "FIRST CIVIC — AUTHORIZED STAFF." You\'ll need the teller\'s permission.', null, () => {});
          return;
        }
        this.hud.showExamine('Alley camera — today', '5:20 PM — a man in a grey T-shirt carries a bag of cans out of the alley toward the park.<br><br>5:38 PM — Rosa exits the café side door with the deposit bag.<br>5:41 PM — a man in a <b>red T-shirt</b>, lighting a cigarette, steps from behind the dumpster, shoves her, grabs the bag and sprints west toward Main St. Face not visible.', 'Copy footage', () => this.collect('footage'));
      },
    });

    // Park trash can (stolen bag)
    I.push({
      id: 'trash', pos: A.parkTrash, radius: 1.5, priority: 3,
      label: () => (s.has('bag') ? null : 'Search trash can'),
      act: () => {
        this.hud.showExamine('Trash can', 'Under coffee cups and a newspaper: a blue canvas bank bag, zipper torn. "CAFÉ LUNA" is stencilled on the side.', 'Take the bag', () => this.collect('bag'));
      },
    });

    // Case board / desk
    I.push({ id: 'board', pos: A.caseBoard, radius: 1.8, priority: 1, label: () => 'Case board', act: () => this.hud.openNotebook(s, this.objective()) });

    // Combat interactions on suspects: takedown, cuff the surrendered/downed, check the dead
    for (const n of this.npcs) {
      I.push({
        id: `restrain:${n.id}`, pos: n.pos, radius: 1.9, priority: 6,
        label: () => {
          if (this.prisoner || n.state === 'cuffed' || n.state === 'jailed' || n.state === 'inCar') return null;
          if (!n.alive) return null;
          if ((n.state === 'surrender' || n.state === 'down') && (n.hostile || n.state === 'down')) return 'Handcuff';
          if (this.combat.canTakedown(n)) return 'Takedown';
          return null;
        },
        act: () => {
          if (n.state === 'surrender' || n.state === 'down') this.cuff(n);
          else this.combat.takedown(n);
        },
      });
    }
    I.push({
      id: 'order', pos: new pc.Vec3(), radius: 99, priority: 3,
      label: () => (this.combat.canOrder() ? 'Order surrender' : null),
      act: () => this.combat.orderSurrender(),
    });
    I.push({
      id: 'seize', pos: new pc.Vec3(), radius: 99, priority: 4,
      label: () => this.combat.pickupNear(this.player.x, this.player.z)?.label ?? null,
      act: () => this.combat.pickupNear(this.player.x, this.player.z)?.act(),
    });
    I.push({
      id: 'trunk', pos: new pc.Vec3(), radius: 1.6, priority: 1,
      label: () => (this.combat.player.owned.includes('rifle') || this.combat.player.disabledFirearms ? null : 'Take rifle from trunk'),
      act: () => { this.combat.player.giveWeapon('rifle'); this.combat.player.equip('rifle'); this.hud.toast('Took the bolt-action rifle from the cruiser trunk'); },
    });

    // Closed businesses — honest feedback
    for (const [k, name] of [['hardwareDoor', 'Marlowe Hardware'], ['laundryDoor', 'Suds Laundromat'], ['flatsDoor', 'Harbor Flats'], ['pearlDoor', 'Pearl Apartments']] as const) {
      I.push({ id: k, pos: A[k], radius: 1.6, priority: 0, label: () => 'Door', act: () => this.hud.toast(`${name} — closed in this build`) });
    }
  }

  private objective() {
    return currentObjective(this.state, { prisonerName: this.prisoner?.name ?? null });
  }

  private talk(n: Npc) {
    const prev = n.state;
    n.setState('talking');
    this.hud.showDialogue(dialogueFor(n.id, n.name, this.caseCtx()), () => {
      if (n.state === 'talking') n.setState(prev === 'talking' ? (n.def.stationary ? 'idle' : 'wander') : prev);
    });
  }

  private confirmArrest(id: string) {
    const n = this.npc(id);
    setTimeout(() => {
      this.hud.showConfirm(`Arrest ${n.name}?`, 'You\'ll need to book them at Precinct 9. Sgt. Okafor will review your evidence — a wrongful arrest hurts your reputation and the people of Harbor Street will remember it.', 'Handcuff', () => this.cuff(n));
    }, 30);
  }

  private cuff(n: Npc) {
    if (n.state === 'down') n.character.getUp();
    n.character.pose = 'normal';
    this.prisoner = n;
    n.setState('cuffed');
    n.character.pose = 'cuffed';
    n.followTarget = () => this.driving ? this.car.entity.getPosition() : this.player.pos;
    this.hud.toast(`🔗  ${n.name} is in handcuffs`);
    // bystanders react
    for (const o of this.npcs) {
      if (o === n || o.def.stationary) continue;
      if (o.pos.distance(n.pos) < 18 && (o.state === 'wander' || o.state === 'idle')) { o.lookAt = n.pos; o.setState('watch'); }
    }
  }

  private book() {
    const n = this.prisoner;
    if (!n) return;
    const s = this.state;
    const r: BookingResult = n.hostile
      ? { outcome: 'charged', title: 'Charged: Armed robbery & weapons offences', rep: 2, jail: true,
          text: `${n.name} is booked. ${n.def.armed ? 'Possession of a firearm and the dealer\'s stolen goods make this an easy charge.' : 'Charged as an accessory — he was the lookout.'}` }
      : evaluateBooking(n.id, n.name, s);
    if (n.hostile) this.combat.incident('nonlethal_arrest', n.pos, n);
    else if (r.outcome === 'charged') this.combat.incident('good_arrest', n.pos, n);
    else if (r.outcome === 'wrongful' || r.outcome === 'noGrounds') this.combat.incident('wrongful_arrest', n.pos, n);
    s.reputation = Math.max(-10, Math.min(10, s.reputation + r.rep));
    s.arrests.push({ npcId: n.name, outcome: r.outcome, at: Date.now() });
    this.prisoner = null;
    n.followTarget = null;
    n.character.pose = r.jail ? 'cuffed' : 'normal';
    if (r.jail) {
      s.jailed.add(n.id);
      n.teleport(this.refs.anchors.cellInside.x, this.refs.anchors.cellInside.z, 180);
      n.setState('jailed');
      n.character.pose = 'normal';
    } else {
      if (r.outcome === 'wrongful' || r.outcome === 'noGrounds') s.hostile.add(n.id);
      n.teleport(this.refs.anchors.stationDoor.x + 1, this.refs.anchors.stationDoor.z - 1.5);
      n.goTo(n.def.home[0], n.def.home[1]);
    }
    if (n.id === 'dale' && (r.outcome === 'charged' || r.outcome === 'weak')) s.set('caseClosed');
    const stamp = r.outcome === 'charged' ? 'CHARGED' : r.outcome === 'weak' ? 'WEAK CASE' : r.outcome === 'released' ? 'RELEASED' : r.outcome === 'wrongful' ? 'WRONGFUL ARREST' : 'NO GROUNDS';
    const kind = r.outcome === 'charged' ? '' : r.outcome === 'weak' ? 'warn' : 'bad';
    const evList = [...s.evidence].map((e) => `• ${EVIDENCE[e].name}`).join('<br>') || '• none';
    this.hud.showReport(stamp, kind, r.title, `${r.text}<br><br><b>Evidence on file</b><br>${evList}<br><br>Reputation ${r.rep >= 0 ? '+' : ''}${r.rep} → ${s.reputation}`);
  }

  // ------------------------------------------------------------------
  private enterCar() {
    this.driving = true;
    this.player.character.visible = false;
    this.combat.player.aiming = false;
    this.cam.setFraming(7.5, 1.9);
    if (this.prisoner && this.prisoner.pos.distance(this.car.entity.getPosition()) < 8) {
      this.prisoner.setState('inCar');
      this.prisoner.character.visible = false;
      this.hud.toast(`${this.prisoner.name.split(' ')[0]} is in the back seat`);
    }
  }

  private exitCar() {
    if (Math.abs(this.car.speed) > 3) { this.hud.toast('Slow down before getting out'); return; }
    this.driving = false;
    this.car.speed = 0;
    const [ex, ez] = this.car.exitPoint();
    this.player.place(ex, ez, this.car.heading);
    this.player.character.visible = true;
    this.cam.setFraming(4.2, 1.55);
    this.cam.autoYaw = null;
    if (this.prisoner && this.prisoner.state === 'inCar') {
      const r = this.car.heading * pc.math.DEG_TO_RAD;
      this.prisoner.teleport(ex - Math.sin(r) * 1.2, ez - Math.cos(r) * 1.2);
      this.prisoner.character.visible = true;
      this.prisoner.setState('cuffed');
    }
  }

  // ------------------------------------------------------------------
  private update(dt: number) {
    this.trackPerf(dt);
    dt = Math.min(dt, 1 / 15);
    this.time += dt;
    if (!this.refs) return;
    const inp = this.input;
    inp.poll();
    const look = inp.consumeLook();
    const modal = this.hud.modalOpen || !this.started;

    // Menu / notebook toggles
    if (inp.pressed('menu')) {
      if (this.hud.menuOpen) this.hud.closeMenu();
      else if (this.hud.notebookOpen) this.hud.closeNotebook();
      else if (!this.hud.modalOpen) this.hud.openMenu(this.q.level, this.buildInfo(), this.lookSens);
    }
    if (inp.pressed('notebook')) {
      if (this.hud.notebookOpen) this.hud.closeNotebook();
      else if (!this.hud.modalOpen) this.hud.openNotebook(this.state, this.objective());
    }
    if (inp.pressed('diag')) { this.hud.diagOn = !this.hud.diagOn; }

    const assist = this.combat.player.assistFactor(inp.touchMode);
    if (!modal) this.cam.applyLook(look.x * this.lookSens * assist, look.y * this.lookSens * assist);
    const mx = modal ? 0 : inp.move.x, my = modal ? 0 : inp.move.y;
    const pcmb = this.combat.player;
    pcmb.update(dt, { modal, driving: this.driving, moveSpeed: Math.hypot(this.player.vx, this.player.vz) });
    pcmb.applyAimPull(dt, inp.touchMode, this.npcs.filter((n) => n.hostile));
    this.player.lockYaw = !this.driving && (pcmb.aiming || pcmb.blocking) ? this.cam.yaw + 180 : null;
    this.player.speedScale = pcmb.aiming ? 0.55 : pcmb.blocking ? 0.5 : 1;
    this.player.canSprint = !pcmb.aiming && !pcmb.blocking;

    // ---- Driving / walking ----
    if (this.driving) {
      this.car.update(dt, my, mx, !modal && inp.brake, true);
      if (inp.pressed('siren') && !modal) { this.car.sirenOn = !this.car.sirenOn; this.hud.toast(this.car.sirenOn ? 'Siren on' : 'Siren off', 1200); }
      if (this.car.impact > 6) this.shake = Math.min(0.5, this.car.impact / 30);
      this.cam.autoYaw = this.car.speed < -0.5 ? this.cam.yaw : this.car.heading + 180;
      this.player.x = this.car.x; this.player.z = this.car.z;
      if (inp.pressed('vehicle') && !modal) this.exitCar();
    } else {
      this.car.update(dt, 0, 0, true, false);
      this.player.update(dt, mx, my, inp.sprint, this.cam);
      this.pushOutOfCars(this.player);
      if (inp.pressed('vehicle') && !modal && this.car.distanceTo(this.player.x, this.player.z) < 1.6) this.enterCar();
    }

    // ---- NPCs ----
    const ppos = this.driving ? this.car.entity.getPosition() : this.player.pos;
    this.recklessCooldown -= dt;
    for (const n of this.npcs) {
      n.update(dt, ppos);
      if (n.state === 'inCar' || n.state === 'jailed') continue;
      // Cars push pedestrians; a fast car makes them dodge
      if (this.driving && Math.abs(this.car.speed) > 3) {
        const d = this.car.distanceTo(n.x, n.z);
        if (d < 4.5) n.flee(this.car.entity.getPosition());
        if (d < 0.35 && Math.abs(this.car.speed) > 6 && this.recklessCooldown <= 0 && n !== this.prisoner) {
          this.recklessCooldown = 4;
          this.combat.incident('reckless_driving', n.pos, n);
        }
      }
      if (!this.driving && n.alive && n.state !== 'down' && Math.hypot(n.x - this.player.x, n.z - this.player.z) < 0.6 && n !== this.prisoner) {
        // simple separation from the player
        const dx = n.x - this.player.x, dz = n.z - this.player.z, d = Math.max(0.01, Math.hypot(dx, dz));
        n.teleport(this.player.x + (dx / d) * 0.6, this.player.z + (dz / d) * 0.6);
      }
    }
    // keep the talk interactables tracking NPC positions
    for (const it of this.interactables) {
      if (it.id.startsWith('talk:')) { const n = this.npc(it.id.slice(5)); it.pos.set(n.x, n.y, n.z); }
      else if (it.id.startsWith('restrain:')) { const n = this.npc(it.id.slice(9)); it.pos.set(n.x, n.y, n.z); }
      else if (it.id === 'seize' || it.id === 'order') it.pos.set(this.player.x, this.player.y, this.player.z);
      else if (it.id === 'trunk') { const r = this.car.heading * pc.math.DEG_TO_RAD; it.pos.set(this.car.x - Math.sin(r) * 2.6, this.player.y, this.car.z - Math.cos(r) * 2.6); }
    }

    // ---- Doors ----
    for (const door of this.refs.doors) {
      let near = Infinity;
      const dx = door.slot.x, dz = door.slot.z;
      if (!this.driving) near = Math.hypot(this.player.x - dx, this.player.z - dz);
      for (const n of this.npcs) if (n.state !== 'inCar' && n.state !== 'jailed') near = Math.min(near, Math.hypot(n.x - dx, n.z - dz));
      door.update(dt, near);
    }

    // ---- Interaction prompt ----
    let best: Interactable | null = null, bestScore = Infinity;
    if (!this.driving && !modal) {
      for (const it of this.interactables) {
        const d = Math.hypot(it.pos.x - this.player.x, it.pos.z - this.player.z);
        if (d > it.radius || Math.abs(it.pos.y - this.player.y) > 1.5) continue;
        if (!it.label()) continue;
        const score = d - (it.priority ?? 0) * 0.5;
        if (score < bestScore) { bestScore = score; best = it; }
      }
    }
    this.hud.setPrompt(best ? best.label() : null);
    if (inp.pressed('interact') && best && !modal) {
      if (best.id.startsWith('talk:')) {
        const n = this.npc(best.id.slice(5));
        this.player.character.yaw = yawTowards(this.player.x, this.player.z, n.x, n.z);
      }
      best.act();
    }
    const nearCar = !this.driving && this.car.distanceTo(this.player.x, this.player.z) < 1.6;
    this.hud.setVehicleButton(this.driving ? 'exit' : nearCar ? 'enter' : null);
    if (nearCar && !best && !this.input.touchMode) this.hud.setPrompt('Drive cruiser', 'F');
    this.hud.setObjective(this.objective());

    // ---- Combat systems + post-animation overrides ----
    this.combat.update(dt);
    this.player.character.postAnimate();
    for (const n of this.npcs) if (n.state !== 'inCar') n.character.postAnimate();
    this.combat.postAnimate();
    const w = WEAPONS[pcmb.equipped];
    const ws = (pcmb as any).ws;
    const spreadPx = pcmb.armed ? Math.tan(pcmb.currentSpread(Math.hypot(this.player.vx, this.player.vz)) * pc.math.DEG_TO_RAD) / Math.tan((this.cameraEntity.camera!.fov / 2) * pc.math.DEG_TO_RAD) * (this.app.graphicsDevice.height / this.dynRatio) * 0.5 : 0;
    this.hud.setCombat({
      show: !this.driving && this.started, armed: pcmb.armed, aiming: pcmb.aiming, blocking: pcmb.blocking,
      weaponName: pcmb.disabledFirearms ? 'Fists (firearm confiscated)' : w.name, mag: ws.mag, reserve: ws.reserve, magSize: w.magSize,
      reloading: pcmb.reloading, spreadPx: Math.min(60, spreadPx), hp: (pcmb.hp / pcmb.maxHp) * 100, stamina: pcmb.stamina,
      hit: pcmb.hitMarker > 0, onTarget: !!pcmb.aimTarget && pcmb.aimTarget.id !== 'player', hurt: this.combat.hurtAmount,
      crosshair: !this.driving && this.started && !modal && (pcmb.armed || pcmb.blocking),
    });

    // ---- Camera ----
    const target = this.driving ? this.car.entity.getPosition() : this.player.pos;
    this.cam.update(dt, target);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt);
      const p = this.cameraEntity.getPosition();
      this.cameraEntity.setPosition(p.x + (Math.random() - 0.5) * this.shake, p.y + (Math.random() - 0.5) * this.shake, p.z);
    }
    // Shadows follow the camera focus
    inp.clearEdges();
  }

  private pushOutOfCars(p: Player) {
    for (const c of [this.car, ...this.parked]) {
      const d = c.distanceTo(p.x, p.z);
      if (d < p.radius) {
        const cp = c.entity.getPosition();
        const dx = p.x - cp.x, dz = p.z - cp.z, l = Math.max(0.01, Math.hypot(dx, dz));
        p.x += (dx / l) * (p.radius - d); p.z += (dz / l) * (p.radius - d);
        p.character.setPosition(p.x, p.y, p.z);
      }
    }
  }

  private trackPerf(dt: number) {
    const fps = 1 / Math.max(dt, 1e-4);
    this.fpsAvg += (fps - this.fpsAvg) * 0.05;
    this.frameMsAvg += (dt * 1000 - this.frameMsAvg) * 0.05;
    // Dynamic resolution keeps phones near 30+ FPS
    if (this.q.dynamicResolution && this.started) {
      this.dynTimer += dt;
      if (this.dynTimer > 2) {
        this.dynTimer = 0;
        const max = Math.min(window.devicePixelRatio || 1, this.q.maxPixelRatio);
        let r = this.dynRatio;
        if (this.fpsAvg < 29 && r > this.q.minPixelRatio) r = Math.max(this.q.minPixelRatio, r - 0.15);
        else if (this.fpsAvg > 52 && r < max) r = Math.min(max, r + 0.1);
        if (r !== this.dynRatio) { this.dynRatio = r; this.app.graphicsDevice.maxPixelRatio = r; this.app.resizeCanvas(); }
      }
    }
    // rolling 5 s window for average + worst-1% frames, plus whole-session average
    if (this.started) {
      this.frameTimes.push(dt);
      let sum = 0; for (const f of this.frameTimes) sum += f;
      while (sum > 5 && this.frameTimes.length > 1) sum -= this.frameTimes.shift()!;
      this.sessionFrames++; this.sessionTime += dt;
    }
    const sorted = [...this.frameTimes].sort((a, b) => b - a);
    const worst = sorted.slice(0, Math.max(1, Math.floor(sorted.length * 0.01)));
    const low1 = worst.length ? 1 / (worst.reduce((a, b) => a + b, 0) / worst.length) : 0;
    const avg5 = this.frameTimes.length ? this.frameTimes.length / this.frameTimes.reduce((a, b) => a + b, 0) : 0;
    const sessAvg = this.sessionTime > 0 ? this.sessionFrames / this.sessionTime : 0;
    const stats = (this.app as any).stats;
    const dc = stats?.drawCalls?.total ?? 0;
    const shadowMs = stats?.frame?.shadowMapTime ?? 0;
    const dev = this.app.graphicsDevice;
    this.hud.setDiag(
      `FPS now ${this.fpsAvg.toFixed(0)}  (${this.frameMsAvg.toFixed(1)} ms)\n` +
      `5s avg ${avg5.toFixed(0)}  1% low ${low1.toFixed(0)}  session ${sessAvg.toFixed(0)}\n` +
      `draws ${dc}  shadow ${shadowMs.toFixed(1)} ms\n` +
      `res ${dev.width}×${dev.height} @${this.dynRatio.toFixed(2)}x\n` +
      `quality ${this.q.level}${this.q.dynamicResolution ? ' +dyn' : ''}  ${this.driving ? `${this.car.kmh.toFixed(0)} km/h` : ''}\n` +
      `${BUILD_ID}`,
      this.fpsAvg < 27,
    );
    this.debug.fps = this.fpsAvg;
  }

  private buildInfo() {
    const dev = this.app.graphicsDevice as any;
    return `${BUILD_ID} · ${dev.isWebGL2 ? 'WebGL 2' : dev.deviceType ?? 'unknown'} · ${dev.width}×${dev.height}`;
  }
}
