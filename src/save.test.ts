import { expect, test } from 'vitest';
import { decodeSave, encodeSave, formatTime } from './save';

const run = { floor: 3, potions: 4, gear: { weapon: 3, armor: 2 }, level: 6, xp: 12, gold: 133, cycle: 1, mods: { weapon: [{ kind: 'dmg' as const, value: 20 }], armor: [] }, ranks: { cleave: 3, dash: 1, shout: 2, throw: 5 }, points: 1, bag: [{ kind: 'armor' as const, tier: 2, affixes: [{ kind: 'thorns' as const, value: 30 }], x: 3, y: 2 }, { kind: 'weapon' as const, tier: 4, affixes: [], x: 0, y: 1 }], autoEquip: false, stats: { time: 754.2, kills: 41, deaths: 2 } };

test('저장한 진행을 그대로 되읽는다', () => {
  expect(decodeSave(encodeSave(run))).toEqual(run);
});

test('손상되거나 범위를 벗어난 저장은 무시한다(null)', () => {
  expect(decodeSave(null)).toBeNull();
  expect(decodeSave('')).toBeNull();
  expect(decodeSave('{not json')).toBeNull();
  expect(decodeSave('[]')).toBeNull();
  const bad = (patch: object) => decodeSave(JSON.stringify({ v: 1, ...run, ...patch }));
  expect(bad({})).toEqual(run);
  expect(bad({ v: 99 })).toBeNull(); // 다른 형식 버전
  expect(bad({ floor: 0 })).toBeNull();
  expect(bad({ floor: 6 })).toBeNull();
  expect(bad({ floor: 2.5 })).toBeNull();
  expect(bad({ potions: -1 })).toBeNull();
  expect(bad({ potions: 9 })).toBeNull();
  expect(bad({ gear: { weapon: 5, armor: 1 } })).toBeNull();
  expect(bad({ gear: null })).toBeNull();
  expect(bad({ level: 0 })).toBeNull();
  expect(bad({ xp: -3 })).toBeNull();
  expect(bad({ level: '7' })).toBeNull();
  expect(bad({ gold: -5 })).toBeNull();
  expect(bad({ gold: 1.5 })).toBeNull();
  expect(bad({ cycle: -1 })).toBeNull();
  expect(bad({ mods: { weapon: [{ kind: 'life', value: 20 }], armor: [] } })).toBeNull(); // 부위가 다른 옵션
  expect(bad({ mods: { weapon: [{ kind: 'dmg', value: 999 }], armor: [] } })).toBeNull(); // 범위 밖
  expect(bad({ mods: 'x' })).toBeNull();
  expect(bad({ ranks: { cleave: 6, dash: 1, shout: 1, throw: 1 } })).toBeNull();
  expect(bad({ ranks: { cleave: 1 } })).toBeNull();
  expect(bad({ points: -1 })).toBeNull();
  expect(bad({ bag: 'x' })).toBeNull();
  const at = (x: unknown, y: unknown) => ({ kind: 'weapon', tier: 4, affixes: [], x, y }); // 2×3
  expect(bad({ bag: [at(0, 0), at(1, 1)] })).toBeNull(); // 겹침
  expect(bad({ bag: [at(9, 0)] })).toBeNull(); // 격자 밖
  expect(bad({ bag: [at(0, 2)] })).toBeNull();
  expect(bad({ bag: [at(0, '0')] })).toBeNull();
  expect(bad({ bag: [at(0, undefined)] })).toBeNull(); // 자리가 반만 있음
  expect(bad({ bag: [null] })).toBeNull();
  expect(bad({ bag: [{ kind: 'potion', tier: 1, affixes: [] }] })).toBeNull();
  expect(bad({ bag: [{ kind: 'weapon', tier: 5, affixes: [] }] })).toBeNull();
  expect(bad({ bag: [{ kind: 'weapon', tier: 1 }] })).toBeNull();
  expect(bad({ bag: [{ kind: 'weapon', tier: 1, affixes: [{ kind: 'life', value: 20 }] }] })).toBeNull(); // 부위가 다른 옵션
  expect(bad({ bag: [{ kind: 'weapon', tier: 1, affixes: [{ kind: 'dmg', value: 999 }] }] })).toBeNull();
  expect(bad({ autoEquip: 'yes' })).toBeNull();
});

test('격자가 생기기 전 저장: 보관함을 빈 자리에 차례로 놓고, 안 들어가는 장비는 판 값의 금화로', () => {
  const plate = { kind: 'armor', tier: 4, affixes: [] }; // 2×3: 5벌까지 들어간다. 판 값 40
  const r = decodeSave(JSON.stringify({ v: 1, ...run, bag: Array(8).fill(plate) }))!;
  expect(r.bag).toEqual([0, 2, 4, 6, 8].map((x) => ({ ...plate, x, y: 0 })));
  expect(r.gold).toBe(run.gold + 3 * 40);
});

test('기록(stats)이 없는 이전 저장은 0으로 채운다, 이상한 기록은 무시', () => {
  const old = JSON.stringify({ v: 1, floor: 2, potions: 1, gear: { weapon: 2, armor: 2 }, level: 3, xp: 5 });
  expect(decodeSave(old)?.stats).toEqual({ time: 0, kills: 0, deaths: 0 });
  expect(decodeSave(old)?.gold).toBe(0); // 금화가 생기기 전 저장
  expect(decodeSave(old)?.cycle).toBe(0); // 회차가 생기기 전 저장
  expect(decodeSave(old)?.mods).toEqual({ weapon: [], armor: [] }); // 마법 옵션이 생기기 전 저장
  expect(decodeSave(old)?.ranks).toEqual({ cleave: 1, dash: 1, shout: 1, throw: 1 }); // 스킬 성장이 생기기 전 저장
  expect(decodeSave(old)?.points).toBe(0);
  expect(decodeSave(old)?.bag).toEqual([]); // 보관함이 생기기 전 저장
  expect(decodeSave(old)?.autoEquip).toBe(true);
  const weird = JSON.stringify({ v: 1, floor: 2, potions: 1, gear: { weapon: 2, armor: 2 }, level: 3, xp: 5, stats: { time: -1, kills: 'x' } });
  expect(decodeSave(weird)).toBeNull();
});

test('플레이 시간 표시', () => {
  expect(formatTime(0)).toBe('0:00');
  expect(formatTime(65.9)).toBe('1:05');
  expect(formatTime(3725)).toBe('1:02:05');
});
