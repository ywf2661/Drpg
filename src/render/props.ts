// 소품·계단·바닥 물약·화로 불빛. 모두 캐릭터와 같은 세로 판자(발 아래는 바닥에 눕힘), 화로마다 점광원 1개.
import { impact, pause, rumble } from './feel';
import { slashBurst } from './iaido';
import * as THREE from 'three';
import { COMET, quality, SPIKE, UNIQUE_COLOR, type HeroClass, type Item, type Prop, type World } from '../sim/world';
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
import trapInfo from '../assets/sprites/trap.json';
import trapUrl from '../assets/sprites/trap.png';
import stuckInfo from '../assets/sprites/stuck.json';
import stuckUrl from '../assets/sprites/stuck.png';
import ruinInfo from '../assets/sprites/ruin_props.json';
import ruinUrl from '../assets/sprites/ruin_props.png';
import captainInfo from '../assets/sprites/npc_captain.json';
import captainUrl from '../assets/sprites/npc_captain.png';
import merchantInfo from '../assets/sprites/npc_merchant.json';
import merchantUrl from '../assets/sprites/npc_merchant.png';
import villager1Info from '../assets/sprites/npc_villager1.json';
import villager1Url from '../assets/sprites/npc_villager1.png';
import villager2Info from '../assets/sprites/npc_villager2.json';
import villager2Url from '../assets/sprites/npc_villager2.png';
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
      ? (cls === 'wizard' || cls === 'necromancer' ? ['wand', 'rod', 'staff', 'greatstaff'] : cls === 'ranger' ? ['slingshot', 'shortbow', 'longbow', 'greatbow'] : ['dagger', 'shortsword', 'longsword', 'greatsword'])[it.tier - 1]
      : cls === 'wizard' || cls === 'necromancer' ? 'clothes' : (cls === 'ranger' ? ['clothes', 'leather_armor', 'leather_armor', 'steel_armor'] : ['clothes', 'leather_armor', 'steel_armor', 'steel_armor'])[it.tier - 1]; // 갑옷·투구·신발(마법사 로브는 모두 천)
