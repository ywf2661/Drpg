// 전설 무기 연출(설계: docs/superpowers/specs/2026-11-20-legend-weapons-design.md). sim은 읽기만 한다.
// - 무덤 왕의 귀환: 땅에서 솟은 거대한 해골 왕의 상반신(3D, 매처럼 코드로 짠 각진 모형). 녹슨 어깨 갑옷·찢어진 망토·왕관,
//   눈과 갈비뼈 사이에서 청록 혼불이 피어오른다. 주인공을 따라 땅을 가르며 미끄러지고(흙먼지), 양팔을 번갈아 들어 내리친다.
//   유지 시간 없이 있다가, 쓰러지거나 다시 부르면 땅으로 가라앉는다
// - 종언: 질감을 입힌 검붉은 반달 검기 + 늦게 따라오는 어두운 잔상 + 불티·검은 연기 + 바닥에 남는 갈라진 흉터, 화면 흔들림
// - 천둥새의 장궁: 화살이 지나온 궤적을 따라 지글거리는 번개, 맞힌 적 → 둘레 적으로 뻗는 꺾인 번개 줄기
import * as THREE from 'three';
import { FINALE, HIT_AT, hasUnique, type Ally, type World } from '../sim/world';
import { BLADE, line } from './iaido';
import { puff } from './rain';
import { rumble } from './feel';

export const legendGroup = new THREE.Group();

// ---- 작은 입자(불티·혼불·연기): 날아가며 옅어진다 ----
type Bit = { m: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>; v: THREE.Vector3; t: number; life: number; grow: number; fall: number; o: number };
let bits: Bit[] = [];
const BIT_GEO = new THREE.BoxGeometry(1, 1, 1);
const SMOKE_GEO = new THREE.IcosahedronGeometry(1, 0);
function spark(p: THREE.Vector3, v: THREE.Vector3, o: { color: number; size: number; life: number; add?: boolean; smoke?: boolean; grow?: number; fall?: number; opacity?: number }) {
  const m = new THREE.Mesh(o.smoke ? SMOKE_GEO : BIT_GEO, new THREE.MeshBasicMaterial({ color: o.color, transparent: true, depthWrite: false, toneMapped: false, blending: o.add ? THREE.AdditiveBlending : THREE.NormalBlending }));
  m.position.copy(p);
  m.scale.setScalar(o.size);
  m.renderOrder = 4;
  legendGroup.add(m);
  bits.push({ m, v, t: 0, life: o.life, grow: o.grow ?? 0, fall: o.fall ?? 0, o: o.opacity ?? 1 });
}
function tickBits(dt: number) {
  bits = bits.filter((b) => {
    b.t += dt;
    b.v.y -= b.fall * dt;
    b.m.position.addScaledVector(b.v, dt);
    b.m.scale.multiplyScalar(1 + b.grow * dt);
    b.m.rotation.x += dt * 3;
    b.m.rotation.y += dt * 2;
    b.m.material.opacity = b.o * Math.max(0, 1 - b.t / b.life);
    if (b.t < b.life) return true;
    b.m.removeFromParent();
    b.m.material.dispose();
    return false;
  });
}

// ---- 무덤 왕 ----
const BONE = { bone: 0xd8cfb4, old: 0xa89c7c, dark: 0x3a3428, glow: 0x3cffaa, iron: 0x5a4e44, rust: 0x7a4a2a, cloth: 0x2a2030, gold: 0xa8862e, mound: 0x4e3e2c, crack: 0x120c08 };
// 팔 자세(라디안, 음수 = 앞으로). 평소엔 양손을 몸 옆 땅에 짚고 몸을 일으킨 자세: 어깨를 바깥으로 splayRest만큼 벌리고 팔꿈치는 밖으로 bow만큼 굽힌다.
// 칠 때: 어깨 armUp까지 치켜들며 팔꿈치를 elbowUp만큼 접었다가, armHit·elbowHit로 펴며 내리친다(벌림은 splayHit로 모은다)
const KING = { size: 1.5, tall: 2.6, rise: 0.8, sink: 0.8, dustEvery: 0.06, slamDust: 10, armRest: -0.3, armUp: -2.6, armHit: -0.6, elbowRest: -0.25, elbowUp: -1.5, elbowHit: -0.15, splayRest: 0.6, splayHit: 0.22, bow: 0.45, turn: 5, wisp: 0.09 };
const mats = new Map<string, THREE.MeshLambertMaterial>();
const mat = (c: number, glow = 0.3) => {
  const k = `${c}:${glow}`;
  return mats.get(k) ?? mats.set(k, new THREE.MeshLambertMaterial({ color: new THREE.Color(c).multiplyScalar(0.8), emissive: c, emissiveIntensity: glow, flatShading: true, side: THREE.DoubleSide })).get(k)!;
};
const GLOW = new THREE.MeshBasicMaterial({ color: BONE.glow, toneMapped: false });
const GLOW_HALO = new THREE.MeshBasicMaterial({ color: BONE.glow, transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending });
function box(w: number, h: number, d: number, c: number, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, glow?: number) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c, glow));
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  return m;
}
const ball = (r: number, c: number, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => {
  const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), mat(c));
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  return m;
};

