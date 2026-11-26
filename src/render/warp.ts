// 뒤틀린 차원 그림(설계: docs/superpowers/specs/2026-11-26-act2-rift-design.md 2·3절). sim은 바꾸지 않는다.
//   꿰맨 조각보: 조각마다 그 땅의 바닥 그림과 빛깔, 떠 있는 두께, 소품(호숫가 나무·물웅덩이, 진지 말뚝 방책·통, 광산 결정, 신전 기둥).
//   이음매는 낮은 검푸른 돌 위 빛 실 바늘땀, 문은 짝 색의 반투명 빛 장막(열리면 스러진다). 허공 아래로 지나온 땅의 잔해가 한쪽으로 흘러간다
//   발판: 짝 색 원판, 눌리면 환하게. 불기둥: 솟기 0.6초 전 바닥이 달아오르고, 솟으면 불기둥
//   메아리: 주인공 판자를 복제한 반투명 보랏빛, 발밑에서 주인공까지 지난 4초 발자취 점선
import * as THREE from 'three';
import { WARP, type Land, type World } from '../sim/world';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ghostSprite, updateSprite, type Sprite } from './sprites';
import { wardenState } from '../sim/warden';
import { stitchState } from '../sim/stitch';

export const PAIR_COLORS = [0xffcf5a, 0x5affc8, 0xff7ab8, 0xff9a4a]; // 발판 짝·문(α β γ δ)
export const ECHO_COLOR = 0xc4a9ff;
let warpFrozen = false;
export const setWarpFrozen = (on: boolean) => (warpFrozen = on);
export const WARP_WALL = new THREE.Color(0.5, 0.52, 0.66); // 벽: 검푸른 돌
const LAND_TINT: Partial<Record<Land, THREE.Color>> = {
  lake: new THREE.Color(0.74, 0.88, 0.8), // 바닥 그림은 render.ts가 그 땅 것으로(호숫가·진지 풀, 광산 동굴 바위, 신전 폐허 돌)
  raid: new THREE.Color(0.95, 0.72, 0.5),
  mine: new THREE.Color(1.35, 1.25, 1.5),
  temple: new THREE.Color(1.32, 1.06, 0.72),
};
const STEPS = 16; // 발자취 점 수(4초)
const WARN = 0.6; // 불기둥이 솟기 전 바닥이 달아오르는 시간(초)

let group: THREE.Group | null = null;
let plates: { mat: THREE.MeshBasicMaterial; i: number; plate: THREE.Group; ring: THREE.Mesh; pulse: THREE.MeshBasicMaterial }[] = [];
let doors: { mats: THREE.MeshBasicMaterial[]; base: number[]; lace: THREE.Group; i: number; fade: number }[] = [];
let fires: { base: THREE.MeshBasicMaterial; col: THREE.Mesh; colMat: THREE.MeshBasicMaterial }[] = [];
let echo: { s: Sprite; last: [number, number]; facing: number } | null = null;
let steps: THREE.Mesh[] = [];
const hash = (x: number, z: number) => {
  let h = (x * 374761393 + z * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// 칸 곁 8칸의 방 번호들
function roomsNear(world: World, i: number): Set<number> {
  const { w, h } = world.grid;
  const [x, z] = [i % w, Math.floor(i / w)];
  const out = new Set<number>();
  for (let dz = -1; dz <= 1; dz++)
    for (let dx = -1; dx <= 1; dx++) {
      const [nx, nz] = [x + dx, z + dz];
      if (nx >= 0 && nz >= 0 && nx < w && nz < h && world.warp!.room[nz * w + nx] >= 0) out.add(world.warp!.room[nz * w + nx]);
    }
  return out;
}

// 이음매 칸과 갈라진 방향(한 방 쪽 → 다른 방 쪽 단위 벡터). 두 방 사이에 낀 막힌 칸(문·상자 빼고)
function seamDirs(world: World): Map<number, [number, number]> {
  const wp = world.warp!;
  const { w, h, blocked } = world.grid;
  const skip = new Set([...wp.doors.flatMap((d) => d.cells), ...world.chests.map((c) => c.z * w + c.x)]);
  const out = new Map<number, [number, number]>();
  blocked.forEach((b, i) => {
    if (b !== 1 || skip.has(i)) return;
    const [x, z] = [i % w, Math.floor(i / w)];
    const acc = new Map<number, [number, number, number]>();
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const [nx, nz] = [x + dx, z + dz];
        const r = nx >= 0 && nz >= 0 && nx < w && nz < h ? wp.room[nz * w + nx] : -1;
        if (r < 0) continue;
        const a = acc.get(r) ?? acc.set(r, [0, 0, 0]).get(r)!;
        (a[0] += dx), (a[1] += dz), a[2]++;
      }
    if (acc.size < 2) return;
    const [A, B] = [...acc.values()].sort((p, q) => q[2] - p[2]);
    const [nx, nz] = [B[0] / B[2] - A[0] / A[2], B[1] / B[2] - A[1] / A[2]];
    const L = Math.hypot(nx, nz) || 1;
    out.set(i, [nx / L, nz / L]);
  });
  return out;
}

// 실 한 가닥: a → b, 가운데가 lift만큼 솟거나(바늘땀) 처진다(엮은 실). 튜브 지오메트리
function thread(a: THREE.Vector3, b: THREE.Vector3, lift: number, r: number): THREE.BufferGeometry {
  const mid = a.clone().lerp(b, 0.5);
  mid.y += lift;
  return new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 10, r, 6);
}

