// 테스트용 봇: sim만으로 1~5층을 끝까지 플레이한다(밸런스 회귀 테스트·조정용).
import { FLOORS, floorPower, generateFloor } from './dungeon';
import { buy, deathGold, sell } from '../shop';
import { createWorld, DT, isBetter, outcome, RANGE, setLevel, step, TELL, winding, type Affix, type BagItem, type Command, type Gear, type SkillName, type World } from './world';

type Carry = { potions: number; gear: Gear; mods: { weapon: Affix[]; armor: Affix[] }; level: number; xp: number; gold: number; ranks: Record<SkillName, number>; points: number; bag: BagItem[] };
const START: Carry = { potions: 2, gear: { weapon: 2, armor: 2 }, mods: { weapon: [], armor: [] }, level: 1, xp: 0, gold: 0, ranks: { cleave: 1, dash: 1, shout: 1, throw: 1 }, points: 0, bag: [] };
const THINK = Math.round(0.25 / DT); // 봇은 0.25초마다 판단

function makeFloor(seed: number, n: number, c: Carry): World {
  const w = createWorld(seed, generateFloor(seed, n), floorPower(n));
  w.potions = c.potions;
  w.gear = { ...c.gear };
  w.mods = { weapon: [...c.mods.weapon], armor: [...c.mods.armor] };
  w.gold = c.gold;
  w.ranks = { ...c.ranks };
  w.points = c.points;
  w.bag = [...c.bag];
  w.maxTier = Math.min(4, n + 1);
  setLevel(w, c.level, c.xp);
  return w;
}

// 간단한 플레이어: 체력이 낮으면 물약, 가까운 적부터 공격, 스킬은 뻔한 상황에만(무리면 가르기, 둘러싸이거나 보스 예고면 함성,
// 멀리서 쏘는 적에겐 도끼·돌진), 좋은 아이템 줍기, 다 잡으면 계단. dodge면 바닥의 예고 구역은 걸어 나가고 평타·화살·화염구는 굴러서 피한다
function think(w: World, skills: boolean, dodge: boolean): Command[] {
  const hero = w.entities[0];
  const cmds: Command[] = [];
  if (hero.hp < hero.maxHp * 0.6 && w.potions > 0) cmds.push({ type: 'drink' }); // 서서히 차므로 미리 마신다
  const d = (x: number, z: number) => Math.hypot(x - hero.x, z - hero.z);
  // 닫힌 사슬 문이 있으면 걸어서 갈 수 있는 곳만 상대한다(문 뒤의 적·아이템은 문을 연 뒤에)
  const closed = w.gates.filter((g) => !g.open);
  const seen = closed.length ? reachable(w, hero.x, hero.z) : null;
  const ok = (x: number, z: number) => !seen || seen[Math.floor(z) * w.grid.w + Math.floor(x)] === 1;
  const foes = w.entities.filter((e) => e.kind !== 'hero' && e.state !== 'dead' && ok(e.x, e.z)).sort((a, b) => d(a.x, a.z) - d(b.x, b.z));
  const near = (r: number) => foes.filter((e) => d(e.x, e.z) < r).length;
  if (skills && w.points > 0) {
    // 포인트는 가장 낮은 단계부터(같으면 가르기 → 도끼 → 함성 → 돌진)
    const order: SkillName[] = ['cleave', 'throw', 'shout', 'dash'];
    cmds.push({ type: 'learn', skill: order.reduce((a, b) => (w.ranks[b] < w.ranks[a] ? b : a)) });
  }
  // 예고된 위험 구역 안이면 다른 일은 접고 바깥으로 걸어 나간다
  const zone = dodge && w.zones.find((z) => d(z.x, z.z) < z.r + 0.3);
  if (zone) {
    const k = d(zone.x, zone.z) || 1;
    return [...cmds, { type: 'move', x: zone.x + ((hero.x - zone.x) / k) * (zone.r + 1.2), z: zone.z + ((hero.z - zone.z) / k) * (zone.r + 1.2) }];
  }
  // 평타를 준비 중인 적이 닿을 거리거나 화살·화염구가 코앞이면 구른다(적 반대쪽, 구르는 동안 무적)
  const swings = foes.filter((e) => e.state === 'attack' && winding(e) && d(e.x, e.z) < RANGE + 0.3);
  if (dodge && swings.length && hero.phase === 'none') {
    // 받아치기가 되면 가르기로 끊고(밀려나며 준비가 끊긴다), 아니면 맞기 직전에 구른다
    if (skills && w.skillCd <= 0) return [...cmds, { type: 'skill', x: swings[0].x, z: swings[0].z }];
    if (w.rollCd <= 0 && swings.some((e) => e.attackT >= TELL[e.kind]! - 0.3)) return [...cmds, { type: 'roll' }];
  }
  if (dodge && w.rollCd <= 0 && hero.phase === 'none' && w.shots.some((s) => s.kind !== 'axe' && d(s.x, s.z) < 2.5)) return [...cmds, { type: 'roll' }];
  if (near(2) >= 2) cmds.push({ type: 'skill' });
  if (skills) {
    const big = foes.find((e) => (e.kind === 'boss' || e.kind === 'king') && d(e.x, e.z) < 7);
    if (w.shoutCd <= 0 && (near(3) >= 2 || big?.phase === 'windup')) cmds.push({ type: 'shout' });
    const shooter = foes.find((e) => (e.kind === 'archer' || e.kind === 'mage') && d(e.x, e.z) > 2.5 && d(e.x, e.z) < 8);
    if (shooter && w.throwCd <= 0) cmds.push({ type: 'throw', x: shooter.x, z: shooter.z });
    else if (shooter && w.dashCd <= 0 && d(shooter.x, shooter.z) > 3.5) cmds.push({ type: 'dash', x: shooter.x, z: shooter.z });
  }
  const wanted = w.items.find((i) => ok(i.x, i.z) && (i.kind === 'gold' ? true : i.kind === 'potion' ? w.potions < 8 : isBetter(w, i)));
  if (foes.length && (d(foes[0].x, foes[0].z) < 9 || !wanted)) {
    if (hero.target !== foes[0].id) cmds.push({ type: 'attack', targetId: foes[0].id });
  } else if (wanted) cmds.push({ type: 'move', x: wanted.x, z: wanted.z });
  else if (closed.length && !ok(w.stairs ? w.stairs[0] : -1, w.stairs ? w.stairs[1] : -1)) {
    // 갈 곳이 문으로 막혔다(계단, 또는 문 뒤의 보스·적): 닿을 수 있는 가장 가까운 문 앞으로 가서 도끼로 연다
    const doors = closed
      .map((g) => ({ g, side: ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).map(([dx, dz]) => [g.x + dx, g.z + dz] as const).find(([x, z]) => ok(x, z)) }))
      .filter((o) => o.side)
      .sort((a, b) => d(a.g.x + 0.5, a.g.z + 0.5) - d(b.g.x + 0.5, b.g.z + 0.5));
    const door = doors[0];
    if (door && d(door.g.x + 0.5, door.g.z + 0.5) < 2 && w.throwCd <= 0) cmds.push({ type: 'throw', x: door.g.x + 0.5, z: door.g.z + 0.5 });
    else if (door) cmds.push({ type: 'move', x: door.side![0] + 0.5, z: door.side![1] + 0.5 });
  } else if (w.stairs) cmds.push({ type: 'move', x: w.stairs[0] + 0.5, z: w.stairs[1] + 0.5 });
  return cmds;
}

