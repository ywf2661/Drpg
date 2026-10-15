// three.js 렌더링. sim 상태를 읽기만 하고 수정하지 않는다.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { STATS, type Entity, type Kind, type World } from '../sim/world';

const SCALE = 0.7; // KayKit 캐릭터 키 약 2.3 → 약 1.6m
const FADE = 0.15;
const HIT_SHOW = 0.3; // 피격 모션을 보여줄 시간(초)
const ATTACK = '1H_Melee_Attack_Chop';
const ONCE = new Set(['Death_A', 'Hit_A']);

const MODELS: Record<Kind, { url: string; move: string; hide?: string[]; weapon?: string }> = {
  // Knight GLB에는 무기·방패가 전부 붙어 있어서 한손검 + 둥근 방패만 남긴다
  hero: { url: 'models/Knight.glb', move: 'Running_A', hide: ['1H_Sword_Offhand', 'Badge_Shield', 'Rectangle_Shield', 'Spike_Shield', '2H_Sword'] },
  // 스켈레톤 GLB에는 무기가 없어서 오른손 슬롯에 붙인다
  minion: { url: 'models/Skeleton_Minion.glb', move: 'Walking_D_Skeletons', weapon: 'models/Skeleton_Blade.gltf' },
  warrior: { url: 'models/Skeleton_Warrior.glb', move: 'Walking_D_Skeletons', weapon: 'models/Skeleton_Axe.gltf' },
};

type Actor = { obj: THREE.Object3D; mixer: THREE.AnimationMixer; clips: THREE.AnimationClip[]; clip: string; hp: number; hitT: number };

export const renderer = new THREE.WebGLRenderer({ antialias: true });
export const camera = new THREE.OrthographicCamera();
const scene = new THREE.Scene();
const sun = new THREE.DirectionalLight(0xfff1dd, 2.5);
const loader = new GLTFLoader();
const protos = new Map<Kind, { scene: THREE.Object3D; clips: THREE.AnimationClip[] }>();
const focus = new THREE.Vector3();
const tmp = new THREE.Vector3();
// 수평 45°, 내려다보는 각 40°(극각 50°), 거리 30
const CAM_OFFSET = new THREE.Vector3().setFromSphericalCoords(30, THREE.MathUtils.degToRad(50), THREE.MathUtils.degToRad(45));
const SUN_OFFSET = new THREE.Vector3(-8, 15, 6);
let actors: Actor[] = [];
let zoom = 9; // 화면 세로 절반에 보이는 월드 길이(m)

export async function initRender(world: World) {
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  document.body.prepend(renderer.domElement);
  scene.background = new THREE.Color(0x0b0a09);
  scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x2a2018, 1.2));
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 50 });
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun, sun.target);
  buildMap(world);
  addEventListener('resize', resize);
  renderer.domElement.addEventListener(
    'wheel',
    (e) => {
      zoom = THREE.MathUtils.clamp(zoom * (e.deltaY > 0 ? 1.1 : 0.9), 5, 16);
      resize();
    },
    { passive: true },
  );
  resize();
  await Promise.all((Object.keys(MODELS) as Kind[]).map(loadKind));
  setWorld(world);
}

export function setWorld(world: World) {
  for (const a of actors) {
    a.mixer.stopAllAction();
    a.obj.removeFromParent();
  }
  actors = world.entities.map(makeActor);
  focus.set(world.entities[0].x, 0, world.entities[0].z);
}

export function draw(world: World, dt: number) {
  for (const e of world.entities) {
    const a = actors[e.id];
    a.obj.position.set(e.x, 0, e.z);
    a.obj.rotation.y = e.facing; // 모델은 +z를 바라본다
    if (e.hp < a.hp && e.state !== 'attack') a.hitT = HIT_SHOW;
    a.hp = e.hp;
    a.hitT -= dt;
    play(a, clipFor(e, a));
    if (e.state === 'attack') {
      // 공격 모션 진행을 sim의 휘두르기 진행도에 맞춘다
      const act = action(a, ATTACK);
      act.timeScale = 0;
      act.time = Math.min(e.attackT / STATS[e.kind].interval, 1) * act.getClip().duration;
    }
    a.mixer.update(dt);
  }
  const hero = world.entities[0];
  focus.lerp(tmp.set(hero.x, 0, hero.z), 1 - Math.exp(-8 * dt));
  camera.position.copy(focus).add(CAM_OFFSET);
  camera.lookAt(focus);
  sun.position.copy(focus).add(SUN_OFFSET);
  sun.target.position.copy(focus);
  renderer.render(scene, camera);
}

