import { expect, test } from 'vitest';
import { blizzard, SIGHT, sightFade, warnBlizzard } from './sight';

test('시야: 반경 2m 앞까지는 다 보이고, 반경에서 사라진다', () => {
  expect(SIGHT).toBe(14);
  expect([0, 12, 13, 14, 20].map((d) => sightFade(d))).toEqual([1, 1, 0.5, 0, 0]);
  expect(sightFade(7, 8)).toBe(0.5); // 눈보라(시야 8m)
});

test('눈보라: 40~60초 쉬고 8초 분다(앞뒤 1.5초 차오르고 걷힘), 시작 2초 전에 예고', () => {
  for (const seed of [1, 7, 12345]) {
    const wins: [number, number][] = []; // 세기 > 0인 구간
    const full: number[] = []; // 세기 1인 구간 길이
    let fullStart = -1;
    for (let i = 0; i <= 6000; i++) {
      const t = i / 10;
      const b = blizzard(t, seed);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThanOrEqual(1);
      const last = wins[wins.length - 1];
      if (b > 0) last && last[1] >= t - 0.11 ? (last[1] = t) : wins.push([t, t]);
      if (b === 1 && fullStart < 0) fullStart = t;
      if (b < 1 && fullStart >= 0) full.push(t - fullStart), (fullStart = -1);
    }
    expect(wins.length).toBeGreaterThanOrEqual(8);
    for (const len of full) expect(len).toBeCloseTo(5, 0);
    wins.slice(0, -1).forEach(([s, e]) => expect(e - s).toBeGreaterThan(7.6));
    for (let k = 1; k < wins.length; k++) {
      const gap = wins[k][0] - wins[k - 1][1];
      expect(gap).toBeGreaterThanOrEqual(39.8);
      expect(gap).toBeLessThanOrEqual(60.2);
    }
    expect(wins[0][0]).toBeGreaterThanOrEqual(39.8); // 들어가자마자 불지는 않는다
    for (const [s] of wins) {
      expect(warnBlizzard(s - 1.8, seed)).toBe(true);
      expect(warnBlizzard(s - 2.3, seed)).toBe(false);
    }
  }
});
