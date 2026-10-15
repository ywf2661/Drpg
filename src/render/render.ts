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

const PIXEL = 3; // 렌더 픽셀 1개를 화면 PIXEL×PIXEL 픽셀로 확대(도트 느낌)
const TORCH = 80; // 횃불 밝기(칸델라)
const TORCH_RANGE = 9; // 시야 반경(m). 이 밖은 거의 칠흑

export const renderer = new THREE.WebGLRenderer({ antialias: false });
export const camera = new THREE.OrthographicCamera();
const scene = new THREE.Scene();
const torch = new THREE.PointLight(0xff9a4d, TORCH, TORCH_RANGE, 1.5); // 주인공이 든 횃불
const eyes = new THREE.MeshBasicMaterial({ color: 0xff2010, toneMapped: false }); // 조명과 무관하게 빛나는 스켈레톤 눈
const loader = new GLTFLoader();
const protos = new Map<Kind, { scene: THREE.Object3D; clips: THREE.AnimationClip[] }>();
const focus = new THREE.Vector3();
const tmp = new THREE.Vector3();
const right = new THREE.Vector3();
const up = new THREE.Vector3();
// 수평 45°, 내려다보는 각 40°(극각 50°), 거리 30
const CAM_OFFSET = new THREE.Vector3().setFromSphericalCoords(30, THREE.MathUtils.degToRad(50), THREE.MathUtils.degToRad(45));
let actors: Actor[] = [];
let zoom = 6; // 화면 세로 절반에 보이는 월드 길이(m)
let bufH = 1; // 렌더 버퍼 세로 픽셀 수
let time = 0;

export async function initRender(world: World) {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.BasicShadowMap; // 경계가 딱딱한 픽셀 그림자
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  document.body.prepend(renderer.domElement);
  scene.background = new THREE.Color(0x000000);
  scene.add(new THREE.HemisphereLight(0x3a4a66, 0x000000, 0.1)); // 시야 밖이 완전한 검정은 아니게
  torch.castShadow = true;
  torch.shadow.mapSize.set(512, 512);
  torch.shadow.bias = -0.002;
  scene.add(torch);
  buildMap(world);
  addEventListener('resize', resize);
  renderer.domElement.addEventListener(
    'wheel',
    (e) => {
      zoom = THREE.MathUtils.clamp(zoom * (e.deltaY > 0 ? 1.1 : 0.9), 4, 12);
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
  time += dt;
  torch.position.set(hero.x, 4, hero.z); // 높을수록 가까운 머리와 먼 바닥의 밝기 차가 줄어든다
  torch.intensity = TORCH * (1 + 0.06 * Math.sin(time * 11) + 0.04 * Math.sin(time * 23.7)); // 불꽃 깜빡임
  focus.lerp(tmp.set(hero.x, 0, hero.z), 1 - Math.exp(-8 * dt));
  camera.position.copy(focus).add(CAM_OFFSET);
  camera.lookAt(focus);
  snapToPixel();
  renderer.render(scene, camera);
}

// 카메라를 렌더 픽셀 격자에 맞춘다. 안 맞추면 이동할 때 벽·바닥 픽셀이 지글거린다.
function snapToPixel() {
  camera.updateMatrixWorld();
  right.setFromMatrixColumn(camera.matrixWorld, 0);
  up.setFromMatrixColumn(camera.matrixWorld, 1);
  const px = (2 * zoom) / bufH; // 렌더 픽셀 1개의 월드 크기
  const x = camera.position.dot(right);
  const y = camera.position.dot(up);
  camera.position.addScaledVector(right, Math.round(x / px) * px - x).addScaledVector(up, Math.round(y / px) * px - y);
}

// 화면의 1/PIXEL 해상도로 그리고 CSS(image-rendering: pixelated)로 정수배 확대한다.
function resize() {
  const dpr = devicePixelRatio;
  const w = Math.ceil((innerWidth * dpr) / PIXEL);
  bufH = Math.ceil((innerHeight * dpr) / PIXEL);
  renderer.setPixelRatio(1);
  renderer.setSize(w, bufH, false);
  Object.assign(renderer.domElement.style, { width: `${(w * PIXEL) / dpr}px`, height: `${(bufH * PIXEL) / dpr}px` });
  const aspect = w / bufH;
  Object.assign(camera, { left: -zoom * aspect, right: zoom * aspect, top: zoom, bottom: -zoom, near: 1, far: 100 });
  camera.updateProjectionMatrix();
}

function buildMap(world: World) {
  const { w, h, blocked } = world.grid;
  const floorMap = stoneTexture(0x5a5f66, false);
  floorMap.repeat.set(w, h); // 1칸 = 텍스처 1장
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: floorMap, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(w / 2, 0, h / 2);
  floor.receiveShadow = true;
  const walls = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1.2, 1),
    new THREE.MeshStandardMaterial({ map: stoneTexture(0x5c6068, true), roughness: 1 }),
    blocked.reduce((n, b) => n + b, 0),
  );
  const m = new THREE.Matrix4();
  let i = 0;
  for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) if (blocked[z * w + x]) walls.setMatrixAt(i++, m.makeTranslation(x + 0.5, 0.6, z + 0.5));
  walls.castShadow = walls.receiveShadow = true;
  scene.add(floor, walls);
}

// 코드로 만든 16×16 픽셀 돌 질감. 바닥은 타일 테두리, 벽은 엇갈린 벽돌 줄눈이 어둡다.
function stoneTexture(base: number, brick: boolean) {
  const S = 16;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const col = new THREE.Color();
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const offset = ((y >> 2) % 2) * 4;
      const mortar = brick ? y % 4 === 0 || (x + offset) % 8 === 0 : x === 0 || y === 0;
      g.fillStyle = col.set(base).multiplyScalar(mortar ? 0.45 : 0.8 + Math.random() * 0.35).getStyle();
      g.fillRect(x, y, 1, 1);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
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
  gltf.scene.traverse((o) => {
    o.castShadow = true;
    if (o.name.endsWith('_Eyes')) o.traverse((c) => c instanceof THREE.Mesh && (c.material = eyes)); // 어둠 속 붉은 눈
  });
  protos.set(kind, { scene: gltf.scene, clips: gltf.animations });
}

function makeActor(e: Entity): Actor {
  const proto = protos.get(e.kind)!;
  const obj = clone(proto.scene); // 스킨드 메시는 SkeletonUtils.clone으로 복제해야 뼈대가 분리된다
  obj.scale.setScalar(SCALE);
  if (e.kind === 'hero') obj.traverse((o) => (o.castShadow = false)); // 횃불이 머리 위라 자기 그림자가 발밑을 덮는다
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
