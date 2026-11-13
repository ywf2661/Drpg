// FLARE 8방향 도트 스프라이트로 캐릭터를 그린다. 캐릭터마다 카메라를 향한 세로 판자(빌보드) 1장.
import * as THREE from 'three';
import { STATS, type Entity, type Gear, type HeroClass, type Kind, type Slot } from '../sim/world';
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

export type Anim = 'stance' | 'move' | 'attack' | 'hit' | 'die';
export type Clip = { row: number; frames: number; ms: number; loop: 'back_forth' | 'looped' | 'play_once' };
export type SheetInfo = { cell: number[]; anchor: number[]; ppm: number; cols: number; rows: number; anims: Record<string, Clip> };
// tint: 불빛에 곱하는 고유 색(정예는 금빛)
export type Sprite = { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; info: SheetInfo; anim: Anim; t: number; hp: number; maxHp: number; hitT: number; castT: number; tint: THREE.Color };
export const CAST_SHOW = 0.35; // 스킬 시전 동작(공격 그림 = 마법사는 cast)을 보여 주는 시간(초)
const ELITE_TINT = new THREE.Color(1.35, 1.05, 0.45);
const WHITE = new THREE.Color(1, 1, 1);
const ELITE_SIZE = 1.25;
const KING_TINT = new THREE.Color(0.95, 0.6, 1.35);
const KING_SIZE = 1.5;

// 주인공 = 부위별 레이어 시트(기사 hero_<레이어>_<단계>.png, 마법사 wizard_…, 궁수 ranger_…)를 방향마다 heroOrder(뒤에 깔리는 것부터) 순서로 겹친 그림.
// URL만 알고, 그림은 장착할 때 불러온다. 레이어 → 단계를 정하는 장비 부위(lower = 다리·손). 마법사·궁수는 방패(off)가 없다
const HERO_URLS = import.meta.glob(['../assets/sprites/hero_*_*.png', '../assets/sprites/wizard_*_*.png', '../assets/sprites/ranger_*_*.png'], { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
export const HERO_LAYERS: Record<string, Slot> = { main: 'weapon', head: 'helm', feet: 'boots', lower: 'armor', chest: 'armor', off: 'armor' };
export const HERO_ORDER: string[][] = heroOrder; // FLARE 방향 번호 → 레이어 순서
const PREFIX: Record<HeroClass, string> = { knight: 'hero', wizard: 'wizard', ranger: 'ranger' };
export const layerUrl = (layer: string, g: Gear, cls: HeroClass = 'knight'): string | undefined => HERO_URLS[`../assets/sprites/${PREFIX[cls]}_${layer}_${g[HERO_LAYERS[layer]]}.png`];
const layerImages = new Map<string, Promise<HTMLImageElement>>();
const SHEETS: Record<Kind, { info: SheetInfo; url: string }> = {
  hero: { info: heroInfo as SheetInfo, url: '' }, // 그림은 setHeroGear가 고른다
  minion: { info: minionInfo as SheetInfo, url: minionUrl },
  warrior: { info: warriorInfo as SheetInfo, url: warriorUrl },
  archer: { info: archerInfo as SheetInfo, url: archerUrl },
  mage: { info: mageInfo as SheetInfo, url: mageUrl },
  king: { info: warriorInfo as SheetInfo, url: warriorUrl }, // 해골 왕 = 전사 그림을 크게·보라색으로
  boss: { info: bossInfo as SheetInfo, url: bossUrl },
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
const textures = new Map<Kind, THREE.Texture>();
const geometries = new Map<Kind, THREE.BufferGeometry>();
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

// 장비 조합의 주인공 시트: 레이어 그림을 행(동작 × 방향)마다 그 방향의 순서로 겹친다.
// ponytail: 조합은 캐시하지 않는다(256가지 × 15MB). 갈아입을 때마다 수 ms 다시 그린다
async function heroSheet(g: Gear, cls: HeroClass): Promise<THREE.Texture> {
  const info = SHEETS.hero.info;
  const imgs: Record<string, HTMLImageElement> = {};
  await Promise.all(
    Object.keys(HERO_LAYERS).map(async (l) => {
      const url = layerUrl(l, g, cls);
      if (!url) return; // 그 직업에 없는 레이어
      if (!layerImages.has(url)) layerImages.set(url, new THREE.ImageLoader().loadAsync(url));
      imgs[l] = await layerImages.get(url)!;
    }),
  );
  const [w, ch] = [info.cols * info.cell[0], info.cell[1]];
  const canvas = Object.assign(document.createElement('canvas'), { width: w, height: info.rows * ch });
  const ctx = canvas.getContext('2d')!;
  for (let r = 0; r < info.rows; r++) for (const l of HERO_ORDER[r % 8]) if (imgs[l]) ctx.drawImage(imgs[l], 0, r * ch, w, ch, 0, r * ch, w, ch);
  return pixelated(new THREE.CanvasTexture(canvas));
}

export async function loadSprites() {
  await Promise.all((['minion', 'warrior', 'archer', 'mage', 'king', 'boss'] as const).map(async (k) => textures.set(k, await loadSheet(SHEETS[k].url))));
}

// 장비 조합의 주인공 시트로 바꾼다. 불러오는 동안은 이전 외형, 여러 번 바뀌면 마지막 요청만 적용
export function setHeroGear(g: Gear, cls: HeroClass = 'knight'): Promise<void> {
  const key = JSON.stringify([g, cls]);
  if (key !== heroWanted) {
    heroWanted = key;
    heroReady = applyHeroGear({ ...g }, cls, key);
  }
  return heroReady;
}

async function applyHeroGear(g: Gear, cls: HeroClass, key: string) {
  const tex = await heroSheet(g, cls);
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
  const info = SHEETS[e.kind].info;
  if (!geometries.has(e.kind)) geometries.set(e.kind, cardGeometry(info));
  const geo = geometries.get(e.kind)!;
  const map = textures.get(e.kind)!.clone(); // 이미지는 공유, 프레임 위치(offset)만 캐릭터별
  map.repeat.set(1 / info.cols, 1 / info.rows);
  const mat = new THREE.MeshBasicMaterial({ map, alphaTest: 0.5, toneMapped: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.y = Math.PI / 4; // 카메라(+x+z) 쪽을 향한다
  if (e.elite || e.kind === 'king') mesh.scale.setScalar(e.kind === 'king' ? KING_SIZE : ELITE_SIZE);
  const s: Sprite = { mesh, mat, info, anim: 'stance', t: 0, hp: e.hp, maxHp: e.maxHp, hitT: 0, castT: 0, tint: e.kind === 'king' ? KING_TINT : e.elite ? ELITE_TINT : WHITE };
  if (e.kind === 'hero') heroSprite = s;
  return s;
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
}

function animFor(e: Entity, hitT: number): Anim {
  if (e.state === 'dead') return 'die';
  if (e.state === 'attack') return 'attack';
  if (hitT > 0) return 'hit';
  return e.state === 'move' ? 'move' : 'stance';
}
