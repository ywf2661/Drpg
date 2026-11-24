// 매 탭(궁수 넷째): 매는 늘 곁에서 알아서 싸우고, 스킬은 매에게 내리는 명령이다.
// 덮쳐라(배우면 매가 생긴다)·매 타기·협공(패시브)·매 떼(궁극). 설계: docs/superpowers/specs/2026-11-19-hawk-tab-design.md
// 매는 하늘을 난다: 벽을 무시하고 곧장 가고, 적이 노리지 않는다. 피해는 매가 대상에 닿는 순간 들어간다(화면은 이 자리를 따라 그린다)
import { walkable } from './path';
import { DT, HAWK, ROLL, type Entity, type Hawk, type World } from './rules';
import { dist, cdExt, ext, hurt, mastered, pathTo, rank, roll, skillHit, syn } from './core';
import { foes, stun } from './wizard';

export const swoopStat = (w: World) => ({ cd: HAWK.cd - 0.3 * cdExt(w, 'swoop'), mult: (HAWK.mult + 0.25 * ext(w, 'swoop')) * syn(w, 'swoop') });
export const rideStat = (w: World) => ({ cd: HAWK.rideCd - 0.3 * cdExt(w, 'ride'), mult: (HAWK.arrow + 0.15 * ext(w, 'ride')) * syn(w, 'ride') });
export const assistStat = (w: World) => ({ ratio: HAWK.assist + 0.1 * ext(w, 'assist') });
export const flockStat = (w: World) => ({ cd: HAWK.flockCd, count: HAWK.count + ext(w, 'flock'), mult: (HAWK.flockMult + 0.1 * ext(w, 'flock')) * syn(w, 'flock') });

const newHawk = (x: number, z: number, y: number, mode: Hawk['mode'] = 'orbit'): Hawk => ({ x, z, y, mode, target: -1, mult: 0, stun: 0, around: false, peckT: HAWK.every, assistT: 0, dives: 0, angle: 0, cand: -1 });
// 쪼고 덮칠 수 있는 적: 잠든 적은 깨우지 않는다
const prey = (w: World, hero: Entity) => foes(w, hero).filter((e) => !e.asleep);

// 궁수가 덮쳐라를 배웠으면 매가 있다(없으면 주인공 곁에 만든다). 아니면 매와 매 떼를 치운다
export function hawkOf(w: World, hero: Entity): Hawk | null {
  if (w.cls !== 'ranger' || !rank(w, 'swoop')) return ((w.hawk = null), (w.flock = []), null);
  return (w.hawk ??= newHawk(hero.x + HAWK.r, hero.z, HAWK.h));
}

// (gx, gy, gz)로 speed m/s만큼 다가간다. 닿았으면 true
function fly(h: Hawk, gx: number, gz: number, gy: number, speed: number): boolean {
  const [dx, dy, dz] = [gx - h.x, gy - h.y, gz - h.z];
  const d = Math.hypot(dx, dy, dz), step = speed * DT;
  if (d <= Math.max(step, HAWK.reach)) return (Object.assign(h, { x: gx, y: gy, z: gz }), true);
  Object.assign(h, { x: h.x + (dx / d) * step, y: h.y + (dy / d) * step, z: h.z + (dz / d) * step });
  return false;
}

// 덮치게 한다(하던 일을 끊는다)
const send = (h: Hawk, t: Entity, mult: number, stunT: number, around = false, dives = 1) => Object.assign(h, { mode: 'dive', target: t.id, mult, stun: stunT, around, dives });

// 매 떼가 다음에 덮칠 적: 주인공 둘레 범위 안에서, 다른 매가 노리지 않는 적 중 이 매에게 가장 가까운 적(없으면 아무나)
function nextPrey(w: World, hero: Entity, h: Hawk): Entity | undefined {
  const all = prey(w, hero).filter((e) => dist(e, hero) <= HAWK.radius);
  const taken = new Set([w.hawk, ...w.flock].filter((o) => o && o !== h && o.mode === 'dive').map((o) => o!.target));
  const near = (es: Entity[]) => es.sort((a, b) => Math.hypot(a.x - h.x, a.z - h.z) - Math.hypot(b.x - h.x, b.z - h.z))[0];
  return near(all.filter((e) => !taken.has(e.id))) ?? near(all);
}

