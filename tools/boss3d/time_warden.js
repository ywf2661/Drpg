// 시간의 파수꾼(2막 최종 보스, 설계: docs/superpowers/specs/2026-11-24-act2-expedition-design.md 5절).
// 참고 그림: 전작 images/monsters/timeguardian.png — 아몬드 투구의 텅 빈 얼굴, 금 간 라벤더 수정 판 + 청동 테두리, 어깨·옆구리·무릎 톱니,
// 땅에 꽂은 칼 위에 두 손, 톱니바퀴 칼코등이, 떠도는 수정 조각. 잔상은 그리지 않는다(게임 안에서 반 박자 늦은 복사본으로).
import { THREE, root, scene, v, lerp, smooth, nlerp, EASE, OCT, mk, mosaic, scratches, gearGeo, limb, orient, ik, start } from './kit.js';

const crystalTex = mosaic(256, 70, 11, 150, 255, 45, 2.2);
const scaleTex = mosaic(128, 60, 5, 90, 200, 20, 3);
const bronzeTex = scratches(128, 3);
const crystal = new THREE.MeshStandardMaterial({ color: 0xb4a6d8, map: crystalTex, bumpMap: crystalTex, bumpScale: 3, roughness: 0.28, metalness: 0.05, flatShading: true, emissive: 0x1a0e33, emissiveIntensity: 0.5 });
const bronze = new THREE.MeshStandardMaterial({ color: 0xa27a40, map: bronzeTex, bumpMap: bronzeTex, bumpScale: 2, roughness: 0.45, metalness: 0.55, flatShading: true });
const dark = new THREE.MeshStandardMaterial({ color: 0x3a2c40, map: scaleTex, bumpMap: scaleTex, bumpScale: 4, roughness: 0.7, metalness: 0.25, flatShading: true });
const voidM = new THREE.MeshBasicMaterial({ color: 0x040006 });
const glow = new THREE.MeshBasicMaterial({ color: 0x7446c0 });
const LIMB = { core: dark, plate: crystal, ring: bronze };
const gear = (R, n) => mk(gearGeo(R, n), bronze);

