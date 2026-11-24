// 룬과 소켓. 설계: docs/superpowers/specs/2026-11-19-runes-design.md
import { expect, test } from 'vitest';
import { sell } from '../shop';
import { runeIcon, SKILLS, step, createWorld, discardFromBag, keyCut, rank, RANK_MAX, RANK_OVER, rollGear, rollRune, runeAffix, runeGrade, runesIn, socketRune, socketsOf, STAT_RUNES, unsocketRune, useClass, worn, type World } from './world';

const make = (land: World['land'] = 'field') => {
  const w = createWorld(1, ['H....']);
  useClass(w, 'knight');
  w.land = land;
  return w;
};

test('룬 이름 → 옵션 한 줄, 등급', () => {
  expect(runeAffix('gale')).toEqual({ kind: 'move', value: 4, r: 'gale' });
  expect(runeAffix('cleave+2')).toEqual({ kind: 'skill', value: 2, skill: 'cleave', r: 'cleave+2' });
  expect(runeAffix('key:dash')).toEqual({ kind: 'keyCd', value: 15, key: 'dash', r: 'key:dash' });
  expect(runeAffix('nope+1')).toBeNull();
  expect(runeAffix('cleave+3')).toBeNull();
  expect(['gale', 'cleave+1', 'cleave+2', 'key:dash'].map(runeGrade)).toEqual([0, 1, 2, 3]);
});

test('지역마다 다른 룬: 스탯 룬은 그 지역 것, 스킬 룬은 그 지역 줄(초원 1단계 … 폐허 궁극기), 야영지는 없다', () => {
  const rows: [World['land'], number][] = [['field', 0], ['snow', 1], ['dungeon', 2], ['ruins', 3]];
  for (const [land, row] of rows) {
    const w = make(land);
    for (let i = 0; i < 200; i++) {
      const r = rollRune(w, [0.3, 0.4, 0.3])!;
      const a = runeAffix(r)!;
      if (a.kind === 'skill') expect(SKILLS[a.skill!]).toMatchObject({ cls: 'knight', tier: row });
      else expect(STAT_RUNES[r].land).toBe(land);
    }
  }
  expect(rollRune(make('camp'), [1, 0, 0])).toBeNull();
});

test('스킬 룬의 대상은 지금 직업의 그 줄 스킬뿐', async () => {
  const { TREES, SKILLS } = await import('./world');
  const w = make('ruins');
  const seen = new Set<string>();
  for (let i = 0; i < 300; i++) {
    const a = runeAffix(rollRune(w, [0, 0.5, 0.5])!)!;
    expect(SKILLS[a.skill!]).toMatchObject({ cls: 'knight', tier: 3 });
    seen.add(a.skill!);
  }
  expect(seen.size).toBe(TREES.knight.length); // 기사 궁극기 다섯이 모두 나온다
});

test('새 장비는 소켓 1~3개(대부분 1개)', () => {
  const w = make();
  const n = Array.from({ length: 1000 }, () => socketsOf(rollGear(w, 0, 0, 'weapon', 2).affixes!));
  expect(Math.min(...n)).toBe(1);
  expect(Math.max(...n)).toBe(3);
  expect(n.filter((k) => k === 1).length).toBeGreaterThan(500);
});

test('꽂기·빼기: 빈 소켓에만, 주머니에서 빠지고 돌아온다. 스킬 룬은 단계 상한 10을 넘지 않는다', () => {
  const w = make();
  w.ranks.cleave = 5;
  w.mods.weapon = [{ kind: 'socket', value: 2 }];
  w.mods.armor = [{ kind: 'skill', value: 3, skill: 'cleave' }];
  w.runes = { 'cleave+2': 2, gale: 1 };
  expect(socketRune(w, 'weapon', 'cleave+2')).toBe(true);
  expect(rank(w, 'cleave')).toBe(RANK_MAX + RANK_OVER);
  expect(socketRune(w, 'weapon', 'cleave+2')).toBe(true);
  expect(rank(w, 'cleave')).toBe(RANK_MAX + RANK_OVER); // 상한 그대로
  expect(socketRune(w, 'weapon', 'gale')).toBe(false); // 소켓이 찼다
  expect(w.runes).toEqual({ gale: 1 });
  expect(unsocketRune(w, 'weapon', 0)).toBe(true);
  expect(w.runes).toEqual({ gale: 1, 'cleave+2': 1 });
  expect(socketRune(w, 'weapon', 'gale')).toBe(true);
  expect(worn(w, 'move')).toBe(4); // 어느 부위든 스탯은 합쳐진다
  expect(runesIn(w.mods.weapon).map((a) => a.r)).toEqual(['cleave+2', 'gale']);
  expect(socketRune(w, 'weapon', 'whirl+1')).toBe(false); // 주머니에 없다
});

