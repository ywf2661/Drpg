import { commands, hovered, initInput, pollInput } from './input';
import { draw, initRender, renderer, setWorld } from './render/render';
import { createWorld, DT, outcome, STATS, step } from './sim/world';

const SEED = 1;
const $ = (sel: string) => document.querySelector<HTMLElement>(sel)!;
const heroFill = $('#hp i');
const target = $('#target');
const targetName = $('#target span');
const targetFill = $('#target i');
const banner = $('#banner');
const bannerText = $('#banner p');
const restartBtn = $('#restart');
const credits = document.querySelector<HTMLDialogElement>('#credits')!;
let world = createWorld(SEED);

try {
  await initRender(world);
} catch (err) {
  bannerText.textContent = `모델을 불러오지 못했습니다: ${err instanceof Error ? err.message : err}`;
  throw err;
}
banner.hidden = true;
initInput();

function restart() {
  if (!outcome(world)) return;
  world = createWorld(SEED);
  setWorld(world);
  commands.length = 0;
}
addEventListener('keydown', (e) => e.code === 'KeyR' && restart()); // e.code: 한글 입력 상태에서도 물리 R 키
restartBtn.addEventListener('click', restart); // 모바일용

let acc = 0;
let last = performance.now();
requestAnimationFrame(function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.25); // 탭 전환 후 복귀 시 수천 틱 몰아서 돌지 않게
  last = now;
  pollInput(world, dt);
  if (credits.open) acc = 0; // 크레딧을 읽는 동안은 게임을 멈춘다
  else for (acc += dt; acc >= DT; acc -= DT) step(world, commands.splice(0));
  draw(world, dt);
  hud();
  requestAnimationFrame(frame);
});

function hud() {
  const hero = world.entities[0];
  heroFill.style.width = `${(hero.hp / STATS.hero.hp) * 100}%`;
  const id = hovered ?? hero.target; // 마우스 오버가 없으면(모바일) 공격 중인 대상
  const m = id === null ? null : world.entities[id];
  target.hidden = !m;
  if (m) {
    targetName.textContent = STATS[m.kind].name;
    targetFill.style.width = `${(m.hp / STATS[m.kind].hp) * 100}%`;
  }
  renderer.domElement.classList.toggle('attack', hovered !== null); // 몬스터 위에서는 공격 커서
  const o = outcome(world);
  banner.hidden = restartBtn.hidden = !o;
  if (o) bannerText.textContent = o === 'dead' ? '사망했습니다' : '클리어!';
}
