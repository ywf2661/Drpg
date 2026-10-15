import { expect, test } from 'vitest';
import { reveal, toMap } from './automap';

test('reveal: 반경 안의 칸(중심 기준)만 기록하고 맵 밖은 무시한다', () => {
  const w = 10;
  const h = 6;
  const seen = new Uint8Array(w * h);
  reveal(seen, w, h, 0.5, 0.5, 2); // 왼쪽 위 구석
  const at = (x: number, z: number) => seen[z * w + x];
  expect(at(0, 0)).toBe(1);
  expect(at(2, 0)).toBe(1); // 중심 거리 2
  expect(at(3, 0)).toBe(0);
  expect(at(1, 1)).toBe(1);
  expect(at(2, 2)).toBe(0); // 중심 거리 2.83
  expect(seen.reduce((a, b) => a + b, 0)).toBe(6); // (0,0)(1,0)(2,0)(0,1)(1,1)(0,2)
  reveal(seen, w, h, 9.5, 5.5, 0.4);
  expect(at(9, 5)).toBe(1);
});

test('toMap: 주인공이 가운데, 화면처럼 +x는 오른쪽 아래, +z는 왼쪽 아래, 세로는 절반', () => {
  expect(toMap(5, 5, 5, 5, 4)).toEqual([0, 0]);
  expect(toMap(6, 5, 5, 5, 4)).toEqual([4, 2]);
  expect(toMap(5, 6, 5, 5, 4)).toEqual([-4, 2]);
  expect(toMap(4, 4, 5, 5, 4)).toEqual([0, -4]);
});
