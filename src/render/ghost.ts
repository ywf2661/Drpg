// 잔상 그리기(마법사 잔상 탭): 주인공 판자를 복제해 반투명 하늘색으로 살짝 깜빡이게, 발밑에 줄어드는 남은 시간 고리,
// 따라 쓸 때 시전 동작과 밝아짐, 자리 바꾸기 빛줄기. 설계: docs/superpowers/specs/2026-11-19-afterimage-tab-design.md. sim은 바꾸지 않는다.
import * as THREE from 'three';
import { AFTERIMAGE, type Ghost, type World } from '../sim/world';
import { CAST_SHOW, ghostSprite, updateSprite, type Sprite } from './sprites';
import { BLADE, line } from './iaido';

export const GHOST_COLOR = 0x8fd3ff;
const LOOK = { base: 0.5, flicker: 0.08, flash: 0.35, warn: 1, bright: 1.6 }; // 투명도, 깜빡임 폭, 따라 쓸 때 더 밝게, 마지막 warn초는 빠르게 깜빡임, 색 밝기
const RING = { inner: 0.42, outer: 0.5, segs: 32, opacity: 0.7 };
const BEAM = { width: 0.55, life: 0.4, grow: 0.06, y: 0.6 };

// 잔상의 투명도(0 = 안 보임): 서기 전(지나온 길)엔 0, 평소 반투명으로 살짝 일렁이고, 따라 쓰는 순간 밝아지고, 마지막 1초는 빠르게 깜빡인다
export function ghostOpacity(g: Ghost, time: number): number {
  if (g.queue.length) return 0;
  const warn = g.t < LOOK.warn && Math.sin(time * 30) < 0 ? 0.4 : 1;
  const a = (LOOK.base + LOOK.flicker * Math.sin(time * 18 + g.id) + (LOOK.flash * g.flash) / AFTERIMAGE.flash) * warn;
  return Math.min(1, Math.max(0, a));
}
// 남은 시간 고리가 보이는 몫(1 = 한 바퀴)
export const ghostArc = (g: Ghost) => (g.full > 0 ? Math.min(1, Math.max(0, g.t / g.full)) : 0);
// 고리 그릴 조각 수(RingGeometry 조각마다 삼각형 둘 = 색인 6개)
export const arcIndices = (arc: number) => 6 * Math.ceil(RING.segs * arc);

export const ghostGroup = new THREE.Group();
type Shown = { s: Sprite; ring: THREE.Mesh; flash: number };
const shown = new Map<number, Shown>();
let swapSeen = -1;

function show(world: World, g: Ghost): Shown {
  const s = ghostSprite(world.entities[0]);
  const geo = new THREE.RingGeometry(RING.inner, RING.outer, RING.segs, 1, Math.PI / 2, Math.PI * 2);
  const ring = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: GHOST_COLOR, transparent: true, opacity: RING.opacity, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  ring.renderOrder = 1;
  ghostGroup.add(s.mesh, ring);
  return { s, ring, flash: g.flash };
}

function drop(id: number) {
  const v = shown.get(id)!;
  v.s.mesh.removeFromParent();
  v.s.mat.map?.dispose();
  v.s.mat.dispose();
  v.ring.removeFromParent();
  v.ring.geometry.dispose();
  (v.ring.material as THREE.Material).dispose();
  shown.delete(id);
}

export function ghostFx(world: World, time: number, dt: number) {
  const live = new Set(world.ghosts.map((g) => g.id));
  for (const id of [...shown.keys()]) if (!live.has(id)) drop(id);
  const hero = world.entities[0];
  for (const g of world.ghosts) {
    const a = ghostOpacity(g, time);
    if (a <= 0 && !shown.has(g.id)) continue;
    const v = shown.get(g.id) ?? shown.set(g.id, show(world, g)).get(g.id)!;
    if (g.flash > v.flash) v.s.castT = CAST_SHOW; // 따라 썼다: 시전 동작
    v.flash = g.flash;
    updateSprite(v.s, { ...hero, x: g.x, z: g.z, facing: g.facing, state: 'idle', phase: 'none', hp: v.s.hp, maxHp: v.s.maxHp }, dt, 1);
    v.s.mesh.renderOrder = 3; // 주인공 다음에(반투명)
    v.s.mat.color.setHex(GHOST_COLOR).multiplyScalar(LOOK.bright);
    v.s.mat.opacity = a;
    v.ring.position.set(g.x, 0.03, g.z);
    v.ring.geometry.setDrawRange(0, arcIndices(ghostArc(g)));
    (v.ring.material as THREE.MeshBasicMaterial).opacity = RING.opacity * Math.min(1, a / LOOK.base);
  }
  for (const sw of world.swaps) {
    if (sw.id <= swapSeen) continue;
    line(new THREE.Vector3(sw.x0, BEAM.y, sw.z0), new THREE.Vector3(sw.x1, BEAM.y, sw.z1), { geo: BLADE, color: GHOST_COLOR, width: BEAM.width, life: BEAM.life, grow: BEAM.grow });
    swapSeen = sw.id;
  }
}

export function resetGhosts(world: World) {
  for (const id of [...shown.keys()]) drop(id);
  swapSeen = Math.max(-1, ...world.swaps.map((s) => s.id));
}
