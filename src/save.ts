// 진행 저장: 층에 들어갈 때의 상태(층·물약·장비·레벨). localStorage는 손상·조작될 수 있어 읽을 때 검증한다.
import { FLOORS } from './sim/dungeon';
import { sellPrice } from './shop';
import { AFFIXES, bagFits, bagSpot, POTION, RANK_MAX, type Affix, type AffixKind, type BagItem, type Gear, type SkillName } from './sim/world';

export type Stats = { time: number; kills: number; deaths: number }; // 이번 판 기록(초, 처치, 사망)
export type Mods = { weapon: Affix[]; armor: Affix[] };
export type Ranks = Record<SkillName, number>;
export type Run = { floor: number; potions: number; gear: Gear; mods: Mods; ranks: Ranks; points: number; bag: BagItem[]; autoEquip: boolean; level: number; xp: number; gold: number; cycle: number; stats: Stats };
const VERSION = 1;
const KEY = 'drpg-save';

export function encodeSave(r: Run): string {
  return JSON.stringify({ v: VERSION, floor: r.floor, potions: r.potions, gear: r.gear, level: r.level, xp: r.xp, gold: r.gold, cycle: r.cycle, mods: r.mods, ranks: r.ranks, points: r.points, bag: r.bag, autoEquip: r.autoEquip, stats: r.stats });
}

const int = (v: unknown, lo: number, hi: number) => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;

// 한 부위의 옵션 목록: 최대 2개, 서로 다른 종류, 그 부위의 옵션, 값은 범위 안. 아니면 null
function affixes(v: unknown, slot: 'weapon' | 'armor'): Affix[] | null {
  if (!Array.isArray(v) || v.length > 2) return null;
  const out: Affix[] = [];
  for (const a of v) {
    const def = a && AFFIXES[a.kind as AffixKind];
    if (!def || def.slot !== slot || !int(a.value, def.lo, def.hi) || out.some((o) => o.kind === a.kind)) return null;
    out.push({ kind: a.kind, value: a.value });
  }
  return out;
}

// 보관함: 부위, 단계, 옵션, 자리(격자 안·겹치지 않음)를 확인. 아니면 null.
// 격자가 생기기 전 저장(자리 없음)은 빈 자리에 차례로 놓고, 안 들어가는 장비는 판 값(refund)으로 돌려준다
function bagItems(v: unknown): { bag: BagItem[]; refund: number } | null {
  if (!Array.isArray(v) || v.length > 100) return null;
  const bag: BagItem[] = [];
  let refund = 0;
  for (const it of v) {
    if (!it || (it.kind !== 'weapon' && it.kind !== 'armor') || !int(it.tier, 1, 4)) return null;
    const list = affixes(it.affixes, it.kind);
    if (!list) return null;
    const g = { kind: it.kind as 'weapon' | 'armor', tier: it.tier as number, affixes: list };
    const old = it.x === undefined && it.y === undefined;
    const at = old ? bagSpot(bag, g) : bagFits(bag, g, it.x, it.y) ? [it.x as number, it.y as number] : null;
    if (at) bag.push({ ...g, x: at[0], y: at[1] });
    else if (old) refund += sellPrice(g);
    else return null;
  }
  return { bag, refund };
}

export function decodeSave(text: string | null): Run | null {
  if (!text) return null;
  let d: Record<string, unknown>;
  try {
    d = JSON.parse(text);
  } catch {
    return null;
  }
  if (!d || typeof d !== 'object' || Array.isArray(d) || d.v !== VERSION) return null;
  const g = d.gear as Record<string, unknown> | null;
  if (!g || typeof g !== 'object' || !int(g.weapon, 1, 4) || !int(g.armor, 1, 4)) return null;
  if (!int(d.floor, 1, FLOORS) || !int(d.potions, 0, POTION.max) || !int(d.level, 1, 99) || !int(d.xp, 0, 1e6)) return null;
  // 금화·기록은 나중에 생긴 항목이라 없으면 0. 있는데 이상하면 저장 전체를 버린다
  const gold = d.gold ?? 0;
  const cycle = d.cycle ?? 0;
  if (!int(gold, 0, 1e7) || !int(cycle, 0, 1000)) return null;
  const m = (d.mods ?? { weapon: [], armor: [] }) as Record<string, unknown>;
  const weapon = m && typeof m === 'object' ? affixes(m.weapon, 'weapon') : null;
  const armor = m && typeof m === 'object' ? affixes(m.armor, 'armor') : null;
  if (!weapon || !armor) return null;
  // 스킬 단계·포인트(나중에 생긴 항목: 없으면 1단계·0)
  const r = (d.ranks ?? { cleave: 1, dash: 1, shout: 1, throw: 1 }) as Record<string, unknown>;
  const names: SkillName[] = ['cleave', 'dash', 'shout', 'throw'];
  const points = d.points ?? 0;
  if (!r || typeof r !== 'object' || !names.every((n) => int(r[n], 1, RANK_MAX)) || !int(points, 0, 1000)) return null;
  // 보관함(나중에 생긴 항목: 없으면 빈 칸·자동 장착)
  const bagged = bagItems(d.bag ?? []);
  const autoEquip = d.autoEquip ?? true;
  if (!bagged || typeof autoEquip !== 'boolean') return null;
  const st = (d.stats ?? { time: 0, kills: 0, deaths: 0 }) as Record<string, unknown>;
  const time = st.time;
  if (typeof time !== 'number' || !(time >= 0 && time < 1e7) || !int(st.kills, 0, 1e6) || !int(st.deaths, 0, 1e6)) return null;
  return {
    floor: d.floor as number,
    potions: d.potions as number,
    gear: { weapon: g.weapon as number, armor: g.armor as number },
    level: d.level as number,
    xp: d.xp as number,
    gold: (gold as number) + bagged.refund,
    cycle: cycle as number,
    mods: { weapon, armor },
    ranks: { cleave: r.cleave as number, dash: r.dash as number, shout: r.shout as number, throw: r.throw as number },
    points: points as number,
    bag: bagged.bag,
    autoEquip,
    stats: { time, kills: st.kills as number, deaths: st.deaths as number },
  };
}

// 초 → "m:ss" 또는 "h:mm:ss"
export function formatTime(sec: number): string {
  const t = Math.floor(sec);
  const [h, m, s] = [Math.floor(t / 3600), Math.floor((t % 3600) / 60), t % 60];
  const two = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`;
}

// 저장소 접근은 사생활 보호 모드 등에서 막힐 수 있다 — 실패해도 게임은 계속
export function loadRun(): Run | null {
  try {
    return decodeSave(localStorage.getItem(KEY));
  } catch {
    return null;
  }
}

export function saveRun(r: Run) {
  try {
    localStorage.setItem(KEY, encodeSave(r));
  } catch {
    // 저장 못 해도 이번 판은 계속된다
  }
}

export function clearRun() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // 무시
  }
}
