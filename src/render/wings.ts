// 흐르는 깃의 갑옷(2막 엔딩 보상) 날개 — 시안 https://claude.ai/artifact/NWPrvuSnAMbjW6dg3SZ68D 의 makeWings를 옮긴 것. sim은 읽기만 한다.
//   어깨뼈의 청동 바늘 고리에서 빛 깃 다섯 가닥씩 부채꼴, 깃 사이 X자 바늘땀, 깃 끝은 실로 풀려 흩날린다. 주인공 등에 붙어 바라보는 쪽으로 돈다.
//   활강(입고 구르기): 수퍼맨 자세 — 주인공 판자를 화면에서 나아가는 쪽으로 눕히고(최대 GLIDE_TILT) 띄운다. 날개는 수평으로 펼치고 실은 발쪽으로 끌린다
import * as THREE from 'three';
import type { Entity } from '../sim/world';
import type { Sprite } from './sprites';

export const wingsGroup = new THREE.Group();
const FEATHERS = 5;
const SEG = 18;
const GLIDE_TILT = 1.2; // 판자를 눕히는 최대 각(라디안, 약 70°)
const LIFT = 0.55; // 활강 때 뜨는 높이(m)
const CENTER = 0.6; // 판자를 눕힐 때 축(몸 가운데 높이, roll.ts와 같다)
const RIGHT = new THREE.Vector3(1, 0, -1).normalize(); // 화면 가로
const C0 = new THREE.Color(0xf2fbff);
const C1 = new THREE.Color(0x9fd8ff);
const C2 = new THREE.Color(0x7a5cff);
const tmp = new THREE.Color();
type P3 = [number, number, number];
type Feather = { mesh: THREE.Mesh; threads: THREE.Line[]; pts: P3[] };
type Side = { side: number; anchor: THREE.Group; feathers: Feather[]; stitches: { l: THREE.LineSegments; f: number; at: number }[] };

const lineMat = (color: number, opacity: number) => new THREE.LineBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
const buf = (n: number) => new THREE.BufferAttribute(new Float32Array(n * 3), 3);

function build(): { body: THREE.Group; sides: Side[] } {
  const body = new THREE.Group();
  const bronze = new THREE.MeshBasicMaterial({ color: 0xb08a4a, toneMapped: false });
  const sides: Side[] = [-1, 1].map((side) => {
    const anchor = new THREE.Group();
    anchor.position.set(side * 0.12, 1.28, -0.12); // 어깨뼈
    body.add(anchor);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.016, 6, 14), bronze);
    ring.rotation.y = Math.PI / 2;
    const needle = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.34, 5), bronze);
    needle.position.set(side * 0.08, -0.12, 0);
    needle.rotation.z = side * 0.5;
    anchor.add(ring, needle);
    const feathers: Feather[] = Array.from({ length: FEATHERS }, () => {
      const geo = new THREE.BufferGeometry();
      const idx: number[] = [];
      for (let i = 0; i < SEG; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
      geo.setIndex(idx);
      geo.setAttribute('position', buf((SEG + 1) * 2));
      geo.setAttribute('color', buf((SEG + 1) * 2));
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
      mesh.frustumCulled = false;
      const threads = [0, 1].map(() => {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', buf(10));
        const l = new THREE.Line(g, lineMat(0xcfe8ff, 0.8));
        l.frustumCulled = false;
        return l;
      });
      anchor.add(mesh, ...threads);
      return { mesh, threads, pts: [] };
    });
    const stitches: Side['stitches'] = [];
    for (let f = 0; f < FEATHERS - 1; f++)
      for (const at of [0.35, 0.6]) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', buf(4));
        const l = new THREE.LineSegments(g, lineMat(0xffe7b0, 0.9));
        l.frustumCulled = false;
        anchor.add(l);
        stitches.push({ l, f, at });
      }
    return { side, anchor, feathers, stitches };
  });
  body.traverse((o) => (o.renderOrder = 3));
  return { body, sides };
}

// 깃 하나의 줄기 점(몸 기준: x 옆, y 위, z 앞). open = 펼침 0~1(활강), 누우면 몸 뒤 = 하늘이라 발쪽으로 쓸린다
function spine(side: number, f: number, s: number, t: number, open: number, sway: number, back: number): P3 {
  const fan = f / (FEATHERS - 1);
  const len = (1.05 - fan * 0.35) * (0.85 + open * 0.35);
  const up = (0.95 - fan * 1.25) * (1 - open) + open * (-0.2 - fan * 0.45);
  const out = 0.45 + fan * 0.35 + open * 0.75;
  const wave = Math.sin(t * 2.2 - s * 3.5 + f * 0.7) * 0.06 * s * (1 + sway);
  const curl = s * s * 0.25;
  return [side * (out * s * len + 0.02), up * s * len - curl * (0.6 - open * 0.4) + wave * 0.5, -(0.12 + back) * s * len + wave];
}

