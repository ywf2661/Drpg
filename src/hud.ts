// 화면 위 HTML: 체력·경험치·레벨, 물약·스킬·장비 칸, 대상·보스 체력바, 층 제목, 알림, 배너. 게임 상태를 읽어 그리기만 한다.
import gearIcons from './assets/sprites/gear_icons.png';
import potionIcon from './assets/sprites/potion_icon.png';
import skillIcon from './assets/sprites/skill_icon.png';
import dashIcon from './assets/sprites/dash_icon.png';
import shoutIcon from './assets/sprites/shout_icon.png';
import throwIcon from './assets/sprites/throw_icon.png';
import { renderer } from './render/render';
import { setHeroGear } from './render/sprites';
import type { SoundSettings } from './audio/sound';
import { formatTime, type Run, type Stats } from './save';
import { offers, sellPrice, type ShopItem, type Wallet } from './shop';
import { gearName } from './render/labels';
import { FLOORS } from './sim/dungeon';
import { ARMORS, axeStat, BAG, bagBlocked, bagFits, cleaveStat, dashStat, gearDiff, gearSize, mastered, outcome, POTION, RANK_MAX, ROLL, shoutStat, STATS, WEAPONS, xpToNext, type Affix, type BagItem, type GearItem, type SkillName, type World } from './sim/world';

export const $ = (sel: string) => document.querySelector<HTMLElement>(sel)!;
const heroFill = $('#hp i');
const xpFill = $('#xp i');
const levelLabel = $('#level');
const target = $('#target');
const targetName = $('#target span');
const targetFill = $('#target i');
const bossBar = $('#boss');
const bossFill = $('#boss i');
const bossName = $('#boss span');
const banner = $('#banner');
const bannerText = $('#banner p');
const summary = $('#summary');
const restartBtn = $('#restart');
const continueBtn = $('#continue');
const newGameBtn = $('#new-game');
const nextCycleBtn = $('#next-cycle');
const floorLabel = $('#floor');
const floorTitle = $('#floor-title');
const potionBtn = $('#potion');
const potionCount = $('#potion span');
const skillBtn = $('#skill');
const skillShade = $('#skill i');
const dashBtn = $('#dash');
const dashShade = $('#dash i');
const shoutBtn = $('#shout');
const throwBtn = $('#throw');
const weaponSlot = $('#weapon');
const armorSlot = $('#armor');
const toast = $('#toast');
const soundBtn = $('#sound-btn');
const goldLabel = $('#gold');
const shop = document.querySelector<HTMLDialogElement>('#shop')!;
const shopGold = $('#shop-gold');
const shopItems = $('#shop-items');
const shopSell = $('#shop-sell');
const bagBtn = $('#bag-btn');
const bagDlg = document.querySelector<HTMLDialogElement>('#bag')!;
const BOSS_BAR_RANGE = 12; // 보스와 이만큼 가까우면 상단 체력바(m)
let shownGear = '';
let shownBag = 0; // 층이 바뀌거나 보관함이 늘었는지 비교
let shownBlocked = false; // '가득 찼습니다'는 밟은 순간 한 번만
let shownLevel = 0;
let shownWorld: World | null = null; // 층이 바뀌면(이어하기·재시작 포함) 알림 없이 표시만 맞춘다

type Handlers = { drink(): void; skill(): void; dash(): void; shout(): void; throwAxe(): void; roll(): void; learn(s: SkillName): void; bag(): void; restart(): void; nextCycle(): void; toggleMap(): void; sound(patch: Partial<SoundSettings>): void; resume(): void; newGame(): void };

