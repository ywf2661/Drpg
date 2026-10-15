// 진행 저장: 층에 들어갈 때의 상태(층·물약·장비·레벨). localStorage는 손상·조작될 수 있어 읽을 때 검증한다.
import { FLOORS } from './sim/dungeon';
import { POTION, type Gear } from './sim/world';

export type Run = { floor: number; potions: number; gear: Gear; level: number; xp: number };
const VERSION = 1;
const KEY = 'drpg-save';

export function encodeSave(r: Run): string {
  return JSON.stringify({ v: VERSION, floor: r.floor, potions: r.potions, gear: r.gear, level: r.level, xp: r.xp });
}

const int = (v: unknown, lo: number, hi: number) => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;

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
  return { floor: d.floor as number, potions: d.potions as number, gear: { weapon: g.weapon as number, armor: g.armor as number }, level: d.level as number, xp: d.xp as number };
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
