// 문지기 사제(2막 ④ 사암 신전 보스, 설계: docs/superpowers/specs/2026-11-26-act2-temple-design.md 5절).
// 키 크고 마른 사제(약 2.4m, 땅에서 0.35m 떠 있다): 검은 자칼 가면에 금 테두리, 사암빛 금속 판을 겹친 긴 치마(다리 없음),
// 등 뒤에 금빛 해 원반, 오른손에 긴 지팡이(끝에 푸른 봉인 고리), 왼손은 비어 주문을 건다. 공격 = 지팡이를 치켜들었다 내리꽂는다.
import { THREE, root, v, lerp, smooth, nlerp, EASE, mk, mosaic, scratches, limb, orient, ik, start } from './kit.js';

const stoneTex = mosaic(256, 70, 61, 140, 215, 70, 2.5);
const metalTex = scratches(128, 17);
const robe = new THREE.MeshStandardMaterial({ color: 0xf0cc8a, map: stoneTex, bumpMap: stoneTex, bumpScale: 2, roughness: 0.6, metalness: 0.1, emissive: 0x2a1c0a, flatShading: true });
const gold = new THREE.MeshStandardMaterial({ color: 0xffc850, map: metalTex, bumpMap: metalTex, bumpScale: 1.5, roughness: 0.3, metalness: 0.55, flatShading: true });
const black = new THREE.MeshStandardMaterial({ color: 0x15110e, roughness: 0.45, metalness: 0.3, flatShading: true });
const linen = new THREE.MeshStandardMaterial({ color: 0xe8dcc0, map: stoneTex, roughness: 0.85, flatShading: true });
const seal = new THREE.MeshStandardMaterial({ color: 0x6fb7ff, emissive: 0x2a6ad8, emissiveIntensity: 1.1, roughness: 0.2, flatShading: true });
const eyeM = new THREE.MeshBasicMaterial({ color: 0xffe28a });
const LIMB = { core: linen, plate: robe, ring: gold };

