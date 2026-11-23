import { expect, test } from 'vitest';
import { generateFloor, walkDistances } from './dungeon';
import { createWorld, DT, LANDS, step, uniqueOf } from './world';
import { clearLine, hurt } from './core';
import { spawnNear, touchChest } from './gimmicks';
import { landSword, litBeams, paladin, tickPaladin } from './paladin';
import { makeMap } from './wilds';
import { hasAllRelics, hasHorse, prayerFall, prayerMeet, RELIC_FROM, RELIC_TEXT, RELICS, TRACES, ALL_RELICS, ARENA, generateArena, missAfter, PALADIN, relicCount, relicDue, relicRoll, SANCTUM } from './sanctum';
import { stun } from './wizard';

// 회차 c마다 네 보스를 처음 깬다고 치고 성물을 모은다. 돌려주는 값 = 넷이 다 모인 회차(0부터)
function collect(salt: number) {
  let [relics, miss] = [0, [0, 0, 0, 0]];
  for (let c = 0; c < 10; c++) {
    for (let k = 0; k < 4; k++) {
      const got = relicDue(relics, miss, k, c, salt);
      if (got) relics |= 1 << k;
      miss = missAfter(miss, k, got);
    }
    if (relics === ALL_RELICS) return c;
  }
  return 99;
}

test('성물은 늦어도 3회차에 다 모이고, 1·2회차 안에 다 모이는 판도 있다', () => {
  const at = Array.from({ length: 400 }, (_, i) => collect(i * 7919 + 13));
  expect(Math.max(...at)).toBe(2);
  const by2 = at.filter((c) => c <= 1).length / at.length;
  expect(by2).toBeGreaterThan(0.72); // 이론값 81%(1회차 50%, 2회차부터 90%)
  expect(by2).toBeLessThan(0.9);
});

test('이미 가진 성물은 다시 안 떨어지고, 두 번 놓치면 확정', () => {
  expect(relicDue(0b0001, [0, 0, 0, 0], 0, 0, 1)).toBe(false);
  expect(relicDue(0, [SANCTUM.pity, 0, 0, 0], 0, 5, 1)).toBe(true);
  expect(relicDue(0, [0, 0, 0, 0], -1, 0, 1)).toBe(false); // 이야기 지역이 아니면(성소 자체) 없음
});

test('같은 회차·지역·이름이면 굴림이 같다(죽고 다시 들어가도 다시 굴리지 못한다)', () => {
  expect(relicRoll(1, 2, 42)).toBe(relicRoll(1, 2, 42));
  expect(relicRoll(1, 2, 42)).not.toBe(relicRoll(2, 2, 42));
});

test('놓친 횟수는 그 지역만, pity에서 멈춘다. 얻었으면 그대로', () => {
  expect(missAfter([0, 1, 0, 0], 1, false)).toEqual([0, 2, 0, 0]);
  expect(missAfter([0, 2, 0, 0], 1, false)).toEqual([0, 2, 0, 0]);
  expect(missAfter([0, 1, 0, 0], 1, true)).toEqual([0, 1, 0, 0]);
  expect(relicCount(0b1011)).toBe(3);
});

test('결전장: 성소 넷·성기사·주인공이 있고 주인공에서 다 걸어서 닿는다', () => {
  const map = generateArena();
  expect(map.length).toBe(ARENA.size);
  const count = (c: string) => map.join('').split(c).length - 1;
  expect([count('$'), count('M'), count('H')]).toEqual([4, 1, 1]);
  const cells = map.map((r) => r.split(''));
  const d = walkDistances(cells, ARENA.hero[0], ARENA.hero[1]);
  const near = ([x, z]: number[]) => Math.max(...[[1, 0], [-1, 0], [0, 1], [0, -1]].map(([a, b]) => d[(z + b) * ARENA.size + x + a]));
  for (const p of [...ARENA.altars, ARENA.center]) expect(near(p)).toBeGreaterThan(0); // 성소는 막는 칸이라 이웃 칸
});

// 결전장 world: 성기사는 기절시켜 세워 두고(주인공을 때리지 않게), 주인공은 성소 곁에 둔다
function arena() {
  const w = createWorld(7, generateArena(), 1, 1, LANDS.sanctum.skins);
  w.land = 'sanctum';
  const boss = w.entities.find((e) => e.kind === 'boss')!;
  boss.stunT = 1e9;
  const altars = w.chests.filter((c) => c.kind === 'altar');
  const hero = w.entities[0];
  const stand = (c: (typeof altars)[0]) => Object.assign(hero, { x: c.x + 0.5, z: c.z + 1.6, path: [], state: 'idle' as const });
  const run = (sec: number) => { for (let i = 0; i < Math.round(sec / DT); i++) step(w, []); };
  return { w, boss, altars, hero, stand, run };
}

