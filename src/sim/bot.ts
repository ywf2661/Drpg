// 테스트용 봇: sim만으로 1~5층을 끝까지 플레이한다(밸런스 회귀 테스트·조정용).
import { FLOORS, floorPower, generateFloor } from './dungeon';
import { buy } from '../shop';
import { createWorld, DT, isBetter, outcome, setLevel, step, type Affix, type Command, type Gear, type SkillName, type World } from './world';

type Carry = { potions: number; gear: Gear; mods: { weapon: Affix[]; armor: Affix[] }; level: number; xp: number; gold: number; ranks: Record<SkillName, number>; points: number };
const START: Carry = { potions: 2, gear: { weapon: 2, armor: 2 }, mods: { weapon: [], armor: [] }, level: 1, xp: 0, gold: 0, ranks: { cleave: 1, dash: 1, shout: 1, throw: 1 }, points: 0 };
const THINK = Math.round(0.25 / DT); // 봇은 0.25초마다 판단

function makeFloor(seed: number, n: number, c: Carry): World {
  const w = createWorld(seed, generateFloor(seed, n), floorPower(n));
  w.potions = c.potions;
  w.gear = { ...c.gear };
  w.mods = { weapon: [...c.mods.weapon], armor: [...c.mods.armor] };
  w.gold = c.gold;
  w.ranks = { ...c.ranks };
  w.points = c.points;
  w.maxTier = Math.min(4, n + 1);
  setLevel(w, c.level, c.xp);
  return w;
}

// 간단한 플레이어: 체력이 낮으면 물약, 가까운 적부터 공격, 스킬은 뻔한 상황에만(무리면 가르기, 둘러싸이거나 보스 예고면 함성,
// 멀리서 쏘는 적에겐 도끼·돌진), 좋은 아이템 줍기, 다 잡으면 계단. 피하기는 하지 않는다
function think(w: World, skills: boolean): Command[] {
  const hero = w.entities[0];
  const cmds: Command[] = [];
  if (hero.hp < hero.maxHp * 0.45 && w.potions > 0) cmds.push({ type: 'drink' });
  const d = (x: number, z: number) => Math.hypot(x - hero.x, z - hero.z);
  const foes = w.entities.filter((e) => e.kind !== 'hero' && e.state !== 'dead').sort((a, b) => d(a.x, a.z) - d(b.x, b.z));
  const near = (r: number) => foes.filter((e) => d(e.x, e.z) < r).length;
  if (skills && w.points > 0) {
    // 포인트는 가장 낮은 단계부터(같으면 가르기 → 도끼 → 함성 → 돌진)
    const order: SkillName[] = ['cleave', 'throw', 'shout', 'dash'];
    cmds.push({ type: 'learn', skill: order.reduce((a, b) => (w.ranks[b] < w.ranks[a] ? b : a)) });
  }
  if (near(2) >= 2) cmds.push({ type: 'skill' });
  if (skills) {
    const big = foes.find((e) => (e.kind === 'boss' || e.kind === 'king') && d(e.x, e.z) < 7);
    if (w.shoutCd <= 0 && (near(4) >= 3 || big?.phase === 'windup')) cmds.push({ type: 'shout' });
    const shooter = foes.find((e) => (e.kind === 'archer' || e.kind === 'mage') && d(e.x, e.z) > 2.5 && d(e.x, e.z) < 8);
    if (shooter && w.throwCd <= 0) cmds.push({ type: 'throw', x: shooter.x, z: shooter.z });
    else if (shooter && w.dashCd <= 0 && d(shooter.x, shooter.z) > 3.5) cmds.push({ type: 'dash', x: shooter.x, z: shooter.z });
  }
  const wanted = w.items.find((i) => (i.kind === 'gold' ? true : i.kind === 'potion' ? w.potions < 8 : isBetter(w, i)));
  if (foes.length && (d(foes[0].x, foes[0].z) < 9 || !wanted)) {
    if (hero.target !== foes[0].id) cmds.push({ type: 'attack', targetId: foes[0].id });
  } else if (wanted) cmds.push({ type: 'move', x: wanted.x, z: wanted.z });
  else if (w.stairs) cmds.push({ type: 'move', x: w.stairs[0] + 0.5, z: w.stairs[1] + 0.5 });
  return cmds;
}

// 상점: 물약을 5개까지 채우고, 남으면 무기·갑옷 강화, 그래도 남으면 물약
function shopping(c: Carry): Carry {
  while (c.potions < 5 && buy(c, 'potion') !== c) c = buy(c, 'potion');
  for (const item of ['weapon', 'armor', 'potion', 'potion', 'potion'] as const) c = buy(c, item);
  return c;
}

// 한 판: 층마다 최대 3번 다시 시도(사망 시 그 층 진입 상태로). 결과: 깼는지, 총 사망 수, 최종 레벨
export function playthrough(seed: number, skills = true) {
  let carry = START;
  let deaths = 0;
  for (let n = 1; n <= FLOORS; n++) {
    let done = false;
    for (let attempt = 0; attempt < 4 && !done; attempt++) {
      const w = makeFloor(seed * 100 + n * 10 + attempt, n, carry);
      for (let t = 0; t < 600 / DT; t++) {
        step(w, t % THINK === 0 ? think(w, skills) : []);
        const o = outcome(w);
        if (o === 'dead') break;
        if (o === 'descend' || o === 'clear') {
          carry = shopping({ potions: w.potions, gear: { ...w.gear }, mods: w.mods, level: w.level, xp: w.xp, gold: w.gold, ranks: { ...w.ranks }, points: w.points });
          done = true;
          break;
        }
      }
      if (!done) deaths++;
    }
    if (!done) return { cleared: false, deaths, level: carry.level, floor: n };
  }
  return { cleared: true, deaths, level: carry.level, floor: FLOORS };
}