// 문 양끝의 바늘 기둥: 청동 바늘(바늘귀 고리 + 짝 색으로 빛나는 끝)
function needle(P: THREE.Vector3, color: number): THREE.Group {
  const g = new THREE.Group();
  const bronze = new THREE.MeshStandardMaterial({ color: 0x8a6a3a, metalness: 0.6, roughness: 0.4, flatShading: true });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.1, 1.5, 8), bronze);
  shaft.position.y = 0.75;
  const eye = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.025, 6, 14), bronze);
  eye.position.y = 1.62;
  const tip = new THREE.Mesh(new THREE.OctahedronGeometry(0.07, 0), new THREE.MeshBasicMaterial({ color, toneMapped: false }));
  tip.position.y = 1.62;
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.08, 8), bronze);
  foot.position.y = 0.04;
  for (const m of [shaft, eye, foot]) m.castShadow = true;
  g.add(shaft, eye, tip, foot);
  g.position.set(P.x, 0, P.z);
  return g;
}

// 발판 문자판(흰 선, 색은 재질로): 겉 테, 열두 눈금(셋·여섯·아홉·열두는 길게), 안 테, 두 바늘
let dialTex: THREE.CanvasTexture | null = null;
function dialTexture(): THREE.CanvasTexture {
  if (dialTex) return dialTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.translate(64, 64);
  g.strokeStyle = g.fillStyle = '#fff';
  g.lineCap = 'round';
  for (const [r, wd] of [[56, 9], [42, 4]] as const) (g.lineWidth = wd), g.beginPath(), g.arc(0, 0, r, 0, Math.PI * 2), g.stroke();
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    const long = k % 3 === 0;
    g.lineWidth = long ? 8 : 5;
    g.beginPath();
    g.moveTo(Math.sin(a) * (long ? 36 : 40), -Math.cos(a) * (long ? 36 : 40));
    g.lineTo(Math.sin(a) * 52, -Math.cos(a) * 52);
    g.stroke();
  }
  g.lineWidth = 8;
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(0, -30);
  g.moveTo(0, 0);
  g.lineTo(18, 10);
  g.stroke();
  g.beginPath();
  g.arc(0, 0, 6, 0, Math.PI * 2);
  g.fill();
  dialTex = new THREE.CanvasTexture(c);
  dialTex.colorSpace = THREE.SRGBColorSpace;
  return dialTex;
}

// 문 장막: 아래가 진하고 위로 갈수록 스러지는 빛, 가로 실결
let veilTex: THREE.CanvasTexture | null = null;
function veilTexture(): THREE.CanvasTexture {
  if (veilTex) return veilTex;
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 128;
  const g = c.getContext('2d')!;
  const gr = g.createLinearGradient(0, 128, 0, 0);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 32, 128);
  g.fillStyle = 'rgba(0,0,0,0.35)';
  for (let y = 0; y < 128; y += 6) g.fillRect(0, y, 32, 2);
  veilTex = new THREE.CanvasTexture(c);
  veilTex.colorSpace = THREE.SRGBColorSpace;
  return veilTex;
}

