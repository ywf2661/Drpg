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
let world = createWorld(SEED);

try {
  await initRender(world);
} catch (err) {
  banner.textContent = `모델을 불러오지 못했습니다: ${err instanceof Error ? err.message : err}`;
  throw err;
}
banner.hidden = true;
initInput();

addEventListener('keydown', (e) => {
  // e.code: 한글 입력 상태에서도 물리 R 키로 인식된다
  if (e.code !== 'KeyR' || !outcome(world)) return;
  world = createWorld(SEED);
  setWorld(world);
  commands.length = 0;
});

let acc = 0;
let last = performance.now();
requestAnimationFrame(function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.25); // 탭 전환 후 복귀 시 수천 틱 몰아서 돌지 않게
  last = now;
  pollInput(world, dt);
  for (acc += dt; acc >= DT; acc -= DT) step(world, commands.splice(0));
  draw(world, dt);
  hud();
  requestAnimationFrame(frame);
});

function hud() {
  const hero = world.entities[0];
  heroFill.style.width = `${(hero.hp / STATS.hero.hp) * 100}%`;
  const m = hovered === null ? null : world.entities[hovered];
  target.hidden = !m;
  if (m) {
    targetName.textContent = STATS[m.kind].name;
    targetFill.style.width = `${(m.hp / STATS[m.kind].hp) * 100}%`;
  }
  renderer.domElement.style.cursor = m ? 'crosshair' : '';
  const o = outcome(world);
  banner.hidden = !o;
  if (o) banner.textContent = o === 'dead' ? '사망했습니다 — R 키로 다시 시작' : '클리어! — R 키로 다시 시작';
}
