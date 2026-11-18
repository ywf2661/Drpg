// 화면 위 HTML: 체력·경험치·레벨, 물약·스킬·장비 칸, 대상·보스 체력바, 층 제목, 알림, 배너. 게임 상태를 읽어 그리기만 한다.
import gearIcons from './assets/sprites/gear_icons.png';
import wizardGearIcons from './assets/sprites/wizard_gear_icons.png';
import wizardSkillIcons from './assets/sprites/wizard_skill_icons.png';
import rangerGearIcons from './assets/sprites/ranger_gear_icons.png';
import rangerSkillIcons from './assets/sprites/ranger_skill_icons.png';
import necroSkillIcons from './assets/sprites/necro_skill_icons.png';
import potionIcon from './assets/sprites/potion_icon.png';
import skillIcon from './assets/sprites/skill_icon.png';
import dashIcon from './assets/sprites/dash_icon.png';
import shoutIcon from './assets/sprites/shout_icon.png';
import throwIcon from './assets/sprites/throw_icon.png';
import knightPortrait from './assets/sprites/portrait_hero.png';
import wizardPortrait from './assets/sprites/portrait_wizard.png';
import rangerPortrait from './assets/sprites/portrait_ranger.png';
import necroPortrait from './assets/sprites/portrait_necromancer.png';
import { renderer } from './render/render';
import { edgeLeft } from './render/edge';
import { campfire } from './render/campfire';
import { drawHeroPortrait, looksOf, paintPortrait, PORTRAIT, setHeroGear } from './render/sprites';
import type { SoundSettings } from './audio/sound';
import { formatTime, type Run, type Stats } from './save';
import { offers, sellPrice, type ShopItem, type Wallet } from './shop';
import { gearName } from './render/labels';
import { FLOORS } from './sim/dungeon';
import { BUFFS, TREASURE, TRIAL, quality, setCount, SET_HUNTER, UNIQUES, uniqueOf, gearBonus, rank, canAfford, RESOURCE, resMax, skillCost, arrowStormStat, markStat, grazeStat, echoStat, flashStat, flameEdgeStat, frostEdgeStat, reforgeStat, unleashStat, TEMPER, CUT, GRAZE, FLASH, axeStat, axeStormStat, AXES, BAG, bagBlocked, bagFits, BLINK, blizzardStat, BOLT, BONE_ARMOR, BONE_MASTERY, boneArmorStat, bonesStat, boltStat, bossName, bounceStat, BURST, burstStat, CHAIN, chainStat, CLASSES, cleaveStat, COMBO, COMET, cometStat, CORPSE, corpseStat, CRIT, critStat, CURSE_MASTERY, curseStat, dashStat, DOWNPOUR, downpourStat, DRAIN, ELITE_KINDS, EMBERS, embersStat, EXECUTE, executeStat, FIREFIELD, firefieldStat, fireRainStat, fireStat, FOCUS, focusStat, FROST_ARMOR, frostArmorStat, frostStat, gearDiff, gearSize, giantStat, huntStat, isPassive, KEY_CD, KEY_LABEL, KEYS, LANDS, LEAP, leapStat, learnBlock, LORD, lordStat, mastered, monsterName, outcome, pierceStat, PLAGUE, plagueStat, POTION, PRISON, prisonStat, PUSH, pushStat, RANGER, RAIN, rainStat, RANK_MAX, RESPEC, ROLL, shoutStat, SKILLS, SLOTS, snareStat, spearStat, spreadStat, staticStat, tempestStat, TRAP, trapStat, trailStat, TREES, WARD, wardStat, whirlStat, xpToNext, type Affix, type BagItem, type GearItem, type HeroClass, type Land, type SkillId, type SkillName, type Slot, type World } from './sim/world';

export const $ = (sel: string) => document.querySelector<HTMLElement>(sel)!;
const heroFill = $('#hp i');
const xpFill = $('#xp i');
const resBar = $('#res');
const resFill = $('#res i');
const resName = (c: HeroClass) => (RESOURCE[c] === 'energy' ? '기력' : '마나');
const levelLabel = $('#level');
const pointsHint = $('#points');
const target = $('#target');
const targetName = $('#target span');
const targetFill = $('#target i');
const targetNote = $('#target small');
const bossBar = $('#boss');
const bossFill = $('#boss i');
const bossLabel = $('#boss span');
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
const dashBtn = $('#dash');
const shoutBtn = $('#shout');
const throwBtn = $('#throw');
const gearSlots: Record<Slot, HTMLElement> = { weapon: $('#weapon'), armor: $('#armor'), helm: $('#helm'), boots: $('#boots') };
const SLOT_NAME: Record<Slot, string> = { weapon: '무기', armor: '갑옷', helm: '투구', boots: '신발' };
let cls: HeroClass = 'knight'; // 지금 판의 직업(장비 이름·아이콘·스킬 설명). 층이 바뀔 때·상점을 열 때 맞춘다
const GEAR_ICONS: Record<HeroClass, string> = { knight: gearIcons, wizard: wizardGearIcons, ranger: rangerGearIcons, necromancer: wizardGearIcons };
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
let shownGatesOpen = 0; // 열린 사슬 문 수(늘면 알림)
let shownGimmick = ''; // 기믹 알림(성소 버프·시련 물결·보물 고블린)을 띄운 상태
let shownWorld: World | null = null; // 층이 바뀌면(이어하기·재시작 포함) 알림 없이 표시만 맞춘다

type Handlers = { drink(): void; skill(): void; dash(): void; shout(): void; throwAxe(): void; roll(): void; learn(s: SkillName): void; tree(): void; bag(): void; restart(): void; nextCycle(): void; toggleMap(): void; sound(patch: Partial<SoundSettings>): void; resume(slot: number): void; pick(cls: HeroClass, name: string, slot: number): void; smart(on: boolean): void; smartOn(): boolean };

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
    btn.append(Object.assign(document.createElement('em'), { className: 'charges' })); // 벼림: 남은 충전
    const up = Object.assign(document.createElement('span'), { className: 'up', textContent: '+', hidden: true });
    up.addEventListener('click', (e) => {
      e.stopPropagation();
      h.learn(s);
    });
    btn.append(rank, up);
  }
  $('#tree-btn').addEventListener('click', h.tree);
  pointsHint.addEventListener('click', h.tree);
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
  continueBtn.addEventListener('click', () => showSlots('load'));
  $('#title-new').addEventListener('click', () => showSlots('new'));
  $('#slots-back').addEventListener('click', () => showScreen('main'));
  $('#title-slots').addEventListener('keydown', (e) => e.key === 'Escape' && showScreen('main'));
  $('#slot-list').addEventListener('click', (e) => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('button');
    if (!btn) return;
    const n = +btn.dataset.slot!;
    const s = slotList[n];
    if (slotMode === 'load') return s && h.resume(n);
    if (s && !confirm(`슬롯 ${n + 1}의 「${s.name}」 기록을 지우고 새로 시작할까요?`)) return;
    chosenSlot = n;
    nameInput.value = '';
    showScreen('pick');
  });
  nameInput.addEventListener('keydown', (e) => e.key === 'Enter' && title.querySelector<HTMLElement>(`.class-card[data-cls="${picked}"]`)!.focus());
  $('#title-sound').addEventListener('click', () => soundBtn.click());
  $('#title-help').addEventListener('click', () => $('#help-btn').click());
  $('#pick-back').addEventListener('click', () => showSlots('new'));
  $('#title-pick').addEventListener('keydown', (e) => e.key === 'Escape' && showSlots('new'));
  $('#pick-go').addEventListener('click', () => {
    nameInput.value = nameInput.value.trim();
    if (nameInput.reportValidity()) h.pick(picked, nameInput.value, chosenSlot);
  });
  for (const card of classCards()) {
    const c = card.dataset.cls as HeroClass;
    card.querySelector('img')!.src = PORTRAITS[c];
    card.addEventListener('click', () => selectClass(c));
  }
  selectClass(picked);
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

// 구역 이름표(늘 회차를 붙인다)와 그 아래 임무 줄
let shownCycle = 0;
export function showFloor(n: number, cycle: number, land: Land = 'dungeon', goal = '') {
  shownCycle = cycle;
  const place = land === 'camp' ? LANDS.camp.name : `${LANDS[land].name} ${n}${LANDS[land].unit}`;
  floorLabel.textContent = `${place} · ${cycle + 1}회차`;
  floorTitle.textContent = land !== 'camp' && n === FLOORS ? `${place} — ${bossName(LANDS[land].skins)}` : floorLabel.textContent;
  $('#quest').textContent = goal && `임무: ${goal}`;
  replay(floorTitle);
}

// 순찰대장의 말·단서 창. 닫으면 게임이 이어진다
const talkDlg = document.querySelector<HTMLDialogElement>('#talk')!;
export function showTalk(who: string, text: string) {
  $('#talk-who').textContent = who;
  $('#talk-text').textContent = text;
  if (!talkDlg.open) talkDlg.showModal();
}
export const talking = () => talkDlg.open;

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

