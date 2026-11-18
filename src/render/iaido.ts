// 발도 연출(그림에 없는 동작이라 판자를 움직여 만든다 — 구르기와 같은 방식): 일섬·스쳐 베기 질주, 바닥의 칼선과 베이는 순간.
// sim은 바꾸지 않는다. 판자 모양은 sim을 따라 멈추고(타격 멈춤 동안 그대로), 칼선·반짝임은 실제 시간으로 흐른다.
import * as THREE from 'three';
import { CUT as CUT_RULE, type Cut, type Entity, type World } from '../sim/world';
import { dirIndex, type Sprite } from './sprites';
import { hitstop, pause, rumble } from './feel';
import { ghost } from './roll';
import { puff } from './rain';

const RIGHT = new THREE.Vector3(1, 0, -1).normalize(); // 화면 가로(카메라 수평 45°)
const UP = new THREE.Vector3(0, 1, 0);
const VIEW = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(60), THREE.MathUtils.degToRad(45)); // 카메라 쪽(칼선이 화면을 향하게)
const WHITE = new THREE.Color(1, 1, 1); // 흰 잔상(그림을 75% 덮은 흰 실루엣)
const WAIST = 0.55; // 칼선·반짝임 높이(m, 허리)

// 일섬
const CROUCH = 0.08; // 준비(웅크림) 시간. 그동안 sim도 멈춘다
const LEAN = 0.25; // 질주 중 진행 방향으로 기울이는 각(rad)
const LEAN_RATE = (2 * LEAN) / 0.04; // 기울기가 반대로 바뀌는 데 0.04초
const GHOST_EVERY = 0.02;
const TURN_STOP = 0.05; // 다음 적으로 꺾을 때 멈춤(초)
const TRAIL = { life: 0.35, width: 0.24 }; // 지나간 길의 칼선
const GLINT = 0.2; // 칼 넣는 반짝임(초)
// 칼선
const CUT = { len: 1.2, life: 0.25, width: 0.16, grow: 0.05 }; // 맞은 적 몸 위 칼선 하나

export const iaidoGroup = new THREE.Group();

// 칼선 모양(판자 평면 x = 길이 0..1, y = 폭): 꼬리가 뾰족하고 앞이 굵은 칼날, 가운데가 굵은 초승달
const shape = (pts: [number, number][]) => new THREE.ShapeGeometry(new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y))));
export const BLADE = shape([[0, 0], [0.8, 0.5], [1, 0], [0.8, -0.5]]);
export const LENS = shape([[0, 0], [0.5, 0.5], [1, 0], [0.5, -0.5]]);

type Line = { mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>; a: THREE.Vector3; b: THREE.Vector3; width: number; life: number; grow: number; age: number; live: boolean };
const lines: Line[] = [];
const basis = new THREE.Matrix4();
const ax = new THREE.Vector3();
const ay = new THREE.Vector3();
const az = new THREE.Vector3();

// a → b 칼선 하나. live면 지울 때까지(끝점을 옮기며) 그대로 두고, 아니면 life초 동안 가늘어지며 사라진다
// over: 벽·캐릭터에 가리지 않고 맨 위에(적 몸 위의 칼선). 아니면 벽 뒤로 지나간 칼선은 가린다
export function line(a: THREE.Vector3, b: THREE.Vector3, o: { geo: THREE.BufferGeometry; color: number; width: number; life: number; grow?: number; live?: boolean; over?: boolean }): Line {
  let l = lines.find((l) => !l.live && l.age >= l.life);
  if (!l) {
    const mat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    l = { mesh: new THREE.Mesh(o.geo, mat), a: new THREE.Vector3(), b: new THREE.Vector3(), width: 0, life: 0, grow: 0, age: 0, live: false };
    l.mesh.renderOrder = 4; // 캐릭터 다음에
    iaidoGroup.add(l.mesh);
    lines.push(l);
  }
  l.mesh.geometry = o.geo;
  l.mesh.material.color.set(o.color);
  l.mesh.material.depthTest = !o.over;
  l.a.copy(a);
  l.b.copy(b);
  Object.assign(l, { width: o.width, life: o.life, grow: o.grow ?? 0, age: 0, live: !!o.live });
  place(l);
  return l;
}

function place(l: Line) {
  const p = l.live ? 0 : Math.min(1, l.age / l.life);
  const len = l.a.distanceTo(l.b) * (l.grow > 0 ? Math.min(1, l.age / l.grow) : 1); // 그어지는 중
  l.mesh.visible = p < 1 && len > 1e-3;
  if (!l.mesh.visible) return;
  ax.subVectors(l.b, l.a).normalize();
  ay.crossVectors(VIEW, ax).normalize();
  az.crossVectors(ax, ay);
  l.mesh.quaternion.setFromRotationMatrix(basis.makeBasis(ax, ay, az));
  l.mesh.position.copy(l.a);
  l.mesh.scale.set(len, l.width * (1 - p) ** 1.5, 1); // 가늘어진다
  l.mesh.material.opacity = 1 - p * p;
}