test('성소가 켜져 있으면 성기사는 무적, 넷 다 끄면 창 동안 맞는다', () => {
  const { w, boss, altars, stand, run } = arena();
  expect(boss.skin).toBe('fallen_paladin');
  expect(altars.length).toBe(4);
  expect(hurt(w, boss, 100, w.entities[0])).toBe(0);
  for (const c of altars) {
    stand(c);
    w.offer = { id: c.id, t: 0 };
    run(SANCTUM.offer + 0.1);
    expect(c.open).toBe(true);
  }
  expect(w.bareT).toBeGreaterThan(0);
  expect(hurt(w, boss, 100, w.entities[0])).toBeGreaterThan(0);
  run(SANCTUM.window + 0.1);
  expect(altars.filter((c) => !c.open).length).toBe(SANCTUM.relight); // 창이 끝나면 둘이 다시 켜진다
  expect(hurt(w, boss, 100, w.entities[0])).toBe(0);
});

test('바치는 도중 움직이거나 맞으면 끊긴다', () => {
  const { w, altars, hero, stand, run } = arena();
  stand(altars[0]);
  w.offer = { id: altars[0].id, t: 0 };
  run(0.5);
  hero.hp -= 5;
  run(0.2);
  expect(w.offer?.t ?? 0).toBeLessThan(0.3); // 끊겼다(그 자리에 서 있으면 처음부터 다시 찬다)
  expect(altars[0].open).toBe(false);
  w.offer = { id: altars[0].id, t: 0 };
  hero.path = [[24, 30]];
  hero.state = 'move';
  run(0.1);
  expect(w.offer).toBe(null);
});

test('켜진 성소에 바짝 붙어 멈춰 서면 저절로 바친다(걷는 중에는 시작하지 않는다)', () => {
  const { w, altars, hero, run } = arena();
  const c = altars[0];
  Object.assign(hero, { x: c.x + 0.5, z: c.z + 1.4, path: [[c.x + 0.5, c.z + 3]], state: 'move' as const });
  step(w, []);
  expect(w.offer).toBe(null);
  Object.assign(hero, { x: c.x + 0.5, z: c.z + 1.4, path: [], state: 'idle' as const });
  run(SANCTUM.offer + 0.1);
  expect(c.open).toBe(true);
});

test('체력 절반 아래에서 해골 기사 왕 둘이 일어나 곁의 성소를 지킨다', () => {
  const { w, boss, altars, run } = arena();
  boss.hp = Math.floor(boss.maxHp / 2);
  run(0.1);
  const knights = w.entities.filter((e) => e.kind === 'king' && e.state !== 'dead');
  expect(knights.length).toBe(SANCTUM.knights);
  expect(knights.every((k) => k.skin === 'bone_knight')).toBe(true);
  const guarded = altars.find((c) => knights.some((k) => Math.hypot(k.x - c.x - 0.5, k.z - c.z - 0.5) <= SANCTUM.guard))!;
  expect(touchChest(w, guarded)).toBe(true);
  expect(w.offer).toBe(null); // 지키는 기사가 있으면 바치기를 시작하지 않는다
});

test('지역 보스가 성물을 떨구고, 주우면 relics·relicGot', () => {
  const w = createWorld(3, generateFloor(3, 5), 1, 1, LANDS.ruins.skins);
  w.relicDrop = 3;
  const boss = w.entities.find((e) => e.kind === 'boss')!;
  hurt(w, boss, 1e9, w.entities[0]);
  const relic = w.items.find((it) => it.kind === 'relic')!;
  expect(relic.relic).toBe(3);
  Object.assign(w.entities[0], { x: relic.x, z: relic.z });
  step(w, []);
  expect(w.relics).toBe(0b1000);
  expect(w.relicGot).toBe(3);
});

test('빛의 사슬: 줄 수 = 켜진 성소 수, 기절·성검의 비 동안 0, 성소 밖이면 0', () => {
  const { w, boss, altars } = arena();
  boss.stunT = 0;
  expect(litBeams(w).length).toBe(4);
  altars[0].open = true;
  expect(litBeams(w).length).toBe(3);
  w.pal.quiet = 1;
  expect(litBeams(w).length).toBe(0);
  w.pal.quiet = 0;
  boss.stunT = 1;
  expect(litBeams(w).length).toBe(0);
  const out = createWorld(3, generateFloor(3, 5), 1, 1, LANDS.ruins.skins);
  spawnNear(out, 'boss', out.entities[0].x, out.entities[0].z, 3, -1, 'fallen_paladin');
  expect(litBeams(out).length).toBe(0);
});

