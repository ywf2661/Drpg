// three.js 렌더링. sim 상태를 읽기만 하고 수정하지 않는다.
import * as THREE from 'three';
import { attackInterval, winding, type World } from '../sim/world';
import floorUrl from '../assets/tiles/floor.png';
import wallUrl from '../assets/tiles/wall.png';
import caveFloorUrl from '../assets/tiles/floor_cave.png';
import caveWallUrl from '../assets/tiles/wall_cave.png';
import type { Theme } from '../sim/dungeon';
import { makeCutaway } from './cutaway';
import { hitstop, impact, popNumber, rumble, updateFeel } from './feel';
import { BRAZIER_RANGE, braziers, buildProps, floorVariant, wallVariant, loadProps, syncChests, syncEffects, syncFires as syncFlames, syncGates, syncItems, syncShots, updateProps } from './props';
import { syncFires, syncZones, zoneGroup } from './zones';
import { runeTexture } from './ward';
import { CAST_SHOW, loadSheet, loadSprites, makeSprite, setHeroGear, updateSprite, viewHalf, type Sprite } from './sprites';

const SHORT_PX = 360; // 화면 짧은 변을 이만큼의 렌더 픽셀로 그린다(도트 느낌, 기기와 무관하게 같은 굵기)
const TORCH = 80; // 횃불 밝기(칸델라)
const TORCH_RANGE = 9; // 시야 반경(m). 이 밖은 거의 칠흑
const TORCH_TINT = new THREE.Color(1, 0.82, 0.62); // 스프라이트에 입히는 횃불 색
const WINDUP = new THREE.Color(2.2, 0.2, 0.12); // 공격 준비(평타·내려찍기·돌진 예고) 색
const STUNNED = new THREE.Color(0.45, 0.6, 1.1); // 함성에 기절한 적
const SCARED = new THREE.Color(0.5, 1.1, 0.5); // 공포로 도망치는 적

export const renderer = new THREE.WebGLRenderer({ antialias: false });
export const camera = new THREE.OrthographicCamera();
const scene = new THREE.Scene();
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
let mapGroup = new THREE.Group(); // 현재 층의 바닥·벽·계단
let bufH = 1; // 렌더 버퍼 세로 픽셀 수
let time = 0;
// 타격감용 캐릭터별 상태: 번쩍임 남은 시간, 밀려난 뒤 판자가 따라가는 중인 차이(kx, kz), 직전 프레임 sim 위치
let fx: { flashT: number; kx: number; kz: number; lx: number; lz: number }[] = [];
let impactsSeen = 0;
let shoutsSeen = 0;
let castsSeen = 0;
let comboSeen = -1; // 글자를 띄운 마지막 연계 기록 id(id는 늘 커진다)
const COMBO_TEXT = { counter: '받아치기!', stunned: '약점!', back: '등 뒤!', reset: '가르기 준비!', dodge: '회피!' };
const SLIDE_MIN = 0.3; // 한 프레임에 이보다 멀리 옮겨졌으면 걸은 것이 아니라 밀려난 것(가장 빠른 걸음도 0.15m)
const tex = {} as Record<Theme, { floor: THREE.Texture; wall: THREE.Texture }>; // 테마별 바닥·벽 질감
let floorTex: THREE.Texture;
let wallTex: THREE.Texture;
const FLOOR_VARIANTS = 8; // floor.png 가로 칸 수
let cutaway = (_hx: number, _hz: number) => {}; // 현재 층의 앞쪽 벽 낮추기

export async function initRender(world: World, theme: Theme) {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.BasicShadowMap; // 경계가 딱딱한 픽셀 그림자
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  document.body.prepend(renderer.domElement);
  scene.background = new THREE.Color(0x000000);
  scene.add(new THREE.HemisphereLight(0x3a4a66, 0x000000, 0.1)); // 시야 밖이 완전한 검정은 아니게
  torch.castShadow = true;
  torch.shadow.mapSize.set(512, 512);
  torch.shadow.bias = -0.002;
  scene.add(torch);
  scene.add(zoneGroup, marker, aimLine, aimCircle, aimRange);
  addEventListener('resize', resize);
  resize();
  const [f, w, cf, cw] = await Promise.all([loadSheet(floorUrl), loadSheet(wallUrl), loadSheet(caveFloorUrl), loadSheet(caveWallUrl), loadSprites(), loadProps(), setHeroGear(world.gear, world.cls)]);
  tex.dungeon = { floor: f, wall: w };
  tex.cave = { floor: cf, wall: cw };
  setWorld(world, theme);
}

export function setWorld(world: World, theme: Theme) {
  ({ floor: floorTex, wall: wallTex } = tex[theme]);
  buildMap(world);
  for (const s of sprites) s.mesh.removeFromParent();
  sprites = world.entities.map(makeSprite);
  for (const s of sprites) scene.add(s.mesh);
  fx = [];
  impactsSeen = world.impacts;
  shoutsSeen = world.shouts;
  castsSeen = world.casts;
  comboSeen = -1;
  focus.set(world.entities[0].x, 0, world.entities[0].z);
}

