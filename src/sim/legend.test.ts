// 전설·세트 장비, 스킬 +N 옵션(초월). 설계: docs/superpowers/specs/2026-11-16-legendary-design.md
import { expect, test } from 'vitest';
import * as W from './world';
import { decodeSave, encodeSave } from '../save';
import { sellPrice } from '../shop';
import { gearName } from '../render/labels';
import { hurt, roll, skillHit } from './core';
import { fireBurst } from './wizard';
import { bonesStat, raise } from './necro';
import { setLevel, ELITE_FX, moveSpeed, SET_HUNTER, attackInterval, DT, heroMax, LEGEND_FX, type Command, type UniqueId, createWorld, learn, learnBlock, LEGEND_DROP, mastered, quality, rank, RANK_MAX, rollGear, rollUnique, SKILLS, step, TREES, UNIQUES, uniqueOf, useClass, type Affix, type HeroClass, type SkillId, type World } from './world';

const make = (cls: HeroClass = 'knight') => {
  const w = createWorld(1, ['H....']);
  useClass(w, cls);
  return w;
};
const skill = (id: SkillId, value: number): Affix => ({ kind: 'skill', value, skill: id });

test('스킬 +N: 배운 스킬에 장비 보너스를 더하고, 초월 상한은 RANK_MAX + 2', () => {
  const w = make();
  w.ranks.cleave = 3;
  w.mods.weapon = [skill('cleave', 2)];
  expect(rank(w, 'cleave')).toBe(5);
  expect(mastered(w, 'cleave')).toBe(true); // 5단계 완성 효과가 장비로 켜진다
  w.mods.helm = [{ kind: 'tab', value: 1, tab: 0 }];
  w.mods.armor = [{ kind: 'allSkills', value: 1 }];
  w.mods.boots = [skill('cleave', 2)];
  expect(rank(w, 'cleave')).toBe(RANK_MAX + 2);
  expect(rank(w, 'whirl')).toBe(0); // 안 배운 스킬은 장비로 생기지 않는다
  w.mods = { weapon: [], armor: [], helm: [], boots: [] };
  expect(rank(w, 'cleave')).toBe(3); // 벗으면 내려간다
});

test('배우기 상한은 포인트로 찍은 기본 단계: 장비로 7이어도 기본 4면 하나 더 배운다', () => {
  const w = make();
  Object.assign(w, { points: 3 });
  w.ranks.cleave = 4;
  w.mods.weapon = [skill('cleave', 2), { kind: 'allSkills', value: 1 }];
  expect(rank(w, 'cleave')).toBe(7);
  expect(learnBlock(w, 'cleave')).toBeNull();
  learn(w, 'cleave');
  expect(w.ranks.cleave).toBe(5);
  expect(learnBlock(w, 'cleave')).toBe('최고 단계');
});

// 초월 7단계에서도 수치가 말이 되는가: 유한·0 이상, 재사용 대기는 5단계의 60% 이상, 확률·감소율은 0.9 이하
test.each(['knight', 'wizard', 'ranger', 'necromancer'] as HeroClass[])('7단계 수치 안전: %s', (cls) => {
  const at = (n: number) => {
    const w = make(cls);
    for (const t of TREES[cls]) for (const id of t.skills) w.ranks[id] = n;
    return w;
  };
  const [w5, w7] = [at(5), at(7)];
  const stats = Object.entries(W).filter(([k, f]) => k.endsWith('Stat') && typeof f === 'function') as [string, (w: World) => Record<string, number>][];
  expect(stats.length).toBeGreaterThan(20);
  for (const [name, f] of stats) {
    const [s5, s7] = [f(w5), f(w7)];
    for (const [k, v] of Object.entries(s7)) {
      if (typeof v !== 'number' || s5[k] === Infinity) continue; // 처음부터 무한(시간제가 아닌 소환수 등)
      expect(Number.isFinite(v) && v >= 0, `${name}.${k} = ${v}`).toBe(true);
      if (k === 'cd') expect(v, `${name}.cd`).toBeGreaterThanOrEqual(s5[k] * 0.6 - 1e-9);
      if (k === 'chance' || k === 'reduce') expect(v, `${name}.${k}`).toBeLessThanOrEqual(0.9);
    }
  }
});

