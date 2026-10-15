import { expect, test } from 'vitest';
import { findPath, walkable, type Cell, type Grid } from './path';

const grid = (rows: string[]): Grid => ({
  w: rows[0].length,
  h: rows.length,
  blocked: Uint8Array.from(rows.join(''), (c) => (c === '#' ? 1 : 0)),
});

// 연속한 칸이 8방향으로 한 칸씩이고, 벽을 밟거나 벽 모서리를 대각선으로 가로지르지 않는지 확인
function expectValid(g: Grid, p: Cell[]) {
  for (let i = 1; i < p.length; i++) {
    const [ax, az] = p[i - 1];
    const [bx, bz] = p[i];
    expect(Math.max(Math.abs(bx - ax), Math.abs(bz - az))).toBe(1);
    expect(walkable(g, bx, bz)).toBe(true);
    if (ax !== bx && az !== bz) expect(walkable(g, bx, az) && walkable(g, ax, bz)).toBe(true);
  }
}

test('벽을 돌아가는 최단 경로를 찾는다', () => {
  const g = grid(['.....', '.###.', '.....']);
  const p = findPath(g, [0, 1], [4, 1])!;
  expect(p[0]).toEqual([0, 1]);
  expect(p.at(-1)).toEqual([4, 1]);
  expect(p).toHaveLength(7);
  expectValid(g, p);
});

test('열린 공간에서는 대각선으로 간다', () => {
  const g = grid(['...', '...', '...']);
  expect(findPath(g, [0, 0], [2, 2])).toEqual([[0, 0], [1, 1], [2, 2]]);
});

test('시작과 목표가 같으면 그 칸 하나', () => {
  const g = grid(['...', '...']);
  expect(findPath(g, [1, 1], [1, 1])).toEqual([[1, 1]]);
});

test('목표가 벽이면 null', () => {
  const g = grid(['.#.', '...']);
  expect(findPath(g, [0, 0], [1, 0])).toBeNull();
});

test('막힌 방 안의 목표는 null', () => {
  const g = grid(['.....', '.###.', '.#.#.', '.###.']);
  expect(findPath(g, [0, 0], [2, 2])).toBeNull();
});

test('맵 밖 좌표는 walkable이 아니다', () => {
  const g = grid(['..', '..']);
  expect(walkable(g, -1, 0)).toBe(false);
  expect(walkable(g, 2, 0)).toBe(false);
  expect(walkable(g, 0, Number.NaN)).toBe(false);
});

test('48x48 빈 맵: 대각선 끝까지 48칸 최단 경로', () => {
  const g = grid(Array(48).fill('.'.repeat(48)));
  const p = findPath(g, [0, 0], [47, 47])!;
  expect(p).toHaveLength(48);
  expectValid(g, p);
});

test('48x48 막힌 목표는 null', () => {
  const rows = Array(48).fill('.'.repeat(48));
  rows[46] = '.'.repeat(45) + '###';
  rows[47] = '.'.repeat(45) + '#.#';
  expect(findPath(grid(rows), [0, 0], [46, 47])).toBeNull();
});