type Arm = { shoulder: THREE.Group; elbow: THREE.Group; side: 1 | -1 };
type King = { root: THREE.Group; body: THREE.Group; arms: [Arm, Arm]; jaw: THREE.Mesh; eyes: THREE.Mesh[]; age: number; gone: number; yaw: number; px: number; pz: number; dustT: number; wispT: number; side: 0 | 1; was: string; hitDone: boolean };
const kings = new Map<number, King>();

// 팔 하나: 어깨(돌림) → 위팔뼈 → 팔꿈치(따로 굽힘) → 두 가닥 아래팔뼈 → 손목에서 살짝 꺾인 손바닥 → 굽은 손가락 넷(발톱)
function arm(side: 1 | -1): Arm {
  const shoulder = new THREE.Group(); // x축으로 돌려 들고 내리친다(앞 = +z), z축으로 바깥으로 벌린다
  shoulder.position.set(side * 0.78, 1.5, 0);
  shoulder.add(ball(0.13, BONE.old, 0, 0, 0)); // 어깨 관절
  shoulder.add(box(0.13, 0.72, 0.13, BONE.bone, 0, -0.38, 0)); // 위팔뼈
  const elbow = new THREE.Group();
  elbow.position.set(0, -0.76, 0);
  shoulder.add(elbow);
  elbow.add(ball(0.1, BONE.old, 0, 0, 0)); // 팔꿈치 관절
  for (const k of [-1, 1]) elbow.add(box(0.06, 0.64, 0.06, BONE.bone, k * 0.05, -0.34, 0.02, 0, 0, k * 0.03)); // 아래팔뼈 둘
  const hand = new THREE.Group(); // 손목: 손바닥을 조금 앞으로 꺾어 갈퀴처럼
  hand.position.set(0, -0.68, 0.02);
  hand.rotation.x = -0.35;
  elbow.add(hand);
  hand.add(ball(0.07, BONE.old, 0, 0, 0)); // 손목뼈
  hand.add(box(0.26, 0.08, 0.26, BONE.old, 0, -0.06, 0.08)); // 손바닥
  for (let f = 0; f < 4; f++) {
    const x = (f - 1.5) * 0.075;
    hand.add(box(0.045, 0.045, 0.2, BONE.bone, x, -0.1, 0.27, -0.45));
    hand.add(box(0.035, 0.035, 0.14, BONE.dark, x, -0.2, 0.38, -1.0)); // 발톱
  }
  // 손목의 끊어진 쇠사슬
  for (let c = 0; c < 3; c++) {
    const link = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.015, 3, 6), mat(BONE.iron, 0.15));
    link.position.set(side * 0.06, -0.62 - c * 0.08, -0.1);
    link.rotation.y = c % 2 ? Math.PI / 2 : 0;
    elbow.add(link);
  }
  shoulder.rotation.z = side * KING.splayRest;
  return { shoulder, elbow, side };
}