export function draw(world: World, dt: number) {
  const hero = world.entities[0];
  time += dt;
  const flicker = 1 + 0.06 * Math.sin(time * 11) + 0.04 * Math.sin(time * 23.7); // 불꽃 깜빡임
  torch.position.set(hero.x, 4, hero.z); // 높을수록 가까운 물체와 먼 바닥의 밝기 차가 줄어든다
  torch.intensity = TORCH * flicker;
  // 세로 판자는 머리 위 불빛을 거의 못 받으므로 횃불(주인공)·화로와의 거리로 밝기를 직접 정한다
  const light = (x: number, z: number) => {
    let b = (Math.max(0, 1 - Math.hypot(x - hero.x, z - hero.z) / TORCH_RANGE) ** 1.4 * 1.1 + 0.04) * flicker;
    for (const f of braziers) b = Math.max(b, Math.max(0, 1 - Math.hypot(x - f.x, z - f.z) / BRAZIER_RANGE) ** 1.4);
    return b;
  };
  // 게임 중에 생긴 엔티티(해골 왕의 소환)도 판자를 만든다
  for (let i = sprites.length; i < world.entities.length; i++) scene.add((sprites[i] = makeSprite(world.entities[i])).mesh);
  const hits = world.impacts - impactsSeen; // 이번 프레임에 스킬이 맞힌 적 수
  impactsSeen = world.impacts;
  if (world.shouts > shoutsSeen) rumble(0.3);
  shoutsSeen = world.shouts;
  if (world.casts > castsSeen) sprites[0].castT = CAST_SHOW; // 마법사가 스킬을 썼다: 시전 동작
  castsSeen = world.casts;
  for (const c of world.combos) if (c.id > comboSeen) popNumber(camera, renderer.domElement, c.x, c.z, COMBO_TEXT[c.kind], 'combo');
  comboSeen = Math.max(comboSeen, ...world.combos.map((c) => c.id));
  const frozen = hitstop > 0; // 멈춤 동안은 번쩍임·미끄러짐도 멈춘다 → 풀리면서 날아간다
  for (const e of world.entities) {
    const s = sprites[e.id];
    const f = (fx[e.id] ??= { flashT: 0, kx: 0, kz: 0, lx: e.x, lz: e.z });
    const lost = e.maxHp === s.maxHp ? Math.round(s.hp - e.hp) : 0; // 갑옷 교체로 줄어든 것은 맞은 것이 아니다
    if (e !== hero && Math.hypot(e.x - f.lx, e.z - f.lz) > SLIDE_MIN) [f.kx, f.kz] = [f.kx + f.lx - e.x, f.kz + f.lz - e.z];
    [f.lx, f.lz] = [e.x, e.z];
    updateSprite(s, e, dt, attackInterval(world, e));
    if (lost > 0) {
      popNumber(camera, renderer.domElement, e.x, e.z, lost, e === hero ? 'hurt' : hits > 0 ? 'skill' : 'hit');
      if (e !== hero) f.flashT = hits > 0 ? 0.09 : 0.05;
    }
    if (!frozen) {
      f.flashT -= dt;
      const k = Math.exp(-20 * dt);
      [f.kx, f.kz] = [f.kx * k, f.kz * k];
    }
    if (e === hero) s.mesh.scale.y = e.phase === 'roll' ? 0.55 : 1; // 구르기: 몸을 낮춘다
    s.mesh.position.x += f.kx;
    s.mesh.position.z += f.kz;
    s.mat.color.copy(TORCH_TINT).multiply(s.tint).multiplyScalar(e === hero ? 1.15 * flicker : light(e.x, e.z));
    if (f.flashT > 0) s.mat.color.setScalar(10); // 맞은 순간 하얗게
    if (e !== hero && winding(e)) s.mat.color.lerp(WINDUP, 0.75 + 0.25 * Math.sin(time * 25)); // 공격 준비: 붉게 맥동
    if (e.stunT > 0) s.mat.color.lerp(STUNNED, 0.5);
    if (e.fearT > 0) s.mat.color.lerp(SCARED, 0.5);
  }
  markT -= dt;
  marker.visible = markT > 0;
  marker.scale.setScalar(0.45 + (0.55 * markT) / MARK);
  marker.material.opacity = Math.min(1, (2 * markT) / MARK);
  cutaway(hero.x, hero.z);
  syncItems(world);
  syncShots(world);
  syncEffects(world);
  syncZones(world);
  syncFires(world, time);
  syncFlames(world);
  syncChests(world);
  syncGates(world);
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
  const prop = new Set([...world.props, ...world.gates].map((p) => p.z * w + p.x)); // 소품·문 칸: 벽 상자 대신 바닥을 깐다
  const floorCells: [number, number][][] = Array.from({ length: FLOOR_VARIANTS }, () => []);
  const wallCells: [number, number][] = [];
  for (let z = 0; z < h; z++) {
    for (let x = 0; x < w; x++) {
      if (open(x, z) || prop.has(z * w + x)) floorCells[floorVariant(x, z)].push([x, z]);
      else if ([-1, 0, 1].some((dz) => [-1, 0, 1].some((dx) => open(x + dx, z + dz)))) wallCells.push([x, z]);
    }
  }
  const m = new THREE.Matrix4();
  const floorGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2); // 질감 열 = +x, 행 = +z
  floorCells.forEach((cells, i) => {
    const floor = new THREE.InstancedMesh(floorGeo.clone(), stone(floorTex, i, FLOOR_VARIANTS), cells.length);
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
    top.color.setScalar(0.35); // 벽 윗면은 어둡게
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