// 주인공이 걸어서 갈 수 있는 칸(1). 길찾기는 벽 모서리를 대각선으로 못 지나므로 4방향으로 이어진 칸과 같다
function reachable(w: World, x: number, z: number): Uint8Array {
  const { w: gw, h, blocked } = w.grid;
  const seen = new Uint8Array(gw * h);
  const q = [Math.floor(z) * gw + Math.floor(x)];
  seen[q[0]] = 1;
  for (let i = 0; i < q.length; i++) {
    const [cx, cz] = [q[i] % gw, Math.floor(q[i] / gw)];
    for (const [nx, nz] of [[cx + 1, cz], [cx - 1, cz], [cx, cz + 1], [cx, cz - 1]]) {
      const n = nz * gw + nx;
      if (nx < 0 || nz < 0 || nx >= gw || nz >= h || blocked[n] || seen[n]) continue;
      seen[n] = 1;
      q.push(n);
    }
  }
  return seen;
}

// 상점: 보관함을 다 팔고(봇은 자동 장착만 쓴다), 물약을 5개까지 채우고, 남으면 무기·갑옷 강화, 그래도 남으면 물약
function shopping(c: Carry): Carry {
  while (c.bag.length) c = sell(c, 0);
  while (c.potions < 5 && buy(c, 'potion') !== c) c = buy(c, 'potion');
  for (const item of ['weapon', 'armor', 'potion', 'potion', 'potion'] as const) c = buy(c, item);
  return c;
}

// 한 판: 층마다 최대 3번 다시 시도(사망 시 그 층 진입 상태로). 결과: 깼는지, 총 사망 수, 최종 레벨
export function playthrough(seed: number, skills = true, dodge = true) {
  let carry = START;
  let deaths = 0;
  for (let n = 1; n <= FLOORS; n++) {
    let done = false;
    for (let attempt = 0; attempt < 4 && !done; attempt++) {
      const w = makeFloor(seed * 100 + n * 10 + attempt, n, carry);
      for (let t = 0; t < 600 / DT; t++) {
        step(w, t % THINK === 0 ? think(w, skills, dodge) : []);
        const o = outcome(w);
        if (o === 'dead') break;
        if (o === 'descend' || o === 'clear') {
          carry = shopping({ potions: w.potions, gear: { ...w.gear }, mods: w.mods, level: w.level, xp: w.xp, gold: w.gold, ranks: { ...w.ranks }, points: w.points, bag: w.bag });
          done = true;
          break;
        }
      }
      if (!done) {
        deaths++;
        carry = { ...carry, gold: deathGold(carry.gold) };
      }
    }
    if (!done) return { cleared: false, deaths, level: carry.level, floor: n };
  }
  return { cleared: true, deaths, level: carry.level, floor: FLOORS };
}
