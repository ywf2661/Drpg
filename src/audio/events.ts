// 프레임 사이 world 변화 → 효과음 이벤트. sim을 건드리지 않고 상태 차이만 본다.
import type { Blast, Entity, Gear, Slot, World } from '../sim/world';

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
  dashes: number;
  shouts: number;
  opened: number; // 열린 상자 수
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
    dashes: w.dashes,
    shouts: w.shouts,
    opened: w.chests.filter((c) => c.open).length,
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
    const ranged = e.kind === 'archer' || e.kind === 'mage' || (e.kind === 'hero' && w.cls === 'wizard'); // 원거리는 쏠 때 소리
    if (swung && !ranged) at(v === 'hero' ? 'swing' : `${v}_attack`, e.x, e.z);
    if (e.phase === 'windup' && p.phase !== 'windup') at('boss_attack', e.x, e.z); // 돌진 예고
    if (e.phase === 'roll' && p.phase !== 'roll') at(w.cls === 'wizard' && e.kind === 'hero' ? 'summon' : 'dash', e.x, e.z); // 구르기 / 순간이동
    if (e.state === 'dead' && p.state !== 'dead') at(`${v}_die`, e.x, e.z);
    else if (e.hp < p.hp && e.maxHp === p.maxHp) at(`${v}_hit`, e.x, e.z); // 최대 체력이 바뀐 것(갑옷 교체)은 맞은 것이 아니다
  });
  for (const s of w.shots) if (!prev.shots.has(s.id)) at(s.kind === 'fire' || s.kind === 'fireball' ? 'fireball' : s.kind === 'axe' ? 'throw' : 'shoot', s.x, s.z);
  // 내려찍기가 떨어짐 / 서리 고리 / 폭발·벼락. 얼음·번개 튐·순간이동(구르기 소리)·치유는 따로 소리가 없다
  const BLAST_SOUND: Partial<Record<Blast['kind'], SoundName>> = { slam: 'skel_attack', frost: 'shout', fire: 'blast', thunder: 'blast', nova: 'blast', heal: 'potion' };
  for (const b of w.blasts) if (!prev.blasts.has(b.id) && BLAST_SOUND[b.kind]) at(BLAST_SOUND[b.kind]!, b.x, b.z);
  for (const z of w.zones) if (z.owner < 0 && !prev.zones.has(z.id)) at('fireball', z.x, z.z); // 불기둥 예고
  if (w.entities.length > prev.ents.length) at('summon', w.entities[w.entities.length - 1].x, w.entities[w.entities.length - 1].z);
  if (w.potions !== prev.potions) at('potion');
  if (w.gold > prev.gold) at('gold');
  if (w.bag.length > prev.bag) at('loot');
  if (w.items.some((i) => !prev.items.has(i.id))) at('loot', w.items[w.items.length - 1].x, w.items[w.items.length - 1].z);
  // 장착이 바뀜(단계나 옵션)
  const old = JSON.parse(prev.mods) as World['mods'];
  const changed = (s: Slot) => w.gear[s] !== prev.gear[s] || JSON.stringify(w.mods[s]) !== JSON.stringify(old[s]);
  if (changed('weapon')) at('equip_weapon');
  if (changed('armor') || changed('helm') || changed('boots')) at('equip_armor'); // 방어구는 한 번만
  if (w.level > prev.level) at('level_up');
  if (w.cleaves > prev.cleaves) at('cleave');
  if (w.dashes > prev.dashes) at('dash');
  if (w.shouts > prev.shouts) at('shout');
  if (w.chests.filter((c) => c.open).length > prev.opened) at('chest');
  return out;
}
