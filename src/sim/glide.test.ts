// 흐르는 깃의 갑옷(2막 엔딩 보상): 구르기가 활강 — 물·허공·소품 위를 6m 날아가고, 벽·닫힌 문은 못 넘는다. 막힌 곳에 내리면 가장 가까운 평지로
import { expect, test } from 'vitest';
import { createWorld, step, DT, type World } from './world';
import { makeUnique } from './core';

const run = (w: World, sec: number, cmds: Parameters<typeof step>[1] = []) => {
  step(w, cmds);
  for (let i = 1; i < sec / DT; i++) step(w, []);
};
const wings = (w: World) => {
  w.mods.armor = makeUnique(w, 'flowWings', 0, 0, 4).affixes!;
  return w;
};
// 주인공은 x 1.5, 행 글자는 x 2부터. 오른쪽으로 구른다
const glide = (row: string, worn = true) => {
  const w = createWorld(1, ['##############', `#H${row}#`, '##############']);
  if (worn) wings(w);
  run(w, 1.2, [{ type: 'roll', x: 12.5, z: 1.5 }]);
  return w.entities[0];
};

test('활강: 물(u)·큰 소품(o) 너머로 6m 날아간다. 갑옷이 없으면 구르기는 물 앞에서 멈춘다', () => {
  expect(glide('.uuo........').x).toBeGreaterThan(6.5);
  expect(glide('.uuo........', false).x).toBeLessThan(3); // 물 칸(x 3) 앞
});

test('활강: 벽(#)은 못 넘는다 — 그 앞에서 내린다', () => {
  expect(glide('..#.........').x).toBeLessThan(4); // 벽 칸(x 4) 앞
});

test('활강: 물 위에서 끝나면 가장 가까운 평지로 내려앉는다', () => {
  const h = glide('..uuuuuuuu..');
  const c = Math.floor(h.x);
  expect(c === 3 || c >= 12).toBe(true); // 물 칸(4~11)이 아닌 가장 가까운 곳
});
