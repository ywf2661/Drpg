// 화면 위 HTML: 체력·경험치·레벨, 물약·스킬·장비 칸, 대상·보스 체력바, 층 제목, 알림, 배너. 게임 상태를 읽어 그리기만 한다.
import gearIcons from './assets/sprites/gear_icons.png';
import wizardGearIcons from './assets/sprites/wizard_gear_icons.png';
import wizardSkillIcons from './assets/sprites/wizard_skill_icons.png';
import potionIcon from './assets/sprites/potion_icon.png';
import skillIcon from './assets/sprites/skill_icon.png';
import dashIcon from './assets/sprites/dash_icon.png';
import shoutIcon from './assets/sprites/shout_icon.png';
import throwIcon from './assets/sprites/throw_icon.png';
import knightPortrait from './assets/sprites/portrait_hero.png';
import wizardPortrait from './assets/sprites/portrait_wizard.png';
import { renderer } from './render/render';
import { drawHeroPortrait, PORTRAIT, setHeroGear } from './render/sprites';
import type { SoundSettings } from './audio/sound';
import { formatTime, type Run, type Stats } from './save';
import { offers, sellPrice, type ShopItem, type Wallet } from './shop';
import { gearName } from './render/labels';
import { FLOORS } from './sim/dungeon';
import { axeStat, BAG, bagBlocked, bagFits, BLINK, BOLT, boltStat, CLASSES, cleaveStat, dashStat, fireStat, frostStat, gearDiff, gearSize, gearTable, mastered, outcome, POTION, RANK_MAX, ROLL, SLOTS, TRAIT, shoutStat, STATS, WARD, wardStat, xpToNext, type Affix, type BagItem, type GearItem, type HeroClass, type SkillName, type Slot, type World } from './sim/world';

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
const title = $('#title');
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
const gearSlots: Record<Slot, HTMLElement> = { weapon: $('#weapon'), armor: $('#armor'), helm: $('#helm'), boots: $('#boots') };
const SLOT_NAME: Record<Slot, string> = { weapon: '무기', armor: '갑옷', helm: '투구', boots: '신발' };
let cls: HeroClass = 'knight'; // 지금 판의 직업(장비 이름·아이콘·스킬 설명). 층이 바뀔 때·상점을 열 때 맞춘다
const GEAR_ICONS: Record<HeroClass, string> = { knight: gearIcons, wizard: wizardGearIcons };
const nameOf = (kind: Slot, tier: number, affixes: Affix[]) => gearName(kind, tier, affixes, cls);
const toast = $('#toast');
const soundBtn = $('#sound-btn');
const goldLabel = $('#gold');
const shop = document.querySelector<HTMLDialogElement>('#shop')!;
const shopGold = $('#shop-gold');
const shopItems = $('#shop-items');
const shopSell = $('#shop-sell');
const bagBtn = $('#bag-btn');
const bagDlg = document.querySelector<HTMLDialogElement>('#bag')!;
const DANGER = 0.35; // 체력이 이 비율 아래면 화면 가장자리가 붉어진다(낮을수록 짙게)
const danger = $('#danger');
const BOSS_BAR_RANGE = 12; // 보스와 이만큼 가까우면 상단 체력바(m)
let shownGear = '';
let shownBag = 0; // 층이 바뀌거나 보관함이 늘었는지 비교
let shownBlocked = false; // '가득 찼습니다'는 밟은 순간 한 번만
let shownLevel = 0;
let shownGateHint = false; // 사슬 문 안내는 층마다 한 번
let shownWorld: World | null = null; // 층이 바뀌면(이어하기·재시작 포함) 알림 없이 표시만 맞춘다

type Handlers = { drink(): void; skill(): void; dash(): void; shout(): void; throwAxe(): void; roll(): void; learn(s: SkillName): void; traits(s: SkillName): void; bag(): void; restart(): void; nextCycle(): void; toggleMap(): void; sound(patch: Partial<SoundSettings>): void; resume(): void; pick(cls: HeroClass): void; smart(on: boolean): void; smartOn(): boolean };