// 칼 넣는 반짝임: 허리춤의 네 갈래 별(실제 시간 GLINT초)
function starTexture() {
  const c = Object.assign(document.createElement('canvas'), { width: 32, height: 32 });
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.2, 'rgba(255,255,255,0.5)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  g.fillStyle = '#fff';
  g.fillRect(15, 0, 2, 32); // 세로 갈래
  g.fillRect(0, 15, 32, 2); // 가로 갈래
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter; // 도트 그대로
  return t;
}
// 처음 쓸 때 만든다(모듈을 불러오기만 하는 테스트에는 document가 없다)
let star: THREE.Sprite | null = null;
let starT = GLINT;
let starAt: THREE.Mesh | null = null;
let starSide = 1;

function glint(s: Sprite, e: Entity) {
  if (!star) {
    star = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTexture(), transparent: true, depthTest: false, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }));
    star.renderOrder = 5;
    iaidoGroup.add(star);
  }
  starT = 0;
  starAt = s.mesh;
  starSide = Math.sin(e.facing) * RIGHT.x + Math.cos(e.facing) * RIGHT.z >= 0 ? 1 : -1; // 바라보는 쪽 허리
}

// 맞은 자리 대기열: 같은 순간에 생긴 것은 순서대로 조금씩 늦게(연쇄처럼)
const bursts: { x: number; z: number; n: number; wait: number; then: () => void }[] = [];

// 칼선에 맞은 적 자리: delay초 뒤 흰 칼선 n개(X·사선 번갈아)가 동시에 그어지고 then()(붉은 터짐)
export function slashBurst(x: number, z: number, n: number, delay: number, then: () => void) {
  bursts.push({ x, z, n, wait: delay, then });
}

function cuts(x: number, z: number, n: number) {
  const c = new THREE.Vector3(x, 0.75, z);
  for (let i = 0; i < n; i++) {
    const a = (i % 2 ? -1 : 1) * (0.7 - 0.22 * Math.floor(i / 2)); // /, \, 조금 눕힌 /, \, …
    const d = RIGHT.clone().multiplyScalar(Math.cos(a)).addScaledVector(UP, Math.sin(a)).multiplyScalar(CUT.len / 2);
    const o = RIGHT.clone().multiplyScalar(((i % 3) - 1) * 0.12); // 겹치지 않게 조금씩 비킨다
    line(c.clone().add(o).sub(d), c.clone().add(o).add(d), { geo: LENS, color: 0xffffff, width: CUT.width, life: CUT.life, grow: CUT.grow, over: true });
  }
}

// 일섬 상태: 지금 칸(시작점·방향·남은 거리·자라는 칼선), 웅크림, 기울기, 직전 위치
let hop: { x: number; z: number; dx: number; dz: number; left: number; trail: Line } | null = null;
let crouch = 0;
let lean = 0;
let ghostT = 0;
let lx = 0;
let lz = 0;
const at = (x: number, z: number) => new THREE.Vector3(x, WAIST, z);
// 진행 방향의 화면 가로 성분: 오른쪽으로 갈수록 +1, 위아래로 가면 0(옆으로 기울이지 않는다)
const screenSide = (dx: number, dz: number) => Math.max(-1, Math.min(1, (dx * RIGHT.x + dz * RIGHT.z) / 0.35));

// 두 직선 (x0, z0) + t·d0, (x1, z1) + u·d1이 만나는 점(꺾인 자리). 거의 나란하면 (x1, z1)
function corner(x0: number, z0: number, dx0: number, dz0: number, x1: number, z1: number, dx1: number, dz1: number): [number, number] {
  const den = dx0 * dz1 - dz0 * dx1;
  if (Math.abs(den) < 1e-3) return [x1, z1];
  const t = Math.max(0, ((x1 - x0) * dz1 - (z1 - z0) * dx1) / den);
  return [x0 + dx0 * t, z0 + dz0 * t];
}

