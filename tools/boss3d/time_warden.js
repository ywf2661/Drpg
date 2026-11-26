// 시간의 파수꾼(2막 최종 보스, 설계: docs/superpowers/specs/2026-11-24-act2-expedition-design.md 5절, 동작: 2026-11-26-act2-rift-design.md 7절).
// 참고 그림: 전작 images/monsters/timeguardian.png — 아몬드 투구의 텅 빈 얼굴, 금 간 라벤더 수정 판 + 청동 테두리, 어깨·옆구리·무릎 톱니,
// 땅에 꽂은 칼 위에 두 손, 톱니바퀴 칼코등이, 떠도는 수정 조각. 잔상은 그리지 않는다(게임 안에서 반 박자 늦은 복사본으로).
// 동작: 톱니는 박자마다 한 칸씩 째깍 돈다. 걸음은 발이 뜬 채 꼿꼿이(앞으로 툭 나가는 박자는 게임이 그림 자리를 계단처럼 옮겨 만든다),
// 베기는 칼끝이 시계 바늘처럼 원을 그린다(예비 동작 → 한 번에 쓸기 → 멈칫 → 복귀). cast = 멈춘 시간, rewind = 되감기, blink = 명멸의 틈에서 나타나며 긋기
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
// 톱니: [톱니, 이 수, 방향]. 박자마다 한 칸씩 돈다(이웃끼리 반대로)
const GEARS = [];
const cog = (R, n, dir) => {
  const g = mk(gearGeo(R, n), bronze);
  GEARS.push([g, n, dir]);
  return g;
};

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
  const gr = cog(0.17, 12, sx);
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
  const gr = cog(0.15, 10, -sx);
  gr.position.set(sx * 0.27, -0.06, -0.05);
  gr.rotation.y = Math.PI / 2;
  pelvis.add(gr);
}
// 팔다리(관절은 매 프레임 IK로)
const THIGH = 0.56, SHIN = 0.56, UPPER = 0.38, FORE = 0.36;
const legs = [-1, 1].map((sx) => ({ thigh: limb(THIGH, 0.1, LIMB, 1.6), shin: limb(SHIN, 0.085, LIMB, 1.6), knee: cog(0.1, 9, sx), foot: new THREE.Group() }));
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
const hilt = cog(0.075, 8, 1);
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
// 째깍: 박자 수 b(실수)를 한 박자 첫 1/4에 툭 넘어가는 계단으로
const tick = (b) => Math.floor(b) + EASE.out(Math.min(1, (b - Math.floor(b)) * 4));

// 시계바늘 베기 열쇠 장면: [t, 칼 각도 φ(atan2(x, z), 0 = 앞, + = 오른쪽), 바늘 자세 정도 w(0 = 칼끝이 아래인 선 자세), 상체 숙임, 골반 낮춤, 허리 비틀기, 왼발 앞뒤, 가속]
// 바늘 자세: 두 손이 가슴 앞 반지름 0.25에서 칼자루를 쥐고, 칼날은 몸 가운데에서 바깥으로 곧게(시계 바늘) — 손이 아니라 각도를 보간해 칼끝이 원을 그린다
const SWEEP = [
  [0, 0, 0, 0, 0, 0, 0.04, 'io'],
  [0.42, 2.3, 1, -0.06, 0.08, 0.6, -0.05, 'io'], // 오른쪽 뒤로 칼을 끌며 허리를 비튼다(예고)
  [0.53, 2.42, 1, -0.08, 0.1, 0.66, -0.05, 'io'], // 멈칫
  [0.62, -1.7, 1, 0.24, 0.16, -0.55, 0.28, 'out'], // 왼쪽으로 반원을 한 번에 쓸어 낸다(2프레임 안)
  [0.82, -1.78, 1, 0.26, 0.16, -0.58, 0.28, 'io'], // 멈칫(무게)
  [1, 0, 0, 0, 0, 0, 0.04, 'io'],
];
// 명멸의 틈 열쇠 장면: [t, 손잡이, 칼끝 방향, 숙임, 비틀기, 낮춤, 왼발, 가속] — 낮게 웅크려 나타나 아래 왼쪽에서 위 오른쪽으로 한 줄 긋는다
const BLINK = [
  [0, [-0.3, 0.95, 0.25], [-0.5, -0.45, -0.75], 0.35, 0.5, 0.22, 0.3, 'io'],
  [0.14, [-0.32, 0.93, 0.22], [-0.55, -0.45, -0.7], 0.38, 0.55, 0.24, 0.3, 'io'],
  [0.26, [0.3, 1.55, 0.3], [0.65, 0.45, 0.6], 0.15, -0.45, 0.12, 0.35, 'out'],
  [0.75, [0.32, 1.56, 0.28], [0.67, 0.45, 0.58], 0.14, -0.48, 0.12, 0.35, 'io'],
  [1, [0, 1.2, 0.34], [0, -1, 0], 0, 0, 0, 0.04, 'io'],
];
function keyAt(keys, t) {
  for (let i = 0; i < keys.length - 1; i++) {
    const A = keys[i], B = keys[i + 1];
    if (t <= B[0]) return [A, B, EASE[B[B.length - 1]]((t - A[0]) / (B[0] - A[0]))];
  }
  const L = keys[keys.length - 1];
  return [L, L, 1];
}
function sweepAt(t) {
  const [A, B, f] = keyAt(SWEEP, t);
  const [phi, w] = [lerp(A[1], B[1], f), lerp(A[2], B[2], f)];
  const R = lerp(0.34, 0.25, w), h = lerp(1.2, 1.35, w);
  return { grip: v(Math.sin(phi) * R, h, Math.cos(phi) * R), dir: nlerp(DOWN, v(Math.sin(phi), -0.1, Math.cos(phi)).normalize(), w), lean: lerp(A[3], B[3], f), drop: lerp(A[4], B[4], f), twist: lerp(A[5], B[5], f), lz: lerp(A[6], B[6], f) };
}
function blinkAt(t) {
  const [A, B, f] = keyAt(BLINK, t);
  return { grip: v(...A[1]).lerp(v(...B[1]), f), dir: nlerp(v(...A[2]).normalize(), v(...B[2]).normalize(), f), lean: lerp(A[3], B[3], f), twist: lerp(A[4], B[4], f), drop: lerp(A[5], B[5], f), lz: lerp(A[6], B[6], f) };
}

