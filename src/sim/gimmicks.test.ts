import { expect, test } from 'vitest';
import { createWorld, DT, GRAVE, hidden, ICICLE, LANDS, monsterName, moveSpeed, outcome, SHRINE, SPIKE, step, TREASURE, TRIAL, QUEST, type Command, type World } from './world';
import { generateFloor } from './dungeon';
import { generateWild } from './wilds';
import { canSummonKnight, spawnNear } from './gimmicks';

const run = (w: World, ticks: number, cmds: Command[] = []) => {
  for (let i = 0; i < ticks; i++) step(w, i === 0 ? cmds : []);
};
const kill = (w: World, ids: number[]) => ids.forEach((id) => Object.assign(w.entities[id], { state: 'dead', hp: 0 }));
const count = (map: string[], chars: string) => map.join('').split('').filter((c) => chars.includes(c)).length;

test('타락한 성기사: 소환하면 이름·체력 배율이 붙고, 폐허에서 체력 절반이 돼도 무덤을 일으키지 않는다', () => {
  const w = createWorld(1, ['#########', '#H......#', '#.......#', '#.......#', '#########'], 1, 1, LANDS.ruins.skins);
  w.land = 'ruins';
  const k = spawnNear(w, 'boss', 1.5, 1.5, 3, -1, 'fallen_paladin')!;
  expect(k.skin).toBe('fallen_paladin');
  expect(monsterName(k)).toBe('기도하는 자');
  k.hp = Math.floor(k.maxHp / 2) - 1;
  w.entities[0].hp = 99999;
  run(w, 10);
  expect(w.bossRaised).toBe(false);
  expect(w.entities.some((e) => e.skin === 'grave')).toBe(false);
});

test('폐허 무덤 기믹: 기사는 체력 절반이어도 안 일으키고, 악마는 체력 절반에 무덤을 일으킨다', () => {
  const w = createWorld(1, ['###########', '#H........#', '#.........#', '#........M#', '###########'], 1, 1, LANDS.ruins.skins);
  w.land = 'ruins';
  w.entities[0].hp = 99999;
  const demon = w.entities.find((e) => e.kind === 'boss')!;
  expect(demon.skin).toBe('demon');
  const k = spawnNear(w, 'boss', 1.5, 1.5, 2, -1, 'fallen_paladin')!;
  k.hp = Math.floor(k.maxHp / 2) - 1;
  run(w, 5);
  expect(w.entities.filter((e) => e.skin === 'grave')).toHaveLength(0);
  demon.hp = Math.floor(demon.maxHp / 2) - 1;
  run(w, 5);
  expect(w.bossRaised).toBe(true);
  expect(w.entities.filter((e) => e.skin === 'grave')).toHaveLength(GRAVE.boss);
});

test('타락한 성기사 소환: 기사가 클리어 판정을 좌우하는 구역(계단·출구·원래 보스가 모두 없음)과 야영지에서는 안 된다', () => {
  const room = ['#######', '#H....#', '#.....#', '#######'];
  expect(canSummonKnight(createWorld(1, room))).toBe(false); // 기사가 유일한 보스가 되어 쓰러뜨리면 구역 클리어
  expect(canSummonKnight(createWorld(1, ['#######', '#H...>#', '#######']))).toBe(true); // 계단
  expect(canSummonKnight(createWorld(1, ['#######', '#H...M#', '#######']))).toBe(true); // 원래 보스가 판정
  const camp = createWorld(1, ['#######', '#H...>#', '#######']);
  camp.land = 'camp';
  expect(canSummonKnight(camp)).toBe(false);
});

test('타락한 성기사: 원래 보스가 살아 있으면 기사를 쓰러뜨려도 클리어가 아니다', () => {
  const w = createWorld(1, ['#########', '#H......#', '#.......#', '#......M#', '#########']);
  const k = spawnNear(w, 'boss', 1.5, 1.5, 2, -1, 'fallen_paladin')!;
  k.state = 'dead';
  expect(outcome(w)).toBe(null);
});

