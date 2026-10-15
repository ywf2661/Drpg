import { expect, test } from 'vitest';
import { occludes } from './cutaway';

test('주인공을 가리는 벽: 카메라 쪽(+x+z)으로 가깝고 화면 가로로 가까운 벽만', () => {
  const [hx, hz] = [10.5, 10.5];
  expect(occludes(hx, hz, 11, 11)).toBe(true); // 바로 카메라 쪽 대각선
  expect(occludes(hx, hz, 11, 10)).toBe(true); // +x 옆 (a = 0.71, b = 0.71)
  expect(occludes(hx, hz, 10, 11)).toBe(true); // +z 옆
  expect(occludes(hx, hz, 12, 12)).toBe(false); // a = 2.83: 너무 멀다
  expect(occludes(hx, hz, 9, 9)).toBe(false); // 뒤쪽
  expect(occludes(hx, hz, 10, 10)).toBe(false); // 주인공 칸 자체(a = 0)
  expect(occludes(hx, hz, 12, 10)).toBe(false); // b = 1.77: 화면 옆으로 벗어남
  expect(occludes(hx, hz, 11, 9)).toBe(false); // a = 0, 옆
});