const PORTRAITS: Record<HeroClass, string> = { knight: knightPortrait, wizard: wizardPortrait, ranger: rangerPortrait, necromancer: necroPortrait };
const CLASS_ORDER: HeroClass[] = ['knight', 'wizard', 'ranger', 'necromancer'];
const classCards = () => title.querySelectorAll<HTMLElement>('.class-card');
let picked: HeroClass = 'knight';
const nameInput = $('#pick-name') as HTMLInputElement;
let slotList: (Run | null)[] = [];
let slotMode: 'new' | 'load' = 'new';
let chosenSlot = 0;
let stopFire: (() => void) | null = null;

// 직업 선택: 고른 판이 넓어지며 설명이 나오고, 아래 버튼으로 시작한다
function selectClass(c: HeroClass) {
  picked = c;
  for (const card of classCards()) card.setAttribute('aria-pressed', String(card.dataset.cls === c));
  $('#pick-go').textContent = `${CLASSES[c].name}로 시작`; // 네 직업 이름이 모두 받침 없음
}

// 타이틀 안의 세 화면: 메뉴 → 저장 슬롯 → (새 게임이면) 아이디·직업 선택
function showScreen(which: 'main' | 'slots' | 'pick', focus = true) {
  for (const s of ['main', 'slots', 'pick']) $(`#title-${s}`).hidden = s !== which;
  if (!focus) return;
  const first = { main: () => $('#title-new'), slots: () => title.querySelector<HTMLElement>('#slot-list button:not(:disabled)')!, pick: () => nameInput }[which]();
  first.focus();
}

const placeOf = (r: Run) => (r.land === 'camp' ? LANDS.camp.name : `${LANDS[r.land].name} ${r.floor}${LANDS[r.land].unit}`);

// 저장 슬롯: 이어하기면 빈 슬롯은 못 고르고, 새 게임이면 찬 슬롯은 덮어쓸지 묻는다
function showSlots(mode: 'new' | 'load') {
  slotMode = mode;
  $('#slots-mode').textContent = mode === 'new' ? '새 게임' : '이어하기';
  $('#slot-list').replaceChildren(
    ...slotList.map((r, i) => {
      const b = document.createElement('button');
      b.dataset.slot = String(i);
      b.disabled = mode === 'load' && !r;
      b.append(Object.assign(document.createElement('b'), { textContent: r ? r.name : `슬롯 ${i + 1}` }));
      b.append(Object.assign(document.createElement('span'), { textContent: r ? `슬롯 ${i + 1} · ${CLASSES[r.cls].name} Lv ${r.level} · ${placeOf(r)}` : '비어 있음' }));
      return b;
    }),
  );
  showScreen('slots');
}

// 첫 화면: 제목·메뉴와 모닥불. 저장이 있으면 이어하기를 맨 위에, 첫 저장의 직업을 불 앞에 세운다
export function showTitle(open: boolean, slots: (Run | null)[] = slotList) {
  title.hidden = !open;
  stopFire?.();
  stopFire = null;
  if (!open) return;
  banner.hidden = true;
  slotList = slots;
  const saved = slots.find(Boolean) ?? null;
  continueBtn.hidden = !saved;
  continueBtn.classList.toggle('primary', !!saved);
  $('#title-new').classList.toggle('primary', !saved);
  const lead = saved?.cls ?? 'knight';
  const rest = CLASS_ORDER.filter((c) => c !== lead);
  for (const [slot, c] of [['fl', lead], ['bl', rest[0]], ['br', rest[1]], ['fr', rest[2]]] as const) $(`#camp-scene .slot-${slot}`).setAttribute('src', PORTRAITS[c]);
  showScreen('main', false);
  stopFire = campfire($('#campfire') as HTMLCanvasElement);
}

