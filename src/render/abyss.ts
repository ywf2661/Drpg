// 보랏빛 광산의 허공(설계: docs/superpowers/specs/2026-11-25-act2-mine-design.md 2·3절). 허공 칸은 바닥을 그리지 않고, 그 밑에 깊이를 그린다.
//   밑바닥 없는 어둠: 맵 아래 깊은 판에 천천히 흐르는 보랏빛 구름(맨 밑) + 그보다 위의 엷은 안개 판(더 빨리 흐른다 — 카메라가 움직이면 깊이가 느껴진다)
//   절벽 면: 섬 가장자리(카메라 쪽 +x·+z 면)마다 바위 면이 아래로 길게 내려가 어둠에 잠긴다
//   빛 알갱이: 허공에서 천천히 떠오르는 보랏빛 점
//   빛 다리(sim/mine.ts): 투명한 보랏빛 판이 glow만큼 나타난다(꺼진 다리는 아주 희미한 반짝임만). 결정: 보랏빛 수정 무더기, 켜진 결정은 빛 하나를 옮겨 쓴다
import * as THREE from 'three';
import type { World } from '../sim/world';
import { MINE } from '../sim/rules';

const DEPTH = 9; // 맨 밑 구름 판 깊이(m)
const CLIFF = 6; // 절벽 면 길이(m)
let group: THREE.Group | null = null;
let slabs: { mesh: THREE.InstancedMesh; mat: THREE.MeshStandardMaterial }[] = [];
let crystals: { root: THREE.Group; mat: THREE.MeshStandardMaterial }[] = [];
let light: THREE.PointLight | null = null;
const uTime = { value: 0 };

const NOISE = `
float ah(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float an(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(ah(i), ah(i + vec2(1, 0)), u.x), mix(ah(i + vec2(0, 1)), ah(i + vec2(1, 1)), u.x), u.y); }
float afbm(vec2 p) { return an(p) * 0.55 + an(p * 2.1) * 0.28 + an(p * 4.3) * 0.17; }`;

// 허공 판: 맨 밑(deep = 1)은 짙은 구름, 위(deep = 0)는 엷은 안개
function cloud(w: number, h: number, y: number, deep: boolean) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime },
    transparent: !deep,
    depthWrite: deep,
    blending: deep ? THREE.NormalBlending : THREE.AdditiveBlending,
    vertexShader: `varying vec2 vP; void main() { vec4 wp = modelMatrix * vec4(position, 1.0); vP = wp.xz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: `uniform float uTime; varying vec2 vP; ${NOISE}
