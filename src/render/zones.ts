// 바닥의 위험 구역(예고 공격): 붉은 테두리 + 안에서 차오르는 원(다 차면 터진다). world.zones와 평타 준비 중인 적을 읽기만 한다.
import * as THREE from 'three';
import { TELL, type World } from '../sim/world';
import { PALADIN } from '../sim/sanctum';
import { litBeams, paladinOf } from '../sim/paladin';

const flat = (color: number, opacity: number) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, toneMapped: false });
const RING = new THREE.RingGeometry(0.92, 1, 40).rotateX(-Math.PI / 2);
const DISC = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2);
const RING_MAT = flat(0xff3a22, 0.95);
const AREA_MAT = flat(0xff3a22, 0.14); // 구역 전체를 옅게
const FILL_MAT = flat(0xff5a30, 0.38); // 차오르는 부분
const shown = new Map<number, { g: THREE.Group; fill: THREE.Mesh }>();
export const zoneGroup = new THREE.Group();
// 반각 arc의 부채꼴 판·테두리(가운데 방향 +z). 반각마다 한 번
const fans = new Map<number, [THREE.BufferGeometry, THREE.BufferGeometry]>();
function fan(arc: number): [THREE.BufferGeometry, THREE.BufferGeometry] {
  if (!fans.has(arc)) {
    // CircleGeometry는 +x에서 반시계(위에서 보면 -z 쪽으로) — 눕히면 각 θ가 (cos θ, -sin θ)로 간다. +z = -π/2
    const start = -Math.PI / 2 - arc;
    fans.set(arc, [new THREE.CircleGeometry(1, 24, start, arc * 2).rotateX(-Math.PI / 2), new THREE.RingGeometry(0.92, 1, 24, 1, start, arc * 2).rotateX(-Math.PI / 2)]);
  }
  return fans.get(arc)!;
}

export function syncZones(world: World) {
  // 근접 평타를 준비 중인 적의 발밑에도 같은 원(다 차면 맞는다). id는 음수로 구역과 겹치지 않게
  const tells = world.entities
    .filter((e) => e.state === 'attack' && e.attackT < (TELL[e.kind] ?? 0))
    .map((e) => ({ id: -1 - e.id, x: e.x, z: e.z, r: 0.6, t: TELL[e.kind]! - e.attackT, total: TELL[e.kind]! }));
  const zones = [...world.zones, ...tells];
  for (const z of zones) {
    let s = shown.get(z.id);
    if (!s) {
      const g = new THREE.Group();
      const arc = (z as { arc?: number }).arc;
      const [disc, ring] = arc ? fan(arc) : [DISC, RING]; // 부채꼴(파수꾼 시계바늘 베기): 가운데가 +z, a만큼 돌린다
      const fill = new THREE.Mesh(disc, FILL_MAT);
      g.add(new THREE.Mesh(disc, AREA_MAT), fill, new THREE.Mesh(ring, RING_MAT));
      if (arc) g.rotation.y = (z as { a?: number }).a ?? 0;
      g.traverse((o) => (o.renderOrder = 1)); // 바닥 다음, 캐릭터 전에
      zoneGroup.add(g);
      shown.set(z.id, (s = { g, fill }));
    }
    s.g.position.set(z.x, 0.03, z.z);
    s.g.scale.setScalar(z.r);
    s.fill.scale.setScalar(Math.max(0.001, 1 - z.t / z.total));
  }
  for (const [id, s] of shown) {
    if (zones.some((z) => z.id === id)) continue;
    s.g.removeFromParent();
    shown.delete(id);
  }
}

// 불길·불바다·잔불이 남긴 불타는 자리의 바닥 불빛: 눕힌 주황 띠(점이면 지름 2r의 네모)(일렁이고, 꺼질 때 옅어진다). 불꽃 그림은 props.ts
const STRIP = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const fires = new Map<number, THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>>();

export function syncFires(world: World, time: number) {
  for (const f of world.fires) {
    let m = fires.get(f.id);
    if (!m) {
      m = new THREE.Mesh(STRIP, flat(0xff7a1a, 0.5));
      m.renderOrder = 1;
      zoneGroup.add(m);
      fires.set(f.id, m);
    }
    const [dx, dz] = [f.x1 - f.x0, f.z1 - f.z0];
    m.position.set((f.x0 + f.x1) / 2, 0.035, (f.z0 + f.z1) / 2);
    m.rotation.y = Math.atan2(dx, dz);
    m.scale.set(2 * f.r, 1, Math.hypot(dx, dz) + 2 * f.r);
    m.material.opacity = Math.min(1, f.t) * (0.28 + 0.1 * Math.sin(time * 18 + f.id)); // 불꽃(props.ts) 아래에 깔리는 불빛
  }
  for (const [id, m] of fires) {
    if (world.fires.some((f) => f.id === id)) continue;
    m.removeFromParent();
    m.material.dispose();
    fires.delete(id);
  }
}

