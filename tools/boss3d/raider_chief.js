// 약탈자 우두머리(2막 ② 약탈자 진지 보스, 설계: docs/superpowers/specs/2026-11-24-act2-raid-design.md 4절).
// 몸이 부푼 큰 홉고블린(약 2.4m, 어깨가 넓고 구부정), 잿빛 보라 살갗에 보랏빛 핏줄, 아래턱 엄니, 가죽·쇳조각 갑옷,
// 등에 해골 꽂힌 말뚝 다발, 오른손에 넓적한 고기칼. 왼손은 빈손(통을 던진다).
import { THREE, root, v, lerp, smooth, nlerp, EASE, OCT, mk, mosaic, scratches, limb, orient, ik, start } from './kit.js';

const skinTex = mosaic(256, 80, 31, 120, 220, 40, 2.5);
const leatherTex = mosaic(128, 40, 17, 90, 170, 30, 3);
const ironTex = scratches(128, 23);
const skin = new THREE.MeshStandardMaterial({ color: 0x9a8aa4, map: skinTex, bumpMap: skinTex, bumpScale: 3, roughness: 0.7, flatShading: true });
const vein = new THREE.MeshBasicMaterial({ color: 0xb050ff });
const leather = new THREE.MeshStandardMaterial({ color: 0x6a4a30, map: leatherTex, bumpMap: leatherTex, bumpScale: 3, roughness: 0.85, flatShading: true });
const iron = new THREE.MeshStandardMaterial({ color: 0x8a8a90, map: ironTex, bumpMap: ironTex, bumpScale: 2, roughness: 0.45, metalness: 0.6, flatShading: true });
const wood = new THREE.MeshStandardMaterial({ color: 0x6e4a2a, roughness: 0.85, flatShading: true });
const bone = new THREE.MeshStandardMaterial({ color: 0xd8ceb0, roughness: 0.6, flatShading: true });
const voidM = new THREE.MeshBasicMaterial({ color: 0x0a0508 });
const eyeM = new THREE.MeshBasicMaterial({ color: 0xff7a30 });
const LIMB = { core: skin, plate: leather, ring: iron };

