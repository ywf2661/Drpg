// 봇이 1~5층을 끝까지 플레이한다: 전체 밸런스(레벨·드롭·궁수·보스)가 깰 수 있는 수준인지 지키는 회귀 테스트.
import { expect, test } from 'vitest';
import { playthrough } from './bot';

test('봇이 5층 보스까지 깰 수 있다(대부분의 시드에서, 사망은 적게)', { timeout: 120_000 }, () => {
  const results = [1, 2, 3, 4, 5, 6].map(playthrough);
  const cleared = results.filter((r) => r.cleared);
  expect(cleared.length).toBeGreaterThanOrEqual(4);
  for (const r of cleared) expect(r.level).toBeGreaterThanOrEqual(5); // 성장 루프가 실제로 돈다
  expect(results.reduce((a, r) => a + r.deaths, 0)).toBeLessThanOrEqual(12);
});