const body = new THREE.Group(); // 허리(떠 있는 높이)
root.add(body);
const torso = new THREE.Group();
body.add(torso);
// 몸통: 좁은 가슴, 금 목걸이 판, 허리띠
torso.add(mk(new THREE.CylinderGeometry(0.2, 0.15, 0.62, 7), robe, [0, 0.33, 0]));
torso.add(mk(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 12, 1, false, -Math.PI * 0.65, Math.PI * 1.3), gold, [0, 0.62, 0.02], [1, 1, 1], [0.25, 0, 0])); // 넓은 목걸이(앞쪽 반원)
torso.add(mk(new THREE.CylinderGeometry(0.17, 0.17, 0.06, 10), gold, [0, 0.03, 0]));
const shoulders = [-1, 1].map((sx) => {
  const g = new THREE.Group();
  g.position.set(sx * 0.24, 0.58, 0);
  g.add(mk(new THREE.SphereGeometry(1, 6, 5), gold, [sx * 0.03, 0.02, 0], [0.11, 0.07, 0.11]));
  torso.add(g);
  return g;
});
// 등 뒤 해 원반: 금 원판 + 바깥 고리 + 햇살 가시
const disc = new THREE.Group();
disc.position.set(0, 0.85, -0.24);
disc.add(mk(new THREE.CylinderGeometry(0.34, 0.34, 0.03, 20), gold, [0, 0, 0], [1, 1, 1], [Math.PI / 2, 0, 0]));
disc.add(mk(new THREE.TorusGeometry(0.42, 0.025, 4, 24), gold));
for (let k = 0; k < 12; k++) {
  const a = (k / 12) * Math.PI * 2;
  disc.add(mk(new THREE.ConeGeometry(0.035, 0.16, 4), gold, [Math.cos(a) * 0.5, Math.sin(a) * 0.5, 0], [1, 1, 1], [0, 0, a - Math.PI / 2]));
}
torso.add(disc);
// 머리: 검은 자칼 가면(긴 주둥이, 곧게 선 두 귀), 금 테두리, 노란 눈
const head = new THREE.Group();
head.position.set(0, 0.76, 0.02);
torso.add(head);
head.add(mk(new THREE.SphereGeometry(1, 8, 6), black, [0, 0.06, 0], [0.12, 0.14, 0.13]));
head.add(mk(new THREE.ConeGeometry(0.075, 0.28, 6), black, [0, 0.02, 0.2], [1, 1, 0.8], [Math.PI / 2, 0, 0])); // 주둥이
head.add(mk(new THREE.TorusGeometry(0.11, 0.015, 4, 12), gold, [0, 0.06, 0.07])); // 가면 테두리
for (const sx of [-1, 1]) {
  head.add(mk(new THREE.ConeGeometry(0.045, 0.24, 4), black, [sx * 0.07, 0.25, -0.01], [1, 1, 0.5], [0, 0, -sx * 0.15])); // 귀
  head.add(mk(new THREE.ConeGeometry(0.03, 0.14, 4), gold, [sx * 0.07, 0.23, 0.012], [1, 1, 0.3], [0, 0, -sx * 0.15])); // 귀 안쪽 금
  head.add(mk(new THREE.SphereGeometry(0.022, 5, 4), eyeM, [sx * 0.05, 0.08, 0.115]));
}
// 치마: 허리에서 아래로 넓어지는 금속 판 여덟 장(떠 있어서 끝이 땅에 안 닿는다) + 가운데 늘어진 금 띠
const skirt = new THREE.Group();
body.add(skirt);
const plates = [];
for (let k = 0; k < 8; k++) {
  const a = (k / 8) * Math.PI * 2;
  const p = new THREE.Group();
  p.rotation.y = a;
  p.add(mk(new THREE.BoxGeometry(0.17, 0.82, 0.025), k % 2 ? robe : linen, [0, -0.42, 0.2], [1, 1, 1], [-0.16, 0, 0]));
  p.add(mk(new THREE.BoxGeometry(0.17, 0.04, 0.03), gold, [0, -0.83, 0.27], [1, 1, 1], [-0.16, 0, 0]));
  skirt.add(p);
  plates.push(p);
}
skirt.add(mk(new THREE.BoxGeometry(0.1, 0.7, 0.03), gold, [0, -0.36, 0.26], [1, 1, 1], [-0.12, 0, 0]));
const UPPER = 0.4, FORE = 0.4;
const arms = [-1, 1].map(() => ({ upper: limb(UPPER, 0.065, LIMB, 1.3), fore: limb(FORE, 0.055, { core: linen, plate: gold, ring: gold }, 1.2), hand: mk(new THREE.BoxGeometry(0.08, 0.12, 0.08), black) }));
for (const a of arms) root.add(a.upper, a.fore, a.hand);
// 지팡이: 손잡이 = 원점, +Y로 1.9m, 끝에 푸른 봉인 고리와 가운데 구슬
const staff = new THREE.Group();
staff.add(mk(new THREE.CylinderGeometry(0.025, 0.03, 1.9, 6), gold, [0, 0.35, 0]));
staff.add(mk(new THREE.TorusGeometry(0.15, 0.025, 5, 18), seal, [0, 1.38, 0]));
staff.add(mk(new THREE.SphereGeometry(0.06, 8, 6), seal, [0, 1.38, 0]));
root.add(staff);

const UP = v(0, 1, 0);
// 공격 열쇠 장면: [t, 오른손, 지팡이 방향, 숙임, 원반 빛(0~1), 가속]
const ATK = [
  [0, [0.32, 1.25, 0.25], [0.05, 1, 0.1], 0.05, 0, 'io'],
  [0.4, [0.25, 1.95, 0.05], [0, 1, -0.15], -0.12, 1, 'io'], // 지팡이를 높이 치켜든다(해 원반이 빛난다)
  [0.5, [0.25, 1.98, 0.02], [0, 1, -0.2], -0.14, 1, 'io'], // 멈칫
  [0.62, [0.15, 1.05, 0.65], [0, -0.35, 0.94], 0.35, 0.6, 'in'], // 앞으로 내리꽂는다
  [0.8, [0.15, 1.0, 0.68], [0, -0.4, 0.92], 0.38, 0.3, 'io'],
  [1, [0.32, 1.25, 0.25], [0.05, 1, 0.1], 0.05, 0, 'out'],
];
function atkAt(t) {
  for (let i = 0; i < ATK.length - 1; i++) {
    const A = ATK[i], B = ATK[i + 1];
    if (t <= B[0]) {
      const f = EASE[B[5]]((t - A[0]) / (B[0] - A[0]));
      return { grip: v(...A[1]).lerp(v(...B[1]), f), dir: nlerp(v(...A[2]).normalize(), v(...B[2]).normalize(), f), lean: lerp(A[3], B[3], f), glow: lerp(A[4], B[4], f) };
    }
  }
}

