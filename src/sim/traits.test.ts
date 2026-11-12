import { expect, test } from 'vitest';
import { BOUNCE, createWorld, DT, FEAR, PULL, SKEWER, step, TRAIT, type Command, type SkillName, type World } from './world';

const run = (w: World, sec: number, cmds: Command[] = []) => {
  step(w, cmds);
  for (let i = Math.round(sec / DT) - 1; i > 0; i--) step(w, []);
};
// 스킬 3단계 + 특성 하나. 적은 모두 체력이 크고 기절해 제자리에 서 있다(같은 시드라 굴림도 같다)
const make = (map: string[], skill: SkillName, pick: number, rank = 3) => {
  const w = createWorld(1, map);
  w.ranks[skill] = rank;
  w.traits[skill] = pick;
  w.gear.weapon = 1; // 단검 4–7
  for (const e of w.entities.slice(1)) Object.assign(e, { hp: 1e5, maxHp: 1e5, stunT: 1e9 });
  return w;
};
const lost = (w: World, i = 1) => 1e5 - w.entities[i].hp;

test('특성 고르기: 3단계부터, 처음은 공짜, 바꿀 때는 금화', () => {
  const w = createWorld(1, ['H....']);
  const pick = (n: number): Command => ({ type: 'trait', skill: 'cleave', pick: n });
  w.ranks.cleave = TRAIT.rank - 1;
  step(w, [pick(1)]);
  expect(w.traits.cleave).toBe(0); // 단계가 모자람
  w.ranks.cleave = TRAIT.rank;
  step(w, [pick(3), pick(0), pick(1.5)]);
  expect(w.traits.cleave).toBe(0); // 없는 특성
  step(w, [pick(1)]);
  expect(w.traits.cleave).toBe(1);
  step(w, [pick(2)]);
  expect(w.traits.cleave).toBe(1); // 금화가 없으면 못 바꾼다
  w.gold = TRAIT.respec + 5;
  step(w, [pick(1)]);
  expect(w.gold).toBe(TRAIT.respec + 5); // 같은 특성은 값을 받지 않는다
  step(w, [pick(2)]);
  expect(w.traits.cleave).toBe(2);
  expect(w.gold).toBe(5);
  expect(w.traits).toEqual({ cleave: 2, dash: 0, shout: 0, throw: 0 });
});

test('회오리: 휘두르지 않고 돌면서 여러 번 베고, 그동안 걸을 수 있다', () => {
  const once = make(['.....', '.Ha..', '.....'], 'cleave', 0);
  run(once, 1, [{ type: 'skill', x: 5, z: 1.5 }]);
  const w = make(['.....', '.Ha..', '.....'], 'cleave', 1);
  step(w, [{ type: 'skill' }]);
  expect(w.spinT).toBeGreaterThan(1.9);
  expect(w.skillCd).toBeGreaterThan(0);
  const hero = w.entities[0];
  const x0 = hero.x;
  run(w, 0.5, [{ type: 'move', x: 0.5, z: 1.5 }]);
  expect(hero.x).toBeLessThan(x0); // 도는 중에 걸었다
  expect(w.spinT).toBeGreaterThan(0);
  run(w, 2);
  expect(w.spinT).toBe(0);
  expect(w.cleaves).toBeGreaterThanOrEqual(8); // 0.25초마다
  expect(lost(w)).toBeGreaterThan(lost(once)); // 붙어 있으면 한 번 휘두르는 것보다 세다
});

test('회오리 중에는 평타를 치지 않고, 5단계는 1초 더 돈다', () => {
  const w = make(['.....', '.Ha..', '.....'], 'cleave', 1, 5);
  step(w, [{ type: 'attack', targetId: 1 }, { type: 'skill' }]);
  expect(w.spinT).toBeGreaterThan(2.9);
  for (let i = 0; i < 60; i++) {
    step(w, []);
    expect(w.entities[0].state).not.toBe('attack');
  }
  run(w, 2.5);
  expect(w.entities[0].state).toBe('attack'); // 끝나면 평타로 돌아온다
});

test('시체 폭발: 가르기로 죽은 적이 터지고, 터져서 죽은 적도 이어서 터진다', () => {
  // 졸개 셋: 첫째만 가르기 범위 안. 둘째는 첫째 시체 옆, 셋째는 둘째 옆(첫째에게서는 멀다)
  const go = (pick: number) => {
    const w = make(['Hm.mm'], 'cleave', pick);
    w.entities[1].hp = 1;
    for (const e of w.entities.slice(2)) Object.assign(e, { hp: 15, maxHp: 45 });
    run(w, 0.5, [{ type: 'skill', x: 5, z: 0.5 }]);
    return w;
  };
  expect(go(0).entities.slice(1).map((e) => e.state === 'dead')).toEqual([true, false, false]);
  const w = go(2);
  expect(w.entities.slice(1).map((e) => e.state === 'dead')).toEqual([true, true, true]);
  expect(w.blasts).toHaveLength(3);
});