export function initHud(h: Handlers) {
  potionBtn.querySelector('img')!.src = potionIcon;
  skillBtn.style.backgroundImage = `url(${skillIcon})`;
  dashBtn.style.backgroundImage = `url(${dashIcon})`;
  shoutBtn.style.backgroundImage = `url(${shoutIcon})`;
  throwBtn.style.backgroundImage = `url(${throwIcon})`;
  for (const slot of [weaponSlot, armorSlot]) slot.style.backgroundImage = `url(${gearIcons})`;
  potionBtn.addEventListener('click', h.drink);
  skillBtn.addEventListener('click', h.skill);
  dashBtn.addEventListener('click', h.dash);
  shoutBtn.addEventListener('click', h.shout);
  throwBtn.addEventListener('click', h.throwAxe);
  $('#roll').addEventListener('click', h.roll);
  // 스킬 버튼마다 단계 숫자와 [+](포인트가 있을 때). [+]를 누르면 쓰지 않고 단계만 올린다
  for (const [btn, s] of SKILL_BUTTONS()) {
    const rank = Object.assign(document.createElement('b'), { className: 'rank' });
    const up = Object.assign(document.createElement('span'), { className: 'up', textContent: '+', hidden: true });
    up.addEventListener('click', (e) => {
      e.stopPropagation();
      h.learn(s);
    });
    btn.append(rank, up);
  }
  restartBtn.addEventListener('click', h.restart); // 모바일용
  for (const el of [bagBtn, weaponSlot, armorSlot]) el.addEventListener('click', h.bag);
  nextCycleBtn.addEventListener('click', h.nextCycle);
  $('#map-btn').addEventListener('click', h.toggleMap);
  const panel = $('#sound-panel');
  soundBtn.addEventListener('click', () => (panel.hidden = !panel.hidden));
  const sfx = $('#sfx-vol') as HTMLInputElement;
  const music = $('#music-vol') as HTMLInputElement;
  const mute = $('#mute') as HTMLInputElement;
  sfx.addEventListener('input', () => h.sound({ sfx: +sfx.value / 100 }));
  music.addEventListener('input', () => h.sound({ music: +music.value / 100 }));
  mute.addEventListener('change', () => h.sound({ muted: mute.checked }));
  continueBtn.addEventListener('click', h.resume);
  newGameBtn.addEventListener('click', h.newGame);
}

// CSS 애니메이션을 처음부터 다시 재생
function replay(el: HTMLElement) {
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
}

export function showFloor(n: number, cycle: number) {
  floorLabel.textContent = `지하 ${n}층` + (cycle ? ` · ${cycle + 1}회차` : '');
  floorTitle.textContent = n === FLOORS ? `지하 ${n}층 — ${STATS.boss.name}` : floorLabel.textContent;
  replay(floorTitle);
}

// 소리 버튼 글자와 패널의 값을 설정에 맞춘다
export function showSound(s: SoundSettings) {
  soundBtn.textContent = s.muted ? '소리 꺼짐' : '소리';
  ($('#sfx-vol') as HTMLInputElement).value = String(Math.round(s.sfx * 100));
  ($('#music-vol') as HTMLInputElement).value = String(Math.round(s.music * 100));
  ($('#mute') as HTMLInputElement).checked = s.muted;
}

export function showLoadError(err: unknown) {
  bannerText.textContent = `그림을 불러오지 못했습니다: ${err instanceof Error ? err.message : err}`;
}

// 시작할 때 저장된 진행이 있으면 이어하기/새 게임을 묻는다(saved = null이면 배너를 닫는다)
export function showChoice(saved: Run | null) {
  banner.hidden = !saved;
  continueBtn.hidden = newGameBtn.hidden = !saved;
  if (saved) bannerText.textContent = `저장된 진행: 지하 ${saved.floor}층, Lv ${saved.level}`;
}

const SKILL_BUTTONS = (): [HTMLElement, SkillName][] => [[skillBtn, 'cleave'], [dashBtn, 'dash'], [shoutBtn, 'shout'], [throwBtn, 'throw']];
const pct = (v: number) => `${Math.round(v * 100)}%`;
const sec = (v: number) => `${+v.toFixed(1)}초`;
// 스킬 툴팁: 이름(키) · 단계, 지금 수치, 다음 단계 수치
// cap: 5단계 완성 효과
const SKILL_TEXT: Record<SkillName, { name: string; key: string; cap: string; stat(w: World): string }> = {
  cleave: { name: '가르기', key: 'Q / 우클릭', cap: '반원 대신 한 바퀴를 벤다', stat: (w) => { const s = cleaveStat(w); return `${mastered(w, 'cleave') ? '한 바퀴' : '앞쪽 반원'} ${s.radius.toFixed(1)}m 적 모두 ${pct(s.mult)}, ${sec(s.cd)}`; } },
  dash: { name: '돌진 베기', key: 'W', cap: '돌진으로 처치하면 바로 다시 돌진', stat: (w) => { const s = dashStat(w); return `${s.dist}m 돌진, 길 위 적 ${pct(s.mult)}, ${sec(s.cd)}`; } },
  shout: { name: '전투의 함성', key: 'E', cap: '쓸 때 최대 체력의 15% 회복', stat: (w) => { const s = shoutStat(w); return `${s.radius.toFixed(1)}m 안 적 ${sec(s.stun)} 기절, 받는 피해 −${pct(s.reduce)}, ${sec(s.cd)}`; } },
  throw: { name: '도끼 던지기', key: 'R', cap: '적을 관통한다', stat: (w) => { const s = axeStat(w); return `${mastered(w, 'throw') ? '길 위의 적 모두' : '처음 닿는 적'}에게 ${pct(s.mult)}, ${sec(s.cd)}`; } },
};
let shownRanks = '';