function makeKing(): King {
  const root = new THREE.Group(); // 땅 위 위치·방향
  const body = new THREE.Group(); // 솟기·가라앉기(아래로 내려 땅에 묻는다)
  root.add(body);
  root.scale.setScalar(KING.size);
  // 등뼈: 마디 마디
  for (let k = 0; k < 9; k++) body.add(box(0.16 - k * 0.004, 0.1, 0.16, k % 2 ? BONE.old : BONE.bone, 0, 0.12 + k * 0.13, -0.16));
  // 골반 윗부분(땅 위로 반쯤)
  body.add(box(0.7, 0.16, 0.3, BONE.old, 0, 0.12, -0.08, 0.2));
  // 갈비뼈 여섯 + 복장뼈
  for (let k = 0; k < 6; k++) {
    const r = 0.5 - Math.abs(k - 2) * 0.04;
    const rib = new THREE.Mesh(new THREE.TorusGeometry(r, 0.035, 3, 12, Math.PI * 1.5), mat(k % 2 ? BONE.old : BONE.bone));
    rib.rotation.set(Math.PI / 2 - 0.25, 0, Math.PI * 0.25 + Math.PI);
    rib.position.set(0, 1.34 - k * 0.13, -0.06);
    rib.scale.set(1, 0.8, 1);
    body.add(rib);
  }
  body.add(box(0.09, 0.62, 0.07, BONE.bone, 0, 1.06, 0.4, -0.15));
  // 가슴 속 혼불(갈비뼈 사이로 비친다)
  const heart = new THREE.Mesh(new THREE.IcosahedronGeometry(0.14, 0), GLOW_HALO);
  heart.position.set(0, 1.05, 0.05);
  heart.scale.set(1.4, 1.8, 1.4);
  body.add(heart);
  // 빗장뼈·어깨뼈, 녹슨 어깨 갑옷(가시 셋)
  for (const s of [-1, 1]) {
    body.add(box(0.62, 0.08, 0.1, BONE.bone, s * 0.36, 1.5, 0.1, 0, s * 0.2, s * -0.08));
    body.add(box(0.36, 0.42, 0.06, BONE.old, s * 0.36, 1.3, -0.34, 0.15, 0, s * 0.12));
    const pad = new THREE.Mesh(new THREE.SphereGeometry(0.3, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2), mat(BONE.iron, 0.15));
    pad.position.set(s * 0.8, 1.56, 0);
    pad.scale.set(1.1, 0.8, 1.2);
    pad.rotation.z = s * -0.35;
    body.add(pad);
    body.add(box(0.36, 0.05, 0.4, BONE.rust, s * 0.82, 1.5, 0, 0, 0, s * -0.35, 0.1));
    for (let p = 0; p < 3; p++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.28, 4), mat(BONE.iron, 0.15));
      spike.position.set(s * (0.78 + p * 0.06), 1.74 + p * 0.02, -0.12 + p * 0.12);
      spike.rotation.z = s * -0.5;
      body.add(spike);
    }
  }
  // 찢어진 망토: 어깨에서 등 뒤로 늘어진 천 조각들
  for (let k = 0; k < 7; k++) {
    const x = (k - 3) * 0.2;
    const len = 0.9 + ((k * 37) % 5) * 0.12;
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.22, len), mat(BONE.cloth, 0.12));
    cloth.position.set(x, 1.55 - len / 2, -0.42 - Math.abs(x) * 0.1);
    cloth.rotation.set(0.12, x * 0.2, 0);
    body.add(cloth);
  }
  // 목뼈 · 두개골(이마·광대·코 구멍·윗니) · 아래턱(입을 벌린다)
  body.add(box(0.1, 0.2, 0.1, BONE.old, 0, 1.68, -0.04));
  body.add(ball(0.3, BONE.bone, 0, 2.02, 0.02, 1, 1.05, 1.15));
  body.add(box(0.5, 0.08, 0.14, BONE.old, 0, 2.08, 0.28)); // 눈썹뼈
  for (const s of [-1, 1]) body.add(box(0.14, 0.1, 0.14, BONE.bone, s * 0.2, 1.9, 0.24)); // 광대
  body.add(box(0.07, 0.1, 0.05, BONE.crack, 0, 1.92, 0.35)); // 코 구멍
  for (let t = 0; t < 6; t++) body.add(box(0.035, 0.05, 0.03, 0xf0ead0, (t - 2.5) * 0.045, 1.81, 0.32));
  const jaw = box(0.3, 0.08, 0.26, BONE.old, 0, 1.72, 0.14);
  body.add(jaw);
  const eyes: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    body.add(box(0.12, 0.1, 0.05, BONE.crack, s * 0.11, 2.0, 0.33)); // 눈구멍
    const eye = new THREE.Mesh(new THREE.IcosahedronGeometry(0.04, 0), GLOW);
    eye.position.set(s * 0.11, 2.0, 0.36);
    const halo = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, 0), GLOW_HALO);
    halo.position.copy(eye.position);
    body.add(eye, halo);
    eyes.push(halo);
  }
  // 왕관: 녹슨 금 띠 + 이빨 일곱 + 청록 보석
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.31, 0.08, 10, 1, true), mat(BONE.gold, 0.25));
  band.position.set(0, 2.24, 0.02);
  body.add(band);
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2;
    const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.2 + (k % 2) * 0.08, 4), mat(BONE.gold, 0.25));
    tooth.position.set(Math.sin(a) * 0.29, 2.36 + (k % 2) * 0.04, 0.02 + Math.cos(a) * 0.29);
    body.add(tooth);
  }
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.05, 0), GLOW);
  gem.position.set(0, 2.25, 0.33);
  body.add(gem);
  const arms: [Arm, Arm] = [arm(1), arm(-1)];
  body.add(arms[0].shoulder, arms[1].shoulder);
  // 땅: 갈라진 자리, 흙더미, 흩어진 돌
  const crack = new THREE.Mesh(new THREE.CircleGeometry(1.0, 11).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: BONE.crack, transparent: true, opacity: 0.65, depthWrite: false }));
  crack.position.y = 0.015;
  const mound = new THREE.Mesh(new THREE.ConeGeometry(0.8, 0.3, 11), mat(BONE.mound, 0.12));
  mound.position.y = 0.08;
  root.add(crack, mound);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + 0.3;
    root.add(box(0.14 + (k % 3) * 0.05, 0.1, 0.12, BONE.mound, Math.sin(a) * 0.78, 0.05, Math.cos(a) * 0.78, 0, a, 0.3, 0.1));
  }
  legendGroup.add(root);
  return { root, body, arms, jaw, eyes, age: 0, gone: 0, yaw: 0, px: NaN, pz: NaN, dustT: 0, wispT: 0, side: 0, was: 'idle', hitDone: false };
}

