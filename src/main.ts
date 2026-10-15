import { draw, initRender } from './render/render';
import { createWorld, DT, step } from './sim/world';

const SEED = 1;
const banner = document.querySelector<HTMLElement>('#banner')!;
const world = createWorld(SEED);

try {
  await initRender(world);
} catch (err) {
  banner.textContent = `모델을 불러오지 못했습니다: ${err instanceof Error ? err.message : err}`;
  throw err;
}
banner.hidden = true;

let acc = 0;
let last = performance.now();
requestAnimationFrame(function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.25); // 탭 전환 후 복귀 시 수천 틱 몰아서 돌지 않게
  last = now;
  for (acc += dt; acc >= DT; acc -= DT) step(world, []);
  draw(world, dt);
  requestAnimationFrame(frame);
});
