// 바위 괴물(2막 ③ 보랏빛 광산 전사, 설계: docs/superpowers/specs/2026-11-25-act2-mine-design.md 2절). 밀리지 않는다(허공에 떨어뜨릴 수 없다).
// 키 약 2m. 큰 바위 덩어리를 쌓은 몸, 짧은 다리, 땅에 닿을 듯 긴 팔 끝에 주먹 바위. 등과 어깨에 보랏빛 결정이 돋았고, 가슴 갈라진 틈과 눈에서 보랏빛이 샌다.
// 공격: 두 주먹을 머리 위로 모았다가 내려찍는다.
import { THREE, root, v, lerp, smooth, nlerp, EASE, OCT, mk, mosaic, orient, ik, start } from './kit.js';

const rockTex = mosaic(256, 60, 41, 110, 200, 50, 3);
const rock = new THREE.MeshStandardMaterial({ color: 0xaaa2b4, map: rockTex, bumpMap: rockTex, bumpScale: 4, roughness: 0.95, flatShading: true });
const dark = new THREE.MeshStandardMaterial({ color: 0x7a7284, map: rockTex, bumpMap: rockTex, bumpScale: 4, roughness: 0.95, flatShading: true });
const gem = new THREE.MeshStandardMaterial({ color: 0xb080ff, emissive: 0x6a28d0, emissiveIntensity: 0.9, roughness: 0.2, flatShading: true });
const glow = new THREE.MeshBasicMaterial({ color: 0xd8a8ff });
const DODE = new THREE.DodecahedronGeometry(1, 0);

const pelvis = new THREE.Group();
root.add(pelvis);
const torso = new THREE.Group();
pelvis.add(torso);
// 몸통: 아래 넓적한 바위 + 위 큰 가슴 바위 + 어깨 바위 둘
torso.add(mk(DODE, dark, [0, 0.12, 0], [0.34, 0.24, 0.28], [0.2, 0.4, 0]));
torso.add(mk(DODE, rock, [0, 0.55, 0.02], [0.5, 0.36, 0.38], [0.1, 0.9, 0.15]));
torso.add(mk(new THREE.BoxGeometry(0.05, 0.3, 0.02), glow, [0.05, 0.55, 0.37], [1, 1, 1], [0, 0, 0.4])); // 가슴의 갈라진 틈
torso.add(mk(new THREE.BoxGeometry(0.04, 0.16, 0.02), glow, [-0.06, 0.45, 0.36], [1, 1, 1], [0, 0, -0.5]));
const shoulders = [-1, 1].map((sx) => {
  const g = new THREE.Group();
  g.position.set(sx * 0.5, 0.72, 0);
  g.add(mk(DODE, rock, [sx * 0.04, 0.04, 0], [0.24, 0.2, 0.24], [0.3, sx, 0.2]));
  torso.add(g);
  return g;
});
// 등·어깨의 결정
for (const [x, y, z, s, rx, rz] of [[-0.2, 0.85, -0.2, 0.32, -0.4, 0.3], [0.05, 0.92, -0.25, 0.42, -0.5, -0.1], [0.25, 0.8, -0.18, 0.28, -0.3, -0.4], [-0.55, 0.95, -0.05, 0.22, 0, 0.6], [0.58, 0.92, 0, 0.24, 0, -0.5]]) {
  torso.add(mk(OCT, gem, [x, y, z], [s * 0.28, s, s * 0.28], [rx, 0, rz]));
}
// 머리: 가슴에 파묻힌 작은 바위, 눈 둘
const head = new THREE.Group();
head.position.set(0, 0.88, 0.14);
torso.add(head);
head.add(mk(DODE, rock, [0, 0, 0], [0.17, 0.14, 0.16], [0.4, 0.3, 0]));
for (const sx of [-1, 1]) head.add(mk(new THREE.SphereGeometry(0.028, 5, 4), glow, [sx * 0.06, 0.01, 0.13]));
const THIGH = 0.32, SHIN = 0.32, UPPER = 0.5, FORE = 0.5;
const seg = (L, r, m) => {
  const g = new THREE.Group();
  g.add(mk(DODE, m, [0, L * 0.5, 0], [r, L * 0.55, r], [0.3, 0.5, 0]));
  return g;
};
const legs = [-1, 1].map(() => ({ thigh: seg(THIGH, 0.15, dark), shin: seg(SHIN, 0.14, rock), foot: mk(DODE, dark, [0, 0, 0], [0.17, 0.08, 0.2]) }));
for (const l of legs) root.add(l.thigh, l.shin, l.foot);
const arms = [-1, 1].map(() => ({ upper: seg(UPPER, 0.13, rock), fore: seg(FORE, 0.14, dark), fist: mk(DODE, rock, [0, 0, 0], [0.2, 0.2, 0.2], [0.5, 0.2, 0.3]) }));
for (const a of arms) root.add(a.upper, a.fore, a.fist);

