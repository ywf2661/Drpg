// three.js 렌더링. sim 상태를 읽기만 하고 수정하지 않는다.
import * as THREE from 'three';
import { attackInterval, hasUnique, hidden, winding, type World } from '../sim/world';
import { REWIND } from '../sim/rules';
import floorUrl from '../assets/tiles/floor.png';
import wallUrl from '../assets/tiles/wall.png';
import caveFloorUrl from '../assets/tiles/floor_cave.png';
import caveWallUrl from '../assets/tiles/wall_cave.png';
import fieldFloorUrl from '../assets/tiles/floor_field.png';
import fieldWallUrl from '../assets/tiles/wall_field.png';
import snowFloorUrl from '../assets/tiles/floor_snow.png';
import snowWallUrl from '../assets/tiles/wall_snow.png';
import ruinsFloorUrl from '../assets/tiles/floor_ruins.png';
import ruinsWallUrl from '../assets/tiles/wall_ruins.png';
import type { Theme } from '../sim/dungeon';
import { makeCutaway } from './cutaway';
import { hitstop, impact, popNumber, rumble, updateFeel } from './feel';
import { BRAZIER_RANGE, braziers, buildProps, floorVariant, stickArrow, wallVariant, loadProps, syncChests, syncEffects, syncFires as syncFlames, syncComets, syncGates, syncItems, syncShots, syncSpikes, updateProps } from './props';
import { syncBeams, syncFires, syncJudge, syncSwords, syncZones, zoneGroup } from './zones';
import { runeTexture } from './ward';
import { blizzard, fadeOf, SIGHT, view, warnBlizzard } from './sight';
import { clearRain, rainGroup, syncRain } from './rain';
import { leapFx, rollFx, rollGroup } from './roll';
import { cutsFx, flashFx, iaidoGroup, resetIaido } from './iaido';
import { freshEdgeHits, resetTemper, temperFx, temperGroup } from './temper';
import { ghostFx, ghostGroup, resetGhosts } from './ghost';
import { hawkFx, hawkGroup, resetHawk, rideLift } from './hawk';
import { EDGE_COLOR, splitLost } from './edge';
import type { EdgeHit } from '../sim/rules';
import { edgeColor, mixColor } from './edge';
import { ALLY_TINT, CAST_SHOW, loadSheet, loadSprites, looksOf, makeSprite, heroRingLevel, setHaloGoal, setHeroRing, setHeroGear, updateSprite, viewHalf, type Sprite } from './sprites';
import { warded } from '../sim/sanctum';

const SHORT_PX = 360; // 화면 짧은 변을 이만큼의 렌더 픽셀로 그린다(도트 느낌, 기기와 무관하게 같은 굵기)
const TORCH = 80; // 횃불 밝기(칸델라)
let TORCH_RANGE = 9; // 시야 반경(m). 이 밖은 거의 칠흑(테마가 정한다)
const TORCH_TINT = new THREE.Color(1, 0.82, 0.62); // 스프라이트에 입히는 횃불 색(테마가 정한다)
// 테마의 빛: 지하는 주황 횃불과 칠흑. 초원·설원은 낮(디아블로2의 바깥처럼) — 횃불 대신 해, 맵 밖은 검정 대신 땅 색.
// [횃불 색, 시야 반경, 스프라이트 색, 하늘빛 세기, 낮(해 세기·배경색)]
const DARK = { torch: 0xff9a4d, range: 9, tint: [1, 0.82, 0.62], sky: 0.1, sun: 0, bg: 0x000000 };
const MOOD: Record<Theme, typeof DARK> = {
  dungeon: DARK,
  cave: DARK,
  field: { torch: 0xe8e0b0, range: 12, tint: [1, 0.97, 0.88], sky: 2.2, sun: 3.2, bg: 0x2a3d1e },
  snow: { torch: 0xcfe2ff, range: 12, tint: [0.9, 0.95, 1], sky: 2.2, sun: 2.8, bg: 0xb9c4cf },
  ruins: { torch: 0xffb070, range: 12, tint: [1, 0.86, 0.72], sky: 1.6, sun: 2.4, bg: 0x2b2a24 }, // 해 질 녘
  sanctum: { torch: 0xe0705a, range: 10, tint: [1, 0.78, 0.72], sky: 0.22, sun: 0, bg: 0x000000 }, // 무너진 성소: 폐허 타일에 칠흑과 핏빛 횃불
};
const sky = new THREE.HemisphereLight(0x3a4a66, 0x000000, 0.1); // 시야 밖이 완전한 검정은 아니게
// 낮의 해: 주인공을 따라다니며 비스듬히 비춘다(그림자는 화면 오른쪽 아래로). 지하에서는 세기 0(빛 개수가 바뀌면 셰이더를 다시 만든다)
const sun = new THREE.DirectionalLight(0xfff2d8, 0);
const SUN_AT = new THREE.Vector3(-6, 14, -3); // 주인공에서 해 쪽
const SUN_BOX = 20; // 그림자를 그리는 범위(m, 화면보다 넉넉히)
const WINDUP = new THREE.Color(2.2, 0.2, 0.12); // 공격 준비(평타·내려찍기·돌진 예고) 색
const STUNNED = new THREE.Color(0.45, 0.6, 1.1); // 함성에 기절한 적
const SCARED = new THREE.Color(0.5, 1.1, 0.5); // 공포로 도망치는 적

