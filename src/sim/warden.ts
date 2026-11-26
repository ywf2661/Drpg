// 시간의 파수꾼(뒤틀린 차원 결전, 설계: docs/superpowers/specs/2026-11-26-act2-rift-design.md 5절). three.js·Math.random 금지.
// 결전장: 돌 시계 문자판(warpmap.ts generateWarpArena), 둘레에 발판 네 짝 — 메아리·발판은 warp.ts가 누른다.
//   수정 판이 닫혀 있으면 맞지 않는다("막힘"). 빛나는 짝(lit)을 주인공과 메아리가 함께 밟으면 WARDEN.weak초 약점(×weakMult, "약점!"), 다음 짝이 빛난다.
//   잔상: 파수꾼의 WARDEN.lag초 전 모습(자리·방향·동작)을 그대로 되풀이한다. 그때 휘두른 공격도 그 자리에서 한 번 더(맞는다).
//   시계바늘 베기: 앞 부채꼴 예고 → 베기. 멈춘 시간: 주인공 발밑 원 예고 → 그 안에서 느려진다. 되감기(체력 절반 아래): 주인공을 메아리 자리로.
//   명멸의 틈: 세로로 찢어진 틈으로 들어가 숨는다(맞지 않고 보이지 않는다, 잔상만 보인다) → 주인공 앞을 정해 보이지 않게 그쪽으로 →
//   틈을 찢고 튀어나와 기사의 스쳐 베기처럼 돌진하며 긋는다(예고 없음). 0.5초 뒤 잔상이 같은 길을 한 번 더 돌진한다.
import { face, hitOf, hurt } from './core';
import { walkable } from './path';
import { DT, type Entity, type World } from './rules';

export const WARDEN = {
  weak: 6, weakMult: 1.5, lag: 0.5,
  sweepEvery: 2.6, sweepR: 3.2, sweepArc: 1.15, sweepTell: 0.8, sweepEnd: 0.45, sweepHit: 0.36, // 부채꼴 반지름·반각(라디안), 예고·휘두른 뒤 멈춤, 한 방(HIT 비율)
  stopEvery: 9, stopTell: 1, stopCast: 1, stopR: 2.4, stopFor: 3, stopSlow: 0.45, // 멈춘 시간: 원 반지름, 느려지는 동안·걸음 배율
  rewindEvery: 12, rewindCast: 1.2,
  blinkEvery: 10, blinkFirst: 6, tearOpen: 0.35, travel: 1.2, back: 3.5, dash: 7, dashSpeed: 24, dashNear: 0.9, dashHit: 0.4, // 틈 열고 숨기·보이지 않게 가기(초), 출발점은 주인공 앞 자리에서 back m 뒤, 돌진 길이·빠르기·스치는 거리·한 방
};
const LAG = Math.round(WARDEN.lag / DT);

// 잔상이 되풀이하는 한 틱: 자리·방향·보이는 동작, ev = 이 틱에 일어난 공격(잔상이 같은 틱에 같은 자리에서 한 번 더)
export type WardenAnim = 'stance' | 'move' | 'attack' | 'cast' | 'rewind' | 'blink' | 'dash' | 'hidden';
type Frame = { x: number; z: number; f: number; anim: WardenAnim; k: number; ev?: 'sweep' | 'dash'; dash?: number }; // k = 동작 진행도(0~1, 그림), dash = 돌진 번호(한 번 돌진에 한 번 맞는다)
export type Tear = { id: number; x: number; z: number; age: number }; // 세로로 찢어진 허공(그림 — 연 뒤 WARDEN.tearOpen초 벌어졌다 닫힌다)
export type Stop = { x: number; z: number; t: number }; // 멈춘 시간 자리(t = 남은 초)
type Act = 'none' | 'sweep' | 'stop' | 'rewind' | 'open' | 'travel' | 'dash';
export type WardenState = {
  lit: number; weakT: number; act: Act; actT: number; sweepT: number; stopT: number; rewindT: number; blinkT: number;
  hidden: boolean; to: [number, number]; dir: [number, number]; dashLeft: number; dashN: number; hitDash: number; ghostDash: number;
  frames: Frame[]; ghost: Frame | null; tears: Tear[]; stops: Stop[]; ver: number;
};
const state = new WeakMap<World, WardenState>();
export const wardenState = (w: World) => state.get(w) ?? null;

