// 봇이 1~5층을 끝까지 플레이한다: 전체 밸런스(레벨·드롭·궁수·보스)가 깰 수 있는 수준인지 지키는 회귀 테스트.
import { expect, test } from 'vitest';
import { playthrough } from './bot';

test('봇이 5층 보스까지 깰 수 있고, 스킬을 쓰고 예고 공격을 피하면 확실히 덜 죽으며, 그러지 않으면 쉽지 않다', { timeout: 300_000 }, () => {
  const play = (skills: boolean, dodge = true) => Array.from({ length: 30 }, (_, i) => playthrough(i + 1, skills, dodge)); // 맵 무작위성 편차를 줄이려고 30판
  const deaths = (rs: ReturnType<typeof play>) => rs.reduce((a, r) => a + r.deaths, 0);
  const withSkills = play(true);
  const without = play(false);
  const standing = play(true, false); // 스킬은 쓰지만 바닥의 예고를 피하지 않는다
  expect(withSkills.filter((r) => r.cleared).length).toBeGreaterThanOrEqual(27);
  for (const r of withSkills.filter((r) => r.cleared)) expect(r.level).toBeGreaterThanOrEqual(5); // 성장 루프가 실제로 돈다
  expect(deaths(withSkills)).toBeLessThanOrEqual(25); // 지금 17
  expect(deaths(without)).toBeGreaterThanOrEqual(25); // 너무 쉬워지면 걸린다. 지금 40
  expect(deaths(standing)).toBeGreaterThan(deaths(withSkills) + 4); // 서서 맞으면 손해여야 한다. 지금 26
});