test('빛의 사슬: 줄 위에 서면 데이고, 1초에 한 번만', () => {
  const { w, boss, altars, hero } = arena();
  boss.stunT = 0;
  const [ax, az] = [altars[0].x + 0.5, altars[0].z + 0.5];
  Object.assign(hero, { x: boss.x + (ax - boss.x) * 0.25, z: boss.z + (az - boss.z) * 0.25 });
  const hp0 = hero.hp;
  for (let i = 0; i < Math.round(PALADIN.beamWarn / DT); i++) tickPaladin(w); // 새로 잇는 줄: 예고 동안은 데지 않는다
  expect(hero.hp).toBe(hp0);
  tickPaladin(w);
  const hp1 = hero.hp;
  expect(hp1).toBeLessThan(hp0);
  tickPaladin(w);
  expect(hero.hp).toBe(hp1);
  for (let i = 0; i < Math.round(PALADIN.beamEvery / DT); i++) tickPaladin(w);
  expect(hero.hp).toBeLessThan(hp1);
  Object.assign(hero, { x: altars[2].x + 0.5, z: altars[2].z + 2.5, hp: hero.maxHp }); // 줄에서 먼 곳
  for (let i = 0; i < 30; i++) tickPaladin(w);
  expect(hero.hp).toBe(hero.maxHp);
  // 기절로 끊겼다가 다시 이으면 또 예고부터
  Object.assign(hero, { x: boss.x + (ax - boss.x) * 0.25, z: boss.z + (az - boss.z) * 0.25 });
  boss.stunT = 0.5;
  tickPaladin(w);
  boss.stunT = 0;
  tickPaladin(w);
  expect(w.pal.link[altars[0].id]).toBeGreaterThan(0);
  expect(hero.hp).toBe(hero.maxHp);
});

test('성검의 비: 0.8초 치켜든 뒤 표식 8개, 하나는 주인공 발밑, 성소 2m 안에는 없음', () => {
  const { w, boss, altars, hero } = arena();
  boss.stunT = 0;
  Object.assign(hero, { x: 24.5, z: 27.5 });
  w.pal.rain = 0;
  expect(paladin(w, boss, hero)).toBe(true);
  expect(boss.phase).toBe('raise');
  expect(litBeams(w).length).toBe(0);
  for (let i = 0; i < Math.round(PALADIN.raise / DT); i++) paladin(w, boss, hero);
  const marks = w.zones.filter((z) => z.kind === 'sword');
  expect(marks.length).toBe(PALADIN.rainCount);
  expect(marks.some((z) => Math.floor(z.x) === 24 && Math.floor(z.z) === 27)).toBe(true);
  for (const z of marks) for (const c of altars) expect(Math.hypot(z.x - c.x - 0.5, z.z - c.z - 0.5)).toBeGreaterThanOrEqual(PALADIN.altarGap);
  expect(boss.phase).toBe('none');
});

test('성검: 빈 칸은 6초 벽(돌진 시야도 막음), 사람이 선 칸은 피해만, 성기사가 죽어도 벽은 풀린다', () => {
  const { w, boss, hero } = arena();
  boss.stunT = 0;
  Object.assign(hero, { x: 24.5, z: 26.5 });
  const zone = (x: number, z: number) => ({ id: w.nextItem++, x: x + 0.5, z: z + 0.5, r: PALADIN.swordR, t: 0, total: PALADIN.rainDelay, dmg: 50, owner: -1, kind: 'sword' as const });
  landSword(w, zone(24, 24));
  expect(w.grid.blocked[24 * w.grid.w + 24]).toBe(1);
  expect(clearLine(w, boss, hero)).toBe(false);
  const hp0 = hero.hp;
  landSword(w, zone(24, 26));
  expect(hero.hp).toBeLessThan(hp0);
  expect(w.grid.blocked[26 * w.grid.w + 24]).toBe(0);
  boss.state = 'dead'; // 고리 때문에 hurt로는 못 죽이니 바로 죽은 것으로
  for (let i = 0; i < Math.round(PALADIN.swordWall / DT) + 1; i++) tickPaladin(w);
  expect(w.grid.blocked[24 * w.grid.w + 24]).toBe(0);
  expect(w.swords.length).toBe(0);
});

test('심판: 체력 절반 전에는 잠겨 있고, 절반 아래면 3초 뒤 첫 사용', () => {
  const { w, boss } = arena();
  boss.stunT = 0;
  tickPaladin(w);
  expect(w.pal.judge).toBe(-1);
  boss.hp = Math.floor(boss.maxHp / 2);
  tickPaladin(w);
  expect(w.pal.judge).toBe(PALADIN.judgeFirst);
});

