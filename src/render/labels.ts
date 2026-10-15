// 바닥 장비 이름표(HTML). 화면 좌표로 투영해 장비 위에 띄운다. 더 좋은 것은 금색, 아니면 회색.
import * as THREE from 'three';
import { ARMORS, WEAPONS, type Gear, type Item, type World } from '../sim/world';

const SHOW = 9; // 주인공에서 이 거리(m) 안의 장비만
const LIFT = 0.6; // 이름표 높이(m)
const pool: HTMLDivElement[] = [];
const v = new THREE.Vector3();
let layer: HTMLElement;

export function itemLabel(it: Item, gear: Gear): { text: string; better: boolean } | null {
  if (it.kind === 'potion') return null;
  if (it.kind === 'gold') return { text: `금화 ${it.amount}`, better: false };
  const text = (it.kind === 'weapon' ? WEAPONS : ARMORS)[it.tier - 1].name;
  return { text, better: it.tier > gear[it.kind] };
}

export function initLabels(el: HTMLElement) {
  layer = el;
}

export function drawLabels(world: World, camera: THREE.Camera, canvas: HTMLCanvasElement) {
  const hero = world.entities[0];
  const r = canvas.getBoundingClientRect();
  let n = 0;
  for (const it of world.items) {
    const label = itemLabel(it, world.gear);
    if (!label || Math.hypot(it.x - hero.x, it.z - hero.z) > SHOW) continue;
    v.set(it.x, LIFT, it.z).project(camera);
    const div = pool[n] ?? layer.appendChild(Object.assign(document.createElement('div'), { className: 'label' }));
    pool[n++] = div;
    div.textContent = label.text;
    div.classList.toggle('better', label.better);
    div.style.transform = `translate(${r.left + ((v.x + 1) / 2) * r.width}px, ${r.top + ((1 - v.y) / 2) * r.height}px) translate(-50%, -100%)`;
    div.hidden = false;
  }
  for (let i = n; i < pool.length; i++) pool[i].hidden = true;
}