export const renderer = new THREE.WebGLRenderer({ antialias: false });
export const camera = new THREE.OrthographicCamera();
const scene = new THREE.Scene();
let torchBase = 0xff9a4d; // 지역의 횃불 색(벼림 중엔 강화 색 쪽으로 30% 섞는다)
const torch = new THREE.PointLight(0xff9a4d, TORCH, TORCH_RANGE, 1.5); // 주인공이 든 횃불
const focus = new THREE.Vector3();
const tmp = new THREE.Vector3();
const right = new THREE.Vector3();
const up = new THREE.Vector3();
// 수평 45°, 내려다보는 각 30°(극각 60°) = FLARE 스프라이트를 그린 각도, 거리 30
const CAM_OFFSET = new THREE.Vector3().setFromSphericalCoords(30, THREE.MathUtils.degToRad(60), THREE.MathUtils.degToRad(45));
// 이동 클릭 표시: 누른 지점에서 안쪽으로 줄어들며 사라지는 고리
const MARK = 0.45;
const marker = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.44, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, depthWrite: false, toneMapped: false }));
marker.renderOrder = 1; // 바닥 다음, 캐릭터 전에
let markT = 0;
export function markMove(x: number, z: number) {
  marker.position.set(x, 0.04, z);
  markT = MARK;
}
// 스킬 조준 궤적(중세풍): 직선은 발밑에서 뻗는 금빛 띠 위로 쉐브론(»)이 끝 쪽으로 흐르고 끝에 미늘 화살촉,
// 원은 천천히 도는 금빛 룬 마법진, 사거리는 점선 고리. 횃불빛처럼 더해 그린다(+z 방향 기준 단위 도형, 크기는 setAim)
const AIM_HEAD = 0.6; // 화살촉 길이(m)
const AIM_SEG = 0.5; // 쉐브론 한 칸의 길이(m)
const AIM_GOLD = 0xf2c060;
const aimGlow = (opacity: number, map?: THREE.Texture) =>
  new THREE.MeshBasicMaterial({ color: AIM_GOLD, map, transparent: true, opacity, depthWrite: false, depthTest: false, toneMapped: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }); // 벽에 가려지지 않게 맨 위에
