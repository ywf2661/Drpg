import { expect, test } from 'vitest';
import { createWorld, hasUnique, hurt, isBetter, makeUnique, plainAffixes, quality, step, worn, type World } from './world';
import { awakeChoices, awaken, forgeCost, starOf, temper } from './forge';
import { FORGE } from './rules';

const rich = (w: World) => Object.assign(w, { gold: 1e5, ore: 999, hearts: 9 });

test('담금질: 값을 내고 ★마다 그 부위 수치가 오른다(옵션 줄 하나)', () => {
  const w = rich(createWorld(1, ['H']));
  w.mods.weapon = [{ kind: 'dmg', value: 20 }];
  expect(temper(w, 'weapon')).toBe(true);
  expect(temper(w, 'weapon')).toBe(true);
  expect(starOf(w.mods.weapon)).toBe(2);
  expect(worn(w, 'dmg')).toBe(20 + 2 * FORGE.up.weapon[1]);
  expect(w.gold).toBe(1e5 - FORGE.gold[0] - FORGE.gold[1]);
  expect(w.ore).toBe(999 - FORGE.ore[0] - FORGE.ore[1]);
  expect(plainAffixes(w.mods.weapon)).toEqual([{ kind: 'dmg', value: 20 }]); // 이름·등급에는 안 셈
  expect(quality({ affixes: w.mods.weapon })).toBe(1);
  // 투구 ★1 = 최대 체력 +12
  const hp = w.entities[0].maxHp;
  temper(w, 'helm');
  expect(w.entities[0].maxHp).toBe(hp + FORGE.up.helm[1]);
});

test('재료가 모자라면 안 되고, ★4 → ★5는 심장 조각이 든다, ★5가 끝', () => {
  const w = createWorld(1, ['H']);
  Object.assign(w, { gold: 1e5, ore: 1, hearts: 0 });
  expect(temper(w, 'boots')).toBe(false);
  rich(w).hearts = 0;
  for (let i = 0; i < 4; i++) {
    temper(w, 'boots');
    awaken(w, 'boots', 0);
  }
  expect(starOf(w.mods.boots)).toBe(4);
  expect(forgeCost(4)).toEqual({ ore: FORGE.ore[4], gold: FORGE.gold[4], hearts: 1 });
  expect(temper(w, 'boots')).toBe(false);
  w.hearts = 1;
  expect(temper(w, 'boots')).toBe(true);
  expect(w.hearts).toBe(0);
  expect(temper(w, 'boots')).toBe(false); // ★5 끝
});

test('★3·★5에서 깨어난다: 후보 셋(시드로 고정, 서로 다름), 하나를 고르면 붙는다', () => {
  const w = rich(createWorld(7, ['H']));
  w.cls = 'knight';
  for (let i = 0; i < 3; i++) temper(w, 'boots');
  const c = awakeChoices(w.mods.boots, 'boots', w.cls)!;
  expect(c.length).toBe(3);
  expect(new Set(c).size).toBe(3);
  expect(awakeChoices(w.mods.boots, 'boots', w.cls)).toEqual(c); // 다시 봐도 같다
  expect(temper(w, 'boots')).toBe(false); // 고르기 전엔 더 못 한다
  expect(awaken(w, 'boots', 1)).toBe(true);
  expect(awakeChoices(w.mods.boots, 'boots', w.cls)).toBeNull();
  temper(w, 'boots');
  temper(w, 'boots');
  const c5 = awakeChoices(w.mods.boots, 'boots', w.cls)!;
  expect(c5).not.toContain(c[1]); // 이미 깨어난 것은 다시 안 나온다
  awaken(w, 'boots', 0);
  expect(w.mods.boots.filter((a) => a.awake).length).toBe(2);
});

test('전설 깨어남: 그 전설 효과가 켜진다(장비 자신의 전설은 후보에 없다)', () => {
  const w = rich(createWorld(3, ['H']));
  const it = makeUnique(w, 'emberStep', 0, 0, 4);
  w.mods.boots = it.affixes!;
  for (let s = 0; s < 200; s++) {
    w.mods.boots = [...it.affixes!.filter((a) => !a.star && !a.awake && a.kind !== 'awake'), { kind: 'move', value: 3, star: 3 }, { kind: 'awake', value: s }];
    const c = awakeChoices(w.mods.boots, 'boots', w.cls)!;
    expect(c.map((a) => a.u)).not.toContain('emberStep');
    const k = c.findIndex((a) => a.u === 'runnerBoots');
    if (k < 0) continue;
    expect(hasUnique(w, 'runnerBoots')).toBe(false);
    awaken(w, 'boots', k);
    expect(hasUnique(w, 'runnerBoots')).toBe(true);
    expect(hasUnique(w, 'emberStep')).toBe(true);
    return;
  }
  throw new Error('도망자의 장화 후보가 한 번도 안 나왔다');
});

test('담금질한 장비는 자동 장착이 벗기지 않는다', () => {
  const w = rich(createWorld(1, ['H']));
  w.gear.armor = 1;
  temper(w, 'armor');
  expect(isBetter(w, { kind: 'armor', tier: 4, affixes: [{ kind: 'life', value: 30 }] })).toBe(false);
});

test('2막 정예·보스는 보랏빛 광석, 보스는 심장 조각을 떨군다(1막은 안). 밟으면 줍는다', () => {
  const kill = (land: World['land'], ch: string) => {
    const w = createWorld(5, [`H${ch}`]);
    w.land = land;
    const t = w.entities[1];
    hurt(w, t, 1e6, w.entities[0]);
    return w;
  };
  const ore = (w: World, k: 'ore' | 'heart') => w.items.filter((i) => i.forge === k).reduce((s, i) => s + (i.amount ?? 0), 0);
  const boss = kill('lake', 'M');
  expect(ore(boss, 'ore')).toBe(FORGE.drop.boss);
  expect(ore(boss, 'heart')).toBe(1);
  const elite = kill('lake', 'N');
  expect(ore(elite, 'ore')).toBeGreaterThanOrEqual(1);
  expect(ore(kill('ruins', 'M'), 'ore') + ore(kill('ruins', 'N'), 'ore')).toBe(0);
  // 줍기
  for (const it of boss.items) Object.assign(it, { x: boss.entities[0].x, z: boss.entities[0].z });
  Object.assign(boss, { ore: 0, hearts: 0 });
  step(boss, []);
  expect([boss.ore, boss.hearts]).toEqual([FORGE.drop.boss, 1]);
});