test('보관함 장비에도 꽂고, 버리면 꽂힌 룬은 주머니로', () => {
  const w = make();
  w.bag = [{ kind: 'helm', tier: 1, affixes: [{ kind: 'socket', value: 1 }], x: 0, y: 0 }];
  w.runes = { spark: 1 };
  expect(socketRune(w, 0, 'spark')).toBe(true);
  expect(w.runes).toEqual({});
  discardFromBag(w, 0);
  expect(w.runes).toEqual({ spark: 1 });
});

test('팔면 꽂힌 룬이 돌아오고, 값은 소켓·룬을 세지 않는다', () => {
  const c = { potions: 0, gear: { weapon: 1, armor: 1, helm: 1, boots: 1 }, gold: 0, runes: {}, bag: [{ kind: 'helm' as const, tier: 1, affixes: [{ kind: 'socket' as const, value: 1 }, { kind: 'crit' as const, value: 4, r: 'spark' }], x: 0, y: 0 }] };
  const after = sell(c, 0);
  expect(after.runes).toEqual({ spark: 1 });
  expect(after.gold).toBe(10);
});

test('칸 룬: 그 칸 재사용 대기 −15%씩, 합계 −50%까지', () => {
  const w = make();
  expect(keyCut(w, 'cleave')).toBe(1);
  w.mods.weapon = [{ kind: 'socket', value: 3 }, ...Array.from({ length: 3 }, () => runeAffix('key:cleave')!)];
  expect(keyCut(w, 'cleave')).toBeCloseTo(0.55);
  expect(keyCut(w, 'dash')).toBe(1);
  w.mods.armor = [{ kind: 'socket', value: 1 }, runeAffix('key:cleave')!];
  expect(keyCut(w, 'cleave')).toBeCloseTo(0.5);
});

test('보스는 그 지역 룬 둘(보통·드묾 스킬 룬), 의뢰를 다 끝냈으면 그 지역 칸 룬도', () => {
  const kill = (w: World) => {
    w.entities[1].hp = 1;
    for (let i = 0; i < 90; i++) step(w, i ? [] : [{ type: 'attack', targetId: 1 }]);
    return w.items.filter((i) => i.kind === 'rune').map((i) => i.rune!);
  };
  for (let seed = 1; seed <= 20; seed++) {
    const w = createWorld(seed, ['HM']);
    useClass(w, 'knight');
    w.land = 'snow';
    w.sureLegend = true;
    const got = kill(w);
    expect(got).toContain('key:dash'); // 설원 = W 칸
    expect(got.filter((r) => runeGrade(r) === 1 || runeGrade(r) === 2)).toHaveLength(2);
  }
});

test('룬 그림: 모든 룬이 시트 안의 칸을 가리키고, 쓰지 않기로 한 16번은 안 쓴다', () => {
  const all = [...Object.keys(STAT_RUNES), ...['cleave', 'dash', 'shout', 'throw'].map((k) => `key:${k}`), ...Object.keys(SKILLS).flatMap((id) => [`${id}+1`, `${id}+2`])];
  for (const r of all) {
    expect(runeAffix(r)).not.toBeNull();
    expect(runeIcon(r)).toBeGreaterThanOrEqual(0);
    expect(runeIcon(r)).toBeLessThan(20);
    expect(runeIcon(r)).not.toBe(16);
  }
});