// 띠 한 칸(16×16 도트): 양쪽 가장자리 금줄 + 옅은 바탕 + 끝 쪽(캔버스 아래)을 가리키는 V
function chevronTexture() {
  const c = Object.assign(document.createElement('canvas'), { width: 16, height: 16 });
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(255,255,255,0.12)';
  g.fillRect(0, 0, 16, 16);
  g.fillStyle = 'rgba(255,255,255,0.55)';
  g.fillRect(0, 0, 1, 16);
  g.fillRect(15, 0, 1, 16);
  g.fillStyle = '#fff';
  for (let i = 0; i < 6; i++) {
    g.fillRect(2 + i, 3 + i, 2, 2);
    g.fillRect(12 - i, 3 + i, 2, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter; // 도트 그대로
  t.wrapT = THREE.RepeatWrapping;
  return t;
}
const chevrons = chevronTexture();
// 띠의 v: 주인공 쪽 1 → 끝 0. offset을 늘리면 무늬가 끝 쪽으로 흐른다
const aimBody = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5), aimGlow(0.55, chevrons));
// 미늘 화살촉: 끝(0, 1), 양 미늘(±0.5, 0), 가운데 홈(0, 0.3)
const aimHead = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(-0.5, 0), new THREE.Vector2(0, 0.3), new THREE.Vector2(0.5, 0), new THREE.Vector2(0, 1)])).rotateX(Math.PI / 2), aimGlow(0.8));
const aimLine = new THREE.Group().add(aimBody, aimHead);
const aimDisc = new THREE.Mesh(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2), aimGlow(0.1)); // 떨어질 자리(반경 1 → scale)
const aimRune = new THREE.Mesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), aimGlow(0.85, runeTexture('#fff')));
// 사거리: 점선 고리(72칸 중 짝수 칸만 그은 1px 선)
const dashes: number[] = [];
for (let i = 0; i < 72; i += 2) for (const k of [i, i + 1]) dashes.push(Math.cos((k / 72) * Math.PI * 2), 0, Math.sin((k / 72) * Math.PI * 2));
const aimRange = new THREE.LineSegments(
  new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(dashes, 3)),
  new THREE.LineBasicMaterial({ color: AIM_GOLD, transparent: true, opacity: 0.45, depthWrite: false, depthTest: false, toneMapped: false, blending: THREE.AdditiveBlending }),
);
const aimCircle = new THREE.Group().add(aimDisc, aimRune);
for (const m of [aimLine, aimBody, aimHead, aimDisc, aimRune, aimRange]) m.renderOrder = 5;
aimLine.visible = aimCircle.visible = aimRange.visible = false;
export type AimGuide =
  | { kind: 'line'; x: number; z: number; dx: number; dz: number; len: number; width: number } // (x, z)에서 단위 방향 (dx, dz)로 len m, 폭 width m
  | { kind: 'circle'; x: number; z: number; r: number; cx: number; cz: number; range: number }; // (x, z) 반경 r, 주인공 (cx, cz) 둘레 사거리 range
// 조준 궤적(직선 또는 원). null이면 숨긴다
export function setAim(a: AimGuide | null) {
  aimLine.visible = a?.kind === 'line';
  aimCircle.visible = aimRange.visible = a?.kind === 'circle';
  const t = performance.now() / 1000;
  if (a?.kind === 'circle') {
    aimCircle.position.set(a.x, 0.05, a.z);
    aimCircle.scale.set(a.r, 1, a.r);
    aimRune.rotation.y = t * 0.7;
    aimRange.position.set(a.cx, 0.04, a.cz);
    aimRange.scale.set(a.range, 1, a.range);
    aimRange.rotation.y = -t * 0.15; // 점선이 천천히 돈다
  }
  if (a?.kind !== 'line') return;
  const body = Math.max(0.01, a.len - AIM_HEAD * 0.7); // 화살촉 홈까지 띠가 들어간다
  aimLine.position.set(a.x, 0.05, a.z);
  aimLine.rotation.y = Math.atan2(a.dx, a.dz);
  aimBody.scale.set(a.width, 1, body);
  chevrons.repeat.set(1, body / AIM_SEG);
  chevrons.offset.y = (t * 1.6) % 1;
  aimHead.scale.set(a.width * 1.8, 1, AIM_HEAD);
  aimHead.position.z = a.len - AIM_HEAD;
}
let sprites: Sprite[] = [];
const allySprites = new Map<number, Sprite>(); // 강령술사의 해골 병사(ally id → 판자)
let mapGroup = new THREE.Group(); // 현재 층의 바닥·벽·계단
let bufH = 1; // 렌더 버퍼 세로 픽셀 수
let time = 0;
// 타격감용 캐릭터별 상태: 번쩍임 남은 시간, 밀려난 뒤 판자가 따라가는 중인 차이(kx, kz), 직전 프레임 sim 위치
let fx: { flashT: number; flashHex: string | null; kx: number; kz: number; lx: number; lz: number }[] = []; // flashHex: 벼림 강화 타격이면 번쩍임 색
let impactsSeen = 0;
let shoutsSeen = 0;
let castsSeen = 0;
let comboSeen = -1;
let restShown = 0; // 모닥불 회복 중 이미 +숫자로 띄운 양
let restPopT = 0; // 다음 +숫자까지(초): 1초마다 모아서 // 글자를 띄운 마지막 연계 기록 id(id는 늘 커진다)
const COMBO_TEXT = { counter: '받아치기!', stunned: '약점!', back: '등 뒤!', reset: '가르기 준비!', dodge: '회피!', ward: '막힘' };
const SLIDE_MIN = 0.3; // 한 프레임에 이보다 멀리 옮겨졌으면 걸은 것이 아니라 밀려난 것(가장 빠른 걸음도 0.15m)
const tex = {} as Record<Theme, { floor: THREE.Texture; wall: THREE.Texture }>; // 테마별 바닥·벽 질감
let floorTex: THREE.Texture;
let wallTex: THREE.Texture;
const FLOOR_VARIANTS = 8; // floor.png 가로 칸 수
let cutaway = (_hx: number, _hz: number) => {}; // 현재 층의 앞쪽 벽 낮추기
// 설원 눈보라: 구역에 들어온 뒤의 시간과 시간표 시드. 눈보라 동안 시야가 BLIZZARD_SIGHT까지 좁아진다
let weather = { on: false, t: 0, seed: 0 };
const BLIZZARD_SIGHT = 8;

