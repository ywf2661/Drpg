// 역병 걸린 뱃사공(2막 ① 호숫가 보스, 설계: docs/superpowers/specs/2026-11-24-act2-lake-design.md 7절).
// 마른 큰 키(약 2.3m), 천 대신 딱딱한 판 여러 장으로 짠 후드 망토, 긴 삿대(꼭대기 갈고리에 황록빛 등불), 검은 딱지가 핀 잿빛 녹색 손, 후드 속 두 눈.
// 배는 그리지 않는다(게임이 배 모형 위에 세운다 — src/render/water.ts).
import { THREE, root, v, lerp, smooth, nlerp, EASE, OCT, mk, mosaic, scratches, limb, orient, ik, start } from './kit.js';

const clothTex = mosaic(256, 90, 21, 70, 150, 25, 3);
const skinTex = mosaic(128, 50, 8, 120, 230, 30, 2.5);
const woodTex = scratches(128, 9);
const cloak = new THREE.MeshStandardMaterial({ color: 0x6c7660, map: clothTex, bumpMap: clothTex, bumpScale: 4, roughness: 0.9, flatShading: true });
const cloakDark = new THREE.MeshStandardMaterial({ color: 0x485240, map: clothTex, bumpMap: clothTex, bumpScale: 4, roughness: 0.95, flatShading: true });
const skin = new THREE.MeshStandardMaterial({ color: 0xb4c484, map: skinTex, bumpMap: skinTex, bumpScale: 3, roughness: 0.75, flatShading: true });
const scab = new THREE.MeshStandardMaterial({ color: 0x120c10, roughness: 0.6, flatShading: true });
const wood = new THREE.MeshStandardMaterial({ color: 0x6a4a2c, map: woodTex, bumpMap: woodTex, bumpScale: 2, roughness: 0.8, flatShading: true });
const brass = new THREE.MeshStandardMaterial({ color: 0x8a7038, roughness: 0.45, metalness: 0.6, flatShading: true });
const voidM = new THREE.MeshBasicMaterial({ color: 0x050605 });
const sick = new THREE.MeshBasicMaterial({ color: 0xc8f060 }); // 황록빛(눈·등불)
const LIMB = { core: skin, plate: cloakDark, ring: scab };