const pelvis = new THREE.Group();
root.add(pelvis);
const torso = new THREE.Group();
pelvis.add(torso);
// 허리·가슴(가운데 세로 틈에서 보랏빛)
torso.add(mk(new THREE.CylinderGeometry(0.17, 0.15, 0.32, 6), dark, [0, 0.16, 0]));
torso.add(mk(new THREE.CylinderGeometry(0.31, 0.19, 0.56, 6), dark, [0, 0.5, 0], [1, 1, 0.72]));
torso.add(mk(OCT, crystal, [0, 0.52, 0.15], [0.2, 0.3, 0.1]));
torso.add(mk(OCT, crystal, [-0.15, 0.6, 0.1], [0.1, 0.18, 0.07], [0, 0, 0.5]));
torso.add(mk(OCT, crystal, [0.15, 0.6, 0.1], [0.1, 0.18, 0.07], [0, 0, -0.5]));
torso.add(mk(new THREE.BoxGeometry(0.02, 0.26, 0.02), glow, [0, 0.42, 0.2]));
torso.add(mk(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 8), bronze, [0, 0.04, 0]));
torso.add(mk(new THREE.TorusGeometry(0.12, 0.03, 4, 8), bronze, [0, 0.8, 0], [1, 1, 1], [Math.PI / 2, 0, 0]));
// 어깨: 수정 셋 + 바깥으로 선 톱니
const shoulders = [-1, 1].map((sx) => {
  const g = new THREE.Group();
  g.position.set(sx * 0.32, 0.7, 0);
  g.add(mk(OCT, crystal, [sx * 0.06, 0.06, 0], [0.16, 0.12, 0.17], [0, 0, sx * -0.4]));
  g.add(mk(OCT, crystal, [sx * 0.12, 0.13, 0.02], [0.05, 0.16, 0.05], [0, 0, sx * -0.7]));
  g.add(mk(OCT, crystal, [sx * 0.04, 0.16, -0.06], [0.04, 0.13, 0.04], [0.3, 0, sx * -0.3]));
  const gr = gear(0.17, 12);
  gr.position.set(sx * 0.16, -0.02, -0.04);
  gr.rotation.y = Math.PI / 2;
  g.add(gr);
  torso.add(g);
  return g;
});
// 머리: 아몬드 투구, 텅 빈 얼굴(검은 구멍 + 청동 테 + 보랏빛 안쪽 테), 위로 솟은 장식
const head = new THREE.Group();
head.position.set(0, 0.98, 0);
torso.add(head);
head.add(mk(new THREE.SphereGeometry(1, 8, 6), crystal, [0, 0, 0], [0.15, 0.25, 0.15]));
head.add(mk(new THREE.CircleGeometry(1, 12), voidM, [0, -0.01, 0.152], [0.075, 0.16, 1]));
head.add(mk(new THREE.TorusGeometry(1, 0.12, 4, 12), bronze, [0, -0.01, 0.152], [0.09, 0.185, 0.3]));
head.add(mk(new THREE.TorusGeometry(1, 0.06, 4, 12), glow, [0, -0.01, 0.15], [0.08, 0.168, 0.2]));
head.add(mk(new THREE.ConeGeometry(0.045, 0.26, 4), bronze, [0, 0.33, -0.01]));
head.add(mk(OCT, crystal, [0, 0.24, 0.02], [0.04, 0.09, 0.04]));
const eye = new THREE.PointLight(0xa070ff, 0.8, 0.9); // 투구 앞을 보랏빛으로 물들인다(투구 안에 두면 얼굴이 흰 점으로 보인다)
eye.position.set(0, -0.1, 0.35);
head.add(eye);
// 허리 아래: 늘어진 수정 판 다섯 + 옆구리 톱니
for (const [ax, ay] of [[0, 0], [-0.5, 0.2], [0.5, 0.2], [-1.2, 0.35], [1.2, 0.35]]) pelvis.add(mk(OCT, crystal, [Math.sin(ax) * 0.2, -0.12, Math.cos(ax) * 0.17], [0.09, 0.2, 0.04], [ay, ax, 0]));
for (const sx of [-1, 1]) {
  const gr = gear(0.15, 10);
  gr.position.set(sx * 0.27, -0.06, -0.05);
  gr.rotation.y = Math.PI / 2;
  pelvis.add(gr);
}
// 팔다리(관절은 매 프레임 IK로)
const THIGH = 0.56, SHIN = 0.56, UPPER = 0.38, FORE = 0.36;
const legs = [-1, 1].map(() => ({ thigh: limb(THIGH, 0.1, LIMB, 1.6), shin: limb(SHIN, 0.085, LIMB, 1.6), knee: gear(0.1, 9), foot: new THREE.Group() }));
for (const l of legs) {
  l.foot.add(mk(new THREE.ConeGeometry(0.09, 0.32, 4), dark, [0, 0.05, 0.1], [1, 1, 0.6], [Math.PI / 2, Math.PI / 4, 0]));
  l.foot.add(mk(OCT, crystal, [0, 0.09, 0.08], [0.07, 0.06, 0.14]));
  root.add(l.thigh, l.shin, l.knee, l.foot);
}
const arms = [-1, 1].map(() => ({ upper: limb(UPPER, 0.07, LIMB), fore: limb(FORE, 0.065, LIMB, 1.7), hand: mk(new THREE.BoxGeometry(0.09, 0.1, 0.1), bronze) }));
for (const a of arms) root.add(a.upper, a.fore, a.hand);
// 칼: 손잡이 = 원점, 칼날은 -Y. 칼코등이 가운데 톱니바퀴
const sword = new THREE.Group();
sword.add(mk(new THREE.BoxGeometry(0.085, 1.0, 0.025), crystal, [0, -0.66, 0]));
sword.add(mk(new THREE.BoxGeometry(0.018, 0.9, 0.03), bronze, [0, -0.62, 0]));
sword.add(mk(new THREE.ConeGeometry(0.06, 0.14, 4), crystal, [0, -1.23, 0], [1, 1, 0.3], [Math.PI, Math.PI / 4, 0]));
sword.add(mk(new THREE.BoxGeometry(0.4, 0.045, 0.05), bronze, [0, -0.14, 0]));
const hilt = gear(0.075, 8);
hilt.position.set(0, -0.14, 0.03);
sword.add(hilt);
sword.add(mk(new THREE.CylinderGeometry(0.025, 0.025, 0.2, 6), dark, [0, -0.02, 0]));
sword.add(mk(OCT, crystal, [0, 0.11, 0], [0.05, 0.06, 0.05]));
root.add(sword);
// 떠도는 수정 조각: 몸을 따라 돌지 않게 장면에 둔다
const shards = Array.from({ length: 18 }, (_, i) => {
  const m = mk(OCT, crystal);
  const h = (k) => (((Math.sin(i * 12.9898 + k * 78.233) * 43758.5453) % 1) + 1) % 1;
  m.userData = { a: h(1) * Math.PI * 2, r: 0.5 + h(2) * 0.35, y: 0.3 + h(3) * 2.0, s: 0.035 + h(4) * 0.06, spin: h(5) * 6 };
  scene.add(m);
  return m;
});

