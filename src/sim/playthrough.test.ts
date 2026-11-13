// 봇이 1~5층을 끝까지 플레이한다: 전체 밸런스(레벨·드롭·궁수·보스)가 깰 수 있는 수준인지 지키는 회귀 테스트.
import { expect, test } from 'vitest';
import { playthrough } from './bot';

test('봇이 구르고 받아치면 5층 보스까지 깨지만 여러 번 죽고, 서서 맞으면 거의 못 깬다', { timeout: 300_000 }, () => {
  const play = (skills: boolean, dodge = true) => Array.from({ length: 30 }, (_, i) => playthrough(i + 1, skills, dodge)); // 맵 무작위성 편차를 줄이려고 30판
  const deaths = (rs: ReturnType<typeof play>) => rs.reduce((a, r) => a + r.deaths, 0);
  const withSkills = play(true);
  const without = play(false);
  const standing = play(true, false); // 스킬은 쓰지만 구르지도, 바닥의 예고를 피하지도 않는다
  expect(withSkills.filter((r) => r.cleared).length).toBeGreaterThanOrEqual(26); // 지금 28
  for (const r of withSkills.filter((r) => r.cleared)) expect(r.level).toBeGreaterThanOrEqual(5); // 성장 루프가 실제로 돈다
  expect(deaths(withSkills)).toBeLessThanOrEqual(75); // 지금 42(판당 1.4번)
  expect(deaths(withSkills)).toBeGreaterThanOrEqual(30); // 너무 쉬워지면 걸린다
  expect(deaths(without)).toBeGreaterThan(deaths(withSkills) + 30); // 받아치기 없이는 훨씬 어렵다. 지금 129
  expect(standing.filter((r) => r.cleared).length).toBeLessThanOrEqual(5); // 서서 맞교환하면 진다. 지금 2
});

test('마법사 봇도 5층까지 깨지만 여러 번 죽고, 스킬 없이는 못 깨며, 피하지 않으면 훨씬 어렵다', { timeout: 300_000 }, () => {
  const play = (skills: boolean, dodge = true) => Array.from({ length: 30 }, (_, i) => playthrough(i + 1, skills, dodge, 'wizard'));
  const deaths = (rs: ReturnType<typeof play>) => rs.reduce((a, r) => a + r.deaths, 0);
  const withSkills = play(true);
  const standing = play(true, false);
  expect(withSkills.filter((r) => r.cleared).length).toBeGreaterThanOrEqual(25); // 지금 28
  expect(deaths(withSkills)).toBeGreaterThanOrEqual(30); // 지금 47(기사 42)
  expect(deaths(withSkills)).toBeLessThanOrEqual(75);
  expect(deaths(standing)).toBeGreaterThan(deaths(withSkills) + 30); // 지금 111
  expect(play(false).filter((r) => r.cleared).length).toBeLessThanOrEqual(3); // 마력탄만으로는 못 깬다. 지금 0
});

test('궁수 봇도 5층까지 깨지만 여러 번 죽고, 스킬 없이는 못 깨며, 피하지 않으면 훨씬 어렵다', { timeout: 300_000 }, () => {
  const play = (skills: boolean, dodge = true) => Array.from({ length: 30 }, (_, i) => playthrough(i + 1, skills, dodge, 'ranger'));
  const deaths = (rs: ReturnType<typeof play>) => rs.reduce((a, r) => a + r.deaths, 0);
  const withSkills = play(true);
  const standing = play(true, false);
  const bare = play(false);
  expect(withSkills.filter((r) => r.cleared).length).toBeGreaterThanOrEqual(25); // 지금 26
  expect(deaths(withSkills)).toBeGreaterThanOrEqual(30); // 지금 45(기사 42, 마법사 47)
  expect(deaths(withSkills)).toBeLessThanOrEqual(75);
  expect(deaths(standing)).toBeGreaterThan(deaths(withSkills) + 30); // 붙어도 구르지 않으면 훨씬 어렵다. 지금 79
  expect(bare.filter((r) => r.cleared).length).toBeLessThanOrEqual(3); // 화살만으로는 못 깬다. 지금 0
});
