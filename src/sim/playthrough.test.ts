// 봇이 1~5층을 끝까지 플레이한다: 전체 밸런스(레벨·드롭·궁수·보스)가 깰 수 있는 수준인지 지키는 회귀 테스트.
import { expect, test } from 'vitest';
import { playthrough } from './bot';

test('봇이 구르고 받아치면 5층 보스까지 깨지만 여러 번 죽고, 서서 맞으면 거의 못 깬다', { timeout: 300_000 }, () => {
  const play = (skills: boolean, dodge = true) => Array.from({ length: 30 }, (_, i) => playthrough(i + 1, skills, dodge)); // 맵 무작위성 편차를 줄이려고 30판
  const deaths = (rs: ReturnType<typeof play>) => rs.reduce((a, r) => a + r.deaths, 0);
  const withSkills = play(true);
  const without = play(false);
  const standing = play(true, false); // 스킬은 쓰지만 구르지도, 바닥의 예고를 피하지도 않는다
  expect(withSkills.filter((r) => r.cleared).length).toBeGreaterThanOrEqual(4); // 지금 7. MONSTER_DMG 3.25(사용자: 너무 쉽다) 뒤. 봇은 층마다 4번 죽으면 포기해 사망 수가 포화한다 — 그 전 수치는 git 기록
  for (const r of withSkills.filter((r) => r.cleared)) expect(r.level).toBeGreaterThanOrEqual(5); // 성장 루프가 실제로 돈다
  expect(deaths(withSkills)).toBeLessThanOrEqual(165); // 지금 94(장비 단계 tierOf 뒤. 그 전 95, 기력·마나 뒤. 비용 없을 때 97, 구르기 끈 때 136)
  expect(deaths(withSkills)).toBeGreaterThanOrEqual(90); // 너무 쉬워지면 걸린다
  expect(without.filter((r) => r.cleared).length).toBeLessThanOrEqual(6); // 받아치기 없이는 거의 못 깬다. 지금 5(봉인 문 뒤: 문지기를 잡으면 도끼 없이도 계단 방이 열린다. 그 전 0)
  expect(standing.filter((r) => r.cleared).length).toBeLessThanOrEqual(2); // 바닥의 예고도 안 피하면 진다. 지금 0
});

test('마법사 봇도 5층까지 깨지만 여러 번 죽고, 스킬 없이는 못 깨며, 피하지 않으면 훨씬 어렵다', { timeout: 300_000 }, () => {
  const play = (skills: boolean, dodge = true) => Array.from({ length: 30 }, (_, i) => playthrough(i + 1, skills, dodge, 'wizard'));
  const deaths = (rs: ReturnType<typeof play>) => rs.reduce((a, r) => a + r.deaths, 0);
  const withSkills = play(true);
  const standing = play(true, false);
  expect(withSkills.filter((r) => r.cleared).length).toBeGreaterThanOrEqual(3); // 지금 11(마나 뒤. 비용 없을 때 21). MONSTER_DMG 3.25(사용자: 너무 쉽다) 뒤. 봇은 층마다 4번 죽으면 포기해 사망 수가 포화한다 — 그 전 수치는 git 기록
  expect(deaths(withSkills)).toBeGreaterThanOrEqual(110); // 지금 122(마나 뒤. 비용 없을 때 113)
  expect(deaths(withSkills)).toBeLessThanOrEqual(165);
  expect(standing.filter((r) => r.cleared).length).toBeLessThan(withSkills.filter((r) => r.cleared).length); // 피하지 않으면 더 못 깬다. 지금 1
  expect(play(false).filter((r) => r.cleared).length).toBeLessThanOrEqual(3); // 마력탄만으로는 못 깬다. 지금 0
});

test('궁수 봇도 5층까지 깨지만 여러 번 죽고, 스킬 없이는 못 깨며, 피하지 않으면 훨씬 어렵다', { timeout: 300_000 }, () => {
  const play = (skills: boolean, dodge = true) => Array.from({ length: 30 }, (_, i) => playthrough(i + 1, skills, dodge, 'ranger'));
  const deaths = (rs: ReturnType<typeof play>) => rs.reduce((a, r) => a + r.deaths, 0);
  const withSkills = play(true);
  const standing = play(true, false);
  const bare = play(false);
  expect(withSkills.filter((r) => r.cleared).length).toBeGreaterThanOrEqual(14); // 지금 19. MONSTER_DMG 3.25(사용자: 너무 쉽다) 뒤. 봇은 층마다 4번 죽으면 포기해 사망 수가 포화한다 — 그 전 수치는 git 기록
  expect(deaths(withSkills)).toBeGreaterThanOrEqual(60); // 지금 68(봉인 문 뒤. 그 전 80, 비용 없을 때 77): 궁수는 거리로 버틴다
  expect(deaths(withSkills)).toBeLessThanOrEqual(130);
  expect(deaths(standing)).toBeGreaterThan(deaths(withSkills) + 15); // 바닥의 예고를 안 피하면 훨씬 어렵다. 지금 135
  expect(bare.filter((r) => r.cleared).length).toBeLessThanOrEqual(5); // 화살만으로는 못 깬다. 지금 0
});

test('강령술사 봇도 5층까지 깨지만 여러 번 죽고, 스킬 없이는 못 깨며, 피하지 않으면 훨씬 어렵다', { timeout: 300_000 }, () => {
  const play = (skills: boolean, dodge = true) => Array.from({ length: 30 }, (_, i) => playthrough(i + 1, skills, dodge, 'necromancer'));
  const deaths = (rs: ReturnType<typeof play>) => rs.reduce((a, r) => a + r.deaths, 0);
  const withSkills = play(true);
  const standing = play(true, false);
  const bare = play(false);
  expect(withSkills.filter((r) => r.cleared).length).toBeGreaterThanOrEqual(15); // 지금 21(소환수 위주로 다시 짠 뒤: 해골 검사·궁수·법사, 시체 거인, 해골 왕). MONSTER_DMG 3.25(사용자: 너무 쉽다) 뒤. 봇은 층마다 4번 죽으면 포기해 사망 수가 포화한다 — 그 전 수치는 git 기록
  expect(deaths(withSkills)).toBeGreaterThanOrEqual(55); // 지금 94(마나 뒤. 비용 없을 때 85; 구르기 재사용 2.5초. 구르기 끈 때 102 — 재사용 1~3초 사이 57~71로 대기 시간에 거의 무관)
  expect(deaths(withSkills)).toBeLessThanOrEqual(130);
  expect(standing.filter((r) => r.cleared).length).toBeLessThan(withSkills.filter((r) => r.cleared).length); // 피하지 않으면 더 못 깬다. 지금 6
  expect(bare.filter((r) => r.cleared).length).toBeLessThanOrEqual(3); // 뼈 화살만으로는 못 깬다. 지금 0
});

test('바깥 지역: 봇이 다 잡은 뒤 같은 지역 출구로 걸어 나가 다음 구역에 간다', { timeout: 120_000 }, () => {
  for (const land of ['field', 'snow'] as const) {
    const r = playthrough(1, true, true, 'ranger', land);
    expect(r.cleared || r.floor > 1).toBe(true);
  }
});

test('초원 한 판: 기사 봇 10판 중 7판 이상 5구역을 깬다(같은 지역 출구만 탈 때)', { timeout: 300_000 }, () => {
  const rs = Array.from({ length: 10 }, (_, i) => playthrough(i + 1, true, true, 'knight', 'field'));
  expect(rs.filter((r) => r.cleared).length).toBeGreaterThanOrEqual(7); // 지금 8. 사망 평균 1.4(설원 기사 1.9)
});
