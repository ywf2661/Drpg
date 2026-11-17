// 발도 탭(기사 넷째). 설계: docs/superpowers/specs/2026-11-17-iaido-tab-design.md
import { expect, test } from 'vitest';
import { decodeSave, encodeSave } from '../save';
import { addMarks } from './iaido';
import { walkable } from './path';
import { hurt } from './core';
import { DT, MARK, type Command, type SkillId, type World } from './rules';
import { createWorld, learn, learnBlock, memoryStat, SKILLS, skillCost, step, TREES, useClass, type HeroClass } from './world';

const arena = (map: string[], ranks: Partial<Record<SkillId, number>>) => {
  const w = createWorld(1, map); useClass(w, 'knight'); Object.assign(w.ranks, ranks);
  Object.assign(w.keys, { cleave: 'mark', dash: ranks.sheathe ? 'sheathe' : null, shout: ranks.flash ? 'flash' : null, throw: null });
  for (const e of w.entities.slice(1)) Object.assign(e, { hp: 1e5, maxHp: 1e5, stunT: 1e9 });
  return w;
};
const runFor = (w: World, sec: number, cmds: Command[] = []) => { w.res = 100; step(w, cmds); for (let i = Math.round(sec / DT) - 1; i > 0; i--) step(w, []); };

test('기사는 탭 넷(넷째 = 발도), 다른 직업은 셋', () => {
  expect(TREES.knight.map((t) => t.name).slice(0, 4)).toEqual(['검술', '돌격', '투척', '발도']);
  expect(TREES.knight[3].skills).toEqual(['mark', 'sheathe', 'memory', 'flash']);
  for (const c of ['wizard', 'ranger', 'necromancer'] as HeroClass[]) expect(TREES[c]).toHaveLength(3);
  expect(SKILLS.memory).toEqual({ cls: 'knight', tab: 3, tier: 2 });
  expect(skillCost('knight', 'mark')).toBe(12);
  expect(skillCost('knight', 'flash')).toBe(36);
});
test('발도 단계: 그어두기는 Lv1, 납도는 Lv4 + 그어두기', () => {
  const w = createWorld(1, ['H....']); useClass(w, 'knight'); w.points = 5;
  expect(learnBlock(w, 'mark')).toBeNull();
  w.level = 4; expect(learnBlock(w, 'sheathe')).not.toBeNull(); // 아래 단계 없음
  learn(w, 'mark'); expect(learnBlock(w, 'sheathe')).toBeNull();
});
test('저장: 탭 옵션 3은 통과', () => {
  const run = (tab: number) => ({ cls: 'knight' as const, floor: 2, potions: 2, gear: { weapon: 2, armor: 2, helm: 2, boots: 2 }, mods: { weapon: [], armor: [{ kind: 'tab' as const, value: 1, tab }], helm: [], boots: [] }, ranks: { cleave: 1 }, points: 0, keys: { cleave: 'cleave' as const, dash: null, shout: null, throw: null }, bag: [], autoEquip: true, level: 1, xp: 0, gold: 0, cycle: 0, stats: { time: 0, kills: 0, deaths: 0 }, pity: 0, land: 'dungeon' as const, from: 'w' as const });
  expect(decodeSave(encodeSave(run(3)))).not.toBeNull();
});
test('그어두기: 맞은 적에 검흔 1, 예고 중이면 2, 5단계는 늘 2', () => {
  const w = arena(['Hm...'], { mark: 1 }); runFor(w, 1, [{ type: 'skill' }]);
  expect(w.entities[1].marks).toBe(1); expect(w.entities[1].hp).toBeLessThan(1e5);
  const c = arena(['Hm...'], { mark: 1 }); c.entities[1].phase = 'windup'; runFor(c, 1, [{ type: 'skill' }]);
  expect(c.entities[1].marks).toBe(2);
  const m = arena(['Hm...'], { mark: 5 }); runFor(m, 1, [{ type: 'skill' }]);
  expect(m.entities[1].marks).toBe(2);
});
test('한계 3에서 저절로 터진다(검흔 0, 피해, slash 기록)', () => {
  const w = arena(['Hm...'], { mark: 1 }); const e = w.entities[1];
  runFor(w, 1.6, [{ type: 'skill' }]); runFor(w, 1.6, [{ type: 'skill' }]);
  const before = e.hp; runFor(w, 0.6, [{ type: 'skill' }]); // 폭발 연출은 0.6초 뒤 사라지니 맞은 직후에 본다
  expect(e.marks).toBe(0); expect(before - e.hp).toBeGreaterThan(0);
  expect(w.blasts.some((b) => b.kind === 'slash' && b.n === 3)).toBe(true);
});
test('검의 기억 1단계: 한계 4, 지속 5초', () => {
  const w = arena(['Hm...'], { mark: 1, memory: 1 });
  expect(memoryStat(w)).toEqual({ cap: 4, time: 5 });
  for (let i = 0; i < 3; i++) runFor(w, 1.6, [{ type: 'skill' }]);
  expect(w.entities[1].marks).toBe(3);
});
test('시간이 지나면 터지지 않고 사라진다', () => {
  const w = arena(['Hm...'], { mark: 1 }); runFor(w, 1, [{ type: 'skill' }]);
  const hp = w.entities[1].hp; runFor(w, MARK.time + 0.1);
  expect(w.entities[1].marks).toBe(0); expect(w.entities[1].hp).toBe(hp);
});
test('보스에게도 새겨지고 터진다', () => {
  const w = arena(['HM...'], { mark: 1 }); const b = w.entities[1];
  b.marks = 2; b.markT = 4; addMarks(w, b, 1);
  expect(b.marks).toBe(0); expect(b.hp).toBeLessThan(1e5);
});

