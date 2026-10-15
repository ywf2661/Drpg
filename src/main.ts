// 게임 흐름: 층 만들기·이동, 저장·이어하기, 입력 연결, 60Hz 고정 틱 루프. 화면 위 HTML은 hud.ts.
import { snapshot, soundEvents } from './audio/events';
import * as sound from './audio/sound';
import { $, initHud, showChoice, showFloor, showLoadError, showSound, updateHud } from './hud';
import { commands, hovered, initInput, pollInput } from './input';
import { drawAutomap, initAutomap, resetAutomap, toggleAutomap } from './render/automap';
import { drawLabels, initLabels } from './render/labels';
import { camera, draw, initRender, renderer, setWorld } from './render/render';
import { clearRun, loadRun, saveRun, type Stats } from './save';
import { floorPower, generateFloor } from './sim/dungeon';
import { createWorld, DT, outcome, setLevel, step, type Gear, type World } from './sim/world';

const credits = document.querySelector<HTMLDialogElement>('#credits')!;
const START = { potions: 2, gear: { weapon: 2, armor: 2 }, level: 1, xp: 0 }; // 숏소드 + 가죽 갑옷
type Carry = { potions: number; gear: Gear; level: number; xp: number };
const newStats = (): Stats => ({ time: 0, kills: 0, deaths: 0 });
const saved = loadRun(); // 지난번 진행(있으면 시작할 때 이어하기를 묻는다)
let choosing = saved !== null;
let stats = newStats(); // 이번 판 기록(이어하기면 저장된 것부터)
let floor = 1;
let entry: Carry = START; // 이 층에 들어올 때의 물약·장비·레벨(사망 후 다시 시작하면 이것으로)
let world = makeFloor(floor, entry);

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

function enterFloor(n: number, carry: Carry) {
  floor = n;
  entry = { potions: carry.potions, gear: { ...carry.gear }, level: carry.level, xp: carry.xp };
  saveRun({ floor: n, ...entry, stats }); // 층에 들어갈 때마다 자동 저장
  world = makeFloor(n, entry);
  setWorld(world);
  resetAutomap(world);
  commands.length = 0; // 이전 층에서 쌓인 명령을 새 층에 적용하지 않는다
  showFloor(n);
  sound.playMusic(sound.musicFor(n));
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
    enterFloor(1, START);
  }
}

const drink = () => commands.push({ type: 'drink' });
const skill = () => commands.push({ type: 'skill' });

try {
  await initRender(world);
} catch (err) {
  showLoadError(err);
  throw err;
}
showChoice(saved);
if (!saved) saveRun({ floor: 1, ...START, stats });
initHud({
  drink,
  skill,
  restart,
  toggleMap: toggleAutomap,
  toggleSound: () => {
    sound.setMuted(!sound.muted);
    showSound(sound.muted);
  },
  resume: () => {
    if (!saved) return;
    stats = { ...saved.stats };
    begin(saved.floor, saved);
  },
  newGame: () => begin(1, START),
});
initInput();
initAutomap(document.querySelector<HTMLCanvasElement>('#automap')!);
initLabels($('#labels'));
sound.initSound();
sound.playMusic(sound.musicFor(floor)); // 곡만 정해 두고, 첫 입력 때 재생
showSound(sound.muted);
resetAutomap(world);
showFloor(floor);
// e.code: 한글 입력 상태에서도 물리 키
addEventListener('keydown', (e) => {
  if (e.code === 'KeyR') restart();
  else if (e.code === 'KeyQ' || e.code === 'Digit1') drink();
  else if (e.code === 'KeyE' || e.code === 'Digit2') skill();
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
  const paused = credits.open || choosing; // 크레딧을 읽거나 이어하기를 고르는 동안은 게임을 멈춘다
  if (paused) acc = 0;
  else for (acc += dt; acc >= DT; acc -= DT) step(world, commands.splice(0));
  const events = soundEvents(heard, world);
  sound.play(events, world.entities[0].x, world.entities[0].z);
  stats.kills += events.filter((e) => e.name === 'skel_die' || e.name === 'boss_die').length;
  const o = outcome(world);
  if (!paused && !o) stats.time += dt;
  if (o === 'clear') clearRun(); // 다 깼으면 이어할 것이 없다
  if (o === 'descend') enterFloor(floor + 1, world);
  heard = snapshot(world);
  draw(world, dt);
  drawAutomap(world);
  drawLabels(world, camera, renderer.domElement);
  updateHud(world, hovered, choosing, stats);
  requestAnimationFrame(frame);
});