const SKILL_BUTTONS = (): [HTMLElement, SkillName][] => [[skillBtn, 'cleave'], [dashBtn, 'dash'], [shoutBtn, 'shout'], [throwBtn, 'throw']];
const pct = (v: number) => `${Math.round(v * 100)}%`;
const sec = (v: number) => `${+v.toFixed(1)}초`;
const m = (v: number) => `${+v.toFixed(1)}m`;
const wd = (v: number) => `무기 피해의 ${pct(v)}`;
const cd = (v: number) => ` · 재사용 대기 ${sec(v)}`;
// 스킬 설명: 이름, 한 줄 설명, 지금 단계의 수치(stat), 5단계 완성 효과(cap)
type SkillText = { name: string; desc: string; stat?: (w: World) => string; cap?: string };
const SKILL_TEXT: Record<SkillId, SkillText> = {
  // 기사
  cleave: { name: '가르기', desc: '앞쪽의 적을 한꺼번에 벤다. Q는 가까운 적 쪽으로, 우클릭은 커서 쪽으로 벤다', cap: '앞쪽 반원이 아니라 주위를 한 바퀴 벤다', stat: (w) => { const s = cleaveStat(w); return `${mastered(w, 'cleave') ? '주위' : '앞쪽 반원'} ${m(s.radius)} 안의 적 모두에게 ${wd(s.mult)}${cd(s.cd)}`; } },
  whirl: { name: '회오리', desc: '빙글빙글 돌며 걷는 동안 주변 적을 계속 벤다', cap: '1초 더 돈다', stat: (w) => { const s = whirlStat(w); return `${sec(s.time)} 동안 0.25초마다 ${m(s.radius)} 안의 적에게 ${wd(s.mult)}${cd(s.cd)}`; } },
  burst: { name: '시체 폭발', desc: '패시브 — 가르기·회오리·처형으로 쓰러뜨린 적이 터지며 주변을 태운다. 그 폭발로 죽은 적도 연달아 터진다', stat: (w) => `시체 최대 체력의 ${pct(burstStat(w).hp)} 피해 · 반경 ${BURST.radius}m` },
  execute: { name: '처형', desc: '눈앞의 적 하나를 벤다. 체력이 낮은 적은 단칼에 베어 버리고, 처치하면 주변 적이 겁에 질려 달아난다', stat: (w) => { const s = executeStat(w); return `체력 ${pct(s.below)} 이하면 즉사(보스 제외), 아니면 ${wd(s.mult)} · 공포 ${sec(EXECUTE.fear)}${cd(s.cd)}`; } },
  dash: { name: '돌진 베기', desc: '커서 쪽으로 돌진하며 지나는 길의 적을 벤다. 적을 맞히면 가르기를 바로 다시 쓸 수 있다', cap: '돌진으로 적을 처치하면 바로 다시 돌진할 수 있다', stat: (w) => { const s = dashStat(w); return `${s.dist}m 돌진, 지나는 길의 적에게 ${wd(s.mult)}${cd(s.cd)}`; } },
  shout: { name: '전투의 함성', desc: '주변 적을 기절시켜 밀어내고, 잠시 동안 받는 피해가 줄어든다', cap: '외칠 때 최대 체력의 15%를 회복한다', stat: (w) => { const s = shoutStat(w); return `${m(s.radius)} 안의 적 ${sec(s.stun)} 기절 · 받는 피해 −${pct(s.reduce)}${cd(s.cd)}`; } },
  trail: { name: '불길', desc: '패시브 — 돌진 베기로 지나간 자리가 3초 동안 불탄다', stat: (w) => `0.5초마다 ${wd(trailStat(w).mult)}` },
  leap: { name: '대지 강타', desc: '커서 지점으로 뛰어올라 내려찍는다. 착지 지점 주변의 적이 기절한다', stat: (w) => { const s = leapStat(w); return `최대 ${LEAP.range}m · ${s.radius}m 안의 적 모두에게 ${wd(s.mult)}, ${sec(LEAP.stun)} 기절${cd(s.cd)}`; } },
  throw: { name: '도끼 던지기', desc: '도끼를 던져 처음 맞는 적에게 피해를 준다. 사슬 문도 끊을 수 있다', cap: '도끼가 적을 꿰뚫고 날아간다', stat: (w) => { const s = axeStat(w); return `${mastered(w, 'throw') ? '지나는 길의 적 모두' : '처음 맞는 적'}에게 ${wd(s.mult)}${cd(s.cd)}`; } },
  bounce: { name: '튕기는 도끼', desc: '맞은 적에게서 가까운 적으로 튕겨 다니는 도끼를 던진다', cap: '튕기는 횟수가 두 배로 늘어난다', stat: (w) => { const s = bounceStat(w); return `${wd(s.mult)} · ${s.count}번 튕김${cd(s.cd)}`; } },
  axes: { name: '도끼 숙련', desc: '패시브 — 도끼 스킬(던지기·튕기는 도끼·도끼 폭풍)을 더 자주, 더 세게 쓴다', stat: (w) => `재사용 대기 −${pct(AXES.cd * Math.max(1, w.ranks.axes ?? 0))} · 피해 +${pct(AXES.dmg * Math.max(1, w.ranks.axes ?? 0))}` },
  axeStorm: { name: '도끼 폭풍', desc: '사방으로 도끼를 한꺼번에 던진다. 모든 도끼가 적을 꿰뚫는다', stat: (w) => { const s = axeStormStat(w); return `도끼 ${s.count}자루, 각각 ${wd(s.mult)}${cd(s.cd)}`; } },
  mark: { name: '그어두기', desc: '앞을 베어 바닥에 칼선을 남긴다. 칼선은 1초 뒤에 베이고, 그때 칼선 위에 있는 적과 처음에 벤 적이 맞는다', cap: '앞쪽 반원이 아니라 주위를 한 바퀴 벤다', stat: (w) => { const s = markStat(w); return `벨 때 ${wd(s.mult)} · ${sec(CUT.delay)} 뒤 칼선 ${wd(s.cut)}${cd(s.cd)}`; } },
  graze: { name: '스쳐 베기', desc: '순식간에 앞으로 지나간다. 지나간 길에 칼선이 남고, 1초 뒤에 베인다. 지나가는 동안은 맞지 않는다', cap: '칼선에 베여 죽은 적이 있으면 바로 다시 쓸 수 있다', stat: (w) => { const s = grazeStat(w); return `${m(GRAZE.dist)} 지나간 길에 칼선 ${wd(s.cut)}${cd(s.cd)}`; } },
  echo: { name: '칼의 여운', desc: '패시브 — 베는 스킬을 두 번 쓰면, 다음에 쓰는 가르기·회오리·처형·돌진 베기·대지 강타가 벤 모양 그대로 칼선을 남긴다', stat: (w) => `칼선 ${wd(echoStat(w).cut)}` },
  flash: { name: '일섬', desc: '적 사이를 번개처럼 꿰뚫는다. 지나는 동안은 맞지 않는다. 끝에서 칼을 넣는 순간 바닥의 칼선이 모두 한꺼번에 베인다', stat: (w) => { const s = flashStat(w); return `${m(FLASH.range)} 안의 적 최대 ${s.max}명 · 지날 때 ${wd(s.mult)} · 지나온 길에 칼선 ${wd(s.cut)}${cd(s.cd)}`; } },
  flameEdge: { name: '불 벼림', desc: '칼에 불을 입힌다. 칼로 벨 때마다 충전 하나를 쓰고, 맞은 적마다 불꽃 피해를 더 준다', cap: '충전을 다 쓰는 마지막 휘두름이 맞힌 적 자리에서 작은 화염 폭발', stat: (w) => { const s = flameEdgeStat(w); return `충전 ${s.charges} · 맞은 적마다 ${wd(s.mult)} 불꽃 피해${cd(s.cd)}`; } },
  frostEdge: { name: '서리 벼림', desc: '칼에 서리를 입힌다. 칼로 벨 때마다 충전 하나를 쓰고, 같은 적을 여러 번 베면 얼어붙는다', cap: '두 번만 맞혀도 언다', stat: (w) => { const s = frostEdgeStat(w); return `충전 ${s.charges} · 같은 적을 ${s.hits}번 베면 ${sec(s.freeze)} 빙결${cd(s.cd)}`; } },
  reforge: { name: '덧벼림', desc: '패시브 — 충전이 남은 채 다른 벼림을 쓰면 남은 충전이 주위로 한꺼번에 터진다(서리는 얼린다). 벼림 충전도 늘어난다', stat: (w) => { const s = reforgeStat(w); return `${m(s.radius)} 안의 적에게 남은 충전 하나당 ${wd(s.mult)} · 서리는 ${sec(TEMPER.reforgeFreeze)} 빙결 · 벼림 충전 ${flameEdgeStat(w).charges}`; } },
  unleash: { name: '검기 해방', desc: '불과 서리가 함께 깃든다(충전 없이). 그동안 휘두를 때마다 칼날의 빛이 앞으로 날아가 벤다. 해방 중엔 다른 벼림을 쓸 수 없다', stat: (w) => { const s = unleashStat(w); return `${sec(s.time)} 동안 · 앞쪽 ${m(TEMPER.len)} 참격 ${wd(s.mult)}${cd(s.cd)}`; } },
  // 마법사
  fireball: { name: '화염구', desc: '부딪히면 터지는 불덩이를 던진다. 우클릭은 커서 쪽으로 던진다', cap: '불덩이가 세 갈래로 날아간다', stat: (w) => { const s = fireStat(w); return `폭발 반경 ${m(s.radius)} 안의 적 모두에게 ${wd(s.mult)}${cd(s.cd)}`; } },
  firefield: { name: '불바다', desc: '지정한 곳을 불바다로 만든다', stat: (w) => { const s = firefieldStat(w); return `반경 ${m(s.radius)}, ${sec(FIREFIELD.time)} 동안 0.5초마다 ${wd(s.mult)}${cd(s.cd)}`; } },
  embers: { name: '잔불', desc: '패시브 — 화염구가 터진 자리에 잠시 불길이 남는다', stat: (w) => { const s = embersStat(w); return `반경 ${EMBERS.radius}m, ${sec(s.time)} 동안 0.5초마다 ${wd(s.mult)}`; } },
  comet: { name: '운석', desc: '잠시 뒤 지정한 곳에 운석이 떨어지고, 떨어진 자리가 불탄다', stat: (w) => { const s = cometStat(w); return `${sec(COMET.delay)} 뒤 반경 ${s.radius}m 안의 적 모두에게 ${wd(s.mult)}${cd(s.cd)}`; } },
  frost: { name: '서리 고리', desc: `주변 적에게 피해를 주고 얼린다. 얼어붙은 적은 스킬에 ${COMBO.stunned}배 피해를 입는다`, cap: '주변의 화살과 화염구도 얼려서 없앤다', stat: (w) => { const s = frostStat(w); return `${m(s.radius)} 안의 적에게 ${wd(s.mult)}, ${sec(s.freeze)} 빙결${cd(s.cd)}`; } },
  ward: { name: '마나 방패', desc: '피해를 흡수하는 방패를 두른다. 막아 낸 피해의 일부를 공격한 적에게 되돌려 준다', cap: '방패가 깨질 때 주변에 폭발을 일으킨다', stat: (w) => { const s = wardStat(w); return `${WARD.time}초 동안 최대 체력의 ${pct(s.absorb)}까지 흡수 · ${pct(WARD.reflect)} 반사${cd(s.cd)}`; } },
  frostArmor: { name: '서리 갑옷', desc: `패시브 — 서리 고리·마나 방패·눈보라를 쓰면 ${FROST_ARMOR.time}초 동안 받는 피해가 줄어든다`, stat: (w) => `받는 피해 −${pct(frostArmorStat(w).reduce)}` },
  blizzard: { name: '눈보라', desc: '몸 주위를 따라다니는 눈보라를 일으킨다. 닿는 적을 계속 때리고 얼린다', stat: (w) => { const s = blizzardStat(w); return `${sec(s.time)} 동안 반경 ${s.radius}m, 0.5초마다 ${wd(s.mult)}${cd(s.cd)}`; } },
  lightning: { name: '낙뢰', desc: '지정한 곳에 벼락을 내린다. 맞은 적은 기절한다', cap: '범위 1.3배, 기절 시간 2배', stat: (w) => { const s = boltStat(w); return `사거리 ${BOLT.range}m · 반경 ${m(s.radius)} 안의 적 모두에게 ${wd(s.mult)}, ${sec(s.stun)} 기절${cd(s.cd)}`; } },
  chain: { name: '연쇄 번개', desc: '적을 맞힌 벼락이 가까운 적에게 차례로 옮겨 간다', stat: (w) => { const s = chainStat(w); return `${wd(s.mult)} · ${s.count}번 옮겨 감(옮겨 간 뒤에는 ${pct(CHAIN.hop)})${cd(s.cd)}`; } },
  static: { name: '정전기', desc: '패시브 — 마력탄에 맞은 적 옆의 적에게도 전기가 튄다', stat: (w) => { const s = staticStat(w); return `${s.count}명에게 ${wd(s.mult)} (3단계부터 2명)`; } },
  tempest: { name: '천둥 폭풍', desc: '지정한 곳 주변에 벼락이 연달아 쏟아진다', stat: (w) => { const s = tempestStat(w); return `벼락 ${s.strikes}번, 각각 ${wd(s.mult)}${cd(s.cd)}`; } },
  // 궁수
  pierce: { name: '관통 사격', desc: '지나는 길의 적을 모두 꿰뚫는 화살을 쏜다. 우클릭은 커서 쪽으로 쏜다', cap: '한 발이 더 뒤따라 날아간다', stat: (w) => { const s = pierceStat(w); return `일직선 위의 적 모두에게 ${wd(s.mult)}${cd(s.cd)}`; } },
  spread: { name: '세 갈래', desc: '적을 꿰뚫는 화살을 부채꼴로 여러 발 쏜다', cap: '다섯 발을 쏜다', stat: (w) => { const s = spreadStat(w); return `${s.count}발, 각각 ${wd(s.mult)}${cd(s.cd)}`; } },
  crit: { name: '치명', desc: '패시브 — 화살(평타·스킬)이 일정 확률로 2배 피해를 준다', stat: (w) => `확률 ${pct(Math.max(CRIT.chance, critStat(w).chance))}` },
  focus: { name: '집중', desc: '잠시 공격 속도가 빨라지고 화살을 두 발씩 쏜다', cap: '집중 중에 적을 처치하면 재사용 대기 시간이 1초 줄어든다', stat: (w) => { const s = focusStat(w); return `${sec(s.time)} 동안 공격 속도 +${pct(FOCUS.speed)}${cd(s.cd)}`; } },
  trap: { name: '덫', desc: '밟은 적을 붙잡는 덫을 놓는다', cap: '덫이 닫힐 때 주변 적도 붙잡는다', stat: (w) => { const s = trapStat(w); return `사거리 ${TRAP.range}m, 최대 ${s.max}개 · 밟은 적에게 ${wd(s.mult)}, ${sec(s.hold)} 속박${cd(s.cd)}`; } },
  push: { name: '밀쳐내기 사격', desc: '맞은 적을 멀리 밀쳐 내는 관통 화살을 쏜다. 벽에 부딪힌 적은 기절한다', stat: (w) => { const s = pushStat(w); return `${wd(s.mult)} · 벽에 부딪히면 ${sec(PUSH.stun)} 기절${cd(s.cd)}`; } },
  snare: { name: '덫 숙련', desc: '패시브 — 덫을 하나 더 놓을 수 있고, 더 오래 붙잡으며, 닫힐 때 주변 적도 다친다', stat: (w) => `반경 ${TRAP.radius}m 안의 적에게 덫 피해의 ${pct(snareStat(w).blast)}` },
  hunt: { name: '사냥터', desc: '지정한 곳 둘레에 덫을 둥글게 한꺼번에 깐다(개수 제한 없음)', stat: (w) => { const s = huntStat(w); return `덫 ${s.count}개, 각각 ${wd(s.mult)}${cd(s.cd)}`; } },
  rain: { name: '화살비', desc: '잠시 뒤 지정한 곳에 화살이 비처럼 쏟아진다', cap: '범위 1.3배', stat: (w) => { const s = rainStat(w); return `사거리 ${RAIN.range}m · ${sec(RAIN.delay)} 뒤 반경 ${m(s.radius)} 안의 적 모두에게 ${wd(s.mult)}${cd(s.cd)}`; } },
  fireRain: { name: '불화살', desc: '불붙은 화살비를 내린다. 떨어진 자리가 3초 동안 불탄다', stat: (w) => { const s = fireRainStat(w); return `반경 ${m(s.radius)} 안의 적 모두에게 ${wd(s.mult)}, 이어서 불길${cd(s.cd)}`; } },
  downpour: { name: '폭우', desc: `패시브 — 화살비·불화살이 몇 차례 더 쏟아진다(한 번에 ${pct(DOWNPOUR.mult)} 피해)`, stat: (w) => `${Math.max(1, downpourStat(w).waves)}번 더` },
  arrowStorm: { name: '화살 폭풍', desc: '주변 곳곳에 화살비가 연달아 쏟아진다', stat: (w) => { const s = arrowStormStat(w); return `화살비 ${s.count}번, 각각 ${wd(s.mult)}${cd(s.cd)}`; } },
  // 강령술사
  bones: { name: '해골 소환', desc: '함께 싸울 해골을 일으킨다. 2단계부터 궁수, 4단계부터 법사가 섞인다. 다시 쓰면 먼저 부른 해골은 물러난다', cap: '해골을 한 기 더 일으킨다', stat: (w) => { const s = bonesStat(w); return `${s.count}기(최대 ${s.max}기) · 체력 ${s.hp} · ${wd(s.mult)}${cd(s.cd)}`; } },
  giant: { name: '시체 거인', desc: '튼튼한 시체 거인을 하나 불러낸다. 나타날 때 주변 적의 시선을 끈다', cap: '쓰러질 때 터지며 주변 적에게 피해를 준다', stat: (w) => { const s = giantStat(w); return `체력 ${s.hp} · ${wd(s.mult)}${cd(s.cd)}`; } },
  boneMastery: { name: '해골 숙련', desc: `패시브 — 해골이 더 강하고 튼튼해진다. ${BONE_MASTERY.at}단계부터 해골이 한 기 더 나온다`, stat: (w) => `피해 +${pct(BONE_MASTERY.mult * Math.max(1, w.ranks.boneMastery ?? 0))} · 체력 +${pct(BONE_MASTERY.hp * Math.max(1, w.ranks.boneMastery ?? 0))}` },
  lord: { name: '해골 왕 강림', desc: '가장 강한 소환수인 해골 왕을 불러낸다. 휘두르면 주변 적까지 함께 베고, 머무는 동안 다른 소환수가 강해진다', cap: '해골 둘을 거느리고 온다', stat: (w) => { const s = lordStat(w); return `${sec(s.life)} 동안 · 체력 ${s.hp} · 반경 ${LORD.splash}m 안의 적에게 ${wd(s.mult)}${cd(s.cd)}`; } },
  curse: { name: '죽음의 표식', desc: '땅에 표식을 새긴다. 표식 안의 적은 피해를 더 받고, 소환수가 먼저 공격한다. 사슬 문도 녹인다', cap: '표식 안의 시체가 해골로 일어난다', stat: (w) => { const s = curseStat(w); return `반경 ${m(s.radius)}, ${sec(s.time)} 동안 받는 피해 +${pct(s.amp)}${cd(s.cd)}`; } },
  plague: { name: '역병', desc: '지정한 곳에 역병을 퍼뜨린다. 그 안의 적은 계속 피해를 입는다', stat: (w) => { const s = plagueStat(w); return `반경 ${m(s.radius)}, ${sec(PLAGUE.time)} 동안 0.5초마다 ${wd(s.mult)}${cd(s.cd)}`; } },
  curseMastery: { name: '표식 숙련', desc: '패시브 — 죽음의 표식이 넓어지고, 표식 안의 적이 받는 피해가 더 커진다', stat: (w) => `범위 +${pct(CURSE_MASTERY.radius * Math.max(1, w.ranks.curseMastery ?? 0))} · 받는 피해 +${pct(CURSE_MASTERY.amp * Math.max(1, w.ranks.curseMastery ?? 0))}p` },
  corpseBlast: { name: '시체 폭발', desc: '지정한 곳 주변의 시체를 모두 터뜨린다. 폭발로 죽은 적도 연달아 터진다. 시체가 없으면 쓸 수 없다', stat: (w) => { const s = corpseStat(w); return `시체 최대 체력의 ${pct(s.hp)} 피해 · 반경 ${CORPSE.blast}m${cd(s.cd)}`; } },
  spear: { name: '뼈 창', desc: '지나는 길의 적을 모두 꿰뚫는 뼈 창을 던진다', stat: (w) => { const s = spearStat(w); return `${wd(s.mult)}${cd(s.cd)}`; } },
  boneArmor: { name: '뼈 갑옷', desc: '피해를 흡수하는 뼈 갑옷을 두른다', stat: (w) => { const s = boneArmorStat(w); return `${BONE_ARMOR.time}초 동안 최대 체력의 ${pct(s.absorb)}까지 흡수${cd(s.cd)}`; } },
  drain: { name: '생명 흡수', desc: '패시브 — 나와 해골이 준 피해의 일부만큼 체력을 회복한다', stat: (w) => `준 피해의 ${pct(DRAIN.per * Math.max(1, w.ranks.drain ?? 0))}` },
  prison: { name: '뼈 감옥', desc: '지정한 곳 주변의 적을 뼈 감옥에 가둔다', stat: (w) => { const s = prisonStat(w); return `반경 ${m(s.radius)} 안의 적에게 ${wd(s.mult)} · ${sec(s.time)} 속박(보스 ${sec(PRISON.big)})${cd(s.cd)}`; } },
};
export const skillName = (id: SkillId) => SKILL_TEXT[id].name;

