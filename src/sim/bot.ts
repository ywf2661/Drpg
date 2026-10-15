// 테스트용 봇: sim만으로 1~5층을 끝까지 플레이한다(밸런스 회귀 테스트·조정용).
import { FLOORS, floorPower, generateFloor } from './dungeon';
import { createWorld, DT, outcome, setLevel, step, type Command, type Gear, type World } from './world';

type Carry = { potions: number; gear: Gear; level: number; xp: number };
const START: Carry = { potions: 2, gear: { weapon: 2, armor: 2 }, level: 1, xp: 0 };
const THINK = Math.round(0.25 / DT); // 봇은 0.25초마다 판단

function makeFloor(seed: number, n: number, c: Carry): World {
  const w = createWorld(seed, generateFloor(seed, n), floorPower(n));
  w.potions = c.potions;
  w.gear = { ...c.gear };
  w.maxTier = Math.min(4, n + 1);
  setLevel(w, c.level, c.xp);
  return w;
}

// 간단한 플레이어: 체력이 낮으면 물약, 가까운 적부터 공격(무리면 가르기), 좋은 아이템 줍기, 다 잡으면 계단
function think(w: World): Command[] {
  const hero = w.entities[0];
  const cmds: Command[] = [];
  if (hero.hp < hero.maxHp * 0.45 && w.potions > 0) cmds.push({ type: 'drink' });
  const d = (x: number, z: number) => Math.hypot(x - hero.x, z - hero.z);
  const foes = w.entities.filter((e) => e.kind !== 'hero' && e.state !== 'dead').sort((a, b) => d(a.x, a.z) - d(b.x, b.z));
  if (foes.filter((e) => d(e.x, e.z) < 2).length >= 2) cmds.push({ type: 'skill' });
  const wanted = w.items.find((i) => (i.kind === 'potion' ? w.potions < 8 : i.tier > w.gear[i.kind]));
  if (foes.length && (d(foes[0].x, foes[0].z) < 9 || !wanted)) {
    if (hero.target !== foes[0].id) cmds.push({ type: 'attack', targetId: foes[0].id });
  } else if (wanted) cmds.push({ type: 'move', x: wanted.x, z: wanted.z });
  else if (w.stairs) cmds.push({ type: 'move', x: w.stairs[0] + 0.5, z: w.stairs[1] + 0.5 });
  return cmds;
}

// 한 판: 층마다 최대 3번 다시 시도(사망 시 그 층 진입 상태로). 결과: 깼는지, 총 사망 수, 최종 레벨
export function playthrough(seed: number) {
  let carry = START;
  let deaths = 0;
  for (let n = 1; n <= FLOORS; n++) {
    let done = false;
    for (let attempt = 0; attempt < 4 && !done; attempt++) {
      const w = makeFloor(seed * 100 + n * 10 + attempt, n, carry);
      for (let t = 0; t < 600 / DT; t++) {
        step(w, t % THINK === 0 ? think(w) : []);
        const o = outcome(w);
        if (o === 'dead') break;
        if (o === 'descend' || o === 'clear') {
          carry = { potions: w.potions, gear: { ...w.gear }, level: w.level, xp: w.xp };
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