export async function initRender(world: World, theme: Theme) {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.BasicShadowMap; // 경계가 딱딱한 픽셀 그림자
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  document.body.prepend(renderer.domElement);
  scene.background = new THREE.Color(0x000000);
  scene.add(sky);
  torch.castShadow = true;
  torch.shadow.mapSize.set(512, 512);
  torch.shadow.bias = -0.002;
  scene.add(torch);
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.bias = -0.002;
  Object.assign(sun.shadow.camera, { left: -SUN_BOX, right: SUN_BOX, top: SUN_BOX, bottom: -SUN_BOX, near: 1, far: 40 });
  scene.add(sun, sun.target);
  scene.add(rainGroup, rollGroup, iaidoGroup, temperGroup, ghostGroup, hawkGroup, zoneGroup, marker, aimLine, aimCircle, aimRange);
  addEventListener('resize', resize);
  resize();
  const [f, w, cf, cw, ff, fw, sf, sw, rf, rw] = await Promise.all([loadSheet(floorUrl), loadSheet(wallUrl), loadSheet(caveFloorUrl), loadSheet(caveWallUrl), loadSheet(fieldFloorUrl), loadSheet(fieldWallUrl), loadSheet(snowFloorUrl), loadSheet(snowWallUrl), loadSheet(ruinsFloorUrl), loadSheet(ruinsWallUrl), loadSprites(), loadProps(), setHeroGear(world.gear, world.cls, looksOf(world))]);
  tex.dungeon = { floor: f, wall: w };
  tex.cave = { floor: cf, wall: cw };
  tex.field = { floor: ff, wall: fw };
  tex.snow = { floor: sf, wall: sw };
  tex.ruins = { floor: rf, wall: rw };
  tex.sanctum = tex.ruins;
  setWorld(world, theme);
}

export function setWorld(world: World, theme: Theme) {
  ({ floor: floorTex, wall: wallTex } = tex[theme]);
  const mood = MOOD[theme];
  torch.color.set(mood.torch);
  torchBase = mood.torch;
  torch.distance = TORCH_RANGE = mood.range;
  TORCH_TINT.fromArray(mood.tint);
  sky.intensity = mood.sky;
  view.day = mood.sun > 0;
  view.sight = SIGHT;
  weather = { on: theme === 'snow', t: 0, seed: world.rng };
  sun.intensity = mood.sun;
  sky.color.set(view.day ? 0xdfe8ff : 0x3a4a66);
  sky.groundColor.set(view.day ? mood.bg : 0x000000);
  (scene.background as THREE.Color).set(mood.bg);
  torch.castShadow = !view.day; // 그림자는 낮엔 해가, 밤엔 횃불이
  sun.castShadow = view.day;
  buildMap(world);
  clearRain();
  for (const s of sprites) s.mesh.removeFromParent();
  dropAllies(new Set());
  sprites = world.entities.map(makeSprite);
  for (const s of sprites) scene.add(s.mesh);
  fx = [];
  resetIaido();
  resetTemper(world);
  resetGhosts(world);
  resetHawk(world);
  impactsSeen = world.impacts;
  shoutsSeen = world.shouts;
  castsSeen = world.casts;
  comboSeen = -1;
  restShown = world.rested;
  restPopT = 0;
  focus.set(world.entities[0].x, 0, world.entities[0].z);
}

