// 게임 흐름: 층 만들기·이동, 저장·이어하기, 입력 연결, 60Hz 고정 틱 루프. 화면 위 HTML은 hud.ts.
import { snapshot, soundEvents } from './audio/events';
import * as sound from './audio/sound';
import { $, initHud, showChoice, showFloor, showLoadError, showShop, showSound, updateHud } from './hud';
import { aim, commands, hovered, initInput, pollInput } from './input';
import { drawAutomap, initAutomap, resetAutomap, toggleAutomap } from './render/automap';
import { drawLabels, initLabels } from './render/labels';
import { camera, draw, initRender, renderer, setWorld } from './render/render';
import { clearRun, loadRun, saveRun, type Mods, type Stats } from './save';
import { buy } from './shop';
import { cyclePower, floorPower, generateFloor, themeFor } from './sim/dungeon';
import { createWorld, DT, outcome, setLevel, step, type Gear, type World } from './sim/world';

const credits = document.querySelector<HTMLDialogElement>('#credits')!;
const help = document.querySelector<HTMLDialogElement>('#help')!;
const START: Carry = { potions: 2, gear: { weapon: 2, armor: 2 }, mods: { weapon: [], armor: [] }, level: 1, xp: 0, gold: 0 }; // 숏소드 + 가죽 갑옷
type Carry = { potions: number; gear: Gear; mods: Mods; level: number; xp: number; gold: number };
// 다음 층(또는 상점·회차)으로 가져갈 것만 복사. World·저장(Run)도 이 필드를 다 갖고 있다
const carryOf = (c: Carry): Carry => ({ potions: c.potions, gear: { ...c.gear }, mods: { weapon: [...c.mods.weapon], armor: [...c.mods.armor] }, level: c.level, xp: c.xp, gold: c.gold });
const newStats = (): Stats => ({ time: 0, kills: 0, deaths: 0 });
const saved = loadRun(); // 지난번 진행(있으면 시작할 때 이어하기를 묻는다)
let choosing = saved !== null;
let stats = newStats(); // 이번 판 기록(이어하기면 저장된 것부터)
let floor = 1;
let cycle = 0; // 회차(0 = 첫 판). 보스를 잡고 다음 회차로 가면 1씩
let entry: Carry = START; // 이 층에 들어올 때의 물약·장비·레벨(사망 후 다시 시작하면 이것으로)
let world = makeFloor(floor, entry);
let shopping: Carry | null = null; // 계단을 내려가 상점을 보는 중(다음 층으로 가져갈 상태)

// 층마다 새 시드(sim 밖이라 Math.random 사용). 층 배율 floorPower, 떨어지는 장비는 층 + 1단계까지
function makeFloor(n: number, carry: Carry): World {
  const seed = Math.floor(Math.random() * 2 ** 31);
  const w = createWorld(seed, generateFloor(seed, n), floorPower(n, cycle), cyclePower(cycle));
  w.potions = carry.potions;
  w.gear = { ...carry.gear };
  w.mods = { weapon: [...carry.mods.weapon], armor: [...carry.mods.armor] };
  w.gold = carry.gold;
  w.maxTier = Math.min(4, n + 1);
  setLevel(w, carry.level, carry.xp);
  return w;
}

function enterFloor(n: number, carry: Carry) {
  floor = n;
  entry = carryOf(carry);
  saveRun({ floor: n, ...entry, cycle, stats }); // 층에 들어갈 때마다 자동 저장
  world = makeFloor(n, entry);
  setWorld(world, themeFor(n));
  resetAutomap(world);
  commands.length = 0; // 이전 층에서 쌓인 명령을 새 층에 적용하지 않는다
  showFloor(n, cycle);
  sound.playMusic(sound.musicFor(n));
}

// 계단을 내려가면 다음 층을 만들기 전에 상점. 떠나면 산 것을 가지고 다음 층으로
function openShop() {
  shopping = carryOf(world);
  const render = () =>
    showShop(
      shopping!,
      (item) => {
        const after = buy(shopping!, item);
        if (after === shopping) return;
        shopping = after;
        sound.play([{ name: 'gold', x: world.entities[0].x, z: world.entities[0].z }], world.entities[0].x, world.entities[0].z);
        render();
      },
      () => {
        const c = shopping!;
        shopping = null;
        enterFloor(floor + 1, c);
      },
    );
  render();
}