test('스킬 옵션 굴림: 대상은 지금 직업의 스킬, 값 1~2, 희귀는 15%로 옵션 하나가 탭 +1', () => {
  const w = make('wizard');
  let skills = 0;
  let tabs = 0;
  for (let i = 0; i < 4000; i++) {
    const it = rollGear(w, 0, 0, 'helm', 2, true);
    for (const a of it.affixes ?? []) {
      if (a.kind === 'skill') {
        skills++;
        expect(SKILLS[a.skill!].cls).toBe('wizard');
        expect([1, 2]).toContain(a.value);
        if ((it.affixes ?? []).length < 2) expect(a.value).toBe(1); // 2는 희귀만
      }
      if (a.kind === 'tab') {
        tabs++;
        expect(it.affixes).toHaveLength(2);
        expect(a.tab).toBeLessThan(TREES.wizard.length);
      }
      expect(a.kind).not.toBe('allSkills'); // 모든 스킬 +1은 전설만
    }
  }
  expect(skills).toBeGreaterThan(400);
  expect(tabs / (4000 * 0.3)).toBeGreaterThan(0.1);
  expect(tabs / (4000 * 0.3)).toBeLessThan(0.2);
});

// ---- 고유 장비(전설·세트): 데이터·드롭·운 보정·장착·저장 ----
const kill = (w: World, i = 1) => hurt(w, w.entities[i], 1e9, w.entities[0]);
const uniques = (w: World) => [...w.items, ...w.bag].filter((it) => it.kind !== 'potion' && it.kind !== 'gold' && uniqueOf({ affixes: it.affixes ?? [] }));
const withDrop = (patch: Partial<typeof LEGEND_DROP>, fn: () => void) => {
  const old = { ...LEGEND_DROP };
  Object.assign(LEGEND_DROP, patch);
  try {
    fn();
  } finally {
    Object.assign(LEGEND_DROP, old);
  }
};

test('정예: 고유 장비 확률 = elite + 운 보정. 안 나오면 운 보정이 쌓이고, 나오면 0', () => {
  withDrop({ elite: 0 }, () => {
    const w = createWorld(1, ['H.N..']);
    kill(w);
    expect(uniques(w)).toHaveLength(0);
    expect(w.pity).toBeCloseTo(LEGEND_DROP.pity);
  });
  const w = createWorld(1, ['H.N..']);
  w.pity = 1;
  kill(w);
  expect(uniques(w)).toHaveLength(1);
  expect(w.pity).toBe(0);
});

test('보스: 고유 장비는 보관함으로(층이 끝나 바닥 것을 못 줍는다), 가득하면 바닥에. 해골 왕은 바닥에', () => {
  withDrop({ boss: 1 }, () => {
    const w = createWorld(1, ['H.M..']);
    kill(w);
    expect(w.bag.filter((it) => uniqueOf(it))).toHaveLength(1);
    const full = createWorld(1, ['H.M..']);
    full.bag = Array.from({ length: 20 }, (_, i) => ({ kind: 'weapon' as const, tier: 1, affixes: [], x: i >> 1, y: (i & 1) * 2 }));
    kill(full);
    expect(full.items.filter((it) => uniqueOf({ affixes: it.affixes ?? [] }))).toHaveLength(1);
    const king = createWorld(1, ['H.K..']);
    kill(king);
    expect(king.items.filter((it) => uniqueOf({ affixes: it.affixes ?? [] }))).toHaveLength(1);
  });
});

test('고유 장비 굴림: 직업 전설은 그 직업만, 옵션 = 표식 + 고정 + 무작위 1~2(서로 다른 종류), 세트는 없는 부위가 70%', () => {
  const w = make('ranger');
  w.mods.weapon = [{ kind: 'unique', value: 0, u: 'hunterWeapon' }];
  w.mods.armor = [{ kind: 'unique', value: 0, u: 'hunterArmor' }];
  w.bag = [{ kind: 'helm', tier: 1, affixes: [{ kind: 'unique', value: 0, u: 'hunterHelm' }], x: 0, y: 0 }];
  let [sets, missing] = [0, 0];
  for (let i = 0; i < 3000; i++) {
    const it = rollUnique(w, 0, 0, 3);
    const a = it.affixes!;
    const u = uniqueOf({ affixes: a })!;
    const def = UNIQUES[u];
    expect(a[0]).toEqual({ kind: 'unique', value: 0, u });
    expect(it.kind).toBe(def.slot);
    expect(it.tier).toBe(3);
    if (def.cls) expect(def.cls).toBe('ranger');
    expect(new Set(a.map((x) => x.kind)).size).toBe(a.length);
    expect(a.length).toBeLessThanOrEqual(4);
    if (def.set) {
      sets++;
      if (u === 'hunterBoots') missing++;
    }
  }
  expect(sets / 3000).toBeGreaterThan(0.35);
  expect(sets / 3000).toBeLessThan(0.45);
  expect(missing / sets).toBeGreaterThan(0.65);
});

