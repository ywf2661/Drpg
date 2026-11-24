// 소품·계단·바닥 물약·화로 불빛. 모두 캐릭터와 같은 세로 판자(발 아래는 바닥에 눕힘), 화로마다 점광원 1개.
import { impact, pause, rumble } from './feel';
import { slashBurst } from './iaido';
import * as THREE from 'three';
import { POWDER } from '../sim/rules';
import { CHEST, COMET, GRADE_COLOR, quality, RUNE_COLOR, runeGrade, runeIcon, SPIKE, UNIQUE_COLOR, uniqueOf, type HeroClass, type Item, type Prop, type World } from '../sim/world';
import { relicCount, SANCTUM } from '../sim/sanctum';
import { litBeams, paladinOf } from '../sim/paladin';
import { GATE_FIRES } from '../sim/wilds';
import lootInfo from '../assets/sprites/loot.json';
import runesInfo from '../assets/sprites/runes.json';
import runesUrl from '../assets/sprites/runes.png';
import floorGearInfo from '../assets/sprites/floor_gear.json';
import floorGearUrl from '../assets/sprites/floor_gear.png';
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
import tentsInfo from '../assets/sprites/tents.json';
import lakeTreesInfo from '../assets/sprites/lake_trees.json';
import lakeTreesUrl from '../assets/sprites/lake_trees.png';
import lakePlantsInfo from '../assets/sprites/lake_plants.json';
import lakePlantsUrl from '../assets/sprites/lake_plants.png';
import tentsUrl from '../assets/sprites/tents.png';
import raidInfo from '../assets/sprites/raid_props.json';
import raidUrl from '../assets/sprites/raid_props.png';
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
// ponytail: 성물 전용 그림이 없어 물약 그림에 금빛을 입힌다(빛기둥이 전설처럼 선다). 그림이 생기면 여기서 바꾼다
const lootClip = (it: Item, cls: HeroClass) =>
  it.kind === 'relic'
    ? 'potion'
    : it.kind === 'gold'
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
  tent: ['tent_a', 'tent_b', 'tent_rope', 'lean_to'], // tents 시트(tools/tents.py)
  tentBig: ['tent_big', 'tent_round'],
  pad: [],
};
type Sheet = { info: SheetInfo; url: string; tex?: THREE.Texture; geo?: THREE.BufferGeometry };
type Card = { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; info: SheetInfo; clip: Clip; t: number; glow: number; dir: number; dim?: number; tint?: THREE.Color }; // dir: 방향 행(화살), dim: 밝기 배수(잠긴 야영지 상자), tint: 색(얼어붙은 보물·가시 예고)
const props: Sheet = { info: propsInfo as SheetInfo, url: propsUrl };
// 야영지 사람(FLARE npcs, 서 있는 동작 8방향): 순찰대장·상인·주민 둘. 상자 칸에 정면(NPC_DIR)을 보고 선다
const PRIEST_ROBE = new THREE.Color(0.9, 0.88, 1.15); // 사제: 빛바랜 흰 옷
const SICK_SKIN = new THREE.Color(0.75, 0.9, 0.62); // 앓는 주민: 핏기 없는 회녹색
const npcs = { captain: { info: captainInfo as SheetInfo, url: captainUrl }, merchant: { info: merchantInfo as SheetInfo, url: merchantUrl }, villager1: { info: villager1Info as SheetInfo, url: villager1Url }, villager2: { info: villager2Info as SheetInfo, url: villager2Url } } as Record<'captain' | 'merchant' | 'villager1' | 'villager2', Sheet>;
const NPC_DIR = 6;
const stairs: Sheet = { info: stairsInfo as SheetInfo, url: stairsUrl };
const loot: Sheet = { info: lootInfo as SheetInfo, url: lootUrl };
const runeSheet: Sheet = { info: runesInfo as SheetInfo, url: runesUrl }; // 바닥 룬(tools/runes.py)
const floorGear: Sheet = { info: floorGearInfo as SheetInfo, url: floorGearUrl }; // 바닥 투구·신발(tools/floor_gear.py)
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
const tents: Sheet = { info: tentsInfo as SheetInfo, url: tentsUrl };
const raidSheet: Sheet = { info: raidInfo as SheetInfo, url: raidUrl }; // 약탈자 진지 소품(tools/raid.py)
const lakeTrees: Sheet = { info: lakeTreesInfo as SheetInfo, url: lakeTreesUrl }; // 호숫가 숲(tools/lake.py)
const lakePlants: Sheet = { info: lakePlantsInfo as SheetInfo, url: lakePlantsUrl }; // 물가 풀 // 원정대 천막(2×2·4×4 칸, 기준점 = 바닥 마름모 가운데)
const ruin: Sheet = { info: ruinInfo as SheetInfo, url: ruinUrl }; // 성소·시련 상자(세움), 가시 바닥·푸른 마법진(눕힘: 기준점 = 마름모 위 꼭짓점)
const wiz = { ember: fx('ember'), thunder: fx('thunder'), spark: fx('spark'), ice: fx('ice'), frost: fx('frost'), blink: fx('blink'), heal: fx('heal') };
const FLAME_GAP = 0.55; // 불길 위 불꽃 간격(m)
const flames = new Map<number, Card[]>(); // 불길 id → 그 길 위의 불꽃들
let cards: Card[] = [];
let trees: { c: Card; x: number; z: number }[] = [];
// 약탈자 진지: 말뚝(칸 번호), 화약통(world.kegs 차례), 도화선 바닥 무늬, 도화선을 기어가는 불꽃
let stakeCards: { c: Card; i: number }[] = [];
let kegCards: Card[] = [];
let trail: { mesh: THREE.InstancedMesh; cells: number[] } | null = null;
let sparkFx: THREE.Mesh[] = [];
const LIT = new THREE.Color(3, 0.9, 0.4);
const RAID_DEBRIS = ['crate0', 'crate1', 'crate2', 'crate3', 'wood0', 'wood1', 'stump0', 'stump1', 'stump2', 'cauldron'];
const BARRICADE = ['cheval0', 'cheval1', 'cheval2', 'cheval3', 'cheval4', 'cheval0', 'cheval2', 'crate1', 'crate3', 'wood0', 'wood1', 'stump1'];
const KEG_RED = new THREE.Color(1.45, 0.55, 0.42); // 화약통은 붉게(터지는 통이라는 뜻)
// 약탈자 진지: 가장자리 띠(5칸 안)가 아닌 막힌 칸('#')은 바위 대신 바리케이드(엇걸린 말뚝·상자·장작). render.ts와 같이 쓴다
export const barricadeAt = (world: World, x: number, z: number) => world.land === 'raid' && Math.min(x, z, world.grid.w - 1 - x, world.grid.h - 1 - z) >= 5; // 호숫가 숲의 나무(주인공 앞을 가리면 숨긴다)
let group = new THREE.Group();
// 무너진 성소 입구(초원 1구역): 계단 구덩이 + 석상 + 화로(성물 수만큼 붉게) + 열렸으면 핏빛 안개·불씨·맥동하는 빛
const DREAD_FIRE = new THREE.Color(1, 0.4, 0.34);
const EMBERS = 46;
let dread: { stage: number; glow: THREE.MeshBasicMaterial; mist: THREE.MeshBasicMaterial | null; embers: THREE.Points | null; light: THREE.PointLight | null } | null = null; // 성소 입구 자리(금이 숨 쉬듯 빛난다)
// 성소 5층: 켜진 성소에서 성기사로 이어지는 금빛 줄기(성소 순서)
let beams: { line: THREE.Line; id: number; zone: THREE.Mesh; fill: THREE.Mesh }[] = [];
// 성소 둘레 원: 켜진 동안 옅게(여기 서면 바친다), 바치는 동안 밝은 띠가 한 바퀴 차오른다(drawRange = 조각 × 색인 6)
const ALTAR_SEGS = 48;
const ALTAR_ZONE = new THREE.RingGeometry(CHEST.reach - 0.05, CHEST.reach, ALTAR_SEGS).rotateX(-Math.PI / 2);
const items = new Map<number, Card>(); // 바닥 아이템 id → 판자
// 전설·세트 장비의 빛기둥(바닥 아이템 id → 기둥). 위로 갈수록 옅은 원기둥, 가산 혼합
const pillars = new Map<number, THREE.Mesh>();
const PILLAR = { h: 5, stop: 0.3, shake: 0.25 };
// 등급 표시: 마법 = 바닥 고리, 희귀 = 짧은 기둥(SHORT배), 전설·세트 = 긴 기둥. 색만이 아니라 높이로도 갈린다
const GRADE = { short: 0.3, ring: 0.55, faint: 0.4 };
const RING_GEO = new THREE.RingGeometry(0.2, 0.3, 24).rotateX(-Math.PI / 2).translate(0, 0.02, 0);
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
const BEACON_COLD = new THREE.Color(0.3, 0.4, 0.75); // 의뢰 봉화(꺼짐): 불꽃이 멈춘 채 어둡고 푸르게(곱하기라 주황 불꽃은 밝게 못 바꾼다)
const SEAL_RED = new THREE.Color(3, 0.7, 0.6); // 의뢰 봉인 제단: 붉게
const KEEPER_GOLD = new THREE.Color(2.2, 1.7, 0.7); // 의뢰 잠긴 궤: 금빛
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
// 성소 입구 자리의 금(성물 수 = 단계 1~4). 가운데서 뻗는 갈래들: 단계가 오를수록 갈래가 늘고 길어지고 넓어진다(앞 단계의 금이 그대로 자란다).
// glow면 틈 속 붉은 빛(가는 선), 아니면 검은 틈
const CRACK = { size: 256, branches: [0, 1, 3, 6, 7], reach: [0, 0.25, 0.5, 0.85, 1], width: [0, 2.2, 3.2, 4.5, 5.5] };
const crackTex = new Map<string, THREE.CanvasTexture>();
function crackTexture(stage: number, glow: boolean): THREE.CanvasTexture {
  const key = `${stage}${glow}`;
  if (crackTex.has(key)) return crackTex.get(key)!;
  const S = CRACK.size;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.lineCap = g.lineJoin = 'round';
  g.strokeStyle = glow ? 'rgba(255,60,30,1)' : 'rgba(6,2,2,0.92)';
  const R = S / 2 - 4;
  const grow = (x: number, y: number, ang: number, d: number, seed: number, w: number) => {
    for (; d < CRACK.reach[stage] * R && w > 0.4; seed += 7) {
      const step = 6 + hash01(seed) * 6;
      ang += (hash01(seed + 1) - 0.5) * 0.9;
      const [nx, ny] = [x + Math.cos(ang) * step, y + Math.sin(ang) * step];
      g.lineWidth = (glow ? 0.45 : 1) * w * (1 - d / R) + (glow ? 0.3 : 0.8);
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(nx, ny);
      g.stroke();
      if (hash01(seed + 2) < 0.18) grow(nx, ny, ang + (hash01(seed + 3) < 0.5 ? -1 : 1) * (0.6 + hash01(seed + 4) * 0.5), d + step, seed * 3 + 11, w * 0.6); // 곁가지
      [x, y, d] = [nx, ny, d + step];
    }
  };
  for (let b = 0; b < CRACK.branches[stage]; b++) grow(S / 2, S / 2, b * 2.39996 + hash01(b + 50) * 0.5, 0, 1000 + b * 97, CRACK.width[stage]);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  crackTex.set(key, t);
  return t;
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
  for (const s of [...Object.values(npcs), ruin, tents, raidSheet, lakeTrees, lakePlants, props, stairs, loot, runeSheet, floorGear, arrow, cleaveFx, fireballFx, blastFx, axeFx, quakeFx, gateFx, flameFx, trapFx, stuckFx, ...Object.values(wiz)]) {
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
    if (ch.open && c && ch.kind === 'beacon') Object.assign(c.card, { glow: 1, tint: undefined }); // 켜진 봉화
    if (c && ch.kind === 'sick') c.card.mesh.scale.y = ch.open ? 1 : 0.62; // 앓는 주민: 웅크려 있다가 정화하면 일어선다
    if (c && ch.kind === 'sick' && ch.open) c.card.tint = undefined;
    if (c) c.card.dim = ch.guards?.some((id) => world.entities[id].state !== 'dead') ? 0.4 : 1; // 야영지 무리가 살아 있으면 어둡게(잠김)
  });
  const boss = paladinOf(world);
  const lit = litBeams(world); // 기절·성검의 비 동안은 꺼진다(paladin.ts)
  for (const b of beams) {
    const ch = world.chests[b.id];
    const offering = world.offer?.id === ch.id;
    b.zone.visible = !!boss && !ch.open && !offering;
    b.fill.visible = offering;
    if (offering) b.fill.geometry.setDrawRange(0, 6 * Math.ceil(ALTAR_SEGS * Math.min(1, world.offer!.t / SANCTUM.offer)));
    b.line.visible = lit.includes(ch) && !(world.pal.link[ch.id] > 0); // 바닥 예고(zones.ts)가 끝나야 공중 줄이 이어진다
    if (!b.line.visible) continue;
    const a = b.line.geometry.getAttribute('position') as THREE.BufferAttribute;
    a.setXYZ(0, ch.x + 0.5, 1, ch.z + 0.5);
    a.setXYZ(1, boss!.x, 1.4, boss!.z);
    a.needsUpdate = true;
  }
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
    if (b.kind === 'feather') {
      rumble(0.06); // 매가 덮친 자리: 깃털 조각은 hawk.ts
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

// 사슬 가르기의 사슬: 주인공 손에서 날아가는 사슬 도끼까지 길쭉한 쇠고리를 엇갈려(90°씩 돌려) 잇는다. 사슬 도끼마다 하나
const chains = new Map<number, THREE.InstancedMesh>();
const LINK = { gap: 0.19, max: 60, y: 0.6 }; // 고리 간격(m), 최대 고리 수(사거리 ÷ 간격보다 넉넉히), 높이(손 높이쯤)
const linkGeo = new THREE.TorusGeometry(0.075, 0.024, 5, 10).rotateY(Math.PI / 2).scale(1, 1, 1.7); // 고리 면이 사슬 방향(+z)을 품게
const linkMat = new THREE.MeshBasicMaterial({ toneMapped: false });
const linkColor = [new THREE.Color(0xc8ced6), new THREE.Color(0x7a808a)]; // 엇갈린 고리를 밝게·어둡게
const dummy = new THREE.Object3D();
function makeChain(): THREE.InstancedMesh {
  const ch = new THREE.InstancedMesh(linkGeo, linkMat, LINK.max);
  for (let i = 0; i < LINK.max; i++) ch.setColorAt(i, linkColor[i % 2]);
  ch.frustumCulled = false;
  return ch;
}
function layChain(ch: THREE.InstancedMesh, x0: number, z0: number, x1: number, z1: number) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.min(LINK.max, Math.floor(len / LINK.gap));
  for (let i = 0; i < n; i++) {
    const k = ((i + 0.5) * LINK.gap) / (len || 1);
    dummy.position.set(x0 + (x1 - x0) * k, LINK.y, z0 + (z1 - z0) * k);
    dummy.lookAt(x1, LINK.y, z1);
    if (i % 2) dummy.rotateZ(Math.PI / 2);
    dummy.updateMatrix();
    ch.setMatrixAt(i, dummy.matrix);
  }
  ch.count = n;
  ch.instanceMatrix.needsUpdate = true;
}
// 날아가는 화살 판자를 world.shots에 맞춘다(위치는 매 프레임)
export function syncShots(world: World) {
  const live = new Set(world.shots.map((s) => s.id));
  for (const [id, ch] of chains) {
    if (live.has(id)) continue;
    ch.removeFromParent();
    chains.delete(id);
  }
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
      c = fire ? card(fireballFx, 'fireball', s.x, s.z, false) : s.kind === 'axe' || s.kind === 'hook' ? card(axeFx, 'axe', s.x, s.z, false) : s.kind === 'bolt' ? card(wiz.ember, 'ember', s.x, s.z, false) : card(arrow, 'fly', s.x, s.z, false);
      c.dir = dirIndex(Math.atan2(s.dx, s.dz));
      c.glow = fire || s.kind === 'bolt' ? 1 : 0.7; // 화염구·마력탄은 스스로 빛난다
      c.mesh.renderOrder = 2;
      shots.set(s.id, c);
      cards.push(c);
      group.add(c.mesh);
    }
    c.mesh.position.set(s.x, 0, s.z);
    c.mesh.visible = !s.wait; // 뒤따르는 화살(관통 사격 5단계)은 날기 전까지 숨긴다
    if (s.kind !== 'hook') continue;
    let ch = chains.get(s.id);
    if (!ch) {
      ch = makeChain();
      chains.set(s.id, ch);
      group.add(ch);
    }
    const hero = world.entities[0];
    layChain(ch, hero.x, hero.z, s.x, s.z);
  }
}

