import { expect, test } from 'vitest';
import { decodeSave, encodeSave, formatTime } from './save';

const run = { name: '용사', pity: 0, cls: 'wizard' as const, floor: 3, potions: 4, gear: { weapon: 3, armor: 2, helm: 3, boots: 1 }, level: 6, xp: 12, gold: 133, cycle: 1, mods: { weapon: [{ kind: 'dmg' as const, value: 20 }], armor: [], helm: [{ kind: 'guard' as const, value: 7 }], boots: [{ kind: 'move' as const, value: 6 }] }, ranks: { fireball: 3, firefield: 1, frost: 2, embers: 5 }, points: 1, keys: { cleave: 'fireball' as const, dash: null, shout: 'frost' as const, throw: 'firefield' as const }, bag: [{ kind: 'armor' as const, tier: 2, affixes: [{ kind: 'thorns' as const, value: 30 }], x: 3, y: 2 }, { kind: 'weapon' as const, tier: 4, affixes: [], x: 0, y: 1 }, { kind: 'boots' as const, tier: 3, affixes: [{ kind: 'move' as const, value: 9 }], x: 6, y: 0 }], autoEquip: false, stats: { time: 754.2, kills: 41, deaths: 2 }, land: 'snow' as const, from: 'e' as const, stage: 2, marks: 5, news: true, took: true, runes: { gale: 3, 'fireball+2': 1, 'key:dash': 1 }, beat: 5, marksBy: [1, 0, 7, 0], relics: 5, relicMiss: [0, 2, 0, 1], stash: [{ kind: 'helm' as const, tier: 1, affixes: [], x: 8, y: 6 }], act2: 0 };

test('소켓·꽂힌 룬·룬 주머니·2회차 진행을 되읽고, 소켓보다 많은 룬·다른 직업 스킬 룬은 버린다', () => {
  const sock = { ...run, mods: { ...run.mods, weapon: [{ kind: 'dmg' as const, value: 20 }, { kind: 'socket' as const, value: 2 }, { kind: 'move' as const, value: 4, r: 'gale' }, { kind: 'skill' as const, value: 1, skill: 'fireball' as const, r: 'fireball+1' }] } };
  expect(decodeSave(encodeSave(sock))).toEqual(sock);
  const over = { ...sock, mods: { ...sock.mods, weapon: [{ kind: 'socket' as const, value: 1 }, { kind: 'move' as const, value: 4, r: 'gale' }, { kind: 'crit' as const, value: 4, r: 'spark' }] } };
  expect(decodeSave(encodeSave(over))).toBeNull();
  expect(decodeSave(encodeSave({ ...run, runes: { 'cleave+1': 1 } }))).toBeNull(); // 기사 스킬 룬을 마법사가
  const forged = { ...sock, mods: { ...sock.mods, weapon: [{ kind: 'socket' as const, value: 1 }, { kind: 'move' as const, value: 99, r: 'gale' }] } };
  expect(decodeSave(encodeSave(forged))!.mods.weapon[1].value).toBe(4); // 룬 값은 표에서 다시 만든다
});

test('저장한 진행을 그대로 되읽는다', () => {
  expect(decodeSave(encodeSave(run))).toEqual(run);
});

test('손상되거나 범위를 벗어난 저장은 무시한다(null)', () => {
  expect(decodeSave(null)).toBeNull();
  expect(decodeSave('')).toBeNull();
  expect(decodeSave('{not json')).toBeNull();
  expect(decodeSave('[]')).toBeNull();
  const bad = (patch: object) => decodeSave(JSON.stringify({ v: 2, ...run, ...patch }));
  expect(bad({})).toEqual(run);
  expect(bad({ v: 99 })).toBeNull(); // 다른 형식 버전
  expect(bad({ floor: 0 })).toBeNull();
  expect(bad({ floor: 6 })).toBeNull();
  expect(bad({ floor: 2.5 })).toBeNull();
  expect(bad({ potions: -1 })).toBeNull();
  expect(bad({ potions: 9 })).toBeNull();
  expect(bad({ gear: { weapon: 5, armor: 1 } })).toBeNull();
  expect(bad({ gear: { ...run.gear, helm: 5 } })).toBeNull();
  expect(bad({ mods: { ...run.mods, helm: [{ kind: 'dmg', value: 20 }] } })).toBeNull(); // 투구에 붙지 않는 옵션
  expect(bad({ mods: { ...run.mods, boots: [{ kind: 'move', value: 99 }] } })).toBeNull();
  expect(bad({ gear: null })).toBeNull();
  expect(bad({ cls: 'thief' })).toBeNull();
  expect(bad({ level: 0 })).toBeNull();
  expect(bad({ xp: -3 })).toBeNull();
  expect(bad({ level: '7' })).toBeNull();
  expect(bad({ gold: -5 })).toBeNull();
  expect(bad({ gold: 1.5 })).toBeNull();
  expect(bad({ cycle: -1 })).toBeNull();
  expect(bad({ stage: 4 })).toBeNull();
  expect(bad({ stage: undefined })).toBeNull();
  expect(bad({ land: 'snow', floor: 0 })).toBeNull(); // 층 0은 야영지만
  expect(bad({ mods: { weapon: [{ kind: 'life', value: 20 }], armor: [] } })).toBeNull(); // 부위가 다른 옵션
  expect(bad({ mods: { weapon: [{ kind: 'dmg', value: 999 }], armor: [] } })).toBeNull(); // 범위 밖
  expect(bad({ mods: 'x' })).toBeNull();
  expect(bad({ ranks: { fireball: 6 } })).toBeNull();
  expect(bad({ ranks: { cleave: 1 } })).toBeNull(); // 다른 직업의 스킬
  expect(bad({ ranks: { fireball: 0 } })).toBeNull();
  expect(bad({ keys: { cleave: 'comet', dash: null, shout: null, throw: null } })).toBeNull(); // 안 배운 스킬
  expect(bad({ keys: { cleave: 'embers', dash: null, shout: null, throw: null } })).toBeNull(); // 패시브
  expect(bad({ keys: { cleave: 'fireball', dash: 'fireball', shout: null, throw: null } })).toBeNull(); // 겹침
  expect(bad({ keys: 'x' })).toBeNull();
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
  const r = decodeSave(JSON.stringify({ v: 2, ...run, bag: Array(8).fill(plate) }))!;
  expect(r.bag).toEqual([0, 2, 4, 6, 8].map((x) => ({ ...plate, x, y: 0 })));
  expect(r.gold).toBe(run.gold + 3 * 40);
});

