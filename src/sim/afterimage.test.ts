// 잔상 탭(마법사 넷째). 설계: docs/superpowers/specs/2026-11-19-afterimage-tab-design.md
import { expect, test } from 'vitest';
import { roll, syn } from './core';
import { DT, type Command, type SkillId, type World } from './rules';
import { afterimageStat, AFTERIMAGE, createWorld, resMax, isPassive, respec, retraceStat, SKILLS, skillCost, step, swapStat, TREES, useClass } from './world';

const arena = (map: string[], ranks: Partial<Record<SkillId, number>>, keys: Partial<World['keys']> = {}) => {
  const w = createWorld(1, map); useClass(w, 'wizard'); Object.assign(w.ranks, ranks);
  Object.assign(w.keys, { cleave: 'afterimage', dash: 'fireball', shout: null, throw: null }, keys);
  for (const e of w.entities.slice(1)) Object.assign(e, { hp: 1e5, maxHp: 1e5, stunT: 1e9 });
  return w;
};
const runFor = (w: World, sec: number, cmds: Command[] = []) => { w.res = 1000; step(w, cmds); for (let i = Math.round(sec / DT) - 1; i > 0; i--) step(w, []); };
// 주인공 자리에 잔상을 남기고 주인공을 (x, z)로 옮긴다
const leaveAndGo = (w: World, x: number, z: number) => { runFor(w, DT, [{ type: 'skill' }]); Object.assign(w.entities[0], { x, z }); w.skillCd = 0; };

