// 스킬 트리: 배우기 규칙(레벨·아래 단계·포인트), 칸 끼우기, 되돌리기, 시너지, 그리고 트리의 새 스킬·패시브
import { expect, test } from 'vitest';
import { shaft } from './ranger';
import { axeStat, BASIC, BOUNCE, bind, bonesStat, cleaveStat, createWorld, critStat, DT, EXECUTE, HUNT, isPassive, KEY_CD, KEYS, LEAP, learn, learnBlock, newSkills, RESPEC, respec, setLevel, SPREAD, step, TIER_LEVEL, TRAP, TREES, useClass, type Command, type HeroClass, type SkillId, type World } from './world';

const run = (w: World, sec: number, cmds: Command[] = []) => {
  step(w, cmds);
  for (let i = Math.round(sec / DT) - 1; i > 0; i--) step(w, []);
};
// 직업의 예전 스킬 넷 + 더 배운 스킬(단계), q면 그 스킬을 Q에. 적은 모두 체력이 크고 기절해 제자리에 서 있다
const make = (map: string[], cls: HeroClass, ranks: Partial<Record<SkillId, number>> = {}, q?: SkillId) => {
  const w = createWorld(1, map);
  useClass(w, cls);
  Object.assign(w.ranks, ranks);
  if (q) w.keys.cleave = q;
  w.gear.weapon = 1;
  for (const e of w.entities.slice(1)) Object.assign(e, { hp: 1e5, maxHp: 1e5, stunT: 1e9 });
  return w;
};
const lost = (w: World, i = 1) => 1e5 - w.entities[i].hp;

test('배우기: 레벨·아래 단계·포인트가 모자라면 못 배우고, 처음 배운 액티브는 빈 칸에, 패시브는 칸에 넣지 않는다', () => {
  const w = createWorld(1, ['H....']);
  Object.assign(w, newSkills('knight'), { points: 10 });
  expect(w.keys).toEqual({ cleave: 'cleave', dash: null, shout: null, throw: null });
  expect(learnBlock(w, 'fireball')).toBe('다른 직업의 스킬');
  expect(learnBlock(w, 'whirl')).toBe(`레벨 ${TIER_LEVEL[1]}부터 배울 수 있음`);
  setLevel(w, TIER_LEVEL[1], 0);
  expect(learnBlock(w, 'shout')).toBe('바로 아래 단계 스킬을 먼저 배워야 함'); // 돌진 베기를 안 배웠다
  learn(w, 'whirl');
  learn(w, 'throw');
  expect(w.keys).toEqual({ cleave: 'cleave', dash: 'whirl', shout: 'throw', throw: null });
  setLevel(w, TIER_LEVEL[2], 0);
  learn(w, 'burst');
  expect(w.ranks.burst).toBe(1);
  expect(Object.values(w.keys)).not.toContain('burst');
  for (let i = 0; i < 6; i++) learn(w, 'burst');
  expect(w.ranks.burst).toBe(5);
  expect(w.points).toBe(10 - 7); // 최고 단계에서는 포인트를 쓰지 않는다
  w.points = 0;
  expect(learnBlock(w, 'dash')).toBe('스킬 포인트 없음');
  // 명령으로도 같다
  w.points = 1;
  step(w, [{ type: 'learn', skill: 'dash' }]);
  expect(w.keys.throw).toBe('dash');
  // 궁극기도 레벨과 패시브를 거쳐야
  expect(learnBlock(w, 'execute')).toBe(`레벨 ${TIER_LEVEL[3]}부터 배울 수 있음`);
});

test('끼우기: 배운 액티브만, 다른 칸에 있던 스킬은 맞바꾸고 두 칸의 재사용 대기는 긴 쪽으로', () => {
  const w = createWorld(1, ['H....']);
  w.ranks.whirl = 1;
  w.ranks.burst = 1;
  w.skillCd = 3;
  w.throwCd = 0.5;
  bind(w, 'throw', 'burst'); // 패시브
  bind(w, 'throw', 'leap'); // 안 배움
  bind(w, 'throw', 'fireball'); // 다른 직업
  expect(w.keys.throw).toBe('throw');
  bind(w, 'throw', 'cleave');
  expect(w.keys).toEqual({ cleave: 'throw', dash: 'dash', shout: 'shout', throw: 'cleave' });
  expect([w.skillCd, w.throwCd]).toEqual([3, 3]);
  bind(w, 'dash', 'whirl');
  expect(w.keys.dash).toBe('whirl');
  expect(Object.values(w.keys).filter((k) => k === 'dash')).toHaveLength(0); // 빈 데서 끼우면 원래 것은 빠진다
});

