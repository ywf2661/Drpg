// 프레임 사이 world 변화 → 효과음 이벤트. sim을 건드리지 않고 상태 차이만 본다.
import { uniqueOf, type Blast, type Entity, type Gear, type Slot, type World } from '../sim/world';

export type SoundName =
  | 'swing' | 'hero_hit' | 'hero_die'
  | 'skel_attack' | 'skel_hit' | 'skel_die'
  | 'boss_attack' | 'boss_hit' | 'boss_die'
  | 'gold' | 'summon' | 'dash' | 'shout' | 'throw' | 'shoot' | 'fireball' | 'blast' | 'cleave' | 'chest' | 'potion' | 'loot' | 'equip_weapon' | 'equip_armor' | 'level_up';
export type SoundEvent = { name: SoundName; x: number; z: number };
export type Snapshot = {
  world: World;
  ents: { hp: number; maxHp: number; state: Entity['state']; attackT: number; phase: Entity['phase'] }[];
  potions: number;
  gold: number;
  bag: number;
  gear: Gear;
  mods: string; // 장착 옵션(비교용 문자열)
  items: Set<number>;
  shots: Set<number>;
  blasts: Set<number>;
  zones: Set<number>;
  level: number;
  cleaves: number;
  edgeSlashes: number; // 벼림 해방 참격
  edgeHits: Set<number>; // 벼림 강화 타격
  dashes: number;
  shouts: number;
  opened: number; // 열린 상자 수
  allies: number; // 강령술사의 해골 수
};

export function snapshot(w: World): Snapshot {
  return {
    world: w,
    ents: w.entities.map((e) => ({ hp: e.hp, maxHp: e.maxHp, state: e.state, attackT: e.attackT, phase: e.phase })),
    potions: w.potions,
    gold: w.gold,
    bag: w.bag.length,
    gear: { ...w.gear },
    mods: JSON.stringify(w.mods),
    items: new Set(w.items.map((i) => i.id)),
    shots: new Set(w.shots.map((s) => s.id)),
    blasts: new Set(w.blasts.map((b) => b.id)),
    zones: new Set(w.zones.map((z) => z.id)),
    level: w.level,
    cleaves: w.cleaves,
    edgeSlashes: w.edgeSlashes,
    edgeHits: new Set(w.edgeHits.map((h) => h.id)),
    dashes: w.dashes,
    shouts: w.shouts,
    opened: w.chests.filter((c) => c.open).length,
    allies: w.allies.length,
  };
}

const VOICE = { hero: 'hero', minion: 'skel', warrior: 'skel', archer: 'skel', mage: 'skel', king: 'skel', boss: 'boss' } as const;

