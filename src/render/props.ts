// 소품·계단·바닥 물약·화로 불빛. 모두 캐릭터와 같은 세로 판자(발 아래는 바닥에 눕힘), 화로마다 점광원 1개.
import { rumble } from './feel';
import * as THREE from 'three';
import type { HeroClass, Item, Prop, World } from '../sim/world';
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
import gateInfo from '../assets/sprites/gate.json';
import gateUrl from '../assets/sprites/gate.png';
import flameInfo from '../assets/sprites/flame.json';
import flameUrl from '../assets/sprites/flame.png';
import { walkable } from '../sim/path';
import { resetWard, syncWard, updateWard, wardFx } from './ward';
import { cardGeometry, dirIndex, frameAt, loadSheet, type Clip, type SheetInfo } from './sprites';
// 마법사 효과: 그림 이름 = 동작 이름
const FX = import.meta.glob('../assets/sprites/{ember,thunder,spark,ice,frost,blink,heal}.png', { eager: true, import: 'default', query: '?url' }) as Record<string, string>;
const FX_INFO = import.meta.glob('../assets/sprites/{ember,thunder,spark,ice,frost,blink,heal}.json', { eager: true, import: 'default' }) as Record<string, SheetInfo>;
const fx = (name: string): Sheet => ({ info: FX_INFO[`../assets/sprites/${name}.json`], url: FX[`../assets/sprites/${name}.png`] });

