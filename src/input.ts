// 마우스 입력 → sim 명령. 몬스터 위 클릭은 attack, 땅 클릭·누르고 있기는 move.
import * as THREE from 'three';
import { camera, renderer } from './render/render';
import type { Command, World } from './sim/world';

const REPEAT = 0.15; // 누르고 있을 때 move 재발행 간격(초)
const PICK_RADIUS = 0.5; // 몬스터 선택 판정 반경(m)
const ray = new THREE.Raycaster();
const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const pointer = new THREE.Vector2();
const clickAt = new THREE.Vector2(); // 누른 순간의 위치. 다음 프레임 전에 커서가 움직여도 이 위치로 판정
const hit = new THREE.Vector3();
const a = new THREE.Vector3();
const b = new THREE.Vector3();
let held = false;
let clicked = false;
let repeatT = 0;

export const commands: Command[] = [];
export let hovered: number | null = null;

export function initInput() {
  const el = renderer.domElement;
  el.addEventListener('pointermove', setPointer);
  el.addEventListener('contextmenu', (e) => e.preventDefault()); // 우클릭 = 가르기
  el.addEventListener('pointerdown', (e) => {
    if (e.button === 2) {
      setPointer(e);
      ray.setFromCamera(pointer, camera);
      if (ray.ray.intersectPlane(ground, hit)) commands.push({ type: 'skill', x: hit.x, z: hit.z });
      return;
    }
    if (e.button !== 0) return;
    setPointer(e);
    clickAt.copy(pointer);
    held = clicked = true;
  });
  addEventListener('pointerup', () => (held = false));
  addEventListener('pointercancel', () => (held = false)); // 시스템 제스처 등으로 터치가 취소된 경우
  addEventListener('blur', () => (held = false));
}

function setPointer(e: PointerEvent) {
  const r = renderer.domElement.getBoundingClientRect();
  pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
}

export function pollInput(world: World, dt: number) {
  if (clicked) {
    // 프레임 사이에 눌렀다 뗀 짧은 클릭도 한 번은 처리한다
    clicked = false;
    repeatT = REPEAT;
    ray.setFromCamera(clickAt, camera);
    const id = pick(world);
    const chest = id === null ? pickChest(world) : null;
    if (id !== null) commands.push({ type: 'attack', targetId: id });
    else if (chest !== null) commands.push({ type: 'open', chestId: chest });
    else moveToRay();
    if (id !== null || chest !== null) held = false; // 몬스터·상자 클릭은 이동 반복을 시작하지 않는다
  } else if (held && (repeatT -= dt) <= 0) {
    repeatT = REPEAT;
    ray.setFromCamera(pointer, camera);
    moveToRay();
  }
  ray.setFromCamera(pointer, camera);
  hovered = pick(world);
}

function moveToRay() {
  if (ray.ray.intersectPlane(ground, hit)) commands.push({ type: 'move', x: hit.x, z: hit.z });
}

// 각 몬스터를 세로 선분(발목~머리)으로 보고, 마우스 광선과 가장 가까운 것을 고른다
// 닫힌 상자를 칸 중심의 낮은 세로 선분으로 보고 마우스 광선에 가장 가까운 것
function pickChest(world: World): number | null {
  let best: number | null = null;
  let bestD = PICK_RADIUS ** 2;
  for (const c of world.chests) {
    if (c.open) continue;
    const d = ray.ray.distanceSqToSegment(a.set(c.x + 0.5, 0, c.z + 0.5), b.set(c.x + 0.5, 0.8, c.z + 0.5));
    if (d < bestD) {
      bestD = d;
      best = c.id;
    }
  }
  return best;
}

function pick(world: World): number | null {
  let best: number | null = null;
  let bestD = PICK_RADIUS ** 2;
  for (const e of world.entities) {
    if (e.kind === 'hero' || e.state === 'dead') continue;
    const d = ray.ray.distanceSqToSegment(a.set(e.x, 0.2, e.z), b.set(e.x, 1.5, e.z));
    if (d < bestD) {
      bestD = d;
      best = e.id;
    }
  }
  return best;
}
