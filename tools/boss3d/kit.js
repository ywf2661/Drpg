// 보스 그림 도구 공용 부품(설계: docs/superpowers/specs/2026-11-24-boss3d-tool-design.md).
// 도형으로 조립한 3D 모형을 게임과 같은 카메라(30°, 직교)로 렌더한다. render.py가 헤드리스 크롬으로 이 페이지를 열어 renderFrame을 부른다.
import * as THREE from 'three';
export { THREE };

export const W = 832, VIEW = 4.4, TARGET_Y = 1.15; // 렌더 칸(px), 화면 세로로 보이는 거리(m), 카메라가 겨누는 높이(m) — render.py와 같은 값
const ELEV = Math.PI / 6; // 게임 카메라가 내려다보는 각도(src/render/sprites.ts ELEV)

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setSize(W, W);
renderer.setClearColor(0, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);
export const scene = new THREE.Scene();
const cam = new THREE.OrthographicCamera(-VIEW / 2, VIEW / 2, VIEW / 2, -VIEW / 2, 0.1, 60);
cam.position.set(0, TARGET_Y + 20 * Math.sin(ELEV), 20 * Math.cos(ELEV));
cam.lookAt(0, TARGET_Y, 0);
// 빛: Flare 그림처럼 화면 왼쪽 위에서, 뒤에서 차가운 테두리 빛
scene.add(new THREE.HemisphereLight(0xc8c8e0, 0x221c18, 0.8));
const key = new THREE.DirectionalLight(0xffe8d0, 2.4);
key.position.set(-6, 10, 7);
const rim = new THREE.DirectionalLight(0x9c7ee8, 1.3);
rim.position.set(6, 5, -7);
scene.add(key, rim);
export const root = new THREE.Group(); // 모형의 발밑 = 원점, 앞 = +Z(카메라 쪽)
scene.add(root);

export const v = (x, y, z) => new THREE.Vector3(x, y, z);
export const lerp = (a, b, f) => a + (b - a) * f;
export const smooth = (f) => f * f * (3 - 2 * f);
export const nlerp = (a, b, f) => a.clone().lerp(b, f).normalize();
export const EASE = { io: smooth, in: (f) => f * f * f, out: (f) => 1 - (1 - f) ** 3 };
export const OCT = new THREE.OctahedronGeometry(1, 0);
export const mk = (geo, mat, p = [0, 0, 0], s = [1, 1, 1], r = [0, 0, 0]) => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...p);
  m.scale.set(...s);
  m.rotation.set(...r);
  return m;
};

// 질감(캔버스, 시드 고정 — 다시 뽑아도 같다)
export const rnd = (seed) => () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
function canvasTex(n, paint, rep) {
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const x = c.getContext('2d');
  const d = x.createImageData(n, n);
  paint(d.data, n);
  x.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rep, rep);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// 보로노이 모자이크: 조각마다 밝기(lo~hi)를 달리하고 이음매(edgeW px)는 edge까지 어둡게. 점을 9칸에 복사해 이음매 없이 반복
export function mosaic(n, cells, seed, lo, hi, edge, edgeW, rep = 2) {
  return canvasTex(n, (data) => {
    const r = rnd(seed), pts = [];
    for (let i = 0; i < cells; i++) {
      const p = [r() * n, r() * n, lo + r() * (hi - lo)];
      for (const ox of [-n, 0, n]) for (const oy of [-n, 0, n]) pts.push([p[0] + ox, p[1] + oy, p[2]]);
    }
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        let d1 = 1e9, d2 = 1e9, val = 0;
        for (const p of pts) {
          const d = (p[0] - x) ** 2 + (p[1] - y) ** 2;
          if (d < d1) [d2, d1, val] = [d1, d, p[2]];
          else if (d < d2) d2 = d;
        }
        const e = Math.sqrt(d2) - Math.sqrt(d1);
        const g = (e < edgeW ? edge + (val - edge) * (e / edgeW) ** 2 : val) + (r() - 0.5) * 14;
        data.set([g, g, g, 255], (y * n + x) * 4);
      }
  }, rep);
}
// 긁힌 금속: 얼룩 바탕에 짧은 어두운·밝은 줄
export function scratches(n, seed, rep = 2) {
  return canvasTex(n, (data) => {
    const r = rnd(seed);
    for (let i = 0; i < n * n; i++) {
      const g = 175 + r() * 60;
      data.set([g, g, g, 255], i * 4);
    }
    for (let k = 0; k < 90; k++) {
      const x = r() * n, y = r() * n, a = r() * Math.PI, L = 6 + r() * 20, g = r() < 0.5 ? 110 : 250;
      for (let s = 0; s < L; s++) data.set([g, g, g, 255], ((((Math.floor(y + Math.sin(a) * s) % n) + n) % n) * n + (((Math.floor(x + Math.cos(a) * s) % n) + n) % n)) * 4);
    }
  }, rep);
}