const pelvis = new THREE.Group();
root.add(pelvis);
const torso = new THREE.Group();
pelvis.add(torso);
// 몸통: 좁고 긴 가슴을 판 망토가 덮는다
torso.add(mk(new THREE.CylinderGeometry(0.2, 0.15, 0.7, 6), cloak, [0, 0.38, 0], [1, 1, 0.75]));
for (const [x, y, z, rz] of [[-0.13, 0.5, 0.11, 0.25], [0.13, 0.5, 0.11, -0.25], [0, 0.3, 0.14, 0], [-0.2, 0.62, 0, 0.6], [0.2, 0.62, 0, -0.6]]) torso.add(mk(OCT, cloakDark, [x, y, z], [0.11, 0.24, 0.05], [0.1, 0, rz]));
torso.add(mk(new THREE.TorusGeometry(0.16, 0.025, 4, 10), brass, [0, 0.02, 0], [1, 1, 0.75], [Math.PI / 2, 0, 0])); // 허리끈
const shoulders = [-1, 1].map((sx) => {
  const g = new THREE.Group();
  g.position.set(sx * 0.22, 0.68, 0);
  g.add(mk(OCT, cloak, [sx * 0.05, 0.04, 0], [0.13, 0.08, 0.13], [0, 0, sx * -0.5])); // 어깨 판
  torso.add(g);
  return g;
});
// 머리: 뾰족한 후드(판 넷) 속 검은 얼굴에 황록빛 눈 둘, 턱 아래 딱지 핀 살갗
const head = new THREE.Group();
head.position.set(0, 0.86, 0.02);
torso.add(head);
head.add(mk(new THREE.ConeGeometry(0.2, 0.46, 5), cloak, [0, 0.08, -0.04], [1, 1, 1], [-0.25, 0, 0]));
for (const sx of [-1, 1]) head.add(mk(OCT, cloakDark, [sx * 0.13, 0.0, 0.03], [0.05, 0.2, 0.12], [0, 0, sx * 0.15]));
head.add(mk(new THREE.CircleGeometry(1, 10), voidM, [0, -0.02, 0.12], [0.09, 0.13, 1]));
for (const sx of [-1, 1]) head.add(mk(new THREE.SphereGeometry(0.026, 6, 4), sick, [sx * 0.045, 0.0, 0.13]));
head.add(mk(new THREE.SphereGeometry(1, 6, 4), skin, [0, -0.13, 0.08], [0.06, 0.05, 0.05])); // 턱
head.add(mk(new THREE.SphereGeometry(0.02, 4, 3), scab, [0.03, -0.14, 0.12]));
// 허리 아래: 길게 늘어진 판 망토(가운데가 갈라져 발이 보인다)
const skirt = new THREE.Group();
pelvis.add(skirt);
for (let k = 0; k < 9; k++) {
  const a = (k / 9) * Math.PI * 2;
  if (Math.abs(Math.sin(a / 2)) < 0.15) continue; // 앞이 트였다
  const m = mk(OCT, k % 2 ? cloak : cloakDark, [Math.sin(a) * 0.2, -0.45, Math.cos(a) * 0.16], [0.13, 0.5, 0.05], [Math.cos(a) * 0.18, a, -Math.sin(a) * 0.18]);
  skirt.add(m);
}
// 다리(망토 아래로 정강이·발만 보인다)
const THIGH = 0.5, SHIN = 0.52, UPPER = 0.4, FORE = 0.4;
const legs = [-1, 1].map(() => ({ thigh: limb(THIGH, 0.07, LIMB, 1.4), shin: limb(SHIN, 0.06, LIMB, 1.4), foot: new THREE.Group() }));
for (const l of legs) {
  l.foot.add(mk(new THREE.BoxGeometry(0.1, 0.06, 0.24), cloakDark, [0, 0.03, 0.06]));
  root.add(l.thigh, l.shin, l.foot);
}
const arms = [-1, 1].map(() => ({ upper: limb(UPPER, 0.055, LIMB, 1.8), fore: limb(FORE, 0.05, { core: skin, plate: skin, ring: scab }, 1.2), hand: mk(new THREE.BoxGeometry(0.07, 0.11, 0.08), skin) }));
for (const a of arms) root.add(a.upper, a.fore, a.hand);
for (const a of arms) a.fore.add(mk(new THREE.SphereGeometry(0.025, 4, 3), scab, [0.04, 0.25, 0.03]), mk(new THREE.SphereGeometry(0.02, 4, 3), scab, [-0.03, 0.12, 0.04]));
// 삿대: 오른손 = 원점, +Y가 꼭대기(1.25m 위, 갈고리에 등불), -Y로 1.1m
const pole = new THREE.Group();
pole.add(mk(new THREE.CylinderGeometry(0.03, 0.035, 2.35, 6), wood, [0, 0.075, 0]));
pole.add(mk(new THREE.TorusGeometry(0.1, 0.018, 4, 8, Math.PI * 1.2), brass, [0.07, 1.27, 0], [1, 1, 1], [0, 0, -0.4])); // 갈고리
const lamp = new THREE.Group();
lamp.position.set(0.16, 1.12, 0);
lamp.add(mk(new THREE.CylinderGeometry(0.09, 0.1, 0.18, 6), sick, [0, 0, 0])); // 빛나는 유리
for (const y of [-0.1, 0.09]) lamp.add(mk(new THREE.CylinderGeometry(0.11, 0.11, 0.03, 6), brass, [0, y, 0])); // 위아래 놋쇠 테
lamp.add(mk(new THREE.ConeGeometry(0.105, 0.1, 6), brass, [0, 0.14, 0]));
pole.add(lamp);
const light = new THREE.PointLight(0xc8f060, 3, 2.2);
lamp.add(light);
root.add(pole);

const UP = v(0, 1, 0);
// 공격(삿대 휘두르기) 열쇠 장면: [t, 오른손, 삿대 방향(꼭대기 쪽), 상체 숙임, 허리 비틀기, 이 장면으로 오는 가속]
const ATK = [
  [0, [0.3, 1.35, 0.18], [0.05, 1, 0.05], 0, 0, 'io'],
  [0.35, [0.35, 1.45, -0.15], [0.85, 0.35, -0.4], -0.1, 0.55, 'io'], // 오른쪽 뒤로 감아올린다
  [0.45, [0.36, 1.46, -0.18], [0.88, 0.3, -0.38], -0.12, 0.6, 'io'], // 멈칫
  [0.6, [-0.05, 1.3, 0.45], [-0.5, 0.15, 0.85], 0.25, -0.35, 'in'], // 앞을 쓸며 휘두른다
  [0.75, [-0.25, 1.2, 0.35], [-0.95, 0.05, 0.3], 0.3, -0.6, 'out'],
  [1, [0.3, 1.35, 0.18], [0.05, 1, 0.05], 0, 0, 'io'],
];
function atkAt(t) {
  for (let i = 0; i < ATK.length - 1; i++) {
    const A = ATK[i], B = ATK[i + 1];
    if (t <= B[0]) {
      const f = EASE[B[5]]((t - A[0]) / (B[0] - A[0]));
      return { grip: v(...A[1]).lerp(v(...B[1]), f), dir: nlerp(v(...A[2]).normalize(), v(...B[2]).normalize(), f), lean: lerp(A[3], B[3], f), yaw: lerp(A[4], B[4], f) };
    }
  }
}
function gait(u) {
  const L = 0.24;
  if (u < 0.6) return { z: L - 2 * L * (u / 0.6), y: 0 };
  const f = (u - 0.6) / 0.4;
  return { z: -L + 2 * L * smooth(f), y: Math.sin(f * Math.PI) * 0.1 };
}