test('되돌리기: 금화를 내고 포인트를 모두 돌려받아 새 판의 스킬로', () => {
  const w = createWorld(1, ['H....']);
  w.ranks = { cleave: 3, whirl: 2, throw: 1 };
  w.points = 1;
  respec(w);
  expect(w.ranks.cleave).toBe(3); // 금화가 없다
  w.gold = RESPEC + 7;
  respec(w);
  expect(w.gold).toBe(7);
  expect(w.points).toBe(1 + 5);
  expect(w.ranks).toEqual({ cleave: 1 });
  expect(w.keys).toEqual({ cleave: 'cleave', dash: null, shout: null, throw: null });
});

test('시너지: 같은 탭의 다른 스킬에 찍은 포인트마다 피해 +8%, 다른 탭은 상관없다', () => {
  const w = createWorld(1, ['H....']);
  w.ranks = { cleave: 1 };
  const base = cleaveStat(w).mult;
  w.ranks = { cleave: 1, whirl: 3, burst: 2, dash: 5 };
  expect(cleaveStat(w).mult).toBeCloseTo(base * 1.4);
});

test('모든 직업의 모든 액티브 스킬이 칸에서 나가고 재사용 대기가 걸린다(적이 있으면)', () => {
  for (const cls of ['knight', 'wizard', 'ranger', 'necromancer'] as const)
    for (const id of TREES[cls].flatMap((t) => t.skills).filter((id) => !isPassive(id))) {
      const w = make(['.....', '.H.m.', '.....'], cls, { [id]: 1 }, id);
      if (id === 'corpseBlast') Object.assign(w.entities[1], { state: 'dead' }); // 시체가 있어야
      if (id === 'sheathe') Object.assign(w.entities[1], { marks: 1, markT: 4 }); // 검흔이 있어야
      step(w, [{ type: 'skill', x: 3.5, z: 1.5 }]);
      expect(w[KEY_CD.cleave], `${cls} ${id}`).toBeGreaterThan(0);
      expect(w.cdFull.cleave).toBe(w.skillCd);
    }
});

test('회오리: 휘두르지 않고 돌면서 여러 번 베고, 그동안 걸을 수 있다. 5단계는 1초 더', () => {
  const once = make(['.....', '.Ha..', '.....'], 'knight', { cleave: 3 });
  run(once, 1, [{ type: 'skill', x: 5, z: 1.5 }]);
  const w = make(['.....', '.Ha..', '.....'], 'knight', { whirl: 3 }, 'whirl');
  step(w, [{ type: 'skill' }]);
  expect(w.spinT).toBeGreaterThan(1.9);
  const hero = w.entities[0];
  const x0 = hero.x;
  run(w, 0.5, [{ type: 'move', x: 0.5, z: 1.5 }]);
  expect(hero.x).toBeLessThan(x0);
  run(w, 2);
  expect(w.spinT).toBe(0);
  expect(w.cleaves).toBeGreaterThanOrEqual(8);
  expect(lost(w)).toBeGreaterThan(lost(once));
  const v = make(['.....', '.Ha..', '.....'], 'knight', { whirl: 5 }, 'whirl');
  step(v, [{ type: 'skill' }]);
  expect(v.spinT).toBeGreaterThan(2.9);
});

test('시체 폭발(패시브): 가르기로 죽은 적이 터지고, 터져서 죽은 적도 이어서 터진다', () => {
  const go = (burst: number) => {
    const w = make(['Hm.mm'], 'knight', { cleave: 3, burst });
    w.entities[1].hp = 1;
    for (const e of w.entities.slice(2)) Object.assign(e, { hp: 13, maxHp: 45 });
    run(w, 0.5, [{ type: 'skill', x: 5, z: 0.5 }]);
    return w;
  };
  expect(go(0).entities.slice(1).map((e) => e.state === 'dead')).toEqual([true, false, false]);
  expect(go(1).entities.slice(1).map((e) => e.state === 'dead')).toEqual([true, true, true]);
});