// 덮치기가 닿았다: 피해·기절(5단계는 둘레도 기절). 남은 덮치기가 있으면 다음 적, 없으면 돌아간다(매 떼의 다른 매는 하늘로)
function strike(w: World, hero: Entity, h: Hawk, t: Entity, mine: boolean) {
  skillHit(w, t, Math.round(roll(w, hero) * h.mult));
  if (h.stun > 0) stun(t, h.stun);
  if (h.around) for (const e of prey(w, hero)) if (e !== t && dist(e, t) <= HAWK.around) stun(e, h.stun);
  w.blasts.push({ id: w.nextItem++, x: t.x, z: t.z, age: 0, kind: 'feather' });
  finish(w, hero, h, mine);
}
function finish(w: World, hero: Entity, h: Hawk, mine: boolean) {
  const next = --h.dives > 0 ? nextPrey(w, hero, h) : undefined;
  if (next) h.target = next.id;
  else h.mode = mine ? 'orbit' : 'leave';
}

function tickOne(w: World, hero: Entity, h: Hawk, mine: boolean) {
  const t = h.target >= 0 ? w.entities[h.target] : undefined;
  const alive = !!t && t.state !== 'dead';
  if (h.mode === 'orbit') {
    h.angle += HAWK.spin * DT;
    fly(h, hero.x + Math.cos(h.angle) * HAWK.r, hero.z + Math.sin(h.angle) * HAWK.r, HAWK.h, HAWK.peck);
    if (!mine || (h.peckT -= DT) > 0) return;
    h.peckT = HAWK.every;
    if (hero.state === 'dead') return;
    // 쪼기: 주인공이 공격 중인 적(가까우면), 없으면 가까운 적
    const aimed = hero.target !== null ? w.entities[hero.target] : undefined;
    const pick = aimed && aimed.state !== 'dead' && !aimed.asleep && dist(aimed, hero) <= HAWK.aim ? aimed : prey(w, hero).filter((e) => dist(e, hero) <= HAWK.near).sort((a, b) => dist(a, hero) - dist(b, hero))[0];
    if (pick) Object.assign(h, { mode: 'peck', target: pick.id });
  } else if (h.mode === 'peck') {
    if (!alive) return void (h.mode = 'orbit');
    if (!fly(h, t.x, t.z, HAWK.low, HAWK.peck)) return;
    hurt(w, t, Math.round(roll(w, hero) * HAWK.pecks), hero);
    h.mode = 'orbit';
  } else if (h.mode === 'dive') {
    if (!alive) {
      // 대상이 날아가는 도중에 죽었다: 피해 없이 다음 적(매 떼) 또는 돌아간다
      const next = !mine || h.dives > 1 ? nextPrey(w, hero, h) : undefined; // 덮쳐라 한 번은 그냥 돌아가고, 매 떼는 다음 적에게
      if (next) h.target = next.id;
      else h.mode = mine ? 'orbit' : 'leave';
      return;
    }
    if (fly(h, t.x, t.z, HAWK.low, HAWK.dive)) strike(w, hero, h, t, mine);
  } else if (h.mode === 'carry') Object.assign(h, { x: hero.x, z: hero.z, y: HAWK.h });
  else if (h.mode === 'leave' && fly(h, h.x, h.z, HAWK.sky + 2, HAWK.dive)) h.dives = -1; // 하늘로 사라졌다
}

// 한 틱: 매(협공 후보가 있으면 덮친다)와 매 떼
export function tickHawks(w: World, hero: Entity) {
  const h = hawkOf(w, hero);
  if (!h) return;
  h.assistT = Math.max(0, h.assistT - DT);
  const c = h.cand >= 0 ? w.entities[h.cand] : undefined;
  h.cand = -1;
  if (c && c.state !== 'dead' && h.assistT <= 0 && (h.mode === 'orbit' || h.mode === 'peck')) {
    send(h, c, swoopStat(w).mult * assistStat(w).ratio, 0);
    h.assistT = HAWK.assistCd;
  }
  tickOne(w, hero, h, true);
  for (const f of w.flock) if ((f.peckT -= DT) <= 0) tickOne(w, hero, f, false); // peckT = 내려오기까지 기다림
  w.flock = w.flock.filter((f) => f.dives >= 0);
}

// 협공(패시브): 스킬 화살이 적을 맞혔다. 이번 틱에 맞은 적 중 최대 체력이 가장 큰 적을 후보로(tickHawks가 덮친다)
export function assist(w: World, e: Entity) {
  const h = w.hawk;
  if (!h || !rank(w, 'assist') || e.state === 'dead') return;
  const c = h.cand >= 0 ? w.entities[h.cand] : undefined;
  if (!c || e.maxHp > c.maxHp) h.cand = e.id;
}