test('성소(Y): 누르면 30초 버프 하나, 한 번만', () => {
  const w = createWorld(1, ['H.Y']);
  run(w, 60, [{ type: 'open', chestId: 0 }]);
  expect(w.chests[0].open).toBe(true);
  expect(w.buff?.t).toBeGreaterThan(SHRINE.time - 2);
  run(w, Math.ceil(SHRINE.time / DT));
  expect(w.buff).toBeNull();
});

test('신속의 성소: 이동 속도가 오른다. 개미지옥 안에서는 느려진다', () => {
  const w = createWorld(1, ['H....', '.....', '..U..', '.....', '.....']);
  const hero = w.entities[0];
  const base = moveSpeed(w, hero);
  w.buff = { kind: 'haste', t: 10 };
  expect(moveSpeed(w, hero)).toBeCloseTo(base * (1 + SHRINE.haste));
  w.buff = null;
  Object.assign(hero, { x: 2.5, z: 1.6 });
  expect(moveSpeed(w, hero)).toBeLessThan(base);
  run(w, 60);
  expect(Math.hypot(hero.x - 2.5, hero.z - 2.5)).toBeLessThan(0.75); // 가운데로 끌려간다
});

test('시련의 제단(Q): 누르면 몰려오는 물결을 다 막아야 열리고, 높은 단계 장비를 준다', () => {
  const w = createWorld(1, ['#########', '#.......#', '#...Q...#', '#.......#', '#.......#', '#H......#', '#########']);
  w.autoEquip = false;
  run(w, 60, [{ type: 'open', chestId: 0 }]);
  const ch = w.chests[0];
  for (let wave = 1; wave <= TRIAL.waves.length; wave++) {
    expect(ch.wave).toBe(wave);
    expect(ch.guards!.length).toBe(TRIAL.waves[wave - 1].length);
    expect(ch.open).toBe(false);
    kill(w, ch.guards!);
    run(w, 2);
  }
  expect(ch.wave).toBe(TRIAL.waves.length);
  run(w, 120, [{ type: 'open', chestId: 0 }]);
  expect(ch.open).toBe(true);
  expect([...w.items, ...w.bag].some((i) => i.kind !== 'gold' && i.kind !== 'potion' && i.tier === Math.min(4, w.maxTier + 1))).toBe(true);
});

test('잠든 몬스터(Z): 멀면 가만히, 가까이 오거나 맞으면 깨고 둘레의 잠든 몬스터도 깬다', () => {
  const w = createWorld(1, ['H.........Z.Z']);
  const [a, b] = [w.entities[1], w.entities[2]];
  run(w, 120);
  expect(a.x).toBe(10.5);
  expect(a.asleep).toBe(true);
  run(w, 240, [{ type: 'move', x: 8.5, z: 0.5 }]);
  expect(a.asleep).toBe(false);
  expect(b.asleep).toBe(false); // 2m 옆이라 같이
});

test('모래 속 개미귀신(U)은 깨기 전엔 보이지 않는다', () => {
  const w = createWorld(1, ['H.....U']);
  expect(hidden(w.entities[1])).toBe(true);
  expect(w.entities[1].skin).toBe('antlion_small');
  w.entities[1].asleep = false;
  expect(hidden(w.entities[1])).toBe(false);
});

test('얼어붙은 보물(I): 늘 장비와 금화', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const w = createWorld(seed, ['H.I']);
    w.autoEquip = false;
    run(w, 60, [{ type: 'open', chestId: 0 }]);
    expect(w.potions).toBe(0);
    expect([...w.items, ...w.bag].filter((i) => i.kind !== 'gold').length).toBe(1);
  }
});