function placeKing(k: King, a: Ally, world: World, dt: number, time: number) {
  k.age += dt;
  const up = Math.min(1, k.age / KING.rise);
  k.body.position.y = -KING.tall * (1 - up) ** 2;
  k.root.position.set(a.x, 0, a.z);
  // 방향: 노리는 적, 없으면 움직이는 쪽
  const t = a.target === null ? null : world.entities[a.target];
  const [dx, dz] = t && t.state !== 'dead' ? [t.x - a.x, t.z - a.z] : [a.x - k.px, a.z - k.pz];
  if (Math.hypot(dx, dz) > 1e-3 && dt > 0) {
    let d = Math.atan2(dx, dz) - k.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    k.yaw += d * Math.min(1, dt * KING.turn);
  }
  k.root.rotation.y = k.yaw;
  // 움직이면 땅을 가르며 흙먼지
  const moved = Number.isFinite(k.px) ? Math.hypot(a.x - k.px, a.z - k.pz) : 0;
  if (moved > 1e-3 && (k.dustT -= dt) <= 0) {
    k.dustT = KING.dustEvery;
    for (let i = 0; i < 3; i++) puff(a.x + (Math.random() - 0.5) * 2, a.z + (Math.random() - 0.5) * 2);
  }
  [k.px, k.pz] = [a.x, a.z];
  // 혼불: 눈과 가슴에서 청록 불씨가 피어오른다, 눈은 일렁인다
  if (dt > 0 && (k.wispT -= dt) <= 0) {
    k.wispT = KING.wisp;
    const h = (k.body.position.y + (Math.random() < 0.5 ? 2.0 : 1.1)) * KING.size;
    spark(new THREE.Vector3(a.x + (Math.random() - 0.5) * 0.5, h, a.z + (Math.random() - 0.5) * 0.5), new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.9 + Math.random() * 0.6, (Math.random() - 0.5) * 0.3), { color: BONE.glow, size: 0.07, life: 0.7, add: true, grow: -0.8 });
  }
  for (const e of k.eyes) e.scale.setScalar(1 + 0.25 * Math.sin(time * 9 + e.position.x * 20));
  // 팔: 공격마다 번갈아. 들어 올렸다가 HIT_AT에 내리치고 천천히 돌아온다. 턱을 벌린다
  if (a.state === 'attack' && k.was !== 'attack') [k.side, k.hitDone] = [k.side ? 0 : 1, false];
  k.was = a.state;
  const p = a.state === 'attack' ? a.attackT / a.interval : 1;
  // 치켜들기(0 → 0.7·HIT_AT, 천천히) → 내리치기(→ HIT_AT, 빠르게) → 돌아오기. 어깨와 팔꿈치를 같은 구간으로 섞는다
  const ease = (x: number) => x * x * (3 - 2 * x);
  const pose = (rest: number, up: number, hit: number) => (p < HIT_AT * 0.7 ? rest + (up - rest) * ease(p / (HIT_AT * 0.7)) : p < HIT_AT ? up + (hit - up) * ((p - HIT_AT * 0.7) / (HIT_AT * 0.3)) ** 2 : hit + (rest - hit) * ease(Math.min(1, (p - HIT_AT) / (1 - HIT_AT))));
  k.arms.forEach((g, i) => {
    const sway = Math.sin(time * 1.7 + a.id + i * 1.3) * 0.08;
    const on = i === k.side && a.state === 'attack';
    g.shoulder.rotation.x = on ? pose(KING.armRest, KING.armUp, KING.armHit) : KING.armRest + sway;
    g.elbow.rotation.x = on ? pose(KING.elbowRest, KING.elbowUp, KING.elbowHit) : KING.elbowRest + sway;
    g.shoulder.rotation.z = g.side * (on ? pose(KING.splayRest, KING.splayHit, KING.splayHit) : KING.splayRest + sway * 0.5);
    g.elbow.rotation.z = -g.side * (on ? pose(KING.bow, 0.1, 0) : KING.bow); // 팔꿈치가 밖으로 나오게 굽힌다(손은 몸 쪽으로)
  });
  k.jaw.rotation.x = a.state === 'attack' && p < HIT_AT ? 0.35 * (p / HIT_AT) : 0.05 + 0.04 * Math.sin(time * 2);
  k.body.rotation.x = a.state === 'attack' && p >= HIT_AT * 0.7 && p < HIT_AT + 0.15 ? 0.2 : Math.sin(time * 1.3) * 0.03; // 내리칠 때 숙인다, 평소엔 숨 쉬듯
  if (a.state === 'attack' && p >= HIT_AT && !k.hitDone) {
    k.hitDone = true;
    const [fx, fz] = [Math.sin(k.yaw), Math.cos(k.yaw)];
    const [hx, hz] = [a.x + fx * 1.6 * KING.size * 0.7, a.z + fz * 1.6 * KING.size * 0.7];
    for (let i = 0; i < KING.slamDust; i++) {
      const ang = (i / KING.slamDust) * Math.PI * 2;
      puff(hx + Math.cos(ang) * 0.9, hz + Math.sin(ang) * 0.9);
      spark(new THREE.Vector3(hx, 0.2, hz), new THREE.Vector3(Math.cos(ang) * 2, 2 + Math.random() * 1.5, Math.sin(ang) * 2), { color: BONE.mound, size: 0.08, life: 0.6, fall: 9 }); // 튀는 흙덩이
    }
    rumble(0.07);
  }
}

