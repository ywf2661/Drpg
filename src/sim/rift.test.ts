// 세트 「틈에서 나온 자」(설계: docs/superpowers/specs/2026-11-25-act2-loot-growth-design.md 3)
import { expect, test } from 'vitest';
import { skillHit } from './core';
import { CUT, DT, RIFT, type Command, type SkillId, type UniqueId, type World } from './rules';
import { createWorld, rollUnique, setCount, step, uniqueOf, useClass, UNIQUES } from './world';

const RIFT_SET: UniqueId[] = ['riftWeapon', 'riftArmor', 'riftHelm', 'riftBoots'];
const wear = (w: World, n: number) => RIFT_SET.slice(0, n).forEach((u) => (w.mods[UNIQUES[u].slot] = [{ kind: 'unique', value: 0, u }]));
const runFor = (w: World, sec: number, cmds: Command[] = []) => { w.res = 1000; step(w, cmds); for (let i = Math.round(sec / DT) - 1; i > 0; i--) step(w, []); };

test('세트 조각 수는 세트마다 따로 센다', () => {
  const w = createWorld(1, ['H']);
  wear(w, 3);
  w.mods.boots = [{ kind: 'unique', value: 0, u: 'hunterBoots' }];
  expect([setCount(w, 'rift'), setCount(w, 'hunter'), setCount(w)]).toEqual([3, 1, 1]);
});

test('2막 땅에서만 틈에서 나온 자 조각이 나온다', () => {
  let got = 0;
  for (let s = 1; s <= 300; s++) {
    const w = createWorld(s, ['H']);
    w.land = 'lake';
    const u = uniqueOf({ affixes: rollUnique(w, 0, 0, 4).affixes! })!;
    if (UNIQUES[u].set) (expect(UNIQUES[u].set).toBe('rift'), got++);
    const a = createWorld(s, ['H']);
    a.land = 'ruins';
    expect(UNIQUES[uniqueOf({ affixes: rollUnique(a, 0, 0, 4).affixes! })!].set).not.toBe('rift');
  }
  expect(got).toBeGreaterThan(0);
});

test('결빙의 궤적: 2부위면 스킬이 맞힌 적 발밑에 얼음 궤적, 적마다 하나, 터지면 피해 + 얼림(다시 궤적을 만들지 않는다)', () => {
  const one = createWorld(1, ['H.m']);
  wear(one, 1);
  skillHit(one, one.entities[1], 10);
  expect(one.cuts).toEqual([]);
  const w = createWorld(1, ['H.m']);
  wear(w, 2);
  const e = w.entities[1];
  Object.assign(e, { hp: 1e4, maxHp: 1e4 });
  skillHit(w, e, 10);
  skillHit(w, e, 10);
  expect(w.cuts.filter((c) => c.src === 'ice')).toMatchObject([{ hit: [e.id] }]);
  const hp = e.hp;
  for (let i = 0; i < Math.ceil(CUT.delay / DT) + 1; i++) step(w, []);
  expect(e.hp).toBeLessThan(hp);
  expect(e.stunT).toBeGreaterThan(0);
  expect(w.cuts.filter((c) => c.src === 'ice')).toEqual([]);
});

const wizard = (n: number) => {
  const w = createWorld(1, ['H.......m']);
  useClass(w, 'wizard');
  Object.assign(w.ranks, { fireball: 1, lightning: 1 } as Partial<Record<SkillId, number>>);
  Object.assign(w.keys, { cleave: 'fireball', dash: 'lightning', shout: null, throw: null });
  for (const e of w.entities.slice(1)) Object.assign(e, { hp: 1e5, maxHp: 1e5, stunT: 1e9 });
  wear(w, n);
  return w;
};
const fireballThenLightning = (w: World) => {
  runFor(w, DT, [{ type: 'skill', x: 8.5, z: 0.5 }]);
  runFor(w, 1.5);
  const shots = w.shots.length;
  const cd = w.skillCd;
  runFor(w, DT, [{ type: 'dash', x: 8.5, z: 0.5 }]);
  return { more: w.shots.length - shots, cd, after: w.skillCd };
};

test('잔상: 4부위면 직전에 쓴 다른 스킬이 함께 나간다(재사용 대기 그대로, 얼음 분신이 잠깐 선다)', () => {
  expect(fireballThenLightning(wizard(3)).more).toBe(0);
  const w = wizard(4);
  const r = fireballThenLightning(w);
  expect(r.more).toBe(1);
  expect(r.after).toBeLessThanOrEqual(r.cd);
  expect(w.ghosts.some((g) => g.kind === 'rift')).toBe(true);
  expect(w.riftPrev).toBe('lightning');
});

test('잔상: 함께 나간 화염구는 피해 60%', () => {
  const w = wizard(4);
  fireballThenLightning(w);
  expect(w.shots.at(-1)!.scale).toBe(RIFT.echoMult);
});
