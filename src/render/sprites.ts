// FLARE 8방향 도트 스프라이트로 캐릭터를 그린다. 캐릭터마다 카메라를 향한 세로 판자(빌보드) 1장.
import * as THREE from 'three';
import { STATS, type Entity, type Kind } from '../sim/world';
import heroInfo from '../assets/sprites/hero.json';
import heroUrl from '../assets/sprites/hero.png';
import minionInfo from '../assets/sprites/minion.json';
import minionUrl from '../assets/sprites/minion.png';
import warriorInfo from '../assets/sprites/warrior.json';
import warriorUrl from '../assets/sprites/warrior.png';

export type Anim = 'stance' | 'move' | 'attack' | 'hit' | 'die';
type Clip = { row: number; frames: number; ms: number; loop: 'back_forth' | 'looped' | 'play_once' };
type SheetInfo = { cell: [number, number]; anchor: [number, number]; ppm: number; cols: number; rows: number; anims: Record<Anim, Clip> };
export type Sprite = { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; info: SheetInfo; anim: Anim; t: number; hp: number; hitT: number };

const SHEETS: Record<Kind, { info: SheetInfo; url: string }> = {
  hero: { info: heroInfo as SheetInfo, url: heroUrl },
  minion: { info: minionInfo as SheetInfo, url: minionUrl },
  warrior: { info: warriorInfo as SheetInfo, url: warriorUrl },
};
const ELEV = THREE.MathUtils.degToRad(30); // 카메라가 내려다보는 각도 = FLARE가 그린 각도
const HIT_SHOW = 0.3; // 피격 동작을 보여줄 시간(초)
// 화면 각도 구간(E부터 45°씩 반시계: E NE N NW W SW S SE) → FLARE 방향 번호.
// FLARE 번호는 맵 기준 나침반이라 화면 기준으로는 0=W 1=NW 2=N 3=NE 4=E 5=SE 6=S 7=SW
const BY_SECTOR = [4, 3, 2, 1, 0, 7, 6, 5];
const textures = new Map<Kind, THREE.Texture>();

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

export async function loadSprites() {
  const loader = new THREE.TextureLoader();
  await Promise.all(
    (Object.keys(SHEETS) as Kind[]).map(async (k) => {
      const tex = await loader.loadAsync(SHEETS[k].url);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.generateMipmaps = false;
      tex.colorSpace = THREE.SRGBColorSpace;
      textures.set(k, tex);
    }),
  );
}

export function makeSprite(e: Entity): Sprite {
  const info = SHEETS[e.kind].info;
  const [cw, ch] = info.cell;
  const [ax, ay] = info.anchor;
  const k = 1 / Math.cos(ELEV); // 30° 위에서 보면 세로가 cos(30°)만큼 납작해지므로 미리 늘린다
  const geo = new THREE.PlaneGeometry(cw / info.ppm, (ch / info.ppm) * k);
  geo.translate((cw / 2 - ax) / info.ppm, ((ay - ch / 2) / info.ppm) * k, 0); // 발 기준점을 원점으로
  const map = textures.get(e.kind)!.clone(); // 이미지는 공유, 프레임 위치(offset)만 캐릭터별
  map.repeat.set(1 / info.cols, 1 / info.rows);
  const mat = new THREE.MeshBasicMaterial({ map, alphaTest: 0.5, toneMapped: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.y = Math.PI / 4; // 카메라(+x+z) 쪽을 향한다
  return { mesh, mat, info, anim: 'stance', t: 0, hp: e.hp, hitT: 0 };
}

export function updateSprite(s: Sprite, e: Entity, dt: number) {
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
  const f = anim === 'attack' ? Math.min(c.frames - 1, Math.floor((e.attackT / STATS[e.kind].interval) * c.frames)) : frameAt(c, s.t);
  const row = c.row + dirIndex(e.facing);
  s.mat.map!.offset.set(f / s.info.cols, 1 - (row + 1) / s.info.rows);
  s.mesh.position.set(e.x, 0, e.z);
}

function animFor(e: Entity, hitT: number): Anim {
  if (e.state === 'dead') return 'die';
  if (e.state === 'attack') return 'attack';
  if (hitT > 0) return 'hit';
  return e.state === 'move' ? 'move' : 'stance';
}
