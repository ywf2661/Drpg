// FLARE 8방향 도트 스프라이트로 캐릭터를 그린다. 캐릭터마다 카메라를 향한 세로 판자(빌보드) 1장.
import { EDGE_COLOR } from './edge';
import * as THREE from 'three';
import { ELITE_KINDS, SLOTS, STATS, UNIQUES, uniqueOf, type Entity, type Gear, type HeroClass, type Kind, type Skin, type Slot, type UniqueId, type World } from '../sim/world';
import heroInfo from '../assets/sprites/hero.json';
import heroOrder from '../assets/sprites/hero_layers.json';
import minionInfo from '../assets/sprites/minion.json';
import minionUrl from '../assets/sprites/minion.png';
import warriorInfo from '../assets/sprites/warrior.json';
import warriorUrl from '../assets/sprites/warrior.png';
import archerInfo from '../assets/sprites/archer.json';
import archerUrl from '../assets/sprites/archer.png';
import mageInfo from '../assets/sprites/mage.json';
import mageUrl from '../assets/sprites/mage.png';
import bossInfo from '../assets/sprites/boss.json';
import bossUrl from '../assets/sprites/boss.png';
import goblinInfo from '../assets/sprites/goblin.json';
import goblinUrl from '../assets/sprites/goblin.png';
import goblinEliteInfo from '../assets/sprites/goblin_elite.json';
import goblinEliteUrl from '../assets/sprites/goblin_elite.png';
import fireAntInfo from '../assets/sprites/fire_ant.json';
import fireAntUrl from '../assets/sprites/fire_ant.png';
import iceAntInfo from '../assets/sprites/ice_ant.json';
import iceAntUrl from '../assets/sprites/ice_ant.png';
import zombieInfo from '../assets/sprites/zombie.json';
import zombieUrl from '../assets/sprites/zombie.png';
import antlionInfo from '../assets/sprites/antlion.json';
import antlionUrl from '../assets/sprites/antlion.png';
import wyvernInfo from '../assets/sprites/wyvern.json';
import wyvernUrl from '../assets/sprites/wyvern.png';
import antlionSmallInfo from '../assets/sprites/antlion_small.json';
import antlionSmallUrl from '../assets/sprites/antlion_small.png';
import graveInfo from '../assets/sprites/grave.json';
import graveUrl from '../assets/sprites/grave.png';
import zombieDarkInfo from '../assets/sprites/zombie_dark.json';
import zombieDarkUrl from '../assets/sprites/zombie_dark.png';
import plagueInfo from '../assets/sprites/plague_villager.json';
import plagueUrl from '../assets/sprites/plague_villager.png';
import hobgoblinInfo from '../assets/sprites/hobgoblin.json';
import hobgoblinUrl from '../assets/sprites/hobgoblin.png';
import hobgoblinArcherInfo from '../assets/sprites/hobgoblin_archer.json';
import hobgoblinArcherUrl from '../assets/sprites/hobgoblin_archer.png';
import boneKnightInfo from '../assets/sprites/bone_knight.json';
import boneKnightUrl from '../assets/sprites/bone_knight.png';
import demonInfo from '../assets/sprites/demon.json';
import demonUrl from '../assets/sprites/demon.png';
import fallenPaladinInfo from '../assets/sprites/fallen_paladin.json';
import fallenPaladinUrl from '../assets/sprites/fallen_paladin.png';
import fallenPaladinHeads from '../assets/sprites/fallen_paladin_heads.json';
import timeWardenInfo from '../assets/sprites/time_warden.json';
import ferrymanInfo from '../assets/sprites/plague_ferryman.json';
import chiefInfo from '../assets/sprites/raider_chief.json';
import chiefUrl from '../assets/sprites/raider_chief.png';
import raiderInfo from '../assets/sprites/raider_goblin.json';
import raiderUrl from '../assets/sprites/raider_goblin.png';
import raiderOrcInfo from '../assets/sprites/raider_orc.json';
import raiderOrcUrl from '../assets/sprites/raider_orc.png';
import treantInfo from '../assets/sprites/swamp_treant.json';
import treantUrl from '../assets/sprites/swamp_treant.png';
import ferrymanUrl from '../assets/sprites/plague_ferryman.png';
import timeWardenUrl from '../assets/sprites/time_warden.png';