test('심판: 3m 안은 무사, 밖은 맞는다. 성검의 비가 진행 중이면 기다린다', () => {
  const { w, boss, hero } = arena();
  boss.stunT = 0;
  Object.assign(w.pal, { judge: 0, rain: 99, quiet: 1 });
  Object.assign(hero, { x: boss.x + 2, z: boss.z });
  paladin(w, boss, hero);
  expect(boss.phase).toBe('none');
  w.pal.quiet = 0;
  paladin(w, boss, hero);
  expect(boss.phase).toBe('pray');
  const hp0 = hero.hp;
  for (let i = 0; i < Math.round(PALADIN.judgeWindup / DT) + 1; i++) paladin(w, boss, hero);
  expect(hero.hp).toBe(hp0);
  Object.assign(w.pal, { judge: 0 });
  Object.assign(hero, { x: boss.x + 5, z: boss.z });
  paladin(w, boss, hero);
  for (let i = 0; i < Math.round(PALADIN.judgeWindup / DT) + 1; i++) paladin(w, boss, hero);
  expect(hero.hp).toBeLessThan(hp0);
});

test('기도 중 기절하거나 고리가 깨지면 심판이 끊긴다', () => {
  const { w, boss, altars, hero, stand, run } = arena();
  boss.stunT = 0;
  Object.assign(w.pal, { judge: 0, rain: 99 });
  paladin(w, boss, hero);
  expect(boss.phase).toBe('pray');
  stun(boss, 1);
  expect(boss.phase).toBe('none');
  boss.phase = 'pray';
  boss.stunT = 1e9; // 고리 깨짐 경로: tickAltars
  for (const c of altars) { stand(c); w.offer = { id: c.id, t: 0 }; run(SANCTUM.offer + 0.1); }
  expect(boss.phase).toBe('none');
});

test('성기사가 곁에서 쉬지 않고 휘두르는 중이어도 성검의 비·심판을 쓴다', () => {
  const { w, boss, hero } = arena();
  boss.stunT = 0;
  Object.assign(boss, { state: 'attack', attackT: 0.3 });
  w.pal.rain = 0;
  expect(paladin(w, boss, hero)).toBe(true);
  expect(boss.phase).toBe('raise');
  const r = arena();
  r.boss.stunT = 0;
  Object.assign(r.boss, { state: 'attack', attackT: 0.3 });
  Object.assign(r.w.pal, { judge: 0, rain: 99 });
  paladin(r.w, r.boss, r.hero);
  expect(r.boss.phase).toBe('pray');
});

test('이야기: 귀중품마다 설명, 성소 1~4층마다 흔적, 처음 쓰러뜨리면 긴 대화(그 왕의 아이는)', () => {
  expect(RELIC_TEXT).toHaveLength(RELICS.length);
  expect(RELIC_FROM).toHaveLength(RELICS.length);
  expect(TRACES).toHaveLength(4);
  expect(hasAllRelics(0b11111) && hasAllRelics(0b1111) && !hasAllRelics(0b10111)).toBe(true);
  expect(hasHorse(0b1111)).toBe(false);
  expect(prayerFall(true).some(([, t]) => t.includes('그 왕의 아이는'))).toBe(true);
  expect(prayerFall(false)).toHaveLength(1);
  expect(prayerMeet(true).length).toBeGreaterThan(prayerMeet(false).length);
});

test('성소 1~4층에는 어느 시드든 흔적(L)이 하나씩 놓인다', () => {
  for (let seed = 1; seed <= 40; seed++)
    for (let n = 1; n <= 4; n++) expect(makeMap(seed, n, 'sanctum', 'w', undefined, 'L').join('').split('L').length - 1).toBe(1);
});

test('기도하는 자가 쓰러지면 해골 기사·졸개도 함께 무너진다', () => {
  const { w, boss, hero } = arena();
  const k = spawnNear(w, 'king', boss.x, boss.z, 3, -1, 'bone_knight')!;
  const m = spawnNear(w, 'minion', boss.x, boss.z, 3)!;
  w.bareT = 99; // 고리가 깨진 창
  hurt(w, boss, boss.hp + 1, hero);
  expect(boss.state).toBe('dead');
  expect([k.state, m.state]).toEqual(['dead', 'dead']);
  expect(hero.state).not.toBe('dead');
});

test('처음 쓰러뜨리면 빛 고리는 바닥(시체 머리 쪽)에, 다시 도전할 땐 가방에', () => {
  for (const first of [true, false]) {
    const { w, boss, hero } = arena();
    Object.assign(w, { haloDrop: 1, horseDrop: first });
    w.bareT = 99;
    hurt(w, boss, boss.hp + 1, hero);
    const floor = w.items.find((it) => it.affixes && uniqueOf(it as never) === 'crackedHalo');
    expect(!!floor).toBe(first);
    expect(w.bag.some((b) => uniqueOf(b) === 'crackedHalo')).toBe(!first);
    if (floor) expect(floor.z).toBeLessThan(boss.z);
  }
});
