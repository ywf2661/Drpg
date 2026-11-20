// 지역 기믹(설계: docs/superpowers/specs/2026-11-17-ruins-gimmicks-design.md).
// 성소·시련의 제단·얼어붙은 보물(상자의 한 종류), 잠든 몬스터, 보물 고블린, 개미지옥, 고드름, 저주받은 무덤, 가시 바닥, 푸른 마법진.
// three.js·Math.random 금지(난수는 rand(w)).
import { walkable } from './path';
import { asleep, dist, dress, dropGold, hurt, makeEntity, rand, randSlot, rollGear, wake } from './core';
import { guardOf, SANCTUM } from './sanctum';
import { tickPaladin } from './paladin';
import { bossScale, cyclePower, FLOORS } from './dungeon';
import { depthOf, FIERCE, AGGRO, CHEST, BUFF_LIST, DMG_SCALE, DT, GOLD_CHEST, GRAVE, ICICLE, MAGE, MONSTER_DMG, PIT, SHRINE, SLEEP, SPIKE, TREASURE, TRIAL, QUEST, type Chest, type Entity, type Kind, type Skin, type World } from './rules';

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

// ?test 「기사 소환」: 주인공 곁에 그 회차의 성소 5층 기도하는 자와 같은 수치(체력·힘·깊은 곳 특성 하나).
// 어느 구역에서 불러도 실제 결전과 같은 세기로 시험하게(main.ts makeFloor의 보스 배율·성소 체력 배율과 같은 순서로 반올림)
export function summonKnight(w: World, cycle: number): Entity | null {
  const hero = w.entities[0];
  const k = spawnNear(w, 'boss', hero.x, hero.z, 3, -1, 'fallen_paladin');
  if (!k) return null;
  const base = dress(makeEntity(k.id, 'boss', k.x, k.z, cyclePower(cycle)), { boss: 'fallen_paladin' });
  const s = bossScale(depthOf('sanctum', FLOORS));
  const hp = Math.round(Math.round(base.maxHp * s) * SANCTUM.bossHp);
  return Object.assign(k, { power: base.power * s, hp, maxHp: hp, eliteKind: FIERCE[Math.floor(rand(w) * FIERCE.length)] });
}

// ?test 「기사 소환」(타락한 성기사)이 되는 곳: 야영지가 아니고, 구역 클리어를 계단·출구·원래 보스가 정하는 곳.
// 셋 다 없는 구역(안 열린 지역으로 건너뛴 구역 등)에서는 기사가 유일한 보스가 되어 쓰러뜨리면 구역 클리어 → 이야기가 넘어갈 수 있다
export const canSummonKnight = (w: World) => w.land !== 'camp' && (!!w.stairs || w.exits.length > 0 || w.entities.some((e) => e.kind === 'boss'));

// 특별한 상자를 눌렀다. true = 처리했다(평소처럼 열지 않는다)
export function touchChest(w: World, ch: Chest): boolean {
  if (ch.kind === 'elder' || ch.kind === 'merchant' || ch.kind === 'villager' || ch.kind === 'asker' || ch.kind === 'clue' || ch.kind === 'stash') {
    // NPC는 몇 번이든 다시 말을 건다. 흔적은 읽으면 끝(의뢰 하나)
    if (ch.kind === 'clue') {
      ch.open = true;
      w.marked = true;
    }
    w.talk = ch.kind;
    return true;
  }
  if (ch.kind === 'altar') {
    // 성소 5층: 켜진 성소에 성물을 바치기 시작(서 있는 동안 tickAltars가 센다). 기사가 지키면 막힌다
    if (ch.open || w.offer) return true;
    if (guardOf(w, ch)) w.combos.push({ id: w.nextItem++, x: ch.x + 0.5, z: ch.z + 0.5, kind: 'ward', age: 0 });
    else w.offer = { id: ch.id, t: 0 };
    return true;
  }
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
  if (ch.kind === 'beacon') {
    if (!ch.wave) nextWave(w, ch); // 불을 붙이면 물결. 켜지는 것은 tickGimmicks가(눌러서 열지 않는다)
    return true;
  }
  if (ch.kind === 'seal') {
    // 봉인을 깨면 둘레에 무덤이 솟는다
    ch.open = true;
    w.marked = true;
    for (let i = 0; i < QUEST.graves; i++) {
      const g = spawnNear(w, 'minion', ch.x + 0.5, ch.z + 0.5, 3, -1, 'grave');
      if (g) g.cd = GRAVE.first;
    }
    return true;
  }
  return false;
}

const wavesOf = (ch: Chest) => (ch.kind === 'beacon' ? QUEST.beacon : TRIAL.waves);