// 차원 그림이 바닥을 깔 칸(방 칸 + 문 칸 + 방에 붙은 막힌 칸 — 이음매·소품·상자 밑): render.ts는 이 칸에 바닥·벽을 그리지 않는다
export function warpFloor(world: World): Set<number> {
  const wp = world.warp;
  if (!wp) return new Set();
  const out = new Set<number>();
  wp.room.forEach((r, i) => r >= 0 && out.add(i));
  for (const d of wp.doors) for (const i of d.cells) out.add(i);
  world.grid.blocked.forEach((b, i) => b === 1 && roomsNear(world, i).size && out.add(i));
  return out;
}

// 칸의 땅: 방이면 그 방의 땅, 막힌 칸이면 곁 방의 땅. 문 칸은 null(검푸른 돌)
function landAt(world: World, i: number): Land | null {
  const wp = world.warp!;
  if (wp.doors.some((d) => d.cells.includes(i))) return null;
  const r = wp.room[i] >= 0 ? wp.room[i] : [...roomsNear(world, i)][0];
  return r === undefined ? null : wp.rooms[r];
}

// floorMat(land, v) = 그 땅 바닥 질감의 v번째 칸 재질(render.ts stone, land가 null이면 차원 바닥), variant(x, z) = 칸의 바닥 변형
export function buildWarp(world: World, floorMat: (land: Land | null, v: number) => THREE.MeshStandardMaterial, variant: (x: number, z: number) => number): THREE.Group | null {
  dropWarp();
  const wp = world.warp;
  if (!wp) return null;
  const g = new THREE.Group();
  const W = world.grid.w;
  // 바닥: (땅, 변형)마다 한 묶음
  const floorGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const bins = new Map<string, [number, number][]>();
  const seams = seamDirs(world);
  for (const i of warpFloor(world)) {
    if (seams.has(i)) continue; // 이음매는 갈라진 틈(buildPieces)
    const [x, z] = [i % W, Math.floor(i / W)];
    const key = `${landAt(world, i) ?? 'door'}:${variant(x, z)}`;
    (bins.get(key) ?? bins.set(key, []).get(key)!).push([x, z]);
  }
  const m = new THREE.Matrix4();
  for (const [key, cells] of bins) {
    const [land, v] = key.split(':');
    const mat = floorMat(land === 'door' ? null : (land as Land), +v);
    mat.color.copy(LAND_TINT[land as Land] ?? new THREE.Color(0.5, 0.56, 0.75));
    const mesh = new THREE.InstancedMesh(floorGeo, mat, cells.length);
    cells.forEach(([x, z], k) => mesh.setMatrixAt(k, m.makeTranslation(x + 0.5, 0, z + 0.5)));
    mesh.receiveShadow = true;
    g.add(mesh);
  }
  buildPieces(world, g, seams);
  // 발판: 돌 시계 문자판(눈금·바늘이 짝 색으로 빛난다). 눌리면 가라앉고 빛 고리가 퍼진다
  const rim = new THREE.RingGeometry(0.42, 0.48, 28).rotateX(-Math.PI / 2);
  const baseGeo = new THREE.CylinderGeometry(0.43, 0.48, 0.12, 12);
  const dialGeo = new THREE.PlaneGeometry(0.86, 0.86).rotateX(-Math.PI / 2);
  const pulseGeo = new THREE.RingGeometry(0.36, 0.46, 32).rotateX(-Math.PI / 2);
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x5a5668, roughness: 0.85, flatShading: true });
  plates = wp.plates.map((p, i) => {
    const color = PAIR_COLORS[p.pair % 4];
    const plate = new THREE.Group();
    plate.position.set((p.cell % W) + 0.5, 0, Math.floor(p.cell / W) + 0.5);
    const base = new THREE.Mesh(baseGeo, stoneMat);
    base.position.y = 0.06;
    base.castShadow = base.receiveShadow = true;
    const mat = new THREE.MeshBasicMaterial({ color, map: dialTexture(), transparent: true, opacity: 0.6, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending });
    const dial = new THREE.Mesh(dialGeo, mat);
    dial.position.y = 0.125;
    dial.rotation.y = (p.pair * Math.PI) / 3; // 짝마다 바늘 방향이 다르다
    const pulse = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending });
    const ring = new THREE.Mesh(pulseGeo, pulse);
    ring.position.y = 0.13;
    const band = new THREE.Mesh(rim, new THREE.MeshBasicMaterial({ color, toneMapped: false })); // 짝 색 테(멀리서도 짝이 보이게)
    band.position.y = 0.122;
    band.scale.setScalar(0.98);
    plate.add(base, dial, band, ring);
    g.add(plate);
    return { mat, i, plate, ring, pulse };
  });
  // 문: 풀린 이음매 양끝에 바늘 기둥, 그 사이를 짝 색 빛 실이 엇갈려 엮어 막는다. 열리면 실이 늘어지며 스러진다
  doors = wp.doors.map((d, i) => {
    const color = PAIR_COLORS[d.pair % 4];
    const pts = d.cells.map((c) => [(c % W) + 0.5, Math.floor(c / W) + 0.5] as const);
    const [cx, cz] = [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
    const spanX = Math.max(...pts.map((p) => p[0])) - Math.min(...pts.map((p) => p[0]));
    const spanZ = Math.max(...pts.map((p) => p[1])) - Math.min(...pts.map((p) => p[1]));
    const [ax, az] = spanX >= spanZ ? [1, 0] : [0, 1];
    const half = Math.max(spanX, spanZ) / 2 + 0.55;
    const A = new THREE.Vector3(cx - ax * half, 0, cz - az * half);
    const B = new THREE.Vector3(cx + ax * half, 0, cz + az * half);
    const door = new THREE.Group();
    for (const P of [A, B]) door.add(needle(P, color));
    const lace = new THREE.Group();
    const H = [0.22, 0.46, 0.7, 0.94, 1.18, 1.42];
    const core: THREE.BufferGeometry[] = [];
    const halo: THREE.BufferGeometry[] = [];
    for (let k = 0; k + 1 < H.length; k++)
      for (const [P, Q] of [[A, B], [B, A]]) {
        const a = P.clone().setY(H[k]);
        const b = Q.clone().setY(H[k + 1]);
        core.push(thread(a, b, -0.06, 0.022));
        halo.push(thread(a, b, -0.06, 0.06));
      }
    const coreMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, toneMapped: false });
    const haloMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending });
    lace.add(new THREE.Mesh(mergeGeometries(core), coreMat), new THREE.Mesh(mergeGeometries(halo), haloMat));
    const veilMat = new THREE.MeshBasicMaterial({ color, map: veilTexture(), transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const veil = new THREE.Mesh(new THREE.PlaneGeometry(half * 2, 1.5), veilMat);
    veil.position.set(cx, 0.75, cz);
    if (az) veil.rotation.y = Math.PI / 2;
    lace.add(veil);
    door.add(lace);
    g.add(door);
    return { mats: [coreMat, haloMat, veilMat], base: [1, 0.28, 0.35], lace, i, fade: d.open ? 0 : 1 };
  });
  // 불기둥: 바닥 원판 + 기둥
  const base = new THREE.CircleGeometry(0.45, 24).rotateX(-Math.PI / 2);
  const col = new THREE.CylinderGeometry(0.28, 0.42, 2.4, 14, 1, true).translate(0, 1.2, 0);
  fires = wp.fires.map((c) => {
    const [x, z] = [(c % W) + 0.5, Math.floor(c / W) + 0.5];
    const bm = new THREE.MeshBasicMaterial({ color: 0x5a1a0a, transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false });
    const b = new THREE.Mesh(base, bm);
    b.position.set(x, 0.02, z);
    const cm = new THREE.MeshBasicMaterial({ color: 0xe0400c, transparent: true, opacity: 0.6, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const cyl = new THREE.Mesh(col, cm);
    cyl.position.set(x, 0, z);
    cyl.visible = false;
    g.add(b, cyl);
    return { base: bm, col: cyl, colMat: cm };
  });
  // 출구: 푸른 빛 원
  for (const e of world.exits.filter((e) => e.to === 'warp')) {
    const ring = new THREE.Mesh(rim, new THREE.MeshBasicMaterial({ color: 0x9fdcff, toneMapped: false }));
    ring.position.set(e.x + 0.5, 0.03, e.z + 0.5);
    ring.scale.setScalar(1.1);
    g.add(ring);
  }
  // 발자취 점
  const dot = new THREE.CircleGeometry(0.09, 10).rotateX(-Math.PI / 2);
  steps = Array.from({ length: STEPS }, () => {
    const s = new THREE.Mesh(dot, new THREE.MeshBasicMaterial({ color: ECHO_COLOR, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
    s.position.y = 0.03;
    g.add(s);
    return s;
  });
  group = g;
  return g;
}

// 조각 그림: 떠 있는 땅의 두께(바닥 밑 판), 물웅덩이, 이음매(낮은 돌 + 빛 실 바늘땀), 땅마다 소품(나무·말뚝·통·결정·기둥), 허공 아래 흐르는 잔해
const SLAB = 1.6; // 조각 두께(m)
let stitchMat: THREE.MeshBasicMaterial | null = null;
let stitchHalo: THREE.MeshBasicMaterial | null = null;
let crackMat: THREE.MeshStandardMaterial | null = null;
const CRACK = 0.22; // 갈라진 틈 깊이(m)
let waterMat: THREE.MeshStandardMaterial | null = null;
let debris: { mesh: THREE.Object3D; v: number; spin: number }[] = [];
let span = 64;
function buildPieces(world: World, g: THREE.Group, seamDir: Map<number, [number, number]>) {
  const wp = world.warp!;
  const { w: W, blocked } = world.grid;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const inst = (geo: THREE.BufferGeometry, mat: THREE.Material, list: THREE.Matrix4[]) => {
    if (!list.length) return;
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((mm, k) => mesh.setMatrixAt(k, mm));
    mesh.castShadow = mesh.receiveShadow = true;
    g.add(mesh);
  };
  const at = (x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, ry = 0) => new THREE.Matrix4().compose(p.set(x, y, z), q.setFromEuler(new THREE.Euler(0, ry, 0)), s.set(sx, sy, sz));
  // 두께: 땅이 있는 칸(바닥·물·막힌 칸) 밑에 판. 땅마다 어두운 흙빛
  const ground = [...warpFloor(world), ...wp.water];
  const slabGeo = new THREE.BoxGeometry(1, SLAB, 1);
  const byLand = new Map<string, THREE.Matrix4[]>();
  for (const i of ground) {
    const key = landAt(world, i) ?? 'door';
    (byLand.get(key) ?? byLand.set(key, []).get(key)!).push(m.clone().makeTranslation((i % W) + 0.5, -SLAB / 2 - 0.01 - (seamDir.has(i) ? CRACK : 0), Math.floor(i / W) + 0.5)); // 이음매 칸은 갈라져 낮다
  }
  const SLAB_COLOR: Record<string, number> = { lake: 0x2a3a30, raid: 0x3a2a1c, mine: 0x241c30, temple: 0x5a4628, door: 0x1a2238 };
  for (const [key, list] of byLand) inst(slabGeo, new THREE.MeshStandardMaterial({ color: SLAB_COLOR[key], roughness: 1 }), list);
  // 물웅덩이
  waterMat = new THREE.MeshStandardMaterial({ color: 0x4a9ac0, roughness: 0.2, metalness: 0.1, emissive: 0x1a5a80, transparent: true, opacity: 0.95 });
  inst(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), waterMat, wp.water.map((i) => at((i % W) + 0.5, -0.04, Math.floor(i / W) + 0.5)));
  // 막힌 칸 나누기: 두 방 사이 = 이음매, 한 방 곁 = 그 땅 소품(진지는 허공 곁이면 말뚝 방책)
  const doorCells = new Set(wp.doors.flatMap((d) => d.cells));
  const chestCells = new Set(world.chests.map((c) => c.z * W + c.x));
  const deco: Record<string, THREE.Matrix4[]> = { tree: [], crown: [], stake: [], barrel: [], crystal: [], pillar: [], cap: [] };
  blocked.forEach((b, i) => {
    if (b !== 1 || doorCells.has(i) || chestCells.has(i)) return;
    const near = roomsNear(world, i);
    if (!near.size) return;
    const [x, z] = [(i % W) + 0.5, Math.floor(i / W) + 0.5];
    if (seamDir.has(i)) return;
    const land = wp.rooms[[...near][0]];
    const h = hash(i % W, Math.floor(i / W));
    const edge = [1, -1, W, -W].some((d) => blocked[i + d] === 2 && !wp.water.includes(i + d));
    if (land === 'raid' && edge) deco.stake.push(at(x, 0.45, z, 1, 0.9 + h * 0.3, 1, h * 6));
    else if (land === 'raid') deco.barrel.push(at(x, 0.32, z, 1, 1, 1, h * 6));
    else if (land === 'lake') (deco.tree.push(at(x, 0.3, z)), deco.crown.push(at(x, 1.05 + h * 0.2, z, 0.9 + h * 0.3, 0.9 + h * 0.4, 0.9 + h * 0.3, h * 6)));
    else if (land === 'mine') deco.crystal.push(at(x, 0.55, z, 0.32, 0.8 + h * 0.5, 0.32, h * 6));
    else (deco.pillar.push(at(x, 0.65, z, 1, 0.9 + h * 0.3, 1)), deco.cap.push(at(x, 1.3 + h * 0.4, z)));
  });
  const std = (color: number, emissive = 0) => new THREE.MeshStandardMaterial({ color, emissive, roughness: 0.8, flatShading: true });
  inst(new THREE.CylinderGeometry(0.08, 0.11, 0.6, 6), std(0x4a3420), deco.tree);
  inst(new THREE.ConeGeometry(0.45, 1.2, 7), std(0x2e4a2c), deco.crown);
  inst(new THREE.CylinderGeometry(0.07, 0.09, 1, 5).translate(0, 0, 0), std(0x7a5a38), deco.stake);
  inst(new THREE.CylinderGeometry(0.28, 0.3, 0.64, 9), std(0x6a4a2a), deco.barrel);
  inst(new THREE.OctahedronGeometry(1, 0), std(0x9a6ad8, 0x3a1870), deco.crystal);
  inst(new THREE.CylinderGeometry(0.28, 0.32, 1.3, 8), std(0xb09a70), deco.pillar);
  inst(new THREE.BoxGeometry(0.75, 0.16, 0.75), std(0xc0aa80), deco.cap);
  // 이음매: 낮은 검푸른 돌 + 위에 빛 실 바늘땀(X)
  // 이음매: 땅이 갈라진 좁은 틈(밑에서 남색 빛이 샌다) 위를 빛 실이 비스듬히 건너는 바늘땀. 실이 드나드는 바늘구멍
  const seams = [...seamDir.keys()];
  crackMat = new THREE.MeshStandardMaterial({ color: 0x04060e, emissive: 0x0c1c4a, emissiveIntensity: 0.5, roughness: 1 });
  inst(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), crackMat, seams.map((i) => at((i % W) + 0.5, -CRACK, Math.floor(i / W) + 0.5)));
  const core: THREE.BufferGeometry[] = [];
  const halo: THREE.BufferGeometry[] = [];
  const holes: THREE.Matrix4[] = [];
  for (const i of seams) {
    const [nx, nz] = seamDir.get(i)!;
    const [tx, tz] = [-nz, nx]; // 이음매를 따라
    const [cx, cz] = [(i % W) + 0.5, Math.floor(i / W) + 0.5];
    [-0.33, 0, 0.33].forEach((o, k) => {
      // 한 땀: 한쪽 바늘구멍에서 틈을 비스듬히 건너 맞은편 구멍으로(실은 팽팽해 살짝만 뜬다).
      // 셋에 하나꼴로 반대로 비스듬한 땀이 위로 겹쳐 X가 된다(한 방향으로만 늘어서지 않게)
      const lane = (s: number, side: number) => new THREE.Vector3(cx + tx * (o + s) + nx * 0.58 * side, 0.015, cz + tz * (o + s) + nz * 0.58 * side);
      const pairs: [THREE.Vector3, THREE.Vector3, number][] = [[lane(-0.1, -1), lane(0.1, 1), 0.05]];
      if (hash(i, k) < 0.32) pairs.push([lane(0.1, -1), lane(-0.1, 1), 0.075]);
      for (const [a, b, lift] of pairs) {
        core.push(thread(a, b, lift, 0.022));
        halo.push(thread(a, b, lift, 0.05));
        holes.push(at(a.x, 0.015, a.z), at(b.x, 0.015, b.z));
      }
    });
  }
  if (seams.length) {
    stitchMat = new THREE.MeshBasicMaterial({ color: 0xcfe8ff, toneMapped: false });
    stitchHalo = new THREE.MeshBasicMaterial({ color: 0x8fd3ff, transparent: true, opacity: 0.2, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending });
    g.add(new THREE.Mesh(mergeGeometries(core), stitchMat), new THREE.Mesh(mergeGeometries(halo), stitchHalo));
    inst(new THREE.CircleGeometry(0.045, 10).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x05060c }), holes);
  }
  // 허공 아래로 흘러가는 지나온 땅의 잔해(천막·나룻배·결정·부서진 기둥)
  span = W;
  const shapes: [THREE.BufferGeometry, number, number][] = [
    [new THREE.ConeGeometry(1.2, 1.6, 4), 0xa07a50, 0],
    [new THREE.BoxGeometry(2.6, 0.45, 0.9), 0x5a4028, 0],
    [new THREE.OctahedronGeometry(0.8, 0).scale(0.6, 1.4, 0.6), 0x8a5ad0, 0x2a1060],
    [new THREE.CylinderGeometry(0.4, 0.45, 2.4, 8), 0x9a8a68, 0],
  ];
  debris = Array.from({ length: 22 }, (_, k) => {
    const [geo, color, em] = shapes[k % 4];
    const mesh = new THREE.Mesh(geo, std(color, em));
    mesh.position.set(hash(k, 1) * (W + 20) - 10, -4 - hash(k, 2) * 5, hash(k, 3) * world.grid.h);
    mesh.rotation.set(hash(k, 4) * 6, hash(k, 5) * 6, hash(k, 6) * 6);
    g.add(mesh);
    return { mesh, v: 0.35 + hash(k, 7) * 0.6, spin: (hash(k, 8) - 0.5) * 0.4 };
  });
}