// 스킬 아이콘: 직업의 아이콘 띠(스킬 4칸 + 스페이스)에서 몇 번째 그림인가. 새 스킬은 같은 계열 그림을 빌리고 이름 두 글자를 얹는다
// ponytail: 트리 스킬 그림이 생기면 ICON을 그 띠로 바꾸고 이름 글자를 뺄 것
const ICON: Record<SkillId, number> = {
  cleave: 0, whirl: 0, burst: 0, execute: 0, dash: 1, shout: 2, trail: 1, leap: 1, throw: 3, bounce: 3, axes: 3, axeStorm: 3,
  fireball: 0, firefield: 0, embers: 0, comet: 0, frost: 1, ward: 3, frostArmor: 1, blizzard: 1, lightning: 2, chain: 2, static: 2, tempest: 2,
  pierce: 0, spread: 0, crit: 0, focus: 3, trap: 1, push: 0, snare: 1, hunt: 1, rain: 2, fireRain: 2, downpour: 2, arrowStorm: 2,
  bones: 0, giant: 1, boneMastery: 0, lord: 3, curse: 2, plague: 2, curseMastery: 2, corpseBlast: 2, spear: 0, boneArmor: 1, drain: 2, prison: 2,
  mark: 0, graze: 1, echo: 0, flash: 1,
  flameEdge: 0, frostEdge: 0, reforge: 0, unleash: 1,
};
const KNIGHT_ICONS = [skillIcon, dashIcon, shoutIcon, throwIcon];
const SKILL_STRIPS: Partial<Record<HeroClass, string>> = { wizard: wizardSkillIcons, ranger: rangerSkillIcons, necromancer: necroSkillIcons };
const ORIGINAL = new Set<SkillId>(['cleave', 'dash', 'shout', 'throw', 'fireball', 'frost', 'lightning', 'ward', 'pierce', 'trap', 'rain', 'focus', 'bones', 'giant', 'curse', 'lord']);
function paintIcon(el: HTMLElement, id: SkillId | null, size: number) {
  const strip = id && SKILL_STRIPS[SKILLS[id].cls];
  el.style.backgroundImage = id ? `url(${strip ?? KNIGHT_ICONS[ICON[id]]})` : 'none';
  el.style.backgroundSize = strip ? `${size * 5}px ${size}px` : `${size}px ${size}px`;
  el.style.backgroundPosition = strip ? `${-ICON[id!] * size}px 0` : '';
  el.dataset.tag = id && !ORIGINAL.has(id) ? SKILL_TEXT[id].name.replace(/\s/g, '').slice(0, 2) : '';
}

