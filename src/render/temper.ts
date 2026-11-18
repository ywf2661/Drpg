// 벼림 연출: 손 높이의 빛 점(낮에도 보이게), 휘두를 때 칼 궤적과 불티(불은 솟고 서리는 얼음 조각이 튄다),
// 강화 효과를 받은 적 위의 터짐, 해방 참격 칼선. 설계: docs/superpowers/specs/2026-11-18-temper-fx-design.md
// 무기 물들이기는 sprites.ts의 looksOf가, 횃불 색 섞기·숫자·번쩍임 색은 render.ts가 맡는다. sim은 바꾸지 않는다.
import * as THREE from 'three';
import type { World } from '../sim/world';
import type { EdgeHit } from '../sim/rules';
import { EDGE_COLOR, edgeBlink, edgeColor, ready } from './edge';
import { BLADE, LENS, line } from './iaido';
import { pause, rumble } from './feel';

const HAND = 0.7; // 빛 점·해방 칼선 높이(m)
const TIP = 0.9; // 불티가 나오는 칼끝 높이
const BODY = 0.8; // 적 위 터짐 높이
const AHEAD = 0.35; // 바라보는 쪽으로 비키는 거리(몸통을 가리지 않게)
const ARC = { ahead: 0.6, half: 0.7, y: 0.65, width: 0.5, life: 0.2, grow: 0.04 }; // 휘두름 궤적(초승달)
const SWING = { n: 16, size: 0.18, life: 0.5, spread: 1.2 }; // 휘두름 불티
const BURST = { n: 6, size: 0.14, life: 0.35, spread: 1.4, glow: 0.9, glowLife: 0.2, gap: 0.3 }; // 적 위 터짐(gap: 같은 적은 이 간격 안에 다시 안 터진다 — 회오리 틱 0.25초보다 길게)
const SHARD = '#6fbbee'; // 얼음 조각 색: 가산 혼합 대신 보통 혼합이라 낮 눈밭에서도 보이게 조금 짙게
const RISE = 1.2; // 불티가 솟는 빠르기(m/s)
const GRAVITY = 6; // 얼음 조각이 떨어지는 가속(m/s²)
const SLASH = { len: 3, width: 0.5, life: 0.3, grow: 0.06, rim: 0.18, rimWidth: 0.12, stop: 0.03, shake: 0.12, stopGap: 0.5 }; // 해방 칼선(rim: 위아래 테두리 두 줄, stopGap: 멈칫 사이 최소 간격 — 회오리가 끈적이지 않게)
const hex = (c: string) => parseInt(c.slice(1), 16);
const UP = new THREE.Vector3(0, 1, 0);

export const temperGroup = new THREE.Group();

// 텍스처는 처음 쓸 때 만든다(모듈만 불러오는 테스트엔 document가 없다)
function canvasTexture(draw: (x: CanvasRenderingContext2D) => void) {
  const c = Object.assign(document.createElement('canvas'), { width: 32, height: 32 });
  draw(c.getContext('2d')!);
  return new THREE.CanvasTexture(c);
}
// 부드러운 둥근 빛
let glowTex: THREE.Texture | null = null;
const glowTexture = () =>
  canvasTexture((x) => {
    const g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.6)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 32, 32);
  });
// 얼음 조각: 길쭉한 마름모
let shardTex: THREE.Texture | null = null;
const shardTexture = () =>
  canvasTexture((x) => {
    x.fillStyle = '#fff';
    x.beginPath();
    x.moveTo(16, 1);
    x.lineTo(24, 16);
    x.lineTo(16, 31);
    x.lineTo(8, 16);
    x.closePath();
    x.fill();
  });
// depthTest 끔: 적 몸 한가운데 띄우는 빛이 적 판자에 반쯤 가리지 않게(발도 칼선의 over와 같다)
const additive = () => new THREE.SpriteMaterial({ map: (glowTex ??= glowTexture()), transparent: true, depthWrite: false, depthTest: false, toneMapped: false, blending: THREE.AdditiveBlending });