export function initHud(h: Handlers) {
  potionBtn.querySelector('img')!.src = potionIcon;
  showClass('knight');
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
    // ★: 특성 고르기(3단계부터). 아직 안 골랐으면 금색으로 깜빡인다
    const star = Object.assign(document.createElement('span'), { className: 'trait', textContent: '★', hidden: true });
    star.addEventListener('click', (e) => {
      e.stopPropagation();
      h.traits(s);
    });
    btn.append(rank, up, star);
  }
  restartBtn.addEventListener('click', h.restart); // 모바일용
  for (const el of [bagBtn, ...Object.values(gearSlots)]) el.addEventListener('click', h.bag);
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
  const portraits: Record<HeroClass, string> = { knight: knightPortrait, wizard: wizardPortrait };
  for (const card of title.querySelectorAll<HTMLElement>('.class-card')) {
    const c = card.dataset.cls as HeroClass;
    card.querySelector('img')!.src = portraits[c];
    card.addEventListener('click', () => h.pick(c));
  }
  const smart = $('#smart-key') as HTMLInputElement;
  smart.checked = h.smartOn();
  smart.addEventListener('change', () => h.smart(smart.checked));
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
  soundBtn.textContent = s.muted ? '설정 (음소거)' : '설정';
  ($('#sfx-vol') as HTMLInputElement).value = String(Math.round(s.sfx * 100));
  ($('#music-vol') as HTMLInputElement).value = String(Math.round(s.music * 100));
  ($('#mute') as HTMLInputElement).checked = s.muted;
}

export function showLoadError(err: unknown) {
  bannerText.textContent = `그림을 불러오지 못했습니다: ${err instanceof Error ? err.message : err}`;
}

// 시작할 때 저장된 진행이 있으면 이어하기/새 게임을 묻는다(saved = null이면 배너를 닫는다)
export function showTitle(open: boolean, saved: Run | null = null) {
  title.hidden = !open;
  if (!open) return;
  banner.hidden = true;
  $('#title-save').hidden = !saved;
  if (saved) $('#title-save-info').textContent = `${CLASSES[saved.cls].name} · 지하 ${saved.floor}층 · Lv ${saved.level}`;
  $('#title-pick').textContent = saved ? '새 게임 — 직업을 고르세요' : '직업을 고르세요';
}

