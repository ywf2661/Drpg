// 소품·계단·바닥 물약·화로 불빛. 모두 캐릭터와 같은 세로 판자(발 아래는 바닥에 눕힘), 화로마다 점광원 1개.
import * as THREE from 'three';
import type { Item, Prop, World } from '../sim/world';
import lootInfo from '../assets/sprites/loot.json';
import lootUrl from '../assets/sprites/loot.png';
import arrowInfo from '../assets/sprites/arrow.json';
import arrowUrl from '../assets/sprites/arrow.png';
import cleaveInfo from '../assets/sprites/cleave.json';
import fireballInfo from '../assets/sprites/fireball.json';
import fireballUrl from '../assets/sprites/fireball.png';
import blastInfo from '../assets/sprites/blast.json';
import blastUrl from '../assets/sprites/blast.png';
import axeInfo from '../assets/sprites/axe.json';
import axeUrl from '../assets/sprites/axe.png';
import quakeInfo from '../assets/sprites/quake.json';
import quakeUrl from '../assets/sprites/quake.png';
import cleaveUrl from '../assets/sprites/cleave.png';
import propsInfo from '../assets/sprites/props.json';
import propsUrl from '../assets/sprites/props.png';
import stairsInfo from '../assets/sprites/stairs.json';
import stairsUrl from '../assets/sprites/stairs.png';
import { cardGeometry, dirIndex, frameAt, loadSheet, type Clip, type SheetInfo } from './sprites';

export const BRAZIER_RANGE = 4.5; // 화로 빛이 닿는 거리(m)
const BRAZIER_LIGHT = 18; // 화로 밝기(칸델라)
const TINT = new THREE.Color(1, 0.82, 0.62); // 판자에 입히는 불빛 색(횃불과 같음)
// 바닥 아이템 → loot 시트 동작(사슬·판금 갑옷은 같은 그림)
const lootClip = (it: Item) =>
  it.kind === 'gold'
    ? (it.amount ?? 0) < 15 ? 'coins5' : (it.amount ?? 0) < 50 ? 'coins25' : 'coins100'
    : it.kind === 'potion'
    ? 'potion'
    : it.kind === 'weapon'
      ? ['dagger', 'shortsword', 'longsword', 'greatsword'][it.tier - 1]
      : ['clothes', 'leather_armor', 'steel_armor', 'steel_armor'][it.tier - 1];
const LOOT_MIN_LIGHT = 0.6; // 바닥 물약은 어둠 속에서도 보이게
const STAIRS_AT: [number, number] = [-1.5, -1.5]; // 계단 칸 → 4×4칸 계단 그림의 위 꼭짓점(맵 최소 x·z 모서리)
const VARIANTS: Record<Prop['kind'], string[]> = {
  brazier: ['brazier'],
  prop: ['barrel', 'barrel2', 'crate', 'crate2', 'statue', 'statue2'], // 상자 그림은 열 수 있는 상자 전용
  debris: Array.from({ length: 8 }, (_, k) => `bones${k + 1}`),
};
type Sheet = { info: SheetInfo; url: string; tex?: THREE.Texture; geo?: THREE.BufferGeometry };
type Card = { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; info: SheetInfo; clip: Clip; t: number; glow: number; dir: number }; // dir: 방향 행(화살)
const props: Sheet = { info: propsInfo as SheetInfo, url: propsUrl };
const stairs: Sheet = { info: stairsInfo as SheetInfo, url: stairsUrl };
const loot: Sheet = { info: lootInfo as SheetInfo, url: lootUrl };
const arrow: Sheet = { info: arrowInfo as SheetInfo, url: arrowUrl };
const cleaveFx: Sheet = { info: cleaveInfo as SheetInfo, url: cleaveUrl };
const fireballFx: Sheet = { info: fireballInfo as SheetInfo, url: fireballUrl };
const blastFx: Sheet = { info: blastInfo as SheetInfo, url: blastUrl };
const axeFx: Sheet = { info: axeInfo as SheetInfo, url: axeUrl };
const quakeFx: Sheet = { info: quakeInfo as SheetInfo, url: quakeUrl };
let cards: Card[] = [];
let group = new THREE.Group();
const items = new Map<number, Card>(); // 바닥 아이템 id → 판자
const shots = new Map<number, Card>(); // 날아가는 화살 id → 판자
let chestCards: { card: Card; name: string }[] = []; // 상자 판자(world.chests 순서)와 닫힌 그림 이름
let effects: Card[] = []; // 한 번 재생하고 사라지는 효과(가르기)
let cleavesSeen = 0;
let shoutsSeen = 0;
const blastsSeen = new Set<number>();
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

// 벽 질감 변형(n가지 중 하나, 칸마다 고정)
export function wallVariant(x: number, z: number, n: number): number {
  return (cellHash(x, z) >>> 12) % n;
}