// 스킬 버튼의 단계 숫자·[+]·툴팁(단계나 포인트가 바뀔 때만 다시 씀)
function showRanks(w: World) {
  const key = JSON.stringify([w.ranks, w.points]);
  if (key === shownRanks) return;
  shownRanks = key;
  for (const [btn, s] of SKILL_BUTTONS()) {
    const r = w.ranks[s];
    const t = SKILL_TEXT[s];
    btn.querySelector('.rank')!.textContent = String(r);
    (btn.querySelector('.up') as HTMLElement).hidden = !w.points || r >= RANK_MAX;
    const next = r < RANK_MAX ? `\n다음 단계: ${t.stat({ ...w, ranks: { ...w.ranks, [s]: r + 1 } })}` : '\n(최고 단계)';
    btn.title = `${t.name} (${t.key}) · ${r}단계\n${t.stat(w)}${next}\n5단계: ${t.cap}${r >= RANK_MAX ? ' ✓' : ''}` + (w.points && r < RANK_MAX ? '\n[+] 또는 Shift+키: 단계 올리기' : '');
  }
}

// 옵션 한 줄 설명
const AFFIX_TEXT: Record<Affix['kind'], (v: number) => string> = {
  dmg: (v) => `데미지 +${v}%`,
  speed: (v) => `공격 속도 +${v}%`,
  leech: (v) => `준 피해의 ${v}% 회복`,
  crit: (v) => `${v}% 확률로 2배`,
  life: (v) => `최대 체력 +${v}`,
  guard: (v) => `받는 피해 −${v}%`,
  regen: (v) => `초당 체력 ${v / 10} 회복`,
  thorns: (v) => `근접 피해 ${v}% 반사`,
};

// 장비의 수치·옵션 설명 줄들
function gearLines(it: GearItem): string[] {
  const wpn = WEAPONS[it.tier - 1];
  const base = it.kind === 'weapon' ? `공격 ${wpn.dmg[0]}–${wpn.dmg[1]}, ${wpn.interval}초` : `받는 피해 −${ARMORS[it.tier - 1].reduce * 100}%`;
  return [base, ...it.affixes.map((a) => AFFIX_TEXT[a.kind](a.value))];
}

// 장비 아이콘 위치(gear_icons.png = 무기 4 + 갑옷 4)
const iconX = (it: GearItem) => `${-((it.kind === 'weapon' ? 0 : 4) + it.tier - 1) * 40}px`;

// 장비 칸: 아이콘과 이름·수치·옵션(툴팁)
function showGear(w: World) {
  const g = w.gear;
  for (const [slot, it] of [
    [weaponSlot, { kind: 'weapon', tier: g.weapon, affixes: w.mods.weapon }],
    [armorSlot, { kind: 'armor', tier: g.armor, affixes: w.mods.armor }],
  ] as const) {
    slot.style.backgroundPositionX = iconX(it);
    slot.title = `${gearName(it.kind, it.tier, it.affixes)}\n${gearLines(it).join('\n')}\n눌러서 보관함 열기`;
  }
  for (const [slot, list] of [[weaponSlot, w.mods.weapon], [armorSlot, w.mods.armor]] as const) slot.dataset.q = String(list.length);
}

function say(text: string) {
  toast.textContent = text;
  replay(toast);
}

// 팔기·버리기는 목록이 바로 올라오므로, 더블클릭의 두 번째가 아래 장비까지 없애지 않게 무시한다
const once = (fn: () => void) => (e: MouseEvent) => {
  if (e.detail <= 1) fn();
};