void main() {
  ${
    deep
      ? `float n = afbm(vP * 0.07 + vec2(uTime * 0.012, uTime * 0.008));
  float m = afbm(vP * 0.16 - vec2(uTime * 0.02, -uTime * 0.01) + 4.0);
  vec3 c = mix(vec3(0.03, 0.008, 0.05), vec3(0.3, 0.09, 0.5), smoothstep(0.25, 0.8, n));
  c += vec3(0.55, 0.22, 0.85) * pow(smoothstep(0.45, 0.9, m * n * 1.7), 2.0); // 밑에서 올라오는 빛(밝은 갈라진 틈)
  gl_FragColor = vec4(c, 1.0);`
      : `float n = afbm(vP * 0.12 + vec2(uTime * 0.05, uTime * 0.03));
  float a = smoothstep(0.45, 0.9, n) * 0.35;
  gl_FragColor = vec4(vec3(0.5, 0.25, 0.75) * a, 1.0);`
  }
}`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w + 80, h + 80).rotateX(-Math.PI / 2), mat);
  mesh.position.set(w / 2, y, h / 2);
  mesh.renderOrder = deep ? -2 : -1;
  return mesh;
}

// 맵이 바뀔 때. 광산이 아니면 null. wall = 절벽 면 질감(동굴 벽)
export function buildAbyss(world: World, wall: THREE.Texture): THREE.Group | null {
  if (group) {
    group.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Points) {
        o.geometry.dispose();
        for (const m of [o.material].flat()) m.dispose();
      }
    });
    group = null;
    slabs = [];
    crystals = [];
    light = null;
  }
  const mine = world.mine;
  if (!mine) return null;
  group = new THREE.Group();
  const { w, h } = world.grid;
  group.add(cloud(w, h, -DEPTH, true), cloud(w, h, -3.2, false));
  // 절벽 면: 땅(허공·빛 다리가 아닌 칸) 중 +x·+z 쪽이 허공·빛 다리인 칸
  const bridgeCell = new Uint8Array(w * h);
  for (const b of mine.bridges) for (const c of b.cells) bridgeCell[c] = 1;
  const gap = (x: number, z: number) => x >= w || z >= h || mine.void[z * w + x] === 1 || bridgeCell[z * w + x] === 1;
  const planks = new Set(world.planks.map(([x, z]) => z * w + x));
  const faces: [number, number, number][] = []; // x, z, 0 = +x 면 / 1 = +z 면
  for (let z = 0; z < h; z++)
    for (let x = 0; x < w; x++) {
      const i = z * w + x;
      if (mine.void[i] || bridgeCell[i] || planks.has(i)) continue;
      if (gap(x + 1, z)) faces.push([x, z, 0]);
      if (gap(x, z + 1)) faces.push([x, z, 1]);
    }
  const map = wall.clone();
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(1 / Math.max(1, Math.round((wall.image as { width: number }).width / 32)), CLIFF / 1.2);
  const rock = new THREE.MeshStandardMaterial({ map, roughness: 1, color: 0xc0b0d0, emissive: 0x1a0a2a });
  rock.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying float vY;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvY = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).y;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vY;')
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>\nfloat k = smoothstep(${(-CLIFF).toFixed(1)}, 0.0, vY);\ngl_FragColor.rgb = mix(vec3(0.03, 0.01, 0.05), gl_FragColor.rgb, k) + vec3(0.3, 0.1, 0.5) * (1.0 - k) * k * 0.5;`); // 아래로 갈수록 어둠에 잠기고(밑동은 허공 빛깔), 중간쯤에 밑에서 올라오는 보랏빛이 비친다
  };
  const faceGeo = new THREE.PlaneGeometry(1, CLIFF);
  const cliffs = new THREE.InstancedMesh(faceGeo, rock, faces.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  faces.forEach(([x, z, side], k) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), side === 0 ? Math.PI / 2 : 0);
    const p = side === 0 ? new THREE.Vector3(x + 1, -CLIFF / 2, z + 0.5) : new THREE.Vector3(x + 0.5, -CLIFF / 2, z + 1);
    cliffs.setMatrixAt(k, m.compose(p, q, one));
  });
  cliffs.receiveShadow = true;
  group.add(cliffs);
  // 빛 알갱이: 허공 칸 몇 곳에서 떠오른다
  const motes: number[] = [];
  let seed = world.rng | 0;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) | 0) >>> 0) / 4294967296; // 렌더 장식용(시드 고정)
  for (let i = 0; i < w * h && motes.length < 3 * 500; i++) if (mine.void[i] && rnd() < 0.08) motes.push((i % w) + rnd(), rnd() * 8, Math.floor(i / w) + rnd());
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.Float32BufferAttribute(motes, 3));
  group.add(
    new THREE.Points(
      pg,
      new THREE.ShaderMaterial({
        uniforms: { uTime },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: `uniform float uTime; varying float vA;
void main() { vec3 p = position; float t = fract(p.y / 8.0 + uTime * 0.025); p.y = -${DEPTH.toFixed(1)} + t * ${(DEPTH + 1).toFixed(1)};
  p.x += sin(uTime * 0.4 + position.z) * 0.3; vA = sin(t * 3.14159);
  vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = 3.0; }`,
        fragmentShader: `varying float vA; void main() { gl_FragColor = vec4(vec3(0.75, 0.5, 1.0) * vA * 0.8, 1.0); }`,
      }),
    ),
  );
  // 빛 다리: 다리마다 판 무더기
  const slabGeo = new THREE.BoxGeometry(0.98, 0.08, 0.98);
  for (const b of mine.bridges) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x7a4ab8, emissive: 0x8a50ff, emissiveIntensity: 0.9, transparent: true, opacity: 0, depthWrite: false, roughness: 0.3 });
    const mesh = new THREE.InstancedMesh(slabGeo, mat, b.cells.length);
    b.cells.forEach((c, k) => mesh.setMatrixAt(k, m.makeTranslation((c % w) + 0.5, -0.04, Math.floor(c / w) + 0.5)));
    group.add(mesh);
    slabs.push({ mesh, mat });
  }
  // 결정: 바닥에서 솟은 수정 셋(가운데 큰 것)
  const gem = new THREE.OctahedronGeometry(0.22, 0);
  for (const c of mine.crystals) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x9a70d8, emissive: 0x6a30c0, emissiveIntensity: 0.5, roughness: 0.25, metalness: 0.1, flatShading: true });
    const root = new THREE.Group();
    for (const [dx, dz, sy, s, tilt] of [[0, 0, 2.6, 1.15, 0], [0.2, 0.12, 1.6, 0.8, 0.35], [-0.16, 0.18, 1.3, 0.7, -0.4]]) {
      const g = new THREE.Mesh(gem, mat);
      g.scale.set(s, s * sy, s);
      g.position.set(dx, 0.22 * s * sy, dz);
      g.rotation.z = tilt;
      g.castShadow = true;
      root.add(g);
    }
    root.position.set(c.x + 0.5, 0, c.z + 0.5);
    group.add(root);
    crystals.push({ root, mat });
  }
  light = new THREE.PointLight(0xa070ff, 0, MINE.light, 1.4);
  group.add(light);
  return group;
}

export function tickAbyss(time: number, world: World) {
  uTime.value = time;
  const mine = world.mine;
  if (!group || !mine) return;
  mine.bridges.forEach((b, k) => {
    const s = slabs[k];
    if (!s) return;
    const shimmer = 0.05 + 0.04 * Math.sin(time * 2.3 + k); // 꺼진 다리: 아주 희미한 반짝임
    s.mat.opacity = Math.max(shimmer, b.glow * (0.62 + 0.08 * Math.sin(time * 3 + k)));
    s.mat.emissiveIntensity = 0.5 + b.glow * 0.7;
  });
  crystals.forEach((c, k) => {
    const on = mine.lit === k;
    c.mat.emissiveIntensity += ((on ? 2.2 + 0.4 * Math.sin(time * 4) : 0.45 + 0.15 * Math.sin(time * 1.3 + k)) - c.mat.emissiveIntensity) * 0.15;
  });
  if (light) {
    const c = mine.lit >= 0 ? mine.crystals[mine.lit] : null;
    if (c) light.position.set(c.x + 0.5, 1.4, c.z + 0.5);
    light.intensity += ((c ? 9 : 0) - light.intensity) * 0.12;
  }
}