const LOOT_MIN_LIGHT = 0.6; // 바닥 물약은 어둠 속에서도 보이게
const STAIRS_AT: [number, number] = [-1.5, -1.5]; // 계단 칸 → 4×4칸 계단 그림의 위 꼭짓점(맵 최소 x·z 모서리)
const VARIANTS: Record<Prop['kind'], string[]> = {
  brazier: ['brazier'],
  prop: ['barrel', 'barrel2', 'crate', 'crate2', 'statue', 'statue2'], // 상자 그림은 열 수 있는 상자 전용
  debris: Array.from({ length: 8 }, (_, k) => `bones${k + 1}`),
};
type Sheet = { info: SheetInfo; url: string; tex?: THREE.Texture; geo?: THREE.BufferGeometry };
type Card = { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; info: SheetInfo; clip: Clip; t: number; glow: number; dir: number; dim?: number; tint?: THREE.Color }; // dir: 방향 행(화살), dim: 밝기 배수(잠긴 야영지 상자), tint: 색(얼어붙은 보물·가시 예고)
const props: Sheet = { info: propsInfo as SheetInfo, url: propsUrl };
// 야영지 사람(FLARE npcs, 서 있는 동작 8방향): 순찰대장·상인·주민 둘. 상자 칸에 정면(NPC_DIR)을 보고 선다
const npcs = { captain: { info: captainInfo as SheetInfo, url: captainUrl }, merchant: { info: merchantInfo as SheetInfo, url: merchantUrl }, villager1: { info: villager1Info as SheetInfo, url: villager1Url }, villager2: { info: villager2Info as SheetInfo, url: villager2Url } } as Record<'captain' | 'merchant' | 'villager1' | 'villager2', Sheet>;
const NPC_DIR = 6;
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
const trapFx: Sheet = { info: trapInfo as SheetInfo, url: trapUrl };
const stuckFx: Sheet = { info: stuckInfo as SheetInfo, url: stuckUrl };
const ruin: Sheet = { info: ruinInfo as SheetInfo, url: ruinUrl }; // 성소·시련 상자(세움), 가시 바닥·푸른 마법진(눕힘: 기준점 = 마름모 위 꼭짓점)
const wiz = { ember: fx('ember'), thunder: fx('thunder'), spark: fx('spark'), ice: fx('ice'), frost: fx('frost'), blink: fx('blink'), heal: fx('heal') };
const FLAME_GAP = 0.55; // 불길 위 불꽃 간격(m)
const flames = new Map<number, Card[]>(); // 불길 id → 그 길 위의 불꽃들
let cards: Card[] = [];
let group = new THREE.Group();
const items = new Map<number, Card>(); // 바닥 아이템 id → 판자
// 전설·세트 장비의 빛기둥(바닥 아이템 id → 기둥). 위로 갈수록 옅은 원기둥, 가산 혼합
const pillars = new Map<number, THREE.Mesh>();
const PILLAR = { h: 5, stop: 0.3, shake: 0.25 };
const PILLAR_GEO = new THREE.CylinderGeometry(0.1, 0.28, PILLAR.h, 12, 1, true).translate(0, PILLAR.h / 2, 0);
{
  // 아래가 진하고 위가 옅도록 꼭짓점 색으로 바랜다
  const pos = PILLAR_GEO.attributes.position;
  const fade = new Float32Array(pos.count * 3).map((_, i) => 1 - pos.getY(Math.floor(i / 3)) / PILLAR.h);
  PILLAR_GEO.setAttribute('color', new THREE.BufferAttribute(fade, 3));
}
const shots = new Map<number, Card>(); // 날아가는 화살 id → 판자
let chestCards: { card: Card; open: Clip }[] = []; // 상자 판자(world.chests 순서)와 열린 그림
let spikeCards: Card[] = [];
const MARK_FX = new THREE.Color(1.3 / TINT.r, 1.3 / TINT.g, 1.3 / TINT.b); // 그어두기 칼선: 불빛 색을 지워 하얗게
const SLASH_RED = new THREE.Color(1.5, 0.16, 0.14); // 검흔 터짐: 폭발 그림을 붉게
const SLASH_STAGGER = 0.03; // 한꺼번에 터진 검흔은 순서대로 이만큼씩 늦게(연쇄처럼)
const ICE_CHEST = new THREE.Color(1.2, 2.2, 5.5); // 얼음에 갇힌 상자: 푸르게 빛난다
const SPIKE_WARN = new THREE.Color(2.2, 0.5, 0.4);
const gateCards = new Map<number, Card>(); // 닫힌 사슬 문 id → 판자(열리면 치운다)
const trapCards = new Map<number, Card>(); // 놓인 덫 id → 판자(벌린 그림으로 멈춰 있다)
let effects: Card[] = []; // 한 번 재생하고 사라지는 효과(가르기)
let cleavesSeen = 0;
let markSeen = 0;
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
const CURSE_TINT = new THREE.Color(0.75, 0.45, 1.1);
// cursed: 강령술사의 저주(같은 장판을 보랏빛으로). ponytail: 장판은 서리 고리 시간만큼 보이고 저주 시간과 맞추지 않는다
function iceField(x: number, z: number, r: number, cursed = false) {
  const seed = Math.round(x * 13 + z * 7 + time * 100);
  const frostMat = new THREE.MeshLambertMaterial({ map: frostTexture(), transparent: true, depthWrite: false, emissive: 0x4a6a90, emissiveMap: frostTexture() });
  const frost = new THREE.Mesh(discGeo, frostMat);
  frost.position.set(x, 0.02, z);
  if (cursed) frostMat.emissive.set(0x4a1a6a);
  frost.rotation.y = hash01(seed) * Math.PI * 2;
  const mistMat = new THREE.MeshBasicMaterial({ map: mistTexture(), transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending });
  const mist = new THREE.Mesh(discGeo, mistMat);
  mist.position.set(x, 0.06, z);
  if (cursed) mistMat.color.set(0x9050d0);
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
      c.mat.color.copy(cursed ? CURSE_TINT : ICE_TINT);
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
  const shardMat = new THREE.PointsMaterial({ color: cursed ? 0xb080ff : 0xe6f6ff, size: 3, sizeAttenuation: false, transparent: true, depthWrite: false, toneMapped: false });
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
  for (const s of [...Object.values(npcs), ruin, props, stairs, loot, arrow, cleaveFx, fireballFx, blastFx, axeFx, quakeFx, gateFx, flameFx, trapFx, stuckFx, ...Object.values(wiz)]) {
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
// 화살비 빛줄기가 닿은 자리에 꽂힌 화살(잠시 남는다). dir: 방향 행 0~7
export function stickArrow(x: number, z: number, dir: number) {
  const c = card(stuckFx, 'stuck', x, z, false);
  Object.assign(c, { t: 0, dir });
  effects.push(c);
  cards.push(c);
  group.add(c.mesh);
}

export function syncChests(world: World) {
  world.chests.forEach((ch, i) => {
    const c = chestCards[i];
    if (ch.open && c) c.card.clip = c.open;
    if (c) c.card.dim = ch.guards?.some((id) => world.entities[id].state !== 'dead') ? 0.4 : 1; // 야영지 무리가 살아 있으면 어둡게(잠김)
  });
}

// 가시 바닥: 솟기 전 SPIKE.warn초는 붉게 깜빡이고, 솟은 동안은 솟은 그림
export function syncSpikes(world: World) {
  const t = world.spikeT;
  const up = t >= SPIKE.warn && t < SPIKE.warn + SPIKE.up;
  for (const c of spikeCards) {
    c.clip = ruin.info.anims[up ? 'spikes_up' : 'spikes'];
    c.tint = t < SPIKE.warn && Math.sin(t * 25) > 0 ? SPIKE_WARN : undefined;
  }
}

// 불길: 길이 늘어나는 만큼 불꽃을 줄지어 세우고(조금씩 어긋나게), 넓은 불은 원 안에 흩어 세우고, 꺼지면 치운다
export function syncFires(world: World) {
  for (const f of world.fires) {
    const list = flames.get(f.id) ?? [];
    flames.set(f.id, list);
    const len = Math.hypot(f.x1 - f.x0, f.z1 - f.z0);
    const spots = len > 1e-6 || f.r < 0.9 ? 0 : Math.round(f.r * f.r * 2.5); // 점에 떨어진 넓은 불(불바다·운석): 원 안에 고르게
    for (let k = list.length; spots ? k < spots : k * FLAME_GAP <= len; k++) {
      const t = len > 1e-6 ? (k * FLAME_GAP) / len : 0;
      const side = ((cellHash(f.id, k) % 100) / 100 - 0.5) * 0.5; // 길 옆으로 ±0.25m
      const a = k * 2.39996, r = f.r * 0.9 * Math.sqrt((k + 0.5) / Math.max(1, spots)); // 해바라기 씨 배열
      const c = spots ? card(flameFx, 'flame', f.x0 + Math.sin(a) * r, f.z0 + Math.cos(a) * r, false) : card(flameFx, 'flame', f.x0 + (f.x1 - f.x0) * t + side, f.z0 + (f.z1 - f.z0) * t - side, false);
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
    if (world.markSlashes > markSeen) {
      // 그어두기: 가늘고 흰 초승달, 빠르게(0.12초)
      Object.assign(c, { tint: MARK_FX, clip: { ...c.clip, ms: 120 } });
      c.mesh.scale.y = 0.6;
    }
    effects.push(c);
    cards.push(c);
    group.add(c.mesh);
  }
  cleavesSeen = world.cleaves;
  markSeen = world.markSlashes;
  if (world.shouts > shoutsSeen) {
    const hero = world.entities[0];
    const c = card(quakeFx, 'quake', hero.x, hero.z, true); // 땅에 눕힌 울림
    Object.assign(c, { t: 0, glow: 1 });
    effects.push(c);
    cards.push(c);
    group.add(c.mesh);
  }
  shoutsSeen = world.shouts;
  let slashes = 0; // 이번에 새로 터진 검흔 자리 수
  for (const b of world.blasts) {
    if (blastsSeen.has(b.id)) continue;
    blastsSeen.add(b.id);
    if (b.kind === 'slash') {
      // 검흔 터짐: 흰 칼선 n개(iaido.ts) + 붉은 폭발, 목록 순서대로 엇갈려
      slashBurst(b.x, b.z, b.n ?? 1, slashes++ * SLASH_STAGGER, () => {
        const c = card(blastFx, 'blast', b.x, b.z, false);
        Object.assign(c, { t: 0, glow: 1, tint: SLASH_RED });
        c.mesh.renderOrder = 2;
        effects.push(c);
        cards.push(c);
        group.add(c.mesh);
      });
      continue;
    }
    // 내려찍기 = 땅 울림(눕힌 그림), 서리 고리 = 얼음 장판, 불꽃·방패 폭발 = 폭발, 나머지는 마법사 효과(그림 이름 = 종류)
    if (b.kind === 'frost' || b.kind === 'curse') {
      iceField(b.x, b.z, b.r ?? 3, b.kind === 'curse');
      rumble(0.1);
      continue;
    }
    if (b.kind === 'rain') {
      rumble(0.08); // 화살비의 그림(예고 원·빛줄기·꽂힌 화살)은 rain.ts
      continue;
    }
    if (b.kind === 'thunder') flash(b.x, b.z, b.r ? b.r * 1.1 : 1.1); // 낙뢰는 맞는 범위만큼, 천둥의 잇따른 벼락은 작게
    const flat = b.kind === 'slam';
    const c = flat
      ? card(quakeFx, 'quake', b.x, b.z, true)
      : b.kind === 'fire' || b.kind === 'nova'
        ? card(blastFx, 'blast', b.x, b.z, false)
        : b.kind === 'trap'
          ? card(trapFx, 'trap', b.x, b.z, false) // 덫이 닫힌다
          : card(wiz[b.kind as 'thunder' | 'spark' | 'ice' | 'blink' | 'heal'], b.kind, b.x, b.z, false);
    Object.assign(c, { t: 0, glow: 1 });
    if (b.kind === 'thunder') c.mesh.scale.setScalar(1.5); // 벼락 줄기를 굵고 길게
    if (b.kind === 'slam' || b.kind === 'thunder') rumble(b.kind === 'slam' ? 0.2 : 0.12);
    if (!flat) c.mesh.renderOrder = 2;
    effects.push(c);
    cards.push(c);
    group.add(c.mesh);
  }
  impact(slashes); // 터진 적 수만큼 멈춤·흔들림
  syncTraps(world);
  syncWard(world); // 마나 방패(ward.ts)
  effects = effects.filter((c) => {
    if (c.t * 1000 < c.clip.ms) return true;
    c.mesh.removeFromParent();
    free(c);
    cards.splice(cards.indexOf(c), 1);
    return false;
  });
}

// 놓인 덫: 벌린 그림(첫 프레임)으로 세워 두고, 밟혀 사라지면 치운다(닫히는 모습은 'trap' 폭발 기록으로)
function syncTraps(world: World) {
  const live = new Set(world.traps.map((t) => t.id));
  for (const [id, c] of trapCards) {
    if (live.has(id)) continue;
    c.mesh.removeFromParent();
    free(c);
    trapCards.delete(id);
    cards.splice(cards.indexOf(c), 1);
  }
  for (const t of world.traps) {
    if (trapCards.has(t.id)) continue;
    const c = card(trapFx, 'trap', t.x, t.z, false);
    c.clip = { ...c.clip, ms: 1e9 }; // 첫 프레임에서 멈춘다
    c.t = 0;
    trapCards.set(t.id, c);
    cards.push(c);
    group.add(c.mesh);
  }
}

// 운석(마법사): 떨어지기까지 하늘에서 거의 곧장(조금 화면 왼쪽 위 -x에서) 내려오는 큰 화염구 + 떨어질 자리의 주황 원(차오르면 떨어진다).
// sim의 world.volleys 중 blast 'fire'(운석뿐)를 읽기만 한다. 볼리에 id가 없어 순서대로 판자를 돌려 쓴다
export const COMET_FALL = { h: 4.2, back: 1.2, size: 2.4 }; // 높이·옆으로 비껴 오는 거리(m): PC 화면(주인공 위 약 5m가 화면 끝)에서도 시작부터 보이게
// 떨어지는 화염구 위치 [x, y, z]와 진행도(0 시전 → 1 떨어짐). 떨어질수록 빨라진다
export function cometAt(v: { x: number; z: number; t: number }): [number, number, number, number] {
  const p = Math.min(1, Math.max(0, 1 - v.t / COMET.delay));
  const left = 1 - p * p;
  return [v.x - COMET_FALL.back * left, COMET_FALL.h * left, v.z, p];
}
const flatMat = (color: number, opacity: number) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, toneMapped: false });
const COMET_RING = new THREE.RingGeometry(0.92, 1, 40).rotateX(-Math.PI / 2);
const COMET_DISC = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2);
const COMET_MATS = { ring: flatMat(0xffa030, 0.9), area: flatMat(0xff8a20, 0.12), fill: flatMat(0xffb040, 0.3) };
let comets: { c: Card; mark: THREE.Group; fill: THREE.Mesh }[] = [];
let cometsFalling = 0; // 지난 프레임에 떨어지는 중이던 운석 수(줄면 떨어진 것)
const COMET_HIT = { shake: 0.35, stop: 0.07 }; // 떨어진 순간: 살짝 쿵(함성 흔들림 0.3, 스킬 타격 최대 0.45)