// 보관함 창의 장비 한 줄: 아이콘, 등급 색 이름(mark 포함), 수치·옵션, 버튼들
function gearRow(it: GearItem, mark: string, buttons: [string, () => void][]) {
  const row = Object.assign(document.createElement('div'), { className: 'gear-row' });
  const icon = Object.assign(document.createElement('div'), { className: 'slot' });
  icon.style.backgroundImage = `url(${gearIcons})`;
  icon.style.backgroundPositionX = iconX(it);
  icon.dataset.q = String(it.affixes.length);
  const info = document.createElement('div');
  const name = Object.assign(document.createElement('b'), { className: `q${it.affixes.length}`, textContent: gearName(it.kind, it.tier, it.affixes) + mark });
  info.append(name, Object.assign(document.createElement('small'), { textContent: gearLines(it).join(' · ') }));
  row.append(icon, info);
  for (const [text, fn] of buttons) {
    const b = Object.assign(document.createElement('button'), { textContent: text });
    b.addEventListener('click', once(fn));
    row.append(b);
  }
  return row;
}

// 보관함에서 장비가 차지한 칸 수 / 전체 칸 수
const bagCount = (bag: BagItem[]) => `${bag.reduce((n, it) => n + gearSize(it)[0] * gearSize(it)[1], 0)}/${BAG.w * BAG.h}`;
const area = (x: number, y: number, [gw, gh]: [number, number]) => `${y + 1} / ${x + 1} / span ${gh} / span ${gw}`;
let selected = -1; // 보관함 창에서 고른 장비(아래에 설명·버튼)

// 보관함 창: 격자에 놓인 장비를 누르면 고르고, 끌면 옮기고, 우클릭하면 입는다. 고친 뒤에는 다시 불러 갱신한다
export function showBag(w: World, h: { equip(i: number): boolean; discard(i: number): void; move(i: number, x: number, y: number): void; auto(on: boolean): void }) {
  const mark = (it: GearItem) => {
    const d = gearDiff(w, it);
    return d > 1e-9 ? ' ▲' : d < -1e-9 ? ' ▼' : '';
  };
  if (!bagDlg.open) {
    selected = -1;
    bagDlg.showModal(); // 먼저 열어야 칸 크기를 잴 수 있다
  }
  const note = $('#bag-note');
  note.textContent = '';
  const equip = (i: number) => {
    if (!h.equip(i)) note.textContent = '벗은 장비를 둘 자리가 없습니다. 먼저 자리를 비우세요.';
  };
  const grid = $('#bag-grid');
  const cell = grid.clientWidth / BAG.w;
  const shadow = Object.assign(document.createElement('div'), { id: 'bag-shadow', hidden: true }); // 끄는 동안 놓일 자리
  grid.oncontextmenu = (e) => e.preventDefault();
  grid.replaceChildren(
    shadow,
    ...w.bag.map((it, i) => {
      const size = gearSize(it);
      const el = Object.assign(document.createElement('div'), { className: i === selected ? 'bag-item sel' : 'bag-item', title: `${gearName(it.kind, it.tier, it.affixes)}${mark(it)}\n${gearLines(it).join('\n')}` });
      el.dataset.q = String(it.affixes.length);
      el.style.gridArea = area(it.x, it.y, size);
      const icon = document.createElement('i');
      icon.style.backgroundImage = `url(${gearIcons})`;
      icon.style.backgroundPositionX = iconX(it);
      icon.style.scale = String((Math.min(...size) * cell - 4) / 40);
      el.append(icon);
      el.onpointerdown = (e) => {
        if (e.button === 2) return equip(i);
        if (e.button) return;
        el.setPointerCapture(e.pointerId);
        let [tx, ty] = [it.x, it.y];
        el.onpointermove = (m) => {
          el.classList.add('drag');
          el.style.translate = `${m.clientX - e.clientX}px ${m.clientY - e.clientY}px`;
          tx = it.x + Math.round((m.clientX - e.clientX) / cell);
          ty = it.y + Math.round((m.clientY - e.clientY) / cell);
          shadow.hidden = tx < 0 || ty < 0 || tx + size[0] > BAG.w || ty + size[1] > BAG.h;
          shadow.style.gridArea = area(tx, ty, size);
          shadow.classList.toggle('bad', !bagFits(w.bag, it, tx, ty, i));
        };
        el.onpointercancel = () => showBag(w, h);
        el.onpointerup = () => {
          if (tx !== it.x || ty !== it.y) return h.move(i, tx, ty); // 못 놓는 자리면 제자리로
          selected = i;
          showBag(w, h);
        };
      };
      return el;
    }),
  );
  const sel = w.bag[selected];
  $('#bag-sel').replaceChildren(
    sel
      ? gearRow(sel, mark(sel), [
          ['장착', () => equip(selected)],
          ['버리기', () => {
            const i = selected;
            selected = -1;
            h.discard(i);
          }],
        ])
      : Object.assign(document.createElement('small'), { textContent: w.bag.length ? '장비를 누르면 설명, 끌면 옮기기, 우클릭하면 장착.' : '비어 있습니다. 장비를 밟으면 여기로 들어옵니다.' }),
  );
  $('#bag-count').textContent = bagCount(w.bag);
  $('#bag-worn').replaceChildren(
    gearRow({ kind: 'weapon', tier: w.gear.weapon, affixes: w.mods.weapon }, '', []),
    gearRow({ kind: 'armor', tier: w.gear.armor, affixes: w.mods.armor }, '', []),
  );
  const auto = $('#auto-equip') as HTMLInputElement;
  auto.checked = w.autoEquip;
  auto.onchange = () => h.auto(auto.checked);
}