// 가산 혼합 판자 풀(불티·얼음 조각·적 위 빛). 다 산 것을 돌려 쓴다
type Bit = { s: THREE.Sprite; vx: number; vy: number; vz: number; spin: number; age: number; life: number; size: number; kind: 'flame' | 'frost' | 'glow' };
const bits: Bit[] = [];
function bit(): Bit {
  let b = bits.find((q) => q.age >= q.life);
  if (!b) {
    b = { s: new THREE.Sprite(additive()), vx: 0, vy: 0, vz: 0, spin: 0, age: 0, life: 0, size: 0, kind: 'glow' };
    b.s.renderOrder = 5;
    temperGroup.add(b.s);
    bits.push(b);
  }
  return b;
}

// (x, y, z)에서 불티 n개: 불은 위로 솟으며 줄고, 서리는 얼음 조각이 바깥으로 튀어 떨어진다. 해방은 반씩
function emit(x: number, y: number, z: number, n: number, kind: EdgeHit['kind'], o: { size: number; life: number; spread: number }) {
  for (let i = 0; i < n; i++) {
    const b = bit();
    const k = kind === 'both' ? (i % 2 ? 'frost' : 'flame') : kind;
    const a = Math.random() * Math.PI * 2;
    const v = o.spread * (0.4 + 0.6 * Math.random());
    Object.assign(b, { kind: k, age: 0, life: o.life * (0.7 + 0.3 * Math.random()), size: o.size * (0.7 + 0.6 * Math.random()), vx: Math.cos(a) * v, vz: Math.sin(a) * v });
    if (k === 'flame') Object.assign(b, { vx: b.vx * 0.4, vz: b.vz * 0.4, vy: RISE * (0.6 + 0.6 * Math.random()), spin: 0 });
    else Object.assign(b, { vy: 0.8 + Math.random(), spin: (Math.random() - 0.5) * 12 });
    b.s.material.map = k === 'frost' ? (shardTex ??= shardTexture()) : (glowTex ??= glowTexture());
    blend(b, k === 'frost' ? THREE.NormalBlending : THREE.AdditiveBlending);
    b.s.material.color.set(k === 'frost' ? SHARD : EDGE_COLOR[k]);
    b.s.material.rotation = Math.random() * Math.PI;
    b.s.position.set(x, y, z);
  }
}

// 혼합 방식이 바뀔 때만 셰이더를 다시 만든다
function blend(b: Bit, mode: THREE.Blending) {
  if (b.s.material.blending === mode) return;
  b.s.material.blending = mode;
  b.s.material.needsUpdate = true;
}

// 적 몸 위에 확 켜졌다 사그라드는 강화 색 빛
function glowAt(x: number, z: number, color: string) {
  const b = bit();
  Object.assign(b, { kind: 'glow', age: 0, life: BURST.glowLife, size: BURST.glow, vx: 0, vy: 0, vz: 0, spin: 0 });
  b.s.material.map = glowTex ??= glowTexture();
  blend(b, THREE.AdditiveBlending);
  b.s.material.color.set(color);
  b.s.material.rotation = 0;
  b.s.position.set(x, BODY, z);
}

function updateBits(dt: number) {
  for (const b of bits) {
    b.s.visible = b.age < b.life;
    if (!b.s.visible) continue;
    b.age += dt;
    const p = Math.min(1, b.age / b.life);
    if (b.kind === 'glow') {
      b.s.scale.setScalar(b.size * (0.5 + 0.5 * Math.sin((Math.PI / 2) * Math.min(1, p * 3)))); // 확 커졌다가
      b.s.material.opacity = 1 - p * p; // 사그라든다
      continue;
    }
    if (b.kind === 'frost') b.vy -= GRAVITY * dt;
    b.s.position.x += b.vx * dt;
    b.s.position.y = Math.max(0.05, b.s.position.y + b.vy * dt);
    b.s.position.z += b.vz * dt;
    b.s.material.rotation += b.spin * dt;
    b.s.scale.setScalar(b.size * (b.kind === 'flame' ? 1 - p : 1 - 0.5 * p) + 0.02);
    b.s.material.opacity = 1 - p * p;
  }
}

let glow: THREE.Sprite | null = null;
let swingsSeen = 0;
let slashesSeen = 0;
let hitSeen = -1; // 꺼내 간 강화 기록의 마지막 id(id는 늘 커진다)
const lastBurst = new Map<number, number>(); // 적 id → 마지막으로 터진 시각(실제 시간)
let lastStop: number | undefined; // 해방 칼선이 마지막으로 멈칫한 시각

