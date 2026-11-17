// 지역 기믹(설계: docs/superpowers/specs/2026-11-17-ruins-gimmicks-design.md).
// 성소·시련의 제단·얼어붙은 보물(상자의 한 종류), 잠든 몬스터, 보물 고블린, 개미지옥, 고드름, 저주받은 무덤, 가시 바닥, 푸른 마법진.
// three.js·Math.random 금지(난수는 rand(w)).
import { walkable } from './path';
import { asleep, dist, dress, dropGold, hurt, makeEntity, rand, randSlot, rollGear, wake } from './core';
import { AGGRO, BUFF_LIST, DMG_SCALE, DT, GOLD_CHEST, GRAVE, ICICLE, MAGE, MONSTER_DMG, PIT, SHRINE, SLEEP, SPIKE, TREASURE, TRIAL, type Chest, type Entity, type Kind, type Skin, type World } from './rules';

const LETTER: Record<string, Kind> = { m: 'minion', w: 'warrior', a: 'archer', g: 'mage' };
// 몬스터 피해 배율(층 배율의 DMG_SCALE배 + 공통 배율) — 함정 피해에 곱한다
const trapDmg = (w: World, base: number) => Math.round(base * (1 + (w.power - 1) * DMG_SCALE) * MONSTER_DMG);

// (cx, cz) 둘레 r m 쯤의 걸을 수 있는 자리에 몬스터 하나(이 맵의 스킨 또는 skin, 주인공을 노린다 — 무덤은 아무도 안 노린다)
export function spawnNear(w: World, kind: Kind, cx: number, cz: number, r: number, summoner = -1, skin?: Skin): Entity | null {
  for (let tries = 0; tries < 24; tries++) {
    const a = rand(w) * Math.PI * 2;
    const [x, z] = [cx + Math.sin(a) * r, cz + Math.cos(a) * r];
    if (!walkable(w.grid, Math.floor(x), Math.floor(z))) continue;
    const e = Object.assign(dress(makeEntity(w.entities.length, kind, x, z, w.power, false, summoner), skin ? { [kind]: skin } : w.skins), { target: skin === 'grave' ? null : 0 });
    w.entities.push(e);
    w.blasts.push({ id: w.nextItem++, x, z, age: 0, kind: 'curse' });
    return e;
  }
  return null;
}

// 특별한 상자를 눌렀다. true = 처리했다(평소처럼 열지 않는다)
export function touchChest(w: World, ch: Chest): boolean {
  if (ch.kind === 'shrine') {
    ch.open = true;
    w.buff = { kind: BUFF_LIST[Math.floor(rand(w) * BUFF_LIST.length)], t: SHRINE.time };
    w.blasts.push({ id: w.nextItem++, x: ch.x + 0.5, z: ch.z + 0.5, age: 0, kind: 'heal' });
    return true;
  }
  if (ch.kind === 'trial' && !ch.wave) {
    nextWave(w, ch);
    return true;
  }
  return false;
}

function nextWave(w: World, ch: Chest) {
  ch.wave = (ch.wave ?? 0) + 1;
  ch.guards = [...TRIAL.waves[ch.wave - 1]].map((c) => spawnNear(w, LETTER[c], ch.x + 0.5, ch.z + 0.5, TRIAL.radius)?.id ?? -1).filter((id) => id >= 0);
}

// 시련·얼음 상자의 내용물: 최고 단계보다 하나 위(마법 이상) 장비 + 금화 배수. 평소 상자면 false
export function specialLoot(w: World, ch: Chest, x: number, z: number, gx: number, gz: number): boolean {
  if (ch.kind !== 'trial' && ch.kind !== 'ice') return false;
  w.items.push(rollGear(w, x, z, randSlot(w), Math.min(4, w.maxTier + (ch.kind === 'trial' ? 1 : 0)), ch.kind === 'trial'));
  const k = ch.kind === 'trial' ? TRIAL.gold : 2;
  dropGold(w, gx, gz, GOLD_CHEST.lo * k, GOLD_CHEST.hi * k, w.power);
  return true;
}

// 몬스터 한 마리의 특별한 행동. true = 이번 틱은 이것으로 끝(평소의 생각·행동을 건너뛴다)
export function special(w: World, e: Entity, hero: Entity): boolean {
  if (asleep(e)) {
    if (hero.state !== 'dead' && dist(e, hero) <= SLEEP.wake) wake(w, e);
    return asleep(e);
  }
  if (e.skin === 'grave') {
    if (hero.state === 'dead' || dist(e, hero) > GRAVE.near || (e.cd -= DT) > 0) return true;
    e.cd = GRAVE.every;
    if (w.entities.filter((m) => m.summoner === e.id && m.state !== 'dead').length < GRAVE.max) spawnNear(w, 'minion', e.x, e.z, 1.2, e.id);
    return true;
  }
  if (e.skin === 'treasure') {
    if (!e.cd && hero.state !== 'dead' && dist(e, hero) <= AGGRO) Object.assign(e, { cd: 1, fearT: TREASURE.run }); // 봤다: 도망
    if (e.cd && e.fearT <= 0) {
      w.blasts.push({ id: w.nextItem++, x: e.x, z: e.z, age: 0, kind: 'blink' }); // 땅속으로 사라진다(드롭 없음)
      Object.assign(e, { state: 'dead', hp: 0, x: -50, z: -50 });
    }
    return !e.cd || e.state === 'dead'; // 아직 못 봤으면 가만히, 봤으면 공포(도망) 처리는 평소대로
  }
  return false;
}