export async function loadProps() {
  for (const s of [props, stairs, loot, arrow, cleaveFx, fireballFx, blastFx, axeFx, quakeFx]) {
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
  return { mesh, mat, info: s.info, clip, t: (cellHash(x, z) % 1000) / 1000, glow: name === 'brazier' ? 1 : 0, dir: 0 };
}

const free = (c: Card) => {
  c.mat.map!.dispose();
  c.mat.dispose();
};

// 열린 상자는 열린 그림으로
export function syncChests(world: World) {
  world.chests.forEach((ch, i) => {
    const c = chestCards[i];
    if (ch.open && c) c.card.clip = props.info.anims[`${c.name}_open`];
  });
}

// 가르기가 새로 일어났으면 주인공 위치·방향에 효과를 한 번 재생
export function syncEffects(world: World) {
  if (world.cleaves > cleavesSeen) {
    const hero = world.entities[0];
    const c = card(cleaveFx, 'cleave', hero.x, hero.z, false);
    Object.assign(c, { t: 0, glow: 1, dir: dirIndex(hero.facing) });
    c.mesh.renderOrder = 2;
    effects.push(c);
    cards.push(c);
    group.add(c.mesh);
  }
  cleavesSeen = world.cleaves;
  if (world.shouts > shoutsSeen) {
    const hero = world.entities[0];
    const c = card(quakeFx, 'quake', hero.x, hero.z, true); // 땅에 눕힌 울림
    Object.assign(c, { t: 0, glow: 1 });
    effects.push(c);
    cards.push(c);
    group.add(c.mesh);
  }
  shoutsSeen = world.shouts;
  for (const b of world.blasts) {
    if (blastsSeen.has(b.id)) continue;
    blastsSeen.add(b.id);
    const c = card(blastFx, 'blast', b.x, b.z, false);
    Object.assign(c, { t: 0, glow: 1 });
    c.mesh.renderOrder = 2;
    effects.push(c);
    cards.push(c);
    group.add(c.mesh);
  }
  effects = effects.filter((c) => {
    if (c.t * 1000 < c.clip.ms) return true;
    c.mesh.removeFromParent();
    free(c);
    cards.splice(cards.indexOf(c), 1);
    return false;
  });
}

// 날아가는 화살 판자를 world.shots에 맞춘다(위치는 매 프레임)
export function syncShots(world: World) {
  const live = new Set(world.shots.map((s) => s.id));
  for (const [id, c] of shots) {
    if (live.has(id)) continue;
    c.mesh.removeFromParent();
    free(c);
    shots.delete(id);
    cards.splice(cards.indexOf(c), 1);
  }
  for (const s of world.shots) {
    let c = shots.get(s.id);
    if (!c) {
      c = s.kind === 'fire' ? card(fireballFx, 'fireball', s.x, s.z, false) : s.kind === 'axe' ? card(axeFx, 'axe', s.x, s.z, false) : card(arrow, 'fly', s.x, s.z, false);
      c.dir = dirIndex(Math.atan2(s.dx, s.dz));
      c.glow = s.kind === 'fire' ? 1 : 0.7; // 화염구는 스스로 빛난다
      c.mesh.renderOrder = 2;
      shots.set(s.id, c);
      cards.push(c);
      group.add(c.mesh);
    }
    c.mesh.position.set(s.x, 0, s.z);
  }
}

// 바닥 아이템 판자를 world.items에 맞춘다. 새 아이템은 떨어지는 애니메이션부터
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
    const c = card(loot, lootClip(it), it.x, it.z, false);
    c.t = 0;
    c.glow = LOOT_MIN_LIGHT;
    c.mesh.renderOrder = 2; // 아이템은 늘 시체 위에 떨어진다. 시체(깊이 안 씀)보다 나중에 그려야 가려지지 않는다
    items.set(it.id, c);
    cards.push(c);
    group.add(c.mesh);
  }
}

// 새 층의 소품·계단·화로 빛. 이전 층의 재질·질감·광원·물약 판자는 해제한다(지오메트리는 공유)
export function buildProps(world: World): THREE.Group {
  cards.forEach(free);
  items.clear();
  shots.clear();
  effects = [];
  cleavesSeen = world.cleaves;
  shoutsSeen = world.shouts;
  blastsSeen.clear();
  for (const l of lights) l.dispose();
  cards = world.props.map((p) => {
    const names = VARIANTS[p.kind];
    return card(props, names[cellHash(p.x, p.z) % names.length], p.x + 0.5, p.z + 0.5, p.kind === 'debris');
  });
  chestCards = world.chests.map((ch) => {
    const name = cellHash(ch.x, ch.z) % 2 ? 'chest2' : 'chest';
    return { card: card(props, ch.open ? `${name}_open` : name, ch.x + 0.5, ch.z + 0.5, false), name };
  });
  cards.push(...chestCards.map((c) => c.card));
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
    c.mat.map!.offset.set(f / c.info.cols, 1 - (c.clip.row + c.dir + 1) / c.info.rows);
    c.mat.color.copy(TINT).multiplyScalar(Math.max(c.glow, light(c.mesh.position.x, c.mesh.position.z)));
  }
}