// 그 엔티티의 머리 위 월드 좌표(검흔 표시용). 판자가 없거나 안 보이면 null
export function headOf(id: number): THREE.Vector3 | null {
  const s = sprites[id];
  if (!s || !s.mesh.visible) return null;
  return s.mesh.position.clone().add(new THREE.Vector3(0, s.info.cell[1] / s.info.ppm + 0.1, 0));
}

export function draw(world: World, dt: number) {
  const hero = world.entities[0];
  time += dt;
  const flicker = 1 + 0.06 * Math.sin(time * 11) + 0.04 * Math.sin(time * 23.7); // 불꽃 깜빡임
  torch.position.set(hero.x, 4, hero.z); // 높을수록 가까운 물체와 먼 바닥의 밝기 차가 줄어든다
  torch.intensity = view.day ? 0 : TORCH * flicker;
  const edge = edgeColor(world);
  torch.color.setHex(edge ? mixColor(torchBase, parseInt(edge.slice(1), 16), 0.3) : torchBase);
  void setHeroGear(world.gear, world.cls, looksOf(world)); // 벼림: 무기 색(같으면 아무것도 안 함, 다 그린 뒤에야 바뀐다)
  weather.t += dt;
  const storm = weather.on ? blizzard(weather.t, weather.seed) : 0;
  view.sight = SIGHT - (SIGHT - BLIZZARD_SIGHT) * storm;
  document.getElementById('blizzard')!.style.opacity = String(storm);
  document.getElementById('blizzard-warn')!.hidden = !(weather.on && warnBlizzard(weather.t, weather.seed));
  sun.position.set(hero.x, 0, hero.z).add(SUN_AT);
  sun.target.position.set(hero.x, 0, hero.z);
  // 세로 판자는 머리 위 불빛을 거의 못 받으므로 횃불(주인공)·화로와의 거리로 밝기를 직접 정한다. 낮엔 어디나 밝다
  const light = (x: number, z: number) => {
    let b = view.day ? 1 : (Math.max(0, 1 - Math.hypot(x - hero.x, z - hero.z) / TORCH_RANGE) ** 1.4 * 1.1 + 0.04) * flicker;
    for (const f of braziers) b = Math.max(b, Math.max(0, 1 - Math.hypot(x - f.x, z - f.z) / BRAZIER_RANGE) ** 1.4);
    return b;
  };
  // 게임 중에 생긴 엔티티(해골 왕의 소환)도 판자를 만든다
  for (let i = sprites.length; i < world.entities.length; i++) scene.add((sprites[i] = makeSprite(world.entities[i])).mesh);
  // 모닥불 휴식: 1초마다 그동안 찬 체력을 주인공 머리 위에 +숫자로
  if ((restPopT -= dt) <= 0) {
    const gain = Math.floor(world.rested) - Math.floor(restShown);
    if (gain > 0) popNumber(camera, renderer.domElement, hero.x, hero.z, `+${gain}`, 'heal');
    restShown = world.rested;
    restPopT = 1;
  }
  const hits = world.impacts - impactsSeen; // 이번 프레임에 스킬이 맞힌 적 수
  impactsSeen = world.impacts;
  if (world.shouts > shoutsSeen) rumble(0.3);
  shoutsSeen = world.shouts;
  if (world.casts > castsSeen) sprites[0].castT = CAST_SHOW; // 마법사가 스킬을 썼다: 시전 동작
  castsSeen = world.casts;
  for (const c of world.combos) if (c.id > comboSeen) popNumber(camera, renderer.domElement, c.x, c.z, COMBO_TEXT[c.kind], 'combo');
  comboSeen = Math.max(comboSeen, ...world.combos.map((c) => c.id));
  const fresh = freshEdgeHits(world); // 이번 프레임에 벼림 강화 효과를 받은 적: 적마다 추가 피해 합과 종류
  const edgeBy = new Map<number, { dmg: number; kind: EdgeHit['kind'] }>();
  for (const h of fresh) edgeBy.set(h.ent, { dmg: (edgeBy.get(h.ent)?.dmg ?? 0) + h.dmg, kind: h.kind });
  const frozen = hitstop > 0; // 멈춤 동안은 번쩍임·미끄러짐도 멈춘다 → 풀리면서 날아간다
  for (const e of world.entities) {
    const s = sprites[e.id];
    const f = (fx[e.id] ??= { flashT: 0, flashHex: null, kx: 0, kz: 0, lx: e.x, lz: e.z });
    const lost = e.maxHp === s.maxHp ? Math.round(s.hp - e.hp) : 0; // 갑옷 교체로 줄어든 것은 맞은 것이 아니다
    if (e !== hero && Math.hypot(e.x - f.lx, e.z - f.lz) > SLIDE_MIN) [f.kx, f.kz] = [f.kx + f.lx - e.x, f.kz + f.lz - e.z];
    [f.lx, f.lz] = [e.x, e.z];
    updateSprite(s, e, dt, attackInterval(world, e));
    if (lost > 0) {
      const eh = e === hero ? undefined : edgeBy.get(e.id);
      const [main, extra] = splitLost(lost, eh?.dmg ?? 0); // 벼림 추가 피해는 색을 달리해 따로
      if (main > 0) popNumber(camera, renderer.domElement, e.x, e.z, main, e === hero ? 'hurt' : hits > 0 ? 'skill' : 'hit');
      if (extra > 0) popNumber(camera, renderer.domElement, e.x, e.z, extra, eh!.kind === 'both' ? 'unleash' : 'flame');
      if (e !== hero) [f.flashT, f.flashHex] = [hits > 0 ? 0.09 : 0.05, eh ? EDGE_COLOR[eh.kind] : null];
    }
    if (!frozen) {
      f.flashT -= dt;
      const k = Math.exp(-20 * dt);
      [f.kx, f.kz] = [f.kx * k, f.kz * k];
    }
    s.mesh.position.x += f.kx;
    s.mesh.position.z += f.kz;
    // 구르기: 한 바퀴 돌며 잔상·흙먼지(roll.ts). 마법사의 순간이동도 sim에선 'roll'(잠깐 무적)이지만 예전처럼 몸만 낮춘다
    if (e === hero && world.cls === 'wizard') s.mesh.scale.y = e.phase === 'roll' ? 0.55 : 1;
    else if (e === hero) (rollFx(s, e, frozen ? 0 : dt), leapFx(s, e, frozen ? 0 : dt), flashFx(s, e, dt)); // 발도: 일섬·스쳐 베기 질주(iaido.ts, 멈춤은 안에서 따진다)
    if (e === hero && e.phase === 'ride') s.mesh.position.y = rideLift(e.phaseT); // 매 타기: 매가 들어 올린다
    s.mat.color.copy(TORCH_TINT).multiply(s.tint).multiplyScalar(e === hero ? (view.day ? 1.05 : 1.15 * flicker) : light(e.x, e.z));
    // 낮: 시야 밖의 적은 서서히 사라진다(발밑 고리도 판자의 자식이라 같이)
    const seen = e === hero ? 1 : fadeOf(hero, e);
    s.mesh.visible = seen > 0 && !hidden(e); // 모래 속 개미귀신은 깨기 전엔 안 보인다
    s.mat.transparent = seen < 1;
    s.mat.opacity = seen;
    s.mat.alphaTest = Math.max(0.01, 0.5 * seen); // 투명도까지 곱한 알파로 자르므로 같이 낮춘다
    if (f.flashT > 0) f.flashHex ? s.mat.color.set(f.flashHex).multiplyScalar(4) : s.mat.color.setScalar(10); // 맞은 순간 하얗게(벼림이면 강화 색으로)
    if (e !== hero && winding(e)) s.mat.color.lerp(WINDUP, 0.75 + 0.25 * Math.sin(time * 25)); // 공격 준비: 붉게 맥동
    if (e.stunT > 0 || e.asleep) s.mat.color.lerp(STUNNED, 0.5); // 잠든(얼어붙은) 몬스터도 푸르게
    if (e.fearT > 0 && e.skin !== 'treasure') s.mat.color.lerp(SCARED, 0.5); // 보물 고블린은 도망쳐도 금빛
  }
  // 해골 병사: entities 밖이라 판자를 따로 만들고, 사라지면 치운다
  dropAllies(new Set(world.allies.map((a) => a.id)));
  for (const a of world.allies) {
    let s = allySprites.get(a.id);
    if (!s) {
      s = makeSprite(a);
      s.tint = ALLY_TINT;
      allySprites.set(a.id, s);
      scene.add(s.mesh);
    }
    updateSprite(s, a, dt, a.interval);
    s.mat.color.copy(TORCH_TINT).multiply(s.tint).multiplyScalar(light(a.x, a.z) * (0.45 + (0.55 * a.hp) / a.maxHp)); // 맞을수록 어두워진다
  }
  markT -= dt;
  marker.visible = markT > 0;
  marker.scale.setScalar(0.45 + (0.55 * markT) / MARK);
  marker.material.opacity = Math.min(1, (2 * markT) / MARK);
  cutaway(hero.x, hero.z);
  syncItems(world);
  syncShots(world);
  syncComets(world);
  syncEffects(world);
  cutsFx(world, dt); // 발도: 바닥의 칼선
  syncZones(world);
  syncFires(world, time);
  syncBeams(world, time);
  syncSwords(world);
  syncJudge(world, time);
  syncFlames(world);
  temperFx(world, sprites[0].mesh.position, time, frozen ? 0 : dt, fresh);
  ghostFx(world, time, frozen ? 0 : dt); // 잔상(마법사)
  hawkFx(world, sprites[0].mesh.position, time, frozen ? 0 : dt); // 궁수의 매
  syncChests(world);
  const altars = world.chests.filter((c) => c.kind === 'altar');
  setHaloGoal(!altars.length ? 1 : warded(world) ? altars.filter((c) => !c.open).length / altars.length : 0);
  setHeroRing(hasUnique(world, 'crackedHalo') ? heroRingLevel(world.haloCd, REWIND.cd) : 0); // 「금 간 빛 고리」: 머리 위 고리가 되감기 상태
  syncSpikes(world);
  syncGates(world);
  syncRain(world, frozen ? 0 : dt, stickArrow);
  updateProps(dt, light);
  focus.lerp(tmp.set(hero.x, 0, hero.z), 1 - Math.exp(-8 * dt));
  camera.position.copy(focus).add(CAM_OFFSET);
  camera.lookAt(focus);
  updateFeel(dt, camera);
  impact(hits);
  snapToPixel();
  renderer.render(scene, camera);
}