function pose(anim, t) {
  let ph = t * Math.PI * 2;
  let grip = v(0, 1.2, 0.34), dir = v(0, -1, 0), lean = 0, yaw = 0, twist = 0, px = 0, py = 1.08, pz = 0, fall = 0;
  let feet = [v(-0.44, 0.07, 0.04), v(0.44, 0.07, 0.04)], pitch = [0, 0], handL = null, handLRoot = null, headDown = 0;
  let beats = t * 8; // 서 있을 때: 한 바퀴(2.4초)에 여덟 박자
  let spinBack = false;
  if (anim === 'stance') py += Math.sin(ph) * 0.015;
  if (anim === 'move') {
    // 째깍 걸음: 발은 한 뼘 떠 있고 몸은 꼿꼿, 칼은 두 손으로 가슴 앞에 세워 든다. 박자마다 몸이 앞으로 툭 쏠렸다 선다
    beats = t * 4;
    const f = beats - Math.floor(beats);
    const jolt = Math.exp(-f * 7) * Math.sin(f * Math.PI * 2.5); // 박자 머리에서 앞으로 쏠렸다 되돌아온다
    py = 1.16 + 0.012 * Math.cos(t * Math.PI * 8);
    feet = [v(-0.2, 0.17, 0.02), v(0.2, 0.17, -0.06)];
    pitch = [0.45, 0.4]; // 발끝이 처진다(떠 있다)
    lean = 0.04 + 0.1 * jolt;
    pz = 0.04 * jolt;
    grip = v(0, 1.18, 0.4);
    dir = v(0, 1, 0.12).normalize(); // 칼끝이 위로
  }
  if (anim === 'attack') {
    const k = sweepAt(t);
    [grip, dir, lean, twist] = [k.grip, k.dir, k.lean, k.twist];
    py -= k.drop;
    pz = k.lz * 0.35;
    feet[0] = v(-0.4, 0.07, k.lz);
    beats = t * 6;
  }
  if (anim === 'cast') {
    // 멈춘 시간: 칼을 치켜들었다 땅에 꽂고 왼손을 앞으로 펼친다. 꽂는 순간 톱니도 조각도 멈춘다
    const up = smooth(Math.min(1, t / 0.32));
    const plant = EASE.in(Math.min(1, Math.max(0, (t - 0.32) / 0.1)));
    const back = smooth(Math.max(0, (t - 0.85) / 0.15));
    const hold = (1 - back) * plant;
    grip = v(0, lerp(lerp(1.2, 1.62, up), 0.98, plant), lerp(0.34, 0.46, plant)).lerp(v(0, 1.2, 0.34), back);
    dir = nlerp(v(0, -1, 0), v(0, -1, 0.15).normalize(), hold);
    lean = 0.18 * hold - 0.08 * up * (1 - plant);
    py -= 0.1 * hold;
    handL = v(-0.18, lerp(0.15, 0.6, hold), lerp(0.1, 0.62, hold));
    const frozen = Math.min(t, 0.42);
    beats = frozen * 10;
    ph = frozen * Math.PI * 2; // 조각도 그 자리에 멈춘다
  }
  if (anim === 'rewind') {
    // 되감기: 꽂은 칼의 칼코등이 톱니를 왼손으로 거꾸로 돌린다. 몸의 톱니·떠도는 조각이 모두 거꾸로
    lean = 0.22 * smooth(Math.min(1, t * 4)) * (1 - smooth(Math.max(0, (t - 0.85) / 0.15)));
    headDown = lean * 1.2;
    beats = -t * 18;
    spinBack = true;
    handLRoot = (s) => s.add(v(Math.cos(-t * Math.PI * 6) * 0.07, Math.sin(-t * Math.PI * 6) * 0.07, 0.08));
  }
  if (anim === 'blink') {
    const k = blinkAt(t);
    [grip, dir, lean, twist] = [k.grip, k.dir, k.lean, k.twist];
    py -= k.drop;
    pz = k.lz * 0.3;
    feet = [v(-0.42, 0.07, k.lz), v(0.46, 0.07, -0.2)];
    beats = t * 3;
  }
  if (anim === 'hit') {
    // 맞음: 상체가 뒤로 젖혀졌다 돌아온다(칼은 꽂은 채)
    const f = Math.sin(Math.min(1, t) * Math.PI);
    lean = -0.22 * f, pz = -0.06 * f, twist = 0.12 * f;
  }
  if (anim === 'die') {
    // 쓰러짐: 꽂은 칼을 붙든 채 무릎이 꺾이고 상체가 앞으로 무너진다. 톱니는 느려지다 멈추고, 떠돌던 조각은 바닥으로
    // (칼이 넘어지면 어느 방향에선가 칸이 길어져 시트가 4096px을 넘는다)
    const f = smooth(Math.min(1, t * 1.3));
    fall = f;
    py = lerp(1.08, 0.42, f);
    lean = lerp(0, 0.75, f);
    grip = v(0, lerp(1.2, 0.95, f), lerp(0.34, 0.5, f));
    dir = nlerp(v(0, -1, 0), v(0, -0.93, -0.37).normalize(), f); // 칼끝은 땅에 박힌 채 손잡이만 앞으로 기운다
    beats = 3 * (1 - (1 - Math.min(1, t * 1.5)) ** 2);
  }
  pelvis.position.set(px, py - lean * 0.12, pz - lean * 0.05);
  pelvis.rotation.y = yaw;
  torso.rotation.set(lean, twist, 0);
  head.rotation.set(-lean * 0.4 + fall * 0.5 + headDown, -twist * 0.5, 0);
  for (const [g, n, d] of GEARS) g.rotation.z = (d * tick(Math.abs(beats)) * Math.sign(beats || 1) * Math.PI * 2) / n;
  root.updateMatrixWorld(true);
  const local = (obj, p) => root.worldToLocal(obj.localToWorld(p.clone()));
  [-1, 1].forEach((sx, i) => {
    const l = legs[i];
    const hip = local(pelvis, v(sx * 0.14, -0.02, 0));
    const [knee, end] = ik(hip, feet[i], THIGH, SHIN, v(sx * 0.3, 0, 1));
    orient(l.thigh, hip, knee, v(0, 0, 1));
    orient(l.shin, knee, end, v(0, 0, 1));
    l.knee.position.copy(knee).add(v(sx * 0.1, 0, 0));
    l.knee.rotation.x = 0;
    l.knee.rotation.y = Math.PI / 2;
    l.foot.position.set(end.x, Math.max(0, end.y - 0.07), end.z);
    l.foot.rotation.set(-pitch[i], sx * -0.25 * (anim === 'move' ? 0.3 : 1), 0);
  });
  sword.position.copy(grip);
  sword.quaternion.setFromUnitVectors(DOWN, dir);
  sword.updateMatrixWorld(true);
  [-1, 1].forEach((sx, i) => {
    const a = arms[i];
    const sh = local(shoulders[i], v(0, -0.02, 0));
    let hand = root.worldToLocal(sword.localToWorld(v(0, sx > 0 ? 0 : 0.07, 0)));
    if (sx < 0 && handL) hand = local(torso, handL);
    if (sx < 0 && handLRoot) hand = handLRoot(root.worldToLocal(sword.localToWorld(v(0, -0.14, 0))));
    const [elbow, end] = ik(sh, hand, UPPER, FORE, v(sx, -0.3, -0.6));
    orient(a.upper, sh, elbow, v(0, 0, 1));
    orient(a.fore, elbow, end, v(0, 0, 1));
    a.hand.position.copy(end);
    a.hand.quaternion.copy(a.fore.quaternion);
  });
  const step = tick(Math.abs(beats)) * (spinBack ? -1 : 1);
  for (const m of shards) {
    const u = m.userData;
    const twitch = 0.03 * Math.exp(-(Math.abs(beats) % 1) * 8); // 박자마다 바깥으로 움찔
    const ang = spinBack ? u.a + step * 0.35 : u.a + Math.sin(ph) * 0.25; // 되감기: 조각이 거꾸로 돈다
    m.position.set(Math.cos(ang) * (u.r + twitch), lerp(u.y + Math.sin(ph + u.a) * 0.06, 0.04, fall), Math.sin(ang) * (u.r + twitch));
    m.scale.set(u.s * 0.6, u.s * 1.4, u.s * 0.6);
    m.rotation.set(u.spin, u.spin + Math.sin(ph) * 0.5, 0);
  }
}

start(pose);
