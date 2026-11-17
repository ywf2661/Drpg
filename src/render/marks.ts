// 적 머리 위 검흔 아이콘(HTML). labels.ts와 같은 층에 풀 방식으로 띄운다.
import * as THREE from 'three';
import type { Entity } from '../sim/rules';
import { memoryStat, type World } from '../sim/world';

const pool: HTMLDivElement[] = [];
const prev = new Map<number, { n: number; until: number }>(); // 엔티티 id → 직전 검흔 수, grow 끝나는 시각(초)
const GROW = 0.12; // 새 검흔이 붙을 때 튀는 시간(초)
const v = new THREE.Vector3();
let layer: HTMLElement;

// 아이콘 정보. 죽었거나 검흔이 없으면 null. 한계 직전이면 깜빡, 만료 1초 전이면 흐림
export function pips(e: Entity, cap: number): { n: number; blink: boolean; dim: boolean } | null {
  const n = e.marks ?? 0;
  if (e.state === 'dead' || n <= 0) return null;
  return { n, blink: n >= cap - 1, dim: (e.markT ?? 0) < 1 };
}

// 튀는 효과가 끝나는 시각. 검흔이 늘면 now+GROW, 아니면 그대로(매 프레임 클래스를 다시 쓰므로 끝날 때까지 유지해야 한다)
export function growUntil(prevN: number, n: number, now: number, until: number): number {
  return n > prevN ? now + GROW : until;
}

export function initMarks(el: HTMLElement) {
  layer = el;
}

// head: render.headOf를 main이 넘긴다(render.ts는 WebGL을 바로 만들어 테스트에서 못 불러온다)
export function drawMarks(world: World, camera: THREE.Camera, canvas: HTMLCanvasElement, head: (id: number) => THREE.Vector3 | null) {
  const r = canvas.getBoundingClientRect();
  const cap = memoryStat(world).cap;
  let k = 0;
  for (const e of world.entities) {
    const p = pips(e, cap);
    const top = p && head(e.id);
    if (!p || !top) {
      prev.delete(e.id);
      continue;
    }
    v.copy(top).project(camera);
    const div = pool[k] ?? layer.appendChild(document.createElement('div'));
    pool[k++] = div;
    const old = prev.get(e.id) ?? { n: 0, until: 0 };
    const now = performance.now() / 1000;
    const until = growUntil(old.n, p.n, now, old.until);
    prev.set(e.id, { n: p.n, until });
    div.className = 'pips' + (p.blink ? ' blink' : '') + (p.dim ? ' dim' : '') + (now < until ? ' grow' : '');
    div.textContent = '╱'.repeat(p.n);
    div.style.transform = `translate(${r.left + ((v.x + 1) / 2) * r.width}px, ${r.top + ((1 - v.y) / 2) * r.height}px) translate(-50%, -100%)`;
    div.hidden = false;
  }
  for (let i = k; i < pool.length; i++) pool[i].hidden = true;
}