export type Anim = 'stance' | 'move' | 'attack' | 'hit' | 'die';
export type Clip = { row: number; frames: number; ms: number; loop: 'back_forth' | 'looped' | 'play_once' };
export type SheetInfo = { cell: number[]; anchor: number[]; ppm: number; cols: number; rows: number; anims: Record<string, Clip> };
// tint: 불빛에 곱하는 고유 색(정예는 특성 색). ring: 정예의 발밑 고리
// halo: 기도하는 자(성기사 그림)의 후광(k = 켜짐 정도 0~1, t = 맥동 시간). hero = 주인공의 「금 간 빛 고리」(고리만, 머리 위)
export type Sprite = { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; info: SheetInfo; anim: Anim; t: number; hp: number; maxHp: number; hitT: number; castT: number; tint: THREE.Color; ring?: THREE.Mesh; halo?: { glow: THREE.Mesh; ring: THREE.Mesh; k: number; t: number; hero?: boolean } };
// 후광: 맥동 주기(초)·빛무리 밝기 범위, 켜지고 꺼지는 시간(초). 고리 밝기 = ring + 맥동의 0.2배(빛무리보다 또렷하게)
export const HALO = { period: 2.6, min: 0.45, max: 0.75, fade: 1.2, ring: 0.75 };
// 주인공 머리 위 고리: y = 발에서 높이(m), broken = 되감기를 막 쓴 밝기 → 다시 쓸 수 있으면 1(그 사이는 차오름)
export const HERO_RING = { y: 1.65, w: 0.7, h: 0.3, broken: 0.15, refill: 0.55 };
export const heroRingLevel = (cd: number, total: number) => (cd <= 0 ? 1 : HERO_RING.broken + HERO_RING.refill * (1 - cd / total));
export const haloLevel = (t: number) => HALO.min + (HALO.max - HALO.min) * (0.5 - 0.5 * Math.cos((2 * Math.PI * t) / HALO.period));
export const CAST_SHOW = 0.35; // 스킬 시전 동작(공격 그림 = 마법사는 cast)을 보여 주는 시간(초)
const RING = new THREE.RingGeometry(0.4, 0.52, 28).rotateX(-Math.PI / 2);
const WHITE = new THREE.Color(1, 1, 1);
const ELITE_SIZE = 1.25;
const KING_TINT = new THREE.Color(0.95, 0.6, 1.35);
const KING_SIZE = 1.5;
// 그림을 키워 그리는 모습: 원본 그림이 작거나(와이번), 시트가 세로 한계에 닿아 더 크게 못 뽑는 보스(약탈자 우두머리)
const SKIN_SIZE: Partial<Record<Skin, number>> = { wyvern: KING_SIZE, treasure: ELITE_SIZE, raider_chief: 1.3 };
const GOLD_TINT = new THREE.Color(1.6, 1.25, 0.35); // 보물 고블린
export const ALLY_TINT = new THREE.Color(0.6, 1.3, 0.75); // 강령술사의 해골 병사: 초록빛