// 주인공 판자를 그린 뒤(rollFx·leapFx 다음) 매 프레임. dt는 실제 시간(타격 멈춤 중에도 흐른다)
export function flashFx(s: Sprite, e: Entity, dt: number) {
  const live = hitstop > 0 ? 0 : dt; // 판자 움직임은 sim과 같이 멈춘다
  const on = (e.phase === 'flash' || e.phase === 'graze') && e.state !== 'dead'; // 스쳐 베기도 같은 질주
  const mesh = s.mesh;
  if (on && !hop) {
    // 출발: 직전 자리에서 웅크렸다가(그동안 sim도 멈춘다) 튀어 나간다
    hop = { x: lx, z: lz, dx: e.dx, dz: e.dz, left: e.phaseT, trail: line(at(lx, lz), at(lx, lz), { geo: BLADE, color: 0xffffff, width: TRAIL.width, life: TRAIL.life, live: true }) };
    crouch = CROUCH;
    lean = 0.4 * LEAN * screenSide(e.dx, e.dz); // 진행 반대쪽으로 살짝(바로)
    pause(CROUCH);
    ghostT = 0;
    for (let k = 0; k < 3; k++) puff(lx + (Math.random() - 0.5) * 0.7, lz + (Math.random() - 0.5) * 0.7);
  } else if (on && hop && (e.dx * hop.dx + e.dz * hop.dz < 0.996 || e.phaseT > hop.left + 1e-6)) {
    // 다음 적으로 꺾었다: 지난 칸의 칼선을 꺾인 자리까지 긋고 잠깐 멈춤
    const [cx, cz] = corner(hop.x, hop.z, hop.dx, hop.dz, e.x, e.z, -e.dx, -e.dz);
    hop.trail.b.copy(at(cx, cz));
    hop.trail.live = false;
    hop = { x: cx, z: cz, dx: e.dx, dz: e.dz, left: e.phaseT, trail: line(at(cx, cz), at(e.x, e.z), { geo: BLADE, color: 0xffffff, width: TRAIL.width, life: TRAIL.life, live: true }) };
    pause(TURN_STOP);
    rumble(0.08);
  } else if (!on && hop) {
    // 끝: 마지막 칸 칼선을 멈춘 자리까지, 착지 흙먼지, 칼 넣는 반짝임
    const t = Math.max(0, (e.x - hop.x) * hop.dx + (e.z - hop.z) * hop.dz);
    hop.trail.b.copy(at(hop.x + hop.dx * t, hop.z + hop.dz * t));
    hop.trail.live = false;
    hop = null;
    crouch = 0;
    for (let k = 0; k < 3; k++) puff(e.x + (Math.random() - 0.5) * 0.7, e.z + (Math.random() - 0.5) * 0.7);
    if (e.state !== 'dead') glint(s, e);
  }
  if (hop) {
    const side = screenSide(hop.dx, hop.dz);
    const atk = s.info.anims.attack;
    let frame = atk.frames - 1; // 질주: 베고 지나간 자세
    let target = -LEAN * side; // 진행 방향으로 기울인다(음수 = 시계 방향 = 오른쪽)
    if (crouch > 0) {
      // 웅크림: 몸을 낮추고 진행 반대쪽으로 살짝, 칼은 뒤로
      crouch -= dt;
      mesh.position.x = hop.x;
      mesh.position.z = hop.z;
      mesh.scale.set(1.1, 0.85, 1);
      target = 0.4 * LEAN * side;
      frame = 0;
    } else {
      mesh.scale.set(1.25, 1, 1);
      hop.trail.b.copy(at(e.x, e.z)); // 칼선이 주인공을 따라 자란다
    }
    lean += Math.max(-LEAN_RATE * live, Math.min(LEAN_RATE * live, target - lean)); // 꺾을 때 뚝 바뀌지 않게
    mesh.rotation.z = lean;
    // 그림: 진행 방향을 보고 공격 동작의 한 프레임
    s.mat.map!.offset.set(frame / s.info.cols, 1 - (atk.row + dirIndex(Math.atan2(hop.dx, hop.dz)) + 1) / s.info.rows);
    if (crouch <= 0 && (ghostT -= live) <= 0) {
      ghost(s, WHITE, 0.75); // 자세를 다 잡은 뒤에 떠야 잔상도 같은 모습
      ghostT = GHOST_EVERY;
    }
    hop.left = e.phaseT;
  } else {
    lean = 0;
    if (e.phase !== 'roll') mesh.scale.x = 1;
  }
  lx = e.x;
  lz = e.z;
  update(dt);
}

// 칼선·반짝임·터짐 대기열(실제 시간)
function update(dt: number) {
  for (let i = bursts.length - 1; i >= 0; i--) {
    const b = bursts[i];
    if ((b.wait -= dt) > 0) continue;
    bursts.splice(i, 1);
    cuts(b.x, b.z, b.n);
    b.then();
  }
  for (const l of lines) {
    if (!l.live) l.age += dt;
    place(l);
  }
  starT += dt;
  if (!star) return;
  star.visible = starT < GLINT && !!starAt;
  if (star.visible && starAt) {
    const p = starT / GLINT;
    star.position.copy(starAt.position).add(RIGHT.clone().multiplyScalar(0.14 * starSide)).setY(WAIST);
    star.scale.setScalar(0.7 * Math.sin(Math.PI * Math.min(1, p * 1.4)) + 0.05); // 확 켜졌다 줄어든다
    star.material.rotation = p * 0.8;
  }
}