// 사라지는 왕: 땅으로 가라앉고 흙먼지
function sinkKing(k: King, dt: number) {
  if (k.gone === 0) for (let i = 0; i < 6; i++) puff(k.root.position.x + (Math.random() - 0.5) * 2, k.root.position.z + (Math.random() - 0.5) * 2);
  k.gone += dt;
  k.body.position.y = -KING.tall * Math.min(1, k.gone / KING.sink) ** 2;
  return k.gone < KING.sink;
}

// ---- 종언 검기 ----
// 질감(가로 = 호를 따라, 세로 = 안 → 바깥): 안쪽은 투명 → 검붉은 띠 → 바깥 끝만 뜨겁게, 할퀸 듯한 결, 양 끝은 가늘게 사라진다
function slashTexture() {
  const [W, H] = [256, 64];
  const c = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, 'rgba(20,0,4,0)');
  grad.addColorStop(0.35, 'rgba(40,0,8,0.55)');
  grad.addColorStop(0.7, 'rgba(120,8,20,0.9)');
  grad.addColorStop(0.88, 'rgba(210,30,40,1)');
  grad.addColorStop(0.95, 'rgba(255,140,110,1)');
  grad.addColorStop(1, 'rgba(255,60,50,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  // 결: 호를 따라 흐르는 어두운·밝은 줄(할퀸 자국)
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 26; i++) {
    const y = H * (0.3 + rnd() * 0.65);
    const [x0, len] = [rnd() * W * 0.6, W * (0.3 + rnd() * 0.5)];
    g.fillStyle = rnd() < 0.6 ? `rgba(10,0,2,${0.35 + rnd() * 0.4})` : `rgba(255,${80 + rnd() * 80},${60 + rnd() * 40},${0.25 + rnd() * 0.35})`;
    g.fillRect(x0, y, len, 1 + rnd() * 2);
  }
  // 양 끝: 가늘어지며 사라진다(알파를 깎는다)
  g.globalCompositeOperation = 'destination-in';
  const ends = g.createLinearGradient(0, 0, W, 0);
  ends.addColorStop(0, 'rgba(0,0,0,0)');
  ends.addColorStop(0.18, 'rgba(0,0,0,1)');
  ends.addColorStop(0.82, 'rgba(0,0,0,1)');
  ends.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = ends;
  g.fillRect(0, 0, W, H);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