// 바닥 아이템 판자를 world.items에 맞춘다. 새 아이템은 떨어지는 애니메이션부터
// 엔딩: 「금 간 빛 고리」는 마녀 앞에서 떨어질 때까지 바닥에 그리지 않는다(떨어지는 순간 빛기둥·멈칫이 함께)
let holdHalo = false;
export const setHoldHalo = (on: boolean) => (holdHalo = on);
let hideBeams = false; // 엔딩 1 동안은 바닥 아이템 빛기둥·고리를 숨긴다(빛 속 장면을 가리지 않게)
export const setHideBeams = (on: boolean) => (hideBeams = on);
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
    if (items.has(it.id) || (holdHalo && it.affixes && uniqueOf({ affixes: it.affixes }) === 'crackedHalo')) continue;
    const head = it.kind === 'helm' || it.kind === 'boots' ? `${world.cls === 'necromancer' ? 'wizard' : world.cls}_${it.kind}${it.tier}` : null; // 투구·신발은 보관함 아이콘 그림
    const c = it.kind === 'rune' ? card(runeSheet, `rune${runeIcon(it.rune!)}`, it.x, it.z, false) : head ? card(floorGear, head, it.x, it.z, false) : card(loot, lootClip(it, world.cls), it.x, it.z, false);
    c.t = 0;
    c.glow = LOOT_MIN_LIGHT;
    c.mesh.renderOrder = 2; // 아이템은 늘 시체 위에 떨어진다. 시체(깊이 안 씀)보다 나중에 그려야 가려지지 않는다
    items.set(it.id, c);
    cards.push(c);
    group.add(c.mesh);
    const g = it.kind === 'rune' ? runeGrade(it.rune!) : -1;
    if (g >= 0) c.glow = 1; // 룬 돌은 어둠 속에서도 보이게
    if (it.kind === 'relic') Object.assign(c, { glow: 1, tint: KEEPER_GOLD });
    const q = it.kind === 'relic' ? 3 : it.kind === 'potion' || it.kind === 'gold' || it.kind === 'rune' ? 0 : quality({ affixes: it.affixes ?? [] });
    if (q < 1 && g < 2) continue; // 일반 장비·흔한 룬은 표시 없음
    const big = q >= 3 || g >= 2; // 긴 빛기둥: 전설·세트, 드묾 이상 룬
    const color = g >= 2 ? RUNE_COLOR[g] : q === 4 ? UNIQUE_COLOR.set : q === 3 ? UNIQUE_COLOR.legend : q === 2 ? GRADE_COLOR.rare : GRADE_COLOR.magic;
    const mat = new THREE.MeshBasicMaterial({ color, vertexColors: q !== 1 || big, transparent: true, opacity: big ? 0.55 : q === 2 ? GRADE.faint : GRADE.ring, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    const p = new THREE.Mesh(!big && q === 1 ? RING_GEO : PILLAR_GEO, mat);
    p.position.set(it.x, 0, it.z);
    if (!big && q === 2) p.scale.y = GRADE.short;
    p.renderOrder = 3;
    pillars.set(it.id, p);
    group.add(p);
    if (!big) continue;
    pause(PILLAR.stop); // 떨어진 순간 잠깐 멈춘다
    rumble(PILLAR.shake);
  }
  for (const p of pillars.values()) p.visible = !hideBeams;
}

