// 봇이 1~5층을 끝까지 플레이한다: 전체 밸런스(레벨·드롭·궁수·보스)가 깰 수 있는 수준인지 지키는 회귀 테스트.
import { expect, test } from 'vitest';
import { playthrough } from './bot';

test('봇이 5층 보스까지 깰 수 있고, 스킬을 쓰면 확실히 덜 죽으며, 스킬 없이는 쉽지 않다', { timeout: 300_000 }, () => {
  const play = (skills: boolean) => Array.from({ length: 30 }, (_, i) => playthrough(i + 1, skills)); // 맵 무작위성 편차를 줄이려고 30판
  const deaths = (rs: ReturnType<typeof play>) => rs.reduce((a, r) => a + r.deaths, 0);
  const withSkills = play(true);
  const without = play(false);
  expect(withSkills.filter((r) => r.cleared).length).toBeGreaterThanOrEqual(27);
  for (const r of withSkills.filter((r) => r.cleared)) expect(r.level).toBeGreaterThanOrEqual(5); // 성장 루프가 실제로 돈다
  expect(deaths(withSkills)).toBeLessThanOrEqual(20); // 지금 10
  expect(deaths(without)).toBeGreaterThanOrEqual(10); // 너무 쉬워지면 걸린다. 지금 17(가르기가 끝나도 대상을 유지하게 되어 봇이 가르기를 제대로 쓰면서 새로 잡은 기준)
  expect(deaths(withSkills)).toBeLessThan(deaths(without));
});