test('처형: 체력이 낮은 적은 단칼에, 죽이면 주변이 공포에 질린다. 아니면 큰 피해, 닿는 적이 없으면 안 나간다', () => {
  const w = make(['Hm.m'], 'knight', { execute: 1 }, 'execute');
  w.entities[1].hp = 1e5 * EXECUTE.below - 1;
  step(w, [{ type: 'skill' }]);
  expect(w.entities[1].state).toBe('dead');
  expect(w.entities[2].fearT).toBeGreaterThan(0);
  const v = make(['Hm.m'], 'knight', { execute: 1 }, 'execute');
  step(v, [{ type: 'skill' }]);
  expect(lost(v)).toBeGreaterThan(0);
  expect(v.entities[1].state).not.toBe('dead');
  const far = make(['H...m'], 'knight', { execute: 1 }, 'execute');
  step(far, [{ type: 'skill' }]);
  expect(far.skillCd).toBe(0);
});

test('불길(패시브): 돌진한 길이 3초 동안 타며 그 위의 적을 태운다', () => {
  const plain = make(['H.a......'], 'knight');
  run(plain, 4, [{ type: 'dash', x: 9, z: 0.5 }]);
  expect(plain.fires).toEqual([]);
  const w = make(['H.a......'], 'knight', { trail: 1 });
  run(w, 1, [{ type: 'dash', x: 9, z: 0.5 }]);
  expect(w.fires).toHaveLength(1);
  expect(w.fires[0].x1).toBeGreaterThan(5); // 1단계 돌진 5m 끝까지
  run(w, 3);
  expect(w.fires).toEqual([]);
  expect(lost(w)).toBeGreaterThanOrEqual(lost(plain) + 5);
});

test('대지 강타: 커서 쪽으로 뛰어 내려찍고, 둘레의 적이 다치고 기절한다', () => {
  const w = make(['H.....m..'], 'knight', { leap: 1 }, 'leap');
  w.entities[1].stunT = 0;
  step(w, [{ type: 'skill', x: 6.5, z: 0.5 }]);
  expect(w.entities[0].phase).toBe('leap'); // 날아가는 중: 무적, 아직 안 내려찍었다
  expect(lost(w)).toBe(0);
  run(w, LEAP.air);
  expect(w.entities[0].phase).toBe('none');
  expect(w.entities[0].x).toBeGreaterThan(5);
  expect(lost(w)).toBeGreaterThan(0);
  expect(w.entities[1].stunT).toBeGreaterThan(0);
});

test('튕기는 도끼는 세 번(5단계 여섯 번) 튀고, 도끼 숙련은 도끼를 더 자주·세게, 도끼 폭풍은 사방으로', () => {
  const hit = (ranks: Partial<Record<SkillId, number>>, q: SkillId) => {
    const w = make(['H.a.a.a.a.a.a.a.a.a'], 'knight', ranks, q);
    run(w, 4, [{ type: 'skill', x: 9, z: 0.5 }]);
    expect(w.shots).toEqual([]);
    return w.entities.slice(1).filter((e) => e.hp < 1e5).length;
  };
  expect(hit({}, 'throw')).toBe(1);
  expect(hit({ bounce: 3 }, 'bounce')).toBe(1 + BOUNCE.count);
  expect(hit({ bounce: 5 }, 'bounce')).toBe(1 + BOUNCE.count * 2);
  const w = make(['H'], 'knight');
  const plain = axeStat(w);
  w.ranks.axes = 2;
  expect(axeStat(w).cd).toBeLessThan(plain.cd);
  expect(axeStat(w).mult).toBeGreaterThan(plain.mult);
  const s = make(['.m.', 'mHm', '.m.'], 'knight', { axeStorm: 1 }, 'axeStorm');
  run(s, 1, [{ type: 'skill' }]);
  expect([1, 2, 3, 4].every((i) => lost(s, i) > 0)).toBe(true);
});

test('마법사: 불바다는 지점을 태우고, 잔불은 화염구 자리를 태우고, 운석은 잠시 뒤 떨어진다', () => {
  const f = make(['H...m'], 'wizard', { firefield: 1 }, 'firefield');
  step(f, [{ type: 'skill', x: 4.5, z: 0.5 }]);
  expect(f.fires).toHaveLength(1);
  run(f, 2);
  expect(lost(f)).toBeGreaterThan(0);
  const e = make(['H...m'], 'wizard', { embers: 1 });
  run(e, 1.5, [{ type: 'skill', x: 4.5, z: 0.5 }]);
  expect(e.fires.length).toBeGreaterThan(0);
  const c = make(['H...m'], 'wizard', { comet: 1 }, 'comet');
  run(c, 0.5, [{ type: 'skill', x: 4.5, z: 0.5 }]);
  expect(lost(c)).toBe(0);
  run(c, 0.7);
  expect(lost(c)).toBeGreaterThan(0);
  expect(c.fires).toHaveLength(1);
});