const DOWN = v(0, -1, 0);
// 공격 열쇠 장면: [t, 손잡이, 칼끝 방향, 상체 숙임, 허리 비틀기, 골반 낮춤, 왼발 앞뒤, 이 장면으로 오는 가속]
const ATK = [
  [0, [0, 1.2, 0.34], [0, -1, 0], 0, 0, 0, 0.04, 'io'],
  [0.3, [0.3, 1.82, 0.0], [0.3, 0.35, -0.88], -0.15, 0.45, 0.06, -0.05, 'io'], // 오른 어깨 위로 치켜들며 허리를 비튼다
  [0.4, [0.32, 1.86, -0.05], [0.35, 0.3, -0.9], -0.18, 0.5, 0.07, -0.05, 'io'], // 멈칫(예비 동작)
  [0.47, [0.1, 1.82, 0.28], [0.05, 0.45, 0.85], 0.05, 0.15, 0.04, 0.15, 'in'], // 머리 위로 넘기며 빨라진다
  [0.55, [0, 1.0, 0.52], [0, -0.86, 0.5], 0.42, -0.1, 0.16, 0.25, 'in'], // 내려찍으며 왼발을 내딛는다
  [0.72, [0, 0.98, 0.52], [0, -0.88, 0.47], 0.44, -0.1, 0.17, 0.25, 'io'], // 꽂힌 채 버틴다
  [1, [0, 1.2, 0.34], [0, -1, 0], 0, 0, 0, 0.04, 'out'],
];
function atkAt(t) {
  for (let i = 0; i < ATK.length - 1; i++) {
    const A = ATK[i], B = ATK[i + 1];
    if (t <= B[0]) {
      const f = EASE[B[7]]((t - A[0]) / (B[0] - A[0]));
      return { grip: v(...A[1]).lerp(v(...B[1]), f), dir: nlerp(v(...A[2]).normalize(), v(...B[2]).normalize(), f), lean: lerp(A[3], B[3], f), yaw: lerp(A[4], B[4], f), drop: lerp(A[5], B[5], f), lz: lerp(A[6], B[6], f) };
    }
  }
}
// 걸음 한 발의 위상 u(0~1): 0~0.6은 디딘 채 뒤로 밀고, 0.6~1은 들어서 앞으로 내딛는다(발끝이 들린다)
function gait(u) {
  const L = 0.3;
  if (u < 0.6) return { z: L - 2 * L * (u / 0.6), y: 0, pitch: 0 };
  const f = (u - 0.6) / 0.4;
  return { z: -L + 2 * L * smooth(f), y: Math.sin(f * Math.PI) * 0.14, pitch: Math.sin(f * Math.PI) * 0.35 };
}