// 지난 호출 뒤 새로 생긴 강화 기록(프레임마다 한 번, render가 부른다)
export function freshEdgeHits(w: World): EdgeHit[] {
  const out = w.edgeHits.filter((h) => h.id > hitSeen);
  for (const h of out) hitSeen = Math.max(hitSeen, h.id);
  return out;
}

export function resetTemper(world: World) {
  swingsSeen = world.edgeSwings;
  slashesSeen = world.edgeSlashes;
  hitSeen = Math.max(-1, ...world.edgeHits.map((h) => h.id));
  lastBurst.clear();
  lastStop = undefined;
  for (const b of bits) b.age = b.life;
}

// at = 주인공 판자 자리(발밑), time = 실제 흐른 시간(깜빡임·터짐 간격), dt = 이번 프레임, fresh = 이번 프레임의 새 강화 기록
export function temperFx(world: World, at: THREE.Vector3, time: number, dt: number, fresh: EdgeHit[]) {
  const hero = world.entities[0];
  const color = edgeColor(world);
  const [fx, fz] = [Math.sin(hero.facing), Math.cos(hero.facing)];
  if (!glow) {
    glow = new THREE.Sprite(additive());
    glow.scale.setScalar(0.3);
    glow.renderOrder = 5;
    temperGroup.add(glow);
  }
  glow.visible = !!color && hero.state !== 'dead';
  if (color) {
    glow.material.color.set(color);
    glow.material.opacity = edgeBlink(world, time) ? 0.15 : 0.9;
    glow.position.set(at.x + fx * AHEAD, HAND, at.z + fz * AHEAD);
  }
  // 충전을 쓴 휘두름: 칼 앞에 강화 색 초승달 궤적, 칼끝에서 불티.
  // 마지막 충전을 쓴 휘두름은 같은 틱에 칼이 비므로 이번 기록의 종류로 그린다
  const swung = world.edge.kind ?? fresh.at(-1)?.kind;
  if (world.edgeSwings > swingsSeen && swung) {
    const c = new THREE.Vector3(at.x + fx * ARC.ahead, ARC.y, at.z + fz * ARC.ahead);
    const side = new THREE.Vector3(fz, 0, -fx).multiplyScalar(ARC.half); // 바라보는 방향과 수직
    line(c.clone().sub(side), c.clone().add(side), { geo: LENS, color: hex(EDGE_COLOR[swung]), width: ARC.width, life: ARC.life, grow: ARC.grow });
    emit(at.x + fx * AHEAD * 2, TIP, at.z + fz * AHEAD * 2, SWING.n, swung, SWING);
  }
  swingsSeen = world.edgeSwings;
  // 강화 효과를 받은 적 위: 강화 색 빛과 불티(같은 적은 BURST.gap 안에 다시 터지지 않는다 — 회오리가 화면을 덮지 않게)
  for (const h of fresh) {
    if (!ready(lastBurst.get(h.ent), time, BURST.gap)) continue;
    lastBurst.set(h.ent, time);
    glowAt(h.x, h.z, EDGE_COLOR[h.kind]);
    emit(h.x, BODY, h.z, BURST.n, h.kind, BURST);
  }
  // 해방 참격: 바라보는 쪽 3m로 그어지는 흰 칼날, 위아래로 주황·하늘 테두리(불과 서리). 누군가 맞았으면 짧게 멈칫
  if (world.edgeSlashes > slashesSeen) {
    const a = new THREE.Vector3(at.x, HAND, at.z);
    const b = new THREE.Vector3(at.x + fx * SLASH.len, HAND, at.z + fz * SLASH.len);
    const rim = UP.clone().multiplyScalar(SLASH.rim);
    line(a, b, { geo: BLADE, color: 0xffffff, width: SLASH.width, life: SLASH.life, grow: SLASH.grow });
    line(a.clone().add(rim), b.clone().add(rim), { geo: LENS, color: hex(EDGE_COLOR.flame), width: SLASH.rimWidth, life: SLASH.life, grow: SLASH.grow });
    line(a.clone().sub(rim), b.clone().sub(rim), { geo: LENS, color: hex(EDGE_COLOR.frost), width: SLASH.rimWidth, life: SLASH.life, grow: SLASH.grow });
    if (fresh.some((h) => h.kind === 'both') && ready(lastStop, time, SLASH.stopGap)) {
      lastStop = time;
      pause(SLASH.stop);
      rumble(SLASH.shake);
    }
  }
  slashesSeen = world.edgeSlashes;
  updateBits(dt);
}