// 상점 화면. 항목을 누르면 onBuy, 팔면 onSell, 닫으면(버튼·Esc) onLeave. 사고판 뒤에는 다시 불러 갱신한다
export function showShop(c: Wallet, onBuy: (item: ShopItem) => void, onSell: (i: number) => void, onLeave: () => void) {
  const next = (t: number) => (t < 4 ? `(${t + 1}단계)` : '(최고 단계)');
  const label: Record<ShopItem, string> = {
    potion: `체력 물약 1개 <small>(지금 ${c.potions}/8)</small>`,
    weapon: `무기 강화: ${WEAPONS[c.gear.weapon - 1].name}${c.gear.weapon < 4 ? ` → ${WEAPONS[c.gear.weapon].name}` : ''} <small>${next(c.gear.weapon)}</small>`,
    armor: `갑옷 강화: ${ARMORS[c.gear.armor - 1].name}${c.gear.armor < 4 ? ` → ${ARMORS[c.gear.armor].name}` : ''} <small>${next(c.gear.armor)}</small>`,
  };
  shopGold.textContent = String(c.gold);
  shopItems.replaceChildren(
    ...offers(c).map((o) => {
      const b = document.createElement('button');
      b.innerHTML = `${label[o.item]} — 금화 ${o.price}`;
      b.disabled = !o.ok;
      b.addEventListener('click', () => onBuy(o.item));
      return b;
    }),
  );
  shopSell.hidden = c.bag.length === 0;
  $('#shop-sell-items').replaceChildren(
    ...c.bag.map((it, i) => {
      const b = document.createElement('button');
      b.append(
        Object.assign(document.createElement('span'), { className: `q${it.affixes.length}`, textContent: gearName(it.kind, it.tier, it.affixes) }),
        ` — 금화 ${sellPrice(it)}`,
        Object.assign(document.createElement('small'), { textContent: gearLines(it).join(' · ') }),
      );
      b.addEventListener('click', once(() => onSell(i)));
      return b;
    }),
  );
  $('#shop-leave').onclick = () => shop.close();
  shop.onclose = onLeave;
  if (!shop.open) shop.showModal();
}