// 새 층의 소품·계단·화로 빛. 이전 층의 재질·질감·광원·물약 판자는 해제한다(지오메트리는 공유)
// 호숫가 꾸미기(그림만, sim과 상관없다): 벽 칸('#', 통나무집·상자·소품 칸 빼고) 중 트인 칸에서 2칸 안에 나무(1칸이면 다, 2칸이면 셋에 하나),
// 물가(물에 닿은 땅)의 절반 가까이와 들판 드문드문에 풀. 자리는 칸 해시로 정해 들어올 때마다 같다
const TREE_PICK = [8, 9, 10, 11, 12, 13, 14, 15, 8, 9, 12, 13, 0, 1, 4, 5]; // 침엽·활엽이 많고 청록·고목이 섞인다
const PLANT_PICK = [2, 3, 2, 3, 0, 1, 4, 5, 8, 9, 10, 11, 12, 13, 6, 7]; // 갈대가 많다
// 약탈자 진지: 말뚝 방책(칸마다 말뚝 둘 — 해골 섞어), 화약통, 도화선(바닥의 검은 화약 줄). 카드는 cards에 넣고, 3D는 돌려준다
function raidDeco(world: World): THREE.Object3D[] {
  const W = world.grid.w;
  stakeCards = [];
  kegCards = [];
  sparkFx = [];
  trail = null;
  if (!world.stakes.length && !world.kegs.length) return [];
  for (const [x, z] of world.stakes) {
    const k = cellHash(x, z);
    for (const [ox, oz] of [[-0.22, 0.18], [0.2, -0.2]]) {
      const name = k % 5 === 0 && ox < 0 ? `skull${(k >>> 3) % 5}` : `stake${(k >>> (ox < 0 ? 2 : 5)) % 8}`;
      const c = card(raidSheet, name, x + 0.5 + ox, z + 0.5 + oz, false);
      stakeCards.push({ c, i: z * W + x });
      cards.push(c);
    }
  }
  for (const g of world.kegs) {
    const c = card(raidSheet, 'keg', g.x + 0.5, g.z + 0.5, false);
    c.mesh.scale.setScalar(1.45); // 눈에 띄게
    c.tint = KEG_RED;
    kegCards.push(c);
    cards.push(c);
  }
  // 바리케이드: 막힌 칸 중 트인 칸에서 1칸 안(안쪽 깊은 덩어리는 듬성듬성)
  const { w: GW, h: GH, blocked } = world.grid;
  const stake = new Set(world.stakes.map(([x, z]) => z * GW + x));
  for (let z = 0; z < GH; z++)
    for (let x = 0; x < GW; x++) {
      const i = z * GW + x;
      if (blocked[i] !== 1 || stake.has(i) || !barricadeAt(world, x, z) || world.kegs.some((k) => k.x === x && k.z === z) || world.props.some((p) => p.x === x && p.z === z) || world.chests.some((p) => p.x === x && p.z === z)) continue;
      const k = cellHash(x, z);
      const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => blocked[(z + dz) * GW + x + dx] === 0);
      if (!edge && k % 3) continue;
      cards.push(card(raidSheet, BARRICADE[k % BARRICADE.length], x + 0.5 + ((k >>> 4) % 10) / 40 - 0.12, z + 0.5 + ((k >>> 8) % 10) / 40 - 0.12, false));
    }
  // 도화선: 칸 가운데에서 이웃한 도화선 칸·화약통 쪽으로 반 칸씩 — 끊기지 않는 검은 화약 줄(칸마다 5조각: 가운데 + 네 방향)
  const cells = [...world.powder];
  const kegAt = new Set(world.kegs.map((k) => k.z * W + k.x));
  const linked = (j: number) => world.powder.has(j) || kegAt.has(j);
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x0c0a08, transparent: true, opacity: 0.92, depthWrite: false }), Math.max(1, cells.length * 5));
  const m = new THREE.Matrix4();
  const s = new THREE.Vector3();
  cells.forEach((i, k) => {
    const [x, z] = [i % W + 0.5, Math.floor(i / W) + 0.5];
    mesh.setMatrixAt(k * 5, m.compose(new THREE.Vector3(x, 0.03, z), new THREE.Quaternion(), s.set(0.26, 1, 0.26)));
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dz], n) => {
      const on = linked(i + dx + dz * W);
      mesh.setMatrixAt(k * 5 + 1 + n, m.compose(new THREE.Vector3(x + dx * 0.25, 0.03, z + dz * 0.25), new THREE.Quaternion(), on ? s.set(dx ? 0.5 : 0.2, 1, dz ? 0.5 : 0.2) : s.set(0, 0, 0)));
    });
  });
  mesh.count = cells.length * 5;
  trail = { mesh, cells };
  return [mesh];
}

