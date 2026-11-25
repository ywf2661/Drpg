// 광산 감독관(2막 ③ 보랏빛 광산 보스, 설계: docs/superpowers/specs/2026-11-25-act2-mine-design.md 5절).
// 덩치 큰 광부(약 2.3m, 구부정): 가죽 앞치마와 멜빵, 광부 모자에 꺼진 등불, 잿빛 살갗. 어깨·등·왼팔에 보랏빛 결정이 살을 뚫고 돋았다(실루엣을 만든다).
// 오른손에 큰 곡괭이(내려찍기). 뼈대·동작은 약탈자 우두머리(raider_chief.js)와 같다.
import { THREE, root, v, lerp, smooth, nlerp, EASE, OCT, mk, mosaic, scratches, limb, orient, ik, start } from './kit.js';

const skinTex = mosaic(256, 80, 53, 120, 210, 50, 2.5);
const leatherTex = mosaic(128, 40, 19, 90, 170, 30, 3);
const ironTex = scratches(128, 29);
const skin = new THREE.MeshStandardMaterial({ color: 0xa89c98, map: skinTex, bumpMap: skinTex, bumpScale: 3, roughness: 0.75, flatShading: true });
const leather = new THREE.MeshStandardMaterial({ color: 0x5a3e2a, map: leatherTex, bumpMap: leatherTex, bumpScale: 3, roughness: 0.85, flatShading: true });
const cloth = new THREE.MeshStandardMaterial({ color: 0x4a4a5a, map: leatherTex, roughness: 0.9, flatShading: true });
const iron = new THREE.MeshStandardMaterial({ color: 0x8a8a90, map: ironTex, bumpMap: ironTex, bumpScale: 2, roughness: 0.45, metalness: 0.6, flatShading: true });
const brass = new THREE.MeshStandardMaterial({ color: 0xa8843a, map: ironTex, roughness: 0.4, metalness: 0.7, flatShading: true });
const wood = new THREE.MeshStandardMaterial({ color: 0x6e4a2a, roughness: 0.85, flatShading: true });
const gem = new THREE.MeshStandardMaterial({ color: 0xb080ff, emissive: 0x6a28d0, emissiveIntensity: 0.9, roughness: 0.2, flatShading: true });
const voidM = new THREE.MeshBasicMaterial({ color: 0x0a0508 });
const eyeM = new THREE.MeshBasicMaterial({ color: 0xd8a8ff });
const LIMB = { core: skin, plate: cloth, ring: leather };