export function syncComets(world: World) {
  const list = world.volleys.filter((v) => v.blast === 'fire');
  if (list.length < cometsFalling) {
    rumble(COMET_HIT.shake);
    pause(COMET_HIT.stop);
  }
  cometsFalling = list.length;
  list.forEach((v, i) => {
    let m = comets[i];
    if (!m) {
      const c = card(fireballFx, 'fireball', v.x, v.z, false);
      c.dir = dirIndex(Math.atan2(1, 1)); // 화면 아래(카메라 쪽)로 머리를 둔 그림: 꼬리가 위로 끌린다
      c.glow = 1;
      c.mesh.scale.setScalar(COMET_FALL.size);
      c.mesh.renderOrder = 2;
      const fill = new THREE.Mesh(COMET_DISC, COMET_MATS.fill);
      const mark = new THREE.Group().add(new THREE.Mesh(COMET_DISC, COMET_MATS.area), fill, new THREE.Mesh(COMET_RING, COMET_MATS.ring));
      mark.traverse((o) => (o.renderOrder = 1)); // 바닥 다음, 캐릭터 전에
      cards.push(c);
      group.add(c.mesh, mark);
      comets[i] = m = { c, mark, fill };
    }
    const [x, y, z, p] = cometAt(v);
    m.c.mesh.position.set(x, y, z);
    m.mark.position.set(v.x, 0.04, v.z);
    m.mark.scale.setScalar(v.r);
    m.fill.scale.setScalar(Math.max(0.001, p));
    m.c.mesh.visible = m.mark.visible = true;
  });
  for (const m of comets.slice(list.length)) m.c.mesh.visible = m.mark.visible = false;
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
    c.mesh.visible = !s.wait; // 뒤따르는 화살(관통 사격 5단계)은 날기 전까지 숨긴다
  }
}