test('마법사는 탭 넷(넷째 = 잔상)', () => {
  expect(TREES.wizard.map((t) => t.name)).toEqual(['화염', '냉기', '번개', '잔상']);
  expect(TREES.wizard[3].skills).toEqual(['afterimage', 'swap', 'lingering', 'retrace']);
  expect(SKILLS.lingering).toEqual({ cls: 'wizard', tab: 3, tier: 2 });
  expect(isPassive('lingering')).toBe(true);
  expect([skillCost('wizard', 'afterimage'), skillCost('wizard', 'swap'), skillCost('wizard', 'retrace')]).toEqual([20, 32, 56]);
});
test('잔상 수치: 1단계 시작값, 5단계', () => {
  const w = arena(['H'], { afterimage: 1, swap: 1, retrace: 1 });
  expect(afterimageStat(w)).toEqual({ cd: 10, time: 6, mult: 0.5, max: 1 });
  expect(swapStat(w).cd).toBe(6);
  expect(swapStat(w).mult).toBeCloseTo(1.5 * syn(w, 'swap'));
  expect(retraceStat(w).memory).toBe(4);
  expect(retraceStat(w).mult).toBeCloseTo(0.8 * syn(w, 'retrace'));
  w.ranks.afterimage = 5;
  expect(afterimageStat(w).time).toBe(8);
  expect(afterimageStat(w).mult).toBeCloseTo(0.7);
  expect(afterimageStat(w).max).toBe(2);
});
test('잔상 남기기: 선 자리에 하나, 새로 남기면 옛것이 사라진다(5단계는 둘)', () => {
  const w = arena(['H.....'], { afterimage: 1 });
  leaveAndGo(w, 3.5, 0.5);
  expect(w.ghosts).toMatchObject([{ kind: 'leave', x: 0.5, z: 0.5, t: expect.closeTo(6, 1) }]);
  leaveAndGo(w, 5.5, 0.5);
  expect(w.ghosts.map((g) => g.x)).toEqual([3.5]);
  w.ranks.afterimage = 5;
  leaveAndGo(w, 1.5, 0.5);
  expect(w.ghosts.map((g) => g.x)).toEqual([3.5, 5.5]);
});
test('굴림: 잔상 몫이면 배율만큼 줄어든다', () => {
  const [a, b] = [arena(['H'], {}), arena(['H'], {})];
  b.ghostScale = 0.5;
  expect(roll(b, b.entities[0])).toBeCloseTo(roll(a, a.entities[0]) * 0.5, -0.5);
});
test('화염구: 잔상이 제 자리에서 같은 조준점으로 쏜다(잔상 몫 표시), 시전 동작은 한 번', () => {
  const w = arena(['H.......m', '.........', '.........'], { afterimage: 1, fireball: 1 });
  leaveAndGo(w, 0.5, 2.5);
  w.casts = 0;
  runFor(w, DT, [{ type: 'dash', x: 8.5, z: 0.5 }]);
  const balls = w.shots.filter((s) => s.kind === 'fireball');
  expect(balls).toHaveLength(2);
  const ghost = balls.find((s) => s.scale === 0.5)!;
  expect(ghost.z).toBeCloseTo(0.5, 1); // 잔상 자리(0.5, 0.5)에서 곧장 오른쪽으로
  expect(ghost.dz).toBeCloseTo(0, 5);
  expect(w.casts).toBe(1);
});
test('서리 고리: 잔상 둘레에서 터지고, 주인공은 잔상 주문에 맞지 않는다', () => {
  const w = arena(['H.........', '..........', '.......m..'], { afterimage: 1, frost: 1 }, { dash: 'frost' });
  leaveAndGo(w, 0.5, 0.5); // 잔상과 주인공이 같은 자리
  Object.assign(w.ghosts[0], { x: 6.5, z: 2.5 }); // 잔상만 적 옆으로
  const [hero, m] = w.entities;
  runFor(w, DT, [{ type: 'dash' }]);
  expect(m.hp).toBeLessThan(m.maxHp);
  expect(hero.hp).toBe(hero.maxHp);
  w.ghosts[0].x = 0.5; // 잔상이 주인공 자리에서 터져도 주인공은 멀쩡하다
  w.dashCd = 0;
  runFor(w, DT, [{ type: 'dash' }]);
  expect(hero.hp).toBe(hero.maxHp);
});
test('마력탄: 잔상도 같은 적에게 쏜다', () => {
  const w = arena(['H.....m', '.......', '.......'], { afterimage: 1 });
  leaveAndGo(w, 0.5, 2.5);
  let ghostBolt = false;
  step(w, [{ type: 'attack', targetId: 1 }]);
  for (let i = 0; i < 120 && !ghostBolt; i++, step(w, [])) ghostBolt = w.shots.some((s) => s.kind === 'bolt' && s.scale === 0.5);
  expect(ghostBolt).toBe(true);
});
test('눈보라: 잔상 둘레에도 같은 시간 깔린다', () => {
  const w = arena(['H.........', '..........', '.......m..'], { afterimage: 1, blizzard: 1 }, { dash: 'blizzard' });
  leaveAndGo(w, 0.5, 0.5);
  Object.assign(w.ghosts[0], { x: 6.5, z: 2.5 });
  const m = w.entities[1];
  runFor(w, DT, [{ type: 'dash' }]);
  expect(w.ghosts[0].aura).toBeCloseTo(6, 1);
  expect(w.auraT).toBeGreaterThan(0);
  runFor(w, 1);
  expect(m.hp).toBeLessThan(m.maxHp);
});
test('마나 방패는 따라 하지 않고 기억하지도 않는다', () => {
  const w = arena(['H....'], { afterimage: 1, ward: 1, retrace: 1 }, { dash: 'ward' });
  leaveAndGo(w, 2.5, 0.5);
  runFor(w, DT, [{ type: 'dash' }]);
  expect(w.ghosts[0].flash).toBe(0);
  expect(w.memos).toEqual([]);
});
test('자리 바꾸기: 가장 최근 잔상과 자리를 바꾸고, 그 사이 적만 맞고 기절한다', () => {
  const w = arena(['H.....m....', '...........', '......m....'], { afterimage: 1, swap: 1 }, { dash: 'swap' });
  leaveAndGo(w, 10.5, 0.5);
  const [hero, on, off] = w.entities;
  for (const e of [on, off]) e.stunT = 0;
  runFor(w, DT, [{ type: 'dash' }]);
  expect([hero.x, hero.z]).toEqual([0.5, 0.5]);
  expect([w.ghosts[0].x, w.ghosts[0].z]).toEqual([10.5, 0.5]);
  expect(on.hp).toBeLessThan(on.maxHp);
  expect(on.stunT).toBeGreaterThan(0.4);
  expect(off.hp).toBe(off.maxHp);
  expect(w.res).toBeLessThan(resMax(w));
  expect(w.swaps).toHaveLength(1);
});
test('자리 바꾸기: 잔상이 없으면 쓰지 않는다(비용·대기 없음), 5단계는 잔상 시간이 처음으로', () => {
  const w = arena(['H....'], { afterimage: 1, swap: 1 }, { dash: 'swap' });
  runFor(w, DT, [{ type: 'dash' }]);
  expect(w.dashCd).toBe(0);
  expect(w.res).toBe(resMax(w));
  w.ranks.swap = 5;
  leaveAndGo(w, 3.5, 0.5);
  runFor(w, 2);
  runFor(w, DT, [{ type: 'dash' }]);
  expect(w.ghosts[0].t).toBeCloseTo(6, 1);
});
test('떠난 자리: 순간이동하면 떠난 자리에 2초짜리 잔상, 배우지 않으면 없다', () => {
  const w = arena(['H.........'], { afterimage: 1 });
  runFor(w, DT, [{ type: 'roll', x: 5.5, z: 0.5 }]);
  expect(w.ghosts).toEqual([]);
  runFor(w, 0.5); // 순간이동 무적이 끝나게
  w.ranks.lingering = 1;
  w.rollCd = 0;
  const [x, z] = [w.entities[0].x, w.entities[0].z];
  runFor(w, DT, [{ type: 'roll', x: 9.5, z: 0.5 }]);
  expect(w.ghosts).toMatchObject([{ kind: 'linger', x, z, t: expect.closeTo(2, 1) }]);
});
test('지나온 길: 쓴 주문을 기억하고(4초), 배우지 않았으면 기억하지 않는다', () => {
  const w = arena(['H.......m'], { fireball: 1 }, { cleave: 'fireball', dash: null });
  runFor(w, DT, [{ type: 'skill', x: 8.5, z: 0.5 }]);
  expect(w.memos).toEqual([]);
  w.ranks.retrace = 1; w.skillCd = 0;
  runFor(w, DT, [{ type: 'skill', x: 8.5, z: 0.5 }]);
  expect(w.memos).toMatchObject([{ id: 'fireball', x: 0.5, z: 0.5, ax: 8.5, az: 0.5 }]);
  runFor(w, 4.1);
  expect(w.memos).toEqual([]);
});
test('지나온 길: 1m 안은 잔상 하나로 묶고, 1초 동안 차례로 서서 다시 쓴다', () => {
  const w = arena(['H.......m'], { fireball: 1, lightning: 1, retrace: 1 }, { cleave: 'retrace', dash: null });
  runFor(w, DT, [{ type: 'skill' }]);
  expect(w.skillCd).toBe(0); // 기억이 없으면 쓰지 않는다
  expect(w.res).toBe(resMax(w));
  w.memos = [
    { id: 'fireball', x: 0.5, z: 0.5, ax: 8.5, az: 0.5, age: 1 },
    { id: 'lightning', x: 1.2, z: 0.5, ax: 8.5, az: 0.5, age: 0.5 },
    { id: 'fireball', x: 4.5, z: 0.5, ax: 8.5, az: 0.5, age: 0 },
  ];
  w.res = resMax(w);
  step(w, [{ type: 'skill' }]);
  expect(w.res).toBeLessThan(resMax(w) - 50);
  step(w, []); // 잔상 처리는 명령보다 먼저라 다음 틱에 선다
  expect(w.ghosts.map((g) => [g.kind, g.queue.length])).toEqual([['retrace', 0], ['retrace', 1]]); // 첫 잔상은 바로 서서 둘을 다시 썼다
  expect(w.ghosts[1].wait).toBeCloseTo(0.5 - DT, 5);
  expect(w.shots.filter((s) => s.kind === 'fireball' && s.scale === retraceStat(w).mult)).toHaveLength(1);
  expect(w.memos).toEqual([]);
  runFor(w, 0.6);
  expect(w.ghosts[1].queue).toEqual([]);
  runFor(w, AFTERIMAGE.stay);
  expect(w.ghosts).toEqual([]);
});
test('지나온 길 잔상은 주인공 주문을 따라 쓰지 않고, 자리 바꾸기 대상도 아니다', () => {
  const w = arena(['H.......m'], { fireball: 1, swap: 1, retrace: 1 }, { cleave: 'retrace', dash: 'swap' });
  w.memos = [{ id: 'fireball', x: 4.5, z: 0.5, ax: 8.5, az: 0.5, age: 0 }];
  runFor(w, DT, [{ type: 'skill' }]);
  runFor(w, DT, [{ type: 'dash' }]);
  expect(w.dashCd).toBe(0);
  expect(w.entities[0].x).toBe(0.5);
});
test('스킬 포인트를 되돌리면 잔상과 기억이 사라진다', () => {
  const w = arena(['H....'], { afterimage: 1, retrace: 1 });
  leaveAndGo(w, 2.5, 0.5);
  w.memos = [{ id: 'fireball', x: 0, z: 0, age: 0 }];
  w.gold = 1e4;
  respec(w);
  expect([w.ghosts, w.memos]).toEqual([[], []]);
});
test('새 판(층 이동·불러오기)은 잔상·기억이 없다', () => {
  const w = createWorld(1, ['H']);
  expect([w.ghosts, w.memos, w.swaps, w.ghostScale]).toEqual([[], [], [], 1]);
});
