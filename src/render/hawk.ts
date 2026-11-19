// 매 그리기(궁수 매 탭): 3D 모형(몸통·머리·부리·꼬리·날개 둘, 각진 면, 빛을 받는 재질)을 sim의 매 자리(World.hawk·flock)에 둔다.
// 화면은 날갯짓·기울기·숙임·발밑 그림자, 덮친 자리의 깃털 조각, 매 타기에서 들린 주인공과 떨어지는 화살만 덧붙인다.
// 설계: docs/superpowers/specs/2026-11-19-hawk-tab-design.md. sim은 바꾸지 않는다.
import * as THREE from 'three';
import { HAWK, type Entity, type Hawk, type World } from '../sim/world';
import { BLADE, line } from './iaido';

const COL = { back: 0x3e2614, wing: 0x4e321a, cover: 0x6e4a2a, bar: 0x2a1a0d, tip: 0x160e07, belly: 0xb8a382, head: 0x2e1c0e, beak: 0xd8a030, eye: 0x111111, band: 0x9a8a6a, feather: 0x5a3a1e };
const SPAN = 0.5; // 날개 한 장 길이(m) → 편 길이 약 1m
const SIZE = 1.05;
const LIFT = -0.22; // 날개를 살짝 V자로 들어 둔다(납작하면 비스듬한 카메라에서 선처럼 보인다)
const RIDE = { top: 0.9, base: 0.3, above: 1.95 }; // 매 타기: 주인공이 들리는 높이(가운데 top + 처음·끝 base), 매는 그 위 above
const FEATHER = { n: 7, life: 0.6, speed: 1.6, rise: 1.2, gravity: 5, size: 0.09 };
const ARROW = { width: 0.08, life: 0.18, grow: 0.06 };

// 날개 각(라디안, 양수 = 아래로): 하는 일과 시간으로. 덮칠 땐 접고, 닿은 직후(flare)엔 활짝 위로
export function wingAngle(mode: Hawk['mode'], time: number, flare: number): number {
  if (flare > 0) return LIFT - 0.35;
  if (mode === 'dive') return LIFT;
  if (mode === 'orbit' && Math.sin(time * 0.6) > 0.4) return LIFT + 0.06 * Math.sin(time * 3); // 가끔 활공
  const fast = mode === 'peck' || mode === 'leave' || mode === 'carry';
  return LIFT + (fast ? 0.45 : 0.4) * Math.sin(time * (fast ? 16 : 11));
}
// 매 타기에서 주인공이 들린 높이(m): 남은 시간 → 가운데가 가장 높은 곡선
export const rideLift = (phaseT: number) => RIDE.base + (RIDE.top - RIDE.base) * Math.sin(Math.PI * Math.min(1, Math.max(0, 1 - phaseT / HAWK.time)));
// 발밑 그림자: 높을수록 작고 옅게
export const blobLook = (y: number) => ({ scale: 1 - 0.25 * Math.min(1, y / HAWK.h), opacity: 0.42 - 0.15 * Math.min(1, y / HAWK.h) });

// 빛을 받되 어두운 바닥에서도 실루엣이 보이게 조금 스스로 빛난다. 진짜 그림자는 쓰지 않는다(횃불이 주인공 손에 있어 매 그림자가 바닥에 길게 늘어진다)
const mats = new Map<number, THREE.MeshLambertMaterial>();
const LIT = { diffuse: 0.7, glow: 0.45 }; // 빛 받는 몫을 줄이고 스스로 내는 빛을 늘린다: 횃불 옆에서 주황으로 뜨지 않고 어두운 곳에서도 보이게
const mat = (color: number) => mats.get(color) ?? mats.set(color, new THREE.MeshLambertMaterial({ color: new THREE.Color(color).multiplyScalar(LIT.diffuse), flatShading: true, emissive: color, emissiveIntensity: LIT.glow, side: THREE.DoubleSide })).get(color)!;
const mesh = (geo: THREE.BufferGeometry, color: number) => new THREE.Mesh(geo, mat(color));
function flat(pts: [number, number][], color: number, y = 0) {
  const g = new THREE.ShapeGeometry(new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, z))));
  g.rotateX(Math.PI / 2);
  g.translate(0, y, 0);
  return mesh(g, color);
}
function wing(side: 1 | -1) {
  const pivot = new THREE.Group();
  const z = (v: number) => v * side;
  pivot.add(flat([[0.08, z(0)], [0.1, z(0.18)], [0.02, z(SPAN * 0.95)], [-0.08, z(SPAN)], [-0.16, z(0.2)], [-0.12, z(0)]], COL.wing));
  pivot.add(flat([[0.07, z(0.02)], [0.09, z(0.2)], [0.02, z(0.32)], [-0.08, z(0.3)], [-0.1, z(0.04)]], COL.cover, 0.004)); // 어깨 쪽 덮깃(밝게)
  for (const k of [0.36, 0.44]) pivot.add(flat([[0.0, z(k)], [0.0, z(k + 0.025)], [-0.13, z(k + 0.02)], [-0.13, z(k - 0.005)]], COL.bar, 0.005)); // 날개 줄무늬
  const tips: [number, number][] = [[0.02, z(SPAN * 0.6)], [0.02, z(SPAN * 0.95)], [-0.08, z(SPAN)]];
  for (let k = 0; k < 4; k++) tips.push([-0.12 - (k % 2) * 0.04, z(SPAN * (0.92 - k * 0.1))]); // 칼깃 톱니
  tips.push([-0.1, z(SPAN * 0.55)]);
  pivot.add(flat(tips, COL.tip, 0.006));
  return pivot;
}

