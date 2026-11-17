// 구르기 연출(그림에 구르기 동작이 없어 판자를 움직여 만든다): 몸 가운데를 축으로 한 바퀴, 지나간 자리에 잔상, 출발·착지에 흙먼지.
// sim은 바꾸지 않는다(무적·이동은 그대로).
import * as THREE from 'three';
import { LEAP, ROLL, type Entity } from '../sim/world';
import type { Sprite } from './sprites';
import { puff } from './rain';

const RIGHT = new THREE.Vector3(1, 0, -1).normalize(); // 판자의 가로(= 화면 가로, 카메라 수평 45°)
const CENTER = 0.6; // 이 높이(m)를 축으로 돈다(몸 가운데)
const SQUASH = 0.8; // 도는 동안 몸을 조금 웅크린다
const GHOST_EVERY = 0.04; // 잔상 간격(초)
const GHOST_LIFE = 0.22; // 잔상이 사라지는 시간(초)
const GHOST_TINT = new THREE.Color(0.75, 0.85, 1);

type Ghost = { mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>; age: number };
const ghosts: Ghost[] = [];
export const rollGroup = new THREE.Group();
let rolling = false;
let ghostT = 0;

function ghost(s: Sprite) {
  let g = ghosts.find((g) => g.age >= GHOST_LIFE);
  if (!g) {
    const mat = new THREE.MeshBasicMaterial({ map: s.mat.map!.clone(), transparent: true, depthWrite: false, toneMapped: false, color: GHOST_TINT });
    g = { mesh: new THREE.Mesh(s.mesh.geometry, mat), age: GHOST_LIFE };
    g.mesh.renderOrder = 2;
    rollGroup.add(g.mesh);
    ghosts.push(g);
  }
  const map = s.mat.map!;
  if (g.mesh.material.map!.source !== map.source) {
    // 장비를 바꿔 주인공 그림이 바뀌었다
    g.mesh.material.map!.dispose();
    g.mesh.material.map = map.clone();
  }
  g.mesh.geometry = s.mesh.geometry;
  g.mesh.material.map!.offset.copy(map.offset);
  g.mesh.material.map!.repeat.copy(map.repeat);
  g.mesh.position.copy(s.mesh.position);
  g.mesh.rotation.copy(s.mesh.rotation);
  g.mesh.scale.copy(s.mesh.scale);
  g.age = 0;
}

// 주인공 판자를 그린 뒤(위치가 정해진 뒤) 매 프레임
export function rollFx(s: Sprite, e: Entity, dt: number) {
  const on = e.phase === 'roll' && e.state !== 'dead';
  if (on !== rolling) {
    // 출발·착지: 발밑에 흙먼지
    for (let k = 0; k < 3; k++) puff(e.x + (Math.random() - 0.5) * 0.7, e.z + (Math.random() - 0.5) * 0.7);
    rolling = on;
    ghostT = 0;
  }
  const mesh = s.mesh;
  if (on) {
    const p = Math.min(1, Math.max(0, 1 - e.phaseT / ROLL.dist)); // 구른 비율
    const side = e.dx * RIGHT.x + e.dz * RIGHT.z >= 0 ? -1 : 1; // 화면 오른쪽으로 구르면 시계 방향
    const a = side * Math.PI * 2 * p;
    mesh.rotation.z = a;
    mesh.scale.y = SQUASH;
    // 발이 아니라 몸 가운데를 축으로: 판자 평면에서 (0, CENTER)가 제자리에 있도록 옮긴다
    const c = CENTER * SQUASH;
    mesh.position.x += RIGHT.x * c * Math.sin(a);
    mesh.position.z += RIGHT.z * c * Math.sin(a);
    mesh.position.y += c * (1 - Math.cos(a));
    if ((ghostT -= dt) <= 0) {
      ghost(s);
      ghostT = GHOST_EVERY;
    }
  } else {
    mesh.rotation.z = 0;
    mesh.scale.y = 1;
  }
  for (const g of ghosts) {
    g.age += dt;
    g.mesh.visible = g.age < GHOST_LIFE;
    g.mesh.material.opacity = 0.5 * Math.max(0, 1 - g.age / GHOST_LIFE);
  }
}

// 대지 강타 체공(sim phase 'leap'): 포물선으로 떠올랐다 내린다. 바닥엔 그림자, 뒤엔 잔상, 뛰고 내릴 때 흙먼지
const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.45, 24), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false }));
shadow.rotation.x = -Math.PI / 2;
shadow.visible = false;
rollGroup.add(shadow);
let leaping = false;

// rollFx 다음에 매 프레임
export function leapFx(s: Sprite, e: Entity, dt: number) {
  const on = e.phase === 'leap' && e.state !== 'dead';
  if (on !== leaping) {
    for (let k = 0; k < (on ? 3 : 6); k++) puff(e.x + (Math.random() - 0.5) * 1.2, e.z + (Math.random() - 0.5) * 1.2);
    leaping = on;
    ghostT = 0;
  }
  shadow.visible = on;
  if (!on) return;
  const p = Math.min(1, Math.max(0, 1 - e.phaseT / LEAP.air)); // 날아간 비율
  const h = 4 * LEAP.height * p * (1 - p);
  s.mesh.position.y += h;
  s.mesh.scale.y = p < 0.5 ? 1.1 : 0.95; // 오를 땐 늘어나고 내려찍을 땐 웅크린다
  shadow.position.set(e.x, 0.02, e.z);
  shadow.scale.setScalar(1 - (0.5 * h) / LEAP.height); // 높이 뜰수록 작게
  if ((ghostT -= dt) <= 0) {
    ghost(s);
    ghostT = GHOST_EVERY;
  }
}
