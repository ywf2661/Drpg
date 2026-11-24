// 잔상 탭(마법사 넷째): 잔상은 주인공이 쓰는 주문을 제 자리에서 똑같이 따라 쓴다.
// 잔상 남기기·자리 바꾸기·떠난 자리(패시브)·지나온 길(궁극). 설계: docs/superpowers/specs/2026-11-19-afterimage-tab-design.md
// 주문 함수는 world의 CASTS에 있어(순환 import를 피하려고) 다시 쓰는 길을 Recast로 받는다.
import { AFTERIMAGE, BLINK, BLIZZARD, DT, ROLL, type Entity, type Ghost, type SkillId, type World } from './rules';
import { cdExt, ext, mastered, rank, roll, skillHit, syn } from './core';
import { auraHit, blast, blizzardStat, bolt, foes, stun } from './wizard';
import { segDist } from './iaido';

export type Recast = (w: World, id: SkillId, p: Entity, x?: number, z?: number) => number;

export const afterimageStat = (w: World) => ({ cd: AFTERIMAGE.cd, time: AFTERIMAGE.time + 0.5 * ext(w, 'afterimage'), mult: AFTERIMAGE.mult + 0.05 * ext(w, 'afterimage'), max: mastered(w, 'afterimage') ? 2 : AFTERIMAGE.max });
export const swapStat = (w: World) => ({ cd: AFTERIMAGE.swapCd - 0.3 * cdExt(w, 'swap'), mult: (AFTERIMAGE.swap + 0.2 * ext(w, 'swap')) * syn(w, 'swap') });
export const lingerStat = (w: World) => ({ time: AFTERIMAGE.linger + 0.3 * ext(w, 'lingering') });
export const retraceStat = (w: World) => ({ cd: AFTERIMAGE.retraceCd - 0.5 * cdExt(w, 'retrace'), memory: AFTERIMAGE.memory + 0.3 * ext(w, 'retrace'), mult: (AFTERIMAGE.retrace + 0.1 * ext(w, 'retrace')) * syn(w, 'retrace') });

const OWN: SkillId[] = ['afterimage', 'swap', 'retrace'];
const NO_COPY: SkillId[] = [...OWN, 'ward']; // 잔상이 따라 하지 않는 것(순간이동·물약은 cast를 거치지 않는다)
const NO_MEMO: SkillId[] = [...NO_COPY, 'blizzard']; // 지나온 길이 기억하지 않는 것

// 주인공 주문을 따라 쓰는 잔상: 남기기·떠난 자리(지나온 길 잔상은 아니다)
const copying = (w: World) => w.ghosts.filter((g) => g.kind !== 'retrace' && g.t > 0);
// 잔상 자리에 선 주인공 사본
const stand = (hero: Entity, g: Ghost): Entity => ({ ...hero, x: g.x, z: g.z, facing: g.facing, path: [] });

function addGhost(w: World, hero: Entity, kind: Ghost['kind'], time: number, x = hero.x, z = hero.z): Ghost {
  const g: Ghost = { id: w.nextItem++, x, z, facing: hero.facing, kind, t: time, full: time, aura: 0, auraAcc: 0, flash: 0, wait: 0, queue: [] };
  w.ghosts.push(g);
  return g;
}

// 잔상 몫으로 한 번 쓴다: 굴림에 scale을 곱하고(바로 맞는 것·투사체 피해), 새로 생긴 불·낙하·벼락에도 곱한다.
// 시전 동작(casts)·서리 갑옷(shoutT)은 주인공 것만이라 되돌린다
function asGhost(w: World, hero: Entity, g: Ghost, scale: number, fn: (p: Entity) => void, shine = true) {
  const keep = { casts: w.casts, shoutT: w.shoutT };
  const n = { fires: w.fires.length, volleys: w.volleys.length, storm: w.storm.length, shots: w.shots.length };
  const p = stand(hero, g);
  w.ghostScale = scale;
  try {
    fn(p);
  } finally {
    w.ghostScale = 1;
  }
  for (const f of w.fires.slice(n.fires)) f.mult *= scale;
  for (const v of w.volleys.slice(n.volleys)) Object.assign(v, { mult: v.mult * scale, later: v.later * scale, scale });
  for (const s of w.storm.slice(n.storm)) s.mult *= scale;
  for (const s of w.shots.slice(n.shots)) s.scale = scale; // 피해는 굴림에 이미 들어갔다. 터지며 생기는 잔불·작은 화염구에 쓴다
  if (shine) Object.assign(g, { facing: p.facing, flash: AFTERIMAGE.flash });
  Object.assign(w, keep);
}

// 주인공이 주문을 썼다(world의 cast): 잔상마다 제 자리에서 같은 조준점으로 따라 쓴다. 눈보라는 잔상 둘레에 따로 깔린다
export function copyCast(w: World, hero: Entity, id: SkillId, x: number | undefined, z: number | undefined, recast: Recast) {
  if (NO_COPY.includes(id)) return;
  const scale = afterimageStat(w).mult;
  for (const g of copying(w)) {
    if (id === 'blizzard') Object.assign(g, { aura: blizzardStat(w).time, auraAcc: BLIZZARD.tick, flash: AFTERIMAGE.flash });
    else asGhost(w, hero, g, scale, (p) => recast(w, id, p, x, z));
  }
}

