// 화살비(불화살·폭우·화살 폭풍 포함)의 그림: sim의 world.volleys를 읽기만 한다.
// ① 떨어지기 전: 떨어질 자리에 원이 점점 진해진다(예고)
// ② 떨어지기 FALL초 전부터: 하늘에서 비스듬히 내리꽂히는 빛줄기가 조금씩 엇갈려 쏟아진다
// ③ 닿은 자리: 꽂힌 화살(props의 stickArrow)과 작은 흙먼지
import * as THREE from 'three';
import type { World } from '../sim/world';
import { LEGEND2 } from '../sim/rules';

const FALL = 0.22; // 빛줄기가 하늘에서 바닥까지(초)
const STAGGER = 0.16; // 한 물결의 빛줄기가 엇갈려 떨어지는 폭(초)
const SKY = new THREE.Vector3(-1.7, 7, 1.7); // 떨어지기 시작하는 곳(닿을 자리 기준). 화면 왼쪽 위에서 오른쪽 아래로 비스듬히(-x+z = 화면 왼쪽)
const LEN = 1.5; // 빛줄기 길이(m)
const MAX = 400; // 동시에 그리는 빛줄기 수
const WIDE = [-0.05, 0, 0.05]; // 한 빛줄기를 화면 가로로 나란히 세 줄(도트 1px 선은 너무 가늘다)
const RIGHT = new THREE.Vector3(1, 0, -1).normalize(); // 화면 가로 방향(카메라 수평 45°)
const COLORS = { rain: new THREE.Color(1, 0.93, 0.72), fire: new THREE.Color(1, 0.55, 0.18) };
const RING = 0xffe2a0;
const RING_FIRE = 0xff8a3d;
const DUST = 0.35; // 흙먼지가 퍼지고 사라지는 시간(초)

type Drop = { x: number; z: number; age: number; fire: boolean; dir: number };
let drops: Drop[] = [];
const spawned = new WeakMap<object, number>(); // 물결마다 한 번(volley 객체 → 빛줄기를 낸 left)

export const rainGroup = new THREE.Group();
const pos = new Float32Array(MAX * 6 * WIDE.length);
const col = new Float32Array(MAX * 6 * WIDE.length);
const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3)).setAttribute('color', new THREE.BufferAttribute(col, 3));
const streaks = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }));
streaks.frustumCulled = false;
streaks.renderOrder = 3;
rainGroup.add(streaks);

// 예고 원: 테두리 + 옅은 바닥. 물결마다 하나(pool)
const ringGeo = new THREE.RingGeometry(0.84, 1, 40).rotateX(-Math.PI / 2);
const discGeo = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2);
const rings: { ring: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>; disc: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> }[] = [];
const glow = () => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending });
function ringAt(i: number) {
  if (!rings[i]) {
    const r = { ring: new THREE.Mesh(ringGeo, glow()), disc: new THREE.Mesh(discGeo, glow()) };
    r.ring.renderOrder = r.disc.renderOrder = 1;
    rainGroup.add(r.ring, r.disc);
    rings[i] = r;
  }
  return rings[i];
}

const galeGeo = new THREE.RingGeometry(0.9, 1, 32, 1, 0, Math.PI * 1.4).rotateX(-Math.PI / 2); // 끊긴 고리(도는 게 보이게)
const gales: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>[] = [];
let galeT = 0;

// 흙먼지: 바닥에 눕힌 원이 커지며 옅어진다
const puffs: { mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>; age: number }[] = [];
export function puff(x: number, z: number) {
  const p = puffs.find((p) => p.age >= DUST) ?? puffs[puffs.push({ mesh: new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({ color: 0xb59a74, transparent: true, depthWrite: false })), age: DUST }) - 1];
  if (!p.mesh.parent) rainGroup.add(p.mesh);
  p.mesh.position.set(x, 0.03, z);
  p.age = 0;
}

// 한 물결의 빛줄기 수: 넓을수록 많이(화살비 1.8m에 13개, 5단계 16개, 화살 폭풍 한 발 1.5m에 10개)
const dropsFor = (r: number) => Math.max(6, Math.min(16, Math.round(r * 7)));

