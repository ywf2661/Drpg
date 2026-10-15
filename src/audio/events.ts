// 프레임 사이 world 변화 → 효과음 이벤트. sim을 건드리지 않고 상태 차이만 본다.
import type { Entity, Gear, World } from '../sim/world';

export type SoundName =
  | 'swing' | 'hero_hit' | 'hero_die'
  | 'skel_attack' | 'skel_hit' | 'skel_die'
  | 'boss_attack' | 'boss_hit' | 'boss_die'
  | 'gold' | 'shoot' | 'fireball' | 'blast' | 'cleave' | 'chest' | 'potion' | 'loot' | 'equip_weapon' | 'equip_armor' | 'level_up';
export type SoundEvent = { name: SoundName; x: number; z: number };
export type Snapshot = {
  world: World;
  ents: { hp: number; state: Entity['state']; attackT: number; phase: Entity['phase'] }[];
  potions: number;
  gold: number;
  gear: Gear;
  items: Set<number>;
  shots: Set<number>;
  blasts: Set<number>;
  level: number;
  cleaves: number;
  opened: number; // 열린 상자 수
};

export function snapshot(w: World): Snapshot {
  return {
    world: w,
    ents: w.entities.map((e) => ({ hp: e.hp, state: e.state, attackT: e.attackT, phase: e.phase })),
    potions: w.potions,
    gold: w.gold,
    gear: { ...w.gear },
    items: new Set(w.items.map((i) => i.id)),
    shots: new Set(w.shots.map((s) => s.id)),
    blasts: new Set(w.blasts.map((b) => b.id)),
    level: w.level,
    cleaves: w.cleaves,
    opened: w.chests.filter((c) => c.open).length,
  };
}

const VOICE = { hero: 'hero', minion: 'skel', warrior: 'skel', archer: 'skel', mage: 'skel', boss: 'boss' } as const;

export function soundEvents(prev: Snapshot, w: World): SoundEvent[] {
  if (prev.world !== w) return []; // 새 층: 비교하지 않는다
  const out: SoundEvent[] = [];
  const hero = w.entities[0];
  const at = (name: SoundName, x = hero.x, z = hero.z) => out.push({ name, x, z });
  w.entities.forEach((e, i) => {
    const p = prev.ents[i];
    const v = VOICE[e.kind];
    const swung = e.state === 'attack' && (p.state !== 'attack' || e.attackT < p.attackT);
    const ranged = e.kind === 'archer' || e.kind === 'mage'; // 원거리는 쏠 때 소리
    if (swung && !ranged) at(v === 'hero' ? 'swing' : `${v}_attack`, e.x, e.z);
    if (e.phase === 'windup' && p.phase !== 'windup') at('boss_attack', e.x, e.z); // 돌진 예고
    if (e.state === 'dead' && p.state !== 'dead') at(`${v}_die`, e.x, e.z);
    else if (e.hp < p.hp) at(`${v}_hit`, e.x, e.z);
  });
  for (const s of w.shots) if (!prev.shots.has(s.id)) at(s.kind === 'fire' ? 'fireball' : 'shoot', s.x, s.z);
  for (const b of w.blasts) if (!prev.blasts.has(b.id)) at('blast', b.x, b.z);
  if (w.potions !== prev.potions) at('potion');
  if (w.gold > prev.gold) at('gold');
  if (w.items.some((i) => !prev.items.has(i.id))) at('loot', w.items[w.items.length - 1].x, w.items[w.items.length - 1].z);
  if (w.gear.weapon > prev.gear.weapon) at('equip_weapon');
  if (w.gear.armor > prev.gear.armor) at('equip_armor');
  if (w.level > prev.level) at('level_up');
  if (w.cleaves > prev.cleaves) at('cleave');
  if (w.chests.filter((c) => c.open).length > prev.opened) at('chest');
  return out;
}
