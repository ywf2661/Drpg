import { expect, test } from 'vitest';
import { FLOORS, generateFloor } from './dungeon';
import { findPath } from './path';
import { createWorld, DT, step, type Command, type World } from './world';

const run = (w: World, sec: number, cmds: Command[] = []) => {
  step(w, cmds);
  for (let i = Math.round(sec / DT) - 1; i > 0; i--) step(w, []);
};
const reach = (w: World, x: number, z: number) => findPath(w.grid, [0, 0], [x, z]) !== null;

test('사슬 문은 닫힌 동안 길을 막고, 도끼가 맞으면 열린다', () => {
  const w = createWorld(1, ['H..D..', '######']);
  expect(w.gates).toEqual([{ id: 0, x: 3, z: 0, axis: 'x', open: false }]);
  expect(reach(w, 5, 0)).toBe(false);
  step(w, [{ type: 'move', x: 5.5, z: 0.5 }]);
  expect(w.entities[0].state).toBe('idle'); // 길이 없어 움직이지 않는다
  run(w, 0.4, [{ type: 'throw', x: 5.5, z: 0.5 }]);
  expect(w.gates[0].open).toBe(true);
  expect(w.shots).toEqual([]); // 도끼는 문에서 멈춘다
  expect(w.blasts.some((b) => b.kind === 'slam')).toBe(true);
  expect(reach(w, 5, 0)).toBe(true);
});

test('붙어 있는 문(2칸 폭 복도)은 하나만 맞혀도 함께 열리고, 떨어진 문은 그대로', () => {
  const w = createWorld(1, ['H..D..D', '...D...']);
  expect(w.gates.map((g) => g.axis)).toEqual(['x', 'x', 'x']);
  run(w, 1, [{ type: 'throw', x: 5.5, z: 0.5 }]);
  expect(w.gates.map((g) => g.open)).toEqual([true, false, true]);
});

test('세로 통로의 문은 axis z, 벽에 던진 도끼나 다른 스킬로는 열리지 않는다', () => {
  const w = createWorld(1, ['#H#', '#.#', '#D#', '#.#']);
  expect(w.gates[0].axis).toBe('z');
  run(w, 1, [{ type: 'throw', x: 5, z: 0.5 }]); // 옆 벽으로
  run(w, 1, [{ type: 'dash', x: 1.5, z: 3.5 }, { type: 'skill', x: 1.5, z: 3.5 }]);
  run(w, 1, [{ type: 'shout' }]);
  expect(w.gates[0].open).toBe(false);
});

test('조준 없이 던지면 바로 앞의 닫힌 문을 겨눈다(모바일 버튼), 적이 더 가까우면 적을', () => {
  const w = createWorld(1, ['H.D.']);
  w.entities[0].facing = -Math.PI / 2; // 문 반대쪽을 보고 있어도
  run(w, 1, [{ type: 'throw' }]);
  expect(w.gates[0].open).toBe(true);
  const v = createWorld(1, ['Hm.D.']);
  Object.assign(v.entities[1], { hp: 1e5, maxHp: 1e5, stunT: 1e9 });
  run(v, 1, [{ type: 'throw' }]);
  expect(v.entities[1].hp).toBeLessThan(1e5);
  expect(v.gates[0].open).toBe(false);
});

// 문을 못 지난다고 볼 때 주인공에게서 걸어서 닿는 칸
function walk(map: string[], pass: string) {
  const w = map[0].length;
  const i0 = map.join('').indexOf('H');
  const seen = new Set([i0]);
  const q = [i0];
  for (let i = 0; i < q.length; i++)
    for (const n of [q[i] + 1, q[i] - 1, q[i] + w, q[i] - w]) {
      const c = map.join('')[n];
      if (c && !('#Boc' + pass).includes(c) && !seen.has(n)) (seen.add(n), q.push(n));
    }
  return seen;
}

test('시드 1~50: 2~4층 계단은 문을 열어야 닿고(막을 수 있는 방일 때), 1층·보스 층은 그냥 닿는다. 보물 방에는 상자 둘', { timeout: 30_000 }, () => {
  let gated = 0;
  let vaults = 0;
  for (let seed = 1; seed <= 50; seed++) {
    for (let floor = 1; floor <= FLOORS; floor++) {
      const map = generateFloor(seed, floor);
      const text = map.join('');
      const goal = text.indexOf(floor < FLOORS ? '>' : 'M');
      const open = walk(map, 'D');
      if (floor === 1 || floor === FLOORS) expect(open.has(goal)).toBe(true);
      else if (!open.has(goal)) gated++;
      expect(walk(map, '').has(goal)).toBe(true); // 문을 열면 언제나 닿는다
      // 문 없이는 못 닿는 칸에 놓인 상자 = 보물 방의 상자
      const locked = [...text].filter((c, i) => c === 'c' && ![i + 1, i - 1, i + 48, i - 48].some((n) => open.has(n))).length;
      if (locked >= 2) vaults++;
      // 몬스터는 문 칸에 서지 않고, 주인공은 갇혀 있지 않다
      expect(open.size).toBeGreaterThan(20);
    }
  }
  expect(gated).toBeGreaterThanOrEqual(100); // 150개 층 중 대부분
  expect(vaults).toBeGreaterThanOrEqual(200); // 250개 층 중 대부분
});