// 매 프레임: 부서진 말뚝·터진 통은 숨기고, 불붙은 통은 붉게 깜빡이고, 다 탄 도화선은 지우고, 기어가는 불꽃을 그린다
export function syncRaid(world: World, time: number) {
  if (!stakeCards.length && !kegCards.length) return;
  for (const s of stakeCards) s.c.mesh.visible = !world.broken.has(s.i);
  while (kegCards.length < world.kegs.length) {
    const g = world.kegs[kegCards.length]; // 우두머리가 던진 통
    const c = card(raidSheet, 'keg', g.x + 0.5, g.z + 0.5, false);
    c.mesh.scale.setScalar(1.45);
    kegCards.push(c);
    cards.push(c);
    group.add(c.mesh);
  }
  world.kegs.forEach((g, k) => {
    const c = kegCards[k];
    if (!c) return;
    c.mesh.visible = !g.done;
    if (g.fx !== undefined) c.mesh.position.set(g.fx, 0, g.fz!);
    c.mesh.rotation.z = g.roll ? Math.sin(time * 18) * 0.25 : 0; // 굴러오는 중
    c.tint = g.lit ? KEG_RED.clone().lerp(LIT, 0.5 + 0.5 * Math.sin(time * (g.fuse < 0.6 ? 40 : 16))) : KEG_RED;
    c.glow = g.lit ? 1 : 0;
  });
  world.props.forEach((p, k) => p.gone && cards[k] && (cards[k].mesh.visible = false)); // 쓰러진 천막
  if (trail) {
    const m = new THREE.Matrix4();
    m.makeScale(0, 0, 0);
    trail.cells.forEach((i, k) => {
      if (world.powder.has(i)) return;
      for (let n = 0; n < 5; n++) trail!.mesh.setMatrixAt(k * 5 + n, m); // 다 탄 화약은 지운다
    });
    trail.mesh.instanceMatrix.needsUpdate = true;
  }
  const W = world.grid.w;
  while (sparkFx.length < world.sparks.length) {
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd060, toneMapped: false }));
    f.add(new THREE.PointLight(0xff9a40, 2, 3));
    sparkFx.push(f);
    group.add(f);
  }
  sparkFx.forEach((f, k) => {
    const s = world.sparks[k];
    f.visible = !!s;
    if (!s) return;
    let j = 0;
    while (j + 1 < s.d.length && s.d[j + 1] <= s.t * POWDER.spark) j++;
    const i = s.cells[j];
    f.position.set((i % W) + 0.5, 0.15 + Math.abs(Math.sin(time * 30)) * 0.06, Math.floor(i / W) + 0.5);
    f.scale.setScalar(0.8 + Math.random() * 0.5);
  });
}

