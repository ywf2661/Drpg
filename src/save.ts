// 진행 저장: 층에 들어갈 때의 상태(층·물약·장비·레벨). localStorage는 손상·조작될 수 있어 읽을 때 검증한다.
import { FLOORS } from './sim/dungeon';
import { sellPrice } from './shop';
import type { Side } from './sim/wilds';
import { runeAffix, type Rune, LAND_LIST, STORY, TREES, type Land, UNIQUES, type UniqueId, AFFIXES, bagFits, bagSpot, isPassive, KEYS, newSkills, POTION, RANK_MAX, SKILLS, SLOTS, type Affix, type AffixKind, type BagItem, type Gear, type HeroClass, type SkillId, type Slot, type World } from './sim/world';

export type Stats = { time: number; kills: number; deaths: number }; // 이번 판 기록(초, 처치, 사망)
export type Mods = Record<Slot, Affix[]>;
export type Ranks = World['ranks'];
export type Keys = World['keys'];
export type Run = { name: string; pity: number; cls: HeroClass; floor: number; potions: number; gear: Gear; mods: Mods; ranks: Ranks; points: number; keys: Keys; bag: BagItem[]; autoEquip: boolean; level: number; xp: number; gold: number; cycle: number; stats: Stats; land: Land; from: Side; stage: number; marks: number; news: boolean; took: boolean; runes: World['runes']; beat: number; marksBy: number[]; relics: number; relicMiss: number[] }; // relics·relicMiss: 무너진 성소의 성물(비트 0~15)·지역마다 놓친 횟수(0~2) // runes: 룬 주머니, beat·marksBy: 2회차부터 깬 지역 보스(비트 0~15)·지역마다 의뢰 진행 // news: 순찰대장에게 아직 안 들은 이야기가 있다, took: 지금 단계 의뢰의 부탁을 받았다. land·from: 이 구역의 지역과 들어온 가장자리(야영지면 floor 0), stage: 이야기 단계(0~3), marks: 지역 의뢰 진행(비트 0~7)
const VERSION = 2; // 1 = 야영지 이전(읽으면 야영지·이야기 1단계로)
const KEY = 'drpg-save'; // 슬롯 이전의 한 칸 저장. 지금은 KEY-0 ~ KEY-2
export const SLOT_COUNT = 3;
export const NAME_MAX = 12;
let slot = 0; // 지금 판이 저장되는 슬롯

export function encodeSave(r: Run): string {
  return JSON.stringify({ v: VERSION, name: r.name, pity: r.pity, cls: r.cls, floor: r.floor, potions: r.potions, gear: r.gear, level: r.level, xp: r.xp, gold: r.gold, cycle: r.cycle, mods: r.mods, ranks: r.ranks, points: r.points, keys: r.keys, bag: r.bag, autoEquip: r.autoEquip, stats: r.stats, land: r.land, from: r.from, stage: r.stage, marks: r.marks, news: r.news, took: r.took, runes: r.runes, beat: r.beat, marksBy: r.marksBy, relics: r.relics, relicMiss: r.relicMiss });
}

const int = (v: unknown, lo: number, hi: number) => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;