test('보물 고블린(T): 보면 도망치다 사라지고(드롭 없음), 잡으면 금화 더미와 장비', () => {
  const w = createWorld(1, ['H......T..........................']);
  const g = w.entities[1];
  expect(g.skin).toBe('treasure');
  run(w, 2);
  expect(g.fearT).toBeGreaterThan(0);
  run(w, Math.ceil(TREASURE.run / DT) + 5);
  expect(g.state).toBe('dead');
  expect(w.items.length).toBe(0);

  const w2 = createWorld(1, ['H......T..']);
  w2.autoEquip = false;
  w2.entities[1].hp = 1;
  w2.entities[0].hp = 9999;
  run(w2, 600, [{ type: 'attack', targetId: 1 }]);
  expect(w2.entities[1].state).toBe('dead');
  expect(w2.items.filter((i) => i.kind === 'gold').length + (w2.gold > 0 ? 1 : 0)).toBeGreaterThanOrEqual(TREASURE.gold);
  expect([...w2.items, ...w2.bag].filter((i) => i.kind !== 'gold' && i.kind !== 'potion').length).toBe(TREASURE.gear);
});

test('고드름: 설원에서 얼음 벽 가까이 있으면 가끔 머리 위에 예고 원이 생긴다(미궁엔 없음)', () => {
  const w = createWorld(3, ['#####', '#H..#', '#####']);
  w.land = 'snow';
  let seen = 0;
  for (let i = 0; i < 20 * (ICICLE.every / DT); i++) {
    step(w, []);
    if (w.zones.some((z) => z.kind === 'ice')) seen++;
  }
  expect(seen).toBeGreaterThan(0);
  const d = createWorld(3, ['#####', '#H..#', '#####']);
  run(d, 10 * (ICICLE.every / DT));
  expect(d.zones.length).toBe(0);
});

test('저주받은 무덤(X): 가까우면 몇 초마다 졸개를 일으킨다(최대 3), 움직이지 않는다', () => {
  const w = createWorld(1, ['#########', '#H......#', '#.......#', '#....X..#', '#########'], 1, 1, LANDS.ruins.skins);
  const grave = w.entities[1];
  w.entities[0].hp = 99999;
  run(w, Math.ceil((GRAVE.first + GRAVE.every * 5) / DT));
  const raised = w.entities.filter((e) => e.summoner === grave.id);
  expect(raised.length).toBe(GRAVE.max); // 아무도 안 죽였으니 셋에서 멈춘다
  expect(raised[0].skin).toBe('zombie_dark');
  expect([grave.x, grave.z]).toEqual([5.5, 3.5]);
});

test('가시 바닥(^): 솟는 순간 위에 있으면 다친다', () => {
  const w = createWorld(1, ['H^.']);
  const hero = w.entities[0];
  Object.assign(hero, { x: 1.5 });
  const hp = hero.hp;
  run(w, Math.ceil(SPIKE.warn / DT) + 2);
  expect(hero.hp).toBeLessThan(hp);
});

test('푸른 마법진(@): 밟으면 짝으로, 내려서야 다시 탄다', () => {
  const w = createWorld(1, ['H@.......@.']);
  const hero = w.entities[0];
  run(w, 60, [{ type: 'move', x: 1.5, z: 0.5 }]);
  expect(hero.x).toBeCloseTo(9.5);
  run(w, 60);
  expect(hero.x).toBeCloseTo(9.5); // 되돌아가지 않는다
});

test('맵에 기믹이 놓인다: 미궁 성소, 초원 개미지옥, 설원 얼어붙은 보물, 폐허 무덤·가시·마법진', () => {
  let shrines = 0;
  for (let seed = 1; seed <= 20; seed++) {
    shrines += count(generateFloor(seed, 2), 'Y');
    const field = generateWild(seed, 2, 'field');
    expect(count(field, 'U')).toBeGreaterThanOrEqual(2);
    expect(count(field, '~')).toBeGreaterThan(8);
    expect(count(generateWild(seed, 2, 'snow'), 'I')).toBeGreaterThanOrEqual(1);
    const ruins = generateWild(seed, 2, 'ruins');
    expect(count(ruins, 'X')).toBeGreaterThanOrEqual(3);
    expect(count(ruins, '^')).toBeGreaterThanOrEqual(8);
    expect([0, 2]).toContain(count(ruins, '@'));
    expect(count(ruins, 'Y')).toBe(1);
  }
  expect(shrines).toBeGreaterThanOrEqual(20);
}, 30000); // 맵 80장

