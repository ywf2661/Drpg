// 마우스 입력 → sim 명령. 몬스터 위 클릭은 attack, 땅 클릭·누르고 있기는 move.
import * as THREE from 'three';
import { camera, markMove, renderer } from './render/render';
import { walkable } from './sim/path';
import type { Command, World } from './sim/world';

const REPEAT = 0.15; // 누르고 있을 때 move 재발행 간격(초)
const PICK_RADIUS = 0.5; // 몬스터·상자 선택 판정 반경(m)
const PICK_TOUCH = 0.9; // 터치는 넓게: 0.5m는 휴대폰에서 폭 약 32px이라 손가락(44px 이상)으로 누르기 어렵다
const ray = new THREE.Raycaster();
const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
// 조준은 가슴 높이 평면으로: 바닥으로 재면 몬스터 몸통을 가리킬 때 그 뒤쪽 바닥이 잡혀, 가까운 적일수록 방향이 20~45° 틀어진다
const chest = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.9);
const pointer = new THREE.Vector2();
const clickAt = new THREE.Vector2(); // 누른 순간의 위치. 다음 프레임 전에 커서가 움직여도 이 위치로 판정
const hit = new THREE.Vector3();
const a = new THREE.Vector3();
const b = new THREE.Vector3();
let held = false;
let hasPointer = false; // 마우스가 캔버스 위를 움직인 적이 있는가
let clicked = false;
let repeatT = 0;
let pickRadius = PICK_RADIUS; // 마지막 입력이 터치면 PICK_TOUCH

export const commands: Command[] = [];
export let hovered: number | null = null;
// 조준 중인 스킬(롤의 일반 시전): 궤적을 보여 주다가 좌클릭에 발사, 우클릭·Esc에 취소
export type AimCmd = 'skill' | 'dash' | 'shout' | 'throw' | 'roll'; // 조준할 수 있는 명령(Q W E R, 구르기는 터치로 끌 때만)
export let aiming: AimCmd | null = null;
let fire = false; // 조준 중 좌클릭: 다음 pollInput에서 발사
// 공격 이동(스타크래프트의 A): A를 누른 뒤 좌클릭한 곳으로 가면서 가까운 적을 공격. 우클릭·Esc에 취소
export let amoving = false;
export const startAim = (s: AimCmd) => ((amoving = false), (aiming = s));
export const startAmove = () => ((aiming = null), (amoving = true));
export const cancelAim = () => ((aiming = null), (amoving = false));
// 스킬 명령을 넣기 전 확인(main: 기력·마나가 모자라면 알리고 false). 우클릭·조준 발사가 거친다
let skillGate: (cmd: AimCmd) => boolean = () => true;
export const setSkillGate = (f: (cmd: AimCmd) => boolean) => (skillGate = f);
// 조준한 스킬을 커서 쪽으로 쓴다(마우스가 없으면 sim의 자동 조준)
export function fireAim() {
  if (aiming && skillGate(aiming)) commands.push({ type: aiming, ...(aim() ?? {}) });
  aiming = null;
}
let hoveredAt: { x: number; z: number } | null = null; // 커서가 가리키는 몬스터(조준은 그 몬스터로)
const DRAG_MIN = 12; // 버튼을 이만큼(px) 끌어야 조준. 덜 움직이면 탭(자동 조준)
const DRAG_GAIN = 3; // 끈 거리 × 3 = 주인공에서 조준점까지 화면 거리(약 30px/m라 70px 끌면 약 7m)
let dragging = false; // 터치로 버튼을 끌어 조준 중: 가상 커서가 주인공 기준으로 움직인다
let heroAt = { x: 0, z: 0 };
const v = new THREE.Vector3();

// 터치: 스킬 버튼을 누른 채 끌면 궤적이 보이고, 놓으면 끈 방향으로 쓴다. 끌지 않고 떼면 원래 click(자동 조준)
export function dragAim(el: HTMLElement, cmd: AimCmd, canAim: () => boolean) {
  let sx = 0;
  let sy = 0;
  let id: number | null = null;
  let moved = false;
  el.addEventListener('pointerdown', (e) => {
    moved = false;
    if (e.pointerType !== 'touch' || (e.target as Element).closest('.up, .trait')) return;
    [sx, sy, id] = [e.clientX, e.clientY, e.pointerId];
    el.setPointerCapture(e.pointerId);
  });
  el.addEventListener('pointermove', (e) => {
    if (e.pointerId !== id) return;
    const [dx, dy] = [e.clientX - sx, e.clientY - sy];
    if (!moved) {
      if (Math.hypot(dx, dy) < DRAG_MIN || !canAim()) return;
      moved = dragging = true;
      startAim(cmd);
    }
    const r = renderer.domElement.getBoundingClientRect();
    v.set(heroAt.x, 0.9, heroAt.z).project(camera);
    pointer.set(v.x + (dx * DRAG_GAIN * 2) / r.width, v.y - (dy * DRAG_GAIN * 2) / r.height);
  });
  const end = (fire: boolean) => (e: PointerEvent) => {
    if (e.pointerId !== id) return;
    id = null;
    if (!moved) return;
    if (fire && aiming === cmd) fireAim();
    else cancelAim();
    dragging = false;
  };
  el.addEventListener('pointerup', end(true));
  el.addEventListener('pointercancel', end(false)); // 시스템 제스처: 쓰지 않고 취소
  el.addEventListener('click', (e) => moved && e.stopImmediatePropagation(), true); // 끌어서 쓴 뒤의 click은 삼킨다(두 번 쓰지 않게)
}