// 카메라를 렌더 픽셀 격자에 맞춘다. 안 맞추면 이동할 때 벽·바닥 픽셀이 지글거린다.
function snapToPixel() {
  camera.updateMatrixWorld();
  right.setFromMatrixColumn(camera.matrixWorld, 0);
  up.setFromMatrixColumn(camera.matrixWorld, 1);
  const px = (camera.top - camera.bottom) / bufH; // 렌더 픽셀 1개의 월드 크기
  const x = camera.position.dot(right);
  const y = camera.position.dot(up);
  camera.position.addScaledVector(right, Math.round(x / px) * px - x).addScaledVector(up, Math.round(y / px) * px - y);
}

// 낮은 해상도로 그리고 CSS(image-rendering: pixelated)로 정수배 확대한다.
function resize() {
  const dpr = devicePixelRatio;
  const pixel = Math.max(1, Math.round((Math.min(innerWidth, innerHeight) * dpr) / SHORT_PX)); // 렌더 픽셀 1개 = 화면 pixel×pixel
  const w = Math.ceil((innerWidth * dpr) / pixel);
  bufH = Math.ceil((innerHeight * dpr) / pixel);
  renderer.setPixelRatio(1);
  renderer.setSize(w, bufH, false);
  Object.assign(renderer.domElement.style, { width: `${(w * pixel) / dpr}px`, height: `${(bufH * pixel) / dpr}px` });
  const [hx, hy] = viewHalf(w, bufH); // 30px/m 고정. 보이는 범위는 기기마다 조금씩 다르다(짧은 변 약 10~14m)
  Object.assign(camera, { left: -hx, right: hx, top: hy, bottom: -hy, near: 1, far: 100 });
  camera.updateProjectionMatrix();
}

