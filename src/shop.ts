// 층 사이 상점: 물약 구매, 무기·갑옷 한 단계 강화. 상태를 바꾸지 않는 순수 함수.
import { POTION, type Gear } from './sim/world';

export type Wallet = { potions: number; gear: Gear; gold: number };
export type ShopItem = 'potion' | 'weapon' | 'armor';
const MAX_TIER = 4;

function price(c: Wallet, item: ShopItem) {
  return item === 'potion' ? 25 : item === 'weapon' ? 120 * c.gear.weapon : 100 * c.gear.armor;
}

function available(c: Wallet, item: ShopItem) {
  return item === 'potion' ? c.potions < POTION.max : c.gear[item] < MAX_TIER;
}

export function offers(c: Wallet): { item: ShopItem; price: number; ok: boolean }[] {
  return (['potion', 'weapon', 'armor'] as const).map((item) => {
    const p = price(c, item);
    return { item, price: p, ok: available(c, item) && c.gold >= p };
  });
}

// 산 뒤의 새 상태. 못 사면 받은 그대로
export function buy<T extends Wallet>(c: T, item: ShopItem): T {
  const p = price(c, item);
  if (!available(c, item) || c.gold < p) return c;
  if (item === 'potion') return { ...c, potions: c.potions + 1, gold: c.gold - p };
  return { ...c, gear: { ...c.gear, [item]: c.gear[item] + 1 }, gold: c.gold - p };
}