// 의뢰 대상(설계: docs/superpowers/specs/2026-11-18-region-quests-design.md)
const quest = (c: string) => createWorld(1, ['#########', '#.......#', `#...${c}...#`, '#.......#', '#.......#', '#H......#', '#########']);

test('의뢰 흔적(L): 누르면 읽고 끝난다', () => {
  const w = quest('L');
  run(w, 60, [{ type: 'open', chestId: 0 }]);
  expect(w.talk).toBe('clue');
  expect(w.marked).toBe(true);
});

test('의뢰 봉화(J): 물결 둘을 다 막으면 켜지고 끝난다(전리품 없음)', () => {
  const w = quest('J');
  run(w, 60, [{ type: 'open', chestId: 0 }]);
  const ch = w.chests[0];
  for (let wave = 1; wave <= QUEST.beacon.length; wave++) {
    expect(ch.wave).toBe(wave);
    expect(ch.guards!.length).toBe(QUEST.beacon[wave - 1].length);
    expect(w.marked).toBe(false);
    run(w, 30, [{ type: 'open', chestId: 0 }]); // 물결 중에 눌러도 열리지 않는다
    expect(ch.open).toBe(false);
    kill(w, ch.guards!);
    run(w, 2);
  }
  expect(ch.open).toBe(true);
  expect(w.marked).toBe(true);
  expect(w.items.filter((i) => i.kind !== 'gold')).toHaveLength(0);
});

test('의뢰 궤(k): 지킴이가 살아 있으면 안 열리고, 다 잡은 뒤 열면 끝난다', () => {
  const w = createWorld(1, ['#########', '#.......#', '#.W.k.m.#', '#.......#', '#.......#', '#H......#', '#########']);
  w.entities.slice(1).forEach((e) => (e.asleep = true));
  const ch = w.chests[0];
  expect(ch.guards!.length).toBe(2);
  run(w, 60, [{ type: 'open', chestId: 0 }]);
  expect(ch.open).toBe(false);
  kill(w, ch.guards!);
  run(w, 60, [{ type: 'open', chestId: 0 }]);
  expect(ch.open).toBe(true);
  expect(w.marked).toBe(true);
});

test('의뢰 봉인(O): 누르면 깨지고 무덤이 솟는다', () => {
  const w = quest('O');
  run(w, 60, [{ type: 'open', chestId: 0 }]);
  expect(w.chests[0].open).toBe(true);
  expect(w.marked).toBe(true);
  expect(w.entities.filter((e) => e.skin === 'grave')).toHaveLength(QUEST.graves);
});

test('sureLegend: 의뢰를 다 끝낸 지역의 보스는 전설을 반드시 남긴다', () => {
  for (let seed = 1; seed <= 5; seed++) {
    const w = createWorld(seed, ['#######', '#H...M#', '#######']);
    w.sureLegend = true;
    const boss = w.entities.find((e) => e.kind === 'boss')!;
    boss.hp = 1;
    w.entities[0].hp = 99999;
    for (let i = 0; i < 600 && boss.state !== 'dead'; i++) step(w, i === 0 ? [{ type: 'attack', targetId: boss.id }] : []);
    expect(boss.state).toBe('dead');
    expect([...w.items, ...w.bag].some((i) => 'affixes' in i && i.affixes?.[0]?.kind === 'unique')).toBe(true);
  }
});