const SKILL_BUTTONS = (): [HTMLElement, SkillName][] => [[skillBtn, 'cleave'], [dashBtn, 'dash'], [shoutBtn, 'shout'], [throwBtn, 'throw']];
const pct = (v: number) => `${Math.round(v * 100)}%`;
const sec = (v: number) => `${+v.toFixed(1)}초`;
// 스킬 툴팁: 이름(키) · 단계, 지금 수치, 다음 단계 수치
// cap: 5단계 완성 효과
type SkillText = Record<SkillName, { name: string; key: string; cap: string; stat(w: World): string }>;
const KNIGHT_SKILLS: SkillText = {
  cleave: { name: '가르기', key: 'Q / 우클릭', cap: '반원 대신 한 바퀴를 벤다', stat: (w) => { const s = cleaveStat(w); return `${mastered(w, 'cleave') ? '한 바퀴' : '앞쪽 반원'} ${s.radius.toFixed(1)}m 적 모두 ${pct(s.mult)}, ${sec(s.cd)}`; } },
  dash: { name: '돌진 베기', key: 'W', cap: '돌진으로 처치하면 바로 다시 돌진', stat: (w) => { const s = dashStat(w); return `${s.dist}m 돌진, 길 위 적 ${pct(s.mult)}, ${sec(s.cd)}`; } },
  shout: { name: '전투의 함성', key: 'E', cap: '쓸 때 최대 체력의 15% 회복', stat: (w) => { const s = shoutStat(w); return `${s.radius.toFixed(1)}m 안 적 ${sec(s.stun)} 기절, 받는 피해 −${pct(s.reduce)}, ${sec(s.cd)}`; } },
  throw: { name: '도끼 던지기', key: 'R 조준 → 클릭', cap: '적을 관통한다', stat: (w) => { const s = axeStat(w); return `${mastered(w, 'throw') ? '길 위의 적 모두' : '처음 닿는 적'}에게 ${pct(s.mult)}, ${sec(s.cd)}`; } },
};
let shownRanks = '';
const shownTraitHint = new Set<SkillName>(); // 특성 알림을 띄운 스킬
// 특성 [이름, 설명] — 스킬마다 1번·2번
const KNIGHT_TRAITS: Record<SkillName, [string, string][]> = {
  cleave: [
    ['회오리', '휘두르는 대신 2초 동안 돌면서 걸어 다니며 주변 적을 계속 벤다 (5단계: 3초)'],
    ['시체 폭발', '가르기로 죽은 적이 터져 주변에 피해를 준다. 터져서 죽은 적도 또 터진다'],
  ],
  dash: [
    ['꼬치', '맞은 적을 끝까지 끌고 가 벽에 박는다. 박히면 추가 피해와 기절'],
    ['불길', '지나간 길이 3초 동안 불타 그 위의 적을 태운다'],
  ],
  shout: [
    ['끌어당김', '밀어내는 대신 주변 적을 발밑으로 끌어모은다'],
    ['공포', '기절 대신 4초 동안 도망치게 한다. 도망치는 적은 스킬 피해 2배'],
  ],
  throw: [
    ['튕기는 도끼', '맞으면 가까운 적으로 세 번 더 튄다 (5단계: 여섯 번)'],
    ['박힌 도끼', '적에게 박혀 남는다. 다시 누르면 그 적 앞으로 순간이동해 뽑으며 폭발'],
  ],
};
const WIZARD_SKILLS: SkillText = {
  cleave: { name: '화염구', key: 'Q 조준 / 우클릭', cap: '세 갈래로 날아간다', stat: (w) => { const s = fireStat(w); return `날아가 ${s.radius.toFixed(1)}m 폭발, 적 모두 ${pct(s.mult)}, ${sec(s.cd)}`; } },
  dash: { name: '서리 고리', key: 'W', cap: '주변의 화살·화염구도 얼려 없앤다', stat: (w) => { const s = frostStat(w); return `${s.radius.toFixed(1)}m 안 적 ${pct(s.mult)} 후 ${sec(s.freeze)} 얼림, ${sec(s.cd)}`; } },
  shout: { name: '낙뢰', key: 'E 조준', cap: '범위 ×1.3, 기절 2배', stat: (w) => { const s = boltStat(w); return `${BOLT.range}m 안 지점 ${s.radius.toFixed(1)}m 적 모두 ${pct(s.mult)}, ${sec(s.stun)} 기절, ${sec(s.cd)}`; } },
  throw: { name: '마나 방패', key: 'R', cap: '방패가 깨지면(치유는 쓸 때) 주변 폭발', stat: (w) => { const s = wardStat(w); return `${WARD.time}초 동안 최대 체력 ${pct(s.absorb)}만큼 흡수, ${sec(s.cd)}`; } },
};
const WIZARD_TRAITS: Record<SkillName, [string, string][]> = {
  cleave: [
    ['불바다', '폭발한 자리가 3초 동안 불타 그 위의 적을 태운다'],
    ['관통', '적을 뚫고 지나가며 맞은 적마다 폭발한다'],
  ],
  dash: [
    ['얼음 감옥', '얼리는 시간 75% 증가'],
    ['서리 갑옷', '쓰면 5초 동안 받는 피해 −30%'],
  ],
  shout: [
    ['연쇄 번개', '맞은 적에서 가까운 적으로 세 번 더 튄다(60%)'],
    ['천둥', '범위 2배, 피해 70%, 벼락이 잇따라 쏟아진다'],
  ],
  throw: [
    ['치유', '방패 대신 즉시 최대 체력의 25% 회복'],
    ['반사', '방패가 막은 피해의 50%를 공격한 적에게 되돌린다'],
  ],
};
const SKILL_TEXTS: Record<HeroClass, SkillText> = { knight: KNIGHT_SKILLS, wizard: WIZARD_SKILLS };
const TRAIT_TEXTS: Record<HeroClass, Record<SkillName, [string, string][]>> = { knight: KNIGHT_TRAITS, wizard: WIZARD_TRAITS };
// 재사용 대기(초): 스킬 4칸 + 구르기·순간이동
const cooldowns = (w: World): Record<SkillName | 'roll', number> =>
  w.cls === 'wizard'
    ? { cleave: fireStat(w).cd, dash: frostStat(w).cd, shout: boltStat(w).cd, throw: wardStat(w).cd, roll: BLINK.cd }
    : { cleave: cleaveStat(w).cd, dash: dashStat(w).cd, shout: shoutStat(w).cd, throw: axeStat(w).cd, roll: ROLL.cd };