test('자동 장착은 고유 장비를 입히지도 벗기지도 않는다', () => {
  const w = createWorld(1, ['H....']);
  const hero = w.entities[0];
  w.items.push({ id: 99, x: hero.x, z: hero.z, kind: 'weapon', tier: 4, affixes: [{ kind: 'unique', value: 0, u: 'boomerang' }, { kind: 'dmg', value: 30 }] });
  step(w, []);
  expect(w.mods.weapon).toEqual([]);
  expect(w.bag).toHaveLength(1);
  w.mods.armor = [{ kind: 'unique', value: 0, u: 'crownless' }];
  w.items.push({ id: 100, x: hero.x, z: hero.z, kind: 'armor', tier: 4, affixes: [{ kind: 'life', value: 30 }, { kind: 'guard', value: 10 }] });
  step(w, []);
  expect(uniqueOf({ affixes: w.mods.armor })).toBe('crownless');
});

test('고유 장비 이름·등급·판매 가격', () => {
  expect(gearName('weapon', 2, [{ kind: 'unique', value: 0, u: 'hunterWeapon' }, { kind: 'dmg', value: 20 }])).toBe('정예 사냥꾼의 숏소드');
  expect(gearName('armor', 2, [{ kind: 'unique', value: 0, u: 'crownless' }])).toBe('왕관 없는 왕의 망토');
  expect(gearName('weapon', 2, [{ kind: 'dmg', value: 20 }, skill('cleave', 1)])).toBe('날카로운 숏소드'); // 스킬 옵션은 접두어 없음
  expect(quality({ affixes: [{ kind: 'unique', value: 0, u: 'crownless' }] })).toBe(3);
  expect(quality({ affixes: [{ kind: 'unique', value: 0, u: 'hunterHelm' }] })).toBe(4);
  expect(quality({ affixes: [{ kind: 'dmg', value: 20 }] })).toBe(1);
  expect(sellPrice({ kind: 'armor', tier: 1, affixes: [{ kind: 'unique', value: 0, u: 'crownless' }, { kind: 'allSkills', value: 1 }] })).toBe(10 + 15 + 100);
});

test('저장: 스킬 옵션·고유 장비·운 보정 왕복, 이상한 고유·남의 직업 전설·다른 직업 스킬 옵션은 저장을 버린다', () => {
  const run = (patch: object) => ({ name: '용사', marks: 0, news: false, took: false, cls: 'knight' as const, floor: 2, potions: 2, gear: { weapon: 2, armor: 2, helm: 2, boots: 2 }, mods: { weapon: [], armor: [], helm: [], boots: [] }, ranks: { cleave: 1 }, points: 0, keys: { cleave: 'cleave' as const, dash: null, shout: null, throw: null }, bag: [], autoEquip: true, level: 1, xp: 0, gold: 0, cycle: 0, stats: { time: 0, kills: 0, deaths: 0 }, pity: 0, land: 'dungeon' as const, from: 'w' as const, stage: 0, ...patch });
  const good = run({ pity: 0.015, mods: { weapon: [{ kind: 'unique', value: 0, u: 'boomerang' }, skill('throw', 2), { kind: 'dmg', value: 20 }], armor: [{ kind: 'tab', value: 1, tab: 2 }], helm: [], boots: [] } });
  expect(decodeSave(encodeSave(good))).toEqual(good);
  expect(decodeSave(encodeSave(run({ mods: { weapon: [{ kind: 'unique', value: 0, u: 'nope' }], armor: [], helm: [], boots: [] } })))).toBeNull();
  expect(decodeSave(encodeSave(run({ mods: { weapon: [{ kind: 'unique', value: 0, u: 'splitOrb' }], armor: [], helm: [], boots: [] } })))).toBeNull();
  expect(decodeSave(encodeSave(run({ mods: { weapon: [{ kind: 'unique', value: 0, u: 'crownless' }], armor: [], helm: [], boots: [] } })))).toBeNull(); // 부위가 다르다
  expect(decodeSave(encodeSave(run({ mods: { weapon: [skill('fireball', 1)], armor: [], helm: [], boots: [] } })))).toBeNull();
  const old = JSON.parse(encodeSave(run({})));
  delete old.pity;
  expect(decodeSave(JSON.stringify(old))?.pity).toBe(0);
});