type Bird = { root: THREE.Group; body: THREE.Group; left: THREE.Group; right: THREE.Group; blob: THREE.Mesh; prev: THREE.Vector3; yaw: number; bank: number; flare: number; mode: Hawk['mode'] | null };
const BLOB_GEO = new THREE.CircleGeometry(0.3, 16);
export const hawkGroup = new THREE.Group();
function makeBird(): Bird {
  const root = new THREE.Group(); // 위치·방향(앞 = +x)
  const body = new THREE.Group(); // 앞뒤 숙임·옆 기울임
  root.add(body);
  root.scale.setScalar(SIZE);
  const torso = mesh(new THREE.SphereGeometry(0.11, 6, 4), COL.back);
  torso.scale.set(1.9, 0.8, 0.9);
  const belly = mesh(new THREE.SphereGeometry(0.1, 6, 3, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), COL.belly);
  belly.scale.set(1.8, 0.8, 0.85);
  const head = mesh(new THREE.SphereGeometry(0.075, 6, 4), COL.head);
  head.position.set(0.22, 0.03, 0);
  const beak = mesh(new THREE.ConeGeometry(0.03, 0.08, 4), COL.beak);
  beak.rotation.z = -Math.PI / 2;
  beak.position.set(0.31, 0.02, 0);
  body.add(torso, belly, head, beak);
  for (const s of [-1, 1]) {
    const eye = mesh(new THREE.SphereGeometry(0.014, 4, 3), COL.eye);
    eye.position.set(0.26, 0.06, s * 0.045);
    body.add(eye);
  }
  body.add(flat([[-0.14, 0.03], [-0.36, 0.1], [-0.4, 0], [-0.36, -0.1], [-0.14, -0.03]], COL.wing, 0.01)); // 꼬리(부채)
  body.add(flat([[-0.27, 0.05], [-0.31, 0.065], [-0.31, -0.065], [-0.27, -0.05]], COL.band, 0.012)); // 꼬리 띠
  body.add(flat([[-0.33, 0.07], [-0.4, 0.09], [-0.42, 0], [-0.4, -0.09], [-0.33, -0.07]], COL.tip, 0.014));
  const left = wing(1), right = wing(-1);
  left.position.set(0.02, 0.04, 0.08);
  right.position.set(0.02, 0.04, -0.08);
  body.add(left, right);
  const blob = new THREE.Mesh(BLOB_GEO, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2;
  blob.renderOrder = 1;
  hawkGroup.add(root, blob);
  return { root, body, left, right, blob, prev: new THREE.Vector3(), yaw: 0, bank: 0, flare: 0, mode: null };
}

const birds: Bird[] = []; // [0] = 내 매, 나머지 = 매 떼
const pos = new THREE.Vector3();
const vel = new THREE.Vector3();

function place(b: Bird, h: Hawk, hero: Entity, time: number, dt: number) {
  pos.set(h.x, h.mode === 'carry' && hero.phase === 'ride' ? rideLift(hero.phaseT) + RIDE.above : h.y, h.z);
  if (b.mode === null) b.prev.copy(pos);
  if (b.mode === 'dive' && h.mode !== 'dive') b.flare = 0.35; // 닿았다: 날개를 활짝
  b.mode = h.mode;
  vel.copy(pos).sub(b.prev).divideScalar(Math.max(dt, 1e-3));
  b.prev.copy(pos);
  b.flare = Math.max(0, b.flare - dt);
  // 방향: 움직이는 쪽을 보고, 도는 만큼 옆으로 기울고, 내려가면 머리를 숙인다
  const ground = Math.hypot(vel.x, vel.z);
  if (ground > 0.2) {
    let dy = Math.atan2(-vel.z, vel.x) - b.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    b.yaw += dy * Math.min(1, dt * 8);
    b.bank += (THREE.MathUtils.clamp(-dy * 6, -0.8, 0.8) - b.bank) * Math.min(1, dt * 5);
  }
  b.root.position.copy(pos);
  b.root.rotation.set(0, b.yaw, 0);
  b.body.rotation.set(b.bank, 0, Math.atan2(vel.y, Math.max(0.5, ground)));
  const a = wingAngle(h.mode, time, b.flare);
  const fold = h.mode === 'dive' && b.flare <= 0 ? 1 : 0;
  b.left.rotation.set(a, 0.5 * fold, 0);
  b.right.rotation.set(-a, -0.5 * fold, 0);
  b.left.scale.z = b.right.scale.z = 1 - 0.55 * fold;
  const look = blobLook(pos.y);
  b.blob.position.set(h.x, 0.02, h.z);
  b.blob.scale.setScalar(look.scale);
  (b.blob.material as THREE.MeshBasicMaterial).opacity = look.opacity;
}

// 깃털 조각(덮친 자리): 보통 혼합 갈색 조각이 튀었다 떨어지며 옅어진다
type Bit = { m: THREE.Mesh; v: THREE.Vector3; t: number; spin: number };
const FEATHER_GEO = new THREE.PlaneGeometry(FEATHER.size, FEATHER.size * 0.4);
let bits: Bit[] = [];
let featherSeen = -1;
let rideSeen = 0;
function feathers(x: number, z: number) {
  for (let k = 0; k < FEATHER.n; k++) {
    const a = (k / FEATHER.n) * Math.PI * 2 + Math.random();
    const m = new THREE.Mesh(FEATHER_GEO, new THREE.MeshLambertMaterial({ color: COL.feather, emissive: COL.feather, emissiveIntensity: 0.3, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    m.position.set(x, 0.5, z);
    hawkGroup.add(m);
    bits.push({ m, v: new THREE.Vector3(Math.cos(a) * FEATHER.speed, FEATHER.rise, Math.sin(a) * FEATHER.speed), t: 0, spin: (Math.random() - 0.5) * 12 });
  }
}

export function hawkFx(world: World, heroPos: THREE.Vector3, time: number, dt: number) {
  const hero = world.entities[0];
  const all = world.hawk ? [world.hawk, ...world.flock.filter((f) => f.peckT <= 0)] : [];
  while (birds.length < all.length) birds.push(makeBird());
  birds.forEach((b, i) => {
    const on = i < all.length;
    b.root.visible = b.blob.visible = on;
    if (!on) return void (b.mode = null);
    if (dt > 0) place(b, all[i], hero, time, dt);
  });
  for (const bl of world.blasts) if (bl.kind === 'feather' && bl.id > featherSeen) (feathers(bl.x, bl.z), (featherSeen = bl.id));
  // 매 타기: 지나는 길 아래 적에게 떨어지는 화살(위에서 아래로 짧은 흰 줄)
  if (world.rideHit.length < rideSeen) rideSeen = 0;
  for (const id of world.rideHit.slice(rideSeen)) {
    const e = world.entities[id];
    if (e) line(new THREE.Vector3(heroPos.x, heroPos.y + 0.6, heroPos.z), new THREE.Vector3(e.x, 0.4, e.z), { geo: BLADE, color: 0xf0ead8, width: ARROW.width, life: ARROW.life, grow: ARROW.grow });
  }
  rideSeen = world.rideHit.length;
  bits = bits.filter((b) => {
    b.t += dt;
    b.v.y -= FEATHER.gravity * dt;
    b.m.position.addScaledVector(b.v, dt);
    b.m.position.y = Math.max(0.03, b.m.position.y);
    b.m.rotation.z += b.spin * dt;
    (b.m.material as THREE.MeshLambertMaterial).opacity = 1 - b.t / FEATHER.life;
    if (b.t < FEATHER.life) return true;
    b.m.removeFromParent();
    (b.m.material as THREE.Material).dispose();
    return false;
  });
}

export function resetHawk(world: World) {
  for (const b of birds) b.mode = null;
  featherSeen = Math.max(-1, ...world.blasts.filter((b) => b.kind === 'feather').map((b) => b.id));
  rideSeen = world.rideHit.length;
}