// 한 부위의 옵션 목록: 최대 2개, 서로 다른 종류, 그 부위의 옵션, 값은 범위 안. 스킬 옵션은 그 직업의 스킬·탭 0~2.
// 고유 장비는 맨 앞의 표식(표에 있고, 부위·직업이 맞음) + 최대 3개(고정 1 + 무작위 2). 아니면 null
// 소켓(하나, 1~3)과 꽂힌 룬(아는 룬, 이 직업 스킬, 소켓 수 이하)은 따로 확인하고 맨 뒤에 붙인다(룬 값은 표에서 다시 만든다)
function affixes(all: unknown, slot: Slot, cls: HeroClass): Affix[] | null {
  if (!Array.isArray(all)) return null;
  const sock = all.filter((a) => a?.kind === 'socket');
  const runes = all.filter((a) => a?.r !== undefined).map((a) => (typeof a.r === 'string' ? runeAffix(a.r) : null));
  if (sock.length > 1 || (sock[0] && !int(sock[0].value, 1, 3)) || runes.length > (sock[0]?.value ?? 0)) return null;
  if (runes.some((a) => !a || (a.skill && SKILLS[a.skill].cls !== cls))) return null;
  const v = all.filter((a) => a?.kind !== 'socket' && a?.r === undefined);
  const tail: Affix[] = [...(sock[0] ? [{ kind: 'socket' as const, value: sock[0].value as number }] : []), ...(runes as Affix[])];
  const out = plain(v, slot, cls);
  return out && [...out, ...tail];
}
// 소켓·룬을 뺀 원래 옵션
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 검증 전의 저장 데이터
function plain(v: any[], slot: Slot, cls: HeroClass): Affix[] | null {
  const def0 = v[0]?.kind === 'unique' ? UNIQUES[v[0].u as UniqueId] : undefined;
  if (v[0]?.kind === 'unique' && (!def0 || !Object.hasOwn(UNIQUES, v[0].u) || def0.slot !== slot || (def0.cls && def0.cls !== cls) || v[0].value !== 0)) return null;
  if (v.length > (def0 ? 4 : 2)) return null;
  const out: Affix[] = def0 ? [{ kind: 'unique', value: 0, u: v[0].u }] : [];
  for (const a of def0 ? v.slice(1) : v) {
    const def = a && AFFIXES[a.kind as AffixKind];
    if (!def || !def.slots.includes(slot) || !int(a.value, def.lo, def.hi) || out.some((o) => o.kind === a.kind)) return null;
    if (a.kind === 'skill' && SKILLS[a.skill as SkillId]?.cls !== cls) return null;
    if (a.kind === 'tab' && !int(a.tab, 0, TREES[cls].length - 1)) return null;
    if (a.kind === 'unique' || a.kind === 'socket' || a.kind === 'keyCd') return null;
    out.push({ kind: a.kind, value: a.value, ...(a.kind === 'skill' && { skill: a.skill }), ...(a.kind === 'tab' && { tab: a.tab }) });
  }
  return out;
}

// 보관함: 부위, 단계, 옵션, 자리(격자 안·겹치지 않음)를 확인. 아니면 null.
// 격자가 생기기 전 저장(자리 없음)은 빈 자리에 차례로 놓고, 안 들어가는 장비는 판 값(refund)으로 돌려준다
function bagItems(v: unknown, cls: HeroClass): { bag: BagItem[]; refund: number } | null {
  if (!Array.isArray(v) || v.length > 100) return null;
  const bag: BagItem[] = [];
  let refund = 0;
  for (const it of v) {
    if (!it || !SLOTS.includes(it.kind) || !int(it.tier, 1, 4)) return null;
    const list = affixes(it.affixes, it.kind, cls);
    if (!list) return null;
    const g = { kind: it.kind as Slot, tier: it.tier as number, affixes: list };
    const old = it.x === undefined && it.y === undefined;
    const at = old ? bagSpot(bag, g) : bagFits(bag, g, it.x, it.y) ? [it.x as number, it.y as number] : null;
    if (at) bag.push({ ...g, x: at[0], y: at[1] });
    else if (old) refund += sellPrice(g);
    else return null;
  }
  return { bag, refund };
}