// 직업에 맞게 구르기 글자·장비 칸 아이콘을 바꾼다(스킬 버튼 그림은 끼운 스킬을 따라 showKeys가)
function showClass(c: HeroClass) {
  cls = c;
  const roll = $('#roll');
  roll.hidden = !ROLL.on;
  roll.firstChild!.textContent = c === 'wizard' ? '이동' : '구르기';
  roll.title = c === 'wizard' ? `순간이동 (스페이스): 커서 쪽으로 ${BLINK.dist}m, 잠깐 무적, ${BLINK.cd}초` : `구르기 (스페이스): ${ROLL.dist}m 구르는 동안 무적, ${ROLL.cd}초`;
  for (const slot of Object.values(gearSlots)) slot.style.backgroundImage = `url(${GEAR_ICONS[c]})`;
  resBar.className = RESOURCE[c]; // 기력 초록, 마나 파랑
  shownKeys = '';
}

// 스킬 한 줄 설명(툴팁·스킬 창): 지금 단계(안 배웠으면 1단계) 수치, 다음 단계, 5단계 효과
function skillLines(w: World, id: SkillId): string[] {
  const t = SKILL_TEXT[id];
  const r = w.ranks[id] ?? 0;
  const at = (n: number) => t.stat?.({ ...w, ranks: { ...w.ranks, [id]: n } }) ?? '';
  return [t.desc, isPassive(id) ? '' : `비용: ${resName(w.cls)} ${skillCost(w.cls, id)}`, r ? `현재: ${at(r)}` : `배우면: ${at(1)}`, r && r < RANK_MAX ? `다음 단계: ${at(r + 1)}` : '', t.cap ? `5단계 달성 시: ${t.cap}${mastered(w, id) ? ' ✓' : ''}` : '', r && gearBonus(w, id) ? `장비: +${rank(w, id) - r}단계${rank(w, id) > RANK_MAX ? ' (초월)' : ''}` : ''].filter(Boolean);
}

// 스킬 버튼: 끼운 스킬의 그림·단계·[+]·툴팁(칸·단계·포인트가 바뀔 때만 다시 씀)
const SKILL_PX = matchMedia('(pointer: coarse)').matches ? 56 : 40; // 터치 화면은 버튼이 크다(index.html의 @media (pointer: coarse))
let shownKeys = '';
function showKeys(w: World) {
  const key = JSON.stringify([w.ranks, w.points, w.keys, w.level, w.mods]);
  if (key === shownKeys) return;
  shownKeys = key;
  for (const [btn, k] of SKILL_BUTTONS()) {
    const id = w.keys[k];
    const r = id ? (w.ranks[id] ?? 0) : 0;
    paintIcon(btn, id, SKILL_PX);
    const rk = btn.querySelector<HTMLElement>('.rank')!;
    rk.textContent = id && r ? String(rank(w, id)) : '';
    rk.classList.toggle('boost', !!id && rank(w, id) > r); // 장비 보너스: 초록, 초월(6·7): 금색
    rk.classList.toggle('over', !!id && rank(w, id) > RANK_MAX);
    btn.classList.toggle('locked', !id);
    const up = !!id && !learnBlock(w, id);
    btn.classList.toggle('can', up || (!id && !!w.points));
    (btn.querySelector('.up') as HTMLElement).hidden = !up;
    btn.title = id ? `${SKILL_TEXT[id].name} (${KEY_LABEL[k]}) · ${r}단계\n${skillLines(w, id).join('\n')}` + (up ? '\n[+] 또는 Shift+키: 단계 올리기' : '') + '\nT: 스킬 창' : `${KEY_LABEL[k]} 칸 비어 있음 — T(스킬 창)에서 배운 스킬을 끼운다`;
  }
}

// 스킬 트리 창: 계열 탭 셋 중 고른 탭의 [1단계, 2단계, 패시브, 궁극기]. 배우기 [+], 칸 끼우기 Q W E R, 모두 되돌리기(금화)
let treeTab = 0; // 고른 탭(창을 닫았다 열어도 그대로)
export function showTree(w: World, h: { learn(id: SkillId): void; bind(key: SkillName, id: SkillId): void; respec(): void }) {
  const dlg = document.querySelector<HTMLDialogElement>('#tree')!;
  const el = (tag: string, cls = '', text = '') => Object.assign(document.createElement(tag), { className: cls, textContent: text });
  $('#tree-title').textContent = `스킬 — 포인트 ${w.points}` + (w.points ? ' (+로 배우기)' : '');
  // 탭 머리: 계열 이름 · 찍은 포인트, 지금 배울 수 있는 스킬이 있으면 ●
  const bar = el('nav', 'tabbar');
  TREES[w.cls].forEach((tab, i) => {
    const spent = tab.skills.reduce((s, id) => s + (w.ranks[id] ?? 0), 0);
    const b = el('button', i === treeTab ? 'on' : '', `${tab.name}${spent ? ` · ${spent}` : ''}${tab.skills.some((id) => !learnBlock(w, id)) ? ' ●' : ''}`);
    b.addEventListener('click', () => {
      treeTab = i;
      showTree(w, h);
    });
    bar.append(b);
  });
  $('#tree-tabs').replaceChildren(
    bar,
    ...[TREES[w.cls][treeTab]].map((tab) => {
      const col = el('section');
      for (const id of tab.skills) {
        const r = w.ranks[id] ?? 0;
        const block = learnBlock(w, id);
        const card = el('div', `sk${r ? '' : ' unlearned'}`);
        const icon = el('div', 'ic');
        paintIcon(icon, id, 32);
        const body = el('div', 'body');
        const head = el('div', 'head');
        const lv = el('span', 'lv', `${r}/${RANK_MAX}`);
        const extra = r ? rank(w, id) - r : 0;
        if (extra) lv.append(el('em', rank(w, id) > RANK_MAX ? 'over' : 'boost', ` +${extra} → ${rank(w, id)}`)); // 장비 보너스(초록), 초월(금색)
        head.append(el('b', '', SKILL_TEXT[id].name), lv);
        if (isPassive(id)) head.append(el('i', '', '패시브'));
        if (!block) {
          const up = el('button', 'up', '+');
          up.title = r ? '단계 올리기' : '배우기';
          up.addEventListener('click', () => h.learn(id));
          head.append(up);
        }
        body.append(head);
        for (const line of skillLines(w, id)) body.append(el('small', '', line));
        if (block && block !== '스킬 포인트 없음' && block !== '최고 단계') body.append(el('small', 'why', `🔒 ${block}`));
        if (r && !isPassive(id)) {
          const keys = el('div', 'keys');
          for (const k of KEYS) {
            const b = el('button', w.keys[k] === id ? 'on' : '', KEY_LABEL[k]);
            b.title = `${KEY_LABEL[k]} 칸에 끼우기` + (w.keys[k] && w.keys[k] !== id ? ` (지금: ${SKILL_TEXT[w.keys[k]!].name})` : '');
            b.addEventListener('click', () => h.bind(k, id));
            keys.append(b);
          }
          body.append(keys);
        }
        card.append(icon, body);
        col.append(card);
      }
      return col;
    }),
  );
  const spent = Object.values(w.ranks).reduce((s, r) => s + (r ?? 0), 0) - 1;
  const respecBtn = $('#tree-respec') as HTMLButtonElement;
  respecBtn.textContent = `포인트 모두 되돌리기 — 금화 ${RESPEC} (지금 ${w.gold})`;
  respecBtn.disabled = spent <= 0 || w.gold < RESPEC;
  respecBtn.onclick = () => h.respec();
  if (!dlg.open) dlg.showModal();
}