// ---- 전설 효과 ----
const wearU = (w: World, u: UniqueId) => {
  w.mods[UNIQUES[u].slot] = [{ kind: 'unique', value: 0, u }];
};
// 직업 + 배운 스킬(Q에 q), 적은 체력이 크고 기절해 제자리에
const arena = (map: string[], cls: HeroClass, ranks: Partial<Record<SkillId, number>> = {}, q?: SkillId) => {
  const w = createWorld(1, map);
  useClass(w, cls);
  Object.assign(w.ranks, ranks);
  if (q) w.keys.cleave = q;
  for (const e of w.entities.slice(1)) Object.assign(e, { hp: 1e5, maxHp: 1e5, stunT: 1e9 });
  return w;
};
const runFor = (w: World, sec: number, cmds: Command[] = []) => {
  step(w, cmds);
  for (let i = Math.round(sec / DT) - 1; i > 0; i--) step(w, []);
};
const lost = (w: World, i = 1) => 1e5 - w.entities[i].hp;

test('돌아오는 도끼날: 도끼가 꿰뚫고 날아갔다가 돌아오며 같은 적을 한 번 더 맞힌다', () => {
  const thrown = (u: boolean) => {
    const w = arena(['H..m.......'], 'knight', { throw: 1 }, 'throw');
    if (u) wearU(w, 'boomerang');
    const e = w.entities[1];
    runFor(w, 3, [{ type: 'skill', x: e.x, z: e.z }]);
    return lost(w);
  };
  const [once, twice] = [thrown(false), thrown(true)];
  expect(once).toBeGreaterThan(0);
  expect(twice).toBeGreaterThanOrEqual(once * 2 - 2);
});

test('쪼개지는 구슬: 화염구가 터지면 작은 화염구 3개(작은 것은 다시 쪼개지지 않는다)', () => {
  const w = arena(['H....'], 'wizard', { fireball: 1 });
  const hero = w.entities[0];
  fireBurst(w, hero, 2, 0.5, 30);
  expect(w.shots).toHaveLength(0);
  wearU(w, 'splitOrb');
  fireBurst(w, hero, 2, 0.5, 30);
  const small = w.shots.filter((s) => s.small);
  expect(small).toHaveLength(LEGEND_FX.orbs);
  expect(small[0].dmg).toBe(Math.round(30 * LEGEND_FX.orbMult));
  fireBurst(w, hero, 2, 0.5, 12, true);
  expect(w.shots).toHaveLength(LEGEND_FX.orbs);
});

test('매의 눈 두건: 관통 사격이 벽에 닿으면 한 번 튕긴다', () => {
  const shot = (u: boolean) => {
    const w = arena(['#H....'], 'ranger', { pierce: 1 });
    if (u) wearU(w, 'hawkHood');
    const hero = w.entities[0];
    w.shots.push({ id: 99, x: hero.x, z: hero.z, dx: -1, dz: 0, dmg: 10, left: 8, kind: 'pierce' });
    runFor(w, 0.3);
    return w.shots.find((s) => s.id === 99);
  };
  expect(shot(false)).toBeUndefined();
  expect(shot(true)?.dx).toBe(1);
});

test('뼈 왕의 수의: 해골 최대 수 +2, 해골이 쓰러지면 그 자리가 터진다', () => {
  const w = arena(['H.m..'], 'necromancer', { bones: 1 });
  const max = bonesStat(w).max;
  wearU(w, 'boneShroud');
  expect(bonesStat(w).max).toBe(max + LEGEND_FX.bones);
  const e = w.entities[1];
  raise(w, e.x, e.z, 1);
  w.allies[0].hp = 0;
  w.allies[0].state = 'dead';
  step(w, []);
  expect(lost(w)).toBeGreaterThan(0);
});

test('결투자의 투구: 받아치기에 성공하면 모든 재사용 대기 −1초, 자원 +15', () => {
  const w = arena(['H.m..'], 'knight');
  wearU(w, 'duelist');
  Object.assign(w, { skillCd: 5, dashCd: 0.5, res: 50 });
  const e = w.entities[1];
  Object.assign(e, { stunT: 0, phase: 'windup' });
  skillHit(w, e, 10);
  expect(w.skillCd).toBeCloseTo(4);
  expect(w.dashCd).toBe(0);
  expect(w.res).toBe(65);
});

test('불꽃 걸음: 구른 길에 불길이 남는다(마법사는 순간이동한 길)', () => {
  for (const cls of ['knight', 'wizard'] as HeroClass[]) {
    const w = arena(['H.......'], cls);
    wearU(w, 'emberStep');
    const x0 = w.entities[0].x;
    runFor(w, 0.5, [{ type: 'roll', x: x0 + 3, z: 0.5 }]);
    const f = w.fires.at(-1)!;
    expect(f, cls).toBeDefined();
    expect(Math.abs(f.x1 - f.x0), cls).toBeGreaterThan(2);
  }
});

