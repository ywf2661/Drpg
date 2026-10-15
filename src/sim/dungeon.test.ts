import { expect, test } from 'vitest';
import { FLOORS, generateFloor } from './dungeon';
import { createWorld } from './world';

const count = (map: string[], c: string) => map.join('').split(c).length - 1;
const find = (map: string[], c: string): [number, number] => {
  const i = map.join('').indexOf(c);
  return [i % map[0].length, Math.floor(i / map[0].length)];
};

const WALLS = '#Bo'; // 지나갈 수 없는 글자

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

test('시드 1~50 × 1~5층: 크기, 테두리, 주인공·계단·몬스터 수, 모든 칸 연결, 계단은 멀리', () => {
  for (let seed = 1; seed <= 50; seed++) {
    for (let floor = 1; floor <= FLOORS; floor++) {
      const map = generateFloor(seed, floor);
      expect(map).toHaveLength(48);
      expect(map.every((r) => r.length === 48)).toBe(true);
      expect(map[0] + map[47] + map.map((r) => r[0] + r[47]).join('')).toMatch(/^#+$/);
      expect(count(map, 'H')).toBe(1);
      expect(count(map, '>')).toBe(floor < FLOORS ? 1 : 0);
      const monsters = 8 + 3 * (floor - 1);
      expect(count(map, 'm') + count(map, 'w')).toBe(monsters);
      expect(count(map, 'w')).toBe(Math.round(monsters * (0.2 + 0.075 * (floor - 1))));
      const d = distances(map, find(map, 'H'));
      expect(d.size).toBe(48 * 48 - count(map, '#') - count(map, 'B') - count(map, 'o'));
      if (floor < FLOORS) {
        const [x, z] = find(map, '>');
        expect(d.get(z * 48 + x)).toBeGreaterThanOrEqual(15);
      }
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
      const stairs = floor < FLOORS ? find(map, '>') : null;
      map.forEach((row, z) =>
        [...row].forEach((c, x) => {
          if (!'Bo,'.includes(c)) return;
          expect(cheb([x, z], hero)).toBeGreaterThanOrEqual(2);
          if (stairs) expect(cheb([x, z], stairs)).toBeGreaterThanOrEqual(3);
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
  for (const e of w.entities.slice(1)) expect(e.maxHp).toBe(e.kind === 'minion' ? 36 : 72);
});
