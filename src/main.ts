import gearIcons from './assets/sprites/gear_icons.png';
import { snapshot, soundEvents } from './audio/events';
import * as sound from './audio/sound';
import potionIcon from './assets/sprites/potion_icon.png';
import skillIcon from './assets/sprites/skill_icon.png';
import { commands, hovered, initInput, pollInput } from './input';
import { drawAutomap, initAutomap, resetAutomap, toggleAutomap } from './render/automap';
import { drawLabels, initLabels } from './render/labels';
import { camera, draw, initRender, renderer, setWorld } from './render/render';
import { setHeroGear } from './render/sprites';
import { clearRun, formatTime, loadRun, saveRun, type Stats } from './save';
import { FLOORS, floorPower, generateFloor } from './sim/dungeon';
import { ARMORS, createWorld, DT, outcome, setLevel, SKILL, STATS, step, WEAPONS, xpToNext, type Gear, type World } from './sim/world';

const $ = (sel: string) => document.querySelector<HTMLElement>(sel)!;
const heroFill = $('#hp i');
const target = $('#target');
const targetName = $('#target span');
const targetFill = $('#target i');
const banner = $('#banner');
const bannerText = $('#banner p');
const restartBtn = $('#restart');
const continueBtn = $('#continue');
const summary = $('#summary');
const newGameBtn = $('#new-game');
const saved = loadRun(); // 지난번 진행(있으면 시작할 때 이어하기를 묻는다)
let choosing = saved !== null;
const newStats = (): Stats => ({ time: 0, kills: 0, deaths: 0 });
let stats = newStats(); // 이번 판 기록(이어하기면 저장된 것부터)
const floorLabel = $('#floor');
const floorTitle = $('#floor-title');
const potionBtn = $('#potion');
const potionCount = $('#potion span');
const weaponSlot = $('#weapon');
const armorSlot = $('#armor');
const toast = $('#toast');
const xpFill = $('#xp i');
const skillBtn = $('#skill');
const skillShade = $('#skill i');
const levelLabel = $('#level');
const bossBar = $('#boss');
const bossFill = $('#boss i');
const BOSS_BAR_RANGE = 12; // 보스와 이만큼 가까우면 상단 체력바(m)
const credits = document.querySelector<HTMLDialogElement>('#credits')!;
const START = { potions: 2, gear: { weapon: 2, armor: 2 }, level: 1, xp: 0 }; // 숏소드 + 가죽 갑옷
type Carry = { potions: number; gear: Gear; level: number; xp: number };
let floor = 1;
let entry: Carry = START; // 이 층에 들어올 때의 물약·장비·레벨(사망 후 다시 시작하면 이것으로)
let world = makeFloor(floor, entry);
let shownGear = gearKey(world.gear);
let shownLevel = world.level;

// 층마다 새 시드(sim 밖이라 Math.random 사용). 층 배율 floorPower, 떨어지는 장비는 층 + 1단계까지
function makeFloor(n: number, carry: Carry): World {
  const seed = Math.floor(Math.random() * 2 ** 31);
  const w = createWorld(seed, generateFloor(seed, n), floorPower(n));
  w.potions = carry.potions;
  w.gear = { ...carry.gear };
  w.maxTier = Math.min(4, n + 1);
  setLevel(w, carry.level, carry.xp);
  return w;
}

function showFloor() {
  floorLabel.textContent = `지하 ${floor}층`;
  floorTitle.textContent = floor === FLOORS ? `지하 ${floor}층 — ${STATS.boss.name}` : floorLabel.textContent;
  replay(floorTitle);
}

// CSS 애니메이션을 처음부터 다시 재생
function replay(el: HTMLElement) {
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
}

function enterFloor(n: number, carry: Carry) {
  floor = n;
  entry = { potions: carry.potions, gear: { ...carry.gear }, level: carry.level, xp: carry.xp };
  saveRun({ floor: n, ...entry, stats }); // 층에 들어갈 때마다 자동 저장
  world = makeFloor(n, entry);
  setWorld(world);
  resetAutomap(world);
  commands.length = 0; // 이전 층에서 쌓인 명령을 새 층에 적용하지 않는다
  showFloor();
  sound.playMusic(sound.musicFor(n));
}

