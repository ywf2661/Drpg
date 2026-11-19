// 바닥 장비 이름표(HTML). 화면 좌표로 투영해 장비 위에 띄운다. 색은 등급(일반·마법·희귀), 지금보다 좋으면 ▲.
import * as THREE from 'three';
import { AFFIXES, gearTable, isBetter, plainAffixes, quality, runeGrade, UNIQUES, uniqueOf, type Affix, type HeroClass, type Item, type Rune, type Slot, type World } from '../sim/world';
import { RELICS } from '../sim/sanctum';

// 룬 이름은 스킬 이름표가 있는 hud가 넣어 준다(hud가 이 파일을 import하므로 거꾸로 import하지 않는다)
let runeName = (r: Rune) => r;
export const setRuneNamer = (f: (r: Rune) => string) => (runeName = f);

const SHOW = 9; // 주인공에서 이 거리(m) 안의 장비만
const LIFT = 0.6; // 이름표 높이(m)
const pool: HTMLDivElement[] = [];
const v = new THREE.Vector3();
let layer: HTMLElement;

// 장비 이름: 옵션 접두어들 + 기본 이름(예: '날카로운 신속한 롱소드'). 고유 장비는 고유 이름(%는 기본 이름), 스킬 옵션은 접두어가 없다
export function gearName(kind: Slot, tier: number, affixes: Affix[], cls: HeroClass = 'knight'): string {
  const base = gearTable(cls)[kind][tier - 1].name;
  const u = uniqueOf({ affixes });
  if (u) return UNIQUES[u].name.replace('%', base);
  return [...plainAffixes(affixes).map((a) => AFFIXES[a.kind].name).filter(Boolean), base].join(' ');
}

// 바닥 이름표. quality = 등급(0 일반·1 마법·2 희귀·3 전설·4 세트), better = 지금 장착한 것보다 나은가
export function itemLabel(it: Item, w: World): { text: string; better: boolean; quality: number; rune?: number } | null {
  if (it.kind === 'potion') return null;
  if (it.kind === 'gold') return { text: `금화 ${it.amount}`, better: false, quality: 0 };
  if (it.kind === 'rune') return { text: runeName(it.rune!), better: false, quality: 0, rune: runeGrade(it.rune!) };
  if (it.kind === 'relic') return { text: `성물 · ${RELICS[it.relic!]}`, better: false, quality: 3 };
  const affixes = it.affixes ?? [];
  return { text: gearName(it.kind, it.tier, affixes, w.cls), better: isBetter(w, it), quality: quality({ affixes }) };
}

export function initLabels(el: HTMLElement) {
  layer = el;
}

// 출구 이름표(바깥 지역): 길 끝의 "▶ 설원 3구역", 동굴 입구의 "▼ 지하 3층". 멀리서도 보이게 SIGN 안이면
export type Sign = { x: number; z: number; text: string; alert?: boolean }; // alert = 할 말이 있는 NPC(머리 위 !)
const SIGN = 16;

export function drawLabels(world: World, camera: THREE.Camera, canvas: HTMLCanvasElement, signs: Sign[] = []) {
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
    div.className = label.rune !== undefined ? `label rune-label r${label.rune}` : `label q${label.quality}` + (label.better ? ' better' : '');
    div.style.transform = `translate(${r.left + ((v.x + 1) / 2) * r.width}px, ${r.top + ((1 - v.y) / 2) * r.height}px) translate(-50%, -100%)`;
    div.hidden = false;
  }
  for (const s of signs) {
    if (Math.hypot(s.x - hero.x, s.z - hero.z) > SIGN) continue;
    v.set(s.x, LIFT * 2, s.z).project(camera);
    const div = pool[n] ?? layer.appendChild(Object.assign(document.createElement('div'), { className: 'label' }));
    pool[n++] = div;
    div.textContent = s.text;
    div.className = s.alert ? 'label sign alert' : 'label sign';
    div.style.transform = `translate(${r.left + ((v.x + 1) / 2) * r.width}px, ${r.top + ((1 - v.y) / 2) * r.height}px) translate(-50%, -100%)`;
    div.hidden = false;
  }
  for (let i = n; i < pool.length; i++) pool[i].hidden = true;
}