let slashTex: THREE.Texture | null = null;
const SLASH = { inner: 0.45, y: 0.5, seg: 24, lag: 0.12, embers: 26, smoke: 9, scars: 7 };
type Wave = { id: number; main: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>; trail: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>; burst: boolean };
const waves = new Map<number, Wave>();
// 반지름 1의 반달 띠(안쪽 inner ~ 1), 부채꼴 FINALE.arc°, uv: u = 호, v = 안→바깥. 앞 = +z(facing 규칙), dir만큼 돌린다
function crescent(dir: number) {
  const half = ((FINALE.arc / 2) * Math.PI) / 180;
  const pos: number[] = [];
  const uv: number[] = [];
  for (let i = 0; i < SLASH.seg; i++) {
    const [u0, u1] = [i / SLASH.seg, (i + 1) / SLASH.seg];
    const [a, b] = [dir - half + 2 * half * u0, dir - half + 2 * half * u1];
    const t = (r: number, x: number) => [Math.sin(x) * r, 0, Math.cos(x) * r];
    pos.push(...t(SLASH.inner, a), ...t(1, a), ...t(1, b), ...t(SLASH.inner, a), ...t(1, b), ...t(SLASH.inner, b));
    uv.push(u0, 0, u0, 1, u1, 1, u0, 0, u1, 1, u1, 0);
  }
  return new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)).setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
}
// 검기가 처음 나간 순간: 불티·검은 연기·바닥 흉터
function finaleBurst(f: World['finales'][number]) {
  const half = ((FINALE.arc / 2) * Math.PI) / 180;
  for (let i = 0; i < SLASH.embers; i++) {
    const a = f.dir - half + Math.random() * 2 * half;
    const sp = 4 + Math.random() * 5;
    spark(new THREE.Vector3(f.x + Math.sin(a) * 0.8, 0.5 + Math.random() * 0.4, f.z + Math.cos(a) * 0.8), new THREE.Vector3(Math.sin(a) * sp, 1 + Math.random() * 2, Math.cos(a) * sp), { color: Math.random() < 0.3 ? 0xff7050 : 0xc01828, size: 0.06 + Math.random() * 0.05, life: 0.5 + Math.random() * 0.4, add: true, fall: 6 });
  }
  for (let i = 0; i < SLASH.smoke; i++) {
    const a = f.dir - half + Math.random() * 2 * half;
    const r = 1.5 + Math.random() * (FINALE.radius - 2);
    spark(new THREE.Vector3(f.x + Math.sin(a) * r, 0.3, f.z + Math.cos(a) * r), new THREE.Vector3(Math.sin(a) * 1.2, 0.6, Math.cos(a) * 1.2), { color: 0x0c0608, size: 0.25 + Math.random() * 0.2, life: 1.1, smoke: true, grow: 1.2, opacity: 0.55 });
  }
  for (let i = 0; i < SLASH.scars; i++) {
    const a = f.dir - half * 0.9 + (2 * half * 0.9 * i) / (SLASH.scars - 1) + (Math.random() - 0.5) * 0.1;
    const [r0, r1] = [1.2 + Math.random() * 0.8, FINALE.radius * (0.75 + Math.random() * 0.25)];
    let p = new THREE.Vector3(f.x + Math.sin(a) * r0, 0.04, f.z + Math.cos(a) * r0);
    for (let s = 1; s <= 3; s++) {
      const r = r0 + ((r1 - r0) * s) / 3;
      const aa = a + (Math.random() - 0.5) * 0.12;
      const q = new THREE.Vector3(f.x + Math.sin(aa) * r, 0.04, f.z + Math.cos(aa) * r);
      line(p, q, { geo: BLADE, color: 0x6a0812, width: 0.12 - s * 0.025, life: 1.4 });
      p = q;
    }
  }
}
function syncFinales(world: World) {
  const live = new Set(world.finales.map((f) => f.id));
  for (const [id, wv] of waves) {
    if (live.has(id)) continue;
    for (const m of [wv.main, wv.trail]) (m.removeFromParent(), m.geometry.dispose(), m.material.dispose());
    waves.delete(id);
  }
  for (const f of world.finales) {
    let wv = waves.get(f.id);
    if (!wv) {
      slashTex ??= slashTexture();
      const geo = crescent(f.dir);
      const m = (color: number, order: number) => {
        const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: slashTex, color, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
        mesh.renderOrder = order; // 깊이를 안 쓰는 판이라 바닥 다음에 그려야 덮이지 않는다(iaido 칼선과 같다)
        legendGroup.add(mesh);
        return mesh;
      };
      wv = { id: f.id, trail: m(0x502030, 3), main: m(0xffffff, 4), burst: false };
      waves.set(f.id, wv);
    }
    if (!wv.burst) ((wv.burst = true), finaleBurst(f), rumble(0.14));
    const reach = (age: number) => 0.8 + (FINALE.radius - 0.8) * (1 - (1 - Math.max(0, Math.min(1, age / FINALE.age))) ** 3); // 확 뻗고 끝에서 느려진다
    const k = f.age / FINALE.age;
    wv.main.position.set(f.x, SLASH.y, f.z);
    wv.main.scale.setScalar(reach(f.age));
    wv.main.material.opacity = 1 - k ** 4;
    wv.trail.position.set(f.x, SLASH.y - 0.05, f.z);
    wv.trail.scale.setScalar(reach(f.age - SLASH.lag)); // 한 박자 늦은 어두운 잔상
    wv.trail.material.opacity = 0.7 * (1 - k ** 2);
  }
}