const KNIGHT_ICONS = [skillIcon, dashIcon, shoutIcon, throwIcon];

// 직업에 맞게 스킬 버튼 그림·구르기 글자·장비 칸 아이콘을 바꾼다(마법사 스킬 아이콘은 띠 한 장: 화염구·서리·낙뢰·방패·순간이동)
function showClass(c: HeroClass) {
  cls = c;
  SKILL_BUTTONS().forEach(([btn], k) => {
    btn.style.backgroundImage = `url(${c === 'wizard' ? wizardSkillIcons : KNIGHT_ICONS[k]})`;
    btn.style.backgroundSize = c === 'wizard' ? '200px 40px' : '';
    btn.style.backgroundPosition = c === 'wizard' ? `${-k * 40}px 0` : '';
  });
  const roll = $('#roll');
  roll.firstChild!.textContent = c === 'wizard' ? '이동' : '구르기';
  roll.title = c === 'wizard' ? `순간이동 (스페이스): 커서 쪽으로 ${BLINK.dist}m, 잠깐 무적, ${BLINK.cd}초` : '구르기 (스페이스): 3m 구르는 동안 무적, 1초';
  for (const slot of Object.values(gearSlots)) slot.style.backgroundImage = `url(${GEAR_ICONS[c]})`;
  shownRanks = '';
}

// 특성 고르기 창: 둘 중 하나. 이미 골랐으면 바꾸는 데 금화가 든다
export function showTraits(w: World, s: SkillName, onPick: (pick: number) => void) {
  const dlg = document.querySelector<HTMLDialogElement>('#traits')!;
  const now = w.traits[s];
  $('#traits-title').textContent = `${SKILL_TEXTS[cls][s].name} 특성` + (now ? ` — 바꾸기: 금화 ${TRAIT.respec} (지금 ${w.gold})` : ' — 하나를 고르세요');
  $('#traits-list').replaceChildren(
    ...TRAIT_TEXTS[cls][s].map(([name, text], k) => {
      const b = document.createElement('button');
      b.append(Object.assign(document.createElement('b'), { textContent: name + (now === k + 1 ? ' ✓' : '') }), Object.assign(document.createElement('small'), { textContent: text }));
      b.disabled = now === k + 1 || (now > 0 && w.gold < TRAIT.respec);
      b.addEventListener('click', () => {
        onPick(k + 1);
        dlg.close();
      });
      return b;
    }),
  );
  dlg.showModal();
}

