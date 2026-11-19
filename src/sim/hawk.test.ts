// 매 탭(궁수 넷째). 설계: docs/superpowers/specs/2026-11-19-hawk-tab-design.md
import { expect, test } from 'vitest';
import { hurt } from './core';
import { DT, type Command, type SkillId, type World } from './rules';
import { createWorld, flockStat, HAWK, isPassive, resMax, respec, SKILLS, skillCost, step, swoopStat, TREES, useClass } from './world';

const arena = (map: string[], ranks: Partial<Record<SkillId, number>>, keys: Partial<World['keys']> = {}) => {
  const w = createWorld(1, map); useClass(w, 'ranger'); Object.assign(w.ranks, { swoop: 1 }, ranks);
  Object.assign(w.keys, { cleave: 'swoop', dash: null, shout: null, throw: null }, keys);
  for (const e of w.entities.slice(1)) Object.assign(e, { hp: 1e5, maxHp: 1e5, stunT: 1e9 });
  return w;
};
const runFor = (w: World, sec: number, cmds: Command[] = []) => { w.res = 1000; step(w, cmds); for (let i = Math.round(sec / DT) - 1; i > 0; i--) step(w, []); };
const hurtOf = (w: World, i: number) => w.entities[i].maxHp - w.entities[i].hp;