// 공격 열쇠 장면: [t, 주먹 높이·앞(두 주먹 가운데), 숙임, 골반 낮춤, 가속]
const ATK = [
  [0, [0.75, 0.35], 0.2, 0, 'io'],
  [0.4, [1.95, 0.05], -0.25, -0.04, 'io'], // 머리 위로 모은다
  [0.5, [2.0, 0.0], -0.28, -0.04, 'io'], // 멈칫
  [0.62, [0.25, 0.75], 0.6, 0.2, 'in'], // 내려찍는다
  [0.78, [0.22, 0.78], 0.62, 0.22, 'io'],
  [1, [0.75, 0.35], 0.2, 0, 'out'],
];
function atkAt(t) {
  for (let i = 0; i < ATK.length - 1; i++) {
    const A = ATK[i], B = ATK[i + 1];
    if (t <= B[0]) {
      const f = EASE[B[4]]((t - A[0]) / (B[0] - A[0]));
      return { y: lerp(A[1][0], B[1][0], f), z: lerp(A[1][1], B[1][1], f), lean: lerp(A[2], B[2], f), drop: lerp(A[3], B[3], f) };
    }
  }
}
function gait(u) {
  const L = 0.22;
  if (u < 0.6) return { z: L - 2 * L * (u / 0.6), y: 0 };
  const f = (u - 0.6) / 0.4;
  return { z: -L + 2 * L * smooth(f), y: Math.sin(f * Math.PI) * 0.12 };
}

function pose(anim, t) {
  const ph = t * Math.PI * 2;
  let lean = 0.2, twist = 0, yaw = 0, px = 0, py = 0.66, pz = 0, fall = 0;
  let feet = [v(-0.26, 0.05, 0.03), v(0.26, 0.05, -0.03)];
  let hands = [v(-0.62, 0.5, 0.25), v(0.62, 0.5, 0.25)]; // 늘어뜨린 긴 팔
  if (anim === 'stance') {
    py += Math.sin(ph) * 0.015;
    hands = hands.map((h, i) => h.clone().add(v(0, Math.sin(ph + i) * 0.03, 0)));
  }
  if (anim === 'attack') {
    const k = atkAt(t);
    lean = k.lean, py -= k.drop;
    hands = [v(-0.16, k.y, k.z), v(0.16, k.y, k.z)];
  }
  if (anim === 'hit') {
    const f = Math.sin(Math.min(1, t) * Math.PI);
    lean = 0.2 - 0.25 * f, pz = -0.04 * f, twist = 0.12 * f;
  }
  if (anim === 'move') {
    const g = [gait(t % 1), gait((t + 0.5) % 1)];
    feet = g.map((s, i) => v(i ? 0.25 : -0.25, 0.05 + s.y, s.z));
    py = 0.68 + 0.035 * Math.cos(4 * Math.PI * (t - 0.3));
    px = -0.07 * Math.cos(2 * Math.PI * (t - 0.3)); // 무겁게 뒤뚱
    yaw = (g[0].z - g[1].z) * 0.4;
    twist = -yaw * 1.2;
    lean = 0.3;
    const swing = (g[0].z - g[1].z) * 0.9;
    hands = [v(-0.62, 0.42, 0.2 - swing), v(0.62, 0.42, 0.2 + swing)];
  }
  if (anim === 'die') {
    const f = smooth(Math.min(1, t * 1.2));
    fall = f;
    py = lerp(0.66, 0.22, f);
    lean = lerp(0.2, 1.1, f);
    hands = [v(-0.7, lerp(0.5, 0.15, f), lerp(0.25, 0.7, f)), v(0.7, lerp(0.5, 0.15, f), lerp(0.25, 0.6, f))];
    feet = [v(-0.32, 0.05, lerp(0.03, 0.25, f)), v(0.32, 0.05, lerp(-0.03, 0.15, f))];
  }
  pelvis.position.set(px, py - lean * 0.08, pz - lean * 0.04);
  pelvis.rotation.y = yaw;
  torso.rotation.set(lean, twist, 0);
  head.rotation.set(-lean * 0.5 + fall * 0.3, 0, 0);
  root.updateMatrixWorld(true);
  const local = (obj, p) => root.worldToLocal(obj.localToWorld(p.clone()));
  [-1, 1].forEach((sx, i) => {
    const l = legs[i];
    const hip = local(pelvis, v(sx * 0.18, 0, 0));
    const [knee, end] = ik(hip, feet[i], THIGH, SHIN, v(sx * 0.3, 0, 1));
    orient(l.thigh, hip, knee, v(0, 0, 1));
    orient(l.shin, knee, end, v(0, 0, 1));
    l.foot.position.set(end.x, Math.max(0.04, end.y), end.z + 0.04);
  });
  [-1, 1].forEach((sx, i) => {
    const a = arms[i];
    const sh = local(shoulders[i], v(0, 0, 0));
    const hand = anim === 'move' || anim === 'stance' ? local(torso, hands[i]) : hands[i];
    const [elbow, end] = ik(sh, hand, UPPER, FORE, v(sx, -0.6, -0.5));
    orient(a.upper, sh, elbow, v(0, 0, 1));
    orient(a.fore, elbow, end, v(0, 0, 1));
    a.fist.position.copy(end);
  });
  void nlerp;
}

start(pose);
