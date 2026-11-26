// 사암 신전 그림(설계: docs/superpowers/specs/2026-11-26-act2-temple-design.md 2·3절): 도는 돌 고리·자칼 손잡이·햇빛·봉인.
//   고리: 고리마다 가운데를 축으로 한 묶음(돌 상자들 + 손잡이). sim 각도(q + turn)만큼 돌린다 — 처음 만든 방향(q0)에서 얼마나 돌았는가
//   햇빛: 해 틈에서 빛이 멈춘 곳까지 바닥의 밝은 띠 + 비스듬히 내리꽂는 빛기둥(더하기 섞기). 해 틈 자체도 밝게
//   봉인: 가운데 푸른 문양 원판. 열리면 하얗게 빛나며 맥동한다
import * as THREE from 'three';
import type { World } from '../sim/world';
import { isStone } from '../sim/temple';

const DIR: [number, number][] = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const SAND = new THREE.Color(1.3, 1.05, 0.72); // 사암 물들이기(폐허 돌 그림에 — 담·모래 언덕)
const RING = new THREE.Color(1.25, 1.08, 0.85); // 도는 고리는 담보다 밝게(움직이는 돌이 한눈에 보이게)
let group: THREE.Group | null = null;
let rings: { pivot: THREE.Group; q0: number }[] = [];
let beam: { floor: THREE.Mesh; shaft: THREE.Mesh; mat: THREE.MeshBasicMaterial; shaftMat: THREE.MeshBasicMaterial } | null = null;
let seal: THREE.MeshBasicMaterial | null = null;

// 봉인 문양(캔버스): 겹 원과 사방의 자칼 눈 무늬
function sealTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.translate(64, 64);
  g.strokeStyle = '#ffffff';
  for (const [r, wd] of [[60, 5], [48, 2], [30, 3]] as const) {
    g.lineWidth = wd;
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.stroke();
  }
  for (let k = 0; k < 8; k++) {
    g.rotate(Math.PI / 4);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.ellipse(0, -39, 4, 7, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.beginPath();
  g.arc(0, 0, 10, 0, Math.PI * 2);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 빛 띠 질감: 가운데가 밝고 양옆으로 흐려진다(가로 = 빛 폭)
function beamTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  [c.width, c.height] = [64, 4];
  const g = c.getContext('2d')!;
  const grd = g.createLinearGradient(0, 0, 64, 0);
  grd.addColorStop(0, 'rgba(255,255,255,0)');
  grd.addColorStop(0.3, 'rgba(255,255,255,0.8)');
  grd.addColorStop(0.5, 'rgba(255,255,255,1)');
  grd.addColorStop(0.7, 'rgba(255,255,255,0.8)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 4);
  return new THREE.CanvasTexture(c);
}

// 빛기둥 질감: 바닥 쪽이 밝고 위로 흐려진다
function shaftTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  [c.width, c.height] = [4, 64];
  const g = c.getContext('2d')!;
  const grd = g.createLinearGradient(0, 64, 0, 0);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 4, 64);
  return new THREE.CanvasTexture(c);
}