function dropWarp() {
  debris = [];
  stitchMat = stitchHalo = waterMat = crackMat = null;
  echo?.s.mesh.removeFromParent();
  echo?.s.mat.map?.dispose();
  echo?.s.mat.dispose();
  echo = null;
  group = null; // 메시·재질은 render.ts buildMap이 mapGroup째 해제한다
  plates = [];
  doors = [];
  fires = [];
  steps = [];
}

export function tickWarpArt(time: number, dt: number, world: World) {
  const wp = world.warp;
  if (!wp || !group) return;
  if (stitchHalo) stitchHalo.opacity = 0.14 + 0.08 * Math.sin(time * 2);
  if (crackMat) crackMat.emissiveIntensity = 0.45 + 0.15 * Math.sin(time * 1.1);
  if (waterMat) waterMat.emissiveIntensity = 1 + 0.4 * Math.sin(time * 1.3);
  for (const d of debris) {
    if (warpFrozen) continue; // 파수꾼 결전장 첫 연출: 시간이 멈춰 잔해도 멈춰 있다
    d.mesh.position.x += d.v * dt;
    if (d.mesh.position.x > span + 10) d.mesh.position.x -= span + 20; // 한쪽으로만 흐른다
    d.mesh.rotation.y += d.spin * dt;
  }
  const lit = wardenState(world)?.lit; // 파수꾼 결전장: 빛나는 짝만 밝게 맥동하고 나머지는 흐리다
  for (const p of plates) {
    const on = wp.plates[p.i].on;
    const dim = lit !== undefined && wp.plates[p.i].pair !== lit;
    // 눌리면 0.04 가라앉고 문자판이 환해지며 빛 고리가 퍼진다(0.8초마다)
    p.plate.visible = !stitchState(world); // 엔딩(틈 꿰매기)부터는 발판을 숨긴다(무늬와 헷갈리지 않게)
    p.plate.position.y += ((on ? -0.04 : 0) - p.plate.position.y) * Math.min(1, dt * 18);
    p.mat.opacity = dim ? 0.25 : on ? 1 : 0.8 + 0.12 * Math.sin(time * 2 + p.i);
    const k = (time / 0.8) % 1;
    p.ring.scale.setScalar(1 + k * 0.9);
    p.pulse.opacity = dim ? 0 : on ? 0.7 * (1 - k) : lit !== undefined ? 0.35 * (1 - k) : 0;
  }
  for (const d of doors) {
    // 열리면 엮은 실이 늘어져 내려앉으며 스러진다(0.7초)
    d.fade = wp.doors[d.i].open ? Math.max(0, d.fade - dt / 0.7) : 1;
    d.mats.forEach((m, k) => (m.opacity = d.base[k] * d.fade * (k === 2 ? 0.8 + 0.2 * Math.sin(time * 3) : 1)));
    d.lace.position.y = -((1 - d.fade) ** 2) * 0.9;
    d.lace.visible = d.fade > 0;
  }
  const t = wp.fireT;
  const up = t >= WARP.fireEvery - WARP.fireUp;
  const warn = !up && t >= WARP.fireEvery - WARP.fireUp - WARN;
  for (const f of fires) {
    f.base.color.setHex(up ? 0xff6a1a : warn ? 0xb0300a : 0x5a1a0a);
    f.col.visible = up;
    if (up) {
      const k = (t - (WARP.fireEvery - WARP.fireUp)) / WARP.fireUp; // 0 → 1
      f.col.scale.set(1 + 0.08 * Math.sin(time * 40), Math.min(1, k * 6) * (1 - Math.max(0, k - 0.8) * 4), 1 + 0.08 * Math.cos(time * 37));
      f.colMat.opacity = 0.45 + 0.15 * Math.sin(time * 25);
    }
  }
  // 메아리: 쌓이면 나타난다
  const hero = world.entities[0];
  if (echo) echo.s.mesh.visible = !!wp.echo; // 엔딩에서 틈으로 스며들면 사라진다
  if (wp.echo) {
    if (!echo) {
      echo = { s: ghostSprite(hero), last: wp.echo, facing: hero.facing };
      echo.s.mat.blending = THREE.AdditiveBlending; // 옷 색과 섞이지 않게 빛을 더한다(보랏빛 유령)
      group.add(echo.s.mesh);
    }
    const [ex, ez] = wp.echo;
    const moved = Math.hypot(ex - echo.last[0], ez - echo.last[1]) > 1e-3;
    if (moved) echo.facing = Math.atan2(ex - echo.last[0], ez - echo.last[1]);
    if (stitchState(world)?.echoLook) echo.facing = Math.atan2(hero.x - ex, hero.z - ez); // 엔딩: 틈 앞에서 멈춰 주인공을 돌아본다
    echo.last = [ex, ez];
    updateSprite(echo.s, { ...hero, x: ex, z: ez, facing: echo.facing, state: moved ? 'move' : 'idle', phase: 'none', attackT: 0, hp: echo.s.hp, maxHp: echo.s.maxHp }, dt, 1);
    echo.s.mesh.renderOrder = 3;
    echo.s.mat.color.setHex(ECHO_COLOR).multiplyScalar(1.8);
    echo.s.mat.opacity = 0.8 + 0.1 * Math.sin(time * 14);
  }
  // 발자취: 고리 버퍼에서 오래된 쪽부터 고르게(쌓인 만큼만)
  const n = wp.trail.length / 2;
  steps.forEach((s, k) => {
    const back = Math.floor(((k + 0.5) / STEPS) * wp.filled); // 0 = 가장 최근
    const j = (wp.head - 1 - back + n * 2) % n;
    s.position.x = wp.trail[j * 2];
    s.position.z = wp.trail[j * 2 + 1];
    (s.material as THREE.MeshBasicMaterial).opacity = wp.filled < n / 8 ? 0 : 0.18 + 0.3 * (1 - k / STEPS);
  });
}
