// 발도 탭(기사 넷째): 칼선. 설계: docs/superpowers/specs/2026-11-18-iaido-cutline-design.md
import { expect, test } from 'vitest';
import { decodeSave, encodeSave } from '../save';
import { addCut } from './iaido';
import { walkable } from './path';
import { hurt } from './core';
import { CUT, DT, type Command, type SkillId, type World } from './rules';
import { createWorld, learn, learnBlock, markStat, SKILLS, skillCost, step, TREES, useClass, type HeroClass } from './world';

const arena = (map: string[], ranks: Partial<Record<SkillId, number>>) => {
  const w = createWorld(1, map); useClass(w, 'knight'); Object.assign(w.ranks, ranks);
  Object.assign(w.keys, { cleave: 'mark', dash: ranks.graze ? 'graze' : null, shout: ranks.flash ? 'flash' : null, throw: null });
  for (const e of w.entities.slice(1)) Object.assign(e, { hp: 1e5, maxHp: 1e5, stunT: 1e9 });
  return w;
};
const runFor = (w: World, sec: number, cmds: Command[] = []) => { w.res = 100; step(w, cmds); for (let i = Math.round(sec / DT) - 1; i > 0; i--) step(w, []); };
const run = (patch: object = {}) => ({ name: '용사', marks: 0, news: false, took: false, runes: {}, beat: 0, marksBy: [0, 0, 0, 0], relics: 0, relicMiss: [0, 0, 0, 0], stash: [], cls: 'knight' as const, floor: 2, potions: 2, gear: { weapon: 2, armor: 2, helm: 2, boots: 2 }, mods: { weapon: [], armor: [], helm: [], boots: [] }, ranks: { cleave: 1 }, points: 0, keys: { cleave: 'cleave' as const, dash: null, shout: null, throw: null }, bag: [], autoEquip: true, level: 1, xp: 0, gold: 0, cycle: 0, stats: { time: 0, kills: 0, deaths: 0 }, pity: 0, land: 'dungeon' as const, from: 'w' as const, stage: 0, ...patch });

test('기사는 탭 넷째가 발도, 다른 직업은 셋', () => {
  expect(TREES.knight.map((t) => t.name).slice(0, 4)).toEqual(['검술', '돌격', '투척', '발도']);
  expect(TREES.knight[3].skills).toEqual(['mark', 'graze', 'echo', 'flash']);
  for (const c of ['ranger', 'necromancer'] as HeroClass[]) expect(TREES[c]).toHaveLength(3);
  expect(TREES.wizard).toHaveLength(4);
  expect(SKILLS.echo).toEqual({ cls: 'knight', tab: 3, tier: 2 });
  expect([skillCost('knight', 'mark'), skillCost('knight', 'graze'), skillCost('knight', 'flash')]).toEqual([12, 24, 36]);
});
test('발도 단계: 그어두기는 Lv1, 스쳐 베기는 Lv4 + 그어두기', () => {
  const w = createWorld(1, ['H....']); useClass(w, 'knight'); w.points = 5;
  expect(learnBlock(w, 'mark')).toBeNull();
  w.level = 4; expect(learnBlock(w, 'graze')).not.toBeNull(); // 아래 단계 없음
  learn(w, 'mark'); expect(learnBlock(w, 'graze')).toBeNull();
});
test('저장: 탭 옵션 3은 기사만, 옛 납도·검의 기억은 스쳐 베기·칼의 여운으로 읽는다', () => {
  const tab = (cls: 'knight' | 'wizard') => run({ cls, mods: { weapon: [], armor: [{ kind: 'tab' as const, value: 1, tab: 3 }], helm: [], boots: [] } });
  expect(decodeSave(encodeSave(tab('wizard')))).toBeNull();
  expect(decodeSave(encodeSave(tab('knight')))).not.toBeNull();
  const now = run({ ranks: { mark: 1, graze: 2, echo: 1 }, keys: { cleave: 'mark', dash: 'graze', shout: null, throw: null } });
  const old = encodeSave(now).replace('"graze":', '"sheathe":').replace('"dash":"graze"', '"dash":"sheathe"').replace('"echo":', '"memory":');
  expect(old).toContain('sheathe'); expect(old).toContain('memory');
  const back = decodeSave(old)!;
  expect(back.ranks).toEqual({ mark: 1, graze: 2, echo: 1 }); expect(back.keys.dash).toBe('graze');
});