// 스킬 트리: 단계(그 직업의 스킬, 1~RANK_MAX)·포인트·칸(배운 액티브, 겹치지 않게). 아니면 null.
// 트리 이전 저장(칸이 없음)은 새 판의 스킬로 돌리고 레벨만큼의 포인트(레벨 − 1)를 돌려준다
function skillTree(d: Record<string, unknown>, cls: HeroClass): Pick<Run, 'ranks' | 'points' | 'keys'> | null {
  if (d.keys === undefined) return { ...newSkills(cls), points: (d.level as number) - 1 };
  const r = d.ranks as Record<string, unknown>;
  const k = d.keys as Record<string, unknown>;
  if (!r || typeof r !== 'object' || !k || typeof k !== 'object' || !int(d.points, 0, 1000)) return null;
  const ranks: Ranks = {};
  for (const [id, n] of Object.entries(r)) {
    if (SKILLS[id as SkillId]?.cls !== cls || !int(n, 1, RANK_MAX)) return null;
    ranks[id as SkillId] = n as number;
  }
  const keys = Object.fromEntries(KEYS.map((key) => [key, k[key] ?? null])) as Keys;
  const used = KEYS.map((key) => keys[key]).filter((id): id is SkillId => id !== null);
  if (used.some((id) => !ranks[id] || isPassive(id)) || new Set(used).size !== used.length) return null;
  return { ranks, points: d.points as number, keys };
}

