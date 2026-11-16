// 층 사이 상점: 물약 구매, 장비 팔기. 장비 단계는 드롭으로만 오른다(강화는 2026-11-16에 뺐다). 상태를 바꾸지 않는 순수 함수.
import { LEGEND_DROP, POTION, uniqueOf, type BagItem, type Gear, type GearItem } from './sim/world';

export type Wallet = { potions: number; gear: Gear; gold: number; bag: BagItem[] };
export type ShopItem = 'potion';
const PRICE = 25;

export function offers(c: Wallet): { item: ShopItem; price: number; ok: boolean }[] {
  return [{ item: 'potion', price: PRICE, ok: c.potions < POTION.max && c.gold >= PRICE }];
}

// 죽은 뒤 남는 금화: 절반(내림)
export const deathGold = (gold: number) => Math.floor(gold / 2);

// 판매 가격: 10 × 단계 + 15 × 옵션 수, 고유 장비는 표식 대신 + LEGEND_DROP.price
export const sellPrice = (it: GearItem) => (uniqueOf(it) ? 10 * it.tier + 15 * (it.affixes.length - 1) + LEGEND_DROP.price : 10 * it.tier + 15 * it.affixes.length);

// 판 뒤의 새 상태. 잘못된 칸이면 받은 그대로
export function sell<T extends Wallet>(c: T, i: number): T {
  const it = c.bag[i];
  if (!it) return c;
  return { ...c, gold: c.gold + sellPrice(it), bag: c.bag.filter((_, k) => k !== i) };
}

// 산 뒤의 새 상태. 못 사면 받은 그대로
export function buy<T extends Wallet>(c: T, _item: ShopItem): T {
  if (!offers(c)[0].ok) return c;
  return { ...c, potions: c.potions + 1, gold: c.gold - PRICE };
}
