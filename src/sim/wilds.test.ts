import { expect, test } from 'vitest';
import { bossName, createWorld, LANDS, step } from './world';
import { FLOORS, OPEN, SIZE, walkDistances } from './dungeon';
import { exitsFor, GATE_FIRES, generateCamp, generateTent, generateWild, makeMap, WILD, wildCount, type Side } from './wilds';

const count = (map: string[], chars: string) => map.join('').split('').filter((c) => chars.includes(c)).length;
const find = (map: string[], ch: string): [number, number][] => map.flatMap((r, z) => [...r].flatMap((c, x) => (c === ch ? [[x, z] as [number, number]] : [])));
// 칸이 맞닿은 가장자리(맨 바깥 줄)
const edgeOfIn = (n: number) => ([x, z]: [number, number]): Side | null => (z === 0 ? 'n' : z === n - 1 ? 's' : x === 0 ? 'w' : x === n - 1 ? 'e' : null);
const edgeOf = edgeOfIn(WILD);

test('출구 종류: 초원 1구역만 갈림길(초원 2·설원 1·폐허 1·미궁 1), 그 밖은 같은 지역의 다음 구역뿐, 5구역은 없음', { timeout: 120_000 }, () => {
  expect(exitsFor(1, 'field')).toEqual(['field', 'snow', 'ruins', 'dungeon']);
  expect(exitsFor(2, 'ruins')).toEqual(['ruins']);
  expect(exitsFor(2, 'field')).toEqual(['field']);
  expect(exitsFor(1, 'snow')).toEqual(['snow']);
  expect(exitsFor(4, 'snow')).toEqual(['snow']);
  expect(exitsFor(FLOORS, 'field')).toEqual([]);
});

for (const land of ['field', 'snow', 'ruins'] as const)
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
      const exits = [...find(map, 'F'), ...find(map, 'S'), ...find(map, 'R')];
      expect(exits.length).toBe(outer.length * 3);
      const sides = new Set(exits.map(edgeOf));
      expect(sides.has(null)).toBe(false); // 모두 맨 바깥 줄
      expect(sides.has(from)).toBe(false);
      expect(sides.size).toBe(outer.length); // 출구마다 다른 가장자리
      expect(exits.length / 3).toBe(outer.length);
      expect(count(map, { field: 'F', snow: 'S', ruins: 'R' }[land])).toBe(outer.length ? 3 : 0); // 같은 지역 출구
      expect(count(map, '>')).toBe(kinds.includes('dungeon') ? 1 : 0);
      expect(count(map, 'M')).toBe(floor === FLOORS ? 1 : 0);
      expect(count(map, 'mwagNWAG')).toBe(wildCount(floor, land));
      expect(count(map, land === 'field' ? 'aA' : 'gG')).toBe(0); // 초원에 궁수, 설원·폐허에 마법사는 없다
      expect(count(map, '=')).toBeGreaterThan(20); // 길
      const cells = map.map((r) => r.split(''));
      const d = walkDistances(cells, hx, hz);
      expect(cells.flatMap((row, z) => row.filter((c, x) => OPEN(c) && d[z * WILD + x] < 0))).toEqual([]); // 닿지 못하는 칸이 없다
      const far = Math.max(...d);
      for (const [x, z] of find(map, '>')) expect(d[z * WILD + x]).toBeGreaterThanOrEqual(0.6 * far); // 동굴 입구는 먼 곳
      expect(count(map, '#')).toBeLessThan(WILD * WILD - 1500);
    }
  }, 30000); // 맵 80장