test('그어두기: 바로는 약하게 베고, 1초 뒤 칼선이 베인다', () => {
  const w = arena(['Hm...'], { mark: 1 }); const e = w.entities[1];
  runFor(w, 0.6, [{ type: 'skill' }]);
  const first = 1e5 - e.hp;
  expect(first).toBeGreaterThan(0); expect(w.cuts).toHaveLength(1); expect(w.cuts[0].src).toBe('mark');
  runFor(w, 1);
  expect(w.cuts).toHaveLength(0); expect(1e5 - e.hp).toBeGreaterThan(first);
  expect(w.markSlashes).toBe(1); expect(w.cleaves).toBe(1);
});
test('그어두기 5단계: 앞뒤 모두 베고 둥근 칼선', () => {
  const w = arena(['mHm'], { mark: 5 }); runFor(w, 0.6, [{ type: 'skill' }]);
  expect(w.entities[1].hp).toBeLessThan(1e5); expect(w.entities[2].hp).toBeLessThan(1e5);
  expect(w.cuts[0].segs).toHaveLength(24);
});
test('칼선: ① 그을 때 벤 적은 떠나도 맞고 ② 그 순간 선 위에 선 적도 맞는다. 둘 다 아니면 안 맞는다', () => {
  const w = arena(['H.....', '......', '..m.mm'], { mark: 1 }); const [, a, b, c] = w.entities;
  addCut(w, [[0, 0.5, 6, 0.5]], 1, [a], 'mark'); // a: 그을 때 벤 적(지금은 선에서 2m)
  Object.assign(b, { x: 3, z: 0.7 }); // b: 선을 밟았다
  runFor(w, CUT.delay + 0.05);
  expect(a.hp).toBeLessThan(1e5); expect(b.hp).toBeLessThan(1e5); expect(c.hp).toBe(1e5);
  expect(w.cuts).toHaveLength(0); expect(w.snapped).toHaveLength(1);
});
test('칼선: 그을 때 벤 적이 선 위에 있어도 한 번만 맞는다. 칼선이 둘이면 두 번', () => {
  const hits = (n: number) => {
    const w = arena(['H.m..'], { mark: 1 }); const e = w.entities[1];
    for (let i = 0; i < n; i++) addCut(w, [[0, 0.5, 4, 0.5]], 1, [e], 'mark');
    runFor(w, CUT.delay + 0.05); return w.blasts.filter((b) => b.kind === 'slash').length;
  };
  expect(hits(1)).toBe(1); expect(hits(2)).toBe(2);
});
test('칼선 배율에는 발도 탭 시너지가 들어간다', () => {
  expect(markStat(arena(['H'], { mark: 1, graze: 3 })).cut).toBeGreaterThan(markStat(arena(['H'], { mark: 1 })).cut);
});

test('스쳐 베기: 순식간에 6m 지나가고(무적), 바로는 안 베고 1초 뒤 지나온 길이 베인다', () => {
  const w = arena(['H.m.m....'], { mark: 1, graze: 1 }); const [h, a, b] = w.entities;
  step(w, [{ type: 'dash', x: 8.5, z: 0.5 }]);
  expect(h.phase).toBe('graze'); expect(hurt(w, h, 10)).toBe(0);
  runFor(w, 0.2);
  expect(h.phase).toBe('none'); expect(h.x).toBeCloseTo(6.5, 0);
  expect([a.hp, b.hp]).toEqual([1e5, 1e5]); expect(w.cuts).toHaveLength(1);
  runFor(w, 1);
  expect(a.hp).toBeLessThan(1e5); expect(b.hp).toBeLessThan(1e5);
});
test('스쳐 베기: 벽 앞에서 멈춘다', () => {
  const w = arena(['H..#....'], { mark: 1, graze: 1 }); runFor(w, 0.3, [{ type: 'dash', x: 7.5, z: 0.5 }]);
  const h = w.entities[0]; expect(h.phase).toBe('none'); expect(walkable(w.grid, Math.floor(h.x), Math.floor(h.z))).toBe(true);
});
test('스쳐 베기 5단계: 칼선에 베여 죽은 적이 있으면 바로 다시 쓸 수 있다', () => {
  const cdAfter = (rank: number) => {
    const w = arena(['H.m....'], { mark: 1, graze: rank }); w.entities[1].hp = 1;
    runFor(w, 1.3, [{ type: 'dash', x: 6.5, z: 0.5 }]); return w.dashCd;
  };
  expect(cdAfter(5)).toBe(0); expect(cdAfter(1)).toBeGreaterThan(0);
});