test('궁수는 탭 넷(넷째 = 매)', () => {
  expect(TREES.ranger.map((t) => t.name)).toEqual(['사격', '사냥', '하늘', '매']);
  expect(TREES.ranger[3].skills).toEqual(['swoop', 'ride', 'assist', 'flock']);
  expect(SKILLS.assist).toEqual({ cls: 'ranger', tab: 3, tier: 2 });
  expect(isPassive('assist')).toBe(true);
  expect([skillCost('ranger', 'swoop'), skillCost('ranger', 'ride'), skillCost('ranger', 'flock')]).toEqual([16, 24, 36]);
});
test('매는 덮쳐라를 배운 궁수에게만, 주인공 곁에서 맴돈다. 되돌리면 사라진다', () => {
  const none = arena(['H....'], { swoop: 0 });
  runFor(none, 0.5);
  expect(none.hawk).toBeNull();
  const w = arena(['H....'], {});
  runFor(w, 1);
  const [h, hero] = [w.hawk!, w.entities[0]];
  expect(h.mode).toBe('orbit');
  expect(Math.hypot(h.x - hero.x, h.z - hero.z)).toBeCloseTo(HAWK.r, 0);
  expect(h.y).toBeCloseTo(HAWK.h, 1);
  w.gold = 1e4;
  respec(w);
  runFor(w, DT);
  expect(w.hawk).toBeNull();
  expect(createWorld(1, ['H']).hawk).toBeNull();
});
test('쪼기: 1.5초마다 가까운 적에게 날아가 닿는 순간 약한 피해', () => {
  const w = arena(['H...m'], {});
  runFor(w, HAWK.every + DT);
  expect(w.hawk).toMatchObject({ mode: 'peck', target: 1 });
  expect(hurtOf(w, 1)).toBe(0); // 아직 닿기 전
  runFor(w, 1.2);
  expect(hurtOf(w, 1)).toBeGreaterThan(0);
  expect(hurtOf(w, 1)).toBeLessThan(10);
});
test('쪼기: 주인공이 공격 중인 적이 먼저', () => {
  const w = arena(['H...m..m'], {});
  w.entities[0].target = 2; // 먼 적(7m)을 노리는 중
  runFor(w, HAWK.every + DT);
  expect(w.hawk).toMatchObject({ mode: 'peck', target: 2 });
});
test('덮쳐라: 조준점에 가까운 적에게 날아가 닿는 순간 피해·기절, 적이 없으면 쓰지 않는다', () => {
  const w = arena(['H...m', '.....', '....m'], {});
  for (const e of w.entities.slice(1)) e.stunT = 0;
  runFor(w, DT, [{ type: 'skill', x: 4.5, z: 2.5 }]);
  expect(w.hawk).toMatchObject({ mode: 'dive', target: 2, stun: 1 });
  expect(w.hawk!.mult).toBeCloseTo(swoopStat(w).mult);
  expect(hurtOf(w, 2)).toBe(0);
  runFor(w, 0.8);
  expect(hurtOf(w, 2)).toBeGreaterThan(0);
  expect(w.entities[2].stunT).toBeGreaterThan(0);
  expect(hurtOf(w, 1)).toBe(0);
  const empty = arena(['H....'], {});
  runFor(empty, DT, [{ type: 'skill' }]);
  expect(empty.skillCd).toBe(0);
  expect(empty.res).toBe(resMax(empty));
});
test('덮쳐라 5단계: 덮친 자리 둘레 적도 기절, 대상이 도중에 죽으면 피해 없이 돌아온다', () => {
  const w = arena(['H....mm'], { swoop: 5 });
  for (const e of w.entities.slice(1)) e.stunT = 0;
  runFor(w, 0.8, [{ type: 'skill', x: 5.5, z: 0.5 }]);
  expect(w.entities[2].stunT).toBeGreaterThan(0);
  const v = arena(['H....m'], {});
  runFor(v, DT, [{ type: 'skill' }]);
  Object.assign(v.entities[1], { state: 'dead' });
  const hp = v.entities[1].hp;
  runFor(v, 0.8);
  expect(v.entities[1].hp).toBe(hp);
  expect(v.hawk!.mode).toBe('orbit');
});
test('매 타기: 조준한 쪽으로 6m를 0.6초에, 그동안 무적, 지나는 길의 적마다 화살 한 번', () => {
  const w = arena(['H..m.....m'], { ride: 1 }, { dash: 'ride' });
  const hero = w.entities[0];
  runFor(w, DT, [{ type: 'dash', x: 9.5, z: 0.5 }]);
  expect(hero.phase).toBe('ride');
  expect(w.hawk!.mode).toBe('carry');
  expect(hurt(w, hero, 50)).toBe(0); // 무적
  runFor(w, HAWK.time);
  expect(hero.phase).toBe('none');
  expect(hero.x).toBeCloseTo(6.5, 0);
  expect(w.rideHit).toEqual([1]);
  expect(hurtOf(w, 1)).toBeGreaterThan(0);
  expect(hurtOf(w, 2)).toBe(0);
  expect(w.hawk!.mode).toBe('orbit');
});
test('매 타기: 벽 앞에서 멈추고, 5단계는 내려앉으며 매가 가까운 적을 덮친다', () => {
  const w = arena(['H...#.....'], { ride: 1 }, { dash: 'ride' });
  runFor(w, 1, [{ type: 'dash', x: 9.5, z: 0.5 }]);
  expect(w.entities[0].x).toBeLessThan(4);
  const v = arena(['H.......m.'], { ride: 5 }, { dash: 'ride' });
  runFor(v, HAWK.time + 2 * DT, [{ type: 'dash', x: 6.5, z: 0.5 }]);
  expect(v.hawk).toMatchObject({ mode: 'dive', target: 1 });
});
test('협공: 스킬 화살에 맞은 적 중 가장 센 적에게 매가 덮친다(1초에 한 번), 평타 화살은 아니다', () => {
  const w = arena(['H....m.', '.....m.'], { rain: 1, assist: 1 }, { dash: 'rain' });
  w.entities[2].maxHp = 2e5;
  runFor(w, 0.8, [{ type: 'dash', x: 5.5, z: 1 }]); // 화살비가 둘을 한꺼번에 맞힌다
  expect(w.hawk!.target).toBe(2);
  expect(w.hawk!.mult).toBeCloseTo(swoopStat(w).mult * 0.5);
  expect(w.hawk!.assistT).toBeGreaterThan(0);
  const plain = arena(['H..m'], { assist: 1 });
  plain.entities[1].stunT = 1e9;
  step(plain, [{ type: 'attack', targetId: 1 }]);
  let dove = false;
  for (let i = 0; i < 60; i++, step(plain, [])) dove ||= plain.hawk?.mode === 'dive';
  expect(dove).toBe(false);
});
test('협공은 매가 덮치는 중이면 걸리지 않는다', () => {
  const w = arena(['H..m..m..'], { pierce: 1, assist: 1 }, { cleave: 'swoop', dash: 'pierce' });
  runFor(w, DT, [{ type: 'skill', x: 6.5, z: 0.5 }]);
  runFor(w, 0.2, [{ type: 'dash', x: 8.5, z: 0.5 }]);
  expect(w.hawk!.target).toBe(2);
  expect(w.hawk!.mult).toBeCloseTo(swoopStat(w).mult);
});
test('매 떼: 다섯이 둘레 적을 두 번씩 덮치고, 적이 없으면 쓰지 않는다', () => {
  const w = arena(['H..m.m.', '.......', '...m.m.'], { flock: 1 }, { cleave: 'flock' });
  runFor(w, DT, [{ type: 'skill' }]);
  expect(w.flock).toHaveLength(flockStat(w).count - 1);
  expect(w.hawk).toMatchObject({ mode: 'dive', dives: 2 });
  runFor(w, 4);
  for (let i = 1; i <= 4; i++) expect(hurtOf(w, i)).toBeGreaterThan(0);
  expect(w.flock).toEqual([]);
  expect(w.hawk!.mode).not.toBe('dive');
  const empty = arena(['H....'], { flock: 1 }, { cleave: 'flock' });
  runFor(empty, DT, [{ type: 'skill' }]);
  expect(empty.skillCd).toBe(0);
});
