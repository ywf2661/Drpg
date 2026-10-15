import { expect, test } from 'vitest';
import { dirIndex, frameAt } from './sprites';

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
