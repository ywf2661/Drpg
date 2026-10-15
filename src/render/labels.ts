// 바닥 장비 이름표(HTML). 화면 좌표로 투영해 장비 위에 띄운다. 색은 등급(일반·마법·희귀), 지금보다 좋으면 ▲.
import * as THREE from 'three';
import { AFFIXES, ARMORS, isBetter, WEAPONS, type Affix, type Item, type World } from '../sim/world';

const SHOW = 9; // 주인공에서 이 거리(m) 안의 장비만
const LIFT = 0.6; // 이름표 높이(m)
const pool: HTMLDivElement[] = [];
const v = new THREE.Vector3();
let layer: HTMLElement;

// 장비 이름: 옵션 접두어들 + 기본 이름(예: '날카로운 신속한 롱소드')
export function gearName(kind: 'weapon' | 'armor', tier: number, affixes: Affix[]): string {
  const base = (kind === 'weapon' ? WEAPONS : ARMORS)[tier - 1].name;
  return [...affixes.map((a) => AFFIXES[a.kind].name), base].join(' ');
}

// 바닥 이름표. quality = 옵션 수(0 일반·1 마법·2 희귀), better = 지금 장착한 것보다 나은가
export function itemLabel(it: Item, w: World): { text: string; better: boolean; quality: number } | null {
  if (it.kind === 'potion') return null;
  if (it.kind === 'gold') return { text: `금화 ${it.amount}`, better: false, quality: 0 };
  const affixes = it.affixes ?? [];
  return { text: gearName(it.kind, it.tier, affixes), better: isBetter(w, it), quality: affixes.length };
}

export function initLabels(el: HTMLElement) {
  layer = el;
}

export function drawLabels(world: World, camera: THREE.Camera, canvas: HTMLCanvasElement) {
  const hero = world.entities[0];
  const r = canvas.getBoundingClientRect();
  let n = 0;
  for (const it of world.items) {
    const label = itemLabel(it, world);
    if (!label || Math.hypot(it.x - hero.x, it.z - hero.z) > SHOW) continue;
    v.set(it.x, LIFT, it.z).project(camera);
    const div = pool[n] ?? layer.appendChild(Object.assign(document.createElement('div'), { className: 'label' }));
    pool[n++] = div;
    div.textContent = label.text + (label.better ? ' ▲' : '');
    div.className = `label q${label.quality}` + (label.better ? ' better' : '');
    div.style.transform = `translate(${r.left + ((v.x + 1) / 2) * r.width}px, ${r.top + ((1 - v.y) / 2) * r.height}px) translate(-50%, -100%)`;
    div.hidden = false;
  }
  for (let i = n; i < pool.length; i++) pool[i].hidden = true;
}
