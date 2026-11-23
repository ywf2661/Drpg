// 엔딩 1(설계: docs/superpowers/specs/2026-11-23-prayer-ending-design.md): 기도하는 자의 시체에 빛이 내려오고, 시간의 마녀가 와서 그를 잠재운다.
// main이 넘기는 타임라인 시간 t의 장면을 그린다(같은 t = 같은 그림). 마녀는 sim에 없다 — 연출에만 나온다
import * as THREE from 'three';
import witchInfo from '../assets/sprites/witch.json';
import witchUrl from '../assets/sprites/witch.png';
import { cardGeometry, COS30, dirIndex, frameAt, haloTexture, HEADS, loadSheet, ringTexture, type SheetInfo } from './sprites';
import { setHoldHalo } from './props';

// 타임라인(초, 쓰러진 뒤 대사를 닫은 때 = 0): 정적 → light 빛이 내려옴 → come 마녀가 짙어짐 → walk 시체 곁으로 → kneel 무릎(색 빠짐, 모래 멈춤)
// → say 한 줄(main이 대화창, 열린 동안 t는 멈춘다) → land 고리가 바닥에 닿음 → turn 일어나 주인공을 돌아봄 → leave 흐려짐 → end 레터박스가 걷힌다
export const OUTRO = { light: 1, come: 2, walk: 3.5, kneel: 4.5, say: 5.6, land: 6.6, turn: 6.9, leave: 7.6, end: 9.1 };
// 햇살: 벽 틈으로 비스듬히 들어온 빛줄기. len·r = 길이·반지름(m), soft = 바깥 은은한 겹의 반지름 배율, rest = 연출이 끝난 뒤 남는 밝기,
// from = 바닥에서 빛이 오는 쪽(화면 왼쪽 위에서 비스듬히), motes = 빛 속에 떠도는 먼지 수
const LIGHT = { len: 11, r: 0.6, soft: 2, rest: 0.35, from: new THREE.Vector3(-0.55, 1, 0.45).normalize(), motes: 36 };
const STILL_R = 0.9; // 색이 빠지는 반경(m, 쓰러진 몸 가운데 둘레)
const SAND = 48; // 모래 알갱이 수
const KNEEL_DROP = 0.76; // 무릎 꿇으면 키가 이만큼(tools/sprites.py WITCH_KNEEL)

export type Outro = { t: number; x: number; z: number; face: number; hx: number; hz: number }; // 시체 발 (x, z)·바라보던 쪽, 주인공 (hx, hz)
// 쓰러진 몸 가운데: 발에서 누운 머리(화면 가로 m, tools/sprites.py knight_heads)의 절반만큼 화면 오른쪽 (1, 0, -1)/√2 으로
const bodyOf = (o: Outro) => {
  const k = (HEADS.die?.[dirIndex(o.face)]?.at(-1)?.[0] ?? 0) / 2 / Math.SQRT2;
  return [o.x + k, o.z - k];
};
let outro: Outro | null = null;
export const setOutro = (o: Outro | null) => (outro = o);
export const outroGroup = new THREE.Group();

const clamp01 = (k: number) => Math.min(1, Math.max(0, k));
const ramp = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
const additive = (map: THREE.Texture | null = null) => new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });

// 빛줄기: 바닥 쪽이 밝고 하늘 쪽으로 옅어지는 원통을 LIGHT.from으로 기울인다(하늘 끝은 그대로, 바닥 끝이 내려온다) + 바깥 은은한 겹
const shaftGeo = new THREE.CylinderGeometry(LIGHT.r, LIGHT.r, LIGHT.len, 24, 1, true).translate(0, LIGHT.len / 2, 0);
shaftGeo.setAttribute('color', new THREE.BufferAttribute(Float32Array.from({ length: shaftGeo.attributes.position.count * 3 }, (_, i) => 1 - 0.8 * (shaftGeo.attributes.position.getY(Math.floor(i / 3)) / LIGHT.len)), 3));
const shaftMat = () => Object.assign(additive(), { vertexColors: true, color: new THREE.Color(0xfff2d2) });
const pillar = new THREE.Mesh(shaftGeo, shaftMat());
const haze = new THREE.Mesh(shaftGeo, shaftMat());
haze.scale.set(LIGHT.soft, 1, LIGHT.soft);
pillar.add(haze);
pillar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), LIGHT.from);
// 바닥 빛자국: 빛이 비스듬히 닿아 들어온 쪽 반대로 길게 늘어진 타원
const glowPaint = (u: number, v: number): [number, number, number, number] => [255, 238, 200, Math.round(255 * clamp01(1 - Math.hypot(u, v)) ** 1.5)];
const floorGlow = new THREE.Mesh(new THREE.PlaneGeometry(LIGHT.r * 4.4, LIGHT.r * 2.8).rotateX(-Math.PI / 2).rotateY(Math.atan2(LIGHT.from.z, -LIGHT.from.x)), additive(haloTexture(glowPaint)));
// 빛 속 먼지: 빛줄기 안 아무 데나, 천천히 떠오르며 반짝인다
const motePos = new Float32Array(LIGHT.motes * 3);
const motes = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(motePos, 3)), new THREE.PointsMaterial({ color: 0xfff6dc, size: 1, sizeAttenuation: false, transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }));
motes.frustumCulled = false;
const hash = (n: number) => {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
};