// 주인공 마력탄(평타): 잔상도 같은 적에게 쏜다
export function copyBolt(w: World, hero: Entity, t: Entity) {
  const scale = afterimageStat(w).mult;
  for (const g of copying(w)) asGhost(w, hero, g, scale, (p) => bolt(w, p, t));
}

// 지나온 길이 기억한다(배웠을 때만)
export function remember(w: World, id: SkillId, hero: Entity, x?: number, z?: number) {
  if (rank(w, 'retrace') && !NO_MEMO.includes(id)) w.memos.push({ id, x: hero.x, z: hero.z, ax: x, az: z, age: 0 });
}

// 잔상 남기기: 선 자리에 잔상. 한도를 넘으면 가장 오래된 것이 사라진다
export function afterimage(w: World, hero: Entity): number {
  const st = afterimageStat(w);
  const mine = w.ghosts.filter((g) => g.kind === 'leave');
  if (mine.length >= st.max) w.ghosts.splice(w.ghosts.indexOf(mine[0]), 1);
  addGhost(w, hero, 'leave', st.time);
  blast(w, 'blink', hero.x, hero.z);
  w.casts++;
  return st.cd;
}

// 자리 바꾸기: 가장 최근에 생긴 잔상과 자리를 맞바꾸고, 두 자리 사이의 적을 빛줄기로 친다(벽 너머도). 잔상이 없으면 쓰지 않는다
export function swap(w: World, hero: Entity): number {
  const g = copying(w).at(-1);
  if (!g) return 0;
  const st = swapStat(w);
  const seg: [number, number, number, number] = [hero.x, hero.z, g.x, g.z];
  for (const e of foes(w, hero)) {
    if (segDist(e.x, e.z, seg) > AFTERIMAGE.width) continue;
    skillHit(w, e, Math.round(roll(w, hero) * st.mult));
    stun(e, AFTERIMAGE.stun);
  }
  w.swaps.push({ id: w.nextItem++, x0: hero.x, z0: hero.z, x1: g.x, z1: g.z, age: 0 });
  blast(w, 'blink', hero.x, hero.z);
  blast(w, 'blink', g.x, g.z);
  [g.x, g.z, hero.x, hero.z] = [hero.x, hero.z, g.x, g.z];
  Object.assign(hero, { phase: 'roll', phaseT: BLINK.guard * ROLL.speed, dx: 0, dz: 0, state: 'idle', path: [], attackT: 0, skill: false, repathT: 0 }); // 순간이동처럼 잠깐 무적
  if (mastered(w, 'swap')) g.t = g.full;
  w.casts++;
  return st.cd;
}

// 떠난 자리(패시브): 순간이동으로 떠난 자리에 잔상
export function linger(w: World, hero: Entity, x: number, z: number) {
  if (rank(w, 'lingering')) addGhost(w, hero, 'linger', lingerStat(w).time, x, z);
}

// 지나온 길: 기억 안의 주문을, 쓴 자리마다(가까운 것은 하나로 묶어) 잔상이 서서 차례로 다시 쓴다. 기억이 없으면 쓰지 않는다
export function retrace(w: World, hero: Entity): number {
  const st = retraceStat(w);
  const memos = w.memos.filter((m) => m.age <= st.memory);
  if (!memos.length) return 0;
  const made: Ghost[] = [];
  for (const m of memos) {
    const g = made.find((g) => Math.hypot(g.x - m.x, g.z - m.z) <= AFTERIMAGE.group);
    if (g) g.queue.push(m);
    else made.push({ id: w.nextItem++, x: m.x, z: m.z, facing: hero.facing, kind: 'retrace', t: AFTERIMAGE.stay, full: AFTERIMAGE.stay, aura: 0, auraAcc: 0, flash: 0, wait: 0, queue: [m] });
  }
  made.forEach((g, i) => (g.wait = (AFTERIMAGE.spread * i) / made.length));
  w.ghosts.push(...made);
  w.memos = [];
  w.casts++;
  return st.cd;
}

// 한 틱: 기억이 늙고, 지나온 길 잔상이 차례로 서서 다시 쓰고, 잔상 몫 눈보라가 치고, 시간이 다 된 잔상이 사라진다
export function tickGhosts(w: World, hero: Entity, recast: Recast) {
  const memory = retraceStat(w).memory;
  w.memos = w.memos.filter((m) => (m.age += DT) <= memory);
  w.swaps = w.swaps.filter((s) => (s.age += DT) <= AFTERIMAGE.swapAge);
  for (const g of w.ghosts) {
    g.flash = Math.max(0, g.flash - DT);
    if (g.queue.length) {
      if ((g.wait -= DT) > 0) continue; // 아직 서지 않았다
      const q = g.queue;
      g.queue = [];
      blast(w, 'blink', g.x, g.z);
      const mult = retraceStat(w).mult;
      for (const m of q) asGhost(w, hero, g, mult, (p) => recast(w, m.id, p, m.ax, m.az));
      continue;
    }
    g.t -= DT;
    if (g.aura <= 0) continue;
    g.aura -= DT;
    if (hero.state === 'dead' || (g.auraAcc += DT) < BLIZZARD.tick - 1e-9) continue;
    g.auraAcc = 0;
    asGhost(w, hero, g, afterimageStat(w).mult, (p) => auraHit(w, p), false);
  }
  w.ghosts = w.ghosts.filter((g) => g.t > 0 || g.queue.length);
}