// 바닥의 칼선(sim world.cuts): 그어 둔 동안 흰 선 + 넓고 옅은 빛 띠가 숨 쉬듯 빛나고, 베이기 직전엔 빠르게 깜빡인다.
// 베이는 순간(world.snapped) 빛 띠가 넓게 번쩍이며 사라지고, 선을 따라 허리 높이에 칼날 빛이 그어진다
const FLOOR = { y: 0.03, core: 0.1, glow: 0.55, warn: CUT_RULE.delay * 0.3, die: 0.3, flare: 3 }; // 높이, 선 폭, 빛 폭, 깜빡이기 시작(남은 초), 베인 뒤 사라지는 시간, 그때 넓어지는 배율
const SNAP = { y: 0.35, width: 0.5, life: 0.3 }; // 베이는 칼날 빛
const ECHO_COLOR = 0xffd66b; // 칼의 여운이 남긴 칼선(금빛)
const PLANE = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2); // 바닥에 눕힌 1×1(길이 = x)
type Floor = { meshes: THREE.Mesh[]; core: THREE.MeshBasicMaterial; glow: THREE.MeshBasicMaterial; die: number }; // die: 베인 뒤 흐른 시간(-1 = 아직)
const floors = new Map<number, Floor>();
const snapSeen = new Set<number>();
let clock = 0;

const colorOf = (c: Cut) => (c.src === 'echo' ? ECHO_COLOR : 0xffffff);
function floorOf(c: Cut): Floor {
  const mat = () => new THREE.MeshBasicMaterial({ color: colorOf(c), transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending });
  const f: Floor = { meshes: [], core: mat(), glow: mat(), die: -1 };
  for (const [x0, z0, x1, z1] of c.segs) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    for (const [mat, w] of [[f.glow, FLOOR.glow], [f.core, FLOOR.core]] as const) {
      const mesh = new THREE.Mesh(PLANE, mat);
      mesh.position.set((x0 + x1) / 2, FLOOR.y, (z0 + z1) / 2);
      mesh.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
      mesh.scale.set(len + w * 0.5, 1, w); // 끝을 조금 겹쳐 꺾인 자리가 끊기지 않게
      mesh.userData.w = w;
      mesh.renderOrder = 1; // 바닥 다음, 캐릭터 전에
      iaidoGroup.add(mesh);
      f.meshes.push(mesh);
    }
  }
  floors.set(c.id, f);
  return f;
}
function drop(id: number, f: Floor) {
  for (const m of f.meshes) m.removeFromParent();
  f.core.dispose();
  f.glow.dispose();
  floors.delete(id);
}

export function cutsFx(world: World, dt: number) {
  clock += dt;
  const live = new Set<number>();
  for (const c of world.cuts) {
    live.add(c.id);
    const f = floors.get(c.id) ?? floorOf(c);
    const warn = c.t < FLOOR.warn;
    const pulse = warn ? 0.55 + 0.45 * Math.sin(clock * 50) : 0.8 + 0.2 * Math.sin(clock * 8);
    f.core.opacity = pulse;
    f.glow.opacity = (warn ? 0.5 : 0.25) * pulse;
  }
  for (const c of world.snapped) {
    if (snapSeen.has(c.id)) continue;
    snapSeen.add(c.id);
    (floors.get(c.id) ?? floorOf(c)).die = 0; // 그은 틱에 바로 베인 칼선(일섬)도 한 번은 보이게
    for (const [x0, z0, x1, z1] of c.segs) line(new THREE.Vector3(x0, SNAP.y, z0), new THREE.Vector3(x1, SNAP.y, z1), { geo: LENS, color: colorOf(c), width: SNAP.width, life: SNAP.life });
    rumble(0.15);
  }
  if (snapSeen.size > 128) for (const id of [...snapSeen]) if (!world.snapped.some((c) => c.id === id)) snapSeen.delete(id);
  for (const [id, f] of floors) {
    if (f.die < 0) {
      if (!live.has(id)) drop(id, f);
      continue;
    }
    const k = (f.die += dt) / FLOOR.die;
    if (k >= 1) {
      drop(id, f);
      continue;
    }
    f.core.opacity = 1 - k;
    f.glow.opacity = 0.8 * (1 - k);
    for (const m of f.meshes) m.scale.z = m.userData.w * (1 + (FLOOR.flare - 1) * Math.sqrt(k));
  }
}

// 층이 바뀔 때 옛 좌표의 상태를 비운다
export function resetIaido() {
  hop = null;
  bursts.length = 0;
  starAt = null;
  starT = GLINT;
  for (const [id, f] of floors) drop(id, f);
  snapSeen.clear();
}