test('꼬치: 맞은 적을 끌고 가 벽에 박는다(기절 + 추가 피해). 벽이 없으면 끌고만 간다', () => {
  // 단검 4–7 × 돌진 3단계 1.4 = 한 번에 6–10. 기절하지 않은 적이라 처음 맞을 때는 배율이 없다
  const plain = make(['H.a..#'], 'dash', 0);
  plain.entities[1].stunT = 0;
  run(plain, 0.6, [{ type: 'dash', x: 5, z: 0.5 }]);
  expect(plain.entities[1].x).toBeLessThan(3.5);
  expect(lost(plain)).toBeLessThanOrEqual(10);
  const w = make(['H.a..#'], 'dash', 1);
  w.entities[1].stunT = 0;
  w.entities[1].target = null;
  run(w, 0.6, [{ type: 'dash', x: 5, z: 0.5 }]);
  expect(w.entities[1].x).toBeGreaterThan(4); // 벽 앞까지 끌려갔다
  expect(w.entities[1].stunT).toBeGreaterThan(SKEWER.stun - 0.7);
  expect(lost(w)).toBeGreaterThanOrEqual(6 + 9); // 한 번 더 맞고, 기절해서 약점 배율(×1.5)까지
  expect(w.blasts.some((b) => b.kind === 'slam')).toBe(true);

  const base = make(['H.a...........'], 'dash', 0);
  run(base, 1, [{ type: 'dash', x: 9, z: 0.5 }]);
  const open = make(['H.a...........'], 'dash', 1);
  run(open, 1, [{ type: 'dash', x: 9, z: 0.5 }]);
  expect(open.entities[1].x).toBeGreaterThan(5); // 6m 돌진의 끝까지
  expect(open.blasts).toEqual([]);
  expect(lost(open)).toBe(lost(base)); // 추가 피해는 벽에 박을 때만
});

test('불길: 돌진한 길이 3초 동안 타며 그 위의 적을 태운다', () => {
  const plain = make(['H.a......'], 'dash', 0);
  run(plain, 4, [{ type: 'dash', x: 9, z: 0.5 }]);
  expect(plain.fires).toEqual([]);
  const w = make(['H.a......'], 'dash', 2);
  run(w, 1, [{ type: 'dash', x: 9, z: 0.5 }]);
  expect(w.fires).toHaveLength(1);
  expect(w.fires[0].x0).toBe(0.5);
  expect(w.fires[0].x1).toBeGreaterThan(6); // 돌진 끝까지 늘어났다
  const early = lost(w);
  run(w, 3);
  expect(w.fires).toEqual([]);
  expect(early).toBeGreaterThan(lost(plain));
  expect(lost(w)).toBeGreaterThanOrEqual(lost(plain) + 5); // 0.5초마다 최소 1씩 여섯 번쯤
  // 길 밖의 적은 타지 않는다
  const far = make(['H........', '.........', '.........', '..a......'], 'dash', 2);
  run(far, 4, [{ type: 'dash', x: 9, z: 0.5 }]);
  expect(lost(far)).toBe(0);
});

test('끌어당김: 함성이 적을 밀어내는 대신 발밑으로 모은다(기절은 그대로)', () => {
  const w = make(['.......', 'H..a...', '.......'], 'shout', 1);
  w.entities[1].stunT = 0;
  step(w, [{ type: 'shout' }]);
  const [hero, a] = w.entities;
  expect(Math.hypot(a.x - hero.x, a.z - hero.z)).toBeCloseTo(PULL.to, 1);
  expect(a.stunT).toBeGreaterThan(0);
  const plain = make(['.......', 'H..a...', '.......'], 'shout', 0);
  step(plain, [{ type: 'shout' }]);
  expect(plain.entities[1].x).toBeGreaterThan(3.5);
});