export function initInput() {
  const el = renderer.domElement;
  el.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') hasPointer = true;
    if (!dragging) setPointer(e); // 버튼을 끄는 동안 다른 손가락이 조준점을 옮기지 않게
  });
  el.addEventListener('contextmenu', (e) => e.preventDefault()); // 우클릭 = 가르기
  el.addEventListener('pointerdown', (e) => {
    if (aiming) {
      setPointer(e);
      if (e.button === 0) fire = true;
      else if (e.button === 2) aiming = null; // 취소(가르기는 나가지 않는다)
      return;
    }
    if (amoving && e.button !== 0) return void (amoving = false);
    if (e.button === 2) {
      setPointer(e);
      ray.setFromCamera(pointer, camera);
      if (skillGate('skill') && ray.ray.intersectPlane(chest, hit)) commands.push({ type: 'skill', x: hit.x, z: hit.z });
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
  pickRadius = e.pointerType === 'touch' ? PICK_TOUCH : PICK_RADIUS;
  const r = renderer.domElement.getBoundingClientRect();
  pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
}

// paused: 창을 보는 동안은 명령을 쌓지 않고 누름도 푼다(닫은 뒤 옛 지점으로 걸어가지 않게)
export function pollInput(world: World, dt: number, paused: boolean) {
  if (paused) {
    held = clicked = fire = amoving = false;
    aiming = null;
    hovered = hoveredAt = null;
    dragging = false;
    return;
  }
  heroAt = world.entities[0];
  ray.setFromCamera(pointer, camera);
  hovered = pick(world);
  hoveredAt = hovered === null ? null : world.entities[hovered];
  if (fire) {
    fire = false;
    fireAim();
    return;
  }
  if (clicked) {
    // 프레임 사이에 눌렀다 뗀 짧은 클릭도 한 번은 처리한다
    clicked = false;
    repeatT = REPEAT;
    ray.setFromCamera(clickAt, camera);
    const id = pick(world);
    const chest = id === null ? pickChest(world) : null;
    if (id !== null) commands.push({ type: 'attack', targetId: id });
    else if (chest !== null) commands.push({ type: 'open', chestId: chest });
    else if (moveToRay(amoving ? 'amove' : 'move') && walkable(world.grid, Math.floor(hit.x), Math.floor(hit.z))) markMove(hit.x, hit.z); // 누른 순간 그 자리에 표시(끌고 있는 동안은 다시 띄우지 않는다)
    if (id !== null || chest !== null || amoving) held = false; // 몬스터·상자 클릭·공격 이동은 이동 반복을 시작하지 않는다
    amoving = false;
  } else if (held && (repeatT -= dt) <= 0) {
    repeatT = REPEAT;
    ray.setFromCamera(pointer, camera);
    moveToRay();
  }
}

// 커서가 가리키는 곳(스킬·구르기 조준): 몬스터 위면 그 몬스터, 아니면 가슴 높이 지점. 마우스도 버튼 끌기도 없으면(모바일 탭) null
export function aim(): { x: number; z: number } | null {
  if (!hasPointer && !dragging) return null;
  if (hoveredAt) return { x: hoveredAt.x, z: hoveredAt.z };
  ray.setFromCamera(pointer, camera);
  return ray.ray.intersectPlane(chest, hit) ? { x: hit.x, z: hit.z } : null;
}

function moveToRay(type: 'move' | 'amove' = 'move'): boolean {
  if (!ray.ray.intersectPlane(ground, hit)) return false;
  commands.push({ type, x: hit.x, z: hit.z });
  return true;
}

// 각 몬스터를 세로 선분(발목~머리)으로 보고, 마우스 광선과 가장 가까운 것을 고른다
// 닫힌 상자를 칸 중심의 낮은 세로 선분으로 보고 마우스 광선에 가장 가까운 것
function pickChest(world: World): number | null {
  let best: number | null = null;
  let bestD = pickRadius ** 2;
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
  let bestD = pickRadius ** 2;
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