// 옵션 한 줄 설명
// 스킬 옵션: 대상 스킬·탭 이름, 안 배운 스킬이면 표시(learned는 장비 칸·보관함을 그릴 때 맞춘다)
let learned: World['ranks'] = {};
let setNow = 0; // 입은 정예 사냥꾼 조각 수(세트 줄을 밝힐 때)
const skillAffix = (a: Affix) => `${SKILL_TEXT[a.skill!].name} +${a.value}${learned[a.skill!] ? '' : ' (배우지 않음)'}`;
const AFFIX_TEXT: Record<Affix['kind'], (v: number, a: Affix) => string> = {
  dmg: (v) => `데미지 +${v}%`,
  speed: (v) => `공격 속도 +${v}%`,
  leech: (v) => `준 피해의 ${v}% 회복`,
  crit: (v) => `${v}% 확률로 2배`,
  life: (v) => `최대 체력 +${v}`,
  guard: (v) => `받는 피해 −${v}%`,
  regen: (v) => `초당 체력 ${v / 10} 회복`,
  thorns: (v) => `근접 피해 ${v}% 반사`,
  move: (v) => `이동 속도 +${v}%`,
  skill: (_, a) => skillAffix(a),
  tab: (v, a) => `${TREES[cls][a.tab!].name} 스킬 +${v}`,
  allSkills: (v) => `모든 스킬 +${v}`,
  unique: () => '',
};

// 정예 사냥꾼 세트 효과 줄(입은 수만큼 ●)
const SET_LINES: [number, string][] = [
  [2, `정예·보스에게 주는 피해 +${Math.round((SET_HUNTER.dmg - 1) * 100)}%, 정예를 잡으면 기력·마나 +${SET_HUNTER.res}`],
  [4, `정예를 잡으면 ${SET_HUNTER.time}초 동안 그 정예의 특성을 얻는다`],
];

// 장비 설명의 조각: 기본 수치, 고유 효과, 옵션 줄들, 세트 효과([줄, 켜짐] — 세트 조각만)
function gearParts(it: GearItem) {
  const t = it.tier - 1;
  const c = CLASSES[cls];
  const wpn = c.weapons[t];
  const base = {
    weapon: `${{ knight: '공격', wizard: '마력탄', ranger: '화살', necromancer: '뼈 화살' }[cls]} ${wpn.dmg[0]}–${wpn.dmg[1]}, ${wpn.interval}초${cls === 'ranger' ? ` (${RANGER.far}m 밖 +${Math.round((RANGER.farMult - 1) * 100)}%)` : ''}`,
    armor: `받는 피해 −${Math.round(c.armors[t].reduce * 100)}%`,
    helm: `최대 체력 +${c.helms[t].hp}`,
    boots: `이동 속도 +${Math.round(c.boots[t].move * 100)}%`,
  }[it.kind];
  const u = uniqueOf(it);
  return {
    base,
    desc: u ? UNIQUES[u].desc : '',
    affixes: it.affixes.map((a) => AFFIX_TEXT[a.kind](a.value, a)).filter(Boolean),
    set: u && UNIQUES[u].set ? SET_LINES.map(([n, t]): [string, boolean] => [`${n}부위: ${t}`, setNow >= n]) : null,
  };
}

// 장비의 수치·옵션 설명 줄들(한 줄 요약용)
function gearLines(it: GearItem): string[] {
  const p = gearParts(it);
  const set = p.set ? [`정예 사냥꾼 (${setNow}/4)`, ...p.set.map(([t, on]) => `${on ? '●' : '○'} ${t}`)] : [];
  return [p.base, ...(p.desc ? [`★ ${p.desc}`] : []), ...p.affixes, ...set];
}

// 장비 그림 색: 아이템마다 다르다(등급은 테두리로만). 고유 장비는 입었을 때와 같은 원색(look), 아니면 첫 옵션의 색, 일반은 원래 색
const AFFIX_COLOR: Partial<Record<Affix['kind'], string>> = { dmg: '#e8321e', speed: '#f5d020', leech: '#c0103c', crit: '#ff7a10', life: '#2ccf48', guard: '#3d7fe0', regen: '#18d0b4', thorns: '#a33fe0', move: '#30c8ff', skill: '#e04ad8', tab: '#e04ad8', allSkills: '#e04ad8' };
const iconColor = (it: GearItem) => {
  const u = uniqueOf(it);
  return (u && UNIQUES[u].look) || it.affixes.map((a) => AFFIX_COLOR[a.kind]).find(Boolean);
};
// 색 하나 = svg 색 필터 하나(처음 쓸 때 #tints에 만든다): 밝기 × 색 × 1.5를 90% + 원래 색 10%. 어두운 아이콘 바탕은 어두운 채로 남는다
function tint(color?: string): string {
  if (!color) return 'none';
  const id = `tint-${color.slice(1)}`;
  if (!document.getElementById(id)) {
    const rgb = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16) / 255);
    const lum = [0.3, 0.59, 0.11];
    const rows = rgb.map((c, i) => [...lum.map((l, j) => (i === j ? 0.1 : 0) + 0.9 * 1.5 * c * l), 0, 0].map((v) => v.toFixed(3)).join(' '));
    const ns = 'http://www.w3.org/2000/svg';
    const f = document.createElementNS(ns, 'filter');
    const m = document.createElementNS(ns, 'feColorMatrix');
    f.id = id;
    f.setAttribute('color-interpolation-filters', 'sRGB');
    m.setAttribute('values', `${rows.join(' ')} 0 0 0 1 0`);
    f.append(m);
    document.querySelector('#tints')!.append(f);
  }
  return `url(#${id})`;
}
// 아이콘 칸(.slot)에 그 장비의 그림 색: 칸의 ::before가 같은 그림을 이 필터로 다시 그린다(테두리는 물들지 않는다)
const paintSlot = (el: HTMLElement, it: GearItem) => el.style.setProperty('--tint', tint(iconColor(it)));