test('초원 야영지: 한 맵에 3~5개, 상자(C) 둘레 4칸 안에 모닥불과 몬스터 셋 이상. 설원엔 없다', { timeout: 120_000 }, () => {
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

test('지역의 몬스터는 스킨을 입는다: 이름·체력·속도가 다르고, 스킨이 없는 원형은 해골 그대로', { timeout: 120_000 }, () => {
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

// 칸에서 걸어서 닿는가(막는 칸이면 이웃 중 하나라도 닿으면 — NPC·출구 앞에 설 수 있다)
const reachable = (map: string[], [hx, hz]: [number, number]) => {
  const cells = map.map((r) => r.split(''));
  const d = walkDistances(cells, hx, hz);
  const W = map[0].length;
  return ([x, z]: [number, number]) => [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => d[(z + dz) * W + x + dx] >= 0 && x + dx >= 0 && x + dx < W);
};

test('야영지: 48칸, 늘 같은 맵, 모닥불·순찰대장·상인·의뢰인·주민 하나씩(모닥불에서도 서로도 4칸 이상), 출구는 맨 바깥 줄의 초원(F 3칸)뿐, 몬스터·상자 없음, 모두 걸어서 닿는다', { timeout: 120_000 }, () => {
  const map = generateCamp();
  expect(map.length).toBe(SIZE);
  expect(map.every((r) => r.length === SIZE)).toBe(true);
  expect(map).toEqual(generateCamp());
  expect(makeMap(123, 3, 'camp')).toEqual(map); // 시드·구역과 상관없이
  for (const ch of 'HEVqPh') expect(count(map, ch)).toBe(1);
  const npcs = [...find(map, 'E'), ...find(map, 'V'), ...find(map, 'q'), ...find(map, 'P')];
  const fire = find(map, 'B')[0];
  for (const [i, a] of npcs.entries()) for (const b of [fire, ...npcs.slice(i + 1)]) expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeGreaterThanOrEqual(4);
  expect(count(map, 'B')).toBeGreaterThanOrEqual(1);
  const exits = find(map, 'F');
  expect(exits.length).toBe(3);
  expect(new Set(exits.map(edgeOfIn(SIZE))).size).toBe(1);
  expect(exits.every((e) => edgeOfIn(SIZE)(e) !== null)).toBe(true);
  expect(count(map, 'SRsr>')).toBe(0);
  expect(count(map, 'mwagNWAGKMZUTXcCYQIL')).toBe(0);
  const ok = reachable(map, find(map, 'H')[0]);
  for (const p of [...exits, ...find(map, 'E'), ...find(map, 'V'), ...find(map, 'q'), ...find(map, 'P'), ...find(map, 'h'), ...find(map, 'B')]) expect(ok(p)).toBe(true);
  const w = createWorld(1, map);
  expect(w.chests.map((c) => c.kind).sort()).toEqual(['asker', 'elder', 'merchant', 'stash', 'villager']);
  expect(w.exits.every((e) => e.to === 'field')).toBe(true);
  expect(w.entities).toHaveLength(1);
});

test('2막이 열린 야영지: 북쪽 맨 바깥 줄에 원정길 출구(x 3칸, → 천막)가 더해지고 걸어서 닿는다. 나머지(NPC·초원 출구)는 그대로', () => {
  const [plain, open] = [generateCamp(), generateCamp(true)];
  expect(makeMap(5, 0, 'camp', 'w', ['field', 'tent'])).toEqual(open);
  const exits = find(open, 'x');
  expect(exits.length).toBe(3);
  expect(exits.every(([, z]) => z === 0)).toBe(true);
  const ok = reachable(open, find(open, 'H')[0]);
  for (const p of [...exits, ...find(open, 'F'), ...find(open, 'E'), ...find(open, 'V'), ...find(open, 'h')]) expect(ok(p)).toBe(true);
  for (const ch of 'HEVqPhBF') expect(find(open, ch)).toEqual(find(plain, ch));
  expect(createWorld(1, open).exits.filter((e) => e.to === 'tent')).toHaveLength(3);
});

test('원정대 천막: 48칸, 늘 같은 맵, 화덕·순찰대장·상인·창고, 천막 다섯(작은 넷 2×2·큰 하나 4×4, 덮인 칸은 막힘), 서쪽 끝 야영지 출구(y 3칸)·북쪽 끝 호숫가 출구(l 3칸), 몬스터 없음, 모두 닿는다', () => {
  const map = generateTent();
  expect(map.length).toBe(SIZE);
  expect(map).toEqual(makeMap(9, 0, 'tent'));
  for (const ch of 'HEVhB') expect(count(map, ch)).toBe(1);
  expect(count(map, 'e')).toBe(4);
  expect(count(map, 'i')).toBe(1);
  expect(count(map, 'n')).toBe(4 * 3 + 15);
  const exits = find(map, 'y');
  expect(exits.length).toBe(3);
  expect(exits.every(([x]) => x === 0)).toBe(true);
  expect(count(map, 'mwagNWAGKMZUTXcCYQIL')).toBe(0);
  const ok = reachable(map, find(map, 'H')[0]);
  for (const p of [...exits, ...find(map, 'E'), ...find(map, 'V'), ...find(map, 'h'), ...find(map, 'B')]) expect(ok(p)).toBe(true);
  const w = createWorld(1, map);
  expect(w.chests.map((c) => c.kind).sort()).toEqual(['elder', 'merchant', 'stash']);
  expect(new Set(w.exits.map((e) => e.to))).toEqual(new Set(['camp', 'lake']));
  const north = find(map, 'l');
  expect(north.length).toBe(3);
  expect(north.every(([, z]) => z === 0)).toBe(true);
  for (const p of north) expect(ok(p)).toBe(true);
  expect(w.props.filter((p) => p.kind === 'tent' || p.kind === 'tentBig')).toHaveLength(5);
  expect(w.entities).toHaveLength(1);
});

test('초원 1구역 갈림길 잠금: 안 열린 지역 출구는 막히고(s·r, 동굴은 돌 o) 나머지는 같은 맵, 열린 출구까지는 길이 이어진다', { timeout: 120_000 }, () => {
  for (let seed = 1; seed <= 15; seed++) {
    const from = (['n', 'e', 's', 'w'] as const)[seed % 4];
    const all = generateWild(seed, 1, 'field', from);
    expect(generateWild(seed, 1, 'field', from, ['field', 'snow', 'dungeon', 'ruins', 'sanctum'])).toEqual(all);
    const first = generateWild(seed, 1, 'field', from, ['field']);
    expect(count(first, 'SR>')).toBe(0);
    expect([count(first, 's'), count(first, 'r'), count(first, 'F')]).toEqual([3, 3, 3]);
    // 바뀐 칸은 잠긴 출구 자리뿐
    const diff = all.flatMap((r, z) => [...r].flatMap((c, x) => (c !== first[z][x] ? [c + first[z][x]] : [])));
    // 무너진 성소 입구(2×2)는 '%' 빈터가 되고, 그 둘레 화로·뼈는 치운다
    expect(diff.filter((d) => !/^[B,]\.$/.test(d)).sort()).toEqual(['*%', '*%', '*%', '*%', '>o', 'Rr', 'Rr', 'Rr', 'Ss', 'Ss', 'Ss']);
    expect(diff.filter((d) => d === 'B.').length).toBeGreaterThanOrEqual(GATE_FIRES.length);
    expect(first.join('').includes('%')).toBe(true);
    const gz = first.findIndex((r) => r.includes('%'));
    expect(createWorld(1, first).grid.blocked[gz * first.length + first[gz].indexOf('%')]).toBe(0); // 밟고 지나간다
    const ok = reachable(first, find(first, 'H')[0]);
    for (const p of find(first, 'F')) expect(ok(p)).toBe(true);
    const w = createWorld(1, first);
    expect(w.exits.map((e) => e.to)).toEqual(['field', 'field', 'field']);
    expect(new Set(w.locked.map((e) => e.to))).toEqual(new Set(['snow', 'ruins', 'sanctum']));
    expect(w.stairs).toBeNull();
    // 설원·미궁까지 열림: 폐허만 막힘
    const third = generateWild(seed, 1, 'field', from, ['field', 'snow', 'dungeon']);
    expect([count(third, 'S'), count(third, 'r'), count(third, '>')]).toEqual([3, 3, 1]);
  }
});

test('의뢰 대상(L·J·O·k): makeMap에 글자를 주면 하나, 걸어서 닿고 길을 끊지 않는다(바깥 지역은 길가, 미궁은 방 안). 안 주면 없다', { timeout: 120_000 }, () => {
  for (let seed = 1; seed <= 12; seed++)
    for (const [land, letter] of [['field', 'L'], ['snow', 'J'], ['ruins', 'O'], ['dungeon', 'k']] as const) {
      expect(count(makeMap(seed, 3, land, 'w'), letter)).toBe(0);
      const map = makeMap(seed, 3, land, 'w', undefined, letter);
      expect(count(map, letter)).toBe(1);
      const [l] = find(map, letter);
      if (letter === 'k') expect(map.slice(l[1] - 2, l[1] + 3).some((r) => r.slice(l[0] - 2, l[0] + 3).includes('W'))).toBe(true); // 궤를 지키는 정예
      const [h] = find(map, 'H');
      expect(reachable(map, h)(l)).toBe(true);
      const lost = (m: string[]) => {
        const cells = m.map((r) => r.split(''));
        const d = walkDistances(cells, h[0], h[1]);
        return cells.flatMap((row, z) => row.filter((c, x) => OPEN(c) && d[z * row.length + x] < 0)).length;
      };
      expect(lost(map)).toBe(lost(makeMap(seed, 3, land, 'w'))); // 단서가 길을 끊지 않는다(미궁은 사슬 문 너머가 원래 닿지 않는다)
      if (land !== 'dungeon') expect(map.slice(l[1] - 3, l[1] + 4).some((r) => r.slice(l[0] - 3, l[0] + 4).includes('='))).toBe(true);
    }
});