// 맵이 바뀔 때. 신전이 아니면 null. side = 벽 옆면 재질 두 개(+x, +z), top = 윗면
export function buildTemple(world: World, side: THREE.Material[], top: THREE.Material): THREE.Group | null {
  if (group) {
    group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        for (const m of [o.material].flat()) if (!side.includes(m) && m !== top) m.dispose();
      }
    });
    [group, rings, beam, seal] = [null, [], null, null];
  }
  const t = world.temple;
  if (!t) return null;
  group = new THREE.Group();
  const [ox, oz] = [t.cx + 0.5, t.cz + 0.5];
  const box = new THREE.BoxGeometry(1, 1.2, 1);
  const m = new THREE.Matrix4();
  const gold = new THREE.MeshStandardMaterial({ color: 0xd8a640, metalness: 0.6, roughness: 0.35, emissive: 0x2a1a00 });
  const jackal = new THREE.MeshStandardMaterial({ color: 0x1c1712, roughness: 0.6 });
  t.rings.forEach((g, k) => {
    const pivot = new THREE.Group();
    pivot.position.set(ox, 0, oz);
    const a = (g.q * Math.PI) / 2;
    const R = Math.ceil(g.out) + 1;
    const cells: [number, number][] = [];
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) if (isStone(g.r, g.out, a, dx, dz)) cells.push([dx, dz]);
    const [a0, a1, tp] = [side[0].clone(), side[1].clone(), top.clone()] as THREE.MeshStandardMaterial[];
    for (const mt of [a0, a1, tp]) mt.color.multiply(RING);
    const mesh = new THREE.InstancedMesh(box, [a0, a0, tp, tp, a1, a1], cells.length);
    cells.forEach(([dx, dz], i) => mesh.setMatrixAt(i, m.makeTranslation(dx, 0.6, dz)));
    mesh.castShadow = mesh.receiveShadow = true;
    pivot.add(mesh);
    // 자칼 손잡이: 고리 벽 안팎으로 튀어나온 검은 자칼 머리 + 금빛 눈
    for (const q of [(g.q + 1) % 4, (g.q + 3) % 4]) {
      const [ux, uz] = DIR[q];
      for (const s of [-1, 1]) {
        const head = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 4), jackal);
        head.rotation.set(0, 0, 0);
        head.position.set(ux * (g.r + s * 0.55), 0.75, uz * (g.r + s * 0.55));
        head.rotation.x = (uz * s * Math.PI) / 2;
        head.rotation.z = (-ux * s * Math.PI) / 2;
        const ear = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.3, 3), jackal);
        ear.position.set(ux * (g.r + s * 0.5), 1.05, uz * (g.r + s * 0.5));
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), gold);
        eye.position.set(ux * (g.r + s * 0.75), 0.82, uz * (g.r + s * 0.75));
        pivot.add(head, ear, eye);
      }
    }
    group!.add(pivot);
    rings[k] = { pivot, q0: g.q };
  });
  // 햇빛: 바닥 띠 + 빛기둥(해 틈 쪽 높은 곳에서 비스듬히 내려온다)
  const tex = beamTexture();
  const mat = new THREE.MeshBasicMaterial({ map: tex, color: 0xffd890, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), mat);
  floor.renderOrder = 2;
  const shaftMat = new THREE.MeshBasicMaterial({ map: shaftTexture(), color: 0xffe2a8, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const shaft = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), shaftMat);
  shaft.renderOrder = 2;
  beam = { floor, shaft, mat, shaftMat };
  group.add(floor, shaft);
  // 해 틈: 담 구멍에 밝은 빛 판
  const [sx, sz] = DIR[t.sun];
  const slit = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.2), new THREE.MeshBasicMaterial({ map: shaftTexture(), color: 0xffe0a0, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  slit.position.set(ox + sx * (t.wall - 0.45), 0.6, oz + sz * (t.wall - 0.45)); // 해 틈 안쪽 면
  slit.rotation.y = sx ? Math.PI / 2 : 0;
  group.add(slit);
  // 봉인
  seal = new THREE.MeshBasicMaterial({ map: sealTexture(), color: 0x3a7bd8, transparent: true, depthWrite: false });
  const disc = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.2).rotateX(-Math.PI / 2), seal);
  disc.position.set(ox, 0.03, oz);
  disc.renderOrder = 1;
  group.add(disc);
  tickTempleArt(0, world);
  return group;
}

// 매 프레임: 고리 각도, 빛 길이, 봉인 빛
export function tickTempleArt(time: number, world: World) {
  const t = world.temple;
  if (!group || !t || !beam || !seal) return;
  t.rings.forEach((g, k) => {
    const r = rings[k];
    if (r) r.pivot.rotation.y = (-(g.q + g.turn - r.q0) * Math.PI) / 2;
  });
  // 빛: 해 틈 안쪽 가장자리(t.wall) → 멈춘 곳(t.reach). 길이가 0이면 감춘다
  const [ux, uz] = DIR[t.sun];
  const len = Math.max(0, t.wall - t.reach);
  const mid = (t.wall + t.reach) / 2;
  const [ox, oz] = [t.cx + 0.5, t.cz + 0.5];
  beam.floor.visible = beam.shaft.visible = len > 0;
  beam.floor.position.set(ox + ux * mid, 0.04, oz + uz * mid);
  beam.floor.scale.set(ux ? len : 3.2, 1, uz ? len : 3.2);
  beam.mat.map!.center.set(0.5, 0.5);
  beam.mat.map!.rotation = ux ? Math.PI / 2 : 0; // 띠의 밝은 가운데가 빛줄기 축을 따라
  beam.shaft.position.set(ox + ux * mid, 1.6, oz + uz * mid);
  beam.shaft.scale.set(len, 3.2, 1);
  beam.shaft.rotation.set(0, ux ? 0 : Math.PI / 2, 0);
  beam.shaft.rotation.x = 0;
  const flick = 0.9 + 0.1 * Math.sin(time * 1.7);
  beam.mat.opacity = 0.55 * flick;
  beam.shaftMat.opacity = 0.2 * flick;
  // 봉인: 닫히면 어두운 푸른빛, 열리면 하얗게 맥동
  if (t.open) seal.color.setRGB(1.6 + 0.4 * Math.sin(time * 4), 1.7 + 0.4 * Math.sin(time * 4), 2.2);
  else seal.color.set(0x3a7bd8).multiplyScalar(0.8 + 0.2 * Math.sin(time * 1.3));
}

// 벽 상자 대신 바닥을 깔 칸(고리가 지나가는 땅·봉인·해 틈): render.buildMap이 묻는다
export function templeFloor(world: World): Set<number> {
  const t = world.temple;
  const out = new Set<number>();
  if (!t) return out;
  for (const g of t.rings) for (const i of g.cells) out.add(i);
  for (const i of t.seal) out.add(i);
  const [ux, uz] = DIR[t.sun];
  for (let k = t.wall; k <= t.wall + 1; k++) for (const p of [-1, 0, 1]) out.add((t.cz + uz * k + ux * p) * world.grid.w + t.cx + ux * k - uz * p);
  return out;
}

export const TEMPLE_TINT = SAND;