// 주인공 = 부위별 레이어 시트(기사 hero_<레이어>_<단계>.png, 마법사 wizard_…, 궁수 ranger_…, 강령술사 necromancer_…)를 방향마다 heroOrder(뒤에 깔리는 것부터) 순서로 겹친 그림.
// URL만 알고, 그림은 장착할 때 불러온다. 레이어 → 단계를 정하는 장비 부위(lower = 다리·손). 마법사·궁수는 방패(off)가 없다
const HERO_URLS = import.meta.glob(['../assets/sprites/hero_*_*.png', '../assets/sprites/wizard_*_*.png', '../assets/sprites/ranger_*_*.png', '../assets/sprites/necromancer_*_*.png'], { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
export const HERO_LAYERS: Record<string, Slot> = { main: 'weapon', head: 'helm', feet: 'boots', lower: 'armor', chest: 'armor', off: 'armor' };
export const HERO_ORDER: string[][] = heroOrder; // FLARE 방향 번호 → 레이어 순서
const PREFIX: Record<HeroClass, string> = { knight: 'hero', wizard: 'wizard', ranger: 'ranger', necromancer: 'necromancer' };
export const layerUrl = (layer: string, g: Gear, cls: HeroClass = 'knight'): string | undefined => HERO_URLS[`../assets/sprites/${PREFIX[cls]}_${layer}_${g[HERO_LAYERS[layer]]}.png`];
const layerImages = new Map<string, Promise<HTMLImageElement>>();
const SHEETS: Record<Kind | Skin, { info: SheetInfo; url: string }> = {
  hero: { info: heroInfo as SheetInfo, url: '' }, // 그림은 setHeroGear가 고른다
  minion: { info: minionInfo as SheetInfo, url: minionUrl },
  warrior: { info: warriorInfo as SheetInfo, url: warriorUrl },
  archer: { info: archerInfo as SheetInfo, url: archerUrl },
  mage: { info: mageInfo as SheetInfo, url: mageUrl },
  king: { info: warriorInfo as SheetInfo, url: warriorUrl }, // 해골 왕 = 전사 그림을 크게·보라색으로
  boss: { info: bossInfo as SheetInfo, url: bossUrl },
  // 초원·설원의 스킨
  goblin: { info: goblinInfo as SheetInfo, url: goblinUrl },
  goblin_elite: { info: goblinEliteInfo as SheetInfo, url: goblinEliteUrl },
  fire_ant: { info: fireAntInfo as SheetInfo, url: fireAntUrl },
  ice_ant: { info: iceAntInfo as SheetInfo, url: iceAntUrl },
  zombie: { info: zombieInfo as SheetInfo, url: zombieUrl },
  antlion: { info: antlionInfo as SheetInfo, url: antlionUrl },
  wyvern: { info: wyvernInfo as SheetInfo, url: wyvernUrl },
  treasure: { info: goblinInfo as SheetInfo, url: goblinUrl }, // 보물 고블린 = 고블린 그림을 금빛으로
  // 기믹·폐허
  antlion_small: { info: antlionSmallInfo as SheetInfo, url: antlionSmallUrl },
  grave: { info: graveInfo as SheetInfo, url: graveUrl },
  zombie_dark: { info: zombieDarkInfo as SheetInfo, url: zombieDarkUrl },
  plague_villager: { info: plagueInfo as SheetInfo, url: plagueUrl },
  hobgoblin: { info: hobgoblinInfo as SheetInfo, url: hobgoblinUrl },
  hobgoblin_archer: { info: hobgoblinArcherInfo as SheetInfo, url: hobgoblinArcherUrl },
  bone_knight: { info: boneKnightInfo as SheetInfo, url: boneKnightUrl },
  demon: { info: demonInfo as SheetInfo, url: demonUrl },
  fallen_paladin: { info: fallenPaladinInfo as SheetInfo, url: fallenPaladinUrl }, // 타락한 성기사(Hormelz 대검 기사, 배색 C)
  time_warden: { info: timeWardenInfo as SheetInfo, url: timeWardenUrl }, // 시간의 파수꾼(tools/boss3d로 렌더)
  plague_ferryman: { info: ferrymanInfo as SheetInfo, url: ferrymanUrl }, // 역병 걸린 뱃사공(tools/boss3d로 렌더)
  raider_chief: { info: chiefInfo as SheetInfo, url: chiefUrl }, // 약탈자 우두머리(tools/boss3d로 렌더)
  raider_goblin: { info: raiderInfo as SheetInfo, url: raiderUrl }, // 뒤틀린 고블린(tools/raider.py)
  swamp_treant: { info: treantInfo as SheetInfo, url: treantUrl }, // 늪 나무 괴물(받은 3D 모델, tools/boss3d/render.py swamp_treant)
  raider_orc: { info: raiderOrcInfo as SheetInfo, url: raiderOrcUrl }, // 약탈자 오크(받은 3D 모델, tools/boss3d/render.py raider_orc)
};
let heroWanted = '';
let heroReady: Promise<void> = Promise.resolve(); // 마지막으로 요청한 장비 조합이 입혀질 때
let heroSprite: Sprite | null = null;
const ELEV = THREE.MathUtils.degToRad(30); // 카메라가 내려다보는 각도 = FLARE가 그린 각도
const HIT_SHOW = 0.3; // 피격 동작을 보여줄 시간(초)
const LIFT = 0.01; // 바닥과 같은 높이에서 깜빡이지 않게 살짝 띄운다
// 화면 각도 구간(E부터 45°씩 반시계: E NE N NW W SW S SE) → FLARE 방향 번호.
// FLARE 번호는 맵 기준 나침반이라 화면 기준으로는 0=W 1=NW 2=N 3=NE 4=E 5=SE 6=S 7=SW
const BY_SECTOR = [4, 3, 2, 1, 0, 7, 6, 5];
const textures = new Map<Kind | Skin, THREE.Texture>();
const geometries = new Map<Kind | Skin, THREE.BufferGeometry>();
const PPM = SHEETS.hero.info.ppm; // 모든 시트 공통 30px/m

// 월드에서 바라보는 방향(atan2(dx, dz))을 FLARE 방향 번호로. 카메라는 +x+z 쪽에서 -x-z를 내려다본다.
export function dirIndex(facing: number): number {
  const dx = Math.sin(facing);
  const dz = Math.cos(facing);
  const sector = Math.round(Math.atan2(-(dx + dz), dx - dz) / (Math.PI / 4)); // 화면 (위쪽, 오른쪽) 성분
  return BY_SECTOR[((sector % 8) + 8) % 8];
}

// 동작 시작 후 t초의 프레임 번호. 프레임 n개를 한 번 지나가는 데 ms.
export function frameAt(c: Clip, t: number): number {
  const i = Math.floor((t * 1000 * c.frames) / c.ms);
  if (c.loop === 'play_once') return Math.min(i, c.frames - 1);
  if (c.loop === 'looped' || c.frames < 2) return i % c.frames;
  const period = 2 * (c.frames - 1); // back_forth: 0 → n-1 → 0
  const k = i % period;
  return k < c.frames ? k : period - k;
}

// 화면 범위(카메라 절반 크기, m). 렌더 픽셀 30개 = 1m로 고정해야 스프라이트 텍셀이 화면 픽셀과 1:1로 맞는다.
export function viewHalf(w: number, h: number): [number, number] {
  return [w / 2 / PPM, h / 2 / PPM];
}

// 발 기준선 위는 세로로 세우고, 아래(발끝·그림자·누운 시체)는 카메라 쪽 바닥에 눕힌 판자.
// 정사영에서 세운 부분은 cos30°, 눕힌 부분은 sin30°만큼 줄어 보이므로 그만큼 늘려 텍셀 크기를 맞춘다.
export function cardGeometry(info: SheetInfo): THREE.BufferGeometry {
  const [cw, ch] = info.cell;
  const [ax, ay] = info.anchor;
  const geo = new THREE.PlaneGeometry(cw / info.ppm, 1, 1, 2); // 정점 3줄: 위, 발 기준선, 아래
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (const i of [0, 1]) {
    pos.setY(i, ay / info.ppm / Math.cos(ELEV));
    pos.setY(2 + i, 0);
    uv.setY(2 + i, 1 - ay / ch);
    pos.setY(4 + i, 0);
    pos.setZ(4 + i, (ch - ay) / info.ppm / Math.sin(ELEV));
  }
  geo.translate((cw / 2 - ax) / info.ppm, LIFT, 0);
  return geo;
}

// 도트 그림용 질감: 가까운 텍셀 그대로, 밉맵 없음
export async function loadSheet(url: string): Promise<THREE.Texture> {
  return pixelated(await new THREE.TextureLoader().loadAsync(url));
}

function pixelated<T extends THREE.Texture>(tex: T): T {
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// 원색 외형: 특출난 전설(UNIQUES의 look)을 입은 부위 → 그 색. layers: 전설 무기가 바꾸는 레이어 → 시트 이름(null = 그리지 않음)
export type Looks = Partial<Record<Slot, string>> & { layers?: Record<string, string | null> };
const ELEM_SHEET = ['fire', 'frost', 'bolt', 'void']; // 마법사 탭 0~3 → wizard_main_elem<색>(tools/sprites.py LEGEND_LAYERS)
// 전설 무기의 레이어(설계 2026-11-20): 칼리버X = 츠바이헨더·방패 없음, 엘리멘탈 스태프 = 마지막 속성 색, 두개골 = 4단계 로드 + 해골 구슬, 천둥새 = 번개 장궁
const LEGEND_LAYERS: Partial<Record<UniqueId, (elem: number) => Record<string, string | null>>> = {
  caliburx: () => ({ main: 'hero_main_caliburx', off: null }),
  powderHammer: () => ({ main: 'hero_main_hammer', off: null }),
  boomerang: () => ({ main: 'hero_main_axe' }), // 한손 도끼(FLARE hand_axe), 방패는 그대로
  twinBows: () => ({ off: 'ranger_off_twin' }), // 왼손에 둘째 장궁(좌우 대칭 방향을 뒤집은 그림)
  wellScepter: () => ({ main: 'wizard_main_well' }), // 물빛 보석 + 떨어지는 물방울
  plagueStaff: () => ({ off: 'necromancer_off_plague' }), // 왼손 위 독기 해골
  bannerSpear: () => ({ main: 'hero_main_spear', off: null }), // 장대 + 창날·원정대 깃발(tools/sprites.py spearhead) // 양손 망치(FLARE maul + 잉걸불 빛)
  elemStaff: (e) => ({ main: `wizard_main_elem${ELEM_SHEET[e] ?? 'base'}` }),
  graveSkull: () => ({ main: 'necromancer_main_4', off: 'necromancer_off_skull' }),
  stormBow: () => ({ main: 'ranger_main_storm' }),
};
// 벼림으로 칼을 강화한 동안은 무기 색이 강화 색(전설 원색보다 먼저)
export function looksOf(w: Pick<World, 'mods'> & Partial<Pick<World, 'edge' | 'elem'>>): Looks {
  const out: Looks = {};
  for (const s of SLOTS) {
    const u = uniqueOf({ affixes: w.mods[s] });
    if (u && UNIQUES[u].look) out[s] = UNIQUES[u].look;
    if (u && LEGEND_LAYERS[u]) out.layers = { ...out.layers, ...LEGEND_LAYERS[u]!(w.elem ?? -1) };
  }
  if (w.edge?.kind) out.weapon = EDGE_COLOR[w.edge.kind];
  return out;
}
export const heroKey = (g: Gear, cls: HeroClass, looks: Looks) => JSON.stringify([g, cls, looks]);

// 레이어 그림을 원색으로: 'color' 합성(명암은 그대로, 색상·채도만 바꿈) 뒤 원래 그림의 투명도로 잘라낸다. url + 색마다 한 번
const TINT_LIFT = 0.3;
const tintedLayers = new Map<string, Promise<HTMLCanvasElement>>();
function tinted(url: string, color: string): Promise<HTMLCanvasElement> {
  const key = `${url}|${color}`;
  if (!tintedLayers.has(key))
    tintedLayers.set(
      key,
      layerImages.get(url)!.then((img) => {
        const c = Object.assign(document.createElement('canvas'), { width: img.width, height: img.height });
        const x = c.getContext('2d')!;
        x.drawImage(img, 0, 0);
        x.globalCompositeOperation = 'color';
        x.fillStyle = color;
        x.fillRect(0, 0, c.width, c.height);
        x.globalCompositeOperation = 'screen'; // 어두운 그림(가죽 두건·활)은 'color'만으론 색이 안 묻어 그 색 쪽으로 살짝 밝힌다
        x.globalAlpha = TINT_LIFT;
        x.fillRect(0, 0, c.width, c.height);
        x.globalAlpha = 1;
        x.globalCompositeOperation = 'destination-in';
        x.drawImage(img, 0, 0);
        return c;
      }),
    );
  return tintedLayers.get(key)!;
}

// 장비 조합의 주인공 시트: 레이어 그림을 행(동작 × 방향)마다 그 방향의 순서로 겹친다. 원색 전설을 입은 부위의 레이어는 물들인다.
// ponytail: 조합은 캐시하지 않는다(256가지 × 15MB). 갈아입을 때마다 수 ms 다시 그린다
async function heroSheet(g: Gear, cls: HeroClass, looks: Looks): Promise<THREE.Texture> {
  const info = SHEETS.hero.info;
  const imgs: Record<string, CanvasImageSource> = {};
  await Promise.all(
    Object.keys(HERO_LAYERS).map(async (l) => {
      const over = looks.layers?.[l];
      const url = over === undefined ? layerUrl(l, g, cls) : over ? HERO_URLS[`../assets/sprites/${over}.png`] : undefined;
      if (!url) return; // 그 직업에 없는 레이어(또는 전설 무기가 지운 방패)
      if (!layerImages.has(url)) layerImages.set(url, new THREE.ImageLoader().loadAsync(url));
      const color = over && l !== 'main' ? undefined : looks[HERO_LAYERS[l]]; // 전설이 덧댄 왼손 그림(해골·둘째 활)은 갑옷 색으로 물들이지 않는다
      imgs[l] = color ? await tinted(url, color) : await layerImages.get(url)!;
    }),
  );
  const [w, ch] = [info.cols * info.cell[0], info.cell[1]];
  const canvas = Object.assign(document.createElement('canvas'), { width: w, height: info.rows * ch });
  const ctx = canvas.getContext('2d')!;
  for (let r = 0; r < info.rows; r++) for (const l of HERO_ORDER[r % 8]) if (imgs[l]) ctx.drawImage(imgs[l], 0, r * ch, w, ch, 0, r * ch, w, ch);
  return pixelated(new THREE.CanvasTexture(canvas));
}

export async function loadSprites() {
  await Promise.all((Object.keys(SHEETS) as (Kind | Skin)[]).filter((k) => k !== 'hero').map(async (k) => textures.set(k, await loadSheet(SHEETS[k].url))));
}

// 장비 조합의 주인공 시트로 바꾼다. 불러오는 동안은 이전 외형, 여러 번 바뀌면 마지막 요청만 적용
export function setHeroGear(g: Gear, cls: HeroClass = 'knight', looks: Looks = {}): Promise<void> {
  const key = heroKey(g, cls, looks);
  if (key !== heroWanted) {
    heroWanted = key;
    heroReady = applyHeroGear({ ...g }, cls, { ...looks }, key);
  }
  return heroReady;
}

async function applyHeroGear(g: Gear, cls: HeroClass, looks: Looks, key: string) {
  const tex = await heroSheet(g, cls, looks);
  if (heroWanted !== key) return tex.dispose();
  textures.get('hero')?.dispose();
  textures.set('hero', tex);
  if (!heroSprite) return;
  const old = heroSprite.mat.map!;
  const map = tex.clone();
  map.repeat.copy(old.repeat);
  map.offset.copy(old.offset);
  heroSprite.mat.map = map;
  old.dispose();
}

// 보관함 인형: 정면을 보고 선 주인공(지금 장비)을 PORTRAIT 영역만 scale배로. 칸 위치는 이 영역 기준(hud)
export const PORTRAIT = { dir: 6, x: 22, y: 24, w: 56, h: 60 }; // 칸 안 픽셀(머리 ≈ y 28–43, 발 ≈ 81)
// HUD 소환수 초상화: 정면으로 서 있는 첫 칸에서 머리·어깨(발 기준점 위 48px, 20px 정사각형)를 px 크기의 CSS 배경으로
export function paintPortrait(el: HTMLElement, e: Entity, px: number) {
  const { info, url } = SHEETS[e.skin ?? e.kind];
  const k = px / 20;
  const [x, y] = [info.anchor[0] - 10, PORTRAIT.dir * info.cell[1] + info.anchor[1] - 48];
  Object.assign(el.style, { backgroundImage: `url(${url})`, backgroundSize: `${info.cols * info.cell[0] * k}px ${info.rows * info.cell[1] * k}px`, backgroundPosition: `${-x * k}px ${-y * k}px` });
}
export function drawHeroPortrait(c: HTMLCanvasElement, scale: number) {
  const src = textures.get('hero')?.image as HTMLCanvasElement | undefined;
  if (!src) return;
  const { cell, anims } = SHEETS.hero.info;
  const { dir, x, y, w, h } = PORTRAIT;
  Object.assign(c, { width: w * scale, height: h * scale });
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, x, (anims.stance.row + dir) * cell[1] + y, w, h, 0, 0, w * scale, h * scale);
}

export function makeSprite(e: Entity): Sprite {
  const key = e.skin ?? e.kind;
  const info = SHEETS[key].info;
  if (!geometries.has(key)) geometries.set(key, cardGeometry(info));
  const geo = geometries.get(key)!;
  const map = textures.get(key)!.clone(); // 이미지는 공유, 프레임 위치(offset)만 캐릭터별
  map.repeat.set(1 / info.cols, 1 / info.rows);
  const mat = new THREE.MeshBasicMaterial({ map, alphaTest: 0.5, toneMapped: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.y = Math.PI / 4; // 카메라(+x+z) 쪽을 향한다
  mesh.scale.setScalar((e.elite || e.kind === 'king' ? (e.kind === 'king' ? KING_SIZE : ELITE_SIZE) : 1) * (e.skin ? (SKIN_SIZE[e.skin] ?? 1) : 1));
  const s: Sprite = { mesh, mat, info, anim: 'stance', t: 0, hp: e.hp, maxHp: e.maxHp, hitT: 0, castT: 0, tint: e.kind === 'king' ? KING_TINT : e.skin === 'treasure' ? GOLD_TINT : WHITE };
  if (e.eliteKind) {
    // 정예: 특성 색으로 물들이고, 어두운 곳에서도 보이게 발밑에 빛나는 고리(불빛을 받지 않는다)
    const c = new THREE.Color(ELITE_KINDS[e.eliteKind].color);
    s.tint = new THREE.Color(1, 1, 1).lerp(c, 0.65).multiplyScalar(1.5);
    s.ring = new THREE.Mesh(RING, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }));
    s.ring.position.y = 0.03;
    s.ring.renderOrder = 1; // 바닥 다음, 캐릭터 전에
    mesh.add(s.ring);
  }
  attachHalo(s, e);
  if (e.kind === 'hero') heroSprite = s;
  return s;
}

// 원정대 병사(원정대 깃발창): 고정 장비(사슬 갑옷·숏소드)를 입힌 기사 시트의 판자. 시트는 처음 부를 때 한 번 만들고, 그동안은 지금 주인공 시트
let soldierTex: Promise<THREE.Texture> | null = null;
export function soldierSprite(a: Entity): Sprite {
  const info = SHEETS.hero.info;
  if (!geometries.has('hero')) geometries.set('hero', cardGeometry(info));
  const map = textures.get('hero')!.clone();
  map.repeat.set(1 / info.cols, 1 / info.rows);
  const mat = new THREE.MeshBasicMaterial({ map, alphaTest: 0.5, toneMapped: false });
  const mesh = new THREE.Mesh(geometries.get('hero')!, mat);
  mesh.rotation.y = Math.PI / 4;
  soldierTex ??= heroSheet({ weapon: 2, armor: 3, helm: 3, boots: 2 }, 'knight', {});
  void soldierTex.then((t) => {
    const old = mat.map!;
    const m = t.clone();
    m.repeat.copy(old.repeat);
    m.offset.copy(old.offset);
    mat.map = m;
    mat.needsUpdate = true;
    old.dispose();
  });
  return { mesh, mat, info, anim: 'stance', t: 0, hp: a.hp, maxHp: a.maxHp, hitT: 0, castT: 0, tint: SOLDIER_TINT };
}
const SOLDIER_TINT = new THREE.Color(0.85, 0.95, 1.2); // 원정대의 푸른빛

// 잔상(마법사): 지금 주인공 시트를 복제한 반투명 판자. 주인공 판자로 기억하지 않고, 후광·고리도 달지 않는다
export function ghostSprite(hero: Entity): Sprite {
  const info = SHEETS.hero.info;
  if (!geometries.has('hero')) geometries.set('hero', cardGeometry(info));
  const map = textures.get('hero')!.clone();
  map.repeat.set(1 / info.cols, 1 / info.rows);
  const mat = new THREE.MeshBasicMaterial({ map, transparent: true, alphaTest: 0.05, depthWrite: false, toneMapped: false });
  const mesh = new THREE.Mesh(geometries.get('hero')!, mat);
  mesh.rotation.y = Math.PI / 4;
  return { mesh, mat, info, anim: 'stance', t: 0, hp: hero.hp, maxHp: hero.maxHp, hitT: 0, castT: 0, tint: WHITE };
}

// 후광 그림 두 장(64×64, 테스트 환경엔 캔버스가 없어 픽셀을 직접 계산): 검붉은 빛무리, 금 간 금빛 고리
const haloTextures = { glow: null as THREE.DataTexture | null, ring: null as THREE.DataTexture | null };
export function haloTexture(paint: (u: number, v: number) => [number, number, number, number]): THREE.DataTexture {
  const n = 64;
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) data.set(paint(((x + 0.5) / n) * 2 - 1, ((y + 0.5) / n) * 2 - 1), (y * n + x) * 4);
  const t = new THREE.DataTexture(data, n, n);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}
const glowPaint = (u: number, v: number): [number, number, number, number] => {
  const r = Math.hypot(u, v);
  const a = Math.max(0, 1 - r) ** 1.6; // 가운데가 밝고 가장자리 0
  const hot = Math.max(0, 1 - r * 2); // 가운데만 주황
  return [200 + 55 * hot, 40 + 80 * hot, 20 + 20 * hot, Math.round(255 * a)];
};
const ringPaint = (u: number, v: number): [number, number, number, number] => {
  const deg = ((Math.atan2(v, u) * 180) / Math.PI + 360) % 360; // DataTexture 0번 줄 = 아래 → v가 클수록 위, 화면 위 = 90°
  const broken = deg > 170 && deg < 200; // 금 간 자리 둘(170°~200°, 330°~345°)
  const broken2 = deg > 330 && deg < 345;
  const a = broken || broken2 ? 0 : Math.max(0, 1 - Math.abs(Math.hypot(u, v) - 0.78) / 0.2);
  return [255, 228, 150, Math.round(255 * a * a)]; // 붉은 바닥에 묻히지 않게 금빛 쪽으로
};
export const ringTexture = () => (haloTextures.ring ??= haloTexture(ringPaint)); // 엔딩에서 떨어지는 고리
export const COS30 = Math.cos(Math.PI / 6); // 세운 판자는 화면에서 cos30°로 줄어 보인다(cardGeometry와 같은 보정)

export function attachHalo(s: Sprite, e: Entity) {
  if (e.skin !== 'fallen_paladin' && e.kind !== 'hero') return;
  haloTextures.glow ??= haloTexture(glowPaint);
  haloTextures.ring ??= haloTexture(ringPaint);
  const plate = (map: THREE.Texture, w: number, h: number, y: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h / COS30), new THREE.MeshBasicMaterial({ map, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }));
    m.position.set(0, y / COS30, -0.05); // 그림 바로 뒤
    m.renderOrder = 1;
    s.mesh.add(m);
    return m;
  };
  // 크기·높이는 화면에서 본 m(키 약 1.7m): 빛무리는 몸 가운데, 고리는 머리 뒤
  if (e.kind === 'hero') s.halo = { glow: plate(haloTextures.glow, 0, 0, 0), ring: plate(haloTextures.ring, HERO_RING.w, HERO_RING.h, HERO_RING.y), k: 0, t: 0, hero: true }; // 빛무리 없이 고리만(벗고 있으면 heroRing 0이라 꺼져 있다)
  else s.halo = { glow: plate(haloTextures.glow, 2.0, 2.2, 1.1), ring: plate(haloTextures.ring, 0.8, 0.36, 1.62), k: 0, t: 0 }; // 고리 높이는 updateHalo가 장면마다 머리 자리로
}

