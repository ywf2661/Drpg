import { expect, test } from 'vitest';
import { bossName, createWorld, LANDS, step } from './world';
import { FLOORS, OPEN, walkDistances } from './dungeon';
import { generateWild, wildCount } from './wilds';

const count = (map: string[], chars: string) => map.join('').split('').filter((c) => chars.includes(c)).length;

for (const land of ['field', 'snow'] as const)
  test(`${LANDS[land].name}: 시드가 같으면 같은 맵, 모든 칸이 이어져 있고 주인공·출구·몬스터가 있다`, () => {
    for (let seed = 1; seed <= 40; seed++) {
      const floor = 1 + (seed % FLOORS);
      const map = generateWild(seed, floor, land);
      expect(map).toEqual(generateWild(seed, floor, land));
      expect(count(map, 'H')).toBe(1);
      expect(count(map, floor < FLOORS ? '>' : 'M')).toBe(1);
      expect(count(map, 'mwagNWAG')).toBe(wildCount(floor, land));
      expect(count(map, land === 'field' ? 'aA' : 'gG')).toBe(0); // 초원에 궁수, 설원에 마법사는 없다
      const cells = map.map((r) => r.split(''));
      const hz = map.findIndex((r) => r.includes('H'));
      const d = walkDistances(cells, map[hz].indexOf('H'), hz);
      expect(cells.flatMap((row, z) => row.filter((c, x) => OPEN(c) && d[z * 48 + x] < 0))).toEqual([]); // 닿지 못하는 칸이 없다
      expect(count(map, '#')).toBeLessThan(48 * 48 - 500);
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