// ---- 천둥새 ----
const STORM = { core: 0xe8f8ff, glow: 0x5ab4ff, cw: 0.05, gw: 0.16, life: 0.06, jag: 0.22, keep: 7, branch: 0.25, bolt: 0xd8f0ff, bw: 0.06, blife: 0.2, segs: 4 };
const trails = new Map<number, THREE.Vector3[]>(); // 화살마다 지나온 자리(최근 keep개)
let sparkSeen = -1;
const P = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const jitter = (v: THREE.Vector3, j: number) => v.clone().add(P((Math.random() - 0.5) * j, (Math.random() - 0.5) * j, (Math.random() - 0.5) * j));
// 궤적을 따라 지글거리는 번개: 지나온 점들 사이를 매 프레임 새로 꺾어 그린다(짧게 살아 깜빡인다). 가끔 곁가지
function zap(path: THREE.Vector3[]) {
  let prev = path[0];
  for (let i = 1; i < path.length; i++) {
    for (let s = 1; s <= 2; s++) {
      const q = s === 2 && i === path.length - 1 ? path[i] : jitter(prev.clone().lerp(path[i], 0.5 * s), STORM.jag);
      line(prev, q, { geo: BLADE, color: STORM.glow, width: STORM.gw, life: STORM.life });
      line(prev, q, { geo: BLADE, color: STORM.core, width: STORM.cw, life: STORM.life, over: true });
      if (Math.random() < STORM.branch / path.length) line(q, jitter(q, 0.7), { geo: BLADE, color: STORM.glow, width: STORM.cw, life: STORM.life });
      prev = q;
    }
  }
}
function syncStorm(world: World) {
  const on = hasUnique(world, 'stormBow');
  const live = new Set<number>();
  for (const s of world.shots) {
    if (s.kind !== 'shaft' && s.kind !== 'pierce') continue;
    live.add(s.id);
    if (s.wait) continue;
    const path = trails.get(s.id) ?? [];
    path.push(P(s.x, 0.95, s.z));
    if (path.length > STORM.keep) path.shift();
    trails.set(s.id, path);
    if (on && path.length > 1) zap(path);
  }
  for (const id of trails.keys()) if (!live.has(id)) trails.delete(id);
  for (const b of world.blasts) {
    if (b.kind !== 'spark' || b.id <= sparkSeen) continue;
    sparkSeen = b.id;
    if (b.fx === undefined || b.fz === undefined) continue;
    let a = P(b.fx, 0.9, b.fz);
    for (let i = 1; i <= STORM.segs; i++) {
      const t = i / STORM.segs;
      const j = i === STORM.segs ? 0 : 0.35;
      const c = P(b.fx + (b.x - b.fx) * t + (Math.random() - 0.5) * j, 0.9 + (Math.random() - 0.5) * j, b.fz + (b.z - b.fz) * t + (Math.random() - 0.5) * j);
      line(a, c, { geo: BLADE, color: STORM.bolt, width: STORM.bw, life: STORM.blife, over: true });
      a = c;
    }
  }
}