function lakeDeco(world: World): Card[] {
  const { w, h, blocked } = world.grid;
  const taken = new Set([...world.props, ...world.chests, ...world.gates, ...world.logs.map(([x, z]) => ({ x, z }))].map((p) => p.z * w + p.x));
  const path = new Set([...world.roads, ...world.planks].map(([x, z]) => z * w + x));
  const at = (x: number, z: number) => (x >= 0 && z >= 0 && x < w && z < h ? blocked[z * w + x] : 1);
  const jit = (k: number, s: number) => ((cellHash(k, s) % 100) / 100 - 0.5) * 0.5;
  const out: Card[] = [];
  for (let z = 0; z < h; z++)
    for (let x = 0; x < w; x++) {
      const i = z * w + x;
      const k = cellHash(x, z);
      if (taken.has(i)) continue;
      if (blocked[i] === 1) {
        let near = 9;
        for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) if (at(x + dx, z + dz) !== 1) near = Math.min(near, Math.max(Math.abs(dx), Math.abs(dz)));
        if (near > 2 || (near === 2 && k % 3)) continue;
        const c = card(lakeTrees, `tree${TREE_PICK[k % 16]}`, x + 0.5 + jit(x, 7), z + 0.5 + jit(z, 13), false);
        c.mesh.scale.setScalar(0.85 + (k % 7) * 0.06);
        trees.push({ c, x: x + 0.5, z: z + 0.5 });
        out.push(c);
      } else if (blocked[i] === 0 && !path.has(i)) {
        const shore = [-1, 0, 1].some((dz) => [-1, 0, 1].some((dx) => at(x + dx, z + dz) === 2));
        if ((shore && k % 100 < 45) || k % 100 < 4) out.push(card(lakePlants, `plant${PLANT_PICK[(k >>> 3) % 16]}`, x + 0.5 + jit(x, 3), z + 0.5 + jit(z, 5), false));
      }
    }
  return out;
}

