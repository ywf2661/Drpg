// 벼림 화면의 순수 판단(three·DOM 없음): 강화 색, 마지막 충전 깜빡임, 칸에 띄울 남은 충전, 횃불 색 섞기
import type { SkillId, SkillName, World } from '../sim/world';

export const EDGE_COLOR = { flame: '#ffb070', frost: '#a8e0ff', both: '#ffffff' } as const;

export const edgeColor = (w: Pick<World, 'edge'>): string | null => (w.edge.kind ? EDGE_COLOR[w.edge.kind] : null);

// 충전이 하나 남으면 초당 6번 깜빡인다(true = 이번엔 꺼짐). 해방은 충전이 없어 깜빡이지 않는다
export const edgeBlink = (w: Pick<World, 'edge'>, time: number) => w.edge.kind !== null && w.edge.kind !== 'both' && w.edge.left === 1 && Math.floor(time * 12) % 2 === 1;

// 칸에 끼운 벼림이 지금 칼과 같으면 남은 충전(아니면 null)
const EDGE_OF: Partial<Record<SkillId, 'flame' | 'frost'>> = { flameEdge: 'flame', frostEdge: 'frost' };
export const edgeLeft = (w: Pick<World, 'edge' | 'keys'>, key: SkillName): number | null => {
  const id = w.keys[key];
  return id && EDGE_OF[id] && EDGE_OF[id] === w.edge.kind ? w.edge.left : null;
};

// 0xRRGGBB 두 색을 k만큼 b 쪽으로
export function mixColor(a: number, b: number, k: number): number {
  let out = 0;
  for (const s of [16, 8, 0]) out |= Math.round(((a >> s) & 255) * (1 - k) + ((b >> s) & 255) * k) << s;
  return out;
}

// 맞은 적의 잃은 체력을 [원래 숫자, 벼림 추가 피해 숫자]로 나눈다. 죽는 타격에선 추가 몫이 잃은 체력을 넘지 않는다
export function splitLost(lost: number, extra: number): [number, number] {
  const e = Math.min(extra, lost);
  return [lost - e, e];
}

// 마지막으로 한 시각(last, 없으면 처음)에서 gap초가 지났는가 — 회오리처럼 잦은 휘두름에 연출이 겹겹이 쌓이지 않게
export const ready = (last: number | undefined, time: number, gap: number) => last === undefined || time - last >= gap - 1e-9;