// 스킬 버튼의 단계 숫자·[+]·툴팁(단계나 포인트가 바뀔 때만 다시 씀)
function showRanks(w: World) {
  const key = JSON.stringify([w.ranks, w.points, w.traits]);
  if (key === shownRanks) return;
  shownRanks = key;
  for (const [btn, s] of SKILL_BUTTONS()) {
    const r = w.ranks[s];
    const t = SKILL_TEXTS[cls][s];
    btn.querySelector('.rank')!.textContent = String(r);
    (btn.querySelector('.up') as HTMLElement).hidden = !w.points || r >= RANK_MAX;
    const star = btn.querySelector('.trait') as HTMLElement;
    star.hidden = r < TRAIT.rank;
    star.classList.toggle('new', !w.traits[s]);
    const picked = TRAIT_TEXTS[cls][s][w.traits[s] - 1];
    const trait = picked ? `\n특성 ★ ${picked[0]}: ${picked[1]}` : r >= TRAIT.rank ? '\n★를 눌러 특성 고르기' : `\n${TRAIT.rank}단계: 특성 둘 중 하나`;
    const next = r < RANK_MAX ? `\n다음 단계: ${t.stat({ ...w, ranks: { ...w.ranks, [s]: r + 1 } })}` : '\n(최고 단계)';
    btn.title = `${t.name} (${t.key}) · ${r}단계\n${t.stat(w)}${next}\n5단계: ${t.cap}${r >= RANK_MAX ? ' ✓' : ''}${trait}` + (w.points && r < RANK_MAX ? '\n[+] 또는 Shift+키: 단계 올리기' : '');
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
  move: (v) => `이동 속도 +${v}%`,
};

// 장비의 수치·옵션 설명 줄들
function gearLines(it: GearItem): string[] {
  const t = it.tier - 1;
  const c = CLASSES[cls];
  const wpn = c.weapons[t];
  const base = {
    weapon: `${cls === 'wizard' ? '마력탄' : '공격'} ${wpn.dmg[0]}–${wpn.dmg[1]}, ${wpn.interval}초`,
    armor: `받는 피해 −${Math.round(c.armors[t].reduce * 100)}%`,
    helm: `최대 체력 +${c.helms[t].hp}`,
    boots: `이동 속도 +${Math.round(c.boots[t].move * 100)}%`,
  }[it.kind];
  return [base, ...it.affixes.map((a) => AFFIX_TEXT[a.kind](a.value))];
}

// 장비 아이콘 위치(gear_icons.png = 무기 4 + 갑옷 4 + 투구 4 + 신발 4)
const iconX = (it: GearItem) => `${-(SLOTS.indexOf(it.kind) * 4 + it.tier - 1) * 40}px`;

// 장비 칸: 아이콘과 이름·수치·옵션(툴팁)
function showGear(w: World) {
  for (const kind of SLOTS) {
    const it: GearItem = { kind, tier: w.gear[kind], affixes: w.mods[kind] };
    const slot = gearSlots[kind];
    slot.style.backgroundPositionX = iconX(it);
    slot.title = `${nameOf(it.kind, it.tier, it.affixes)}\n${gearLines(it).join('\n')}\n눌러서 보관함 열기`;
    slot.dataset.q = String(it.affixes.length);
  }
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
  icon.style.backgroundImage = `url(${GEAR_ICONS[cls]})`;
  icon.style.backgroundPositionX = iconX(it);
  icon.dataset.q = String(it.affixes.length);
  const info = document.createElement('div');
  const name = Object.assign(document.createElement('b'), { className: `q${it.affixes.length}`, textContent: nameOf(it.kind, it.tier, it.affixes) + mark });
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
let selected: number | Slot = -1; // 보관함 창에서 고른 장비: 보관함 번호 또는 입은 부위(아래에 설명·버튼)
// 인형 위 장비 칸의 가운데(PORTRAIT 영역 픽셀): 머리·무기를 든 손·몸통·발
const DOLL_AT: Record<Slot, [number, number]> = { helm: [32, 11], weapon: [15, 27], armor: [33, 28], boots: [32, 50] };
const DOLL_SCALE = 5;

// 인형: 지금 장비를 입은 주인공 위에 부위별 칸. 칸을 누르면 고르고, 보관함 장비를 끌어다 놓으면 입는다
function showDoll(w: World, mark: (it: GearItem) => string, onPick: (s: Slot) => void) {
  const doll = $('#doll');
  const hero = doll.querySelector('canvas')!;
  void setHeroGear(w.gear, w.cls).then(() => drawHeroPortrait(hero, DOLL_SCALE));
  doll.replaceChildren(
    hero,
    ...SLOTS.map((kind) => {
      const it: GearItem = { kind, tier: w.gear[kind], affixes: w.mods[kind] };
      const el = Object.assign(document.createElement('div'), { className: `slot doll-slot${selected === kind ? ' sel' : ''}`, title: `${SLOT_NAME[kind]}: ${nameOf(kind, it.tier, it.affixes)}${mark(it)}\n${gearLines(it).join('\n')}` });
      el.dataset.slot = kind;
      el.dataset.q = String(it.affixes.length);
      el.dataset.name = SLOT_NAME[kind];
      el.style.left = `${(DOLL_AT[kind][0] / PORTRAIT.w) * 100}%`;
      el.style.top = `${(DOLL_AT[kind][1] / PORTRAIT.h) * 100}%`;
      el.style.backgroundImage = `url(${GEAR_ICONS[cls]})`;
      el.style.backgroundPositionX = iconX(it);
      el.onclick = () => onPick(kind);
      return el;
    }),
  );
}

// 끄는 장비 아래의 인형 칸(같은 부위일 때만). 끄는 그림 자체는 잠깐 숨기고 찾는다
function dollUnder(el: HTMLElement, kind: Slot, x: number, y: number): HTMLElement | null {
  el.style.visibility = 'hidden';
  const t = document.elementFromPoint(x, y)?.closest<HTMLElement>('.doll-slot');
  el.style.visibility = '';
  return t?.dataset.slot === kind ? t : null;
}

// 보관함 창: 격자에 놓인 장비를 누르면 고르고, 끌면 옮기고(인형 칸에 놓으면 입는다), 우클릭하면 입는다. 고친 뒤에는 다시 불러 갱신한다
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
      const el = Object.assign(document.createElement('div'), { className: i === selected ? 'bag-item sel' : 'bag-item', title: `${nameOf(it.kind, it.tier, it.affixes)}${mark(it)}\n${gearLines(it).join('\n')}` });
      el.dataset.q = String(it.affixes.length);
      el.style.gridArea = area(it.x, it.y, size);
      const icon = document.createElement('i');
      icon.style.backgroundImage = `url(${GEAR_ICONS[cls]})`;
      icon.style.backgroundPositionX = iconX(it);
      icon.style.scale = String((Math.min(...size) * cell - 4) / 40);
      el.append(icon);
      el.onpointerdown = (e) => {
        if (e.button === 2) return equip(i);
        if (e.button) return;
        el.setPointerCapture(e.pointerId);
        let [tx, ty] = [it.x, it.y];
        let target: HTMLElement | null = null; // 놓으면 입을 인형 칸
        el.onpointermove = (m) => {
          el.classList.add('drag');
          el.style.translate = `${m.clientX - e.clientX}px ${m.clientY - e.clientY}px`;
          tx = it.x + Math.round((m.clientX - e.clientX) / cell);
          ty = it.y + Math.round((m.clientY - e.clientY) / cell);
          target = dollUnder(el, it.kind, m.clientX, m.clientY);
          for (const s of document.querySelectorAll('.doll-slot')) s.classList.toggle('drop', s === target);
          shadow.hidden = !!target || tx < 0 || ty < 0 || tx + size[0] > BAG.w || ty + size[1] > BAG.h;
          shadow.style.gridArea = area(tx, ty, size);
          shadow.classList.toggle('bad', !bagFits(w.bag, it, tx, ty, i));
        };
        el.onpointercancel = () => showBag(w, h);
        el.onpointerup = () => {
          if (target) return equip(i);
          if (tx !== it.x || ty !== it.y) return h.move(i, tx, ty); // 못 놓는 자리면 제자리로
          selected = i;
          showBag(w, h);
        };
      };
      return el;
    }),
  );
  showDoll(w, mark, (s) => {
    selected = s;
    showBag(w, h);
  });
  const i = selected;
  const sel = typeof i === 'number' ? w.bag[i] : null;
  $('#bag-sel').replaceChildren(
    typeof i === 'string'
      ? gearRow({ kind: i, tier: w.gear[i], affixes: w.mods[i] }, ' — 입은 장비', [])
      : sel
        ? gearRow(sel, mark(sel), [
            ['장착', () => equip(i)],
            ['버리기', () => {
              selected = -1;
              h.discard(i);
            }],
          ])
        : Object.assign(document.createElement('small'), { textContent: w.bag.length ? '장비를 누르면 설명, 인형의 칸으로 끌거나 우클릭하면 장착.' : '비어 있습니다. 장비를 밟으면 여기로 들어옵니다.' }),
  );
  $('#bag-count').textContent = bagCount(w.bag);
  const auto = $('#auto-equip') as HTMLInputElement;
  auto.checked = w.autoEquip;
  auto.onchange = () => h.auto(auto.checked);
}