// 마녀: 8방향 판자. 머리 뒤에 청동빛 부서진 톱니 고리
const info = witchInfo as SheetInfo;
const witchMat = new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.05, depthWrite: false, toneMapped: false });
const witch = new THREE.Mesh(cardGeometry(info), witchMat);
witch.rotation.y = Math.PI / 4; // 카메라 쪽
void loadSheet(witchUrl).then((t) => {
  t.repeat.set(1 / info.cols, 1 / info.rows);
  witchMat.map = t;
  witchMat.needsUpdate = true;
});
const gearPaint = (u: number, v: number): [number, number, number, number] => {
  const r = Math.hypot(u, v);
  const deg = ((Math.atan2(v, u) * 180) / Math.PI + 360) % 360;
  const tooth = deg % 30 < 12 && r > 0.8 && r < 0.95; // 톱니 12개
  const band = Math.abs(r - 0.72) < 0.09;
  const broken = deg > 200 && deg < 250; // 한 귀퉁이가 떨어져 나갔다
  return [205, 140, 72, broken || !(band || tooth) ? 0 : 230];
};
const gear = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8 / COS30), additive(haloTexture(gearPaint)));
gear.position.z = -0.05;
witch.add(gear);
const GEAR_Y = 1.5; // 서 있을 때 고리 높이(m)

// 금빛 모래: 손끝에서 흘러내리다 무릎 꿇으면 공중에 멈춘다
const sandPos = new Float32Array(SAND * 3);
const sand = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(sandPos, 3)), new THREE.PointsMaterial({ color: 0xffd36a, size: 2, sizeAttenuation: false, transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }));
sand.frustumCulled = false;

// 떨어지는 고리(기도하는 자 머리 위에 있던 것). 바닥에 닿으면 바닥 아이템 「금 간 빛 고리」로 바뀐다
const falling = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.36 / COS30), additive(ringTexture()));
falling.rotation.y = Math.PI / 4;

for (const m of [pillar, haze, floorGlow, motes, witch, sand, falling]) m.renderOrder = 4;
outroGroup.add(pillar, floorGlow, motes, witch, sand, falling);
outroGroup.visible = false;

// 빛기둥이 판자(시체·주인공·마녀 곁)를 비추는 밝기(render.ts light, 화로처럼 거리로)
export const outroLight = (px: number, pz: number) => (outro ? (pillar.material.opacity / 0.32) * Math.max(0, 1 - Math.hypot(px - floorGlow.position.x, pz - floorGlow.position.z) / 3.5) ** 1.2 * 1.4 : 0);