export function soundEvents(prev: Snapshot, w: World): SoundEvent[] {
  if (prev.world !== w) return []; // 새 층: 비교하지 않는다
  const out: SoundEvent[] = [];
  const hero = w.entities[0];
  const at = (name: SoundName, x = hero.x, z = hero.z) => out.push({ name, x, z });
  w.entities.forEach((e, i) => {
    const p = prev.ents[i];
    if (!p) return; // 이번 프레임에 새로 생긴 엔티티(소환)
    const v = VOICE[e.kind];
    const swung = e.state === 'attack' && (p.state !== 'attack' || e.attackT < p.attackT);
    const ranged = e.kind === 'archer' || e.kind === 'mage' || (e.kind === 'hero' && w.cls !== 'knight'); // 원거리(마법사·궁수 포함)는 쏠 때 소리
    if (swung && !ranged) at(v === 'hero' ? 'swing' : `${v}_attack`, e.x, e.z);
    if (e.phase === 'windup' && p.phase !== 'windup') at('boss_attack', e.x, e.z); // 돌진 예고
    if (e.phase === 'flash' && p.phase !== 'flash') at('dash', e.x, e.z); // 일섬
    if (e.phase === 'sheathe' && p.phase !== 'sheathe') at('cleave', e.x, e.z); // 납도
    if (e.phase === 'roll' && p.phase !== 'roll') at(w.cls === 'wizard' && e.kind === 'hero' ? 'summon' : 'dash', e.x, e.z); // 구르기 / 순간이동
    if (e.state === 'dead' && p.state !== 'dead') at(`${v}_die`, e.x, e.z);
    else if (e.hp < p.hp && e.maxHp === p.maxHp) at(`${v}_hit`, e.x, e.z); // 최대 체력이 바뀐 것(갑옷 교체)은 맞은 것이 아니다
  });
  for (const s of w.shots) if (!prev.shots.has(s.id)) at(s.kind === 'fire' || s.kind === 'fireball' ? 'fireball' : s.kind === 'axe' ? 'throw' : 'shoot', s.x, s.z);
  // 내려찍기가 떨어짐 / 서리 고리 / 폭발·벼락 / 덫이 닫힘 / 화살비. 얼음·번개 튐·순간이동(구르기 소리)·치유는 따로 소리가 없다
  const BLAST_SOUND: Partial<Record<Blast['kind'], SoundName>> = { slam: 'skel_attack', frost: 'shout', fire: 'blast', thunder: 'blast', nova: 'blast', heal: 'potion', trap: 'equip_weapon', slash: 'blast', rain: 'shoot', curse: 'shout' };
  const blastSound = (b: Blast) => BLAST_SOUND[b.kind] ?? (b.kind === 'ice' && b.r ? 'shout' : undefined); // 얼음은 덧벼림 폭발(반경 있음)만 — 얼어붙은 적마다 울리지 않게
  for (const b of w.blasts) if (!prev.blasts.has(b.id) && blastSound(b)) at(blastSound(b)!, b.x, b.z);
  const edgeHit = w.edgeHits.find((h) => !prev.edgeHits.has(h.id)); // 벼림: 여러 적이 맞아도 프레임에 하나
  if (edgeHit) at(edgeHit.kind === 'frost' ? 'shout' : 'fireball', edgeHit.x, edgeHit.z);
  for (const z of w.zones) if (z.owner < 0 && !prev.zones.has(z.id)) at('fireball', z.x, z.z); // 불기둥 예고
  if (w.allies.length > prev.allies) at('summon'); // 해골 병사
  if (w.entities.length > prev.ents.length) at('summon', w.entities[w.entities.length - 1].x, w.entities[w.entities.length - 1].z);
  if (w.potions !== prev.potions) at('potion');
  if (w.gold > prev.gold) at('gold');
  if (w.bag.length > prev.bag) at('loot');
  if (w.items.some((i) => !prev.items.has(i.id))) at('loot', w.items[w.items.length - 1].x, w.items[w.items.length - 1].z);
  // 전설·세트 장비가 떨어지거나(바닥) 보관함으로 바로 들어옴(보스)
  const legend = w.items.find((i) => !prev.items.has(i.id) && uniqueOf({ affixes: i.affixes ?? [] })) ?? (w.bag.length > prev.bag && uniqueOf(w.bag[w.bag.length - 1]) && w.entities[0]);
  if (legend) at('level_up', legend.x, legend.z);
  // 장착이 바뀜(단계나 옵션)
  const old = JSON.parse(prev.mods) as World['mods'];
  const changed = (s: Slot) => w.gear[s] !== prev.gear[s] || JSON.stringify(w.mods[s]) !== JSON.stringify(old[s]);
  if (changed('weapon')) at('equip_weapon');
  if (changed('armor') || changed('helm') || changed('boots')) at('equip_armor'); // 방어구는 한 번만
  if (w.level > prev.level) at('level_up');
  if (w.cleaves > prev.cleaves || w.edgeSlashes > prev.edgeSlashes) at('cleave');
  if (w.dashes > prev.dashes) at('dash');
  if (w.shouts > prev.shouts) at('shout');
  if (w.chests.filter((c) => c.open).length > prev.opened) at('chest');
  return out;
}