test('광전사의 손잡이: 잃은 체력만큼 공격 속도·스킬 피해(최대 +40%)', () => {
  const w = arena(['H.m..'], 'knight');
  const hero = w.entities[0];
  const base = attackInterval(w, hero);
  wearU(w, 'berserker');
  expect(attackInterval(w, hero)).toBeCloseTo(base);
  hero.hp = hero.maxHp / 2;
  expect(attackInterval(w, hero)).toBeCloseTo(base / (1 + LEGEND_FX.rage / 2));
  skillHit(w, w.entities[1], 100);
  expect(lost(w)).toBe(Math.round(100 * 1.5 * (1 + LEGEND_FX.rage / 2))); // 기절한 적 = 약점 ×1.5
});

test('왕관 없는 왕의 망토: 최대 체력 −15%', () => {
  const w = arena(['H....'], 'knight');
  const base = heroMax(w);
  wearU(w, 'crownless');
  expect(heroMax(w)).toBe(Math.round(base * LEGEND_FX.cloakHp));
});

// ---- 정예 사냥꾼 세트 ----
const hunter = (w: World, n: number) => (['hunterWeapon', 'hunterArmor', 'hunterHelm', 'hunterBoots'] as UniqueId[]).slice(0, n).forEach((u) => wearU(w, u));

test('세트 2부위: 정예·보스에게 주는 피해 ×1.25, 정예를 잡으면 자원 +30', () => {
  const hit = (n: number) => {
    const w = arena(['H.N..'], 'knight');
    hunter(w, n);
    hurt(w, w.entities[1], 100, w.entities[0]);
    return lost(w);
  };
  expect(hit(1)).toBe(100);
  expect(hit(2)).toBe(125);
  const w = createWorld(1, ['H.N..']);
  hunter(w, 2);
  setLevel(w, 30, 0); // 레벨업으로 자원이 가득 차지 않게
  w.res = 10;
  kill(w);
  expect(w.res).toBe(10 + SET_HUNTER.res);
  expect(w.trophies).toEqual({}); // 4부위가 아니면 특성은 없다
});

test('세트 4부위: 정예를 잡으면 그 특성을 20초 얻고, 시간이 지나면 사라진다', () => {
  const w = createWorld(1, ['H.N..']);
  hunter(w, 4);
  const hero = w.entities[0];
  const [speed, interval] = [moveSpeed(w, hero), attackInterval(w, hero)];
  w.entities[1].eliteKind = 'swift';
  kill(w);
  expect(w.trophies.swift).toBe(SET_HUNTER.time);
  expect(moveSpeed(w, hero)).toBeCloseTo(speed * ELITE_FX.swiftMove);
  expect(attackInterval(w, hero)).toBeCloseTo(interval / ELITE_FX.swiftAttack);
  runFor(w, SET_HUNTER.time + 0.1);
  expect(w.trophies.swift).toBeUndefined();
});

test('얻은 특성: 흡혈·통솔·폭발(연쇄)·분열(잠깐 서는 해골)', () => {
  const w = arena(['H.mmm...'], 'knight');
  const hero = w.entities[0];
  hunter(w, 4);
  // 통솔: 주인공 굴림 ×1.3 (같은 시드로 비교)
  w.gear.weapon = 4;
  const plain = roll({ ...w, rng: 5 }, hero);
  w.trophies = { warlord: 5 };
  expect(roll({ ...w, rng: 5 }, hero)).toBe(Math.round(plain * SET_HUNTER.aura));
  // 흡혈: 준 피해의 10% 회복
  w.trophies = { vampiric: 5 };
  hero.hp = 50;
  hurt(w, w.entities[1], 100, hero);
  expect(hero.hp).toBe(50 + 100 * SET_HUNTER.leech);
  // 폭발: 잡은 적 자리가 바로 터지고, 그 폭발로 죽은 적도 터진다
  w.trophies = { volatile: 5 };
  for (const e of w.entities.slice(1)) Object.assign(e, { hp: 1, maxHp: 1 });
  w.entities[1].x = w.entities[2].x - 1;
  w.entities[3].x = w.entities[2].x + 1;
  hurt(w, w.entities[1], 5, hero);
  expect(w.entities.slice(1).every((e) => e.state === 'dead')).toBe(true);
  // 분열: 잡은 적 자리에 10초짜리 해골(최대 3)
  const v = arena(['H.mmmm..'], 'wizard');
  hunter(v, 4);
  v.trophies = { splitting: 5 };
  for (const e of v.entities.slice(1)) hurt(v, e, 1e9, v.entities[0]);
  expect(v.allies).toHaveLength(SET_HUNTER.allyMax);
  expect(v.allies[0].life).toBe(SET_HUNTER.allyLife);
});
