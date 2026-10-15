import { expect, test } from 'vitest';
import { floorVariant, wallVariant } from './props';

test('바닥 변형: 같은 칸은 같은 변형, 대부분 평바닥(0~3)이고 금 간 바닥(4~7)도 섞인다', () => {
  const counts = Array(8).fill(0);
  for (let z = 0; z < 48; z++) for (let x = 0; x < 48; x++) counts[floorVariant(x, z)]++;
  expect(floorVariant(5, 9)).toBe(floorVariant(5, 9));
  const plain = counts.slice(0, 4).reduce((a, b) => a + b);
  expect(plain / (48 * 48)).toBeGreaterThan(0.7);
  expect(plain / (48 * 48)).toBeLessThan(0.9);
  expect(counts.every((n) => n > 0)).toBe(true);
});

test('벽 변형: 같은 칸은 같은 변형, 변형이 고루 쓰인다(1개면 늘 0)', () => {
  const counts = Array(4).fill(0);
  for (let z = 0; z < 48; z++) for (let x = 0; x < 48; x++) counts[wallVariant(x, z, 4)]++;
  expect(wallVariant(7, 3, 4)).toBe(wallVariant(7, 3, 4));
  expect(counts.every((n) => n > 400)).toBe(true);
  expect(wallVariant(7, 3, 1)).toBe(0);
});