// 호숫가 숲: 주인공보다 카메라 쪽(+x+z)에 있어 주인공을 가릴 나무는 숨긴다(벽의 앞면 낮추기와 같은 일)
export function fadeTrees(hx: number, hz: number) {
  for (const t of trees) {
    const [dx, dz] = [t.x - hx, t.z - hz];
    t.c.mesh.visible = !(dx + dz > 0 && dx + dz < 4.5 && Math.abs(dx - dz) < 3);
  }
}

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
    if (p.kind === 'tent' || p.kind === 'tentBig') {
      const n = p.kind === 'tent' ? 1 : 2; // 글자는 왼쪽 위 칸 → 덮는 칸들의 가운데(칸 모서리)에 세운다
      return card(tents, names[cellHash(p.x, p.z) % names.length], p.x + n, p.z + n, false);
    }
    if (p.kind === 'debris' && world.land === 'raid') return card(raidSheet, RAID_DEBRIS[cellHash(p.x, p.z) % RAID_DEBRIS.length], p.x + 0.5, p.z + 0.5, false); // 진지의 잔해 = 상자·장작·그루터기·솥
    const c = card(props, names[cellHash(p.x, p.z) % names.length] ?? 'barrel', p.x + 0.5, p.z + 0.5, p.kind === 'debris');
    c.mesh.visible = p.kind !== 'pad'; // 천막이 덮는 칸: 판자는 두되 안 그린다(번호를 world.props와 맞춘다)
    return c;
  });
  chestCards = world.chests.map((ch) => {
    const npc = ch.kind === 'elder' ? npcs.captain : ch.kind === 'merchant' ? npcs.merchant : ch.kind === 'asker' || ch.kind === 'priest' ? npcs.villager1 : ch.kind === 'villager' || ch.kind === 'sick' ? npcs.villager2 : null;
    if (npc) {
      const c = Object.assign(card(npc, 'stance', ch.x + 0.5, ch.z + 0.5, false), { dir: NPC_DIR });
      if (ch.kind === 'priest') c.tint = PRIEST_ROBE;
      if (ch.kind === 'sick') c.tint = SICK_SKIN; // 낫기 전엔 웅크린다(syncChests)
      return { card: c, open: c.clip };
    }
    if (ch.kind === 'wheel' || ch.kind === 'well' || ch.kind === 'keg') {
      const c = card(props, 'barrel', ch.x + 0.5, ch.z + 0.5, false);
      c.mesh.visible = false; // 3D 모형(water.ts)·화약통(raidDeco)
      return { card: c, open: c.clip };
    }
    if (ch.kind === 'beacon') {
      // 봉화 = 화로 그림. 꺼진 동안은 불꽃이 멈춘 채 얼음빛, 켜지면 원래 불(syncChests)
      const c = card(props, 'brazier', ch.x + 0.5, ch.z + 0.5, false);
      const lit = c.clip;
      if (!ch.open) Object.assign(c, { clip: { ...lit, ms: 1e9 }, glow: 0, tint: BEACON_COLD });
      return { card: c, open: lit };
    }
    const [sheet, name] = ch.kind === 'shrine' || ch.kind === 'seal' || ch.kind === 'altar' ? [ruin, 'shrine'] : ch.kind === 'trial' ? [ruin, 'trial'] : [props, cellHash(ch.x, ch.z) % 2 ? 'chest2' : 'chest'];
    const open = sheet.info.anims[name === 'shrine' ? 'shrine_off' : `${name}_open`];
    const c = card(sheet, name, ch.x + 0.5, ch.z + 0.5, false);
    if (ch.open) c.clip = open;
    if (ch.kind === 'ice') c.tint = ICE_CHEST;
    if (ch.kind === 'seal') c.tint = SEAL_RED;
    if (ch.kind === 'keeper') c.tint = KEEPER_GOLD;
    if (ch.kind === 'shrine' || ch.kind === 'altar') c.glow = 0.9; // 구슬이 빛난다
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
  trees = [];
  if (world.land === 'lake') cards.push(...lakeDeco(world));
  const raidExtra = raidDeco(world);
  // 무너진 성소 입구 자리: 성물이 모일수록 땅이 갈라지고(1~3: 금만, 밟고 지나간다), 넷이면 꺼져서 계단 구덩이·석상·화로(화로·뼈는 맵 글자로 그때만 생긴다)
  const gate = [...world.exits, ...world.locked].filter((e) => e.to === 'sanctum');
  const extra: THREE.Object3D[] = [];
  dread = null;
  const stage = relicCount(world.relics);
  if (gate.length && stage > 0) {
    const [gx, gz] = [Math.min(...gate.map((e) => e.x)) + 1, Math.min(...gate.map((e) => e.z)) + 1];
    const open = world.exits.some((e) => e.to === 'sanctum');
    const decal = (glow: boolean, y: number) => {
      const m = new THREE.MeshBasicMaterial({ map: crackTexture(stage, glow), transparent: true, depthWrite: false, ...(glow && { toneMapped: false, blending: THREE.AdditiveBlending }) });
      const mesh = new THREE.Mesh(discGeo, m);
      mesh.scale.setScalar(5.5);
      mesh.position.set(gx, y, gz);
      mesh.rotation.y = 0.7;
      extra.push(mesh);
      return m;
    };
    decal(false, 0.003);
    const glow = stage >= 2 ? decal(true, 0.006) : null;
    let [embers, light, mist]: [THREE.Points | null, THREE.PointLight | null, THREE.MeshBasicMaterial | null] = [null, null, null];
    if (stage >= 3) {
      const n = open ? EMBERS : 12; // 셋이면 불씨가 몇 개만
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) pos.set([gx + (hash01(i * 7) - 0.5) * 2.4, hash01(i * 13) * 3, gz + (hash01(i * 11) - 0.5) * 2.4], i * 3);
      embers = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3)), new THREE.PointsMaterial({ color: 0xff4a2a, size: 3, sizeAttenuation: false, transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }));
      embers.renderOrder = 3;
      light = new THREE.PointLight(0xff2418, 0, open ? 8 : 5, 1.5);
      light.position.set(gx, 0.8, gz);
      extra.push(embers, light);
    }
    if (open) {
      world.props.forEach((p, i) => p.kind === 'brazier' && GATE_FIRES.some(([a, b]) => p.x === gx - 1 + a && p.z === gz - 1 + b) && (cards[i].tint = DREAD_FIRE));
      cards.push(Object.assign(card(stairs, 'stairs', gx - 0.5 + STAIRS_AT[0], gz - 0.5 + STAIRS_AT[1], true), { tint: new THREE.Color(0.75, 0.32, 0.3) }));
      const pit = cards[cards.length - 1].mesh;
      pit.renderOrder = 2;
      pit.position.y += 0.01;
      for (const [ox, oz, n] of [[-3.2, 0.4, 'statue'], [0.4, -3.2, 'statue2']] as const) cards.push(Object.assign(card(props, n, gx + ox, gz + oz, false), { tint: new THREE.Color(0.6, 0.42, 0.45) }));
      const scorch = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({ color: 0x080103, transparent: true, opacity: 0.75, depthWrite: false }));
      scorch.scale.setScalar(3.1);
      scorch.position.set(gx, 0.004, gz);
      mist = new THREE.MeshBasicMaterial({ map: mistTexture(), color: 0xc01828, transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending });
      const mistMesh = new THREE.Mesh(discGeo, mist);
      mistMesh.scale.setScalar(3.4);
      mistMesh.position.set(gx, 0.05, gz);
      mistMesh.renderOrder = 1;
      extra.push(scorch, mistMesh);
    }
    if (glow) dread = { stage, glow, mist, embers, light };
  }
  // 성소 5층의 금빛 줄기(위치는 syncChests가 매 장면)
  beams = world.chests.filter((c) => c.kind === 'altar').map((c) => {
    const line = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3)), new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.7, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }));
    line.renderOrder = 3;
    const ringMat = (opacity: number) => new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending });
    const zone = new THREE.Mesh(ALTAR_ZONE, ringMat(0.35));
    const fill = new THREE.Mesh(new THREE.RingGeometry(CHEST.reach - 0.2, CHEST.reach, ALTAR_SEGS, 1, Math.PI / 2, Math.PI * 2).rotateX(-Math.PI / 2), ringMat(0.9));
    for (const m of [zone, fill]) Object.assign(m.position, { x: c.x + 0.5, y: 0.03, z: c.z + 0.5 }), (m.renderOrder = 2);
    extra.push(line, zone, fill);
    return { line, id: c.id, zone, fill };
  });
  braziers = world.props.flatMap((p) => (p.kind === 'brazier' ? [{ x: p.x + 0.5, z: p.z + 0.5 }] : []));
  // ponytail: 화로 빛은 그림자가 없어 벽 너머로 조금 샌다. 거슬리면 화로마다 castShadow(점광원 그림자는 6면 렌더)
  lights = braziers.map((b) => {
    const red = gate.length && GATE_FIRES.some(([a, c]) => b.x - 0.5 === Math.min(...gate.map((e) => e.x)) + a && b.z - 0.5 === Math.min(...gate.map((e) => e.z)) + c);
    const l = new THREE.PointLight(red ? 0xff2a1a : 0xff7a30, BRAZIER_LIGHT, BRAZIER_RANGE, 1.5);
    l.position.set(b.x, 1.2, b.z);
    return l;
  });
  floorAt = (x, z) => walkable(world.grid, Math.floor(x), Math.floor(z));
  coldLight = new THREE.PointLight(0x8cc4ff, 0, ICE.lightRange, 1.5);
  group = new THREE.Group();
  group.add(...cards.map((c) => c.mesh), ...lights, coldLight, wardFx, ...extra, ...raidExtra);
  return group;
}

