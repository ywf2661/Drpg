import * as THREE from 'three';
import { expect, test } from 'vitest';
import hero from '../assets/sprites/hero.json';
import { createWorld } from '../sim/world';
import { cardGeometry, dirIndex, frameAt, updateSprite, viewHalf } from './sprites';

// 카메라는 +x+z 쪽에서 -x-z를 내려다본다. facing = atan2(dx, dz)
// FLARE 방향 번호(화면 기준): 0=W 1=NW 2=N 3=NE 4=E 5=SE 6=S 7=SW
test.each([
  ['카메라 쪽(+x+z) = 화면 아래 S', Math.atan2(1, 1), 6],
  ['카메라 반대(-x-z) = 화면 위 N', Math.atan2(-1, -1), 2],
  ['+x = 화면 오른쪽 아래 SE', Math.atan2(1, 0), 5],
  ['+z = 화면 왼쪽 아래 SW', Math.atan2(0, 1), 7],
  ['-x = 화면 왼쪽 위 NW', Math.atan2(-1, 0), 1],
  ['-z = 화면 오른쪽 위 NE', Math.atan2(0, -1), 3],
  ['+x-z = 화면 오른쪽 E', Math.atan2(1, -1), 4],
  ['-x+z = 화면 왼쪽 W', Math.atan2(-1, 1), 0],
])('dirIndex: %s', (_, facing, dir) => {
  expect(dirIndex(facing)).toBe(dir);
});

const clip = (loop: 'back_forth' | 'looped' | 'play_once') => ({ row: 0, frames: 4, ms: 400, loop });

test('looped는 마지막 다음에 처음으로', () => {
  expect([0, 0.1, 0.2, 0.3, 0.4, 0.55].map((t) => frameAt(clip('looped'), t))).toEqual([0, 1, 2, 3, 0, 1]);
});

test('play_once는 마지막 프레임에 머문다', () => {
  expect([0, 0.25, 0.39, 0.4, 5].map((t) => frameAt(clip('play_once'), t))).toEqual([0, 2, 3, 3, 3]);
});

test('back_forth는 0→3→0 왕복', () => {
  expect([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7].map((t) => frameAt(clip('back_forth'), t))).toEqual([0, 1, 2, 3, 2, 1, 0, 1]);
});

test('카드: 발 기준선 위는 서고, 아래(발끝·그림자·시체)는 카메라 쪽 바닥에 눕는다', () => {
  const [, ch] = hero.cell;
  const [, ay] = hero.anchor;
  const pos = cardGeometry(hero as never).attributes.position;
  const uv = cardGeometry(hero as never).attributes.uv;
  const ys = Array.from({ length: pos.count }, (_, i) => pos.getY(i));
  const zs = Array.from({ length: pos.count }, (_, i) => pos.getZ(i));
  expect(Math.min(...ys)).toBeGreaterThan(0); // 바닥 아래로 내려가는 부분이 없다
  expect(Math.max(...ys)).toBeCloseTo(0.01 + ay / 30 / Math.cos(Math.PI / 6), 5);
  expect(Math.max(...zs)).toBeCloseTo((ch - ay) / 30 / Math.sin(Math.PI / 6), 5); // 화면에서 텍셀 높이가 같게
  const foot = ys.findIndex((y, i) => Math.abs(y - 0.01) < 1e-9 && Math.abs(zs[i]) < 1e-9);
  expect(uv.getY(foot)).toBeCloseTo(1 - ay / ch, 5);
});

test('시체는 아래 층(깊이 기록 없음)에, 산 캐릭터는 그 위에 그린다', () => {
  const w = createWorld(1, ['H.m']);
  const mat = new THREE.MeshBasicMaterial({ map: new THREE.Texture() });
  const s = { mesh: new THREE.Mesh(cardGeometry(hero as never), mat), mat, info: hero as never, anim: 'stance' as const, t: 0, hp: 30, hitT: 0 };
  const m = w.entities[1];
  updateSprite(s, m, 0.016);
  expect([s.mesh.renderOrder, s.mat.depthWrite]).toEqual([2, true]);
  m.state = 'dead';
  updateSprite(s, m, 0.016);
  expect([s.mesh.renderOrder, s.mat.depthWrite]).toEqual([1, false]);
});

test('화면 범위는 항상 렌더 픽셀 30개 = 1m', () => {
  expect(viewHalf(640, 360)).toEqual([640 / 60, 6]);
  expect(viewHalf(390, 844)).toEqual([6.5, 844 / 60]);
});
