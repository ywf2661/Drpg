// FLARE 8방향 도트 스프라이트로 캐릭터를 그린다. 캐릭터마다 카메라를 향한 세로 판자(빌보드) 1장.
import * as THREE from 'three';
import { STATS, type Entity, type Gear, type Kind } from '../sim/world';
import heroInfo from '../assets/sprites/hero.json';
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
export type Sprite = { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; info: SheetInfo; anim: Anim; t: number; hp: number; hitT: number; tint: THREE.Color };
const ELITE_TINT = new THREE.Color(1.35, 1.05, 0.45);
const WHITE = new THREE.Color(1, 1, 1);
const ELITE_SIZE = 1.25;

// 주인공 시트 16장(무기 × 갑옷). URL만 알고, 그림은 장착할 때 불러온다
const HERO_URLS = import.meta.glob('../assets/sprites/hero_*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const HERO_WEAPONS = ['dagger', 'shortsword', 'longsword', 'greatsword']; // 단계 1~4
const HERO_ARMORS = ['cloth', 'leather', 'chain', 'plate'];
const heroUrl = (g: Gear) => HERO_URLS[`../assets/sprites/hero_${HERO_WEAPONS[g.weapon - 1]}_${HERO_ARMORS[g.armor - 1]}.png`];
const SHEETS: Record<Kind, { info: SheetInfo; url: string }> = {
  hero: { info: heroInfo as SheetInfo, url: '' }, // 그림은 setHeroGear가 고른다
  minion: { info: minionInfo as SheetInfo, url: minionUrl },
  warrior: { info: warriorInfo as SheetInfo, url: warriorUrl },
  archer: { info: archerInfo as SheetInfo, url: archerUrl },
  mage: { info: mageInfo as SheetInfo, url: mageUrl },
  boss: { info: bossInfo as SheetInfo, url: bossUrl },
};
const heroSheets = new Map<string, Promise<THREE.Texture>>(); // 불러온(불러오는 중인) 장비 조합
let heroWanted = '';
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
  const tex = await new THREE.TextureLoader().loadAsync(url);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export async function loadSprites() {
  await Promise.all((['minion', 'warrior', 'archer', 'mage', 'boss'] as const).map(async (k) => textures.set(k, await loadSheet(SHEETS[k].url))));
}

// 장비 조합의 주인공 시트로 바꾼다. 불러오는 동안은 이전 외형, 여러 번 바뀌면 마지막 요청만 적용
export async function setHeroGear(g: Gear) {
  const url = heroUrl(g);
  heroWanted = url;
  if (!heroSheets.has(url)) heroSheets.set(url, loadSheet(url));
  const tex = await heroSheets.get(url)!;
  if (heroWanted !== url) return;
  textures.set('hero', tex);
  if (!heroSprite) return;
  const old = heroSprite.mat.map!;
  const map = tex.clone();
  map.repeat.copy(old.repeat);
  map.offset.copy(old.offset);
  heroSprite.mat.map = map;
  old.dispose();
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
  if (e.elite) mesh.scale.setScalar(ELITE_SIZE);
  const s: Sprite = { mesh, mat, info, anim: 'stance', t: 0, hp: e.hp, hitT: 0, tint: e.elite ? ELITE_TINT : WHITE };
  if (e.kind === 'hero') heroSprite = s;
  return s;
}

// interval: 이 캐릭터의 휘두르기 시간(주인공은 무기마다 다름)
export function updateSprite(s: Sprite, e: Entity, dt: number, interval: number) {
  if (e.hp < s.hp && e.state !== 'attack') s.hitT = HIT_SHOW;
  s.hp = e.hp;
  s.hitT -= dt;
  const anim = animFor(e, s.hitT);
  if (anim !== s.anim) {
    s.anim = anim;
    s.t = 0;
  }
  s.t += anim === 'move' ? (dt * STATS[e.kind].speed) / STATS.hero.speed : dt; // 느린 몬스터는 걸음도 느리게
  const c = s.info.anims[anim];
  // 공격 프레임은 sim의 휘두르기 진행도에 맞춘다
  const f = anim === 'attack' ? Math.min(c.frames - 1, Math.floor((e.attackT / interval) * c.frames)) : frameAt(c, s.t);
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