function gearKey(g: Gear) {
  return `${g.weapon}/${g.armor}`;
}

// 장비 칸: 아이콘(gear_icons.png = 무기 4 + 갑옷 4)과 수치
function showGear(g: Gear) {
  const wpn = WEAPONS[g.weapon - 1];
  const arm = ARMORS[g.armor - 1];
  weaponSlot.style.backgroundPositionX = `${-(g.weapon - 1) * 40}px`;
  armorSlot.style.backgroundPositionX = `${-(4 + g.armor - 1) * 40}px`;
  weaponSlot.title = `${wpn.name} (공격 ${wpn.dmg[0]}–${wpn.dmg[1]}, ${wpn.interval}초)`;
  armorSlot.title = `${arm.name} (받는 피해 −${arm.reduce * 100}%)`;
}

try {
  await initRender(world);
} catch (err) {
  bannerText.textContent = `그림을 불러오지 못했습니다: ${err instanceof Error ? err.message : err}`;
  throw err;
}
banner.hidden = !choosing;
if (saved) {
  bannerText.textContent = `저장된 진행: 지하 ${saved.floor}층, Lv ${saved.level}`;
  continueBtn.hidden = newGameBtn.hidden = false;
}
const begin = (floorN: number, carry: Carry) => {
  choosing = false;
  continueBtn.hidden = newGameBtn.hidden = true;
  enterFloor(floorN, carry);
};
continueBtn.addEventListener('click', () => {
  if (!saved) return;
  stats = { ...saved.stats };
  begin(saved.floor, saved);
});
newGameBtn.addEventListener('click', () => begin(1, START));
if (!saved) saveRun({ floor: 1, ...START, stats });
initInput();
initAutomap(document.querySelector<HTMLCanvasElement>('#automap')!);
initLabels($('#labels'));
sound.initSound();
sound.playMusic(sound.musicFor(floor)); // 곡만 정해 두고, 첫 입력 때 재생
const soundBtn = $('#sound-btn');
const showSound = () => (soundBtn.textContent = sound.muted ? '소리 꺼짐' : '소리');
soundBtn.addEventListener('click', () => {
  sound.setMuted(!sound.muted);
  showSound();
});
showSound();
let heard = snapshot(world); // 직전 프레임 상태(효과음 비교용)
resetAutomap(world);
showFloor();
showGear(world.gear);
// 헤드리스 확인용: 현재 world, 명령 큐, 층 바로 가기
if (import.meta.env.DEV) Object.assign(window, { __game: { get world() { return world; }, commands, goto: (n: number) => enterFloor(n, world), get played() { return sound.played; } } });

function restart() {
  const o = outcome(world);
  if (o === 'dead') {
    stats.deaths++;
    enterFloor(floor, entry); // 같은 층을 새 모양으로, 들어올 때의 물약·장비로
  } else if (o === 'clear') {
    stats = newStats();
    enterFloor(1, START);
  }
}
const drink = () => commands.push({ type: 'drink' });
const skill = () => commands.push({ type: 'skill' });
// e.code: 한글 입력 상태에서도 물리 키
addEventListener('keydown', (e) => {
  if (e.code === 'KeyR') restart();
  else if (e.code === 'KeyQ' || e.code === 'Digit1') drink();
  else if (e.code === 'KeyE' || e.code === 'Digit2') skill();
  else if (e.code === 'KeyM') toggleAutomap();
});
restartBtn.addEventListener('click', restart); // 모바일용
$('#map-btn').addEventListener('click', toggleAutomap);
potionBtn.querySelector('img')!.src = potionIcon;
potionBtn.addEventListener('click', drink);
skillBtn.style.backgroundImage = `url(${skillIcon})`;
skillBtn.addEventListener('click', skill);
for (const slot of [weaponSlot, armorSlot]) slot.style.backgroundImage = `url(${gearIcons})`;