test('납도: 검흔이 없으면 안 나간다(대기·비용 없음)', () => {
  const w = arena(['Hm...'], { mark: 1, sheathe: 1 }); runFor(w, 0.1, [{ type: 'dash' }]);
  expect(w.dashCd).toBe(0); expect(w.entities[0].phase).toBe('none');
});
test('납도: 0.25초 뒤 8m 안 검흔이 전부 터진다, 그 전엔 그대로', () => {
  const w = arena(['Hm.......m'], { mark: 1, sheathe: 1 }); // 1m, 9m
  const [, a, far] = w.entities; Object.assign(a, { marks: 2, markT: 4 }); Object.assign(far, { marks: 2, markT: 4 });
  runFor(w, 0.2, [{ type: 'dash' }]);
  expect(w.entities[0].phase).toBe('sheathe'); expect(a.marks).toBe(2);
  expect(hurt(w, w.entities[0], 10)).toBeGreaterThan(0); // 무적 아님
  runFor(w, 0.1);
  expect(a.marks).toBe(0); expect(a.hp).toBeLessThan(1e5); expect(far.marks).toBe(2);
});
test('납도 중 주인공이 죽으면 터지지 않는다', () => {
  const w = arena(['Hm...'], { mark: 1, sheathe: 1 }); Object.assign(w.entities[1], { marks: 2, markT: 4 });
  runFor(w, 0.1, [{ type: 'dash' }]); hurt(w, w.entities[0], 1e6); runFor(w, 0.3);
  expect(w.entities[1].marks).toBe(2);
});
test('납도 5단계: 터져 죽은 적의 검흔이 2m 안 적에게 옮겨붙어 터진다', () => {
  const w = arena(['H.mm.'], { mark: 1, sheathe: 5 }); const [, a, b] = w.entities;
  Object.assign(a, { hp: 1, marks: 3, markT: 4 });
  runFor(w, 0.3, [{ type: 'dash' }]);
  expect(a.state).toBe('dead'); expect(b.hp).toBeLessThan(1e5); expect(b.marks).toBe(0);
});

