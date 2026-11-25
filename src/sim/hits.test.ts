import { expect, test } from 'vitest';
import { hitScale } from './dungeon';
import { refHp, hitBase } from './rules';

test('기준 체력: 50레벨 + 4단계 투구', () => {
  expect([refHp('knight'), refHp('ranger'), refHp('necromancer'), refHp('wizard')]).toEqual([620, 507, 448, 394]);
  expect(hitBase('knight')).toBeCloseTo(620 / 0.7);
});

test('hitScale: 1막 첫 판은 0, 1막 2회차 1, 2막은 깊이 따라 1.25→1.5, 회차 +5%씩 최대 +20%', () => {
  expect(hitScale(5, 0)).toBe(0);
  expect(hitScale(25, 0)).toBe(0);
  expect(hitScale(0, 1)).toBe(1); // 거점
  expect(hitScale(25, 1)).toBe(1);
  expect(hitScale(26, 1)).toBe(1.25);
  expect(hitScale(50, 1)).toBeCloseTo(1.5);
  expect(hitScale(60, 1)).toBeCloseTo(1.5);
  expect(hitScale(26, 2)).toBeCloseTo(1.25 * 1.05);
  expect(hitScale(26, 9)).toBeCloseTo(1.5);
  expect(hitScale(26, 0)).toBe(1.25); // 2막은 회차와 상관없이 켜진다
});

import { createWorld } from './world';
import { roll, hurt, hitOf } from './core';
import { HIT } from './rules';

const knight4 = (map = ['Hw']) => {
  const w = createWorld(1, map);
  w.gear.armor = 4;
  w.gear.helm = 4;
  w.hitScale = 1;
  return w;
};

test('전사 평타: 4단계 갑옷 기사에게 기준 체력의 약 25%(굴림 폭 0.8~1.2)', () => {
  const w = knight4();
  const [hero, e] = w.entities;
  for (let i = 0; i < 50; i++) {
    hero.hp = hero.maxHp = 9999;
    const got = hurt(w, hero, roll(w, e), e);
    expect(got).toBeGreaterThanOrEqual(Math.floor(620 * 0.25 * 0.8));
    expect(got).toBeLessThanOrEqual(Math.ceil(620 * 0.25 * 1.2));
  }
});

test('체력 옵션을 올려도 받는 피해는 같다', () => {
  const a = knight4(), b = knight4();
  b.mods.armor = [{ kind: 'life', value: 30 }];
  expect(roll(b, b.entities[1])).toBe(roll(a, a.entities[1]));
});

test('정예는 ×1.3, 마법사는 자기 기준 체력', () => {
  const a = knight4(), b = knight4();
  b.entities[1].elite = true;
  expect(roll(b, b.entities[1]) / roll(a, a.entities[1])).toBeCloseTo(1.3, 1);
  const z = knight4();
  z.cls = 'wizard';
  const r = roll(z, z.entities[1]);
  expect(r).toBeGreaterThanOrEqual(Math.floor((394 / 0.8) * 0.25 * 0.8));
  expect(r).toBeLessThanOrEqual(Math.ceil((394 / 0.8) * 0.25 * 1.2));
});

test('hitScale 0이면 예전 공식, 난수도 한 번만', () => {
  const a = createWorld(1, ['Hw']), b = createWorld(1, ['Hw']);
  b.hitScale = 1;
  roll(a, a.entities[1]);
  roll(b, b.entities[1]);
  expect(b.rng).toBe(a.rng);
  expect(createWorld(1, ['Hw']).hitScale).toBe(0);
});

test('hitOf: pct를 주면 그 비율, 안 주면 배율', () => {
  const w = knight4();
  const tell = hitOf(w, w.entities[1], 2, HIT.tell);
  expect(tell).toBeGreaterThanOrEqual(Math.floor((620 / 0.7) * 0.4 * 0.8));
  expect(tell).toBeLessThanOrEqual(Math.ceil((620 / 0.7) * 0.4 * 1.2));
  const a = createWorld(1, ['Hw']), b = createWorld(1, ['Hw']); // hitScale 0: 예전처럼 굴림 × 배율
  expect(hitOf(a, a.entities[1], 2, HIT.tell)).toBe(Math.round(roll(b, b.entities[1]) * 2));
});

import { step } from './world';

test('전사 내려찍기 예고 자리 피해는 기준 체력의 약 40%(시드 20개)', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const w = createWorld(seed, ['H.w']);
    Object.assign(w.gear, { armor: 4, helm: 4 });
    w.hitScale = 1;
    const e = w.entities.find((x) => x.kind === 'warrior')!;
    for (let i = 0; i < 1200 && !w.zones.some((z) => z.owner === e.id); i++) {
      w.entities[0].hp = w.entities[0].maxHp = 99999;
      step(w, []);
    }
    const z = w.zones.find((z) => z.owner === e.id)!;
    expect(z.dmg).toBeGreaterThanOrEqual(Math.floor((620 / 0.7) * 0.4 * 0.8));
    expect(z.dmg).toBeLessThanOrEqual(Math.ceil((620 / 0.7) * 0.4 * 1.2));
  }
});
