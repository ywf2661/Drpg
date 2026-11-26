// 뒤틀린 차원 그림(설계: docs/superpowers/specs/2026-11-26-act2-rift-design.md 2·3절). sim은 바꾸지 않는다.
//   바닥: 방마다 지나온 땅 빛깔(호숫가 이끼·진지 흙·광산 보라 바위·신전 사암). 4칸 덩어리로 가끔 다른 땅 조각이 끼어든다
//   벽: 검은 돌에 푸른 유령빛(render.ts가 물들인다). 문: 짝 색의 반투명 빛 장막, 열리면 스러진다
//   발판: 짝 색 원판, 눌리면 환하게. 불기둥: 솟기 0.6초 전 바닥이 달아오르고, 솟으면 불기둥
//   메아리: 주인공 판자를 복제한 반투명 보랏빛, 발밑에서 주인공까지 지난 4초 발자취 점선
import * as THREE from 'three';
import { WARP, type Land, type World } from '../sim/world';
import { ghostSprite, updateSprite, type Sprite } from './sprites';

export const PAIR_COLORS = [0xffcf5a, 0x5affc8, 0xff7ab8, 0xff9a4a]; // 발판 짝·문(α β γ δ)
export const ECHO_COLOR = 0xc4a9ff;
export const WARP_WALL = new THREE.Color(0.5, 0.52, 0.66); // 벽: 검푸른 돌
const LAND_TINT: Partial<Record<Land, THREE.Color>> = {
  lake: new THREE.Color(0.74, 0.88, 0.8), // 바닥 그림은 render.ts가 그 땅 것으로(호숫가·진지 풀, 광산 동굴 바위, 신전 폐허 돌)
  raid: new THREE.Color(0.95, 0.72, 0.5),
  mine: new THREE.Color(1.35, 1.25, 1.5),
  temple: new THREE.Color(1.32, 1.06, 0.72),
};
const LANDS4: Land[] = ['lake', 'raid', 'mine', 'temple'];
const STEPS = 16; // 발자취 점 수(4초)
const WARN = 0.6; // 불기둥이 솟기 전 바닥이 달아오르는 시간(초)

let group: THREE.Group | null = null;
let plates: { mat: THREE.MeshBasicMaterial; i: number }[] = [];
let doors: { mats: THREE.MeshBasicMaterial[]; meshes: THREE.Mesh[]; i: number; fade: number }[] = [];
let fires: { base: THREE.MeshBasicMaterial; col: THREE.Mesh; colMat: THREE.MeshBasicMaterial }[] = [];
let echo: { s: Sprite; last: [number, number]; facing: number } | null = null;
let steps: THREE.Mesh[] = [];
const hash = (x: number, z: number) => {
  let h = (x * 374761393 + z * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// 차원 그림이 바닥을 깔 칸(방 칸 + 문 칸): render.ts는 이 칸에 바닥·벽을 그리지 않는다
export function warpFloor(world: World): Set<number> {
  const wp = world.warp;
  if (!wp) return new Set();
  const out = new Set<number>();
  wp.room.forEach((r, i) => r >= 0 && out.add(i));
  for (const d of wp.doors) for (const i of d.cells) out.add(i);
  return out;
}

// 칸의 땅: 방의 땅, 4칸 덩어리마다 다섯에 하나는 다른 땅 조각. 문 칸은 null(검푸른 돌)
function landAt(world: World, i: number): Land | null {
  const wp = world.warp!;
  const r = wp.room[i];
  if (r < 0) return null;
  const [x, z] = [i % world.grid.w, Math.floor(i / world.grid.w)];
  const h = hash(x >> 2, z >> 2);
  return h < 0.2 ? LANDS4[Math.floor(h * 20)] : wp.rooms[r];
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
  for (const i of warpFloor(world)) {
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
  // 발판: 짝 색 원판 + 테
  const disc = new THREE.CircleGeometry(0.42, 28).rotateX(-Math.PI / 2);
  const rim = new THREE.RingGeometry(0.42, 0.48, 28).rotateX(-Math.PI / 2);
  plates = wp.plates.map((p, i) => {
    const color = PAIR_COLORS[p.pair % 4];
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3, depthWrite: false, toneMapped: false });
    const [x, z] = [(p.cell % W) + 0.5, Math.floor(p.cell / W) + 0.5];
    const a = new THREE.Mesh(disc, mat);
    const b = new THREE.Mesh(rim, new THREE.MeshBasicMaterial({ color, toneMapped: false }));
    a.position.set(x, 0.02, z);
    b.position.set(x, 0.025, z);
    g.add(a, b);
    return { mat, i };
  });
  // 문: 칸마다 짝 색 빛 장막(더하기 섞기)
  const pane = new THREE.BoxGeometry(1, 1.3, 0.25);
  doors = wp.doors.map((d, i) => {
    const color = PAIR_COLORS[d.pair % 4];
    const cells = d.cells.map((c) => [c % W, Math.floor(c / W)] as const);
    const alongX = cells.length > 1 && cells[0][1] === cells[1][1]; // 문 칸이 가로로 늘어섰다 = 장막은 x 방향
    const mats: THREE.MeshBasicMaterial[] = [];
    const meshes = cells.map(([x, z]) => {
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending });
      mats.push(mat);
      const mesh = new THREE.Mesh(pane, mat);
      mesh.position.set(x + 0.5, 0.65, z + 0.5);
      if (!alongX) mesh.rotation.y = Math.PI / 2;
      g.add(mesh);
      return mesh;
    });
    return { mats, meshes, i, fade: d.open ? 0 : 1 };
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

function dropWarp() {
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
  for (const p of plates) {
    const on = wp.plates[p.i].on;
    p.mat.opacity = on ? 0.85 + 0.15 * Math.sin(time * 9) : 0.3;
  }
  for (const d of doors) {
    d.fade = wp.doors[d.i].open ? Math.max(0, d.fade - dt * 2) : 1;
    d.mats.forEach((m, k) => (m.opacity = d.fade * (0.45 + 0.12 * Math.sin(time * 3 + k))));
    for (const mesh of d.meshes) mesh.visible = d.fade > 0;
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
  if (wp.echo) {
    if (!echo) {
      echo = { s: ghostSprite(hero), last: wp.echo, facing: hero.facing };
      echo.s.mat.blending = THREE.AdditiveBlending; // 옷 색과 섞이지 않게 빛을 더한다(보랏빛 유령)
      group.add(echo.s.mesh);
    }
    const [ex, ez] = wp.echo;
    const moved = Math.hypot(ex - echo.last[0], ez - echo.last[1]) > 1e-3;
    if (moved) echo.facing = Math.atan2(ex - echo.last[0], ez - echo.last[1]);
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
