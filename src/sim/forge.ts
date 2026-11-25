// 담금질(대장장이): 장비에 ★을 올리고 ★3·★5에서 깨어남 하나를 고른다. 설계: docs/superpowers/specs/2026-11-25-act2-loot-growth-design.md 4절.
// ★·깨어남은 장비의 옵션 줄이라(rules.ts Affix.star·awake) 팔기·창고·저장이 그대로 따라간다
import { AWAKEN, FORGE, type Affix, type Awake, type HeroClass, type Slot, type World } from './rules';
import { runeRand, uniqueOf, wear, type RuneTarget } from './core';

export const starOf = (list: Affix[]) => list.find((a) => a.star)?.star ?? 0;
// ★n → ★n+1 값
export const forgeCost = (star: number) => ({ ore: FORGE.ore[star], gold: FORGE.gold[star], hearts: star === FORGE.max - 1 ? 1 : 0 });
const pending = (list: Affix[]) => list.find((a) => a.kind === 'awake' && !a.u && !a.awake);
const same = (a: Affix, o: Awake) => (o.u ? a.u === o.u : a.kind === o.kind && a.value === o.value);
// 깨어남 줄 ↔ 풀 항목
export const awakeOf = (a: Affix, slot: Slot): Awake | undefined => (a.awake ? AWAKEN.find((o) => o.slot === slot && same(a, o)) : undefined);

function mulberry(t: number) {
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
// 기다리는 깨어남의 후보 셋(시드로 정해진다: 다시 열어도·새로고침해도 같다). 없으면 null
export function awakeChoices(list: Affix[], slot: Slot, cls: HeroClass): Awake[] | null {
  const p = pending(list);
  if (!p) return null;
  const own = uniqueOf({ affixes: list });
  const pool = AWAKEN.filter((o) => o.slot === slot && (!o.cls || o.cls === cls) && (!o.u || o.u !== own) && !list.some((a) => a.awake && same(a, o)));
  let seed = p.value;
  const out: Awake[] = [];
  while (out.length < FORGE.choices && pool.length) out.push(pool.splice(Math.floor(mulberry((seed = (seed + 0x6d2b79f5) | 0)) * pool.length), 1)[0]);
  return out;
}

const listOf = (w: World, t: RuneTarget) => (typeof t === 'number' ? w.bag[t]?.affixes : w.mods[t]);
const slotOf = (w: World, t: RuneTarget): Slot => (typeof t === 'number' ? w.bag[t].kind : t);
function put(w: World, t: RuneTarget, list: Affix[]) {
  if (typeof t === 'number') w.bag[t] = { ...w.bag[t], affixes: list };
  else wear(w, { kind: t, tier: w.gear[t], affixes: list }); // 투구 ★이면 최대 체력 비율을 맞춘다
}

// 담금질 한 번: 값을 내고 ★ + 1. ★3·★5가 되면 깨어남이 기다린다(고르기 전엔 더 못 한다)
export function temper(w: World, t: RuneTarget): boolean {
  const list = listOf(w, t);
  if (!list || w.entities[0].state === 'dead') return false;
  const star = starOf(list);
  const cost = forgeCost(star);
  if (star >= FORGE.max || pending(list) || w.ore < cost.ore || w.gold < cost.gold || w.hearts < cost.hearts) return false;
  Object.assign(w, { ore: w.ore - cost.ore, gold: w.gold - cost.gold, hearts: w.hearts - cost.hearts });
  const [kind, up] = FORGE.up[slotOf(w, t)];
  const next: Affix[] = [...list.filter((a) => !a.star), { kind, value: up * (star + 1), star: star + 1 }];
  if (FORGE.awakeAt.includes(star + 1)) next.push({ kind: 'awake', value: Math.floor(runeRand(w) * 0x7fffffff) });
  put(w, t, next);
  return true;
}

// 기다리는 깨어남에서 k번째 후보를 고른다
export function awaken(w: World, t: RuneTarget, k: number): boolean {
  const list = listOf(w, t);
  const pick = list && awakeChoices(list, slotOf(w, t), w.cls)?.[k];
  if (!pick) return false;
  const line: Affix = pick.u ? { kind: 'awake', value: 0, u: pick.u, awake: true } : { kind: pick.kind!, value: pick.value!, awake: true };
  put(w, t, list.map((a) => (a === pending(list) ? line : a)));
  return true;
}
