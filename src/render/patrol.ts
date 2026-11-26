// 타임패트롤 신호(설계: 2026-11-24-act2-expedition-design.md 4절): 발밑 원판에서 쏘아 올린 홀로그램 순찰대원.
// 코드로 짠 각진 3D 모형 — 얼굴을 가린 헬멧(빛나는 가리개)·어깨 판·앞이 트인 긴 코트·팔목 장치·등짐.
// 제자리에 서서 숨 쉬고, 무게를 옮기고, 고개를 주인공 쪽으로 돌리고, 가끔 팔목 장치를 내려다본다(툴툴).
// 그림: 푸른 빛 셰이더(가로 주사선, 가장자리 빛, 아래에서 위로 훑는 띠). 나타날 땐 발부터 쌓이고, 지지직은 드물게.
import * as THREE from 'three';

const H = { hips: 0.95, revealTime: 0.7, top: 1.9 };
const COL = { body: new THREE.Color(0x3a8cff), glow: new THREE.Color(0xe0fbff) };
const uni = { uTime: { value: 0 }, uReveal: { value: 0 }, uGlitch: { value: 0 } };

const VERT = /* glsl */ `
varying vec3 vW;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
// 몸: 각진 면(화면 미분으로 면 법선), 가짜 빛으로 덩어리를 살리고 가장자리를 밝게
const BODY_FRAG = /* glsl */ `
uniform float uTime, uReveal, uGlitch, uGlow;
uniform vec3 uColor;
varying vec3 vW;
void main() {
  float h = vW.y;
  if (h > uReveal) discard;
  vec3 n = normalize(cross(dFdx(vW), dFdy(vW)));
  vec3 v = normalize(cameraPosition - vW);
  if (dot(n, v) < 0.0) n = -n;
  float lit = 0.22 + 0.78 * max(dot(n, normalize(vec3(-0.5, 0.8, 0.4))), 0.0);
  float rim = pow(1.0 - abs(dot(n, v)), 2.0);
  float scan = 0.78 + 0.22 * step(0.5, fract(h * 8.0 - uTime * 0.8)) - 0.25 * uGlitch * step(0.7, fract(h * 3.0 + uTime * 7.0));
  float sweep = smoothstep(0.1, 0.0, abs(h - mod(uTime * 0.8, 3.0) + 0.4));
  float edge = smoothstep(0.08, 0.0, uReveal - h) * step(uReveal, 2.0);
  vec3 c = uColor * lit * scan * (0.75 + uGlow) + vec3(0.55, 0.9, 1.0) * (rim * 1.1 + sweep * 0.5 + edge * 1.6);
  gl_FragColor = vec4(c, (0.72 + 0.28 * rim + uGlow) * (1.0 - 0.4 * uGlitch));
}`;
// 빛기둥: 원판에서 위로 옅어지는 푸른 빛(세로 줄무늬가 천천히 돈다)
const BEAM_FRAG = /* glsl */ `
uniform float uTime;
varying vec3 vW;
void main() {
  float h = clamp(vW.y / 2.0, 0.0, 1.0);
  float streak = 0.6 + 0.4 * sin(atan(vW.z, vW.x) * 9.0 + uTime * 1.5);
  gl_FragColor = vec4(vec3(0.35, 0.75, 1.0) * pow(1.0 - h, 2.0) * 0.28 * streak, 1.0);
}`;

const mats = new Map<string, THREE.ShaderMaterial>();
const holo = (glow = 0) =>
  mats.get(`h${glow}`) ??
  mats.set(`h${glow}`, new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: BODY_FRAG, uniforms: { ...uni, uGlow: { value: glow }, uColor: { value: glow ? COL.glow : COL.body } }, transparent: true, side: THREE.DoubleSide, toneMapped: false })).get(`h${glow}`)!;
const part = (geo: THREE.BufferGeometry, glow = 0) => new THREE.Mesh(geo, holo(glow));
const cyl = (top: number, bottom: number, h: number, sides = 6, open = false, t0 = 0, tl = Math.PI * 2) => new THREE.CylinderGeometry(top, bottom, h, sides, 1, open, t0, tl).translate(0, -h / 2, 0); // 윗면이 원점(관절)

// 팔·다리: 관절 그룹 둘(위·아래), 아래로 뻗는다
function limb(len1: number, r1: number, len2: number, r2: number) {
  const top = new THREE.Group();
  const low = new THREE.Group();
  top.add(part(cyl(r1, r1 * 0.85, len1)), low);
  low.position.y = -len1;
  low.add(part(cyl(r2, r2 * 0.85, len2)));
  return { top, low };
}

export const patrolGroup = new THREE.Group();
const root = new THREE.Group(); // 땅 위 위치·방향(앞 = +z)
const hips = new THREE.Group();
const torso = new THREE.Group();
const head = new THREE.Group();
const skirt = new THREE.Group();
const legs = [limb(0.45, 0.088, 0.42, 0.07), limb(0.45, 0.088, 0.42, 0.07)];
const arms = [limb(0.3, 0.06, 0.27, 0.052), limb(0.3, 0.06, 0.27, 0.052)]; // [0] = 왼팔(+x, 팔목 장치), [1] = 오른팔
const ring = new THREE.Group();
{
  patrolGroup.add(root);
  patrolGroup.visible = false;
  root.add(hips);
  hips.position.y = H.hips;
  // 다리 + 장화
  legs.forEach((l, i) => {
    l.top.position.set(i ? -0.1 : 0.1, 0, 0);
    const boot = part(new THREE.BoxGeometry(0.14, 0.11, 0.24));
    boot.position.set(0, -0.42 + 0.0, 0.03);
    const knee = part(new THREE.BoxGeometry(0.1, 0.08, 0.06), 0);
    knee.position.set(0, 0.02, 0.05);
    l.low.add(boot, knee);
    hips.add(l.top);
  });
  // 앞이 트인 긴 코트 자락
  skirt.add(part(cyl(0.18, 0.34, 0.62, 8, true, 0.22, Math.PI * 2 - 0.44)));
  skirt.position.y = 0.06;
  hips.add(skirt, torso);
  torso.position.y = 0.04;
  // 몸통·허리띠(빛나는 버클)·가슴 줄·옷깃·등짐
  const chest = part(cyl(0.2, 0.15, 0.44, 6).translate(0, 0.44, 0));
  chest.scale.z = 0.72;
  const belt = part(cyl(0.165, 0.165, 0.05, 8).translate(0, 0.05, 0));
  const buckle = part(new THREE.BoxGeometry(0.06, 0.04, 0.02), 0.6);
  buckle.position.set(0, 0.025, 0.125);
  const stripe = part(new THREE.BoxGeometry(0.02, 0.26, 0.01), 0.6);
  stripe.position.set(0.05, 0.27, 0.142);
  stripe.rotation.z = 0.12;
  const collar = part(cyl(0.16, 0.12, 0.13, 8, true).translate(0, 0.55, 0));
  const pack = part(new THREE.BoxGeometry(0.22, 0.26, 0.1));
  pack.position.set(0, 0.28, -0.15);
  const vents = [-0.05, 0.05].map((x) => {
    const v = part(new THREE.BoxGeometry(0.025, 0.16, 0.01), 0.6);
    v.position.set(x, 0.28, -0.205);
    return v;
  });
  torso.add(chest, belt, buckle, stripe, collar, pack, ...vents);
  // 헬멧: 길쭉한 머리통 + 앞을 두른 빛 가리개 + 옆 더듬이
  head.position.y = 0.5;
  const helm = part(new THREE.SphereGeometry(0.125, 7, 5));
  helm.scale.set(0.95, 1.1, 1.05);
  helm.position.y = 0.15;
  const visor = part(new THREE.CylinderGeometry(0.13, 0.124, 0.07, 9, 1, true, -1.35, 2.7), 0.9);
  visor.scale.z = 1.06;
  visor.position.y = 0.16;
  const fin = part(new THREE.BoxGeometry(0.015, 0.14, 0.04));
  fin.position.set(0.12, 0.25, -0.03);
  fin.rotation.z = -0.25;
  head.add(helm, visor, fin);
  torso.add(head);
  // 어깨 판·팔, 왼팔목 장치
  arms.forEach((a, i) => {
    const s = i ? -1 : 1;
    a.top.position.set(0.22 * s, 0.42, 0);
    const pad = part(new THREE.SphereGeometry(0.095, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2));
    pad.scale.set(1.45, 0.9, 1.2);
    pad.rotation.z = -0.35 * s;
    pad.position.y = 0.01;
    const hand = part(new THREE.BoxGeometry(0.06, 0.08, 0.07));
    hand.position.y = -0.31;
    a.low.add(hand);
    a.top.add(pad);
    torso.add(a.top);
  });
  const device = part(new THREE.BoxGeometry(0.09, 0.12, 0.07), 0.8);
  device.position.set(0, -0.18, 0.03);
  arms[0].low.add(device);
  // 발밑: 원판(어두운 판 + 도는 빛 고리 셋 조각) + 빛기둥
  const disc = part(new THREE.CylinderGeometry(0.36, 0.4, 0.04, 8).translate(0, 0.02, 0));
  for (let k = 0; k < 3; k++) ring.add(part(new THREE.RingGeometry(0.42, 0.47, 8, 1, (k * Math.PI * 2) / 3, 1.5).rotateX(-Math.PI / 2).translate(0, 0.03, 0), 0.8));
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.42, 2, 16, 1, true).translate(0, 1, 0),
    new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: BEAM_FRAG, uniforms: uni, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }),
  );
  root.add(disc, ring, beam);
  root.traverse((o) => (o.renderOrder = 3));
}

let at: { x: number; z: number } | null = null;
let shownAt = -1;
let yaw = 0;
let look = 0;
export const setPatrol = (p: { x: number; z: number } | null) => (at = p);

const CAM_YAW = Math.PI / 4; // 카메라가 있는 쪽(+x +z): 몸을 조금 이쪽으로 틀어 3/4로 보이게
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const bump = (t: number, a: number, b: number) => THREE.MathUtils.smoothstep(t, a, a + 0.3) * (1 - THREE.MathUtils.smoothstep(t, b - 0.3, b));

export function patrolFx(hx: number, hz: number, time: number, dt: number) {
  patrolGroup.visible = !!at;
  if (!at) return void (shownAt = -1);
  if (shownAt < 0) {
    shownAt = time;
    yaw = Math.atan2(hx - at.x, hz - at.z);
  }
  const t = time - shownAt;
  // 지지직: 몇 초에 한 번, 아주 잠깐(나타나는 중엔 없다)
  const k = Math.floor(time * 10);
  const glitch = t > 1.5 && Math.sin(k * 91.7) > 0.93 ? 1 : 0;
  uni.uTime.value = time;
  uni.uReveal.value = Math.min(1, t / H.revealTime) ** 1.5 * H.top + (t > H.revealTime ? 1 : 0);
  uni.uGlitch.value = glitch;
  const jx = glitch * 0.12 * Math.sin(k * 13.3);
  root.position.set(at.x + jx, 0, at.z - jx);

  // 몸: 주인공을 보되 카메라 쪽으로 조금 틀고, 고개가 나머지를 돈다
  const toHero = Math.atan2(hx - at.x, hz - at.z);
  const goal = toHero + 0.45 * wrap(CAM_YAW - toHero);
  yaw += wrap(goal - yaw) * Math.min(1, dt * 3);
  root.rotation.y = yaw;
  const peek = bump(t % 7, 3.6, 5.0); // 가끔 팔목 장치를 내려다본다
  look += (THREE.MathUtils.clamp(wrap(toHero - yaw), -0.9, 0.9) * (1 - peek) + 0.45 * peek - look) * Math.min(1, dt * 4);

  const breath = Math.sin(time * 1.7);
  const sway = Math.sin(time * 0.45);
  hips.position.x = 0.02 * sway;
  hips.rotation.z = 0.025 * sway;
  legs.forEach((l, i) => {
    l.top.rotation.set(-0.03, 0, -hips.rotation.z + (i ? -0.04 : 0.04)); // 발은 땅에 두고 엉덩이만 옮긴다
    l.low.rotation.x = 0.05 + (i === (sway > 0 ? 1 : 0) ? 0.06 * Math.abs(sway) : 0); // 쉬는 다리 무릎이 조금 굽는다
  });
  skirt.rotation.set(0.02 * Math.sin(time * 0.9), 0, -hips.rotation.z * 0.6 + 0.015 * Math.sin(time * 1.3));
  torso.rotation.set(0.03 + 0.08 * peek, 0, -0.045 * sway);
  torso.scale.y = 1 + 0.012 * breath;
  head.rotation.set(0.05 * Math.sin(time * 2.3) * (1 - peek) + 0.42 * peek, look, 0.03 * Math.sin(time * 0.6));
  // 왼팔: 장치를 찬 팔목을 가슴 앞에 들고 있다(내려다볼 땐 조금 더 든다). 오른팔: 늘어뜨림
  arms[0].top.rotation.set(-0.35 - 0.15 * peek, 0, 0.12);
  arms[0].low.rotation.set(-1.25 - 0.25 * peek + 0.05 * Math.sin(time * 0.9), 0, -0.5);
  arms[1].top.rotation.set(0.05 * Math.sin(time * 0.7 + 1), 0, -0.1 - 0.01 * breath);
  arms[1].low.rotation.set(-0.3, 0, 0);
  arms.forEach((a) => (a.top.position.y = 0.42 + 0.006 * breath));
  ring.rotation.y = time * 0.8;
}