const pelvis = new THREE.Group();
root.add(pelvis);
const torso = new THREE.Group();
pelvis.add(torso);
// 몸통: 술통 같은 배 + 넓은 가슴, 가죽 띠와 쇳조각
torso.add(mk(new THREE.SphereGeometry(1, 8, 6), skin, [0, 0.25, 0.04], [0.34, 0.32, 0.3]));
torso.add(mk(new THREE.SphereGeometry(1, 8, 6), skin, [0, 0.62, 0], [0.44, 0.3, 0.32]));
torso.add(mk(new THREE.TorusGeometry(0.33, 0.06, 4, 10), leather, [0, 0.12, 0.02], [1, 1, 0.9], [Math.PI / 2, 0, 0]));
torso.add(mk(new THREE.BoxGeometry(0.12, 0.5, 0.05), leather, [0.08, 0.55, 0.28], [1, 1, 1], [0, 0, 0.6])); // 어깨띠
for (const [x, y] of [[-0.18, 0.6], [0.2, 0.42], [-0.05, 0.3]]) torso.add(mk(new THREE.BoxGeometry(0.03, 0.18, 0.02), vein, [x, y, 0.31], [1, 1, 1], [0, 0, x * 2]));
const shoulders = [-1, 1].map((sx) => {
  const g = new THREE.Group();
  g.position.set(sx * 0.42, 0.72, 0);
  g.add(mk(OCT, iron, [sx * 0.06, 0.08, 0], [0.2, 0.1, 0.2], [0, 0, sx * -0.35])); // 어깨 쇳조각
  g.add(mk(new THREE.ConeGeometry(0.04, 0.16, 4), iron, [sx * 0.12, 0.18, 0], [1, 1, 1], [0, 0, sx * -0.6])); // 가시
  torso.add(g);
  return g;
});
// 등: 해골 꽂힌 말뚝 다발
for (const [x, tilt, h] of [[-0.22, 0.3, 0.9], [0, 0.05, 1.05], [0.22, -0.3, 0.95], [-0.1, 0.15, 0.8]]) {
  const st = new THREE.Group();
  st.position.set(x, 0.45, -0.3);
  st.rotation.set(-0.2, 0, tilt);
  st.add(mk(new THREE.CylinderGeometry(0.03, 0.04, h, 5), wood, [0, h / 2, 0]));
  st.add(mk(new THREE.ConeGeometry(0.04, 0.12, 5), wood, [0, h + 0.06, 0]));
  st.add(mk(new THREE.SphereGeometry(0.09, 6, 5), bone, [0, h - 0.12, 0], [1, 1.1, 1]));
  st.add(mk(new THREE.SphereGeometry(0.022, 4, 3), voidM, [-0.03, h - 0.12, 0.075]), mk(new THREE.SphereGeometry(0.022, 4, 3), voidM, [0.03, h - 0.12, 0.075]));
  torso.add(st);
}
// 머리: 앞으로 쑥 나온 큰 머리, 엄니, 주황 눈, 뾰족 귀
const head = new THREE.Group();
head.position.set(0, 0.9, 0.12);
torso.add(head);
head.add(mk(new THREE.SphereGeometry(1, 8, 6), skin, [0, 0.05, 0], [0.17, 0.16, 0.17]));
head.add(mk(new THREE.BoxGeometry(0.26, 0.1, 0.18), skin, [0, -0.06, 0.06])); // 턱
for (const sx of [-1, 1]) {
  head.add(mk(new THREE.ConeGeometry(0.025, 0.12, 4), bone, [sx * 0.08, 0.02, 0.15], [1, 1, 1], [0.3, 0, sx * -0.2])); // 엄니
  head.add(mk(new THREE.SphereGeometry(0.022, 5, 4), eyeM, [sx * 0.06, 0.08, 0.15]));
  head.add(mk(new THREE.ConeGeometry(0.05, 0.2, 4), skin, [sx * 0.19, 0.1, -0.02], [1, 1, 0.5], [0, 0, sx * -1.2])); // 귀
}
head.add(mk(new THREE.BoxGeometry(0.2, 0.04, 0.03), voidM, [0, -0.04, 0.155])); // 입
// 허리 아래: 가죽 앞치마 판
for (const [ax, w] of [[0, 0.16], [-0.9, 0.12], [0.9, 0.12], [3.14, 0.18]]) pelvis.add(mk(new THREE.BoxGeometry(w, 0.34, 0.03), leather, [Math.sin(ax) * 0.26, -0.15, Math.cos(ax) * 0.24], [1, 1, 1], [Math.cos(ax) * 0.15, ax, 0]));
const THIGH = 0.48, SHIN = 0.48, UPPER = 0.42, FORE = 0.42;
const legs = [-1, 1].map(() => ({ thigh: limb(THIGH, 0.11, LIMB, 1.3), shin: limb(SHIN, 0.1, LIMB, 1.3), foot: new THREE.Group() }));
for (const l of legs) {
  l.foot.add(mk(new THREE.BoxGeometry(0.16, 0.08, 0.3), leather, [0, 0.04, 0.07]));
  root.add(l.thigh, l.shin, l.foot);
}
const arms = [-1, 1].map(() => ({ upper: limb(UPPER, 0.1, LIMB, 1.4), fore: limb(FORE, 0.09, { core: skin, plate: iron, ring: leather }, 1.3), hand: mk(new THREE.BoxGeometry(0.13, 0.15, 0.13), skin) }));
for (const a of arms) root.add(a.upper, a.fore, a.hand);
// 고기칼: 손잡이 = 원점, 칼날은 +Y(넓적한 직사각형 + 이 빠진 날)
const blade = new THREE.Group();
blade.add(mk(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 6), wood, [0, -0.05, 0]));
blade.add(mk(new THREE.BoxGeometry(0.34, 0.95, 0.03), iron, [0.08, 0.55, 0]));
blade.add(mk(new THREE.BoxGeometry(0.06, 0.95, 0.032), new THREE.MeshStandardMaterial({ color: 0x4a3a3a, roughness: 0.7, flatShading: true }), [-0.08, 0.55, 0])); // 칼등의 녹
for (const y of [0.3, 0.65]) blade.add(mk(new THREE.BoxGeometry(0.05, 0.05, 0.04), voidM, [0.25, y, 0])); // 이 빠진 날
root.add(blade);

const UP = v(0, 1, 0);
// 공격(내려찍기) 열쇠 장면: [t, 오른손, 칼 방향(날 끝 쪽), 숙임, 비틀기, 골반 낮춤, 가속]
const ATK = [
  [0, [0.45, 0.95, 0.2], [0.3, 0.6, 0.7], 0.15, 0, 0, 'io'],
  [0.35, [0.35, 1.7, -0.2], [0.1, 0.15, -0.98], -0.15, 0.35, -0.03, 'io'], // 어깨 뒤로 치켜든다(칼은 눕혀서)
  [0.45, [0.33, 1.72, -0.25], [0.08, 0.1, -0.99], -0.17, 0.38, -0.03, 'io'], // 멈칫
  [0.58, [0.15, 0.9, 0.7], [0, -0.55, 0.85], 0.5, -0.1, 0.18, 'in'], // 내려찍는다
  [0.75, [0.15, 0.85, 0.72], [0, -0.6, 0.8], 0.52, -0.1, 0.2, 'io'],
  [1, [0.45, 0.95, 0.2], [0.3, 0.6, 0.7], 0.15, 0, 0, 'out'],
];
function atkAt(t) {
  for (let i = 0; i < ATK.length - 1; i++) {
    const A = ATK[i], B = ATK[i + 1];
    if (t <= B[0]) {
      const f = EASE[B[6]]((t - A[0]) / (B[0] - A[0]));
      return { grip: v(...A[1]).lerp(v(...B[1]), f), dir: nlerp(v(...A[2]).normalize(), v(...B[2]).normalize(), f), lean: lerp(A[3], B[3], f), yaw: lerp(A[4], B[4], f), drop: lerp(A[5], B[5], f) };
    }
  }
}
function gait(u) {
  const L = 0.32;
  if (u < 0.6) return { z: L - 2 * L * (u / 0.6), y: 0 };
  const f = (u - 0.6) / 0.4;
  return { z: -L + 2 * L * smooth(f), y: Math.sin(f * Math.PI) * 0.16 };
}