// 덮쳐라: 범위 안의 적 중 조준점에 가장 가까운 적(조준점이 없으면 주인공에게 가장 가까운 적)에게 매가 덮친다. 적이 없으면 쓰지 않는다
export function swoop(w: World, hero: Entity, x?: number, z?: number): number {
  const h = hawkOf(w, hero);
  const [ax, az] = x !== undefined && z !== undefined ? [x, z] : [hero.x, hero.z];
  const t = prey(w, hero)
    .filter((e) => dist(e, hero) <= HAWK.range)
    .sort((a, b) => Math.hypot(a.x - ax, a.z - az) - Math.hypot(b.x - ax, b.z - az))[0];
  if (!h || !t) return 0;
  send(h, t, swoopStat(w).mult, HAWK.stun, mastered(w, 'swoop'));
  hero.facing = Math.atan2(t.x - hero.x, t.z - hero.z);
  w.casts++;
  return swoopStat(w).cd;
}

// 매 타기: 매를 타고 조준한 쪽(없으면 가까운 적의 반대쪽)으로 날아간다. 무적, 적을 지나가고, 벽 앞에서 멈춘다(순간이동과 같다)
export function ride(w: World, hero: Entity, x?: number, z?: number): number {
  const h = hawkOf(w, hero);
  if (!h) return 0;
  const aimed = x !== undefined && z !== undefined;
  const near = foes(w, hero).filter((e) => dist(e, hero) <= ROLL.away).sort((a, b) => dist(a, hero) - dist(b, hero))[0];
  const [tx, tz] = aimed ? [x, z] : near ? [2 * hero.x - near.x, 2 * hero.z - near.z] : [hero.x + Math.sin(hero.facing), hero.z + Math.cos(hero.facing)];
  const d = Math.hypot(tx - hero.x, tz - hero.z);
  const [ux, uz] = d > 1e-6 ? [(tx - hero.x) / d, (tz - hero.z) / d] : [Math.sin(hero.facing), Math.cos(hero.facing)];
  const max = aimed ? Math.min(HAWK.dist, d) : HAWK.dist;
  let k = 0;
  while (k + 0.1 <= max && walkable(w.grid, Math.floor(hero.x + ux * (k + 0.1)), Math.floor(hero.z + uz * (k + 0.1)))) k += 0.1;
  Object.assign(hero, { phase: 'ride', phaseT: HAWK.time, dx: (ux * k) / HAWK.time, dz: (uz * k) / HAWK.time, state: 'idle', attackT: 0, skill: false, repathT: 0, facing: Math.atan2(ux, uz), path: hero.path.slice(-1) });
  Object.assign(h, { mode: 'carry', target: -1 });
  w.rideHit = [];
  w.casts++;
  return rideStat(w).cd;
}

// 매 타기 한 틱: 날아가며 지나는 길 아래 적에게 화살 한 발씩(적마다 한 번). 내려앉으면 매는 맴돌고, 5단계는 가까운 적을 덮친다
export function rideStep(w: World, hero: Entity) {
  hero.x += hero.dx * DT;
  hero.z += hero.dz * DT;
  const mult = rideStat(w).mult;
  for (const e of foes(w, hero))
    if (!w.rideHit.includes(e.id) && dist(e, hero) <= HAWK.width) {
      w.rideHit.push(e.id);
      skillHit(w, e, Math.round(roll(w, hero) * mult));
    }
  if ((hero.phaseT -= DT) > 0) return;
  const to = hero.path[0]; // 가던 목적지: 내려앉은 자리에서 길을 다시 잡는다
  Object.assign(hero, { phase: 'none', state: 'idle', dx: 0, dz: 0, path: (to && pathTo(w, hero, to[0], to[1])) ?? [] });
  const h = hawkOf(w, hero);
  if (!h) return;
  h.mode = 'orbit';
  const t = mastered(w, 'ride') ? prey(w, hero).filter((e) => dist(e, hero) <= HAWK.landNear).sort((a, b) => dist(a, hero) - dist(b, hero))[0] : undefined;
  if (t) send(h, t, swoopStat(w).mult, HAWK.stun);
}

// 매 떼: 하늘에서 매들이 내려와 내 매와 함께 주변 적을 두 번씩 덮친다. 내 매가 앞장선다. 적이 없으면 쓰지 않는다
export function flock(w: World, hero: Entity): number {
  const h = hawkOf(w, hero);
  if (!h || !prey(w, hero).some((e) => dist(e, hero) <= HAWK.radius)) return 0;
  const st = flockStat(w);
  const lead = nextPrey(w, hero, h)!;
  send(h, lead, st.mult, HAWK.flockStun, false, HAWK.dives);
  for (let k = 1; k < st.count; k++) {
    const a = (k / st.count) * Math.PI * 2;
    const f = newHawk(hero.x + Math.cos(a) * 3, hero.z + Math.sin(a) * 3, HAWK.sky, 'dive');
    Object.assign(f, { mult: st.mult, stun: HAWK.flockStun, dives: HAWK.dives, peckT: 0.15 * k, target: (nextPrey(w, hero, f) ?? lead).id });
    w.flock.push(f);
  }
  w.casts++;
  return st.cd;
}