function pose(anim, t) {
  const ph = t * Math.PI * 2;
  let grip = v(0, 1.2, 0.34), dir = v(0, -1, 0), lean = 0, yaw = 0, twist = 0, px = 0, py = 1.08, pz = 0, fall = 0;
  let feet = [v(-0.44, 0.07, 0.04), v(0.44, 0.07, 0.04)], pitch = [0, 0], handL = null, oneHand = false;
  if (anim === 'stance') py += Math.sin(ph) * 0.015;
  if (anim === 'attack') {
    const k = atkAt(t);
    grip = k.grip, dir = k.dir, lean = k.lean, twist = k.yaw, py -= k.drop, pz = k.lz * 0.35;
    feet[0] = v(-0.4, 0.07, k.lz);
  }
  if (anim === 'hit') {
    // 맞음: 상체가 뒤로 젖혀졌다 돌아온다(칼은 꽂은 채)
    const f = Math.sin(Math.min(1, t) * Math.PI);
    lean = -0.22 * f, pz = -0.06 * f, twist = 0.12 * f;
  }
  if (anim === 'move') {
    const g = [gait(t % 1), gait((t + 0.5) % 1)];
    feet = g.map((s, i) => v(i ? 0.2 : -0.2, 0.07 + s.y, s.z));
    pitch = g.map((s) => s.pitch);
    py = 1.1 + 0.03 * Math.cos(4 * Math.PI * (t - 0.3)); // 디딘 발 위를 지날 때 가장 높다
    px = -0.04 * Math.cos(2 * Math.PI * (t - 0.3)); // 디딘 발 쪽으로 몸무게가 실린다
    yaw = (g[0].z - g[1].z) * 0.3; // 나가는 다리 쪽 골반이 앞으로
    twist = -yaw * 1.6; // 어깨는 반대로
    lean = 0.1;
    oneHand = true;
    const swing = (g[0].z - g[1].z) * 0.5;
    handL = v(-0.3, 0.1, 0.1 + swing); // 왼팔은 왼다리와 반대로 흔든다
    grip = v(0.33, 0.05, 0.12 - swing * 0.6); // 오른손에 칼을 늘어뜨리고(몸통 기준)
    dir = v(0.15, -1, -0.6).normalize(); // 칼끝은 뒤로 끌린다
  }
  if (anim === 'die') {
    // 쓰러짐: 꽂은 칼을 붙든 채 무릎이 꺾이고 상체가 앞으로 무너진다. 떠돌던 조각은 바닥으로
    // (칼이 넘어지면 어느 방향에선가 칸이 길어져 시트가 4096px을 넘는다)
    const f = smooth(Math.min(1, t * 1.3));
    fall = f;
    py = lerp(1.08, 0.42, f);
    lean = lerp(0, 0.75, f);
    grip = v(0, lerp(1.2, 0.95, f), lerp(0.34, 0.5, f));
    dir = nlerp(v(0, -1, 0), v(0, -0.93, -0.37).normalize(), f); // 칼끝은 땅에 박힌 채 손잡이만 앞으로 기운다
  }
  pelvis.position.set(px, py - lean * 0.12, pz - lean * 0.05);
  pelvis.rotation.y = yaw;
  torso.rotation.set(lean, twist, 0);
  head.rotation.set(-lean * 0.4 + fall * 0.5, -twist * 0.5, 0);
  root.updateMatrixWorld(true);
  const local = (obj, p) => root.worldToLocal(obj.localToWorld(p.clone()));
  [-1, 1].forEach((sx, i) => {
    const l = legs[i];
    const hip = local(pelvis, v(sx * 0.14, -0.02, 0));
    const [knee, end] = ik(hip, feet[i], THIGH, SHIN, v(sx * 0.3, 0, 1));
    orient(l.thigh, hip, knee, v(0, 0, 1));
    orient(l.shin, knee, end, v(0, 0, 1));
    l.knee.position.copy(knee).add(v(sx * 0.1, 0, 0));
    l.knee.rotation.set(0, Math.PI / 2, 0);
    l.foot.position.set(end.x, Math.max(0, end.y - 0.07), end.z);
    l.foot.rotation.set(-pitch[i], sx * -0.25 * (anim === 'move' ? 0.3 : 1), 0);
  });
  sword.position.copy(oneHand ? local(torso, grip) : grip);
  sword.quaternion.setFromUnitVectors(DOWN, dir);
  sword.updateMatrixWorld(true);
  [-1, 1].forEach((sx, i) => {
    const a = arms[i];
    const sh = local(shoulders[i], v(0, -0.02, 0));
    const hand = handL && sx < 0 ? local(torso, handL) : root.worldToLocal(sword.localToWorld(v(0, sx > 0 ? 0 : 0.07, 0)));
    const [elbow, end] = ik(sh, hand, UPPER, FORE, v(sx, -0.3, -0.6));
    orient(a.upper, sh, elbow, v(0, 0, 1));
    orient(a.fore, elbow, end, v(0, 0, 1));
    a.hand.position.copy(end);
    a.hand.quaternion.copy(a.fore.quaternion);
  });
  for (const m of shards) {
    const u = m.userData, ang = u.a + Math.sin(ph) * 0.25; // 한 바퀴 돌면 처음 자리(반복 동작이 끊기지 않게)
    m.position.set(Math.cos(ang) * u.r, lerp(u.y + Math.sin(ph + u.a) * 0.06, 0.04, fall), Math.sin(ang) * u.r);
    m.scale.set(u.s * 0.6, u.s * 1.4, u.s * 0.6);
    m.rotation.set(u.spin, u.spin + Math.sin(ph) * 0.5, 0);
  }
}

start(pose);