test('공포: 기절 대신 도망치고 공격하지 않는다. 도망치는 적은 스킬 피해 2배', () => {
  const w = make(['.........', 'Ha.......', '.........'], 'shout', 2);
  const [hero, a] = w.entities;
  Object.assign(a, { stunT: 0, target: 0 });
  step(w, [{ type: 'shout' }]);
  expect(a.fearT).toBeCloseTo(FEAR.time, 1);
  expect(a.stunT).toBe(0);
  const hp = hero.hp;
  run(w, 1.5);
  expect(a.x).toBeGreaterThan(3); // 반대쪽으로 달아났다
  expect(w.shots).toEqual([]); // 궁수가 쏘지 않았다
  expect(hero.hp).toBe(hp);
  const before = a.hp;
  run(w, 0.8, [{ type: 'throw' }]);
  expect(w.combos.some((c) => c.kind === 'back') || before - a.hp > 0).toBe(true);
  const calm = make(['.........', 'H...a....', '.........'], 'throw', 0);
  calm.entities[1].stunT = 0;
  Object.assign(calm.entities[1], { target: null });
  const scared = make(['.........', 'H...a....', '.........'], 'throw', 0);
  Object.assign(scared.entities[1], { stunT: 0, fearT: 5 });
  run(calm, 0.6, [{ type: 'throw', x: 9, z: 1.5 }]);
  run(scared, 1, [{ type: 'throw', x: 9, z: 1.5 }]);
  expect(lost(scared)).toBe(lost(calm) * 2);
  run(w, FEAR.time);
  expect(a.fearT).toBe(0);
});

test('공포: 해골 왕은 겁먹지 않고 기절한다', () => {
  const w = make(['.....', 'HK...', '.....'], 'shout', 2);
  w.entities[1].stunT = 0;
  step(w, [{ type: 'shout' }]);
  expect(w.entities[1].fearT).toBe(0);
  expect(w.entities[1].stunT).toBeGreaterThan(0);
});

test('튕기는 도끼: 맞으면 안 맞은 가까운 적으로 세 번 더, 5단계는 여섯 번', () => {
  const hit = (pick: number, rank: number) => {
    const w = make(['H.a.a.a.a.a.a.a.a.a'], 'throw', pick, rank);
    run(w, 4, [{ type: 'throw', x: 9, z: 0.5 }]);
    expect(w.shots).toEqual([]);
    return w.entities.slice(1).filter((e) => e.hp < 1e5).length;
  };
  expect(hit(0, 3)).toBe(1);
  expect(hit(1, 3)).toBe(1 + BOUNCE.count);
  expect(hit(1, 5)).toBe(1 + BOUNCE.count * 2);
});

test('박힌 도끼: 적에게 박혀 따라다니고, 다시 던지면 그 앞으로 순간이동해 터뜨린다', () => {
  const w = make(['H....aa...', '..........'], 'throw', 2);
  const [hero, a, b] = w.entities;
  run(w, 1, [{ type: 'throw', x: 9, z: 0.5 }]);
  expect(w.shots).toHaveLength(1);
  expect(w.shots[0].stuck).toBe(1);
  const first = lost(w);
  expect(lost(w, 2)).toBe(0);
  expect(w.throwCd).toBeGreaterThan(0);
  a.x = 5.2; // 박힌 도끼는 적을 따라간다
  step(w, []);
  expect(w.shots[0].x).toBe(5.2);
  step(w, [{ type: 'throw' }]); // 재사용 대기 중이어도 뽑는다
  expect(w.shots).toEqual([]);
  expect(Math.hypot(hero.x - a.x, hero.z - a.z)).toBeLessThan(1.3);
  expect(hero.target).toBe(1);
  expect(lost(w)).toBeGreaterThan(first);
  expect(lost(w, 2)).toBeGreaterThan(0); // 옆의 적도 폭발에 맞는다
  expect(b.x).toBeGreaterThan(6.5); // 밀려났다
  expect(w.blasts.some((x) => x.kind === 'fire')).toBe(true);
});

test('박힌 도끼: 박힌 적이 죽으면 사라지고, 특성을 바꿔도 사라진다', () => {
  const w = make(['H....a....'], 'throw', 2);
  run(w, 1, [{ type: 'throw', x: 9, z: 0.5 }]);
  expect(w.shots).toHaveLength(1);
  w.entities[1].state = 'dead';
  step(w, []);
  expect(w.shots).toEqual([]);

  const v = make(['H....a....'], 'throw', 2);
  run(v, 1, [{ type: 'throw', x: 9, z: 0.5 }]);
  v.gold = TRAIT.respec;
  step(v, [{ type: 'trait', skill: 'throw', pick: 1 }]);
  expect(v.shots).toEqual([]);
});

test('특성을 고르지 않으면 난수열과 결과가 예전과 같다(불길·회오리 상태가 생기지 않는다)', () => {
  const w = make(['H.a.a....'], 'dash', 0);
  run(w, 2, [{ type: 'dash', x: 9, z: 0.5 }, { type: 'shout' }]);
  expect(w.fires).toEqual([]);
  expect(w.spinT).toBe(0);
  expect(w.entities.every((e) => e.fearT === 0)).toBe(true);
});
