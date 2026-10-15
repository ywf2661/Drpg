import { expect, test } from 'vitest';
import { FLOORS, floorPower, generateFloor, themeFor } from './dungeon';
import { createWorld } from './world';

const count = (map: string[], c: string) => map.join('').split(c).length - 1;
const find = (map: string[], c: string): [number, number] => {
  const i = map.join('').indexOf(c);
  return [i % map[0].length, Math.floor(i / map[0].length)];
};

const WALLS = '#Boc'; // 지나갈 수 없는 글자

// 벽이 아닌 칸까지의 4방향 걸음 수
function distances(map: string[], [sx, sz]: [number, number]) {
  const w = map[0].length;
  const d = new Map<number, number>([[sz * w + sx, 0]]);
  const q: [number, number][] = [[sx, sz]];
  for (let i = 0; i < q.length; i++) {
    const [x, z] = q[i];
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const nz = z + dz;
      if (map[nz]?.[nx] && !WALLS.includes(map[nz][nx]) && !d.has(nz * w + nx)) {
        d.set(nz * w + nx, d.get(z * w + x)! + 1);
        q.push([nx, nz]);
      }
    }
  }
  return d;
}

test('시드 1~50 × 1~5층: 크기, 테두리, 주인공·계단·몬스터 수, 모든 칸 연결, 계단은 멀리', { timeout: 30_000 }, () => {
  for (let seed = 1; seed <= 50; seed++) {
    for (let floor = 1; floor <= FLOORS; floor++) {
      const map = generateFloor(seed, floor);
      expect(map).toHaveLength(48);
      expect(map.every((r) => r.length === 48)).toBe(true);
      expect(map[0] + map[47] + map.map((r) => r[0] + r[47]).join('')).toMatch(/^#+$/);
      expect(count(map, 'H')).toBe(1);
      expect(count(map, '>')).toBe(floor < FLOORS ? 1 : 0);
      const monsters = 8 + 3 * (floor - 1);
      expect(count(map, 'm') + count(map, 'w') + count(map, 'W') + count(map, 'a') + count(map, 'g')).toBe(monsters);
      expect(count(map, 'g')).toBe(floor < 3 || floor === FLOORS ? 0 : Math.round(monsters * 0.1)); // 마법사는 3~4층
      expect(count(map, 'a')).toBe(floor === 1 ? 0 : Math.round(monsters * 0.15)); // 궁수는 2층부터
      const elites = floor >= 2 && floor < FLOORS ? 1 : 0; // 정예 전사는 2~4층에 하나
      expect(count(map, 'W')).toBe(elites);
      expect(count(map, 'w') + count(map, 'W')).toBe(Math.round(monsters * (0.2 + 0.075 * (floor - 1))));
      const d = distances(map, find(map, 'H'));
      expect(d.size).toBe(48 * 48 - count(map, '#') - count(map, 'B') - count(map, 'o') - count(map, 'c'));
      expect(count(map, 'M')).toBe(floor < FLOORS ? 0 : 1); // 보스는 계단 없는 마지막 층에만
      const [x, z] = find(map, floor < FLOORS ? '>' : 'M');
      expect(d.get(z * 48 + x)).toBeGreaterThanOrEqual(15);
    }
  }
});

test('소품: 화로 1개 이상, 막는 소품은 뒤쪽 벽에 붙고 계단·주인공 근처는 비어 있다', () => {
  const cheb = ([ax, az]: [number, number], [bx, bz]: [number, number]) => Math.max(Math.abs(ax - bx), Math.abs(az - bz));
  for (let seed = 1; seed <= 50; seed++) {
    for (let floor = 1; floor <= FLOORS; floor++) {
      const map = generateFloor(seed, floor);
      expect(count(map, 'B')).toBeGreaterThanOrEqual(1);
      const hero = find(map, 'H');
      const stairs = find(map, floor < FLOORS ? '>' : 'M'); // 계단이나 보스 주변은 비운다
      map.forEach((row, z) =>
        [...row].forEach((c, x) => {
          if (!'Boc,'.includes(c)) return;
          expect(cheb([x, z], hero)).toBeGreaterThanOrEqual(2);
          expect(cheb([x, z], stairs)).toBeGreaterThanOrEqual(3);
          if (c === ',') return;
          // 뒤쪽 벽(-x·-z)에 붙고 앞쪽(+x·+z, 카메라 쪽)은 열려 있어 벽에 가려지지 않는다
          expect([map[z][x - 1], map[z - 1][x]]).toContain('#');
          expect([map[z][x + 1], map[z + 1][x]]).not.toContain('#');
        }),
      );
    }
  }
});

test('같은 시드면 같은 맵, 다른 시드면 다른 맵', () => {
  expect(generateFloor(7, 3)).toEqual(generateFloor(7, 3));
  expect(generateFloor(7, 3)).not.toEqual(generateFloor(8, 3));
});

test('생성한 맵을 createWorld가 읽고 배율을 적용한다', () => {
  const w = createWorld(1, generateFloor(1, 2), 1.2);
  expect(w.stairs).not.toBeNull();
  expect(w.entities).toHaveLength(1 + 11);
  for (const e of w.entities.slice(1)) expect(e.maxHp).toBe({ minion: 36, warrior: 72, archer: 30, mage: 26 }[e.kind as string]! * (e.elite ? 3 : 1));
});

test('상자: 층마다 몇 개(방의 약 35%), 막는 소품 규칙을 따른다', () => {
  let total = 0;
  for (let seed = 1; seed <= 50; seed++) total += count(generateFloor(seed, 2), 'c');
  expect(total / 50).toBeGreaterThan(1.2);
  expect(total / 50).toBeLessThan(3.5);
});

test('층 배율: 층마다 +15%, 회차마다 ×1.5씩 더해짐', () => {
  [1, 1.15, 1.6].forEach((v, i) => expect(floorPower([1, 2, 5][i])).toBeCloseTo(v));
  expect(floorPower(1, 1)).toBeCloseTo(1.5);
  expect(floorPower(5, 2)).toBeCloseTo(1.6 * 2);
});

test('층 테마: 1~3층 벽돌 던전, 4~5층 동굴', () => {
  expect([1, 2, 3, 4, 5].map(themeFor)).toEqual(['dungeon', 'dungeon', 'dungeon', 'cave', 'cave']);
});