function resize() {
  const aspect = innerWidth / innerHeight;
  Object.assign(camera, { left: -zoom * aspect, right: zoom * aspect, top: zoom, bottom: -zoom, near: 1, far: 100 });
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}

function buildMap(world: World) {
  const { w, h, blocked } = world.grid;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ color: 0x4a4038 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(w / 2, 0, h / 2);
  floor.receiveShadow = true;
  // ponytail: GridHelper는 정사각형만 지원. 직사각형 맵이 생기면 LineSegments로 교체
  const lines = new THREE.GridHelper(Math.max(w, h), Math.max(w, h), 0x2e2722, 0x2e2722);
  lines.position.set(w / 2, 0.01, h / 2);
  const walls = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1.2, 1),
    new THREE.MeshStandardMaterial({ color: 0x6b6158 }),
    blocked.reduce((n, b) => n + b, 0),
  );
  const m = new THREE.Matrix4();
  let i = 0;
  for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) if (blocked[z * w + x]) walls.setMatrixAt(i++, m.makeTranslation(x + 0.5, 0.6, z + 0.5));
  walls.castShadow = walls.receiveShadow = true;
  scene.add(floor, lines, walls);
}

async function loadKind(kind: Kind) {
  const m = MODELS[kind];
  const gltf = await loader.loadAsync(m.url);
  const find = (name: string) => {
    const o = gltf.scene.getObjectByName(name);
    if (!o) throw new Error(`${m.url}: '${name}' 노드가 없습니다`);
    return o;
  };
  for (const name of m.hide ?? []) find(name).removeFromParent();
  if (m.weapon) {
    // GLTFLoader는 노드 이름에서 '.'을 지운다 (handslot.r → handslotr)
    const hand = gltf.scene.getObjectByName('handslot.r') ?? find('handslotr');
    hand.add((await loader.loadAsync(m.weapon)).scene);
  }
  for (const clip of ['Idle', m.move, ATTACK, 'Hit_A', 'Death_A']) {
    if (!THREE.AnimationClip.findByName(gltf.animations, clip)) throw new Error(`${m.url}: '${clip}' 애니메이션이 없습니다`);
  }
  gltf.scene.traverse((o) => (o.castShadow = true));
  protos.set(kind, { scene: gltf.scene, clips: gltf.animations });
}

function makeActor(e: Entity): Actor {
  const proto = protos.get(e.kind)!;
  const obj = clone(proto.scene); // 스킨드 메시는 SkeletonUtils.clone으로 복제해야 뼈대가 분리된다
  obj.scale.setScalar(SCALE);
  scene.add(obj);
  return { obj, mixer: new THREE.AnimationMixer(obj), clips: proto.clips, clip: '', hp: e.hp, hitT: 0 };
}

const action = (a: Actor, name: string) => a.mixer.clipAction(THREE.AnimationClip.findByName(a.clips, name)!);

function clipFor(e: Entity, a: Actor) {
  if (e.state === 'dead') return 'Death_A';
  if (a.hitT > 0) return 'Hit_A';
  if (e.state === 'attack') return ATTACK;
  if (e.state === 'move') return MODELS[e.kind].move;
  return 'Idle';
}

function play(a: Actor, name: string) {
  if (a.clip === name) return;
  const next = action(a, name);
  next.setLoop(ONCE.has(name) ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
  next.clampWhenFinished = ONCE.has(name);
  next.reset().play();
  if (a.clip) next.crossFadeFrom(action(a, a.clip), FADE, false);
  a.clip = name;
}
