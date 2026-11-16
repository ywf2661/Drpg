import { expect, test } from 'vitest';
import { bossName, createWorld, LANDS, step } from './world';
import { FLOORS, OPEN, walkDistances } from './dungeon';
import { exitsFor, generateWild, WILD, wildCount, type Side } from './wilds';

const count = (map: string[], chars: string) => map.join('').split('').filter((c) => chars.includes(c)).length;
const find = (map: string[], ch: string): [number, number][] => map.flatMap((r, z) => [...r].flatMap((c, x) => (c === ch ? [[x, z] as [number, number]] : [])));
// 칸이 맞닿은 가장자리(맨 바깥 줄)
const edgeOf = ([x, z]: [number, number]): Side | null => (z === 0 ? 'n' : z === WILD - 1 ? 's' : x === 0 ? 'w' : x === WILD - 1 ? 'e' : null);

test('출구 종류: 같은 지역·다른 지역, 다음 구역이 3 이상이면 동굴 입구, 5구역은 없음', () => {
  expect(exitsFor(1, 'field')).toEqual(['field', 'snow']);
  expect(exitsFor(2, 'snow')).toEqual(['snow', 'field', 'dungeon']);
  expect(exitsFor(4, 'field')).toEqual(['field', 'snow', 'dungeon']);
  expect(exitsFor(FLOORS, 'field')).toEqual([]);
});

for (const land of ['field', 'snow'] as const)
  test(`${LANDS[land].name}: 72칸, 시드가 같으면 같은 맵, 들어온 쪽에서 시작해 다른 가장자리의 출구까지 길이 이어진다`, () => {
    for (let seed = 1; seed <= 40; seed++) {
      const floor = 1 + (seed % FLOORS);
      const from = (['n', 'e', 's', 'w'] as const)[seed % 4];
      const map = generateWild(seed, floor, land, from);
      expect(map.length).toBe(WILD);
      expect(map.every((r) => r.length === WILD)).toBe(true);
      expect(map).toEqual(generateWild(seed, floor, land, from));
      const [[hx, hz]] = find(map, 'H');
      expect(count(map, 'H')).toBe(1);
      expect({ n: hz, s: WILD - 1 - hz, w: hx, e: WILD - 1 - hx }[from]).toBeLessThanOrEqual(8); // 들어온 가장자리 가까이
      const kinds = exitsFor(floor, land);
      const outer = kinds.filter((k) => k !== 'dungeon');
      const exits = [...find(map, 'F'), ...find(map, 'S')];
      expect(exits.length).toBe(outer.length * 3);
      const sides = new Set(exits.map(edgeOf));
      expect(sides.has(null)).toBe(false); // 모두 맨 바깥 줄
      expect(sides.has(from)).toBe(false);
      expect(sides.size).toBe(outer.length); // 출구마다 다른 가장자리
      expect(count(map, 'F') / 3 + count(map, 'S') / 3).toBe(outer.length);
      expect(count(map, land === 'field' ? 'F' : 'S')).toBe(outer.length ? 3 : 0); // 같은 지역 출구
      expect(count(map, '>')).toBe(kinds.includes('dungeon') ? 1 : 0);
      expect(count(map, 'M')).toBe(floor === FLOORS ? 1 : 0);
      expect(count(map, 'mwagNWAG')).toBe(wildCount(floor, land));
      expect(count(map, land === 'field' ? 'aA' : 'gG')).toBe(0); // 초원에 궁수, 설원에 마법사는 없다
      expect(count(map, '=')).toBeGreaterThan(20); // 길
      const cells = map.map((r) => r.split(''));
      const d = walkDistances(cells, hx, hz);
      expect(cells.flatMap((row, z) => row.filter((c, x) => OPEN(c) && d[z * WILD + x] < 0))).toEqual([]); // 닿지 못하는 칸이 없다
      const far = Math.max(...d);
      for (const [x, z] of find(map, '>')) expect(d[z * WILD + x]).toBeGreaterThanOrEqual(0.6 * far); // 동굴 입구는 먼 곳
      expect(count(map, '#')).toBeLessThan(WILD * WILD - 1500);
    }
  });

test('초원 야영지: 한 맵에 3~5개, 상자(C) 둘레 4칸 안에 모닥불과 몬스터 셋 이상. 설원엔 없다', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const floor = 1 + (seed % FLOORS);
    const map = generateWild(seed, floor, 'field');
    const camps = find(map, 'C');
    expect(camps.length).toBeGreaterThanOrEqual(3);
    expect(camps.length).toBeLessThanOrEqual(5);
    const around = ([cx, cz]: [number, number], chars: string) => {
      let n = 0;
      for (let z = cz - 4; z <= cz + 4; z++) for (let x = cx - 4; x <= cx + 4; x++) if (chars.includes(map[z]?.[x] ?? '')) n++;
      return n;
    };
    for (const c of camps) {
      expect(around(c, 'B')).toBeGreaterThanOrEqual(1);
      expect(around(c, 'mwagNWAG')).toBeGreaterThanOrEqual(3);
    }
    expect(count(generateWild(seed, floor, 'snow'), 'C')).toBe(0);
  }
});

test('지역의 몬스터는 스킨을 입는다: 이름·체력·속도가 다르고, 스킨이 없는 원형은 해골 그대로', () => {
  const w = createWorld(1, generateWild(2, 2, 'snow'), 1, 1, LANDS.snow.skins);
  const zombie = w.entities.find((e) => e.kind === 'warrior' && !e.elite)!;
  expect(zombie.skin).toBe('zombie');
  expect(zombie.maxHp).toBe(135); // 90 × 1.5
  expect(w.entities.find((e) => e.kind === 'archer')!.skin).toBeUndefined();
  for (let i = 0; i < 600; i++) step(w, []); // 굴러간다
  // 5구역의 보스도 지역의 것: 초원 개미귀신(550 × 1.1), 설원 서리 와이번
  const boss = (land: 'field' | 'snow') => createWorld(1, generateWild(5, 5, land), 1, 1, LANDS[land].skins).entities.find((e) => e.kind === 'boss')!;
  expect([boss('field').skin, boss('snow').skin]).toEqual(['antlion', 'wyvern']);
  expect(bossName(LANDS.snow.skins)).toBe('서리 와이번');
  expect(bossName({})).toBe('미노타우르스');
});
