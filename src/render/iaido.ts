// 발도 연출(그림에 없는 동작이라 판자를 움직여 만든다 — 구르기와 같은 방식): 일섬 질주, 납도, 검흔이 새겨지고 터지는 칼선.
// sim은 바꾸지 않는다. 판자 모양은 sim을 따라 멈추고(타격 멈춤 동안 그대로), 칼선·반짝임은 실제 시간으로 흐른다.
import * as THREE from 'three';
import { SHEATHE, type Entity } from '../sim/world';
import { dirIndex, type Sprite } from './sprites';
import { hitstop, pause, rumble } from './feel';
import { ghost } from './roll';
import { puff } from './rain';

const RIGHT = new THREE.Vector3(1, 0, -1).normalize(); // 화면 가로(카메라 수평 45°)
const UP = new THREE.Vector3(0, 1, 0);
const VIEW = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(60), THREE.MathUtils.degToRad(45)); // 카메라 쪽(칼선이 화면을 향하게)
const WHITE = new THREE.Color(1, 1, 1); // 흰 잔상(그림을 75% 덮은 흰 실루엣)
const RED = 0xff3030;
const WAIST = 0.55; // 칼선·반짝임 높이(m, 허리)

// 일섬
const CROUCH = 0.08; // 준비(웅크림) 시간. 그동안 sim도 멈춘다
const LEAN = 0.25; // 질주 중 진행 방향으로 기울이는 각(rad)
const LEAN_RATE = (2 * LEAN) / 0.04; // 기울기가 반대로 바뀌는 데 0.04초
const GHOST_EVERY = 0.02;
const TURN_STOP = 0.05; // 다음 적으로 꺾을 때 멈춤(초)
const TRAIL = { life: 0.35, width: 0.24 }; // 지나간 길의 칼선
const GLINT = 0.2; // 칼 넣는 반짝임(초)
// 납도
const SINK = 0.92; // 칼을 넣는 동안 판자 세로
const SNAP = 0.03; // 남은 시간이 이 아래면 원래로(밀어 넣는 순간)
// 검흔
const CUT = { len: 1.2, life: 0.25, width: 0.16, grow: 0.05 }; // 터질 때 칼선 하나
const NICK = { life: 0.1, width: 0.09 }; // 새겨질 때 붉은 사선

export const iaidoGroup = new THREE.Group();

// 칼선 모양(판자 평면 x = 길이 0..1, y = 폭): 꼬리가 뾰족하고 앞이 굵은 칼날, 가운데가 굵은 초승달
const shape = (pts: [number, number][]) => new THREE.ShapeGeometry(new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y))));
const BLADE = shape([[0, 0], [0.8, 0.5], [1, 0], [0.8, -0.5]]);
const LENS = shape([[0, 0], [0.5, 0.5], [1, 0], [0.5, -0.5]]);

type Line = { mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>; a: THREE.Vector3; b: THREE.Vector3; width: number; life: number; grow: number; age: number; live: boolean };
const lines: Line[] = [];
const basis = new THREE.Matrix4();
const ax = new THREE.Vector3();
const ay = new THREE.Vector3();
const az = new THREE.Vector3();

// a → b 칼선 하나. live면 지울 때까지(끝점을 옮기며) 그대로 두고, 아니면 life초 동안 가늘어지며 사라진다
// over: 벽·캐릭터에 가리지 않고 맨 위에(적 몸 위의 칼선). 아니면 벽 뒤로 지나간 칼선은 가린다
function line(a: THREE.Vector3, b: THREE.Vector3, o: { geo: THREE.BufferGeometry; color: number; width: number; life: number; grow?: number; live?: boolean; over?: boolean }): Line {
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

// 터짐 대기열: 같은 순간에 생긴 터짐은 순서대로 조금씩 늦게(연쇄처럼)
const bursts: { x: number; z: number; n: number; wait: number; then: () => void }[] = [];

// 검흔 n개가 터진 자리: delay초 뒤 흰 칼선 n개(X·사선 번갈아)가 동시에 그어지고 then()(붉은 터짐)
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

// 검흔이 새로 늘어난 적: 몸 위에 붉은 사선 한 줄이 번쩍(직전 개수와 비교)
const seenMarks = new WeakMap<Entity, number>();
export function markFx(s: Sprite, e: Entity) {
  const n = e.marks ?? 0;
  if (n > (seenMarks.get(e) ?? 0) && e.state !== 'dead' && s.mesh.visible) {
    const h = s.info.anchor[1] / s.info.ppm; // 발에서 그림 위까지(m)
    const c = new THREE.Vector3(e.x, h * 0.45, e.z);
    const d = RIGHT.clone().addScaledVector(UP, 1.1).normalize().multiplyScalar(h * 0.22);
    line(c.clone().sub(d), c.add(d), { geo: LENS, color: RED, width: NICK.width, life: NICK.life, over: true });
  }
  seenMarks.set(e, n);
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
  const on = e.phase === 'flash' && e.state !== 'dead';
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

// 층이 바뀔 때 옛 좌표의 상태를 비운다
export function resetIaido() {
  hop = null;
  sheathing = false;
  bursts.length = 0;
  starAt = null;
  starT = GLINT;
}

// 납도(sim phase 'sheathe', SHEATHE.delay초): 판자를 조금 낮췄다가 마지막 순간 원래로 — 칼을 밀어 넣는다. 넣는 순간 허리춤 반짝임
let sheathing = false;
export function sheatheFx(s: Sprite, e: Entity, _dt: number) {
  const on = e.phase === 'sheathe' && e.state !== 'dead';
  if (on) s.mesh.scale.y = e.phaseT > SNAP ? 1 - (1 - SINK) * Math.min(1, (SHEATHE.delay - e.phaseT) / 0.05) : 1;
  else if (sheathing && e.state !== 'dead') glint(s, e);
  sheathing = on;
}
