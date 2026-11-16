// 기력·마나: 직업별 종류·최대치, 회복, 스킬 비용(나갔을 때만), 층·레벨업 때 가득
import { expect, test } from 'vitest';
import { canAfford, gainXp, resMax, setLevel, skillCost } from './core';
import { createWorld, DT, RESOURCE, step, TREES, useClass, xpToNext, type HeroClass } from './world';

const hero = (cls: HeroClass, level = 1, map = ['H....']) => {
  const w = createWorld(1, map);
  useClass(w, cls);
  setLevel(w, level, 0);
  return w;
};
const tick = (w: ReturnType<typeof hero>, n: number) => {
  for (let i = 0; i < n; i++) step(w, []);
};

test('직업별 자원: 기사·궁수 기력 100 고정, 마법사·강령술사 마나는 레벨마다 +8', () => {
  expect([RESOURCE.knight, RESOURCE.ranger, RESOURCE.wizard, RESOURCE.necromancer]).toEqual(['energy', 'energy', 'mana', 'mana']);
  expect(resMax(hero('knight', 5))).toBe(100);
  expect(resMax(hero('ranger', 9))).toBe(100);
  expect(resMax(hero('wizard', 1))).toBe(100);
  expect(resMax(hero('wizard', 6))).toBe(140);
  expect(resMax(hero('necromancer', 6))).toBe(140);
});

test('회복: 기력 초당 10, 마나 레벨 1 초당 4, 최대치에서 멈춘다', () => {
  const k = hero('knight');
  k.res = 0;
  tick(k, Math.round(1 / DT));
  expect(k.res).toBeCloseTo(10, 0);
  tick(k, Math.round(30 / DT));
  expect(k.res).toBe(100);
  const m = hero('wizard');
  m.res = 0;
  tick(m, Math.round(1 / DT));
  expect(m.res).toBeCloseTo(4, 0);
});

test('스킬이 나가면 비용을 낸다', () => {
  const w = hero('knight');
  w.res = 100;
  step(w, [{ type: 'shout' }]);
  expect(w.shoutCd).toBeGreaterThan(0);
  expect(w.res).toBeCloseTo(100 - skillCost('knight', w.keys.shout!), 0);
});

test('안 나가면 비용 없음: 재사용 대기 중', () => {
  const w = hero('knight');
  w.res = 100;
  w.shoutCd = 5;
  step(w, [{ type: 'shout' }]);
  expect(w.res).toBe(100);
});

test('모자라면 안 나간다', () => {
  const w = hero('knight');
  w.res = skillCost('knight', w.keys.shout!) - 1;
  step(w, [{ type: 'shout' }]);
  expect(w.shoutCd).toBe(0);
  expect(canAfford(w, w.keys.shout!)).toBe(false);
});

test('한 틱에 두 스킬: 앞이 쓰고 남은 양으로 판정', () => {
  const w = hero('knight');
  w.res = skillCost('knight', w.keys.shout!) + skillCost('knight', w.keys.dash!) - 1;
  step(w, [{ type: 'shout' }, { type: 'dash' }]);
  expect(w.shoutCd).toBeGreaterThan(0);
  expect(w.dashCd).toBe(0);
});

test('평타·구르기는 무료', () => {
  const w = hero('knight', 1, ['Hm...']);
  w.res = 0;
  step(w, [{ type: 'roll' }]);
  expect(w.rollCd).toBeGreaterThan(0);
  expect(w.res).toBeLessThan(1);
});

test('칸을 바꾸면 비용도 바뀐다', () => {
  const w = hero('knight');
  const ult = TREES.knight[2].skills[3]; // 투척 궁극(도끼 폭풍: 대상 없이도 나간다)
  w.ranks[ult] = 1;
  w.keys.shout = ult;
  w.res = 100;
  step(w, [{ type: 'shout' }]);
  expect(w.shoutCd).toBeGreaterThan(0);
  expect(w.res).toBeCloseTo(100 - skillCost('knight', ult), 0);
});

test('skillCost: 트리 등급 기본값, 패시브 0', () => {
  const k = TREES.knight[0].skills;
  const m = TREES.wizard[0].skills;
  expect(k.map((id) => skillCost('knight', id))).toEqual([16, 24, 0, 36]);
  expect([skillCost('wizard', m[0]), skillCost('wizard', m[3])]).toEqual([20, 56]);
});

test('레벨업하면 가득', () => {
  const w = hero('wizard');
  w.res = 0;
  gainXp(w, xpToNext(1));
  expect(w.level).toBe(2);
  expect(w.res).toBe(resMax(w));
  expect(w.res).toBe(108);
});