// 월드 한 틱의 기믹(몬스터 행동 뒤에)
export function tickGimmicks(w: World, hero: Entity) {
  if (w.buff && (w.buff.t -= DT) <= 0) w.buff = null;
  // 시련의 제단: 물결을 다 막으면 다음 물결(마지막 뒤엔 상자가 풀린다 — 열기는 주인공이)
  for (const ch of w.chests) if (ch.kind === 'trial' && ch.wave && ch.wave < TRIAL.waves.length && ch.guards!.every((id) => w.entities[id].state === 'dead')) nextWave(w, ch);
  if (hero.state === 'dead') return;
  // 개미지옥: 가운데로 끌려간다(구르기·돌진 중엔 아님)
  const pit = w.pits.find(([x, z]) => Math.hypot(hero.x - x, hero.z - z) <= PIT.r);
  if (pit && hero.phase === 'none') {
    const d = Math.hypot(pit[0] - hero.x, pit[1] - hero.z);
    if (d > 0.3) [hero.x, hero.z] = [hero.x + ((pit[0] - hero.x) / d) * PIT.pull * DT, hero.z + ((pit[1] - hero.z) / d) * PIT.pull * DT];
  }
  // 고드름(설원): 얼음 벽 가까이에 있으면 가끔 머리 위로
  if (w.land === 'snow' && (w.icicleT -= DT) <= 0) {
    w.icicleT = ICICLE.every;
    if (nearWall(w, hero) && rand(w) < ICICLE.chance) {
      const [x, z] = [hero.x + (rand(w) - 0.5), hero.z + (rand(w) - 0.5)];
      w.zones.push({ id: w.nextItem++, x, z, r: MAGE.blast, t: ICICLE.delay, total: ICICLE.delay, dmg: trapDmg(w, ICICLE.dmg), owner: -1, kind: 'ice' });
    }
  }
  // 가시 바닥: 주기마다 솟는 순간 위에 있는 것(주인공·몬스터)이 다친다
  if (w.spikes.length) {
    const before = w.spikeT;
    w.spikeT = (w.spikeT + DT) % SPIKE.period;
    if (before < SPIKE.warn && w.spikeT >= SPIKE.warn)
      for (const e of [hero, ...w.entities.filter((m) => m !== hero && m.state !== 'dead' && m.skin !== 'grave')])
        if (w.spikes.some(([x, z]) => Math.floor(e.x) === x && Math.floor(e.z) === z)) hurt(w, e, trapDmg(w, SPIKE.dmg));
  }
  // 푸른 마법진: 밟으면 짝으로. 내려서야 다시
  const on = w.portals.findIndex(([x, z]) => Math.hypot(hero.x - x, hero.z - z) <= 0.5);
  if (on < 0) w.portalLock = false;
  else if (!w.portalLock && w.portals.length === 2 && hero.phase === 'none') {
    const [x, z] = w.portals[1 - on];
    w.blasts.push({ id: w.nextItem++, x: hero.x, z: hero.z, age: 0, kind: 'blink' }, { id: w.nextItem++, x, z, age: 0, kind: 'blink' });
    Object.assign(hero, { x, z, path: [], state: 'idle', target: null });
    Object.assign(w, { portalLock: true, amove: null, opening: null });
  }
  // 폐허 보스: 체력 절반에 무덤을 일으킨다
  const boss = w.land === 'ruins' && !w.bossRaised ? w.entities.find((e) => e.kind === 'boss' && e.state !== 'dead' && e.hp <= e.maxHp / 2) : undefined;
  if (boss) {
    w.bossRaised = true;
    for (let i = 0; i < GRAVE.boss; i++) {
      const g = spawnNear(w, 'minion', boss.x, boss.z, 3, -1, 'grave');
      if (g) g.cd = GRAVE.first;
    }
  }
}

function nearWall(w: World, e: Entity) {
  const [cx, cz] = [Math.floor(e.x), Math.floor(e.z)];
  for (let z = cz - ICICLE.near; z <= cz + ICICLE.near; z++) for (let x = cx - ICICLE.near; x <= cx + ICICLE.near; x++) if (!walkable(w.grid, x, z)) return true;
  return false;
}

// 개미지옥 안에 있는가(주인공 이동이 느려진다)
export const inPit = (w: World, e: Entity) => w.pits.some(([x, z]) => Math.hypot(e.x - x, e.z - z) <= PIT.r);