// 장비 툴팁(디아블로식): 마우스를 올리면 커서 옆에. 터치는 누르면 아래에 설명이 나오므로 띄우지 않는다
const tip = $('#tip');
const Q_NAME = ['일반', '마법', '희귀', '전설', '세트'];
const Q_COLOR = ['#e8e0d0', 'var(--magic)', 'var(--rare)', 'var(--legend)', 'var(--set)'];
const mk = (tag: string, className: string, text = '') => Object.assign(document.createElement(tag), { className, textContent: text });
function fillTip(it: GearItem, note: string, foot: string) {
  const q = quality(it);
  const p = gearParts(it);
  tip.style.setProperty('--q', Q_COLOR[q]);
  const head = mk('header', '');
  head.append(mk('b', '', nameOf(it.kind, it.tier, it.affixes)), mk('small', '', `${Q_NAME[q]} ${SLOT_NAME[it.kind]} · ${it.tier}단계`));
  const parts = [head, mk('section', 'base', p.base)];
  if (p.desc) parts.push(mk('section', 'uniq', p.desc));
  if (p.affixes.length) {
    const s = mk('section', 'aff');
    s.append(...p.affixes.map((a) => mk('div', '', a)));
    parts.push(s);
  }
  if (p.set) {
    const s = mk('section', 'set');
    s.append(mk('div', 'set-name', `정예 사냥꾼 (${setNow}/4)`), ...p.set.map(([t, on]) => mk('div', on ? '' : 'off', `${on ? '●' : '○'} ${t}`)));
    parts.push(s);
  }
  if (note) parts.push(mk('section', note.startsWith('▲') ? 'up' : note.startsWith('▼') ? 'down' : 'worn', note));
  if (foot) parts.push(mk('footer', '', foot));
  tip.replaceChildren(...parts);
}
// 마우스: 커서 오른쪽 아래(넘치면 왼쪽). 손가락(touch): 가리지 않게 손가락 위, 가로는 가운데
function placeTip(x: number, y: number, touch: boolean) {
  const r = tip.getBoundingClientRect();
  const left = touch ? x - r.width / 2 : x + 18 + r.width > innerWidth - 8 ? x - 18 - r.width : x + 18;
  const top = touch ? y - r.height - 36 : y + 18;
  tip.style.left = `${Math.max(8, Math.min(left, innerWidth - r.width - 8))}px`;
  tip.style.top = `${Math.max(8, Math.min(top, innerHeight - r.height - 8))}px`;
}
export const hideTip = () => tip.matches(':popover-open') && tip.hidePopover();
const HOLD = { ms: 450, slop: 10 }; // 휴대폰: 이만큼 꾹 누르면(움직임이 slop px 안) 툴팁
// get: [장비, 비교 한 줄, 맨 아래 도움말]. 같은 칸을 다시 그려도 이벤트가 쌓이지 않게 칸마다 한 번만 달고 get만 바꾼다
const tipGet = new WeakMap<HTMLElement, () => [GearItem, string, string]>();
function tipOn(target: HTMLElement, get: () => [GearItem, string, string]) {
  if (!tipGet.has(target)) {
    let hold = 0;
    let held = false; // 꾹 눌러 띄웠다 — 손을 뗄 때의 click(HUD 칸 = 보관함 열기)은 삼킨다
    let at = [0, 0];
    const open = (x: number, y: number, touch: boolean) => {
      fillTip(...tipGet.get(target)!());
      hideTip();
      tip.showPopover(); // 맨 위 층(열린 창 위)에 띄운다
      placeTip(x, y, touch);
    };
    const stop = () => {
      clearTimeout(hold);
      hold = 0;
      hideTip();
    };
    target.addEventListener('pointerenter', (e) => e.pointerType !== 'touch' && open(e.clientX, e.clientY, false));
    target.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch') return;
      at = [e.clientX, e.clientY];
      held = false;
      hold = setTimeout(() => ((hold = 0), (held = true), open(at[0], at[1], true)), HOLD.ms);
    });
    target.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'touch') return void (tip.matches(':popover-open') && placeTip(e.clientX, e.clientY, false));
      if (hold && Math.hypot(e.clientX - at[0], e.clientY - at[1]) > HOLD.slop) stop(); // 끌기로 넘어간다
    });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) target.addEventListener(ev, stop);
    target.addEventListener('contextmenu', (e) => e.preventDefault()); // 안드로이드: 꾹 누르면 뜨는 메뉴
    target.addEventListener('click', (e) => held && ((held = false), e.stopImmediatePropagation()), true);
  }
  tipGet.set(target, get);
}

// 장비 아이콘 위치(gear_icons.png = 무기 4 + 갑옷 4 + 투구 4 + 신발 4)
const iconX = (it: GearItem) => `${-(SLOTS.indexOf(it.kind) * 4 + it.tier - 1) * 40}px`;

// 장비 칸: 아이콘과 이름·수치·옵션(툴팁)
function showGear(w: World) {
  learned = w.ranks;
  setNow = setCount(w);
  for (const kind of SLOTS) {
    const it: GearItem = { kind, tier: w.gear[kind], affixes: w.mods[kind] };
    const slot = gearSlots[kind];
    slot.style.backgroundPositionX = iconX(it);
    slot.dataset.q = String(quality(it));
    paintSlot(slot, it);
    tipOn(slot, () => [it, '입은 장비', '눌러서 보관함 열기']);
  }
}

export function say(text: string) {
  toast.textContent = text;
  replay(toast);
}

// 기력·마나가 모자란 스킬을 쓰려 할 때
export function sayShort(w: World, id: SkillId) {
  say(`${SKILL_TEXT[id].name}: ${resName(w.cls)}${RESOURCE[w.cls] === 'energy' ? '이' : '가'} 부족합니다 (${skillCost(w.cls, id)} 필요)`);
}