// 상점 화면. 항목을 누르면 onBuy, 팔면 onSell, '다음 층으로'는 onLeave, '이 층에 남기'·Esc는 onStay. 사고판 뒤에는 다시 불러 갱신한다
export function showShop(c: Wallet & { cls: HeroClass }, onBuy: (item: ShopItem) => void, onSell: (i: number) => void, onLeave: () => void, onStay: () => void) {
  cls = c.cls;
  const next = (t: number) => (t < 4 ? `(${t + 1}단계)` : '(최고 단계)');
  const label = (item: ShopItem) => {
    if (item === 'potion') return `체력 물약 1개 <small>(지금 ${c.potions}/8)</small>`;
    const [t, names] = [c.gear[item], gearTable(cls)[item]];
    return `${SLOT_NAME[item]} 강화: ${names[t - 1].name}${t < 4 ? ` → ${names[t].name}` : ''} <small>${next(t)}</small>`;
  };
  shopGold.textContent = String(c.gold);
  shopItems.replaceChildren(
    ...offers(c).map((o) => {
      const b = document.createElement('button');
      b.innerHTML = `${label(o.item)} — 금화 ${o.price}`;
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
        Object.assign(document.createElement('span'), { className: `q${it.affixes.length}`, textContent: nameOf(it.kind, it.tier, it.affixes) }),
        ` — 금화 ${sellPrice(it)}`,
        Object.assign(document.createElement('small'), { textContent: gearLines(it).join(' · ') }),
      );
      b.addEventListener('click', once(() => onSell(i)));
      return b;
    }),
  );
  let stay = true; // Esc는 되돌릴 수 있는 쪽(남기)으로
  $('#shop-leave').onclick = () => {
    stay = false;
    shop.close();
  };
  $('#shop-stay').onclick = () => shop.close();
  shop.onclose = () => (stay ? onStay() : onLeave());
  if (!shop.open) shop.showModal();
}