let acc = 0;
let last = performance.now();
requestAnimationFrame(function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.25); // 탭 전환 후 복귀 시 수천 틱 몰아서 돌지 않게
  last = now;
  pollInput(world, dt);
  if (credits.open || choosing) acc = 0; // 크레딧을 읽거나 이어하기를 고르는 동안은 게임을 멈춘다
  else for (acc += dt; acc >= DT; acc -= DT) step(world, commands.splice(0));
  const events = soundEvents(heard, world);
  sound.play(events, world.entities[0].x, world.entities[0].z);
  stats.kills += events.filter((e) => e.name === 'skel_die' || e.name === 'boss_die').length;
  if (!choosing && !credits.open && !outcome(world)) stats.time += dt;
  if (outcome(world) === 'descend') enterFloor(floor + 1, world);
  heard = snapshot(world);
  draw(world, dt);
  drawAutomap(world);
  drawLabels(world, camera, renderer.domElement);
  hud();
  requestAnimationFrame(frame);
});

function hud() {
  const hero = world.entities[0];
  heroFill.style.width = `${(hero.hp / hero.maxHp) * 100}%`;
  xpFill.style.width = `${(world.xp / xpToNext(world.level)) * 100}%`;
  levelLabel.textContent = `Lv ${world.level}`;
  if (world.level > shownLevel) {
    toast.textContent = `레벨 업! Lv ${world.level}`;
    replay(toast);
  }
  shownLevel = world.level;
  skillShade.style.height = `${(world.skillCd / SKILL.cd) * 100}%`; // 재사용 대기 남은 비율
  potionCount.textContent = String(world.potions);
  potionBtn.classList.toggle('empty', world.potions === 0);
  const key = gearKey(world.gear);
  if (key !== shownGear) {
    // 주운 장비는 알림. 사망 후 다시 시작해 장비가 돌아간 경우는 알리지 않는다
    const [w0, a0] = shownGear.split('/').map(Number);
    const gained = world.gear.weapon > w0 ? WEAPONS[world.gear.weapon - 1].name : world.gear.armor > a0 ? ARMORS[world.gear.armor - 1].name : null;
    if (gained) {
      toast.textContent = `${gained} 장착`;
      replay(toast);
    }
    shownGear = key;
    showGear(world.gear);
    void setHeroGear(world.gear);
  }
  const boss = world.entities.find((e) => e.kind === 'boss' && e.state !== 'dead');
  bossBar.hidden = !boss || Math.hypot(boss.x - hero.x, boss.z - hero.z) > BOSS_BAR_RANGE;
  if (boss) bossFill.style.width = `${(boss.hp / boss.maxHp) * 100}%`;
  target.classList.toggle('below', !bossBar.hidden);
  const id = hovered ?? hero.target; // 마우스 오버가 없으면(모바일) 공격 중인 대상
  const m = id === null ? null : world.entities[id];
  target.hidden = !m;
  if (m) {
    targetName.textContent = (m.elite ? '정예 ' : '') + STATS[m.kind].name;
    targetFill.style.width = `${(m.hp / m.maxHp) * 100}%`;
  }
  renderer.domElement.classList.toggle('attack', hovered !== null); // 몬스터 위에서는 공격 커서
  const o = outcome(world);
  if (choosing) return;
  if (o === 'clear') clearRun(); // 다 깼으면 이어할 것이 없다
  banner.hidden = restartBtn.hidden = o !== 'dead' && o !== 'clear';
  if (o === 'dead') bannerText.textContent = '사망했습니다';
  if (o === 'clear') {
    bannerText.textContent = `${STATS.boss.name}를 쓰러뜨렸습니다! 클리어!`;
    summary.textContent = `플레이 시간 ${formatTime(stats.time)} · 처치 ${stats.kills} · 사망 ${stats.deaths} · Lv ${world.level}`;
  }
  summary.hidden = o !== 'clear';
}