// light(x, z): 그 위치 판자의 밝기(횃불·화로). glow는 최소 밝기(화로 = 불 자체라 1, 물약 = 0.6)
export function updateProps(dt: number, light: (x: number, z: number) => number) {
  time += dt;
  updateFields(dt);
  updateWard(dt);
  lights.forEach((l, k) => (l.intensity = BRAZIER_LIGHT * (1 + 0.08 * Math.sin(time * 9 + k * 2.1) + 0.05 * Math.sin(time * 21.3 + k))));
  if (dread) {
    const p = 0.5 + 0.5 * Math.sin(time * 2.2); // 숨 쉬듯 맥동
    dread.glow.opacity = [0, 0, 0.55, 0.8, 1][dread.stage] * (0.4 + 0.6 * p); // 틈 속 붉은 빛: 단계가 오를수록 짙게
    if (dread.light) dread.light.intensity = BRAZIER_LIGHT * (dread.mist ? 0.6 + 0.9 * p : 0.25 + 0.35 * p);
    if (dread.mist) dread.mist.opacity = 0.45 + 0.45 * p;
    const a = dread.embers?.geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
    for (let i = 0; a && i < a.count; i++) {
      let y = a.getY(i) + dt * (0.6 + hash01(i * 5) * 0.8);
      if (y > 3.2) y = 0.1;
      a.setXYZ(i, a.getX(i) + Math.sin(time * 1.7 + i) * dt * 0.15, y, a.getZ(i));
    }
    if (a) a.needsUpdate = true;
  }
  for (const b of beams) (b.line.material as THREE.LineBasicMaterial).opacity = 0.45 + 0.3 * Math.sin(time * 9 + b.id);
  for (const c of cards) {
    c.t += dt;
    const f = frameAt(c.clip, c.t);
    c.mat.map!.offset.set(f / c.info.cols, 1 - (c.clip.row + c.dir + 1) / c.info.rows);
    c.mat.color.copy(TINT).multiplyScalar(Math.max(c.glow, light(c.mesh.position.x, c.mesh.position.z)) * (c.dim ?? 1));
    if (c.tint) c.mat.color.multiply(c.tint);
  }
}
