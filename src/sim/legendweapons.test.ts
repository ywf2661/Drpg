// 전설 무기 효과: 칼리버X 종언, 엘리멘탈 스태프, 갇힌 왕의 두개골 무덤 왕, 천둥새의 장궁. 설계: docs/superpowers/specs/2026-11-20-legend-weapons-design.md
import { expect, test } from 'vitest';
import { hurt, skillHit } from './core';
import { looksOf } from '../render/sprites';
import { GRAVE_KING, LEGEND_DROP, PRAYER_WEAPON, createWorld, DT, ELEM_STAFF, FINALE, rollUnique, step, STORM_BOW, UNIQUES, uniqueOf, useClass, type Command, type HeroClass, type UniqueId, type World } from './world';

const wear = (w: World, u: UniqueId) => {
  w.mods.weapon = [{ kind: 'unique', value: 0, u }, ...UNIQUES[u].fixed.filter((f) => typeof f === 'object')];
};
// 적은 체력이 크고 기절해 제자리에
const arena = (map: string[], cls: HeroClass, u?: UniqueId) => {
  const w = createWorld(1, map);
  useClass(w, cls);
  if (u) wear(w, u);
  for (const e of w.entities.slice(1)) Object.assign(e, { hp: 1e5, maxHp: 1e5, stunT: 1e9 });
  return w;
};
const runFor = (w: World, sec: number, cmds: Command[] = []) => {
  step(w, cmds);
  for (let i = Math.round(sec / DT) - 1; i > 0; i--) step(w, []);
};
const lost = (w: World, i: number) => 1e5 - w.entities[i].hp;

test('종언: 최대 체력의 일부를 잃고 앞쪽 부채꼴의 적만 벤다, 체력 1은 남는다', () => {
  const w = arena(['m.H.m'], 'knight', 'caliburx');
  w.keys.cleave = 'finale';
  const hero = w.entities[0];
  const [left, right] = [w.entities[1].x < hero.x ? 1 : 2, w.entities[1].x < hero.x ? 2 : 1];
  const full = hero.hp;
  runFor(w, 0.1, [{ type: 'skill', x: w.entities[right].x, z: w.entities[right].z }]);
  expect(lost(w, right)).toBeGreaterThan(0);
  expect(lost(w, left)).toBe(0); // 등 뒤
  expect(hero.hp).toBe(full - Math.round(hero.maxHp * FINALE.hp));
  expect(w.finales).toHaveLength(1);
  hero.hp = 1;
  w.skillCd = 0;
  runFor(w, 0.1, [{ type: 'skill', x: w.entities[right].x, z: w.entities[right].z }]);
  expect(hero.hp).toBe(1); // 체력이 모자라도 쓰고, 1은 남는다
});

test('전설 무기 넷은 무작위 전설에 없고, 기도하는 자(haloDrop)를 쓰러뜨리면 따로 LEGEND_DROP.prayer 확률로 지금 직업의 것', () => {
  for (const cls of ['knight', 'wizard', 'necromancer', 'ranger'] as const) {
    const w = arena(['H.M'], cls);
    for (let i = 0; i < 300; i++) expect(Object.values(PRAYER_WEAPON)).not.toContain(uniqueOf(rollUnique(w, 0, 0, 4) as never));
  }
  let got = 0;
  const n = 300;
  for (let seed = 1; seed <= n; seed++) {
    const w = createWorld(seed, ['H.M']);
    useClass(w, 'wizard');
    Object.assign(w, { haloDrop: 1e-9 });
    hurt(w, w.entities[1], 1e9, w.entities[0]);
    const all = [...w.bag, ...w.items.filter((it) => it.affixes)].map((it) => uniqueOf(it as never));
    expect(all).not.toContain('caliburx'); // 남의 직업 무기는 안 나온다
    if (all.includes('elemStaff')) got++;
  }
  expect(got / n).toBeGreaterThan(LEGEND_DROP.prayer - 0.1);
  expect(got / n).toBeLessThan(LEGEND_DROP.prayer + 0.1);
});