function pose(sides: Side[], t: number, open: number, sway: number) {
  const back = 0.15 * (1 - open) + 0.05 * open;
  for (const S of sides) {
    S.feathers.forEach((F, f) => {
      const pos = F.mesh.geometry.attributes.position as THREE.BufferAttribute;
      const col = F.mesh.geometry.attributes.color as THREE.BufferAttribute;
      F.pts = [];
      for (let i = 0; i <= SEG; i++) {
        const s = i / SEG;
        const p = spine(S.side, f, s, t, open, sway, back);
        F.pts.push(p);
        const wd = 0.085 * Math.pow(1 - s, 0.55) * (1 + 0.6 * Math.sin(s * Math.PI)) * (1 + open * 0.3);
        pos.setXYZ(i * 2, p[0], p[1] + wd, p[2] - wd * 0.4);
        pos.setXYZ(i * 2 + 1, p[0], p[1] - wd, p[2] + wd * 0.4);
        tmp.copy(C0).lerp(C1, Math.min(1, s * 1.6)).lerp(C2, Math.max(0, s - 0.55) * 2);
        const g = 0.6 * (1 - s * 0.55) * (0.75 + 0.25 * Math.sin(t * 3 + f + s * 4)) * (0.8 + open * 0.4); // 밝은 땅에서 하얗게 타지 않게 0.6
        col.setXYZ(i * 2, tmp.r * g, tmp.g * g, tmp.b * g);
        col.setXYZ(i * 2 + 1, tmp.r * g * 0.6, tmp.g * g * 0.6, tmp.b * g * 0.6);
      }
      pos.needsUpdate = col.needsUpdate = true;
      const tip = F.pts[SEG];
      F.threads.forEach((L, j) => {
        const a = L.geometry.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < 10; i++) {
          const q = i / 9;
          const len = (0.25 + open * 0.9) * q;
          a.setXYZ(i, tip[0] + S.side * q * 0.08 * (j ? 1 : -0.3) + Math.sin(t * 5 + i * 0.8 + j * 2 + f) * 0.04 * q, tip[1] - q * (0.05 + j * 0.06) - len * open + Math.cos(t * 4 + i + f) * 0.03 * q, tip[2] - len * (1 - open));
        }
        a.needsUpdate = true;
        (L.material as THREE.LineBasicMaterial).opacity = 0.45 + open * 0.45;
      });
    });
    for (const st of S.stitches) {
      const A = S.feathers[st.f].pts;
      const B = S.feathers[st.f + 1].pts;
      const [i0, i1] = [Math.round(st.at * SEG), Math.round((st.at + 0.12) * SEG)];
      const a = st.l.geometry.attributes.position as THREE.BufferAttribute;
      a.setXYZ(0, ...A[i0]);
      a.setXYZ(1, ...B[i1]);
      a.setXYZ(2, ...A[i1]);
      a.setXYZ(3, ...B[i0]);
      a.needsUpdate = true;
      (st.l.material as THREE.LineBasicMaterial).opacity = 0.55 + 0.35 * Math.sin(t * 2 + st.f);
    }
  }
}

let wings: { body: THREE.Group; sides: Side[] } | null = null;
let open = 0;

// 매 프레임(주인공 판자를 놓은 뒤): worn = 갑옷을 입었나, s = 주인공 판자. 활강이면 판자를 눕히고 띄운다
export function tickWings(time: number, dt: number, hero: Entity, s: Sprite, worn: boolean) {
  if (!worn || hero.state === 'dead') {
    if (wings) wings.body.visible = false;
    open = 0;
    return;
  }
  if (!wings) wingsGroup.add((wings = build()).body);
  const gliding = hero.phase === 'roll';
  open += ((gliding ? 1 : 0) - open) * Math.min(1, dt * (gliding ? 12 : 5));
  // 수퍼맨 자세: 화면에서 나아가는 쪽으로 머리를 눕힌다(좌우로 날면 다 눕고, 위아래면 덜)
  const sr = (hero.dx - hero.dz) * Math.SQRT1_2; // 화면 오른쪽 성분
  const tilt = -Math.sign(sr || 1) * GLIDE_TILT * Math.min(1, Math.abs(sr) * 1.4) * open;
  const mesh = s.mesh;
  mesh.rotation.z = tilt;
  mesh.position.x += RIGHT.x * CENTER * Math.sin(tilt);
  mesh.position.z += RIGHT.z * CENTER * Math.sin(tilt);
  mesh.position.y += CENTER * (1 - Math.cos(tilt)) + LIFT * open;
  // 날개: 몸(3D)을 바라보는 쪽으로, 누운 만큼 앞으로 숙인다(sim facing: +z가 앞)
  const b = wings.body;
  b.visible = true;
  b.position.set(hero.x, LIFT * open, hero.z);
  b.rotation.order = 'YXZ';
  b.rotation.y = hero.facing;
  b.rotation.x = open * 1.4;
  const walking = hero.state === 'move' && !gliding;
  pose(wings.sides, time, open, walking ? 0.8 + 0.6 * Math.abs(Math.sin(time * 6)) : 0);
}
