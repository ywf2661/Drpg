// 전설 무기가 주는 스킬(GEAR_SKILLS): 입으면 생기고 빈 칸에, 벗으면 칸이 탭 1단계 스킬로. 설계: docs/superpowers/specs/2026-11-20-legend-weapons-design.md
import { expect, test } from 'vitest';
import { decodeSave, encodeSave } from '../save';
import { bind, createWorld, gearKeys, learn, learnBlock, newSkills, rank, SKILLS, step, UNIQUES, useClass, type HeroClass, type UniqueId, type World } from './world';

const make = (cls: HeroClass) => {
  const w = createWorld(1, ['H....']);
  useClass(w, cls);
  Object.assign(w, newSkills(cls)); // 새 판: 첫 스킬만 Q에
  return w;
};
const wear = (w: World, u: UniqueId | null) => {
  w.mods.weapon = u ? [{ kind: 'unique', value: 0, u }, ...UNIQUES[u].fixed.filter((f) => typeof f === 'object')] : [];
};

test('칼리버X를 들면 종언이 1단계(+검술 탭 보너스)로 생기고 빈 칸에 끼워진다, 벗으면 사라진다', () => {
  const w = make('knight');
  expect(rank(w, 'finale')).toBe(0);
  wear(w, 'caliburx');
  expect(rank(w, 'finale')).toBe(2); // 1 + 고정 옵션 검술 스킬 +1
  step(w, []);
  expect(Object.values(w.keys)).toContain('finale');
  wear(w, null);
  step(w, []);
  expect(rank(w, 'finale')).toBe(0);
  expect(Object.values(w.keys)).not.toContain('finale');
});

test('벗으면 그 칸은 탭 1단계 스킬로, 그 스킬이 이미 다른 칸에 있으면 비운다', () => {
  const w = make('knight');
  wear(w, 'caliburx');
  w.keys = { cleave: 'finale', dash: null, shout: null, throw: null }; // 가르기를 Q에서 밀어냈다
  wear(w, null);
  gearKeys(w);
  expect(w.keys.cleave).toBe('cleave');
  wear(w, 'caliburx');
  w.keys = { cleave: 'cleave', dash: 'finale', shout: null, throw: null };
  wear(w, null);
  gearKeys(w);
  expect(w.keys).toEqual({ cleave: 'cleave', dash: null, shout: null, throw: null });
});

test('빈 칸이 없으면 끼우지 않지만, 스킬 창에서 직접 끼울 수 있다', () => {
  const w = make('knight');
  Object.assign(w.ranks, { dash: 1, shout: 1, throw: 1 });
  w.keys = { cleave: 'cleave', dash: 'dash', shout: 'shout', throw: 'throw' };
  wear(w, 'caliburx');
  gearKeys(w);
  expect(Object.values(w.keys)).not.toContain('finale');
  bind(w, 'throw', 'finale');
  expect(w.keys.throw).toBe('finale');
});

test('전설 스킬은 포인트로 배우지 못하고, 다른 직업은 그 전설을 들어도 생기지 않는다', () => {
  const w = make('knight');
  w.points = 5;
  wear(w, 'caliburx');
  expect(learnBlock(w, 'finale')).toBe('전설 장비가 주는 스킬');
  learn(w, 'finale');
  expect(w.ranks.finale).toBeUndefined();
  expect(w.points).toBe(5);
  const n = make('wizard');
  wear(n, 'caliburx');
  gearKeys(n);
  expect(Object.values(n.keys)).not.toContain('finale');
});

test('강령술사: 갇힌 왕의 두개골 → 무덤 왕의 귀환(소환 탭)', () => {
  const w = make('necromancer');
  wear(w, 'graveSkull');
  expect(SKILLS.graveKing).toMatchObject({ cls: 'necromancer', tab: 0 });
  expect(rank(w, 'graveKing')).toBe(2);
  gearKeys(w);
  expect(Object.values(w.keys)).toContain('graveKing');
});

test('저장: 칸의 전설 스킬은 비워 저장을 버리지 않는다(불러온 뒤 gearKeys가 다시 끼운다)', () => {
  const run = { name: '용사', marks: 0, news: false, took: false, runes: {}, beat: 0, marksBy: [0, 0, 0, 0], relics: 0, relicMiss: [0, 0, 0, 0], stash: [], cls: 'knight' as const, floor: 2, potions: 2, gear: { weapon: 4, armor: 2, helm: 2, boots: 2 }, mods: { weapon: [{ kind: 'unique' as const, value: 0, u: 'caliburx' as const }, { kind: 'tab' as const, value: 1, tab: 0 }], armor: [], helm: [], boots: [] }, ranks: { cleave: 1 }, points: 0, keys: { cleave: 'cleave' as const, dash: 'finale' as const, shout: null, throw: null }, bag: [], autoEquip: true, level: 1, xp: 0, gold: 0, cycle: 0, stats: { time: 0, kills: 0, deaths: 0 }, pity: 0, land: 'dungeon' as const, from: 'w' as const, stage: 0 };
  const back = decodeSave(encodeSave(run));
  expect(back).not.toBeNull();
  expect(back!.keys).toEqual({ cleave: 'cleave', dash: null, shout: null, throw: null });
});