function pose(anim, t) {
  const ph = t * Math.PI * 2;
  let grip = v(0.3, 1.35, 0.18), dir = v(0.05, 1, 0.05).normalize(), lean = 0.08, yaw = 0, twist = 0, px = 0, py = 1.02, pz = 0, sink = 0;
  let feet = [v(-0.16, 0.04, 0.02), v(0.16, 0.04, -0.02)];
  if (anim === 'stance') {
    py += Math.sin(ph) * 0.012;
    lean += Math.sin(ph) * 0.02;
    dir = v(0.05 + Math.sin(ph) * 0.03, 1, 0.05).normalize();
  }
  if (anim === 'attack') {
    const k = atkAt(t);
    grip = k.grip, dir = k.dir, lean = 0.08 + k.lean, twist = k.yaw;
  }
  if (anim === 'hit') {
    const f = Math.sin(Math.min(1, t) * Math.PI);
    lean = 0.08 - 0.25 * f, pz = -0.05 * f, twist = 0.15 * f;
  }
  if (anim === 'move') {
    // 삿대를 지팡이처럼 짚으며 걷는다
    const g = [gait(t % 1), gait((t + 0.5) % 1)];
    feet = g.map((s, i) => v(i ? 0.14 : -0.14, 0.04 + s.y, s.z));
    py = 1.03 + 0.025 * Math.cos(4 * Math.PI * (t - 0.3));
    yaw = (g[0].z - g[1].z) * 0.25;
    twist = -yaw * 1.4;
    lean = 0.14;
    grip = v(0.3, 1.3, 0.25 + Math.sin(ph) * 0.12);
    dir = v(0.08, 1, -0.15 + Math.sin(ph) * 0.22).normalize();
  }
  if (anim === 'die') {
    // 무릎이 꺾이며 주저앉고, 삿대는 손에 쥔 채 앞으로 기운다. 등불이 꺼져 간다
    const f = smooth(Math.min(1, t * 1.25));
    sink = f;
    py = lerp(1.02, 0.35, f);
    lean = lerp(0.08, 0.9, f);
    grip = v(0.3, lerp(1.35, 0.7, f), lerp(0.18, 0.5, f));
    dir = nlerp(v(0.05, 1, 0.05).normalize(), v(0.3, 0.35, 0.9).normalize(), f);
    feet = [v(-0.2, 0.04, lerp(0.02, 0.25, f)), v(0.2, 0.04, lerp(-0.02, 0.2, f))];
  }
  light.intensity = 3 * (1 - sink);
  pelvis.position.set(px, py - lean * 0.1, pz - lean * 0.05);
  pelvis.rotation.y = yaw;
  torso.rotation.set(lean, twist, 0);
  head.rotation.set(-lean * 0.3 + sink * 0.4, -twist * 0.4, 0);
  skirt.rotation.set(-lean * 0.3, 0, 0);
  skirt.scale.y = lerp(1, 0.55, sink);
  root.updateMatrixWorld(true);
  const local = (obj, p) => root.worldToLocal(obj.localToWorld(p.clone()));
  [-1, 1].forEach((sx, i) => {
    const l = legs[i];
    const hip = local(pelvis, v(sx * 0.1, -0.02, 0));
    const [knee, end] = ik(hip, feet[i], THIGH, SHIN, v(sx * 0.2, 0, 1));
    orient(l.thigh, hip, knee, v(0, 0, 1));
    orient(l.shin, knee, end, v(0, 0, 1));
    l.foot.position.set(end.x, Math.max(0, end.y - 0.04), end.z);
    l.foot.rotation.set(0, sx * -0.2, 0);
  });
  pole.position.copy(grip);
  pole.quaternion.setFromUnitVectors(UP, dir);
  // 등불은 늘 아래로 매달린다
  pole.updateMatrixWorld(true);
  lamp.quaternion.copy(pole.quaternion).invert();
  pole.updateMatrixWorld(true);
  [-1, 1].forEach((sx, i) => {
    const a = arms[i];
    const sh = local(shoulders[i], v(0, -0.02, 0));
    const hand = root.worldToLocal(pole.localToWorld(v(0, sx > 0 ? 0 : -0.35, 0))); // 오른손은 원점, 왼손은 그 아래
    const [elbow, end] = ik(sh, hand, UPPER, FORE, v(sx, -0.4, -0.5));
    orient(a.upper, sh, elbow, v(0, 0, 1));
    orient(a.fore, elbow, end, v(0, 0, 1));
    a.hand.position.copy(end);
    a.hand.quaternion.copy(a.fore.quaternion);
  });
}

start(pose);