function nextWave(w: World, ch: Chest) {
  ch.wave = (ch.wave ?? 0) + 1;
  ch.guards = [...wavesOf(ch)[ch.wave - 1]].map((c) => spawnNear(w, LETTER[c], ch.x + 0.5, ch.z + 0.5, TRIAL.radius)?.id ?? -1).filter((id) => id >= 0);
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
  if (w.land === 'sanctum') tickAltars(w, hero);
  tickPaladin(w); // 성기사 기술(?test 소환이면 성소 밖에서도)
  // 시련의 제단: 물결을 다 막으면 다음 물결(마지막 뒤엔 상자가 풀린다 — 열기는 주인공이)
  // 봉화도 같은 방식이고, 마지막 물결을 다 막으면 저절로 켜진다(의뢰 하나)
  for (const ch of w.chests) {
    if ((ch.kind !== 'trial' && ch.kind !== 'beacon') || !ch.wave || ch.open || !ch.guards!.every((id) => w.entities[id].state === 'dead')) continue;
    if (ch.wave < wavesOf(ch).length) nextWave(w, ch);
    else if (ch.kind === 'beacon') {
      ch.open = true;
      w.marked = true;
      w.blasts.push({ id: w.nextItem++, x: ch.x + 0.5, z: ch.z + 0.5, age: 0, kind: 'heal' });
    }
  }
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
  const boss = w.land === 'ruins' && !w.bossRaised ? w.entities.find((e) => e.kind === 'boss' && e.skin === 'demon' && e.state !== 'dead' && e.hp <= e.maxHp / 2) : undefined;
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

// 성소 5층: 성물 바치기(움직이거나 맞으면 끊긴다) → 넷 다 꺼지면 고리가 깨져 창(bareT) 동안 성기사가 맞는다 → 창이 끝나면 성소 둘이 다시 켜진다.
// 성기사 체력이 처음 절반 아래가 되면 켜진(없으면 아무) 성소 곁에서 해골 기사 왕이 일어난다
function tickAltars(w: World, hero: Entity) {
  const altars = w.chests.filter((c) => c.kind === 'altar');
  const boss = w.entities.find((e) => e.kind === 'boss' && e.state !== 'dead');
  if (!altars.length) return;
  // 켜진 성소에 바짝 붙어 멈춰 서면 저절로 바치기 시작(눌러서 걸어오면 도착해 멈추는 순간). 기사가 지키면 안 된다
  if (!w.offer && boss && hero.state === 'idle' && !hero.path.length) {
    const ch = altars.find((c) => !c.open && Math.hypot(hero.x - c.x - 0.5, hero.z - c.z - 0.5) <= CHEST.reach && !guardOf(w, c));
    if (ch) w.offer = { id: ch.id, t: 0 };
  }
  if (w.offer) {
    const ch = w.chests[w.offer.id];
    w.offer.t += DT;
    const broke = !boss || hero.state !== 'idle' || hero.path.length > 0 || w.calmT < w.offer.t - DT || Math.hypot(hero.x - ch.x - 0.5, hero.z - ch.z - 0.5) > CHEST.reach + 0.5;
    if (broke) w.offer = null;
    else if (w.offer.t >= SANCTUM.offer) {
      ch.open = true;
      w.offer = null;
      w.blasts.push({ id: w.nextItem++, x: ch.x + 0.5, z: ch.z + 0.5, age: 0, kind: 'heal' });
      if (boss && altars.every((c) => c.open)) {
        w.bareT = SANCTUM.window;
        Object.assign(boss, { stunT: Math.max(boss.stunT, SANCTUM.stagger), phase: 'none' }); // 치켜들던 칼·기도도 끊긴다
        w.blasts.push({ id: w.nextItem++, x: boss.x, z: boss.z, age: 0, kind: 'curse' });
      }
    }
  }
  if (w.bareT > 0 && (w.bareT -= DT) <= 0) {
    w.bareT = 0;
    const off = altars.filter((c) => c.open);
    for (let i = 0; i < SANCTUM.relight && off.length; i++) off.splice(Math.floor(rand(w) * off.length), 1)[0].open = false;
  }
  if (boss && !w.knightsUp && boss.hp <= boss.maxHp / 2) {
    w.knightsUp = true;
    const lit = altars.filter((c) => !c.open);
    const at = (lit.length >= SANCTUM.knights ? lit : altars).slice(0, SANCTUM.knights);
    for (const c of at) spawnNear(w, 'king', c.x + 0.5, c.z + 0.5, 1.5, -1, 'bone_knight');
  }
}