// 성기사 빛의 사슬: 성기사 → 켜진 성소 바닥에 데는 폭(2 × beamR)만큼 금빛 띠(일렁인다). 공중의 가는 줄은 props.ts
const beamStrips = new Map<number, THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>>();
export function syncBeams(world: World, time: number) {
  const b = paladinOf(world);
  const lit = b ? litBeams(world) : [];
  for (const c of lit) {
    let m = beamStrips.get(c.id);
    if (!m) {
      m = new THREE.Mesh(STRIP, new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }));
      m.renderOrder = 1;
      zoneGroup.add(m);
      beamStrips.set(c.id, m);
    }
    const [x1, z1] = [c.x + 0.5, c.z + 0.5];
    const [dx, dz] = [x1 - b!.x, z1 - b!.z];
    m.position.set((b!.x + x1) / 2, 0.04, (b!.z + z1) / 2);
    m.rotation.y = Math.atan2(dx, dz);
    m.scale.set(2 * PALADIN.beamR, 1, Math.hypot(dx, dz));
    const warn = world.pal.link[c.id] ?? 0; // 잇는 중: 붉게 빠르게 깜빡(가시 바닥 예고처럼), 이어지면 금빛
    m.material.color.setHex(warn > 0 ? 0xff3a1a : 0xffd27a);
    m.material.opacity = warn > 0 ? 0.25 + 0.25 * (Math.sin(time * 24) > 0 ? 1 : 0) : 0.3 + 0.12 * Math.sin(time * 9 + c.id);
  }
  for (const [id, m] of beamStrips) {
    if (lit.some((c) => c.id === id)) continue;
    m.removeFromParent();
    m.material.dispose();
    beamStrips.delete(id);
  }
}

// 꽂힌 성검: 바닥에 선 대검(날 + 금빛 가로대, 칸 하나). 사라지기 전 0.5초 동안 흐려진다
const BLADE = new THREE.BoxGeometry(0.1, 1.3, 0.24);
const GUARD = new THREE.BoxGeometry(0.56, 0.07, 0.12);
const swordMeshes = new Map<number, { g: THREE.Group; mats: THREE.MeshBasicMaterial[] }>();
export function syncSwords(world: World) {
  for (const s of world.swords) {
    let v = swordMeshes.get(s.id);
    if (!v) {
      const mats = [new THREE.MeshBasicMaterial({ color: 0xcfd3da, transparent: true }), new THREE.MeshBasicMaterial({ color: 0xd9b45a, transparent: true })];
      const g = new THREE.Group();
      const blade = new THREE.Mesh(BLADE, mats[0]);
      blade.position.y = 0.55;
      const guard = new THREE.Mesh(GUARD, mats[1]);
      guard.position.y = 1.0;
      g.add(blade, guard);
      g.position.set(s.x + 0.5, 0, s.z + 0.5);
      g.rotation.y = Math.PI / 4; // 카메라(+x+z) 쪽으로 가로대가 보이게
      zoneGroup.add(g);
      swordMeshes.set(s.id, (v = { g, mats }));
    }
    for (const m of v.mats) m.opacity = Math.min(1, s.t / 0.5);
  }
  for (const [id, v] of swordMeshes) {
    if (world.swords.some((s) => s.id === id)) continue;
    v.g.removeFromParent();
    for (const m of v.mats) m.dispose();
    swordMeshes.delete(id);
  }
}

// 심판: 기도하는 동안 성기사 곁(judgeSafe) 밖 바닥이 붉게 차오르고, 곁에 금빛 고리. 터지면 바깥이 잠깐 번쩍인다
const JUDGE_OUT = new THREE.RingGeometry(PALADIN.judgeSafe, 30, 64).rotateX(-Math.PI / 2);
const JUDGE_EDGE = new THREE.RingGeometry(PALADIN.judgeSafe - 0.08, PALADIN.judgeSafe, 64).rotateX(-Math.PI / 2);
const judgeOut = new THREE.Mesh(JUDGE_OUT, flat(0xff3a22, 0));
const judgeEdge = new THREE.Mesh(JUDGE_EDGE, flat(0xffd27a, 0.9));
judgeOut.renderOrder = judgeEdge.renderOrder = 1;
judgeOut.visible = judgeEdge.visible = false;
zoneGroup.add(judgeOut, judgeEdge);
let judgeWas = false;
let judgeFlash = 0;
let judgeLast = 0;
export function syncJudge(world: World, time: number) {
  const dt = Math.min(0.1, Math.max(0, time - judgeLast));
  judgeLast = time;
  const b = paladinOf(world);
  const praying = b?.phase === 'pray';
  if (judgeWas && !praying && b && b.stunT <= 0) judgeFlash = 0.35; // 기도가 끝까지 갔다(끊긴 게 아니다)
  judgeWas = praying;
  judgeFlash = Math.max(0, judgeFlash - dt);
  judgeOut.visible = praying || judgeFlash > 0;
  judgeEdge.visible = praying;
  if (!judgeOut.visible || !b) return;
  judgeOut.position.set(b.x, 0.045, b.z);
  judgeEdge.position.set(b.x, 0.05, b.z);
  const k = praying ? 1 - b.phaseT / PALADIN.judgeWindup : 0;
  judgeOut.material.color.setHex(praying ? 0xff3a22 : 0xffc070);
  judgeOut.material.opacity = praying ? 0.1 + 0.35 * k : (judgeFlash / 0.35) * 0.8;
}