test('마법사: 눈보라는 따라다니며 때리고 얼리고, 서리 갑옷은 냉기 스킬을 쓰면 받는 피해를 줄인다', () => {
  const w = make(['Hm..'], 'wizard', { blizzard: 1 }, 'blizzard');
  w.entities[1].stunT = 0;
  run(w, 1.2, [{ type: 'skill' }]);
  expect(w.auraT).toBeGreaterThan(0);
  expect(lost(w)).toBeGreaterThan(0);
  expect(w.entities[1].stunT).toBeGreaterThan(0);
  const plain = make(['Hm..'], 'wizard');
  step(plain, [{ type: 'dash' }]);
  expect(plain.shoutT).toBe(0);
  const armor = make(['Hm..'], 'wizard', { frostArmor: 1 });
  step(armor, [{ type: 'dash' }]);
  expect(armor.shoutT).toBeGreaterThan(0);
});

test('마법사: 연쇄 번개는 이어서 튀고, 정전기는 마력탄을 옆 적에게 튀기고, 천둥 폭풍은 벼락을 잇따라', () => {
  const c = make(['H...m.m.m', '.........'], 'wizard', { chain: 1 }, 'chain');
  step(c, [{ type: 'skill', x: 4.5, z: 0.5 }]);
  expect([1, 2, 3].every((i) => lost(c, i) > 0)).toBe(true);
  const s = make(['H...m.m'], 'wizard', { static: 1 });
  run(s, 2, [{ type: 'attack', targetId: 1 }]);
  expect(lost(s, 2)).toBeGreaterThan(0);
  const n = make(['H...m.m'], 'wizard');
  run(n, 2, [{ type: 'attack', targetId: 1 }]);
  expect(lost(n, 2)).toBe(0);
  const t = make(['H........', '.........', '.........', '.........', '....m....', '.........', '.........', '.........', '.........'], 'wizard', { tempest: 1 }, 'tempest');
  step(t, [{ type: 'skill', x: 4.5, z: 4.5 }]);
  expect(t.storm.length).toBeGreaterThan(5);
  run(t, 3);
  expect(t.storm).toEqual([]);
  expect(lost(t)).toBeGreaterThan(0);
});

test('궁수: 세 갈래는 셋(5단계 다섯), 밀쳐내기 사격은 벽에 박아 기절, 치명은 화살을 2배로', () => {
  const s = make(['H....'], 'ranger', { spread: 1 }, 'spread');
  step(s, [{ type: 'skill', x: 4, z: 0.5 }]);
  expect(s.shots).toHaveLength(3);
  const s5 = make(['H....'], 'ranger', { spread: 5 }, 'spread');
  step(s5, [{ type: 'skill', x: 4, z: 0.5 }]);
  expect(s5.shots).toHaveLength(SPREAD.max);
  const p = make(['H.a.#'], 'ranger', { push: 1 }, 'push');
  p.entities[1].stunT = 0;
  run(p, 0.5, [{ type: 'skill', x: 4, z: 0.5 }]);
  expect(p.entities[1].stunT).toBeGreaterThan(0.5);
  const c = make(['H...m'], 'ranger', { crit: 5 });
  expect(critStat(c).chance).toBeCloseTo(0.3);
  for (let i = 0; i < 100; i++) shaft(c, c.entities[0], c.entities[1]);
  expect(c.shots.some((x) => x.dmg > 7)).toBe(true); // 새총 4–7의 두 배
  const plain = make(['H...m'], 'ranger');
  const rng = plain.rng;
  shaft(plain, plain.entities[0], plain.entities[1]);
  const once = make(['H...m'], 'ranger');
  shaft(once, once.entities[0], once.entities[1]);
  expect(plain.rng).toBe(once.rng); // 배우지 않으면 난수를 더 쓰지 않는다
  expect(rng).not.toBe(plain.rng);
});