function init(): WardenState {
  return { lit: 0, weakT: 0, act: 'none', actT: 0, sweepT: 1, stopT: WARDEN.stopEvery / 2, rewindT: WARDEN.rewindEvery, blinkT: WARDEN.blinkFirst, hidden: false, to: [0, 0], dir: [0, 1], dashLeft: 0, dashN: 0, hitDash: -1, ghostDash: -1, frames: [], ghost: null, tears: [], stops: [], ver: 0 };
}

// core.hurt가 묻는다: 숨었으면 아예 안 맞고(-1), 약점이 아니면 막힘(0), 약점이면 배율
export function wardenGuard(w: World): number {
  const s = state.get(w);
  if (!s) return 0;
  if (s.hidden) return -1;
  return s.weakT > 0 ? WARDEN.weakMult : 0;
}
// core.walk가 묻는다: 멈춘 시간 원 안의 주인공 걸음 배율
export const wardenSlow = (w: World, e: Entity) => (state.get(w)?.stops.some((p) => p.t > 0 && Math.hypot(e.x - p.x, e.z - p.z) <= WARDEN.stopR) ? WARDEN.stopSlow : 1);

const inFan = (x: number, z: number, f: number, t: Entity) => {
  const [dx, dz] = [t.x - x, t.z - z];
  const d = Math.hypot(dx, dz);
  if (d > WARDEN.sweepR) return false;
  let a = Math.atan2(dx, dz) - f;
  a = Math.atan2(Math.sin(a), Math.cos(a));
  return d < 0.6 || Math.abs(a) <= WARDEN.sweepArc;
};
const fanZone = (w: World, x: number, z: number, f: number, t: number) => w.zones.push({ id: w.nextItem++, x, z, r: WARDEN.sweepR, t, total: t, dmg: 0, owner: -1, kind: 'warn', a: f, arc: WARDEN.sweepArc });

// 발판: 빛나는 짝이 다 눌렸으면 약점, 다음 짝
function plates(w: World, s: WardenState) {
  const wp = w.warp;
  if (!wp) return;
  const mine = wp.plates.filter((p) => p.pair === s.lit);
  if (mine.length && mine.every((p) => p.on)) {
    s.weakT = WARDEN.weak;
    s.lit = (s.lit + 1) % 4;
    s.ver++;
    const b = w.entities.find((e) => e.skin === 'time_warden');
    if (b) w.combos.push({ id: w.nextItem++, x: b.x, z: b.z, kind: 'stunned', age: 0 });
  }
}

// 잔상: LAG틱 전 모습. 그 틱의 공격을 그 자리에서 되풀이한다
function ghostStep(w: World, s: WardenState, e: Entity) {
  if (s.frames.length <= LAG) return void (s.ghost = null);
  const g = (s.ghost = s.frames.shift()!);
  const hero = w.entities[0];
  if (hero.state === 'dead') return;
  if (g.ev === 'sweep' && inFan(g.x, g.z, g.f, hero)) hurt(w, hero, hitOf(w, e, 1.3, WARDEN.sweepHit));
  if (g.anim === 'dash' && g.dash !== undefined && g.dash !== s.ghostDash && Math.hypot(hero.x - g.x, hero.z - g.z) <= WARDEN.dashNear) {
    s.ghostDash = g.dash;
    hurt(w, hero, hitOf(w, e, 1.4, WARDEN.dashHit));
  }
}