function begin(n: number, carry: Carry) {
  choosing = false;
  showChoice(null);
  enterFloor(n, carry);
}

function restart() {
  const o = outcome(world);
  if (o === 'dead') {
    stats.deaths++;
    enterFloor(floor, entry); // 같은 층을 새 모양으로, 들어올 때의 물약·장비로
  } else if (o === 'clear') {
    stats = newStats();
    cycle = 0;
    enterFloor(1, START);
  }
}

// 보스를 잡은 뒤: 레벨·장비·물약·금화를 가지고 더 강한 1층부터
function nextCycle() {
  if (outcome(world) !== 'clear') return;
  cycle++;
  enterFloor(1, carryOf(world));
}

const drink = () => commands.push({ type: 'drink' });
const skill = () => commands.push({ type: 'skill' });
const dash = (aimed: boolean) => commands.push({ type: 'dash', ...((aimed && aim()) || {}) }); // 키보드는 커서 방향, 버튼은 자동
const shout = () => commands.push({ type: 'shout' });
const throwAxe = (aimed: boolean) => commands.push({ type: 'throw', ...((aimed && aim()) || {}) });

try {
  await initRender(world, themeFor(floor));
} catch (err) {
  showLoadError(err);
  throw err;
}
showChoice(saved);
if (!saved) {
  saveRun({ floor: 1, ...START, cycle, stats });
  help.showModal(); // 처음 하는 사람에게 조작법
}
$('#help-btn').addEventListener('click', () => help.showModal());
initHud({
  drink,
  skill,
  dash: () => dash(false),
  shout,
  throwAxe: () => throwAxe(false),
  restart,
  nextCycle,
  toggleMap: toggleAutomap,
  sound: (patch) => {
    sound.setSound(patch);
    showSound(sound.settings);
  },
  resume: () => {
    if (!saved) return;
    stats = { ...saved.stats };
    cycle = saved.cycle;
    begin(saved.floor, saved);
  },
  newGame: () => begin(1, START),
});
initInput();
initAutomap(document.querySelector<HTMLCanvasElement>('#automap')!);
initLabels($('#labels'));
sound.initSound();
sound.playMusic(sound.musicFor(floor)); // 곡만 정해 두고, 첫 입력 때 재생
showSound(sound.settings);
resetAutomap(world);
showFloor(floor, cycle);
// e.code: 한글 입력 상태에서도 물리 키
addEventListener('keydown', (e) => {
  if (e.code === 'KeyR') restart();
  else if (e.code === 'KeyQ' || e.code === 'Digit1') drink();
  else if (e.code === 'KeyE' || e.code === 'Digit2') skill();
  else if (e.code === 'KeyF' || e.code === 'Digit3') dash(true);
  else if (e.code === 'KeyW' || e.code === 'Digit4') shout();
  else if (e.code === 'KeyT' || e.code === 'Digit5') throwAxe(true);
  else if (e.code === 'KeyM') toggleAutomap();
});
// 헤드리스 확인용: 현재 world, 명령 큐, 층 바로 가기
if (import.meta.env.DEV) Object.assign(window, { __game: { get world() { return world; }, commands, goto: (n: number) => enterFloor(n, world), get played() { return sound.played; } } });

let heard = snapshot(world); // 직전 프레임 상태(효과음 비교용)
let acc = 0;
let last = performance.now();
requestAnimationFrame(function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.25); // 탭 전환 후 복귀 시 수천 틱 몰아서 돌지 않게
  last = now;
  pollInput(world, dt);
  const paused = credits.open || help.open || choosing || shopping !== null; // 크레딧·조작법·상점·이어하기 고르는 동안은 멈춘다
  if (paused) acc = 0;
  else for (acc += dt; acc >= DT; acc -= DT) step(world, commands.splice(0));
  const events = soundEvents(heard, world);
  sound.play(events, world.entities[0].x, world.entities[0].z);
  stats.kills += events.filter((e) => e.name === 'skel_die' || e.name === 'boss_die').length;
  const o = outcome(world);
  if (!paused && !o) stats.time += dt;
  if (o === 'clear') clearRun(); // 다 깼으면 이어할 것이 없다
  if (o === 'descend' && !shopping) openShop();
  heard = snapshot(world);
  draw(world, dt);
  drawAutomap(world);
  drawLabels(world, camera, renderer.domElement);
  updateHud(world, hovered, choosing, stats);
  requestAnimationFrame(frame);
});