// 매 프레임. hovered: 마우스가 올라간 몬스터 id, choosing: 이어하기를 고르는 중(배너를 건드리지 않음)
// lostGold: 이번 죽음에서 잃은 금화
export function updateHud(world: World, hovered: number | null, choosing: boolean, stats: Stats, lostGold = 0) {
  const hero = world.entities[0];
  if (world !== shownWorld) {
    shownWorld = world;
    if (world.cls !== cls) showClass(world.cls);
    shownLevel = 0;
    shownGear = '';
    shownBag = world.bag.length;
    shownBlocked = false;
    shownTraitHint.clear();
    shownGateHint = false;
  }
  heroFill.style.width = `${(hero.hp / hero.maxHp) * 100}%`;
  danger.style.opacity = String(hero.state === 'dead' ? 0 : Math.min(1, Math.max(0, 1 - hero.hp / hero.maxHp / DANGER) * 1.5)); // 약 12% 아래에서 가장 짙다
  xpFill.style.width = `${(world.xp / xpToNext(world.level)) * 100}%`;
  levelLabel.textContent = `Lv ${world.level}` + (world.points ? ` · 스킬 +${world.points}` : '');
  if (shownLevel && world.level > shownLevel) say(`레벨 업! Lv ${world.level}`);
  shownLevel = world.level;
  const cd = cooldowns(world); // 재사용 대기 남은 비율
  skillShade.style.height = `${(world.skillCd / cd.cleave) * 100}%`;
  dashShade.style.height = `${(world.dashCd / cd.dash) * 100}%`;
  $('#shout i').style.height = `${(world.shoutCd / cd.shout) * 100}%`;
  $('#throw i').style.height = `${(world.throwCd / cd.throw) * 100}%`;
  $('#roll i').style.height = `${(world.rollCd / cd.roll) * 100}%`;
  showRanks(world);
  // 3단계가 된 순간 특성을 고르라고 알린다
  const fresh = (Object.keys(world.ranks) as SkillName[]).find((s) => world.ranks[s] >= TRAIT.rank && !world.traits[s] && !shownTraitHint.has(s));
  if (fresh) {
    shownTraitHint.add(fresh);
    if (shownLevel) say(`${SKILL_TEXTS[cls][fresh].name} 특성을 고를 수 있습니다 — 스킬 버튼의 ★`);
  }
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
      const changed = (k: Slot) => g0[k] !== world.gear[k] || JSON.stringify(m0[k]) !== JSON.stringify(world.mods[k]);
      for (const k of SLOTS) {
        if (!changed(k)) continue;
        worn = true;
        say(`${nameOf(k, world.gear[k], world.mods[k])} 장착`);
      }
    }
    shownGear = key;
    showGear(world);
    void setHeroGear(world.gear, world.cls);
  }
  // 장착 알림이 없을 때만 줍기 알림(자동 장착은 벗은 장비가 보관함으로 들어온다)
  const got = world.bag.at(-1);
  if (got && world.bag.length > shownBag && !worn) say(`${nameOf(got.kind, got.tier, got.affixes)} — 보관함으로`);
  shownBag = world.bag.length;
  const blocked = bagBlocked(world);
  if (blocked && !shownBlocked && !worn) say('보관함에 자리가 없습니다');
  shownBlocked = blocked;
  // 닫힌 사슬 문에 처음 다가가면 여는 법을 알린다
  if (!shownGateHint && world.gates.some((g) => !g.open && Math.hypot(g.x + 0.5 - hero.x, g.z + 0.5 - hero.z) < 3.5)) {
    shownGateHint = true;
    say(world.cls === 'wizard' ? '사슬로 묶인 문 — 화염구(Q)로 사슬을 끊으세요' : '사슬로 묶인 문 — 도끼(R)를 던져 사슬을 끊으세요');
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
  if (o === 'dead') bannerText.textContent = '사망했습니다' + (lostGold ? ` — 금화 ${lostGold}을 잃었습니다` : '');
  if (o === 'clear') {
    bannerText.textContent = `${STATS.boss.name}를 쓰러뜨렸습니다! 클리어!`;
    summary.textContent = `플레이 시간 ${formatTime(stats.time)} · 처치 ${stats.kills} · 사망 ${stats.deaths} · Lv ${world.level}`;
  }
  summary.hidden = nextCycleBtn.hidden = o !== 'clear';
  restartBtn.textContent = o === 'clear' ? '처음부터 (R)' : '다시 시작 (R)';
}