// 매 프레임. hovered: 마우스가 올라간 몬스터 id, choosing: 이어하기를 고르는 중(배너를 건드리지 않음)
// lostGold: 이번 죽음에서 잃은 금화
export function updateHud(world: World, hovered: number | null, choosing: boolean, stats: Stats, lostGold = 0) {
  const hero = world.entities[0];
  if (world !== shownWorld) {
    shownWorld = world;
    shownLevel = 0;
    shownGear = '';
    shownBag = world.bag.length;
    shownBlocked = false;
  }
  heroFill.style.width = `${(hero.hp / hero.maxHp) * 100}%`;
  xpFill.style.width = `${(world.xp / xpToNext(world.level)) * 100}%`;
  levelLabel.textContent = `Lv ${world.level}` + (world.points ? ` · 스킬 +${world.points}` : '');
  if (shownLevel && world.level > shownLevel) say(`레벨 업! Lv ${world.level}`);
  shownLevel = world.level;
  skillShade.style.height = `${(world.skillCd / cleaveStat(world).cd) * 100}%`; // 재사용 대기 남은 비율
  dashShade.style.height = `${(world.dashCd / dashStat(world).cd) * 100}%`;
  $('#shout i').style.height = `${(world.shoutCd / shoutStat(world).cd) * 100}%`;
  $('#throw i').style.height = `${(world.throwCd / axeStat(world).cd) * 100}%`;
  $('#roll i').style.height = `${(world.rollCd / ROLL.cd) * 100}%`;
  showRanks(world);
  potionCount.textContent = String(world.potions);
  $('#potion i').style.height = `${world.healing ? (1 - world.healing.t / POTION.time) * 100 : 0}%`; // 차는 동안은 다시 못 마신다
  goldLabel.textContent = String(world.gold);
  potionBtn.classList.toggle('empty', world.potions === 0);
  bagBtn.querySelector('span')!.textContent = bagCount(world.bag);
  let worn = false;
  const key = JSON.stringify([world.gear, world.mods]);
  if (key !== shownGear) {
    // 주운 장비는 알림. 층에 들어와 처음 그릴 때는 알리지 않는다
    if (shownGear) {
      // 바뀐 부위의 전체 이름으로 알림
      const [g0, m0] = JSON.parse(shownGear) as [World['gear'], World['mods']];
      const changed = (k: 'weapon' | 'armor') => g0[k] !== world.gear[k] || JSON.stringify(m0[k]) !== JSON.stringify(world.mods[k]);
      for (const k of ['weapon', 'armor'] as const) {
        if (!changed(k)) continue;
        worn = true;
        say(`${gearName(k, world.gear[k], world.mods[k])} 장착`);
      }
    }
    shownGear = key;
    showGear(world);
    void setHeroGear(world.gear);
  }
  // 장착 알림이 없을 때만 줍기 알림(자동 장착은 벗은 장비가 보관함으로 들어온다)
  const got = world.bag.at(-1);
  if (got && world.bag.length > shownBag && !worn) say(`${gearName(got.kind, got.tier, got.affixes)} — 보관함으로`);
  shownBag = world.bag.length;
  const blocked = bagBlocked(world);
  if (blocked && !shownBlocked && !worn) say('보관함에 자리가 없습니다');
  shownBlocked = blocked;
  // 상단 체력바: 가까이 있는 보스(미노타우르스) 또는 해골 왕
  const boss = world.entities.find((e) => (e.kind === 'boss' || e.kind === 'king') && e.state !== 'dead' && Math.hypot(e.x - hero.x, e.z - hero.z) <= BOSS_BAR_RANGE);
  bossBar.hidden = !boss;
  if (boss) {
    bossName.textContent = STATS[boss.kind].name;
    bossFill.style.width = `${(boss.hp / boss.maxHp) * 100}%`;
  }
  target.classList.toggle('below', !bossBar.hidden);
  const id = hovered ?? hero.target; // 마우스 오버가 없으면(모바일) 공격 중인 대상
  const m = id === null ? null : world.entities[id];
  target.hidden = !m;
  if (m) {
    targetName.textContent = (m.elite ? '정예 ' : '') + STATS[m.kind].name;
    targetFill.style.width = `${(m.hp / m.maxHp) * 100}%`;
  }
  renderer.domElement.classList.toggle('attack', hovered !== null); // 몬스터 위에서는 공격 커서
  if (choosing) return;
  const o = outcome(world);
  banner.hidden = restartBtn.hidden = o !== 'dead' && o !== 'clear';
  if (o === 'dead') bannerText.textContent = '사망했습니다' + (lostGold ? ` — 금화 ${lostGold}을 잃었습니다` : '');
  if (o === 'clear') {
    bannerText.textContent = `${STATS.boss.name}를 쓰러뜨렸습니다! 클리어!`;
    summary.textContent = `플레이 시간 ${formatTime(stats.time)} · 처치 ${stats.kills} · 사망 ${stats.deaths} · Lv ${world.level}`;
  }
  summary.hidden = nextCycleBtn.hidden = o !== 'clear';
  restartBtn.textContent = o === 'clear' ? '처음부터 (R)' : '다시 시작 (R)';
}