// 화면을 새로 그릴 때마다. 닿은 빛줄기마다 land(x, z, 방향)를 부른다(꽂힌 화살)
export function syncRain(world: World, dt: number, land: (x: number, z: number, dir: number) => void) {
  let n = 0;
  for (const v of world.volleys) {
    if (v.blast !== 'rain') continue;
    const fire = !!v.burn;
    // 예고 원: 남은 시간이 줄수록 진해진다(첫 물결 0.6초, 폭우의 다음 물결도 같은 간격)
    const k = Math.max(0, Math.min(1, 1 - v.t / 0.6));
    const r = ringAt(n++);
    for (const m of [r.ring, r.disc]) {
      m.visible = true;
      m.position.set(v.x, 0.04, v.z);
      m.scale.setScalar(v.r);
      m.material.color.set(fire ? RING_FIRE : RING);
    }
    r.ring.material.opacity = 0.35 + 0.65 * k;
    r.disc.material.opacity = 0.08 + 0.22 * k;
    // 떨어지기 FALL초 전: 이 물결의 빛줄기를 낸다(해바라기 배치로 고르게, 시작은 조금씩 엇갈려)
    if (v.t <= FALL && spawned.get(v) !== v.left) {
      spawned.set(v, v.left);
      const count = dropsFor(v.r);
      const turn = Math.random() * Math.PI * 2;
      for (let i = 0; i < count; i++) {
        const a = turn + i * 2.39996;
        const d = v.r * 0.92 * Math.sqrt((i + 0.5) / count);
        drops.push({ x: v.x + Math.sin(a) * d, z: v.z + Math.cos(a) * d, age: FALL - v.t - Math.random() * STAGGER, fire, dir: Math.floor(Math.random() * 8) });
      }
    }
  }
  for (let i = n; i < rings.length; i++) rings[i].ring.visible = rings[i].disc.visible = false;

  // 빛줄기: 머리는 하늘(SKY)에서 바닥으로, 꼬리는 그 뒤로 LEN만큼
  let s = 0;
  drops = drops.filter((d) => {
    d.age += dt;
    if (d.age >= FALL) {
      land(d.x, d.z, d.dir);
      puff(d.x, d.z);
      return false;
    }
    if (d.age < 0 || s >= MAX * WIDE.length) return true;
    const f = 1 - d.age / FALL; // 남은 높이 비율
    const len = LEN / SKY.length();
    const c = d.fire ? COLORS.fire : COLORS.rain;
    for (const o of WIDE) {
      const [ox, oz] = [d.x + RIGHT.x * o, d.z + RIGHT.z * o];
      pos.set([ox + SKY.x * f, SKY.y * f, oz + SKY.z * f, ox + SKY.x * (f + len), SKY.y * (f + len), oz + SKY.z * (f + len)], s * 6);
      const k = o ? 0.55 : 1; // 가운데 줄이 가장 밝다
      col.set([c.r * k, c.g * k, c.b * k, c.r * 0.1, c.g * 0.1, c.b * 0.1], s * 6); // 머리는 밝고 꼬리는 사라진다
      s++;
    }
    return true;
  });
  geo.setDrawRange(0, s * 2);
  geo.attributes.position.needsUpdate = geo.attributes.color.needsUpdate = true;

  for (const p of puffs) {
    if (p.age >= DUST) {
      p.mesh.visible = false;
      continue;
    }
    p.age += dt;
    const k = Math.min(1, p.age / DUST);
    p.mesh.visible = true;
    p.mesh.scale.setScalar(0.12 + 0.38 * k);
    p.mesh.material.opacity = 0.55 * (1 - k);
  }

  // 「회오리 깃 활」의 회오리: 끊긴 고리 셋이 돌며 가운데로 조여든다
  galeT += dt;
  let gn = 0;
  for (const g of world.gales)
    for (let k = 0; k < 3; k++, gn++) {
      if (!gales[gn]) rainGroup.add((gales[gn] = new THREE.Mesh(galeGeo, glow())));
      const m = gales[gn];
      const f = (galeT * 1.2 + k / 3) % 1; // 바깥에서 안으로
      m.visible = true;
      m.position.set(g.x, 0.05 + k * 0.03, g.z);
      m.rotation.y = galeT * 6 + k * 2;
      m.scale.setScalar(LEGEND2.galeR * (1 - 0.8 * f));
      m.material.color.setHex(0xdfe9f0);
      m.material.opacity = 0.5 * Math.min(1, g.t / 0.3) * (0.3 + 0.7 * f);
    }
  for (; gn < gales.length; gn++) gales[gn].visible = false;
}

// 층이 바뀌면 남은 그림을 치운다
export function clearRain() {
  drops = [];
  for (const p of puffs) p.age = DUST;
}