// 머리 자리표(tools/sprites.py knight_heads): 동작 → 방향 → 프레임 → 발 기준 화면 m (x 오른쪽, y 위)
export const HEADS = fallenPaladinHeads as Record<string, number[][][]>;

// 성소 5층: 후광 밝기 = 켜진 성소 비율(고리가 깨지면 0). 그 밖에서는 1
let haloGoal = 1;
export const setHaloGoal = (k: number) => (haloGoal = k);
// 주인공 고리 밝기(heroRingLevel, 안 쓰고 있으면 0)
let heroRing = 0;
export const setHeroRing = (k: number) => (heroRing = k);
function updateHalo(h: NonNullable<Sprite['halo']>, dead: boolean, dt: number, anim: Anim, dir: number, f: number) {
  h.t += dt;
  const [hx, hy] = h.hero ? [0, HERO_RING.y] : (HEADS[anim]?.[dir]?.[f] ?? [0, 1.62]);
  h.ring.position.set(hx, hy / COS30, -0.05); // 고리는 머리를 따라간다(쓰러지면 꺼진다)
  const goal = dead ? 0 : h.hero ? heroRing : haloGoal;
  if (h.hero && goal < h.k - 0.5) h.k = goal; // 되감기를 쓴 순간: 고리가 단번에 깨진다
  h.k = h.k > goal ? Math.max(goal, h.k - dt / HALO.fade) : Math.min(goal, h.k + dt / HALO.fade);
  const level = haloLevel(h.t) * h.k;
  (h.glow.material as THREE.MeshBasicMaterial).opacity = level;
  (h.ring.material as THREE.MeshBasicMaterial).opacity = h.k * (HALO.ring + 0.2 * haloLevel(h.t));
  h.glow.visible = !h.hero && h.k > 0;
  h.ring.visible = h.k > 0;
}