test('엘리멘탈 스태프: 마지막에 쓴 탭의 속성으로 추가 피해 — 냉기는 멈칫, 번개는 옆 적에게 튄다', () => {
  const hit = (elem: number, u = true) => {
    const w = arena(['H.m.m'], 'wizard', u ? 'elemStaff' : undefined);
    w.elem = elem;
    for (const e of w.entities.slice(1)) e.stunT = 0;
    skillHit(w, w.entities[1], 100);
    return { w, a: lost(w, 1), b: lost(w, 2) };
  };
  expect(hit(0, false).a).toBe(100);
  expect(hit(0).a).toBe(100 + 100 * ELEM_STAFF.extra);
  const frost = hit(1);
  expect(frost.w.entities[1].stunT).toBeCloseTo(ELEM_STAFF.freeze);
  const bolt = hit(2);
  expect(bolt.a).toBe(100);
  expect(bolt.b).toBe(100 * ELEM_STAFF.extra);
});

test('엘리멘탈 스태프: 마법사가 스킬을 쓰면 그 탭이 속성이 되고, 그림은 속성 색 스태프', () => {
  const w = arena(['H...m'], 'wizard', 'elemStaff');
  Object.assign(w.ranks, { frost: 1 });
  w.keys.dash = 'frost';
  w.res = 1e3;
  expect(looksOf(w).layers?.main).toBe('wizard_main_elembase');
  runFor(w, 0.1, [{ type: 'dash', x: w.entities[1].x, z: w.entities[1].z }]);
  expect(w.elem).toBe(1);
  expect(looksOf(w).layers?.main).toBe('wizard_main_elemfrost');
});

test('그림: 칼리버X는 방패를 지우고, 두개골은 구슬, 천둥새는 번개 장궁', () => {
  const w = arena(['H'], 'knight', 'caliburx');
  expect(looksOf(w).layers).toEqual({ main: 'hero_main_caliburx', off: null });
  wear(w, 'graveSkull');
  expect(looksOf(w).layers).toEqual({ main: 'necromancer_main_4', off: 'necromancer_off_skull' });
  wear(w, 'stormBow');
  expect(looksOf(w).layers).toEqual({ main: 'ranger_main_storm' });
});

test('무덤 왕의 귀환: 앞에 솟아 닿는 적 모두를 치고, 주인공이 가면 따라온다. 유지 시간이 지나면 사라진다', () => {
  const w = arena(['H..mm...........'], 'necromancer', 'graveSkull');
  w.keys.cleave = 'graveKing';
  w.res = 1e3;
  const [hero, near] = [w.entities[0], w.entities[1]];
  runFor(w, 0.1, [{ type: 'skill', x: near.x, z: near.z }]);
  const king = w.allies.find((a) => a.from === 'graveKing')!;
  expect(king.escort).toBe(true);
  runFor(w, 2);
  expect(lost(w, 1)).toBeGreaterThan(0);
  expect(lost(w, 2)).toBeGreaterThan(0); // 둘레 모두
  for (const e of w.entities.slice(1)) e.state = 'dead'; // 적을 치우고 주인공이 멀리 간다
  runFor(w, 4, [{ type: 'move', x: hero.x + 10, z: hero.z }]);
  expect(Math.hypot(king.x - hero.x, king.z - hero.z)).toBeLessThan(3);
  runFor(w, GRAVE_KING.life);
  expect(w.allies.some((a) => a.from === 'graveKing')).toBe(false);
});

test('천둥새의 장궁: 화살이 맞힌 적 둘레의 다른 적 모두에게 번개, 멀리 있는 적은 아니다', () => {
  const shot = (u: boolean) => {
    const w = arena(['H...mm.......m'], 'ranger', u ? 'stormBow' : undefined);
    const hero = w.entities[0];
    hero.target = 1;
    runFor(w, 2);
    return w;
  };
  const off = shot(false);
  expect(lost(off, 2)).toBe(0);
  const on = shot(true);
  expect(lost(on, 1)).toBeGreaterThan(0);
  expect(lost(on, 2)).toBeGreaterThan(0); // 바로 옆(STORM_BOW.radius 안)
  expect(lost(on, 3)).toBe(0);
  expect(STORM_BOW.radius).toBeLessThan(8);
});
