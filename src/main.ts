import potionIcon from './assets/sprites/potion_icon.png';
import { commands, hovered, initInput, pollInput } from './input';
import { draw, initRender, renderer, setWorld } from './render/render';
import { generateFloor } from './sim/dungeon';
import { createWorld, DT, outcome, STATS, step, type World } from './sim/world';

const $ = (sel: string) => document.querySelector<HTMLElement>(sel)!;
const heroFill = $('#hp i');
const target = $('#target');
const targetName = $('#target span');
const targetFill = $('#target i');
const banner = $('#banner');
const bannerText = $('#banner p');
const restartBtn = $('#restart');
const floorLabel = $('#floor');
const floorTitle = $('#floor-title');
const potionBtn = $('#potion');
const potionCount = $('#potion span');
const credits = document.querySelector<HTMLDialogElement>('#credits')!;
const START_POTIONS = 2;
let floor = 1;
let carried = START_POTIONS; // 이 층에 들어올 때의 물약 수(사망 후 다시 시작하면 이만큼으로)
let world = makeFloor(floor, carried);

// 층마다 새 시드(sim 밖이라 Math.random 사용). 층 배율 1, 1.2, 1.4 …
function makeFloor(n: number, potions: number): World {
  const seed = Math.floor(Math.random() * 2 ** 31);
  const w = createWorld(seed, generateFloor(seed, n), 1 + 0.2 * (n - 1));
  w.potions = potions;
  return w;
}

function showFloor() {
  floorLabel.textContent = floorTitle.textContent = `지하 ${floor}층`;
  floorTitle.classList.remove('show');
  void floorTitle.offsetWidth; // 애니메이션을 처음부터 다시 재생
  floorTitle.classList.add('show');
}

function enterFloor(n: number, potions: number) {
  floor = n;
  carried = potions;
  world = makeFloor(n, potions);
  setWorld(world);
  commands.length = 0; // 이전 층에서 쌓인 명령을 새 층에 적용하지 않는다
  showFloor();
}

try {
  await initRender(world);
} catch (err) {
  bannerText.textContent = `그림을 불러오지 못했습니다: ${err instanceof Error ? err.message : err}`;
  throw err;
}
banner.hidden = true;
initInput();
showFloor();
if (import.meta.env.DEV) Object.assign(window, { __game: { get world() { return world; }, commands } }); // 헤드리스 확인용

function restart() {
  const o = outcome(world);
  if (o === 'dead') enterFloor(floor, carried); // 같은 층을 새 모양으로
  else if (o === 'clear') enterFloor(1, START_POTIONS);
}
const drink = () => commands.push({ type: 'drink' });
// e.code: 한글 입력 상태에서도 물리 키
addEventListener('keydown', (e) => {
  if (e.code === 'KeyR') restart();
  else if (e.code === 'KeyQ' || e.code === 'Digit1') drink();
});
restartBtn.addEventListener('click', restart); // 모바일용
potionBtn.querySelector('img')!.src = potionIcon;
potionBtn.addEventListener('click', drink);

let acc = 0;
let last = performance.now();
requestAnimationFrame(function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.25); // 탭 전환 후 복귀 시 수천 틱 몰아서 돌지 않게
  last = now;
  pollInput(world, dt);
  if (credits.open) acc = 0; // 크레딧을 읽는 동안은 게임을 멈춘다
  else for (acc += dt; acc >= DT; acc -= DT) step(world, commands.splice(0));
  if (outcome(world) === 'descend') enterFloor(floor + 1, world.potions);
  draw(world, dt);
  hud();
  requestAnimationFrame(frame);
});

function hud() {
  const hero = world.entities[0];
  heroFill.style.width = `${(hero.hp / hero.maxHp) * 100}%`;
  potionCount.textContent = String(world.potions);
  potionBtn.classList.toggle('empty', world.potions === 0);
  const id = hovered ?? hero.target; // 마우스 오버가 없으면(모바일) 공격 중인 대상
  const m = id === null ? null : world.entities[id];
  target.hidden = !m;
  if (m) {
    targetName.textContent = STATS[m.kind].name;
    targetFill.style.width = `${(m.hp / m.maxHp) * 100}%`;
  }
  renderer.domElement.classList.toggle('attack', hovered !== null); // 몬스터 위에서는 공격 커서
  const o = outcome(world);
  banner.hidden = restartBtn.hidden = o !== 'dead' && o !== 'clear';
  if (o === 'dead') bannerText.textContent = '사망했습니다';
  if (o === 'clear') bannerText.textContent = '클리어!';
}