function pose(anim, t) {
  const ph = t * Math.PI * 2;
  let grip = v(0.45, 0.95, 0.2), dir = v(0.3, 0.6, 0.7).normalize(), lean = 0.15, twist = 0, yaw = 0, px = 0, py = 0.98, pz = 0, fall = 0;
  let feet = [v(-0.24, 0.04, 0.04), v(0.24, 0.04, -0.04)];
  let handL = v(-0.48, 0.9, 0.15);
  if (anim === 'stance') {
    py += Math.sin(ph) * 0.02; // 거친 숨
    lean += Math.sin(ph) * 0.03;
  }
  if (anim === 'attack') {
    const k = atkAt(t);
    grip = k.grip, dir = k.dir, lean = k.lean, twist = k.yaw, py -= k.drop;
    feet[0] = v(-0.26, 0.04, 0.04 + k.drop * 1.2);
    handL = v(-0.4, lerp(0.9, 1.3, Math.sin(Math.min(1, t * 1.6) * Math.PI)), 0.25);
  }
  if (anim === 'hit') {
    const f = Math.sin(Math.min(1, t) * Math.PI);
    lean = 0.15 - 0.3 * f, pz = -0.06 * f, twist = -0.15 * f;
  }
  if (anim === 'move') {
    const g = [gait(t % 1), gait((t + 0.5) % 1)];
    feet = g.map((s, i) => v(i ? 0.22 : -0.22, 0.04 + s.y, s.z));
    py = 1.0 + 0.04 * Math.cos(4 * Math.PI * (t - 0.3));
    px = -0.06 * Math.cos(2 * Math.PI * (t - 0.3)); // 무겁게 뒤뚱
    yaw = (g[0].z - g[1].z) * 0.3;
    twist = -yaw * 1.5;
    lean = 0.3;
    const swing = (g[0].z - g[1].z) * 0.6;
    handL = v(-0.5, 0.75, 0.15 + swing);
    grip = v(0.5, 0.8, 0.1 - swing * 0.5);
    dir = v(0.2, 0.3, -0.9).normalize(); // 칼을 뒤로 끌며
  }
  if (anim === 'die') {
    const f = smooth(Math.min(1, t * 1.25));
    fall = f;
    py = lerp(0.98, 0.4, f);
    lean = lerp(0.15, 1.0, f);
    grip = v(0.5, lerp(0.95, 0.1, f), lerp(0.2, 0.6, f));
    dir = nlerp(v(0.3, 0.6, 0.7).normalize(), v(0.9, 0.05, 0.4).normalize(), f); // 칼이 옆으로 떨어진다
    handL = v(-0.4, lerp(0.9, 0.15, f), lerp(0.15, 0.6, f));
    feet = [v(-0.3, 0.04, lerp(0.04, 0.3, f)), v(0.3, 0.04, lerp(-0.04, 0.2, f))];
  }
  pelvis.position.set(px, py - lean * 0.1, pz - lean * 0.05);
  pelvis.rotation.y = yaw;
  torso.rotation.set(lean, twist, 0);
  head.rotation.set(-lean * 0.6 + fall * 0.4, -twist * 0.4, 0);
  root.updateMatrixWorld(true);
  const local = (obj, p) => root.worldToLocal(obj.localToWorld(p.clone()));
  [-1, 1].forEach((sx, i) => {
    const l = legs[i];
    const hip = local(pelvis, v(sx * 0.16, -0.02, 0));
    const [knee, end] = ik(hip, feet[i], THIGH, SHIN, v(sx * 0.3, 0, 1));
    orient(l.thigh, hip, knee, v(0, 0, 1));
    orient(l.shin, knee, end, v(0, 0, 1));
    l.foot.position.set(end.x, Math.max(0, end.y - 0.04), end.z);
    l.foot.rotation.set(0, sx * -0.25, 0);
  });
  blade.position.copy(anim === 'move' ? local(torso, grip) : grip);
  blade.quaternion.setFromUnitVectors(UP, dir);
  blade.updateMatrixWorld(true);
  [-1, 1].forEach((sx, i) => {
    const a = arms[i];
    const sh = local(shoulders[i], v(0, -0.02, 0));
    const hand = sx > 0 ? root.worldToLocal(blade.localToWorld(v(0, 0, 0))) : anim === 'move' ? local(torso, handL) : handL;
    const [elbow, end] = ik(sh, hand, UPPER, FORE, v(sx, -0.5, -0.4));
    orient(a.upper, sh, elbow, v(0, 0, 1));
    orient(a.fore, elbow, end, v(0, 0, 1));
    a.hand.position.copy(end);
    a.hand.quaternion.copy(a.fore.quaternion);
  });
}

root.scale.setScalar(0.95); // 시트 한계(세로 4096px) 안에 들게 조금 줄인다(약 2.3m)
start(pose);