// true = 이번 틱은 이것으로 끝(평소 행동을 건너뛴다). false = 걸어서 다가간다(평소 길찾기)
export function warden(w: World, e: Entity, t: Entity | null): boolean {
  let s = state.get(w);
  if (!s) state.set(w, (s = init()));
  const hero = w.entities[0];
  const out = (anim: WardenAnim, k = 0, ev?: Frame['ev']) => s!.frames.push({ x: e.x, z: e.z, f: e.facing, anim, k, ev, dash: anim === 'dash' ? s!.dashN : undefined });
  s.weakT = Math.max(0, s.weakT - DT);
  for (const p of s.stops) p.t -= DT;
  s.stops = s.stops.filter((p) => p.t > 0);
  for (const r of s.tears) r.age += DT;
  s.tears = s.tears.filter((r) => r.age < WARDEN.tearOpen * 2.5);
  plates(w, s);
  ghostStep(w, s, e);
  if (hero.state === 'dead' || e.state === 'dead') {
    s.hidden = false;
    out('stance');
    return true;
  }
  if (!t) [e.target, t] = [0, hero];
  e.path = s.act === 'none' ? e.path : [];
  const half = e.hp <= e.maxHp / 2;
  s.sweepT -= DT;
  s.stopT -= DT;
  s.blinkT -= DT;
  if (half) s.rewindT -= DT;
  // 하고 있는 동작
  if (s.act !== 'none') {
    s.actT += DT;
    e.state = 'idle';
    switch (s.act) {
      case 'sweep': {
        const k = s.actT / (WARDEN.sweepTell + WARDEN.sweepEnd);
        e.state = 'attack';
        e.attackT = k * 1.2; // 그림: 휘두르기 진행(boss 휘두르기 시간 기준)
        const hitNow = s.actT >= WARDEN.sweepTell && s.actT - DT < WARDEN.sweepTell;
        if (hitNow) {
          if (inFan(e.x, e.z, e.facing, hero)) hurt(w, hero, hitOf(w, e, 1.3, WARDEN.sweepHit), e);
          fanZone(w, e.x, e.z, e.facing, WARDEN.lag); // 잔상이 같은 자리를 0.5초 뒤에
          w.blasts.push({ id: w.nextItem++, x: e.x + Math.sin(e.facing) * 1.6, z: e.z + Math.cos(e.facing) * 1.6, age: 0, kind: 'slash', n: 1 });
        }
        out('attack', Math.min(1, k), hitNow ? 'sweep' : undefined);
        if (k >= 1) [s.act, e.state, e.attackT] = ['none', 'idle', 0];
        return true;
      }
      case 'stop': {
        out('cast', s.actT / WARDEN.stopCast);
        if (s.actT >= WARDEN.stopTell) {
          s.stops.push({ x: s.to[0], z: s.to[1], t: WARDEN.stopFor });
          s.act = 'none';
        }
        return true;
      }
      case 'rewind': {
        out('rewind', s.actT / WARDEN.rewindCast);
        if (s.actT >= WARDEN.rewindCast) {
          const echo = w.warp?.echo;
          if (echo && walkable(w.grid, Math.floor(echo[0]), Math.floor(echo[1]))) Object.assign(hero, { x: echo[0], z: echo[1], path: [], phase: 'none' });
          w.blasts.push({ id: w.nextItem++, x: hero.x, z: hero.z, age: 0, kind: 'frost', n: 1 });
          s.act = 'none';
        }
        return true;
      }
      case 'open': {
        out('blink', s.actT / WARDEN.tearOpen);
        if (s.actT >= WARDEN.tearOpen) {
          // 숨는 순간 나타날 자리를 정한다: 주인공이 바라보는 쪽 앞, 거기서 파수꾼 쪽으로 back m 물러선 데서 돌진해 온다
          const [ax, az] = [hero.x + Math.sin(hero.facing) * 0.8, hero.z + Math.cos(hero.facing) * 0.8];
          let [dx, dz] = [ax - e.x, az - e.z];
          const d = Math.hypot(dx, dz) || 1;
          [dx, dz] = [dx / d, dz / d];
          let back = WARDEN.back;
          while (back > 0.5 && !walkable(w.grid, Math.floor(ax - dx * back), Math.floor(az - dz * back))) back -= 0.5;
          s.to = [ax - dx * back, az - dz * back];
          s.dir = [dx, dz];
          [s.hidden, s.act, s.actT] = [true, 'travel', 0];
          s.ver++;
        }
        return true;
      }
      case 'travel': {
        const k = Math.min(1, DT / Math.max(DT, WARDEN.travel - s.actT + DT));
        e.x += (s.to[0] - e.x) * k;
        e.z += (s.to[1] - e.z) * k;
        e.facing = Math.atan2(s.dir[0], s.dir[1]);
        out('hidden');
        if (s.actT >= WARDEN.travel) {
          [e.x, e.z] = s.to;
          [s.hidden, s.act, s.actT, s.dashLeft] = [false, 'dash', 0, WARDEN.dash];
          s.dashN++;
          s.tears.push({ id: w.nextItem++, x: e.x, z: e.z, age: 0 });
          s.ver++;
        }
        return true;
      }
      case 'dash': {
        const step = WARDEN.dashSpeed * DT;
        const [nx, nz] = [e.x + s.dir[0] * step, e.z + s.dir[1] * step];
        if (walkable(w.grid, Math.floor(nx), Math.floor(nz))) [e.x, e.z] = [nx, nz];
        else s.dashLeft = 0;
        if (s.hitDash !== s.dashN && Math.hypot(hero.x - e.x, hero.z - e.z) <= WARDEN.dashNear) {
          s.hitDash = s.dashN;
          hurt(w, hero, hitOf(w, e, 1.4, WARDEN.dashHit), e);
        }
        out('dash', 1 - s.dashLeft / WARDEN.dash);
        if ((s.dashLeft -= step) <= 0) [s.act, s.blinkT] = ['none', WARDEN.blinkEvery];
        return true;
      }
    }
  }
  // 새 동작 고르기: 명멸의 틈 > 되감기 > 멈춘 시간 > 시계바늘 베기(가까우면) > 다가가기
  const d = Math.hypot(t.x - e.x, t.z - e.z);
  const start = (act: Act) => Object.assign(s!, { act, actT: 0 }) && Object.assign(e, { state: 'idle', attackT: 0, path: [] });
  if (s.blinkT <= 0) {
    start('open');
    s.tears.push({ id: w.nextItem++, x: e.x, z: e.z, age: 0 });
    out('blink');
    return true;
  }
  if (half && s.rewindT <= 0 && w.warp?.echo) {
    s.rewindT = WARDEN.rewindEvery;
    start('rewind');
    out('rewind');
    return true;
  }
  if (s.stopT <= 0) {
    s.stopT = WARDEN.stopEvery;
    face(e, t);
    start('stop');
    s.to = [hero.x, hero.z];
    w.zones.push({ id: w.nextItem++, x: hero.x, z: hero.z, r: WARDEN.stopR, t: WARDEN.stopTell, total: WARDEN.stopTell, dmg: 0, owner: -1, kind: 'warn' });
    out('cast');
    return true;
  }
  if (d <= WARDEN.sweepR - 0.6) {
    face(e, t);
    if (s.sweepT > 0) {
      e.state = 'idle';
      e.path = [];
      out('stance');
      return true;
    }
    s.sweepT = WARDEN.sweepEvery;
    start('sweep');
    e.state = 'attack';
    fanZone(w, e.x, e.z, e.facing, WARDEN.sweepTell);
    out('attack');
    return true;
  }
  out(e.state === 'move' ? 'move' : 'stance');
  return false;
}

