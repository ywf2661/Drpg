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
import { offers, type ShopItem, type Wallet } from './shop';
import { gearName } from './render/labels';
import { FLOORS } from './sim/dungeon';
import { ARMORS, AXE, DASH, outcome, SHOUT, SKILL, STATS, WEAPONS, xpToNext, type Affix, type World } from './sim/world';

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
const BOSS_BAR_RANGE = 12; // 보스와 이만큼 가까우면 상단 체력바(m)
let shownGear = '';
let shownLevel = 0;
let shownWorld: World | null = null; // 층이 바뀌면(이어하기·재시작 포함) 알림 없이 표시만 맞춘다

type Handlers = { drink(): void; skill(): void; dash(): void; shout(): void; throwAxe(): void; restart(): void; nextCycle(): void; toggleMap(): void; sound(patch: Partial<SoundSettings>): void; resume(): void; newGame(): void };

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
  restartBtn.addEventListener('click', h.restart); // 모바일용
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

// 장비 칸: 아이콘(gear_icons.png = 무기 4 + 갑옷 4)과 이름·수치·옵션(툴팁)
function showGear(w: World) {
  const g = w.gear;
  const wpn = WEAPONS[g.weapon - 1];
  const arm = ARMORS[g.armor - 1];
  const lines = (list: Affix[]) => list.map((a) => `\n· ${AFFIX_TEXT[a.kind](a.value)}`).join('');
  weaponSlot.style.backgroundPositionX = `${-(g.weapon - 1) * 40}px`;
  armorSlot.style.backgroundPositionX = `${-(4 + g.armor - 1) * 40}px`;
  weaponSlot.title = `${gearName('weapon', g.weapon, w.mods.weapon)}\n공격 ${wpn.dmg[0]}–${wpn.dmg[1]}, ${wpn.interval}초${lines(w.mods.weapon)}`;
  armorSlot.title = `${gearName('armor', g.armor, w.mods.armor)}\n받는 피해 −${arm.reduce * 100}%${lines(w.mods.armor)}`;
  for (const [slot, list] of [[weaponSlot, w.mods.weapon], [armorSlot, w.mods.armor]] as const) slot.dataset.q = String(list.length);
}

function say(text: string) {
  toast.textContent = text;
  replay(toast);
}

// 상점 화면. 항목을 누르면 onBuy, 닫으면(버튼·Esc) onLeave. 산 뒤에는 다시 불러 갱신한다
export function showShop(c: Wallet, onBuy: (item: ShopItem) => void, onLeave: () => void) {
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
  $('#shop-leave').onclick = () => shop.close();
  shop.onclose = onLeave;
  if (!shop.open) shop.showModal();
}

// 매 프레임. hovered: 마우스가 올라간 몬스터 id, choosing: 이어하기를 고르는 중(배너를 건드리지 않음)
export function updateHud(world: World, hovered: number | null, choosing: boolean, stats: Stats) {
  const hero = world.entities[0];
  if (world !== shownWorld) {
    shownWorld = world;
    shownLevel = 0;
    shownGear = '';
  }
  heroFill.style.width = `${(hero.hp / hero.maxHp) * 100}%`;
  xpFill.style.width = `${(world.xp / xpToNext(world.level)) * 100}%`;
  levelLabel.textContent = `Lv ${world.level}`;
  if (shownLevel && world.level > shownLevel) say(`레벨 업! Lv ${world.level}`);
  shownLevel = world.level;
  skillShade.style.height = `${(world.skillCd / SKILL.cd) * 100}%`; // 재사용 대기 남은 비율
  dashShade.style.height = `${(world.dashCd / DASH.cd) * 100}%`;
  $('#shout i').style.height = `${(world.shoutCd / SHOUT.cd) * 100}%`;
  $('#throw i').style.height = `${(world.throwCd / AXE.cd) * 100}%`;
  potionCount.textContent = String(world.potions);
  goldLabel.textContent = String(world.gold);
  potionBtn.classList.toggle('empty', world.potions === 0);
  const key = JSON.stringify([world.gear, world.mods]);
  if (key !== shownGear) {
    // 주운 장비는 알림. 층에 들어와 처음 그릴 때는 알리지 않는다
    if (shownGear) {
      // 바뀐 부위의 전체 이름으로 알림(줍기는 더 좋은 것만 하므로 바뀌면 장착)
      const [g0, m0] = JSON.parse(shownGear) as [World['gear'], World['mods']];
      const changed = (k: 'weapon' | 'armor') => g0[k] !== world.gear[k] || JSON.stringify(m0[k]) !== JSON.stringify(world.mods[k]);
      for (const k of ['weapon', 'armor'] as const) if (changed(k)) say(`${gearName(k, world.gear[k], world.mods[k])} 장착`);
    }
    shownGear = key;
    showGear(world);
    void setHeroGear(world.gear);
  }
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
  if (o === 'dead') bannerText.textContent = '사망했습니다';
  if (o === 'clear') {
    bannerText.textContent = `${STATS.boss.name}를 쓰러뜨렸습니다! 클리어!`;
    summary.textContent = `플레이 시간 ${formatTime(stats.time)} · 처치 ${stats.kills} · 사망 ${stats.deaths} · Lv ${world.level}`;
  }
  summary.hidden = nextCycleBtn.hidden = o !== 'clear';
  restartBtn.textContent = o === 'clear' ? '처음부터 (R)' : '다시 시작 (R)';
}