const v = new THREE.Vector3();
// 한 프레임. camera·canvas는 색 빠짐(#still, 화면 덮개)을 시체 자리에 맞추는 데 쓴다
export function outroFx(camera: THREE.Camera, canvas: HTMLCanvasElement) {
  const still = document.getElementById('still')!;
  outroGroup.visible = !!outro;
  if (!outro) return void (still.style.opacity = '0');
  const { t, hx, hz } = outro;
  const [x, z] = bodyOf(outro); // 빛·마녀·색 빠짐은 쓰러진 몸 가운데에
  // 빛: 내려와서(light → come) 연출 동안 가득, 떠날 때 남은 밝기로
  const down = ramp(t, OUTRO.light, OUTRO.come);
  const k = down * (1 - (1 - LIGHT.rest) * ramp(t, OUTRO.leave, OUTRO.end));
  pillar.position.set(x, 0, z).addScaledVector(LIGHT.from, LIGHT.len * (1 - down));
  pillar.scale.y = Math.max(0.001, down);
  pillar.material.opacity = 0.32 * k;
  haze.material.opacity = 0.1 * k;
  floorGlow.position.set(x, 0.03, z);
  floorGlow.material.opacity = 0.85 * k * down ** 3;
  for (let i = 0; i < LIGHT.motes; i++) {
    const along = ((hash(i) + t * 0.03) % 1) * 4; // 바닥에서 빛줄기를 따라 4m까지
    const [a, r] = [hash(i + 99) * Math.PI * 2 + t * 0.2, LIGHT.r * Math.sqrt(hash(i + 7))];
    motePos.set([x + LIGHT.from.x * along + Math.cos(a) * r, LIGHT.from.y * along + 0.1, z + LIGHT.from.z * along + Math.sin(a) * r], i * 3);
  }
  motes.geometry.attributes.position.needsUpdate = true;
  motes.material.opacity = k * down;
  // 마녀 자리: 주인공에서 본 시체 너머 비스듬히 나타나, 시체 곁(옆)으로 와 무릎 꿇는다
  const len = Math.hypot(x - hx, z - hz) || 1;
  const [ux, uz] = [(x - hx) / len, (z - hz) / len];
  const [px, pz] = [-uz, ux];
  const from = [x + ux * 1.4 + px * 1.3, z + uz * 1.4 + pz * 1.3];
  const to = [x + px * 1.1, z + pz * 1.1];
  const w = ramp(t, OUTRO.walk, OUTRO.kneel);
  const [wx, wz] = [from[0] + (to[0] - from[0]) * w, from[1] + (to[1] - from[1]) * w];
  const kneel = t >= OUTRO.kneel && t < OUTRO.turn;
  const anim = kneel ? 'kneel' : t >= OUTRO.walk && t < OUTRO.kneel ? 'move' : 'stance';
  const look = t >= OUTRO.turn ? [hx - wx, hz - wz] : [x - wx, z - wz];
  const c = info.anims[anim];
  const row = c.row + dirIndex(Math.atan2(look[0], look[1]));
  witchMat.map?.offset.set(frameAt(c, t) / info.cols, 1 - (row + 1) / info.rows);
  witch.position.set(wx, 0, wz);
  const alpha = ramp(t, OUTRO.come, OUTRO.walk) * (1 - ramp(t, OUTRO.leave, OUTRO.end - 0.3));
  witch.visible = alpha > 0;
  witchMat.opacity = alpha;
  witchMat.color.setScalar(1.6); // 빛 속에서(그림이 어둡다)
  gear.position.y = (GEAR_Y * (kneel ? KNEEL_DROP : 1)) / COS30;
  gear.rotation.z = -t * 0.25;
  gear.material.opacity = alpha * 0.9;
  // 모래: 알갱이마다 손에서 떨어진 지 p(0~1). 무릎 꿇고 0.5초 뒤 흐름이 멈춘다
  const flow = Math.min(t, OUTRO.kneel + 0.5);
  const [handX, handZ] = [wx + (x - wx) * 0.3, wz + (z - wz) * 0.3];
  for (let i = 0; i < SAND; i++) {
    const p = (flow * 0.7 + i / SAND) % 1;
    const j = hash(i) - 0.5; // 알갱이마다 다른 흩어짐
    sandPos.set([handX + j * 0.25 + (x - handX) * p * 0.5, (kneel || t >= OUTRO.turn ? 0.7 : 0.95) * (1 - p) + 0.05, handZ - j * 0.25 + (z - handZ) * p * 0.5], i * 3);
  }
  sand.geometry.attributes.position.needsUpdate = true;
  sand.material.opacity = alpha;
  sand.visible = t >= OUTRO.come;
  // 고리: say부터 떨어져 land에 바닥(시체 머리 쪽 = 아이템 자리)
  const f = ramp(t, OUTRO.say, OUTRO.land);
  falling.visible = t >= OUTRO.say && t < OUTRO.land;
  falling.position.set(outro.x, 0.1 + 1.3 * (1 - f * f), outro.z - 0.6); // 아이템 자리(core.ts)
  falling.material.opacity = 0.9;
  if (t >= OUTRO.land) setHoldHalo(false);
  // 시체 둘레만 색이 빠진다: 화면 덮개(backdrop-filter)를 시체 자리 둥근 구멍으로
  const gray = ramp(t, OUTRO.kneel, OUTRO.kneel + 1) * (1 - ramp(t, OUTRO.leave, OUTRO.end));
  still.style.opacity = String(gray);
  if (gray <= 0) return;
  const rect = canvas.getBoundingClientRect();
  v.set(x, 0.4, z).project(camera);
  const cam = camera as THREE.OrthographicCamera;
  const r = (STILL_R * rect.height) / (cam.top - cam.bottom);
  const at = `${rect.left + ((v.x + 1) / 2) * rect.width}px ${rect.top + ((1 - v.y) / 2) * rect.height}px`;
  still.style.setProperty('--at', at);
  still.style.setProperty('--r', `${r}px`);
}