test('기록(stats)이 없는 이전 저장은 0으로 채운다, 이상한 기록은 무시', () => {
  const old = JSON.stringify({ v: 1, floor: 2, potions: 1, gear: { weapon: 2, armor: 2 }, level: 3, xp: 5 });
  expect(decodeSave(old)?.stats).toEqual({ time: 0, kills: 0, deaths: 0 });
  expect(decodeSave(old)?.cls).toBe('knight'); // 직업이 생기기 전 저장
  expect(decodeSave(old)?.gold).toBe(0); // 금화가 생기기 전 저장
  expect(decodeSave(old)?.cycle).toBe(0); // 회차가 생기기 전 저장
  expect(decodeSave(old)?.mods).toEqual({ weapon: [], armor: [], helm: [], boots: [] }); // 마법 옵션이 생기기 전 저장
  expect(decodeSave(old)?.gear).toEqual({ weapon: 2, armor: 2, helm: 1, boots: 1 }); // 투구·신발이 생기기 전 저장
  // 스킬 트리 전 저장: 새 판의 스킬로 돌리고 레벨만큼 포인트를 돌려준다
  expect(decodeSave(old)?.ranks).toEqual({ cleave: 1 });
  expect(decodeSave(old)?.keys).toEqual({ cleave: 'cleave', dash: null, shout: null, throw: null });
  expect(decodeSave(old)?.points).toBe((JSON.parse(old).level as number) - 1);
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

test('도끼 폭풍 저장: 단계는 사슬 도끼로 옮기고, 끼워 둔 칸은 비운다', () => {
  const old = { ...run, cls: 'knight' as const, runes: {}, ranks: { cleave: 2, throw: 1, bounce: 1, axes: 1, axeStorm: 3 }, keys: { cleave: 'cleave', dash: 'axeStorm', shout: null, throw: 'throw' } };
  const got = decodeSave(encodeSave(old as never));
  expect(got?.ranks).toEqual({ cleave: 2, throw: 1, bounce: 1, axes: 1, chainAxe: 3 });
  expect(got?.keys).toEqual({ cleave: 'cleave', dash: null, shout: null, throw: 'throw' });
});

test('궁수 저장도 직업을 그대로 되읽고, 다른 직업의 스킬이 든 저장은 버린다', () => {
  const ranger = { ...run, runes: { gale: 1 }, cls: 'ranger' as const, ranks: { pierce: 2, trap: 1 }, keys: { cleave: 'pierce' as const, dash: 'trap' as const, shout: null, throw: null } };
  expect(decodeSave(encodeSave(ranger))?.cls).toBe('ranger');
  expect(decodeSave(encodeSave({ ...run, cls: 'ranger' }))).toBeNull(); // 마법사 스킬
});

test('지역·들어온 가장자리: 이상하면 무시', () => {
  expect(decodeSave(JSON.stringify({ v: 2, ...run, land: 'moon' }))).toBeNull();
  expect(decodeSave(JSON.stringify({ v: 2, ...run, from: 'x' }))).toBeNull();
});

test('야영지 이전 저장(버전 1): 캐릭터·장비·금화·회차는 그대로, 하던 구역은 버리고 야영지·이야기 1단계로', () => {
  const { stage: _s, ...v1 } = run;
  const r = decodeSave(JSON.stringify({ v: 1, ...v1 }))!;
  expect(r).toEqual({ ...run, land: 'camp', floor: 0, stage: 0, marks: 0, news: false, took: false });
  const { land: _l, from: _f, ...older } = v1; // 지역이 생기기 전
  expect(decodeSave(JSON.stringify({ v: 1, ...older }))).toMatchObject({ land: 'camp', floor: 0, stage: 0 });
});

test('야영지 저장(층 0)을 그대로 되읽는다', () => {
  const camp = { ...run, land: 'camp' as const, floor: 0, stage: 3 };
  expect(decodeSave(encodeSave(camp))).toEqual(camp);
});

test('아이디: 없으면(슬롯 이전 저장) 모험가, 비었거나 너무 길면 버린다', () => {
  const { name: _, ...noName } = run;
  expect(decodeSave(JSON.stringify({ v: 2, ...noName }))?.name).toBe('모험가');
  expect(decodeSave(JSON.stringify({ v: 2, ...run, name: '  ' }))).toBeNull();
  expect(decodeSave(JSON.stringify({ v: 2, ...run, name: 'x'.repeat(13) }))).toBeNull();
  expect(decodeSave(JSON.stringify({ v: 2, ...run, name: 7 }))).toBeNull();
});

test('의뢰 진행(marks): 없으면 0, 0~7 정수가 아니면 버린다', () => {
  const { marks: _, ...noMarks } = run;
  expect(decodeSave(JSON.stringify({ v: 2, ...noMarks }))?.marks).toBe(0);
  for (const bad of [8, -1, 1.5, '3']) expect(decodeSave(JSON.stringify({ v: 2, ...run, marks: bad }))).toBeNull();
});

test('대장의 새 이야기(news)·받은 부탁(took): 없으면 news는 끄고 took은 의뢰를 하나라도 했으면 켠다, 참·거짓이 아니면 버린다', () => {
  const { news: _n, took: _t, ...older } = run;
  expect(decodeSave(JSON.stringify({ v: 2, ...older }))).toMatchObject({ news: false, took: true });
  expect(decodeSave(JSON.stringify({ v: 2, ...older, marks: 0 }))).toMatchObject({ news: false, took: false });
  expect(decodeSave(JSON.stringify({ v: 2, ...run, news: 1 }))).toBeNull();
  expect(decodeSave(JSON.stringify({ v: 2, ...run, took: 'y' }))).toBeNull();
});

test('성물이 생기기 전 저장은 성물 0개, 범위를 벗어난 성물·놓친 횟수는 무시', () => {
  const { relics: _r, relicMiss: _m, ...old } = run;
  const r = decodeSave(JSON.stringify({ v: 2, ...old }))!;
  expect([r.relics, r.relicMiss]).toEqual([0, [0, 0, 0, 0]]);
  const bad = (patch: object) => decodeSave(JSON.stringify({ v: 2, ...run, ...patch }));
  expect(bad({ relics: 32 })).toBeNull(); // 비트 4 = 작은 목마까지(0~31)
  expect(decodeSave(JSON.stringify({ ...JSON.parse(encodeSave(r)), relics: 31 }))!.relics).toBe(31);
  expect(bad({ relicMiss: [0, 3, 0, 0] })).toBeNull();
  expect(bad({ relicMiss: [0, 0] })).toBeNull();
  expect(decodeSave(encodeSave({ ...run, land: 'sanctum', floor: 4 }))?.land).toBe('sanctum');
});

test('창고: 그대로 되읽고, 창고 이전 저장은 빈 창고, 창고 격자(10×8) 밖·겹침은 저장 전체를 버린다', () => {
  expect(decodeSave(encodeSave(run))!.stash).toEqual(run.stash);
  const { stash: _s, ...old } = run;
  expect(decodeSave(JSON.stringify({ v: 2, ...old }))!.stash).toEqual([]);
  const helm = (x: number, y: number) => ({ kind: 'helm', tier: 1, affixes: [], x, y });
  expect(decodeSave(JSON.stringify({ v: 2, ...run, stash: [helm(8, 7)] }))).toBeNull();
  expect(decodeSave(JSON.stringify({ v: 2, ...run, stash: [helm(0, 0), helm(1, 1)] }))).toBeNull();
});

test('2막 진행(act2): 되읽고, 없으면 0, 범위 밖·2막 전에 천막에 있는 저장은 버린다', () => {
  const tent = { ...run, land: 'tent' as const, floor: 0, act2: 1 };
  expect(decodeSave(encodeSave(tent))).toEqual(tent);
  const { act2: _, ...before } = run;
  expect(decodeSave(JSON.stringify({ v: 2, ...before }))!.act2).toBe(0);
  expect(decodeSave(encodeSave({ ...run, act2: 9 }))).toBeNull();
  expect(decodeSave(encodeSave({ ...run, heard: true }))?.heard).toBe(true); // 타임패트롤 신호 1을 들었다
  expect(decodeSave(encodeSave({ ...tent, act2: 0 }))).toBeNull();
});
