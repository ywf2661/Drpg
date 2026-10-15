// 프레임 사이 world 변화 → 효과음 이벤트. sim을 건드리지 않고 상태 차이만 본다.
import type { Entity, Gear, World } from '../sim/world';

export type SoundName =
  | 'swing' | 'hero_hit' | 'hero_die'
  | 'skel_attack' | 'skel_hit' | 'skel_die'
  | 'boss_attack' | 'boss_hit' | 'boss_die'
  | 'potion' | 'loot' | 'equip_weapon' | 'equip_armor';
export type SoundEvent = { name: SoundName; x: number; z: number };
export type Snapshot = {
  world: World;
  ents: { hp: number; state: Entity['state']; attackT: number }[];
  potions: number;
  gear: Gear;
  items: Set<number>;
};

export function snapshot(w: World): Snapshot {
  return {
    world: w,
    ents: w.entities.map((e) => ({ hp: e.hp, state: e.state, attackT: e.attackT })),
    potions: w.potions,
    gear: { ...w.gear },
    items: new Set(w.items.map((i) => i.id)),
  };
}

const VOICE = { hero: 'hero', minion: 'skel', warrior: 'skel', boss: 'boss' } as const;

export function soundEvents(prev: Snapshot, w: World): SoundEvent[] {
  if (prev.world !== w) return []; // 새 층: 비교하지 않는다
  const out: SoundEvent[] = [];
  const hero = w.entities[0];
  const at = (name: SoundName, x = hero.x, z = hero.z) => out.push({ name, x, z });
  w.entities.forEach((e, i) => {
    const p = prev.ents[i];
    const v = VOICE[e.kind];
    const swung = e.state === 'attack' && (p.state !== 'attack' || e.attackT < p.attackT);
    if (swung) at(v === 'hero' ? 'swing' : `${v}_attack`, e.x, e.z);
    if (e.state === 'dead' && p.state !== 'dead') at(`${v}_die`, e.x, e.z);
    else if (e.hp < p.hp) at(`${v}_hit`, e.x, e.z);
  });
  if (w.potions !== prev.potions) at('potion');
  if (w.items.some((i) => !prev.items.has(i.id))) at('loot', w.items[w.items.length - 1].x, w.items[w.items.length - 1].z);
  if (w.gear.weapon > prev.gear.weapon) at('equip_weapon');
  if (w.gear.armor > prev.gear.armor) at('equip_armor');
  return out;
}