// 안 배운 스킬을 쓰려 할 때
export function sayLocked(key: SkillName) {
  say(`${KEY_LABEL[key]} 칸이 비어 있습니다 — 레벨이 오르면 스킬 포인트로 배우고, T(스킬 창)에서 끼웁니다`);
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
  icon.dataset.q = String(quality(it));
  paintSlot(icon, it);
  const info = document.createElement('div');
  const name = Object.assign(document.createElement('b'), { className: `q${quality(it)}`, textContent: nameOf(it.kind, it.tier, it.affixes) + mark });
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
function showDoll(w: World, onPick: (s: Slot) => void) {
  const doll = $('#doll');
  const hero = doll.querySelector('canvas')!;
  void setHeroGear(w.gear, w.cls, looksOf(w)).then(() => drawHeroPortrait(hero, DOLL_SCALE));
  doll.replaceChildren(
    hero,
    ...SLOTS.map((kind) => {
      const it: GearItem = { kind, tier: w.gear[kind], affixes: w.mods[kind] };
      const el = Object.assign(document.createElement('div'), { className: `slot doll-slot${selected === kind ? ' sel' : ''}` });
      el.dataset.slot = kind;
      el.dataset.q = String(quality(it));
      paintSlot(el, it);
      tipOn(el, () => [it, '입은 장비', '보관함 장비를 여기로 끌어다 놓으면 갈아입기']);
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
  learned = w.ranks;
  setNow = setCount(w);
  const mark = (it: GearItem) => {
    const d = gearDiff(w, it);
    return d > 1e-9 ? ' ▲' : d < -1e-9 ? ' ▼' : '';
  };
  const compare = (it: GearItem) => {
    const d = gearDiff(w, it);
    return d > 1e-9 ? '▲ 지금 입은 장비보다 좋다' : d < -1e-9 ? '▼ 지금 입은 장비보다 약하다' : '';
  };
  hideTip(); // 다시 그리면 올려 둔 칸이 사라진다(떠날 때 이벤트가 오지 않는다)
  bagDlg.onclose = () => !bagDlg.open && hideTip(); // 닫고 바로 다시 열면 늦게 온 close가 열린 창의 툴팁을 끄지 않게
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
      const el = Object.assign(document.createElement('div'), { className: i === selected ? 'bag-item sel' : 'bag-item' });
      el.dataset.q = String(quality(it));
      el.style.gridArea = area(it.x, it.y, size);
      const icon = document.createElement('i');
      icon.style.backgroundImage = `url(${GEAR_ICONS[cls]})`;
      icon.style.backgroundPositionX = iconX(it);
      icon.style.scale = String((Math.min(...size) * cell - 4) / 40);
      icon.style.filter = tint(iconColor(it));
      el.append(icon);
      tipOn(el, () => [it, compare(it), '우클릭: 장착 · 끌어서 옮기기']);
      el.onpointerdown = (e) => {
        hideTip();
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
  showDoll(w, (s) => {
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

// 상점 화면. 항목을 누르면 onBuy, 팔면 onSell, '다음 구역으로'는 onLeave, '여기 남기'·닫기·Esc는 onStay. 사고판 뒤에는 다시 불러 갱신한다.
// camp = 야영지 상인(사고팔기, 닫기만), 아니면 구역 사이의 떠돌이 상인(물약 사기만, 다음 구역으로·남기)
export function showShop(c: Wallet & { cls: HeroClass }, onBuy: (item: ShopItem) => void, onSell: (i: number) => void, onLeave: () => void, onStay: () => void, dest = '다음 층', camp = false) {
  cls = c.cls;
  $('#shop-title').textContent = camp ? '상인' : '떠돌이 상인';
  $('#shop-note').textContent = camp ? '물약을 사고, 쓰지 않는 장비를 팝니다.' : '길에서 만난 상인입니다. 물약만 팝니다.';
  $('#shop-leave').hidden = camp;
  $('#shop-stay').textContent = camp ? '닫기' : '◀ 여기 남기';
  $('#shop-leave').textContent = `${dest}으로 ▶`; // 층·구역 모두 받침으로 끝난다
  const label = (_item: ShopItem) => `체력 물약 1개 <small>(지금 ${c.potions}/8)</small>`;
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
  shopSell.hidden = !camp || c.bag.length === 0;
  $('#shop-sell-items').replaceChildren(
    ...c.bag.map((it, i) => {
      const b = document.createElement('button');
      b.append(
        Object.assign(document.createElement('span'), { className: `q${quality(it)}`, textContent: nameOf(it.kind, it.tier, it.affixes) }),
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
// 소환수 초상화 줄: id마다 칸 하나(새로 생기면 만들고, 사라지면 치운다)
const ALLY_NAME: Partial<Record<string, string>> = { minion: '해골 검사', archer: '해골 궁수', mage: '해골 법사', warrior: '시체 거인', king: '해골 왕' };
const ALLY_END = 3; // 남은 시간이 이만큼(초)이면 깜빡인다
const allyCards = new Map<number, HTMLElement>();
function showAllies(w: World) {
  const box = $('#allies');
  const live = new Set(w.allies.map((a) => a.id));
  for (const [id, card] of allyCards) {
    if (live.has(id)) continue;
    card.remove();
    allyCards.delete(id);
  }
  for (const a of w.allies) {
    let card = allyCards.get(a.id);
    if (!card) {
      card = Object.assign(document.createElement('div'), { className: `ally ${a.kind}`, title: ALLY_NAME[a.kind] ?? '' });
      card.innerHTML = '<div class="pic"></div><div class="hp"><i></i></div>';
      paintPortrait(card.firstElementChild as HTMLElement, a, 28);
      allyCards.set(a.id, card);
      box.append(card);
    }
    (card.firstElementChild as HTMLElement).style.setProperty('--gone', String(isFinite(a.lifeMax) ? 1 - Math.max(0, a.life) / a.lifeMax : 0)); // 시간제(해골 왕)만 어둠이 찬다
    card.classList.toggle('ending', a.life < ALLY_END);
    (card.querySelector('.hp i') as HTMLElement).style.width = `${(Math.max(0, a.hp) / a.maxHp) * 100}%`;
  }
}

// 정예 사냥꾼 4부위로 얻은 특성: 이름·남은 초(특성 색). 바뀔 때만 다시 쓴다
let shownTrophies = '';
function showTrophies(w: World) {
  const list = (Object.keys(w.trophies) as (keyof World['trophies'])[]).map((k) => [k, Math.ceil(w.trophies[k]!)] as const);
  const buff = w.buff && ([w.buff.kind, Math.ceil(w.buff.t)] as const); // 성소 버프도 같은 줄에
  const key = JSON.stringify([list, buff]);
  if (key === shownTrophies) return;
  shownTrophies = key;
  $('#trophies').replaceChildren(
    ...list.map(([k, t]) => Object.assign(document.createElement('span'), { textContent: `${ELITE_KINDS[k].name} ${t}`, title: ELITE_KINDS[k].desc, style: `color: ${ELITE_KINDS[k].color}` })),
    ...(buff ? [Object.assign(document.createElement('span'), { textContent: `${BUFFS[buff[0]].name.replace(' 성소', '')} ${buff[1]}`, title: BUFFS[buff[0]].desc, style: 'color: #9cff6a' })] : []),
  );
}

export function updateHud(world: World, hovered: number | null, choosing: boolean, stats: Stats, lostGold = 0, clearReady = true) {
  const hero = world.entities[0];
  if (world !== shownWorld) {
    shownWorld = world;
    if (world.cls !== cls) showClass(world.cls);
    shownLevel = 0;
    shownGear = '';
    shownBag = world.bag.length;
    shownBlocked = false;
    shownGateHint = false;
    shownGatesOpen = 0;
    shownGimmick = '';
  }
  heroFill.style.width = `${(hero.hp / hero.maxHp) * 100}%`;
  showTrophies(world);
  danger.style.opacity = String(hero.state === 'dead' ? 0 : Math.min(1, Math.max(0, 1 - hero.hp / hero.maxHp / DANGER) * 1.5)); // 약 12% 아래에서 가장 짙다
  xpFill.style.width = `${(world.xp / xpToNext(world.level)) * 100}%`;
  resFill.style.width = `${(world.res / resMax(world)) * 100}%`;
  resBar.title = `${resName(world.cls)} ${Math.floor(world.res)}/${resMax(world)}`;
  levelLabel.textContent = `Lv ${world.level}` + (world.points ? ` · 스킬 +${world.points}` : '');
  pointsHint.hidden = !world.points;
  pointsHint.textContent = `스킬 포인트 ${world.points} — 눌러서 또는 T로 스킬 창`;
  if (shownLevel && world.level > shownLevel) say(`레벨 업! Lv ${world.level}` + (world.points ? ' — 스킬 포인트를 얻었습니다' : ''));
  shownLevel = world.level;
  // 재사용 대기 남은 비율(칸마다 마지막으로 건 대기 기준)
  for (const [btn, k] of SKILL_BUTTONS()) {
    (btn.querySelector('i') as HTMLElement).style.height = `${Math.min(1, world[KEY_CD[k]] / world.cdFull[k]) * 100}%`;
    const id = world.keys[k];
    btn.classList.toggle('short', !!id && (!canAfford(world, id) || (world.edge.kind === 'both' && (id === 'flameEdge' || id === 'frostEdge')))); // 기력·마나 부족, 해방 중의 벼림(어둡게)
    btn.querySelector<HTMLElement>('.charges')!.textContent = String(edgeLeft(world, k) ?? '');
  }
  $('#roll i').style.height = `${(world.rollCd / (world.cls === 'wizard' ? BLINK.cd : ROLL.cd)) * 100}%`;
  showKeys(world);
  showAllies(world);
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
    void setHeroGear(world.gear, world.cls, looksOf(world));
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
    say({ knight: '사슬 문 — 도끼(R)로 끊거나', wizard: '사슬 문 — 화염구(Q)로 끊거나', ranger: '사슬 문 — 관통 사격(Q)으로 끊거나', necromancer: '사슬 문 — 죽음의 표식(E)으로 녹이거나' }[world.cls] + ' 문 앞을 지키는 몬스터를 모두 쓰러뜨리세요');
  }
  const gatesOpen = world.gates.filter((g) => g.open).length;
  if (gatesOpen > shownGatesOpen) say('사슬이 풀려 문이 열렸습니다');
  shownGatesOpen = gatesOpen;
  // 기믹 알림: 상태가 바뀐 것만
  const trial = world.chests.find((c) => c.kind === 'trial' && c.wave && !c.open);
  const trialDone = trial && trial.wave === TRIAL.waves.length && trial.guards!.every((id) => world.entities[id].state === 'dead');
  const goblin = world.entities.some((e) => e.skin === 'treasure' && e.cd && e.state !== 'dead');
  const gimmick = [world.buff?.kind ?? '', trial ? `${trial.wave}${trialDone ? '!' : ''}` : '', goblin ? 'g' : ''];
  const before = shownGimmick.split('|');
  if (gimmick[0] && gimmick[0] !== before[0]) say(`${BUFFS[world.buff!.kind].name} — ${BUFFS[world.buff!.kind].desc}`);
  if (gimmick[1] && gimmick[1] !== before[1]) say(trialDone ? '시련을 이겨냈습니다 — 제단의 상자를 여세요' : `시련 ${trial!.wave}/${TRIAL.waves.length} — 몬스터가 몰려옵니다`);
  if (gimmick[2] && !before[2]) say(`보물 고블린이 도망칩니다! ${TREASURE.run}초 안에 잡으세요`);
  shownGimmick = gimmick.join('|');
  // 상단 체력바: 가까이 있는 보스(미노타우르스) 또는 해골 왕
  const boss = world.entities.find((e) => (e.kind === 'boss' || e.kind === 'king') && e.state !== 'dead' && Math.hypot(e.x - hero.x, e.z - hero.z) <= BOSS_BAR_RANGE);
  bossBar.hidden = !boss;
  if (boss) {
    bossLabel.textContent = monsterName(boss);
    bossFill.style.width = `${(boss.hp / boss.maxHp) * 100}%`;
  }
  target.classList.toggle('below', !bossBar.hidden);
  const id = hovered ?? hero.target; // 마우스 오버가 없으면(모바일) 공격 중인 대상
  const m = id === null ? null : world.entities[id];
  target.hidden = !m;
  if (m) {
    const k = m.eliteKind && ELITE_KINDS[m.eliteKind];
    targetName.textContent = (k ? `${k.name} ` : m.elite ? '정예 ' : '') + monsterName(m);
    targetNote.textContent = k ? `정예 · ${k.desc}` : '';
    target.classList.toggle('elite', m.elite);
    target.style.setProperty('--elite', k ? k.color : '');
    targetFill.style.width = `${(m.hp / m.maxHp) * 100}%`;
  }
  renderer.domElement.classList.toggle('attack', hovered !== null); // 몬스터 위에서는 공격 커서
  if (choosing) return;
  const o = outcome(world);
  banner.hidden = o !== 'dead' && o !== 'clear';
  banner.classList.toggle('clear', o === 'clear'); // 클리어는 화면을 덮지 않고 위에 — 떨어진 전리품을 보고 주울 수 있게
  restartBtn.hidden = o !== 'dead'; // 클리어는 '야영지로' 하나
  if (o === 'dead') bannerText.textContent = '사망했습니다' + (lostGold ? ` — 금화 ${lostGold}을 잃었습니다` : '');
  if (o === 'clear') {
    const name = bossName(world.skins);
    bannerText.textContent = `${name}${(name.charCodeAt(name.length - 1) - 0xac00) % 28 ? '을' : '를'} 쓰러뜨렸습니다! 클리어!`;
    summary.textContent = `${shownCycle + 1}회차 · 플레이 시간 ${formatTime(stats.time)} · 처치 ${stats.kills} · 사망 ${stats.deaths} · Lv ${world.level}`;
  }
  summary.hidden = o !== 'clear';
  nextCycleBtn.hidden = !(o === 'clear' && clearReady);
  restartBtn.textContent = '야영지로 (R)';
  nextCycleBtn.textContent = '야영지로';
}
