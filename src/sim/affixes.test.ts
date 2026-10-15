import { expect, test } from 'vitest';
import { AFFIXES, armorScore, createWorld, DT, isBetter, rollGear, setLevel, step, weaponScore, type Affix, type World } from './world';

const run = (w: World, ticks: number) => {
  for (let i = 0; i < ticks; i++) step(w, []);
};

test('장비 굴림: 일반 60%·마법 32%·희귀 8%, 정예급은 마법 70%·희귀 30%, 옵션은 부위에 맞고 범위 안·서로 다름', () => {
  const w = createWorld(7, ['H']);
  const count = (boosted: boolean) => {
    const n = [0, 0, 0];
    for (let i = 0; i < 3000; i++) {
      const it = rollGear(w, 0, 0, i % 2 ? 'weapon' : 'armor', 2, boosted);
      n[it.affixes!.length]++;
      for (const a of it.affixes!) {
        expect(AFFIXES[a.kind].slot).toBe(it.kind);
        expect(a.value).toBeGreaterThanOrEqual(AFFIXES[a.kind].lo);
        expect(a.value).toBeLessThanOrEqual(AFFIXES[a.kind].hi);
      }
      expect(new Set(it.affixes!.map((a) => a.kind)).size).toBe(it.affixes!.length);
    }
    return n.map((k) => k / 3000);
  };
  const [n0, n1, n2] = count(false);
  expect(n0).toBeGreaterThan(0.55);
  expect(n0).toBeLessThan(0.65);
  expect(n1).toBeGreaterThan(0.27);
  expect(n1).toBeLessThan(0.37);
  expect(n2).toBeGreaterThan(0.05);
  expect(n2).toBeLessThan(0.11);
  const [b0, b1, b2] = count(true);
  expect(b0).toBe(0);
  expect(b1).toBeGreaterThan(0.64);
  expect(b2).toBeGreaterThan(0.24);
});

// 주인공이 몬스터 한 마리를 n번 때린 피해 목록
function hits(mods: Affix[], times = 12) {
  const w = createWorld(5, ['Hm']);
  w.gear.weapon = 1; // 단검 4–7
  w.mods.weapon = mods;
  const [hero, m] = w.entities;
  hero.hp = hero.maxHp = 1e6;
  m.hp = m.maxHp = 1e6;
  const out: number[] = [];
  step(w, [{ type: 'attack', targetId: 1 }]);
  for (let t = 0; t < 6000 && out.length < times; t++) {
    const before = m.hp;
    step(w, []);
    if (m.hp < before) out.push(before - m.hp);
  }
  return out;
}

test('무기 옵션: 데미지%, 치명타(2배), 공격 속도', () => {
  expect(Math.min(...hits([{ kind: 'dmg', value: 100 }]))).toBeGreaterThanOrEqual(8); // 4–7 × 2
  expect(Math.max(...hits([{ kind: 'dmg', value: 100 }]))).toBeLessThanOrEqual(14);
  expect(Math.min(...hits([{ kind: 'crit', value: 100 }]))).toBeGreaterThanOrEqual(8); // 늘 치명타
  const w = createWorld(1, ['H']);
  w.gear.weapon = 1;
  w.mods.weapon = [{ kind: 'speed', value: 50 }];
  expect(weaponScore(1, w.mods.weapon)).toBeCloseTo(weaponScore(1, []) * 1.5);
});

test('흡혈: 준 피해의 N%를 회복한다', () => {
  const w = createWorld(5, ['Hm']);
  w.gear.weapon = 4; // 11–17
  w.mods.weapon = [{ kind: 'leech', value: 50 }];
  const [hero, m] = w.entities;
  hero.hp = 20;
  m.hp = m.maxHp = 1e6;
  step(w, [{ type: 'attack', targetId: 1 }]);
  let dealt = 0;
  for (let t = 0; t < 120 && !dealt; t++) {
    const before = m.hp;
    step(w, []);
    dealt = before - m.hp;
  }
  expect(dealt).toBeGreaterThan(0);
  expect(hero.hp).toBeGreaterThanOrEqual(20 + Math.round(dealt * 0.5) - 6); // 그사이 몬스터에게 맞은 만큼(최대 5) 빼고
});

test('갑옷 옵션: 최대 체력, 피해 감소, 재생, 가시', () => {
  const w = createWorld(1, ['H']);
  w.mods.armor = [{ kind: 'life', value: 30 }];
  setLevel(w, 3, 0);
  expect(w.entities[0].maxHp).toBe(120 + 30);

  const taken = (mods: Affix[]) => {
    const t = createWorld(3, ['Hw']); // 전사 6–9: 10% 감소가 반올림에 묻히지 않게
    t.gear.armor = 1;
    t.mods.armor = mods;
    const [hero, m] = t.entities;
    hero.hp = hero.maxHp = 1e6;
    m.hp = m.maxHp = 1e6;
    run(t, 1200);
    return { hero: 1e6 - hero.hp, thorns: 1e6 - m.hp };
  };
  const base = taken([]);
  expect(taken([{ kind: 'guard', value: 10 }]).hero).toBeLessThan(base.hero * 0.95);
  const th = taken([{ kind: 'thorns', value: 40 }]);
  expect(th.thorns).toBeGreaterThan(th.hero * 0.3);
  expect(th.thorns).toBeLessThan(th.hero * 0.5);
  expect(base.thorns).toBe(0);

  const r = createWorld(1, ['H']);
  r.mods.armor = [{ kind: 'regen', value: 15 }]; // 초당 1.5
  r.entities[0].hp = 50;
  run(r, Math.round(2 / DT));
  expect(r.entities[0].hp).toBe(53);
});

test('점수가 더 높은 장비만 밟으면 장착(옵션 포함), 옵션도 함께 바뀐다', () => {
  // 지금: 숏소드 +30%(8 × 1.3 ÷ 0.7 = 14.9). 옵션 없는 롱소드(10 ÷ 0.8 = 12.5)는 못하고, 롱소드 +30%(16.3)는 낫다
  const w = createWorld(1, ['H....']);
  w.gear = { weapon: 2, armor: 2 };
  w.mods.weapon = [{ kind: 'dmg', value: 30 }];
  const plain3 = { id: 1, x: 1.5, z: 0.5, kind: 'weapon' as const, tier: 3, affixes: [] };
  const sharp3 = { id: 2, x: 2.5, z: 0.5, kind: 'weapon' as const, tier: 3, affixes: [{ kind: 'dmg' as const, value: 30 }] };
  expect(isBetter(w, plain3)).toBe(false);
  expect(isBetter(w, sharp3)).toBe(true);
  expect(armorScore(2, [{ kind: 'life', value: 30 }])).toBeGreaterThan(armorScore(2, []));
  w.items.push(plain3, sharp3);
  for (let i = 0; i < 90; i++) step(w, i ? [] : [{ type: 'move', x: 4.5, z: 0.5 }]);
  expect(w.gear.weapon).toBe(3);
  expect(w.mods.weapon).toEqual([{ kind: 'dmg', value: 30 }]);
  expect(w.items.map((i) => i.id)).toEqual([1]); // 못한 것은 남는다
});
