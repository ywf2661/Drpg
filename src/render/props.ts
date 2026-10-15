// 소품·계단·바닥 물약·화로 불빛. 모두 캐릭터와 같은 세로 판자(발 아래는 바닥에 눕힘), 화로마다 점광원 1개.
import * as THREE from 'three';
import type { Prop, World } from '../sim/world';
import lootInfo from '../assets/sprites/loot.json';
import lootUrl from '../assets/sprites/loot.png';
import propsInfo from '../assets/sprites/props.json';
import propsUrl from '../assets/sprites/props.png';
import stairsInfo from '../assets/sprites/stairs.json';
import stairsUrl from '../assets/sprites/stairs.png';
import { cardGeometry, frameAt, loadSheet, type Clip, type SheetInfo } from './sprites';

export const BRAZIER_RANGE = 4.5; // 화로 빛이 닿는 거리(m)
const BRAZIER_LIGHT = 18; // 화로 밝기(칸델라)
const TINT = new THREE.Color(1, 0.82, 0.62); // 판자에 입히는 불빛 색(횃불과 같음)
const LOOT_MIN_LIGHT = 0.6; // 바닥 물약은 어둠 속에서도 보이게
const STAIRS_AT: [number, number] = [-1.5, -1.5]; // 계단 칸 → 4×4칸 계단 그림의 위 꼭짓점(맵 최소 x·z 모서리)
const VARIANTS: Record<Prop['kind'], string[]> = {
  brazier: ['brazier'],
  prop: ['barrel', 'barrel2', 'crate', 'crate2', 'chest', 'chest2', 'statue', 'statue2'],
  debris: Array.from({ length: 8 }, (_, k) => `bones${k + 1}`),
};
type Sheet = { info: SheetInfo; url: string; tex?: THREE.Texture; geo?: THREE.BufferGeometry };
type Card = { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; info: SheetInfo; clip: Clip; t: number; glow: number };
const props: Sheet = { info: propsInfo as SheetInfo, url: propsUrl };
const stairs: Sheet = { info: stairsInfo as SheetInfo, url: stairsUrl };
const loot: Sheet = { info: lootInfo as SheetInfo, url: lootUrl };
let cards: Card[] = [];
let group = new THREE.Group();
const items = new Map<number, Card>(); // 바닥 물약 id → 판자
let lights: THREE.PointLight[] = [];
let time = 0;
export let braziers: { x: number; z: number }[] = []; // 화로 위치(월드 좌표, 칸 중심)

// 칸 좌표 → 모양 선택용 해시. 렌더 전용이라 시드와 무관하게 같은 칸은 늘 같은 모양
export function cellHash(x: number, z: number): number {
  let h = Math.imul(x, 73856093) ^ Math.imul(z, 19349663);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return (h ^ (h >>> 16)) >>> 0;
}

// 바닥 질감 변형: 80% 평바닥(0~3), 20% 금 간 바닥(4~7)
export function floorVariant(x: number, z: number): number {
  const h = cellHash(x, z);
  return h % 10 < 8 ? (h >>> 4) % 4 : 4 + ((h >>> 8) % 4);
}

export async function loadProps() {
  for (const s of [props, stairs, loot]) {
    s.tex = await loadSheet(s.url);
    s.geo = cardGeometry(s.info);
  }
}

function card(s: Sheet, name: string, x: number, z: number, flat: boolean): Card {
  const map = s.tex!.clone(); // 이미지는 공유, 프레임 위치(offset)만 판자별
  map.repeat.set(1 / s.info.cols, 1 / s.info.rows);
  const mat = new THREE.MeshBasicMaterial({ map, alphaTest: 0.5, toneMapped: false, depthWrite: !flat });
  const mesh = new THREE.Mesh(s.geo, mat);
  mesh.rotation.y = Math.PI / 4; // 카메라(+x+z) 쪽을 향한다
  mesh.position.set(x, 0, z);
  mesh.renderOrder = flat ? 1 : 0; // 눕힌 것(계단·잔해)은 시체처럼 바닥 다음, 캐릭터 전에 그리고 깊이를 남기지 않는다
  const clip = s.info.anims[name];
  return { mesh, mat, info: s.info, clip, t: (cellHash(x, z) % 1000) / 1000, glow: name === 'brazier' ? 1 : 0 };
}

const free = (c: Card) => {
  c.mat.map!.dispose();
  c.mat.dispose();
};

// 바닥 물약 판자를 world.items에 맞춘다. 새 물약은 떨어지는 애니메이션부터
export function syncItems(world: World) {
  const live = new Set(world.items.map((it) => it.id));
  for (const [id, c] of items) {
    if (live.has(id)) continue;
    c.mesh.removeFromParent();
    free(c);
    items.delete(id);
    cards.splice(cards.indexOf(c), 1);
  }
  for (const it of world.items) {
    if (items.has(it.id)) continue;
    const c = card(loot, 'potion', it.x, it.z, false);
    c.t = 0;
    c.glow = LOOT_MIN_LIGHT;
    c.mesh.renderOrder = 2; // 물약은 늘 시체 위에 떨어진다. 시체(깊이 안 씀)보다 나중에 그려야 가려지지 않는다
    items.set(it.id, c);
    cards.push(c);
    group.add(c.mesh);
  }
}

// 새 층의 소품·계단·화로 빛. 이전 층의 재질·질감·광원·물약 판자는 해제한다(지오메트리는 공유)
export function buildProps(world: World): THREE.Group {
  cards.forEach(free);
  items.clear();
  for (const l of lights) l.dispose();
  cards = world.props.map((p) => {
    const names = VARIANTS[p.kind];
    return card(props, names[cellHash(p.x, p.z) % names.length], p.x + 0.5, p.z + 0.5, p.kind === 'debris');
  });
  if (world.stairs) cards.push(card(stairs, 'stairs', world.stairs[0] + STAIRS_AT[0], world.stairs[1] + STAIRS_AT[1], true));
  braziers = world.props.filter((p) => p.kind === 'brazier').map((p) => ({ x: p.x + 0.5, z: p.z + 0.5 }));
  // ponytail: 화로 빛은 그림자가 없어 벽 너머로 조금 샌다. 거슬리면 화로마다 castShadow(점광원 그림자는 6면 렌더)
  lights = braziers.map((b) => {
    const l = new THREE.PointLight(0xff7a30, BRAZIER_LIGHT, BRAZIER_RANGE, 1.5);
    l.position.set(b.x, 1.2, b.z);
    return l;
  });
  group = new THREE.Group();
  group.add(...cards.map((c) => c.mesh), ...lights);
  return group;
}

// light(x, z): 그 위치 판자의 밝기(횃불·화로). glow는 최소 밝기(화로 = 불 자체라 1, 물약 = 0.6)
export function updateProps(dt: number, light: (x: number, z: number) => number) {
  time += dt;
  lights.forEach((l, k) => (l.intensity = BRAZIER_LIGHT * (1 + 0.08 * Math.sin(time * 9 + k * 2.1) + 0.05 * Math.sin(time * 21.3 + k))));
  for (const c of cards) {
    c.t += dt;
    const f = frameAt(c.clip, c.t);
    c.mat.map!.offset.set(f / c.info.cols, 1 - (c.clip.row + 1) / c.info.rows);
    c.mat.color.copy(TINT).multiplyScalar(Math.max(c.glow, light(c.mesh.position.x, c.mesh.position.z)));
  }
}