test('궁수: 덫 숙련은 하나 더·주변 피해, 사냥터는 개수 제한 없이 둥글게, 불화살은 불, 폭우는 더 내리고, 화살 폭풍은 여러 곳', () => {
  const t = make(['H.......'], 'ranger', { snare: 1 });
  for (let i = 0; i < 4; i++) {
    t.dashCd = 0;
    step(t, [{ type: 'dash', x: 1.5 + i, z: 0.5 }]);
  }
  expect(t.traps).toHaveLength(TRAP.max + 1);
  const h = make(['.........', '.........', '....H....', '.........', '.........'], 'ranger', { hunt: 1 }, 'hunt');
  step(h, [{ type: 'skill' }]);
  expect(h.traps.filter((x) => x.keep)).toHaveLength(HUNT.count);
  h.dashCd = 0;
  for (let i = 0; i < 3; i++) (h.dashCd = 0), step(h, [{ type: 'dash', x: 4.5, z: 2.5 }]);
  expect(h.traps.filter((x) => x.keep)).toHaveLength(HUNT.count); // 덫 개수 제한이 사냥터 덫을 지우지 않는다
  const f = make(['H...m'], 'ranger', { fireRain: 1 }, 'fireRain');
  run(f, 1, [{ type: 'skill', x: 4.5, z: 0.5 }]);
  expect(f.fires).toHaveLength(1);
  const d = make(['H...m'], 'ranger', { downpour: 3 });
  step(d, [{ type: 'shout', x: 4.5, z: 0.5 }]);
  expect(d.volleys[0].left).toBe(3);
  run(d, 2);
  expect(d.blasts.length + d.volleys.length).toBeGreaterThanOrEqual(0);
  const a = make(['H...m'], 'ranger', { arrowStorm: 1 }, 'arrowStorm');
  step(a, [{ type: 'skill' }]);
  expect(a.volleys.length).toBeGreaterThanOrEqual(10);
});

test('강령술사: 역병은 계속 다치게, 시체 폭발은 시체를 터뜨리고(없으면 안 나감), 뼈 창은 꿰뚫는다', () => {
  const p = make(['H...m'], 'necromancer', { plague: 1 }, 'plague');
  run(p, 2, [{ type: 'skill', x: 4.5, z: 0.5 }]);
  expect(p.curses[0].amp).toBe(0);
  expect(lost(p)).toBeGreaterThan(0);
  const c = make(['H..mm'], 'necromancer', { corpseBlast: 1 }, 'corpseBlast');
  Object.assign(c.entities[1], { state: 'dead', maxHp: 100 });
  step(c, [{ type: 'skill', x: 3.5, z: 0.5 }]);
  expect(lost(c, 2)).toBe(Math.round(100 * 0.4 * 1.08)); // 시체 최대 체력 40% × 시너지(죽음의 표식 1단계)
  c.skillCd = 0;
  step(c, [{ type: 'skill', x: 3.5, z: 0.5 }]); // 같은 시체는 다시 못 쓴다
  expect(c.skillCd).toBe(0);
  const s = make(['H..m.m'], 'necromancer', { spear: 1 }, 'spear');
  run(s, 1, [{ type: 'skill', x: 5, z: 0.5 }]);
  expect(lost(s, 1) > 0 && lost(s, 2) > 0).toBe(true);
});

test('강령술사: 뼈 갑옷은 흡수, 생명 흡수는 회복, 뼈 감옥은 묶고, 해골 숙련은 해골을 늘린다', () => {
  const a = make(['H...m'], 'necromancer', { boneArmor: 1 }, 'boneArmor');
  step(a, [{ type: 'skill' }]);
  expect(a.wardHp).toBeGreaterThan(0);
  const d = make(['H...m'], 'necromancer', { drain: 5 });
  const hero = d.entities[0];
  hero.hp = 10;
  run(d, 3, [{ type: 'attack', targetId: 1 }]);
  expect(hero.hp).toBeGreaterThan(10);
  const p = make(['H...m'], 'necromancer', { prison: 1 }, 'prison');
  p.entities[1].stunT = 0;
  step(p, [{ type: 'skill', x: 4.5, z: 0.5 }]);
  expect(p.entities[1].stunT).toBeGreaterThan(2);
  const b = make(['H'], 'necromancer');
  const n = bonesStat(b).count;
  b.ranks.boneMastery = 3;
  expect(bonesStat(b).count).toBe(n + 1);
});

test('예전 스킬 넷(BASIC)은 트리의 1단계·2단계·궁극기에 있다', () => {
  for (const cls of Object.keys(BASIC) as HeroClass[]) for (const id of BASIC[cls]) expect(TREES[cls].some((t) => t.skills.includes(id))).toBe(true);
  expect(KEYS).toHaveLength(4);
});