// 바닥 아이템 판자를 world.items에 맞춘다. 새 아이템은 떨어지는 애니메이션부터
export function syncItems(world: World) {
  const live = new Set(world.items.map((it) => it.id));
  for (const [id, p] of pillars) {
    if (live.has(id)) continue;
    p.removeFromParent();
    (p.material as THREE.Material).dispose();
    pillars.delete(id);
  }
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
    const q = it.kind === 'potion' || it.kind === 'gold' ? 0 : quality({ affixes: it.affixes ?? [] });
    if (q < 3) continue;
    const mat = new THREE.MeshBasicMaterial({ color: q === 3 ? UNIQUE_COLOR.legend : UNIQUE_COLOR.set, vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    const p = new THREE.Mesh(PILLAR_GEO, mat);
    p.position.set(it.x, 0, it.z);
    p.renderOrder = 3;
    pillars.set(it.id, p);
    group.add(p);
    pause(PILLAR.stop); // 떨어진 순간 잠깐 멈춘다
    rumble(PILLAR.shake);
  }
}

// 새 층의 소품·계단·화로 빛. 이전 층의 재질·질감·광원·물약 판자는 해제한다(지오메트리는 공유)
export function buildProps(world: World): THREE.Group {
  cards.forEach(free);
  items.clear();
  comets = []; // 판자는 위에서 풀렸다
  cometsFalling = 0;
  for (const p of pillars.values()) (p.material as THREE.Material).dispose();
  pillars.clear();
  shots.clear();
  effects = [];
  resetWard();
  cleavesSeen = world.cleaves;
  markSeen = world.markSlashes;
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
  chestCards = world.chests.map((ch, i) => {
    const npc = ch.kind === 'elder' ? npcs.captain : ch.kind === 'merchant' ? npcs.merchant : ch.kind === 'villager' ? (i % 2 ? npcs.villager2 : npcs.villager1) : null;
    if (npc) {
      const c = Object.assign(card(npc, 'stance', ch.x + 0.5, ch.z + 0.5, false), { dir: NPC_DIR });
      return { card: c, open: c.clip };
    }
    const [sheet, name] = ch.kind === 'shrine' ? [ruin, 'shrine'] : ch.kind === 'trial' ? [ruin, 'trial'] : [props, cellHash(ch.x, ch.z) % 2 ? 'chest2' : 'chest'];
    const open = sheet.info.anims[name === 'shrine' ? 'shrine_off' : `${name}_open`];
    const c = card(sheet, name, ch.x + 0.5, ch.z + 0.5, false);
    if (ch.open) c.clip = open;
    if (ch.kind === 'ice') c.tint = ICE_CHEST;
    if (ch.kind === 'shrine') c.glow = 0.9; // 구슬이 빛난다
    return { card: c, open };
  });
  cards.push(...chestCards.map((c) => c.card));
  // 눕힌 판자: 가시 바닥(칸의 위 꼭짓점), 푸른 마법진(2×2칸, 가운데가 마법진 칸)
  spikeCards = world.spikes.map(([x, z]) => card(ruin, 'spikes', x, z, true));
  cards.push(...spikeCards, ...world.portals.map(([x, z]) => Object.assign(card(ruin, 'portal', x - 1, z - 1, true), { glow: 1 })));
  gateCards.clear();
  trapCards.clear();
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
    c.mat.color.copy(TINT).multiplyScalar(Math.max(c.glow, light(c.mesh.position.x, c.mesh.position.z)) * (c.dim ?? 1));
    if (c.tint) c.mat.color.multiply(c.tint);
  }
}