function pose(anim, t) {
  const ph = t * Math.PI * 2;
  let grip = v(0.32, 1.25, 0.25), dir = v(0.05, 1, 0.1).normalize(), lean = 0.05, py = 1.25, pz = 0, tilt = 0, sway = 0, glow = 0;
  let handL = v(-0.35, 1.05, 0.2);
  if (anim === 'stance') {
    py += Math.sin(ph) * 0.06; // 천천히 떠오르내린다
    sway = Math.sin(ph) * 0.06;
    handL = v(-0.38, 1.05 + Math.sin(ph) * 0.04, 0.22);
  }
  if (anim === 'move') {
    py += Math.sin(ph * 2) * 0.03;
    lean = 0.22; // 앞으로 기울어 미끄러지듯
    sway = -0.25; // 치마 판이 뒤로 날린다
    handL = v(-0.4, 1.0, 0.0);
    grip = v(0.34, 1.15, 0.1);
    dir = v(0, 0.95, 0.3).normalize();
  }
  if (anim === 'attack') {
    const k = atkAt(t);
    [grip, dir, lean, glow] = [k.grip, k.dir, k.lean, k.glow];
    handL = v(-0.42, lerp(1.1, 1.6, Math.sin(Math.min(1, t * 1.4) * Math.PI)), 0.35); // 왼손으로 주문
  }
  if (anim === 'hit') {
    const f = Math.sin(Math.min(1, t) * Math.PI);
    lean = 0.05 - 0.25 * f;
    pz = -0.08 * f;
    sway = 0.2 * f;
  }
  if (anim === 'die') {
    const f = smooth(Math.min(1, t * 1.2));
    py = lerp(1.25, 0.55, f); // 내려앉으며
    tilt = f * 1.2; // 옆으로 쓰러진다
    lean = lerp(0.05, 0.5, f);
    grip = v(0.45, lerp(1.25, 0.2, f), lerp(0.25, 0.5, f));
    dir = nlerp(v(0.05, 1, 0.1).normalize(), v(0.95, 0.05, 0.3).normalize(), f);
    handL = v(-0.4, lerp(1.05, 0.3, f), 0.3);
  }
  body.position.set(0, py, pz);
  body.rotation.set(0, 0, tilt);
  torso.rotation.set(lean, 0, 0);
  head.rotation.set(-lean * 0.5, 0, 0);
  for (const [k, p] of plates.entries()) p.children.forEach((c) => (c.rotation.x = -0.16 + sway * Math.cos((k / 8) * Math.PI * 2) * 1.5));
  gold.emissive.setRGB(0.12 + 0.5 * glow, 0.08 + 0.32 * glow, 0.01 + 0.05 * glow);
  root.updateMatrixWorld(true);
  const local = (obj, p) => root.worldToLocal(obj.localToWorld(p.clone()));
  staff.position.copy(anim === 'die' ? grip : local(body, grip.clone().sub(v(0, 1.25, 0))));
  staff.quaternion.setFromUnitVectors(UP, dir);
  staff.updateMatrixWorld(true);
  [-1, 1].forEach((sx, i) => {
    const a = arms[i];
    const sh = local(shoulders[i], v(0, -0.02, 0));
    const hand = sx > 0 ? root.worldToLocal(staff.localToWorld(v(0, 0, 0))) : local(body, handL.clone().sub(v(0, 1.25, 0)));
    const [elbow, end] = ik(sh, hand, UPPER, FORE, v(sx, -0.6, -0.3));
    orient(a.upper, sh, elbow, v(0, 0, 1));
    orient(a.fore, elbow, end, v(0, 0, 1));
    a.hand.position.copy(end);
    a.hand.quaternion.copy(a.fore.quaternion);
  });
}

root.scale.setScalar(0.8); // 지팡이를 치켜들면 높다(시트 세로 한계)
start(pose);