// interval: 이 캐릭터의 휘두르기 시간(주인공은 무기마다 다름)
export function updateSprite(s: Sprite, e: Entity, dt: number, interval: number) {
  if (e.hp < s.hp && e.maxHp === s.maxHp && e.state !== 'attack') s.hitT = HIT_SHOW; // 갑옷 교체로 줄어든 것은 맞은 것이 아니다
  s.hp = e.hp;
  s.maxHp = e.maxHp;
  s.hitT -= dt;
  s.castT -= dt;
  const casting = s.castT > 0 && e.state !== 'dead';
  const anim = casting ? 'attack' : animFor(e, s.hitT);
  if (anim !== s.anim) {
    s.anim = anim;
    s.t = 0;
  }
  s.t += anim === 'move' ? (dt * STATS[e.kind].speed) / STATS.hero.speed : dt; // 느린 몬스터는 걸음도 느리게
  const c = s.info.anims[anim];
  // 공격 프레임은 sim의 휘두르기 진행도에 맞춘다(스킬 시전은 시전 시간에 맞춘다)
  const f = casting ? Math.min(c.frames - 1, Math.floor((1 - s.castT / CAST_SHOW) * c.frames)) : anim === 'attack' ? Math.min(c.frames - 1, Math.floor((e.attackT / interval) * c.frames)) : frameAt(c, s.t);
  const row = c.row + dirIndex(e.facing);
  s.mat.map!.offset.set(f / s.info.cols, 1 - (row + 1) / s.info.rows);
  s.mesh.position.set(e.x, 0, e.z);
  // 시체는 벽보다 뒤, 산 캐릭터보다 먼저 그리고 깊이를 남기지 않는다 → 그 뒤를 지나가는 캐릭터를 가리지 않는다
  const dead = e.state === 'dead';
  s.mesh.renderOrder = dead ? 1 : 2;
  s.mat.depthWrite = !dead;
  if (s.ring) s.ring.visible = !dead;
  if (s.halo) updateHalo(s.halo, dead, dt, anim, dirIndex(e.facing), f);
}

function animFor(e: Entity, hitT: number): Anim {
  if (e.state === 'dead') return 'die';
  if (e.state === 'attack') return 'attack';
  if (hitT > 0) return 'hit';
  return e.state === 'move' ? 'move' : 'stance';
}