test('일섬: 6m 안 적이 없으면 안 나간다', () => {
  const w = arena(['H.......m'], { mark: 1, sheathe: 1, memory: 1, flash: 1 }); runFor(w, 0.1, [{ type: 'shout' }]);
  expect(w.shoutCd).toBe(0);
});
test('일섬: 검흔 많은 적부터, 도는 동안 무적, 끝나면 자동 납도로 전부 터진다', () => {
  const w = arena(['H.m.m....'], { mark: 1, sheathe: 1, memory: 1, flash: 1 }); const [hero, a, b] = w.entities;
  Object.assign(b, { marks: 1, markT: 4 });
  step(w, [{ type: 'shout' }]);
  expect(w.flashQ[0]).toBe(b.id); expect(hero.phase).toBe('flash'); expect(hurt(w, hero, 10)).toBe(0);
  runFor(w, 1.5);
  expect(hero.phase).toBe('none'); expect([a.marks, b.marks]).toEqual([0, 0]);
  expect(a.hp).toBeLessThan(1e5); expect(b.hp).toBeLessThan(1e5);
});
test('일섬 도중에는 한계를 넘어도 안 터진다', () => {
  const w = arena(['Hm...'], { mark: 1 }); const e = w.entities[1]; Object.assign(e, { marks: 2, markT: 4 });
  w.entities[0].phase = 'flash'; addMarks(w, e, 2); expect(e.marks).toBe(4);
});
test('일섬: 다음 대상이 이미 죽었으면 건너뛰고 끝난다', () => {
  const w = arena(['H.m.m....'], { mark: 1, flash: 1 }); step(w, [{ type: 'shout' }]);
  hurt(w, w.entities[w.flashQ[1]], 1e6); runFor(w, 1.5);
  expect(w.entities[0].phase).toBe('none');
});
test('일섬: 대상 뒤가 벽이면 벽 앞에서 멈춘다', () => {
  const w = arena(['H.m#.'], { mark: 1, flash: 1 }); runFor(w, 1, [{ type: 'shout' }]);
  const h = w.entities[0]; expect(h.phase).toBe('none'); expect(walkable(w.grid, Math.floor(h.x), Math.floor(h.z))).toBe(true);
});
test('일섬: 적을 밀지도 밀리지도 않고 뚫고 지나간다(대상 1m 뒤에 선다)', () => {
  const w = arena(['H.m......'], { mark: 1, flash: 1 }); const [h, e] = w.entities; const [ex, ez] = [e.x, e.z];
  step(w, [{ type: 'shout' }]); w.res = 100;
  for (let i = 0; i < 60 && h.phase === 'flash'; i++) step(w, []);
  expect(h.phase).toBe('none'); expect([e.x, e.z]).toEqual([ex, ez]);
  expect(h.x - ex).toBeGreaterThan(0.8); expect(h.x - ex).toBeLessThan(1.5);
});
test('일섬: 걷는 중에 써도 끝난 뒤 옛 중간 지점이 아니라 목적지로 간다', () => {
  const w = arena(['H.m.#...', '....#...', '........'], { mark: 1, sheathe: 1, memory: 1, flash: 1 }); const h = w.entities[0];
  step(w, [{ type: 'move', x: 7.5, z: 0.5 }]);
  for (let i = 0; i < 5; i++) step(w, []);
  expect(h.path.length).toBeGreaterThan(1);
  const dest = h.path[h.path.length - 1];
  w.res = 100; step(w, [{ type: 'shout' }]);
  expect(h.phase).toBe('flash'); expect(h.path).toEqual([dest]);
  for (let i = 0; i < 90 && h.phase === 'flash'; i++) step(w, []);
  expect(h.phase).toBe('none'); expect(h.path[h.path.length - 1]).toEqual(dest);
});
test('저절로 터질 때도 발도 탭 시너지가 곱해진다', () => {
  const dmg = (sheathe: number) => {
    const w = arena(['Hm...'], { mark: 1, sheathe }); const e = w.entities[1];
    addMarks(w, e, 3); return 1e5 - e.hp;
  };
  expect(dmg(3)).toBeGreaterThan(dmg(0));
});
test('저장: 마법사는 탭 3 옵션 거부, 기사는 통과', () => {
  const run = (cls: 'knight' | 'wizard') => ({ cls, floor: 2, potions: 2, gear: { weapon: 2, armor: 2, helm: 2, boots: 2 }, mods: { weapon: [], armor: [{ kind: 'tab' as const, value: 1, tab: 3 }], helm: [], boots: [] }, ranks: { cleave: 1 }, points: 0, keys: { cleave: 'cleave' as const, dash: null, shout: null, throw: null }, bag: [], autoEquip: true, level: 1, xp: 0, gold: 0, cycle: 0, stats: { time: 0, kills: 0, deaths: 0 }, pity: 0, land: 'dungeon' as const, from: 'w' as const });
  expect(decodeSave(encodeSave(run('wizard')))).toBeNull();
  expect(decodeSave(encodeSave(run('knight')))).not.toBeNull();
});
test('그어두기만 markSlashes를 올린다(가르기·회오리는 안 올린다)', () => {
  const w = arena(['Hm...'], { mark: 1 }); runFor(w, 1, [{ type: 'skill' }]);
  expect(w.markSlashes).toBe(1); expect(w.cleaves).toBe(1);
});
