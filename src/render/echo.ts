// 칼의 여운 칸: 기사 머리 위에 ◆◇(HTML, 이름표 층). 가득 차면 빛난다
import * as THREE from 'three';
import { ECHO, rank, type World } from '../sim/world';

let div: HTMLDivElement | null = null;
const v = new THREE.Vector3();

// 보일 글자. 칼의 여운을 안 배웠거나 죽었으면 null
export function echoPips(w: World): { text: string; full: boolean } | null {
  if (!rank(w, 'echo') || w.entities[0].state === 'dead') return null;
  const n = Math.min(w.echo, ECHO.need);
  return { text: '◆'.repeat(n) + '◇'.repeat(ECHO.need - n), full: n >= ECHO.need };
}

export function initEcho(layer: HTMLElement) {
  div = layer.appendChild(document.createElement('div'));
  div.hidden = true;
}

// head: render.headOf를 main이 넘긴다(render.ts는 WebGL을 바로 만들어 테스트에서 못 불러온다)
export function drawEcho(world: World, camera: THREE.Camera, canvas: HTMLCanvasElement, head: (id: number) => THREE.Vector3 | null) {
  if (!div) return;
  const p = echoPips(world);
  const top = p && head(0);
  div.hidden = !top;
  if (!p || !top) return;
  const r = canvas.getBoundingClientRect();
  v.copy(top).project(camera);
  div.className = 'pips' + (p.full ? ' full' : '');
  div.textContent = p.text;
  div.style.transform = `translate(${r.left + ((v.x + 1) / 2) * r.width}px, ${r.top + ((1 - v.y) / 2) * r.height}px) translate(-50%, -150%)`;
}
