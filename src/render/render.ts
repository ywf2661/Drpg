// three.js 렌더링. sim 상태를 읽기만 하고 수정하지 않는다.
import * as THREE from 'three';
import type { World } from '../sim/world';
import { loadSprites, makeSprite, updateSprite, viewHalf, type Sprite } from './sprites';

const SHORT_PX = 360; // 화면 짧은 변을 이만큼의 렌더 픽셀로 그린다(도트 느낌, 기기와 무관하게 같은 굵기)
const TORCH = 80; // 횃불 밝기(칸델라)
const TORCH_RANGE = 9; // 시야 반경(m). 이 밖은 거의 칠흑
const TORCH_TINT = new THREE.Color(1, 0.82, 0.62); // 스프라이트에 입히는 횃불 색

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
let sprites: Sprite[] = [];
let mapGroup = new THREE.Group(); // 현재 층의 바닥·벽·계단
let bufH = 1; // 렌더 버퍼 세로 픽셀 수
let time = 0;

export async function initRender(world: World) {
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
  addEventListener('resize', resize);
  resize();
  await loadSprites();
  setWorld(world);
}

export function setWorld(world: World) {
  buildMap(world);
  for (const s of sprites) s.mesh.removeFromParent();
  sprites = world.entities.map(makeSprite);
  for (const s of sprites) scene.add(s.mesh);
  focus.set(world.entities[0].x, 0, world.entities[0].z);
}

export function draw(world: World, dt: number) {
  const hero = world.entities[0];
  time += dt;
  const flicker = 1 + 0.06 * Math.sin(time * 11) + 0.04 * Math.sin(time * 23.7); // 불꽃 깜빡임
  torch.position.set(hero.x, 4, hero.z); // 높을수록 가까운 물체와 먼 바닥의 밝기 차가 줄어든다
  torch.intensity = TORCH * flicker;
  for (const e of world.entities) {
    const s = sprites[e.id];
    updateSprite(s, e, dt);
    // 세로 판자는 머리 위 횃불 빛을 거의 못 받으므로 주인공과의 거리로 밝기를 직접 정한다
    const d = Math.hypot(e.x - hero.x, e.z - hero.z);
    const b = e === hero ? 1.15 : Math.max(0, 1 - d / TORCH_RANGE) ** 1.4 * 1.1 + 0.04;
    s.mat.color.copy(TORCH_TINT).multiplyScalar(b * flicker);
  }
  focus.lerp(tmp.set(hero.x, 0, hero.z), 1 - Math.exp(-8 * dt));
  camera.position.copy(focus).add(CAM_OFFSET);
  camera.lookAt(focus);
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
  // 이전 층의 메시·지오메트리·재질·질감 해제
  mapGroup.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    o.geometry.dispose();
    const mat = o.material as THREE.MeshStandardMaterial;
    mat.map?.dispose();
    mat.dispose();
  });
  mapGroup.removeFromParent();
  mapGroup = new THREE.Group();
  const { w, h, blocked } = world.grid;
  // 바닥은 걸을 수 있는 칸에만, 벽은 바닥과 맞닿은 테두리만 그린다. 그 밖은 칠흑(디아블로처럼)
  const open = (x: number, z: number) => x >= 0 && z >= 0 && x < w && z < h && !blocked[z * w + x];
  const floorCells: [number, number][] = [];
  const wallCells: [number, number][] = [];
  for (let z = 0; z < h; z++) {
    for (let x = 0; x < w; x++) {
      if (open(x, z)) floorCells.push([x, z]);
      else if ([-1, 0, 1].some((dz) => [-1, 0, 1].some((dx) => open(x + dx, z + dz)))) wallCells.push([x, z]);
    }
  }
  const floorGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const floor = new THREE.InstancedMesh(floorGeo, new THREE.MeshStandardMaterial({ map: stoneTexture(0x5a5f66, false), roughness: 1 }), floorCells.length);
  const walls = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1.2, 1),
    new THREE.MeshStandardMaterial({ map: stoneTexture(0x5c6068, true), roughness: 1 }),
    wallCells.length,
  );
  const m = new THREE.Matrix4();
  floorCells.forEach(([x, z], i) => floor.setMatrixAt(i, m.makeTranslation(x + 0.5, 0, z + 0.5)));
  wallCells.forEach(([x, z], i) => walls.setMatrixAt(i, m.makeTranslation(x + 0.5, 0.6, z + 0.5)));
  floor.receiveShadow = true;
  walls.castShadow = walls.receiveShadow = true;
  mapGroup.add(floor, walls);
  if (world.stairs) {
    // ponytail: 임시 계단 = 검은 구멍. 2-B에서 FLARE 계단 그림으로 교체
    const hole = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    hole.rotation.x = -Math.PI / 2;
    hole.position.set(world.stairs[0] + 0.5, 0.005, world.stairs[1] + 0.5); // 스프라이트 바닥면(0.01)보다 아래
    mapGroup.add(hole);
  }
  scene.add(mapGroup);
}

// 코드로 만든 16×16 픽셀 돌 질감. 바닥은 타일 테두리, 벽은 엇갈린 벽돌 줄눈이 어둡다.
function stoneTexture(base: number, brick: boolean) {
  const S = 16;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const col = new THREE.Color();
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const offset = ((y >> 2) % 2) * 4;
      const mortar = brick ? y % 4 === 0 || (x + offset) % 8 === 0 : x === 0 || y === 0;
      g.fillStyle = col.set(base).multiplyScalar(mortar ? 0.45 : 0.8 + Math.random() * 0.35).getStyle();
      g.fillRect(x, y, 1, 1);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