test('칼의 여운: 베는 스킬 두 번이면 가득, 발도 스킬은 쓰지 않고 다음 다른 탭 베기가 칼선을 남긴다', () => {
  const w = arena(['Hm...'], { mark: 1, echo: 1, cleave: 1 }); w.keys.throw = 'cleave';
  runFor(w, 1.6, [{ type: 'skill' }]); expect(w.echo).toBe(1);
  runFor(w, 1.6, [{ type: 'skill' }]); expect(w.echo).toBe(2);
  runFor(w, 1.6, [{ type: 'skill' }]); expect(w.echo).toBe(2); // 그어두기는 원래 칼선이 있다: 여운을 쓰지 않는다
  runFor(w, 0.6, [{ type: 'throw' }]);
  expect(w.echo).toBe(0); expect(w.cuts.some((c) => c.src === 'echo')).toBe(true);
});
test('칼의 여운: 안 배웠으면 칸이 차지 않는다', () => {
  const w = arena(['Hm...'], { mark: 1 }); runFor(w, 0.6, [{ type: 'skill' }]); expect(w.echo).toBe(0);
});
test('칼의 여운: 회오리는 다 돈 자리에 원, 돌진 베기는 직선', () => {
  const spin = arena(['Hm...'], { echo: 1, whirl: 1 }); Object.assign(spin, { echo: 2 }); spin.keys.throw = 'whirl';
  runFor(spin, 2.1, [{ type: 'throw' }]);
  const ring = spin.cuts.find((c) => c.src === 'echo'); expect(ring?.segs).toHaveLength(24); expect(ring?.hit).toContain(spin.entities[1].id);
  const dash = arena(['H.m....'], { echo: 1, dash: 1 }); Object.assign(dash, { echo: 2 }); dash.keys.throw = 'dash';
  runFor(dash, 0.8, [{ type: 'throw', x: 6.5, z: 0.5 }]);
  expect(dash.cuts.find((c) => c.src === 'echo')?.segs).toHaveLength(1);
});

test('일섬: 6m 안 적이 없으면 안 나간다', () => {
  const w = arena(['H.......m'], { mark: 1, flash: 1 }); runFor(w, 0.1, [{ type: 'shout' }]);
  expect(w.shoutCd).toBe(0);
});
test('일섬: 도는 동안 무적, 끝에서 바닥의 칼선이 모두 바로 베이고 여운이 가득 찬다', () => {
  const w = arena(['H.m.m....', '.........', '.........', '.........', '.....m...'], { mark: 1, echo: 1, flash: 1 }); const [hero, a, b, far] = w.entities;
  addCut(w, [[4, 4.5, 7, 4.5]], 1, [], 'mark'); // 미리 그어 둔 칼선(일섬과 떨어진 곳)
  step(w, [{ type: 'shout' }]);
  expect(hero.phase).toBe('flash'); expect(hurt(w, hero, 10)).toBe(0);
  for (let i = 0; i < 90 && hero.phase === 'flash'; i++) step(w, []);
  expect(hero.phase).toBe('none'); expect(w.cuts).toHaveLength(0); expect(w.snapped).toHaveLength(2);
  expect(a.hp).toBeLessThan(1e5); expect(b.hp).toBeLessThan(1e5); expect(far.hp).toBeLessThan(1e5); expect(w.echo).toBe(2);
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
  const w = arena(['H.m.#...', '....#...', '........'], { mark: 1, flash: 1 }); const h = w.entities[0];
  step(w, [{ type: 'move', x: 7.5, z: 0.5 }]);
  for (let i = 0; i < 5; i++) step(w, []);
  expect(h.path.length).toBeGreaterThan(1);
  const dest = h.path[h.path.length - 1];
  w.res = 100; step(w, [{ type: 'shout' }]);
  expect(h.phase).toBe('flash'); expect(h.path).toEqual([dest]);
  for (let i = 0; i < 90 && h.phase === 'flash'; i++) step(w, []);
  expect(h.phase).toBe('none'); expect(h.path[h.path.length - 1]).toEqual(dest);
});