export function decodeSave(text: string | null): Run | null {
  if (!text) return null;
  let d: Record<string, unknown>;
  try {
    // 발도를 고쳐 짜며 바뀐 스킬 이름(단계·칸·장비 옵션 어디에 있든): 납도 → 스쳐 베기, 검의 기억 → 칼의 여운
    d = JSON.parse(text.replace(/"sheathe"/g, '"graze"').replace(/"memory"/g, '"echo"'));
  } catch {
    return null;
  }
  if (!d || typeof d !== 'object' || Array.isArray(d) || (d.v !== VERSION && d.v !== 1)) return null;
  const old = d.v === 1; // 야영지 이전 저장: 캐릭터·장비·금화·회차는 그대로, 하던 구역은 버리고 야영지·이야기 1단계로
  // 투구·신발은 나중에 생긴 부위라 없으면 1단계·옵션 없음
  const g0 = d.gear as Record<string, unknown> | null;
  const g = g0 && typeof g0 === 'object' ? ({ helm: 1, boots: 1, ...g0 } as Record<string, unknown>) : null;
  if (!g || !SLOTS.every((s) => int(g[s], 1, 4))) return null;
  if (!int(d.floor, d.land === 'camp' ? 0 : 1, FLOORS) || !int(d.potions, 0, POTION.max) || !int(d.level, 1, 99) || !int(d.xp, 0, 1e6)) return null;
  // 금화·기록은 나중에 생긴 항목이라 없으면 0. 있는데 이상하면 저장 전체를 버린다
  const gold = d.gold ?? 0;
  const cycle = d.cycle ?? 0;
  if (!int(gold, 0, 1e7) || !int(cycle, 0, 1000)) return null;
  // 직업(나중에 생긴 항목: 없으면 기사). 스킬 옵션 검증에 필요해 먼저
  const cls = d.cls ?? 'knight';
  if (cls !== 'knight' && cls !== 'wizard' && cls !== 'ranger' && cls !== 'necromancer') return null;
  const m0 = d.mods ?? { weapon: [], armor: [] };
  const m = m0 && typeof m0 === 'object' ? ({ helm: [], boots: [], ...m0 } as Record<string, unknown>) : null;
  const mods = m && Object.fromEntries(SLOTS.map((s) => [s, affixes(m[s], s, cls)]));
  if (!mods || !SLOTS.every((s) => mods[s])) return null;
  // 보관함(나중에 생긴 항목: 없으면 빈 칸·자동 장착)
  const bagged = bagItems(d.bag ?? [], cls);
  const pity = d.pity ?? 0; // 나중에 생긴 항목: 없으면 0
  if (typeof pity !== 'number' || !(pity >= 0 && pity <= 1)) return null;
  const autoEquip = d.autoEquip ?? true;
  if (!bagged || typeof autoEquip !== 'boolean') return null;
  const skills = skillTree(d, cls);
  if (!skills) return null;
  // 지역·들어온 가장자리(나중에 생긴 항목: 없으면 미궁·서쪽 — 그때는 미궁만 저장됐다)
  const land = (d.land ?? 'dungeon') as Land;
  const from = (d.from ?? 'w') as Side;
  if (!LAND_LIST.includes(land) || !['n', 'e', 's', 'w'].includes(from)) return null;
  const stage = old ? 0 : d.stage;
  if (!int(stage, 0, STORY.length - 1)) return null;
  const marks = old ? 0 : (d.marks ?? 0); // 나중에 생긴 항목
  if (!int(marks, 0, 7)) return null;
  const news = old ? false : (d.news ?? false); // 나중에 생긴 항목
  const took = old ? false : (d.took ?? (marks as number) > 0); // 의뢰를 하던 저장은 부탁을 받은 것으로
  // 룬(나중에 생긴 항목): 주머니(아는 룬·이 직업 스킬 → 개수 1~999), 2회차 진행
  const r0 = d.runes ?? {};
  if (!r0 || typeof r0 !== 'object' || Array.isArray(r0)) return null;
  const runes: World['runes'] = {};
  for (const [r, n] of Object.entries(r0)) {
    const a = runeAffix(r as Rune);
    if (!a || (a.skill && SKILLS[a.skill].cls !== cls) || !int(n, 1, 999)) return null;
    runes[r] = n as number;
  }
  const beat = d.beat ?? 0;
  const marksBy = d.marksBy ?? [0, 0, 0, 0];
  if (!int(beat, 0, 15) || !Array.isArray(marksBy) || marksBy.length !== STORY.length || !marksBy.every((n) => int(n, 0, 7))) return null;
  const relics = d.relics ?? 0; // 성물 이전 저장은 0개
  const relicMiss = d.relicMiss ?? [0, 0, 0, 0];
  if (!int(relics, 0, 15) || !Array.isArray(relicMiss) || relicMiss.length !== STORY.length || !relicMiss.every((n) => int(n, 0, 2))) return null;
  if (typeof news !== 'boolean' || typeof took !== 'boolean') return null;
  const camp = old || land === 'camp';
  const name = d.name ?? '모험가'; // 아이디(나중에 생긴 항목)
  if (typeof name !== 'string' || !name.trim() || name.length > NAME_MAX) return null;
  const st = (d.stats ?? { time: 0, kills: 0, deaths: 0 }) as Record<string, unknown>;
  const time = st.time;
  if (typeof time !== 'number' || !(time >= 0 && time < 1e7) || !int(st.kills, 0, 1e6) || !int(st.deaths, 0, 1e6)) return null;
  return {
    name,
    pity,
    cls,
    floor: camp ? 0 : (d.floor as number),
    potions: d.potions as number,
    gear: Object.fromEntries(SLOTS.map((s) => [s, g[s]])) as Gear,
    level: d.level as number,
    xp: d.xp as number,
    gold: (gold as number) + bagged.refund,
    cycle: cycle as number,
    mods: mods as Mods,
    ...skills,
    bag: bagged.bag,
    autoEquip,
    stats: { time, kills: st.kills as number, deaths: st.deaths as number },
    land: camp ? 'camp' : land,
    from,
    stage: stage as number,
    marks: marks as number,
    news,
    took,
    runes,
    beat: beat as number,
    marksBy: [...(marksBy as number[])],
    relics: relics as number,
    relicMiss: [...(relicMiss as number[])],
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
// 슬롯 셋을 읽는다. 슬롯 이전의 저장은 빈 첫 슬롯으로 옮긴다
export function loadSlots(): (Run | null)[] {
  try {
    const old = localStorage.getItem(KEY);
    if (old !== null) {
      if (localStorage.getItem(`${KEY}-0`) === null) localStorage.setItem(`${KEY}-0`, old);
      localStorage.removeItem(KEY);
    }
    return Array.from({ length: SLOT_COUNT }, (_, i) => decodeSave(localStorage.getItem(`${KEY}-${i}`)));
  } catch {
    return Array(SLOT_COUNT).fill(null);
  }
}

export function useSlot(n: number) {
  slot = n;
}

export function saveRun(r: Run) {
  try {
    localStorage.setItem(`${KEY}-${slot}`, encodeSave(r));
  } catch {
    // 저장 못 해도 이번 판은 계속된다
  }
}