function buildMap(world: World) {
  // 이전 층의 메시·지오메트리·재질·질감 해제(소품은 buildProps가 해제)
  mapGroup.traverse((o) => {
    if (!(o instanceof THREE.InstancedMesh)) return;
    o.geometry.dispose();
    for (const mat of [o.material].flat() as THREE.MeshStandardMaterial[]) {
      mat.map?.dispose();
      mat.dispose();
    }
  });
  mapGroup.removeFromParent();
  mapGroup = new THREE.Group();
  const { w, h, blocked } = world.grid;
  // 바닥은 걸을 수 있는 칸과 소품 칸에, 벽은 바닥과 맞닿은 테두리만 그린다. 그 밖은 칠흑(디아블로처럼)
  const open = (x: number, z: number) => x >= 0 && z >= 0 && x < w && z < h && !blocked[z * w + x];
  const prop = new Set([...world.props, ...world.gates, ...world.chests].map((p) => p.z * w + p.x)); // 소품·문·상자 칸: 벽 상자 대신 바닥을 깐다
  const road = new Set(world.roads.map(([x, z]) => z * w + x));
  const sand = new Set(world.sand.map(([x, z]) => z * w + x));
  const floorCells: [number, number][][] = Array.from({ length: 3 * FLOOR_VARIANTS }, () => []); // 변형 × [바닥, 길(흙빛), 개미지옥 모래]
  const wallCells: [number, number][] = [];
  for (let z = 0; z < h; z++) {
    for (let x = 0; x < w; x++) {
      if (open(x, z) || prop.has(z * w + x)) floorCells[floorVariant(x, z) + (sand.has(z * w + x) ? 2 * FLOOR_VARIANTS : road.has(z * w + x) ? FLOOR_VARIANTS : 0)].push([x, z]);
      else if ([-1, 0, 1].some((dz) => [-1, 0, 1].some((dx) => open(x + dx, z + dz)))) wallCells.push([x, z]);
    }
  }
  const m = new THREE.Matrix4();
  const floorGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2); // 질감 열 = +x, 행 = +z
  floorCells.forEach((cells, i) => {
    const mat = stone(floorTex, i % FLOOR_VARIANTS, FLOOR_VARIANTS);
    if (i >= 2 * FLOOR_VARIANTS) mat.color.setRGB(1.25, 1, 0.55); // 모래: 누렇게
    else if (i >= FLOOR_VARIANTS) mat.color.setRGB(...(weather.on ? [0.78, 0.8, 0.84] : [0.78, 0.62, 0.44]) as [number, number, number]); // 길: 밟아 다진 흙(설원은 다져진 회색 눈)
    const floor = new THREE.InstancedMesh(floorGeo.clone(), mat, cells.length);
    cells.forEach(([x, z], k) => floor.setMatrixAt(k, m.makeTranslation(x + 0.5, 0, z + 0.5)));
    floor.receiveShadow = true;
    mapGroup.add(floor);
  });
  floorGeo.dispose();
  // 보이는 면은 +x·+z(카메라 쪽)와 윗면뿐. 안 보이는 면은 같은 재질을 쓴다
  // wall.png = 변형마다 [+x 면, +z 면] 32px씩. 변형별로 InstancedMesh 하나(칸마다 해시로 고름)
  const variants = Math.max(1, Math.round((wallTex.image as { width: number }).width / 64));
  const boxGeo = new THREE.BoxGeometry(1, 1.2, 1);
  const cuts = Array.from({ length: variants }, (_, v) => {
    const cells = wallCells.filter(([x, z]) => wallVariant(x, z, variants) === v);
    const side = [stone(wallTex, 2 * v, 2 * variants), stone(wallTex, 2 * v + 1, 2 * variants)];
    const top = stone(floorTex, 3, FLOOR_VARIANTS);
    top.color.setScalar(view.day ? 0.7 : 0.35); // 벽 윗면은 어둡게(낮엔 덜)
    const walls = new THREE.InstancedMesh(v ? boxGeo.clone() : boxGeo, [side[0], side[0], top, top, side[1], side[1]], cells.length);
    cells.forEach(([x, z], i) => walls.setMatrixAt(i, m.makeTranslation(x + 0.5, 0.6, z + 0.5)));
    walls.castShadow = walls.receiveShadow = true;
    mapGroup.add(walls);
    return makeCutaway(walls, cells);
  });
  cutaway = (hx, hz) => cuts.forEach((c) => c(hx, hz));
  mapGroup.add(buildProps(world));
  scene.add(mapGroup);
}

// 가로로 n칸 늘어놓은 질감의 i번째 칸만 쓰는 재질
function stone(tex: THREE.Texture, i: number, n: number) {
  const map = tex.clone();
  map.repeat.set(1 / n, 1);
  map.offset.set(i / n, 0);
  return new THREE.MeshStandardMaterial({ map, roughness: 1 });
}

function dropAllies(live: Set<number>) {
  for (const [id, s] of allySprites) {
    if (live.has(id)) continue;
    s.mesh.removeFromParent();
    s.mat.map?.dispose();
    s.mat.dispose();
    allySprites.delete(id);
  }
}