export const BRAZIER_RANGE = 4.5; // 화로 빛이 닿는 거리(m)
const BRAZIER_LIGHT = 18; // 화로 밝기(칸델라)
const TINT = new THREE.Color(1, 0.82, 0.62); // 판자에 입히는 불빛 색(횃불과 같음)
// 바닥 아이템 → loot 시트 동작. 방어구(갑옷·투구·신발)는 FLARE처럼 그 단계 세트의 그림(사슬·판금은 같은 그림)
const lootClip = (it: Item, cls: HeroClass) =>
  it.kind === 'gold'
    ? (it.amount ?? 0) < 15 ? 'coins5' : (it.amount ?? 0) < 50 ? 'coins25' : 'coins100'
    : it.kind === 'potion'
    ? 'potion'
    : it.kind === 'weapon'
      ? (cls === 'wizard' ? ['wand', 'rod', 'staff', 'greatstaff'] : ['dagger', 'shortsword', 'longsword', 'greatsword'])[it.tier - 1]
      : cls === 'wizard' ? 'clothes' : ['clothes', 'leather_armor', 'steel_armor', 'steel_armor'][it.tier - 1]; // 갑옷·투구·신발(마법사 로브는 모두 천)
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
const gateFx: Sheet = { info: gateInfo as SheetInfo, url: gateUrl };
const flameFx: Sheet = { info: flameInfo as SheetInfo, url: flameUrl };
const wiz = { ember: fx('ember'), thunder: fx('thunder'), spark: fx('spark'), ice: fx('ice'), frost: fx('frost'), blink: fx('blink'), heal: fx('heal') };
const FLAME_GAP = 0.55; // 불길 위 불꽃 간격(m)
const flames = new Map<number, Card[]>(); // 불길 id → 그 길 위의 불꽃들
let cards: Card[] = [];
let group = new THREE.Group();
const items = new Map<number, Card>(); // 바닥 아이템 id → 판자
const shots = new Map<number, Card>(); // 날아가는 화살 id → 판자
let chestCards: { card: Card; name: string }[] = []; // 상자 판자(world.chests 순서)와 닫힌 그림 이름
const gateCards = new Map<number, Card>(); // 닫힌 사슬 문 id → 판자(열리면 치운다)
let effects: Card[] = []; // 한 번 재생하고 사라지는 효과(가르기)
let cleavesSeen = 0;
let shoutsSeen = 0;
const blastsSeen = new Set<number>();
let lights: THREE.PointLight[] = [];
// 서리 고리의 얼음 장판(반경 r): 냉기가 가운데서 바깥으로 퍼지며(ICE.grow) 바닥이 서리로 덮이고, 지나간 자리마다 얼음 결정이
// 솟는다. 얼음 파편이 튀고 차가운 안개 고리가 번지며, 푸른 빛이 방을 비춘다. ICE.hold초 뒤 결정이 부서지고 서리가 녹는다(ICE.melt)
const ICE = { grow: 0.2, hold: 1.0, melt: 0.45, mist: 0.45, light: 70, lightRange: 7 };
const RINGS = [0.5, 0.86]; // 결정이 솟는 고리(반경 비율). 가운데는 주인공 자리라 비운다
const SHARDS = 40;
type Crystal = { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; at: number; end: number; s: number };
type Field = {
  x: number;
  z: number;
  r: number;
  t: number;
  frost: THREE.Mesh;
  frostMat: THREE.MeshLambertMaterial;
  mist: THREE.Mesh;
  mistMat: THREE.MeshBasicMaterial;
  crystals: Crystal[];
  shards: THREE.Points;
  shardMat: THREE.PointsMaterial;
  vel: Float32Array;
};
let fields: Field[] = [];
let coldLight: THREE.PointLight | null = null; // 장판의 푸른 빛(층마다 하나 — 빛 개수가 바뀌면 셰이더를 다시 만든다)
let floorAt: (x: number, z: number) => boolean = () => true; // 그 자리가 바닥인가(벽 속에 결정이 솟지 않게)
const hash01 = (n: number) => {
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};
let frostTex: THREE.CanvasTexture | null = null;
// 바닥 서리(한 번만 그린다): 도트 크기(128px)의 거친 서리. 가장자리는 들쭉날쭉, 테두리는 짙게, 안쪽은 얼룩·반짝이
function frostTexture(): THREE.CanvasTexture {
  if (frostTex) return frostTex;
  const S = 128;
  const h = S / 2;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const img = g.createImageData(S, S);
  const lobes = Array.from({ length: 9 }, (_, k) => [1 + k, hash01(k + 3) * Math.PI * 2, 0.05 / (1 + k * 0.4)]);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const dx = (x + 0.5 - h) / h;
      const dy = (y + 0.5 - h) / h;
      const d = Math.hypot(dx, dy);
      const ang = Math.atan2(dy, dx);
      const edge = 0.9 + lobes.reduce((sum, [f, ph, amp]) => sum + amp * Math.sin(f * ang + ph), 0); // 들쭉날쭉한 가장자리
      if (d > edge) continue;
      const n = hash01(x * 57 + y * 131); // 얼룩
      const rim = Math.max(0, 1 - (edge - d) / 0.12); // 테두리 쪽일수록 1
      let a = 0.28 + 0.12 * n + 0.45 * rim ** 2;
      let [r, gg, b] = [150 + 60 * n, 200 + 40 * n, 255];
      if (n > 0.97) [r, gg, b, a] = [255, 255, 255, 0.95]; // 반짝이
      img.data.set([r, gg, b, Math.round(a * 255)], (y * S + x) * 4);
    }
  g.putImageData(img, 0, 0);
  frostTex = new THREE.CanvasTexture(c);
  frostTex.colorSpace = THREE.SRGBColorSpace;
  frostTex.magFilter = frostTex.minFilter = THREE.NearestFilter;
  return frostTex;
}
let mistTex: THREE.CanvasTexture | null = null;
// 차가운 안개 고리: 가장자리 쪽이 짙은 둥근 띠
function mistTexture(): THREE.CanvasTexture {
  if (mistTex) return mistTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(200,230,255,0)');
  grad.addColorStop(0.6, 'rgba(200,230,255,0.15)');
  grad.addColorStop(0.85, 'rgba(230,245,255,0.8)');
  grad.addColorStop(1, 'rgba(230,245,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  mistTex = new THREE.CanvasTexture(c);
  mistTex.colorSpace = THREE.SRGBColorSpace;
  return mistTex;
}
const discGeo = new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2);
const ICE_TINT = new THREE.Color(0.85, 0.95, 1);
function iceField(x: number, z: number, r: number) {
  const seed = Math.round(x * 13 + z * 7 + time * 100);
  const frostMat = new THREE.MeshLambertMaterial({ map: frostTexture(), transparent: true, depthWrite: false, emissive: 0x4a6a90, emissiveMap: frostTexture() });
  const frost = new THREE.Mesh(discGeo, frostMat);
  frost.position.set(x, 0.02, z);
  frost.rotation.y = hash01(seed) * Math.PI * 2;
  const mistMat = new THREE.MeshBasicMaterial({ map: mistTexture(), transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending });
  const mist = new THREE.Mesh(discGeo, mistMat);
  mist.position.set(x, 0.06, z);
  frost.renderOrder = mist.renderOrder = 1;
  // 얼음 결정: 고리마다 둘레 2.2m에 하나꼴, 각도·거리를 조금 흩뜨린다. 냉기가 닿는 순간 솟는다
  const crystals: Crystal[] = [];
  let k = 0;
  for (const f of RINGS) {
    const n = Math.max(3, Math.round((2 * Math.PI * r * f) / 2.2));
    for (let i = 0; i < n; i++, k++) {
      const ang = ((i + hash01(seed + k) * 0.6) / n) * Math.PI * 2 + f * 3;
      const d = r * (f + (hash01(seed + k * 3) - 0.5) * 0.1);
      const cx = x + Math.cos(ang) * d;
      const cz = z + Math.sin(ang) * d;
      if (!floorAt(cx, cz)) continue;
      const c = card(wiz.frost, 'frost', cx, cz, false);
      c.mat.color.copy(ICE_TINT);
      const row = Math.floor(hash01(seed + k * 7) * 3); // 결정 모양 3가지
      c.mat.map!.offset.set(0, 1 - (row + 1) / wiz.frost.info.rows);
      c.mesh.scale.set(0, 0, 0);
      group.add(c.mesh);
      const end = ICE.grow + ICE.hold + hash01(seed + k * 11) * 0.25 - (1 - f) * 0.15;
      crystals.push({ mesh: c.mesh, mat: c.mat, at: ICE.grow * f, end, s: (0.85 - f * 0.35) * (0.8 + hash01(seed + k * 5) * 0.4) });
    }
  }
  // 얼음 파편: 가운데 근처에서 사방으로 튀어 떨어진다
  const pos = new Float32Array(SHARDS * 3);
  const vel = new Float32Array(SHARDS * 3);
  for (let i = 0; i < SHARDS; i++) {
    const ang = hash01(seed + i * 17) * Math.PI * 2;
    const sp = 3 + hash01(seed + i * 19) * 5;
    pos.set([x + Math.cos(ang) * 0.4, 0.3 + hash01(seed + i * 23) * 0.5, z + Math.sin(ang) * 0.4], i * 3);
    vel.set([Math.cos(ang) * sp, 1.5 + hash01(seed + i * 29) * 3.5, Math.sin(ang) * sp], i * 3);
  }
  const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const shardMat = new THREE.PointsMaterial({ color: 0xe6f6ff, size: 3, sizeAttenuation: false, transparent: true, depthWrite: false, toneMapped: false });
  const shards = new THREE.Points(geo, shardMat);
  shards.renderOrder = 3;
  group.add(frost, mist, shards);
  fields.push({ x, z, r, t: 0, frost, frostMat, mist, mistMat, crystals, shards, shardMat, vel });
}
function dropField(f: Field) {
  for (const m of [f.frost, f.mist, f.shards, ...f.crystals.map((c) => c.mesh)]) m.removeFromParent();
  for (const m of [f.frostMat, f.mistMat, f.shardMat]) m.dispose();
  for (const c of f.crystals) {
    c.mat.map!.dispose();
    c.mat.dispose();
  }
  f.shards.geometry.dispose();
}
// 벼락이 떨어진 자리의 푸른 섬광(반경 r, FLASH초 동안 사라진다)
const FLASH = 0.35;
let glowTex: THREE.CanvasTexture | null = null;
function glowTexture(): THREE.CanvasTexture {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(190,215,255,0.8)');
  grad.addColorStop(0.75, 'rgba(110,150,255,0.25)');
  grad.addColorStop(1, 'rgba(90,120,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}
let flashes: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; t: number }[] = [];
function flash(x: number, z: number, r: number) {
  const mat = new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending });
  const mesh = new THREE.Mesh(discGeo, mat);
  mesh.position.set(x, 0.04, z);
  mesh.scale.set(r, 1, r);
  mesh.renderOrder = 1;
  group.add(mesh);
  flashes.push({ mesh, mat, t: 0 });
}
function updateFields(dt: number) {
  flashes = flashes.filter((f) => {
    f.t += dt;
    f.mat.opacity = Math.max(0, 1 - f.t / FLASH) ** 1.5;
    if (f.t < FLASH) return true;
    f.mesh.removeFromParent();
    f.mat.dispose();
    return false;
  });
  let glow = 0;
  fields = fields.filter((f) => {
    f.t += dt;
    const t = f.t;
    const melt = (t - ICE.grow - ICE.hold) / ICE.melt;
    // 바닥 서리: 냉기를 따라 퍼지고, 녹을 때 옅어진다
    const spread = f.r * (0.1 + 0.9 * (1 - (1 - Math.min(1, t / ICE.grow)) ** 2));
    f.frost.scale.set(spread, 1, spread);
    f.frostMat.opacity = melt > 0 ? Math.max(0, 1 - melt) : 1;
    // 안개 고리: 서리보다 조금 앞서 바깥으로 번지며 사라진다
    const m = Math.min(1, t / ICE.mist);
    f.mist.scale.set(f.r * (0.2 + 1.05 * m), 1, f.r * (0.2 + 1.05 * m));
    f.mistMat.opacity = 0.85 * (1 - m) ** 1.5;
    // 결정: 냉기가 닿으면 땅에서 솟고(살짝 넘쳤다 자리 잡음), 때가 되면 부서지는 프레임(1→3)을 재생하고 사라진다
    for (const c of f.crystals) {
      const up = (t - c.at) / 0.09;
      if (up <= 0) continue;
      const pop = up >= 1 ? 1 + 0.12 * Math.max(0, 1 - (up - 1) / 1.5) * Math.sin((up - 1) * 4) : up;
      c.mesh.scale.set(c.s, c.s * pop, c.s);
      const br = Math.floor(((t - c.end) / 0.3) * 4);
      if (br >= 4) c.mesh.visible = false;
      else if (br >= 1) c.mat.map!.offset.x = br / wiz.frost.info.cols;
    }
    // 파편: 날아가다 바닥에 떨어지면 멈춘다
    const pos = f.shards.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < SHARDS; i++) {
      if (pos.getY(i) <= 0.02) continue;
      f.vel[i * 3 + 1] -= 14 * dt;
      pos.setXYZ(i, pos.getX(i) + f.vel[i * 3] * dt, Math.max(0.02, pos.getY(i) + f.vel[i * 3 + 1] * dt), pos.getZ(i) + f.vel[i * 3 + 2] * dt);
    }
    pos.needsUpdate = true;
    f.shardMat.opacity = Math.max(0, 1 - t / (ICE.grow + ICE.hold * 0.6));
    // 푸른 빛: 확 밝았다가 은은하게 남고 녹으며 꺼진다
    const flare = t < 0.08 ? t / 0.08 : 0.35 + 0.65 * Math.max(0, 1 - (t - 0.08) / 0.35);
    const k = flare * (melt > 0 ? Math.max(0, 1 - melt) : 1);
    if (k > glow && coldLight) {
      glow = k;
      coldLight.position.set(f.x, 1.2, f.z);
    }
    if (melt < 1) return true;
    dropField(f);
    return false;
  });
  if (coldLight) coldLight.intensity = ICE.light * glow;
}
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
  for (const s of [props, stairs, loot, arrow, cleaveFx, fireballFx, blastFx, axeFx, quakeFx, gateFx, flameFx, ...Object.values(wiz)]) {
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

// 돌진 '불길': 길이 늘어나는 만큼 불꽃을 줄지어 세우고(조금씩 어긋나게), 꺼지면 치운다
export function syncFires(world: World) {
  for (const f of world.fires) {
    const list = flames.get(f.id) ?? [];
    flames.set(f.id, list);
    const len = Math.hypot(f.x1 - f.x0, f.z1 - f.z0);
    for (let k = list.length; k * FLAME_GAP <= len; k++) {
      const t = len > 1e-6 ? (k * FLAME_GAP) / len : 0;
      const side = ((cellHash(f.id, k) % 100) / 100 - 0.5) * 0.5; // 길 옆으로 ±0.25m
      const c = card(flameFx, 'flame', f.x0 + (f.x1 - f.x0) * t + side, f.z0 + (f.z1 - f.z0) * t - side, false);
      Object.assign(c, { t: (cellHash(k, f.id) % 500) / 1000, glow: 1 });
      c.mesh.renderOrder = 2;
      list.push(c);
      cards.push(c);
      group.add(c.mesh);
    }
    const s = Math.min(1, f.t / 0.4); // 꺼질 때 줄어든다
    for (const c of list) c.mesh.scale.setScalar(s);
  }
  for (const [id, list] of flames) {
    if (world.fires.some((f) => f.id === id)) continue;
    for (const c of list) {
      c.mesh.removeFromParent();
      free(c);
      cards.splice(cards.indexOf(c), 1);
    }
    flames.delete(id);
  }
}

// 열린 문의 판자는 치운다(먼지 효과는 폭발 기록으로 따로 뜬다)
export function syncGates(world: World) {
  for (const g of world.gates) {
    const c = gateCards.get(g.id);
    if (!g.open || !c) continue;
    c.mesh.removeFromParent();
    free(c);
    gateCards.delete(g.id);
    cards.splice(cards.indexOf(c), 1);
  }
}

// 가르기가 새로 일어났으면 주인공 위치·방향에 효과를 한 번 재생
export function syncEffects(world: World) {
  if (world.cleaves > cleavesSeen) {
    const hero = world.entities[0];
    const c = card(cleaveFx, 'cleave', hero.x, hero.z, false);
    Object.assign(c, { t: 0, glow: 1, dir: dirIndex(hero.facing + (world.spinT > 0 ? (world.cleaves * Math.PI) / 2 : 0)) }); // 회오리: 벨 때마다 90°씩 돌아간다
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
    // 내려찍기 = 땅 울림(눕힌 그림), 서리 고리 = 얼음 장판, 불꽃·방패 폭발 = 폭발, 나머지는 마법사 효과(그림 이름 = 종류)
    if (b.kind === 'frost') {
      iceField(b.x, b.z, b.r ?? 3);
      rumble(0.1);
      continue;
    }
    if (b.kind === 'thunder') flash(b.x, b.z, b.r ? b.r * 1.1 : 1.1); // 낙뢰는 맞는 범위만큼, 천둥의 잇따른 벼락은 작게
    const flat = b.kind === 'slam';
    const c = flat ? card(quakeFx, 'quake', b.x, b.z, true) : b.kind === 'fire' || b.kind === 'nova' ? card(blastFx, 'blast', b.x, b.z, false) : card(wiz[b.kind as 'thunder' | 'spark' | 'ice' | 'blink' | 'heal'], b.kind, b.x, b.z, false);
    Object.assign(c, { t: 0, glow: 1 });
    if (b.kind === 'thunder') c.mesh.scale.setScalar(1.5); // 벼락 줄기를 굵고 길게
    if (b.kind === 'slam' || b.kind === 'thunder') rumble(b.kind === 'slam' ? 0.2 : 0.12);
    if (!flat) c.mesh.renderOrder = 2;
    effects.push(c);
    cards.push(c);
    group.add(c.mesh);
  }
  syncWard(world); // 마나 방패(ward.ts)
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
      const fire = s.kind === 'fire' || s.kind === 'fireball';
      c = fire ? card(fireballFx, 'fireball', s.x, s.z, false) : s.kind === 'axe' ? card(axeFx, 'axe', s.x, s.z, false) : s.kind === 'bolt' ? card(wiz.ember, 'ember', s.x, s.z, false) : card(arrow, 'fly', s.x, s.z, false);
      c.dir = dirIndex(Math.atan2(s.dx, s.dz));
      c.glow = fire || s.kind === 'bolt' ? 1 : 0.7; // 화염구·마력탄은 스스로 빛난다
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
    const c = card(loot, lootClip(it, world.cls), it.x, it.z, false);
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
  resetWard();
  cleavesSeen = world.cleaves;
  shoutsSeen = world.shouts;
  blastsSeen.clear();
  fields.forEach(dropField);
  for (const f of flashes) f.mat.dispose();
  fields = [];
  flashes = [];
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
  gateCards.clear();
  flames.clear();
  for (const g of world.gates) if (!g.open) gateCards.set(g.id, card(gateFx, `gate_${g.axis}`, g.x + 0.5, g.z + 0.5, false));
  cards.push(...gateCards.values());
  if (world.stairs) cards.push(card(stairs, 'stairs', world.stairs[0] + STAIRS_AT[0], world.stairs[1] + STAIRS_AT[1], true));
  braziers = world.props.filter((p) => p.kind === 'brazier').map((p) => ({ x: p.x + 0.5, z: p.z + 0.5 }));
  // ponytail: 화로 빛은 그림자가 없어 벽 너머로 조금 샌다. 거슬리면 화로마다 castShadow(점광원 그림자는 6면 렌더)
  lights = braziers.map((b) => {
    const l = new THREE.PointLight(0xff7a30, BRAZIER_LIGHT, BRAZIER_RANGE, 1.5);
    l.position.set(b.x, 1.2, b.z);
    return l;
  });
  floorAt = (x, z) => walkable(world.grid, Math.floor(x), Math.floor(z));
  coldLight = new THREE.PointLight(0x8cc4ff, 0, ICE.lightRange, 1.5);
  group = new THREE.Group();
  group.add(...cards.map((c) => c.mesh), ...lights, coldLight, wardFx);
  return group;
}

// light(x, z): 그 위치 판자의 밝기(횃불·화로). glow는 최소 밝기(화로 = 불 자체라 1, 물약 = 0.6)
export function updateProps(dt: number, light: (x: number, z: number) => number) {
  time += dt;
  updateFields(dt);
  updateWard(dt);
  lights.forEach((l, k) => (l.intensity = BRAZIER_LIGHT * (1 + 0.08 * Math.sin(time * 9 + k * 2.1) + 0.05 * Math.sin(time * 21.3 + k))));
  for (const c of cards) {
    c.t += dt;
    const f = frameAt(c.clip, c.t);
    c.mat.map!.offset.set(f / c.info.cols, 1 - (c.clip.row + c.dir + 1) / c.info.rows);
    c.mat.color.copy(TINT).multiplyScalar(Math.max(c.glow, light(c.mesh.position.x, c.mesh.position.z)));
  }
}
