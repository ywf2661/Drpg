// 거인의 칼(검술 궁극기): 몇 초 동안 칼이 커져 평타·가르기·내리베기가 넓고 세지는 대신 느려진다
import { expect, test } from 'vitest';
import { attackInterval, cleaveStat, createWorld, downcutStat, DT, GREATSWORD, step, useClass, type Command, type SkillId, type World } from './world';

const run = (w: World, sec: number, cmds: Command[] = []) => {
  step(w, cmds);
  for (let i = Math.round(sec / DT) - 1; i > 0; i--) step(w, []);
};
// 기사, 거인의 칼 r단계를 Q에. 적은 체력이 크고 기절해 제자리에 서 있다
const make = (map: string[], r = 1, more: Partial<Record<SkillId, number>> = {}) => {
  const w = createWorld(1, map);
  useClass(w, 'knight');
  Object.assign(w.ranks, { greatsword: r }, more);
  w.keys.cleave = 'greatsword';
  w.gear.weapon = 1;
  for (const e of w.entities.slice(1)) Object.assign(e, { hp: 1e5, maxHp: 1e5, stunT: 1e9 });
  return w;
};
// (x, z)에 처음 서 있던 적이 잃은 체력(밀려나도 같은 적)
const at = (w: World, x: number, z: number) => w.entities.find((e) => e.x === x && e.z === z && e.kind !== 'hero')!;
const lost = (e: { hp: number }) => 1e5 - e.hp;

test('거인의 칼: 쓰면 time초 동안 켜지고 cd초 재사용 대기', () => {
  const w = make(['H....']);
  step(w, [{ type: 'skill' }]);
  expect(w.bigT).toBeCloseTo(GREATSWORD.time, 1);
  expect(w.skillCd).toBeCloseTo(GREATSWORD.cd);
});

test('거인의 칼: 평타가 앞쪽 반원의 적을 모두 벤다, 뒤쪽은 안 맞는다', () => {
  const hit = (big: boolean) => {
    const w = make(['m.Hm.', '...m.']);
    if (big) step(w, [{ type: 'skill' }]);
    const [target, side, back] = [at(w, 3.5, 0.5), at(w, 3.5, 1.5), at(w, 0.5, 0.5)];
    run(w, 1.5, [{ type: 'attack', targetId: target.id }]);
    return [lost(target), lost(side), lost(back)];
  };
  const [t0, side0, back0] = hit(false);
  expect(t0).toBeGreaterThan(0);
  expect([side0, back0]).toEqual([0, 0]);
  const [t1, side1, back1] = hit(true);
  expect(t1).toBeGreaterThan(0);
  expect(side1).toBeGreaterThan(0);
  expect(back1).toBe(0);
});

test('거인의 칼: 평타 간격이 1.4배', () => {
  const w = make(['H....']);
  const base = attackInterval(w, w.entities[0]);
  w.bigT = 1;
  expect(attackInterval(w, w.entities[0]) / base).toBeCloseTo(GREATSWORD.slow);
});

test('거인의 칼: 가르기 범위·피해가 커진다(사슬 도끼를 배워도 같다)', () => {
  for (const chainAxe of [0, 1]) {
    const w = make(['H....'], 1, { cleave: 1, chainAxe });
    const base = cleaveStat(w);
    w.bigT = 1;
    expect(cleaveStat(w).radius / base.radius).toBeCloseTo(GREATSWORD.radius);
    expect(cleaveStat(w).mult / base.mult).toBeCloseTo(GREATSWORD.dmg);
  }
});

test('거인의 칼: 내리베기 길이·피해 ×1.5', () => {
  const w = make(['H....'], 1, { downcut: 1 });
  const base = downcutStat(w, 1);
  w.bigT = 1;
  expect(downcutStat(w, 1).len / base.len).toBeCloseTo(GREATSWORD.len);
  expect(downcutStat(w, 1).mult / base.mult).toBeCloseTo(GREATSWORD.dmg);
});

test('거인의 칼: 가르기에 맞은 보스는 밀리지 않고 휘청인다', () => {
  const w = make(['H.M....'], 1, { cleave: 1 });
  w.keys.dash = 'cleave';
  const boss = w.entities.find((e) => e.kind === 'boss')!;
  const x0 = boss.x;
  w.bigT = 3;
  run(w, 0.5, [{ type: 'dash', x: boss.x, z: boss.z }]);
  expect(lost(boss)).toBeGreaterThan(0);
  expect(w.reeled[boss.id]).toBeGreaterThan(0); // 휘청였다(기절은 테스트가 걸어 둔 것과 겹친다)
  expect(boss.x).toBeCloseTo(x0, 5);
});

test('거인의 칼 5단계: 끝날 때 한 바퀴 크게 벤다, 4단계는 안 벤다', () => {
  const end = (r: number) => {
    const w = make(['m..H'], r);
    const e = at(w, 0.5, 0.5);
    w.bigT = 0.05;
    run(w, 0.2);
    return lost(e);
  };
  expect(end(5)).toBeGreaterThan(0);
  expect(end(4)).toBe(0);
});