// 허수아비(도망자의 장화): 장대·가로대·누더기 웃옷·자루 머리·밀짚모자·소매 짚. 맞으면 흔들린다
const scarecrows = new Map<number, { root: THREE.Group; hp: number; wob: number }>();
const WOOD = 0x6b4a2b, CLOTH = 0x7d6a4a, SACK = 0xc9a66b, HAT = 0x5a4126, STRAW = 0xe0c060;
function makeScarecrow(): THREE.Group {
  const root = new THREE.Group();
  root.add(box(0.07, 1.5, 0.07, WOOD, 0, 0.75, 0), box(1.0, 0.06, 0.06, WOOD, 0, 1.15, 0), box(0.42, 0.5, 0.22, CLOTH, 0, 1.0, 0));
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), mat(SACK, 0.15));
  head.position.y = 1.42;
  const crown = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.2, 6), mat(HAT, 0.1));
  crown.position.y = 1.68;
  root.add(head, crown, box(0.42, 0.04, 0.42, HAT, 0, 1.57, 0));
  for (const s of [-1, 1]) root.add(box(0.12, 0.16, 0.1, STRAW, s * 0.52, 1.1, 0, 0, 0, s * 0.4, 0.2), box(0.1, 0.14, 0.08, STRAW, s * 0.08, 0.7, 0, 0, 0, s * 0.3, 0.2));
  root.rotation.y = Math.PI / 4; // 가로대가 카메라를 본다
  legendGroup.add(root);
  return root;
}
function syncScarecrows(world: World, dt: number, time: number) {
  const live = new Set<number>();
  for (const a of world.allies) {
    if (!a.decoy) continue;
    live.add(a.id);
    let s = scarecrows.get(a.id);
    if (!s) scarecrows.set(a.id, (s = { root: makeScarecrow(), hp: a.hp, wob: 0 }));
    if (a.hp < s.hp) s.wob = 1; // 맞았다
    s.hp = a.hp;
    s.wob = Math.max(0, s.wob - dt * 2.5);
    s.root.position.set(a.x, 0, a.z);
    s.root.rotation.z = Math.sin(time * 30) * 0.15 * s.wob;
    s.root.scale.setScalar(Math.min(1, a.life / 0.25)); // 사라질 때 쪼그라든다
  }
  for (const [id, s] of scarecrows) if (!live.has(id)) (s.root.removeFromParent(), scarecrows.delete(id));
}

// 렌더 프레임마다. dt = 0이면 멈춤(자리만 맞춘다)
export function legendFx(world: World, dt: number, time: number) {
  const live = new Set<number>();
  for (const a of world.allies) {
    if (a.from !== 'graveKing') continue;
    live.add(a.id);
    let k = kings.get(a.id);
    if (!k) kings.set(a.id, (k = makeKing()));
    placeKing(k, a, world, dt, time);
  }
  for (const [id, k] of kings) if (!live.has(id) && !sinkKing(k, dt)) (k.root.removeFromParent(), kings.delete(id));
  syncScarecrows(world, dt, time);
  syncFinales(world);
  syncStorm(world);
  tickBits(dt);
}

export function resetLegendFx(world: World) {
  for (const k of kings.values()) k.root.removeFromParent();
  kings.clear();
  for (const s of scarecrows.values()) s.root.removeFromParent();
  scarecrows.clear();
  trails.clear();
  for (const b of bits) b.m.removeFromParent();
  bits = [];
  sparkSeen = Math.max(-1, ...world.blasts.filter((b) => b.kind === 'spark').map((b) => b.id));
}