// 톱니: 이 teeth개, 가운데 구멍과 창 다섯
export function gearGeo(R, teeth, depth = 0.04) {
  const s = new THREE.Shape();
  for (let i = 0; i < teeth * 2; i++) {
    const a0 = (i / (teeth * 2)) * Math.PI * 2, a1 = ((i + 1) / (teeth * 2)) * Math.PI * 2, r = i % 2 ? R * 0.8 : R;
    if (i === 0) s.moveTo(Math.cos(a0) * r, Math.sin(a0) * r);
    else s.lineTo(Math.cos(a0) * r, Math.sin(a0) * r);
    s.lineTo(Math.cos(a1) * r, Math.sin(a1) * r);
  }
  const hole = new THREE.Path();
  hole.absarc(0, 0, R * 0.22, 0, Math.PI * 2, true);
  s.holes.push(hole);
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2, h = new THREE.Path();
    h.absarc(Math.cos(a) * R * 0.52, Math.sin(a) * R * 0.52, R * 0.13, 0, Math.PI * 2, true);
    s.holes.push(h);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 5 });
  g.translate(0, 0, -depth / 2);
  return g;
}

// 팔다리 한 마디: 0→L(+Y)에 속심·앞판·고리. orient로 두 점 사이에 세운다
export function limb(L, r, m, plate = 1.4) {
  const g = new THREE.Group();
  g.add(mk(new THREE.CylinderGeometry(r * 0.8, r * 0.65, L, 6), m.core, [0, L / 2, 0]));
  g.add(mk(OCT, m.plate, [0, L * 0.5, r * 0.35], [r * plate, L * 0.52, r * 1.2]));
  for (const f of [0.12, 0.88]) g.add(mk(new THREE.CylinderGeometry(r * 1.12, r * 1.12, 0.035, 8), m.ring, [0, L * f, 0]));
  return g;
}
const tmpM = new THREE.Matrix4();
// obj의 +Y를 a→b로, +Z는 fwd 쪽으로
export function orient(obj, a, b, fwd) {
  const y = b.clone().sub(a).normalize();
  const z = fwd.clone().addScaledVector(y, -fwd.dot(y)).normalize();
  obj.position.copy(a);
  obj.quaternion.setFromRotationMatrix(tmpM.makeBasis(new THREE.Vector3().crossVectors(y, z), y, z));
}
// 두 마디 IK: 뿌리 a에서 끝 t까지(닿지 않으면 쭉 편다), 무릎·팔꿈치는 pole 쪽으로. [가운데 관절, 끝]
export function ik(a, t, l1, l2, pole) {
  const d = t.clone().sub(a);
  const dist = Math.min(d.length(), l1 + l2 - 1e-3);
  const dir = d.normalize();
  const cosA = (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist);
  const perp = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize();
  const mid = a.clone().addScaledVector(dir, l1 * cosA).addScaledVector(perp, l1 * Math.sqrt(Math.max(0, 1 - cosA * cosA)));
  return [mid, a.clone().addScaledVector(dir, dist)];
}

// 모형이 준비되면 부른다. pose(anim, t): 동작 anim의 t(0~1) 자세를 잡는다. facing = 모형을 Y축으로 돌리는 각(0 = 카메라를 봄)
export function start(pose) {
  window.renderFrame = (facing, anim, t) => {
    root.rotation.y = facing;
    pose(anim, t);
    renderer.render(scene, cam);
    return renderer.domElement.toDataURL('image/png');
  };
  window.ready = true;
}