const pelvis = new THREE.Group();
root.add(pelvis);
const torso = new THREE.Group();
pelvis.add(torso);
// 몸통: 두툼한 배와 가슴(작업복) + 가죽 앞치마 + 멜빵
torso.add(mk(new THREE.SphereGeometry(1, 8, 6), cloth, [0, 0.25, 0.03], [0.34, 0.32, 0.3]));
torso.add(mk(new THREE.SphereGeometry(1, 8, 6), cloth, [0, 0.62, 0], [0.44, 0.3, 0.32]));
torso.add(mk(new THREE.BoxGeometry(0.5, 0.7, 0.04), leather, [0, 0.35, 0.3], [1, 1, 1], [-0.12, 0, 0])); // 앞치마
for (const sx of [-1, 1]) torso.add(mk(new THREE.BoxGeometry(0.07, 0.45, 0.04), leather, [sx * 0.17, 0.72, 0.27], [1, 1, 1], [-0.3, 0, sx * 0.1])); // 멜빵
const shoulders = [-1, 1].map((sx) => {
  const g = new THREE.Group();
  g.position.set(sx * 0.42, 0.72, 0);
  g.add(mk(new THREE.SphereGeometry(1, 6, 5), skin, [sx * 0.04, 0.04, 0], [0.16, 0.13, 0.16]));
  torso.add(g);
  return g;
});
// 살을 뚫고 돋은 결정: 왼어깨에 큰 무더기, 등에 줄지어, 오른어깨에 작게
for (const [x, y, z, s, rx, rz] of [[-0.48, 0.92, 0, 0.5, 0, 0.5], [-0.38, 0.95, -0.12, 0.36, -0.3, 0.2], [-0.55, 0.8, 0.08, 0.28, 0.4, 0.9], [-0.1, 0.85, -0.3, 0.42, -0.7, 0.1], [0.12, 0.7, -0.32, 0.34, -0.8, -0.2], [0.0, 0.45, -0.32, 0.26, -0.9, 0], [0.46, 0.9, -0.05, 0.22, -0.2, -0.6]]) {
  torso.add(mk(OCT, gem, [x, y, z], [s * 0.26, s, s * 0.26], [rx, 0, rz]));
}
// 머리: 수염 난 큰 얼굴, 결정빛 눈, 광부 모자와 꺼진 등불
const head = new THREE.Group();
head.position.set(0, 0.9, 0.1);
torso.add(head);
head.add(mk(new THREE.SphereGeometry(1, 8, 6), skin, [0, 0.04, 0], [0.16, 0.16, 0.16]));
head.add(mk(new THREE.SphereGeometry(1, 6, 5), cloth, [0, -0.08, 0.06], [0.14, 0.1, 0.12])); // 덥수룩한 수염
for (const sx of [-1, 1]) head.add(mk(new THREE.SphereGeometry(0.022, 5, 4), eyeM, [sx * 0.055, 0.07, 0.145]));
head.add(mk(new THREE.SphereGeometry(1, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), brass, [0, 0.1, 0], [0.19, 0.15, 0.19])); // 모자
head.add(mk(new THREE.CylinderGeometry(0.24, 0.24, 0.025, 10), brass, [0, 0.1, 0.01])); // 챙
head.add(mk(new THREE.CylinderGeometry(0.045, 0.05, 0.06, 8), iron, [0, 0.19, 0.16], [1, 1, 1], [Math.PI / 2, 0, 0])); // 등불
head.add(mk(new THREE.CircleGeometry(0.035, 8), voidM, [0, 0.19, 0.195])); // 꺼진 등불 유리
// 허리 아래: 앞치마 자락
for (const [ax, w] of [[0, 0.22], [-0.9, 0.12], [0.9, 0.12]]) pelvis.add(mk(new THREE.BoxGeometry(w, 0.36, 0.03), leather, [Math.sin(ax) * 0.26, -0.15, Math.cos(ax) * 0.25], [1, 1, 1], [Math.cos(ax) * 0.15, ax, 0]));
const THIGH = 0.48, SHIN = 0.48, UPPER = 0.42, FORE = 0.42;
const legs = [-1, 1].map(() => ({ thigh: limb(THIGH, 0.11, LIMB, 1.3), shin: limb(SHIN, 0.1, { core: skin, plate: leather, ring: iron }, 1.3), foot: new THREE.Group() }));
for (const l of legs) {
  l.foot.add(mk(new THREE.BoxGeometry(0.17, 0.1, 0.3), leather, [0, 0.05, 0.07]));
  root.add(l.thigh, l.shin, l.foot);
}
const arms = [-1, 1].map((sx) => ({ upper: limb(UPPER, 0.1, LIMB, 1.4), fore: limb(FORE, 0.09, sx < 0 ? { core: skin, plate: gem, ring: leather } : { core: skin, plate: cloth, ring: leather }, 1.3), hand: mk(new THREE.BoxGeometry(0.13, 0.15, 0.13), skin) })); // 왼팔뚝은 결정으로 덮였다
for (const a of arms) root.add(a.upper, a.fore, a.hand);
// 곡괭이: 손잡이 = 원점, 자루는 +Y, 끝에 양쪽으로 뾰족한 쇠머리
const blade = new THREE.Group();
blade.add(mk(new THREE.CylinderGeometry(0.035, 0.04, 1.25, 6), wood, [0, 0.45, 0]));
blade.add(mk(new THREE.ConeGeometry(0.06, 0.55, 5), iron, [0, 1.05, 0.27], [1, 1, 1], [Math.PI / 2, 0, 0]));
blade.add(mk(new THREE.ConeGeometry(0.05, 0.35, 5), iron, [0, 1.05, -0.17], [1, 1, 1], [-Math.PI / 2, 0, 0]));
blade.add(mk(new THREE.BoxGeometry(0.1, 0.12, 0.12), iron, [0, 1.05, 0]));
blade.add(mk(OCT, gem, [0.03, 1.12, 0.05], [0.04, 0.12, 0.04], [0, 0, 0.4])); // 쇠머리에 박힌 결정
root.add(blade);

const UP = v(0, 1, 0);
// 공격(내려찍기) 열쇠 장면: [t, 오른손, 곡괭이 방향(쇠머리 쪽), 숙임, 비틀기, 골반 낮춤, 가속]
const ATK = [
  [0, [0.45, 0.95, 0.2], [0.3, 0.6, 0.7], 0.15, 0, 0, 'io'],
  [0.35, [0.35, 1.7, -0.2], [0.1, 0.15, -0.98], -0.15, 0.35, -0.03, 'io'], // 어깨 뒤로 치켜든다(곡괭이는 눕혀서)
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
    dir = v(0.2, 0.3, -0.9).normalize(); // 곡괭이를 뒤로 끌며
  }
  if (anim === 'die') {
    const f = smooth(Math.min(1, t * 1.25));
    fall = f;
    py = lerp(0.98, 0.4, f);
    lean = lerp(0.15, 1.0, f);
    grip = v(0.5, lerp(0.95, 0.1, f), lerp(0.2, 0.6, f));
    dir = nlerp(v(0.3, 0.6, 0.7).normalize(), v(0.9, 0.05, 0.4).normalize(), f); // 곡괭이가 옆으로 떨어진다
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

root.scale.setScalar(0.9); // 시트 한계(세로 4096px) 안에 들게 줄인다(곡괭이를 치켜들면 높다, 약 2.2m)
start(pose);
