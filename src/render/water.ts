// 호숫가 물(설계: docs/superpowers/specs/2026-11-24-act2-lake-design.md 2·4절). 물·여울·판자 칸을 판자 하나의 물면으로 그린다.
// 칸마다 [물인가, 물가에서 먼 정도, 여울인가, 땅이 물에서 먼 정도]를 담은 작은 질감(칸 = 텍셀)을 선형으로 읽어 물가가 칸 모양(계단)이 아니라 둥글게 이어진다.
//   물면: 물가는 탁한 청록 → 가운데는 검은 남색, 물가 둘레 물거품, 잔물결(법선)에 해가 반짝인다. 얕은 곳에 연잎 무리, 배 둘레·뒤로 물결, 여울을 걷는 주인공 둘레에 동그란 물결
//   물가 둑(땅 바로 위 얇은 판): 물 칸의 남은 자리를 진흙 둑으로 채우고, 둘레 땅을 젖은 흙빛으로 물들인다(바닥 칸 색을 바꾸지 않는다)
//   물안개: 물 위에 낮게 깔려 천천히 흐른다
//   나룻배: 나무 배 모형(통나무 색 둘레 + 바닥 + 뱃머리 등불). 탄 배는 줄을 따라, 빈 배는 엇갈려 처음 나루로
//   퍼즐(sim/sluice.ts): 검은 물길은 보랏빛 검은 물(물이 빠지면 여울), 수문 바퀴(물이 갈 쪽이 바뀌면 돈다 — 방향 표시는 일부러 없다: 물을 보고 푼다), 우물(더러우면 검게), 검은 웅덩이
import * as THREE from 'three';
import type { World } from '../sim/world';
import { PUDDLE } from '../sim/rules';
import { lakeLow } from '../sim/sluice';

const Y = -0.12; // 물면 높이(m): 물가가 한 턱 낮아 보이게
const DEEP = 4; // 물가에서 이만큼(칸) 떨어지면 가장 깊은 색
const LAND = 3; // 땅 쪽 젖은 띠를 재는 거리(칸)
const BOATS = 4; // 셰이더에 넘기는 배 수(움직이는 배는 한 줄의 둘뿐)
let group: THREE.Group | null = null;
let boats: THREE.Group[] = [];
let wheels: { wheel: THREE.Object3D; spin: number; aim: number }[] = [];
let wells: THREE.MeshStandardMaterial[] = [];
let puddles: THREE.Mesh[] = [];
let maskVer = -1;
let bossBoat: THREE.Group | null = null;
let sink = 0; // 뱃사공이 물 위에서 쓰러진 뒤 흐른 시간(배가 가라앉는다)
let fill: (() => void) | null = null;
const uniforms = {
  uTime: { value: 0 },
  uMask: { value: null as THREE.DataTexture | null },
  uBlack: { value: null as THREE.DataTexture | null }, // 칸마다 검은 물인가(R)
  uSize: { value: new THREE.Vector2(1, 1) },
  uBoats: { value: Array.from({ length: BOATS }, () => new THREE.Vector4(-99, -99, 0, 0)) }, // x, z, 속도 x, 속도 z
  uHero: { value: new THREE.Vector3(-99, -99, 0) }, // x, z, 여울 위인가
  uArena: { value: new THREE.Vector3(0, 0, -1) }, // 뱃사공 결전 물: 가운데 x, z, 반지름(음수 = 결전장 아님) — 그 밖의 호수는 마른 바닥
};
let lakeWheels: { root: THREE.Group; wheel: THREE.Group; spin: number }[] = []; // 결전장 바퀴(sim의 fm.ids 차례)

// 모든 물 재질이 같이 쓰는 셰이더 앞부분
const COMMON = `
varying vec3 vWater;
uniform float uTime;
uniform sampler2D uMask;
uniform sampler2D uBlack;
uniform vec2 uSize;
uniform vec4 uBoats[${BOATS}];
uniform vec3 uHero;
uniform vec3 uArena;
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise2(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1, 0)), u.x), mix(hash2(i + vec2(0, 1)), hash2(i + vec2(1, 1)), u.x), u.y); }
vec4 maskAt(vec2 wp) { return texture2D(uMask, wp / uSize); }
// 물이 있는 자리: 물 칸 안쪽으로만(땅 칸 위로는 넘지 않게) 울퉁불퉁한 물가 선
float waterEdge(vec2 wp, vec4 m) { return m.r - 0.16 + (noise2(wp * 2.3) - 0.5) * 0.3; }
// 결전 물 안쪽까지의 거리(m, 음수 = 물이 빠진 바닥). 결전장이 아니면 늘 1
float arenaIn(vec2 wp) { return uArena.z < 0.0 ? 1.0 : uArena.z - length(wp - uArena.xy) + (noise2(wp * 2.3) - 0.5) * 0.3; }
`;
const VERT = (s: THREE.WebGLProgramParametersWithUniforms) => {
  s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWater;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWater = (modelMatrix * vec4(transformed, 1.0)).xyz;');
};

export function tickWater(time: number, world: World) {
  uniforms.uTime.value = time;
  if (!group) return;
  const sl = world.sluice;
  if (sl && sl.ver !== maskVer) (maskVer = sl.ver), fill?.(); // 물이 차고 빠졌다
  // 바퀴: 물이 갈 쪽이 바뀌면 한 바퀴 돈다
  sl?.gates.forEach((g, k) => {
    const v = wheels[k];
    if (!v) return;
    const [ax, az] = g.aim[g.to];
    const want = Math.atan2(ax - g.x - 0.5, az - g.z - 0.5) + (g.key === '8' && !g.to ? Math.PI : 0); // 물높이: 낮으면 모래톱 쪽, 높으면 반대쪽
    let d = want - v.aim;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    v.aim += d * Math.min(1, 0.1);
    v.spin += Math.abs(d) * 0.25;
    v.wheel.rotation.z = v.spin * 4;
  });
  sl?.wells.forEach((w, k) => {
    const m = wells[k];
    if (m) m.color.setHex(w.dirty ? 0x150818 : 0x1d4a5a), m.emissive.setHex(w.dirty ? 0x3a0a40 : 0x000000);
  });
  // 검은 웅덩이
  world.puddles.forEach((p, k) => {
    let m = puddles[k];
    if (!m) {
      m = new THREE.Mesh(new THREE.CircleGeometry(PUDDLE.r, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x0a040c, transparent: true, depthWrite: false }));
      puddles.push(m);
      group!.add(m);
    }
    m.position.set(p.x, 0.03, p.z);
    (m.material as THREE.MeshBasicMaterial).opacity = 0.75 * Math.min(1, p.t / 0.8);
  });
  puddles.forEach((m, k) => (m.visible = k < world.puddles.length));
  const low = lakeLow(world);
  const hero = world.entities[0];
  // 뱃사공의 배: 물 위에 있는 동안 발밑에. 물 위에서 쓰러지면 천천히 기울며 가라앉는다
  // 결전 물: 반지름을 셰이더로. 뱃사공의 배는 가운데에 늘, 물이 빠지면 바닥에 얹혀 기운다. 쓰러지면 천천히 가라앉는다
  const fm = world.fm;
  uniforms.uArena.value.set(fm ? 24 : 0, fm ? 24 : 0, fm ? fm.r : -1);
  const boss = fm && world.entities.find((e) => e.skin === 'plague_ferryman');
  if (boss && fm) {
    if (!bossBoat) group.add((bossBoat = boat()));
    const aground = fm.r < 1.5; // 배 둘레만 물이 남았다
    sink = boss.state === 'dead' && !aground ? sink + 1 / 60 : 0;
    bossBoat.visible = sink < 3;
    bossBoat.position.set(boss.x, (aground ? Y - 0.16 : Y - 0.06 + Math.sin(time * 1.8) * 0.02) - sink * 0.2, boss.z);
    bossBoat.rotation.set(aground ? 0.12 : sink * 0.25, boss.facing - Math.PI / 2, sink * 0.12);
    // 결전장 바퀴: 처음 볼 때 만들고, 물이 빠지는 동안 돌고, 부서진 것은 살이 꺾여 기운다
    if (!lakeWheels.length)
      for (const id of fm.ids) {
        const ch = world.chests[id];
        const v = waterWheel(ch.x, ch.z);
        group.add(v.root);
        lakeWheels.push({ ...v, spin: 0 });
      }
    lakeWheels.forEach((v, k) => {
      const broken = fm.wheels[k] > 0;
      if (fm.phase === 'drain' && fm.wheels[k] === fm.broke) v.spin += 0.12;
      v.wheel.rotation.z = v.spin;
      v.wheel.rotation.x = broken ? 0.9 : 0; // 부서진 바퀴는 앞으로 꺾여 늘어진다
      v.wheel.position.y = broken ? 0.55 : 0.85;
    });
  }
  const i = Math.floor(hero.z) * world.grid.w + Math.floor(hero.x);
  uniforms.uHero.value.set(hero.x, hero.z, world.grid.slow?.[i] ? 1 : 0);
  // 배 자리: 탄 줄은 s만큼 간 자리(빈 배는 맞은편에서 엇갈려 온다 — 스칠 때 옆으로 비켜 간다), 나머지 줄은 양쪽 나루
  const ride = world.ride;
  let n = 0;
  for (const v of uniforms.uBoats.value) v.set(-99, -99, 0, 0);
  if (boss && bossBoat?.visible) uniforms.uBoats.value[n++].set(boss.x, boss.z, boss.state === 'dead' ? 0 : Math.sin(boss.facing) * 1.9, boss.state === 'dead' ? 0 : Math.cos(boss.facing) * 1.9);
  world.ferries.forEach((f, line) => {
    const [p, q] = ride?.line === line && ride.from ? [f.b, f.a] : [f.a, f.b];
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const [ux, uz] = [(q[0] - p[0]) / len, (q[1] - p[1]) / len];
    const k = ride?.line === line ? ride.s / len : 0;
    const moving = ride?.line === line && k < 1;
    const side = moving ? Math.sin(Math.PI * k) * 0.9 : 0;
    const spots: [number, number, number][] = [
      [p[0] + ux * len * k, p[1] + uz * len * k, 1],
      [q[0] - ux * len * k - uz * side, q[1] - uz * len * k + ux * side, -1],
    ];
    const face = Math.atan2(f.b[0] - f.a[0], f.b[1] - f.a[1]) - Math.PI / 2; // 뱃머리(등불)는 늘 a → b 쪽: 내릴 때 배가 돌아 보이지 않게
    spots.forEach(([x, z, dir], j) => {
      const b = boats[line * 2 + j];
      if (!b) return;
      b.position.set(x, low ? Y - 0.16 : Y - 0.06 + Math.sin(time * 1.8 + line * 2 + j) * 0.025, z); // 물이 낮으면 바닥에 걸려 기운다
      b.rotation.set(low ? 0.12 : Math.sin(time * 1.3 + j) * 0.03, face, 0);
      const go = ride ? Math.sign(ride.to - ride.s) * 2.5 : 0; // 선 배는 물결을 끌지 않는다, 물러서면 거꾸로
      if (moving && n < BOATS) uniforms.uBoats.value[n++].set(x, z, ux * dir * go, uz * dir * go);
      else if (n < BOATS && Math.hypot(x - hero.x, z - hero.z) < 16) uniforms.uBoats.value[n++].set(x, z, 0, 0);
    });
  });
}

// 맵이 바뀔 때. 물이 없으면 null
export function buildWater(world: World): THREE.Group | null {
  if (group) {
    group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
    uniforms.uMask.value?.dispose();
    uniforms.uBlack.value?.dispose();
    group = null;
    boats = [];
    wheels = [];
    wells = [];
    puddles = [];
    fill = null;
    bossBoat = null;
    lakeWheels = [];
  }
  if (world.mine || world.warp) return null; // 광산·뒤틀린 차원의 허공(막힘 값 2)은 물이 아니다(abyss.ts, 차원의 물웅덩이는 warp.ts)
  const { w, h, blocked } = world.grid;
  const shallow = new Set(world.fords.map(([x, z]) => z * w + x)); // 여울·물길·모래톱(물길이 빠지면 여울로 보인다)
  const plank = new Set(world.planks.map(([x, z]) => z * w + x)); // 다리·나루 판자 밑도 물
  const wet = (i: number) => blocked[i] === 2 || shallow.has(i) || plank.has(i);
  const ford = (i: number) => shallow.has(i) && blocked[i] !== 2;
  if (!blocked.some((_, i) => wet(i))) return null;
  const black = new Uint8Array(w * h * 4);
  const blackCells = (world.sluice?.segs.slice(0, 5) ?? []).flat().map(([x, z]) => z * w + x);
  const barCells = (world.sluice?.segs[7] ?? []).map(([x, z]) => z * w + x);
  // 물가에서의 거리(칸, 4방향): 물 쪽은 물이 아닌 칸에서, 땅 쪽은 물 칸에서
  const reach = (from: (i: number) => boolean) => {
    const dist = new Int32Array(w * h).fill(-1);
    const q: number[] = [];
    for (let i = 0; i < w * h; i++) if (from(i)) (dist[i] = 0), q.push(i);
    for (let k = 0; k < q.length; k++) {
      const i = q[k];
      const [x, z] = [i % w, Math.floor(i / w)];
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const [nx, nz] = [x + dx, z + dz];
        if (nx < 0 || nz < 0 || nx >= w || nz >= h || dist[nz * w + nx] >= 0) continue;
        dist[nz * w + nx] = dist[i] + 1;
        q.push(nz * w + nx);
      }
    }
    return dist;
  };
  const data = new Uint8Array(w * h * 4);
  const texture = (d: Uint8Array) => {
    const t = new THREE.DataTexture(d, w, h, THREE.RGBAFormat);
    t.magFilter = t.minFilter = THREE.LinearFilter;
    t.needsUpdate = true;
    return t;
  };
  const mask = texture(data);
  const blackTex = texture(black);
  // 칸 상태가 바뀔 때마다(물길이 차고 빠짐) 다시 채운다
  fill = () => {
    const deep = reach((i) => !wet(i));
    const dry = reach(wet);
    data.fill(0);
    for (let i = 0; i < w * h; i++) {
      data[i * 4 + 3] = Math.round((Math.min(dry[i], LAND) / LAND) * 255);
      if (!wet(i)) continue;
      data[i * 4] = 255;
      data[i * 4 + 1] = ford(i) ? 0 : Math.round((Math.min(deep[i], DEEP) / DEEP) * 255);
      data[i * 4 + 2] = ford(i) ? 255 : 0;
    }
    black.fill(0);
    for (const i of blackCells) black[i * 4 + (blocked[i] === 2 ? 0 : 1)] = 255; // R = 검은 물, G = 물이 빠진 물길 바닥(진흙)
    for (const i of barCells) if (blocked[i] !== 2) black[i * 4 + 1] = 255; // 드러난 모래톱
    mask.needsUpdate = blackTex.needsUpdate = true;
  };
  fill();
  maskVer = world.sluice?.ver ?? -1;
  uniforms.uMask.value = mask;
  uniforms.uBlack.value = blackTex;
  uniforms.uSize.value.set(w, h);
  group = new THREE.Group();
  const plane = (y: number, mat: THREE.Material) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h).rotateX(-Math.PI / 2), mat);
    m.position.set(w / 2, y, h / 2);
    group!.add(m);
    return m;
  };

  // 물면
  const water = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.52, metalness: 0 });
  water.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, uniforms);
    VERT(s);
    s.fragmentShader = s.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
${COMMON}
// 잔물결 높이: 방향이 다른 물결 셋 + 느리게 흐르는 얼룩
float ripple(vec2 p) {
  return 0.5 * sin(p.x * 3.1 + uTime * 1.3) + 0.4 * sin(p.y * 2.7 - uTime * 1.1) + 0.3 * sin((p.x + p.y) * 4.3 + uTime * 1.9) + 0.6 * noise2(p * 1.7 + uTime * 0.25);
}
// 연잎: 0.8m 칸마다 하나(무리 지은 곳에서만), 한쪽이 파인 동그라미. 돌려주는 것 = [잎인가, 잎 가장자리, 꽃]
vec3 lily(vec2 wp, float depth) {
  if (depth < 0.15 || depth > 0.8 || noise2(wp * 0.22 + 3.7) < 0.56) return vec3(0.0);
  vec2 c = floor(wp / 0.8);
  if (hash2(c) < 0.35) return vec3(0.0);
  vec2 o = (c + 0.25 + 0.5 * vec2(hash2(c + 1.3), hash2(c + 7.1))) * 0.8 + 0.03 * vec2(sin(uTime * 0.7 + hash2(c) * 6.0), cos(uTime * 0.6 + hash2(c) * 5.0));
  vec2 d = wp - o;
  float r = 0.16 + 0.1 * hash2(c + 2.9);
  float a = atan(d.y, d.x) - hash2(c + 4.4) * 6.283;
  float notch = step(0.0, cos(a)) * step(abs(sin(a)), 0.18); // 파인 쐐기
  float leaf = step(length(d), r) * (1.0 - notch);
  return vec3(leaf, leaf * smoothstep(r * 0.7, r, length(d)), step(0.88, hash2(c + 9.2)) * step(length(d - vec2(r * 0.25, -r * 0.2)), 0.05));
}
// 배 둘레 물결(서 있으면 둥근 물결, 가면 뒤로 V자 물살)과 여울을 걷는 주인공 둘레 동그란 물결
float wake(vec2 wp) {
  float f = 0.0;
  for (int i = 0; i < ${BOATS}; i++) {
    vec4 b = uBoats[i];
    vec2 d = wp - b.xy;
    float sp = length(b.zw);
    vec2 u = sp > 0.01 ? b.zw / sp : vec2(1.0, 0.0);
    float along = dot(d, u), lat = dot(d, vec2(-u.y, u.x));
    float hull = length(vec2(along / 1.15, lat / 0.55)); // 배 둘레(타원)
    f += smoothstep(0.12, 0.0, abs(hull - 1.08 - 0.06 * sin(uTime * 3.0 + hull * 6.0))) * 0.4;
    if (sp > 0.01 && along < -0.6) { // 뒤로 벌어지는 물살 둘
      float back = -along - 0.6;
      f += smoothstep(0.08 + back * 0.05, 0.0, abs(abs(lat) - 0.45 - back * 0.4)) * exp(-back * 1.3) * (0.6 + 0.4 * sin(back * 9.0 - uTime * 9.0));
    }
  }
  float hd = length(wp - uHero.xy);
  f += uHero.z * smoothstep(1.6, 0.2, hd) * smoothstep(0.25, 0.0, abs(fract(hd * 1.6 - uTime * 1.2) - 0.5) - 0.3) * 0.8;
  return f;
}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
vec2 wp = vWater.xz;
vec4 m = maskAt(wp);
float edge = waterEdge(wp, m);
if (edge < 0.5) discard;
float ar = arenaIn(wp);
if (ar < 0.0) discard;
float deep = smoothstep(0.0, 1.0, m.g) * smoothstep(0.0, 3.0, ar);
// 해가 세서(낮 지역) 물빛은 어둡게: 물가 = 탁한 청록, 가운데 = 거의 검은 남색. 하늘빛이 비친 얼룩이 천천히 흐른다
vec3 col = mix(vec3(0.05, 0.15, 0.15), vec3(0.008, 0.03, 0.06), deep);
col = mix(col, vec3(0.1, 0.2, 0.17), m.b * 0.8); // 여울: 얕고 흙탕
vec4 bt = texture2D(uBlack, wp / uSize);
float blk = bt.r; // 검은 물(역병): 보랏빛 검정에 느리게 흐르는 기름 무늬
float bed = bt.g; // 물이 빠진 물길: 젖은 진흙 바닥에 고인 물 몇 점(걸어 건널 수 있다)
col = mix(col, vec3(0.03, 0.008, 0.035) + vec3(0.06, 0.0, 0.07) * smoothstep(0.55, 0.85, noise2(wp * vec2(1.3, 0.5) + uTime * 0.35)), blk);
col *= 0.85 + 0.3 * noise2(wp * 0.6 + uTime * 0.05);
col += vec3(0.03, 0.04, 0.05) * smoothstep(0.62, 0.9, noise2(wp * vec2(0.18, 0.5) + vec2(uTime * 0.03, 0.0))) * (1.0 - m.b);
// 물가: 바로 안쪽은 젖은 그늘, 그 끝에 가는 물거품 줄이 밀려왔다 빠진다
float shore = max(1.0 - smoothstep(0.5, 0.64, edge), 1.0 - smoothstep(0.0, 0.45, ar)); // 결전 물이 빠지고 찰 때도 그 가장자리에 물거품
float lap = 0.5 + 0.5 * sin(uTime * 1.6 - m.r * 9.0 + noise2(wp * 2.0) * 4.0);
float foam = smoothstep(0.55, 1.0, shore) * lap + wake(wp);
col *= 1.0 - shore * 0.35;
col = mix(col, mix(vec3(0.55, 0.62, 0.6), vec3(0.35, 0.42, 0.16), blk), clamp(foam, 0.0, 1.0) * 0.55); // 검은 물의 거품은 누런 녹색
col = mix(col, mix(vec3(0.16, 0.12, 0.075), vec3(0.04, 0.07, 0.08), step(0.72, noise2(wp * 1.9))) * (0.8 + 0.35 * noise2(wp * 5.0)), bed);
vec3 lf = lily(wp, m.g * (1.0 - m.b) * (1.0 - step(0.1, blk)));
col = mix(col, mix(vec3(0.16, 0.3, 0.1), vec3(0.08, 0.17, 0.06), lf.y), lf.x);
col = mix(col, vec3(0.95, 0.6, 0.75), lf.z);
float pad = max(lf.x, 0.0);
diffuseColor.rgb = col;`,
      )
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
{
  float e = 0.05;
  float h0 = ripple(wp);
  float k = 0.1 * (1.0 - pad) * (1.0 - bed); // 연잎·진흙 바닥은 판판하다
  vec3 nW = normalize(vec3(-(ripple(wp + vec2(e, 0.0)) - h0) / e * k, 1.0, -(ripple(wp + vec2(0.0, e)) - h0) / e * k));
  normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
}`,
      );
  };
  plane(Y, water).receiveShadow = true;

  // 물가 둑: 물이 비운 물 칸 자리(바닥 칸이 없다)는 진흙 둑, 둘레 땅은 물에서 멀어질수록 옅어지는 젖은 흙빛
  const bank = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, transparent: true, depthWrite: false });
  bank.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, uniforms);
    VERT(s);
    s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>\n${COMMON}`).replace(
      '#include <color_fragment>',
      `#include <color_fragment>
vec2 wp = vWater.xz;
vec4 m = maskAt(wp);
if (waterEdge(wp, m) >= 0.5 && arenaIn(wp) >= 0.0) discard; // 결전 물이 빠진 호수 바닥은 진흙으로 그린다
float inWater = texture2D(uMask, (floor(wp) + 0.5) / uSize).r;
float land = m.a + (noise2(wp * 1.7) - 0.5) * 0.18;
float a = max(inWater, (1.0 - smoothstep(0.04, 0.5, land)) * 0.7);
if (a < 0.01) discard;
vec3 col = mix(vec3(0.05, 0.045, 0.03), vec3(0.09, 0.1, 0.06), smoothstep(0.0, 0.45, land)) * (0.8 + 0.4 * noise2(wp * 4.0)); // 풀보다 어두운 젖은 흙
diffuseColor = vec4(col, a);`,
    );
  };
  plane(0.01, bank).receiveShadow = true;

  // 물안개: 물 위에 낮게, 두 겹의 얼룩이 엇갈려 흐른다
  const mist = new THREE.MeshBasicMaterial({ color: 0xc4d4d0, transparent: true, depthWrite: false });
  mist.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, uniforms);
    VERT(s);
    s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>\n${COMMON}`).replace(
      '#include <color_fragment>',
      `#include <color_fragment>
vec2 wp = vWater.xz;
float over = smoothstep(0.3, 1.0, maskAt(wp).r) * step(0.0, arenaIn(wp));
float fog = noise2(wp * 0.16 + vec2(uTime * 0.05, uTime * 0.02)) * noise2(wp * 0.37 - vec2(uTime * 0.03, -uTime * 0.04));
diffuseColor.a = over * smoothstep(0.2, 0.55, fog) * 0.14;`,
    );
  };
  plane(0.45, mist).renderOrder = 2;

  // 수문 바퀴: 나무 기둥 + 세운 바퀴(바퀴살 넷)
  for (const g of world.sluice?.gates ?? []) {
    const { root, wheel } = waterWheel(g.x, g.z);
    group.add(root);
    const [ax, az] = g.aim[g.to];
    wheels.push({ wheel, spin: 0, aim: Math.atan2(ax - g.x - 0.5, az - g.z - 0.5) + (g.key === '8' && !g.to ? Math.PI : 0) });
  }
  // 우물: 돌 둘레 + 물(더러우면 보랏빛 검정)
  for (const wl of world.sluice?.wells ?? []) {
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.55, 0.55, 16, 1, true), new THREE.MeshStandardMaterial({ color: 0x77736a, roughness: 0.95, side: THREE.DoubleSide }));
    ring.position.set(wl.x, 0.27, wl.z);
    ring.castShadow = true;
    const water = new THREE.MeshStandardMaterial({ color: 0x1d4a5a, roughness: 0.3 });
    const top = new THREE.Mesh(new THREE.CircleGeometry(0.44, 16).rotateX(-Math.PI / 2), water);
    top.position.set(wl.x, 0.42, wl.z);
    wells.push(water);
    group.add(ring, top);
  }
  // 나룻배: 줄마다 둘
  for (let k = 0; k < world.ferries.length * 2; k++) {
    const b = boat();
    boats.push(b);
    group.add(b);
  }
  return group;
}

// 수문 바퀴: 나무 기둥 + 세운 바퀴(바퀴살 넷). 칸 (x, z)
function waterWheel(x: number, z: number): { root: THREE.Group; wheel: THREE.Group } {
  const wood = new THREE.MeshStandardMaterial({ color: 0x5a3c22, roughness: 0.85 });
  const root = new THREE.Group();
  root.position.set(x + 0.5, 0, z + 0.5);
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.9, 0.16), wood);
  post.position.y = 0.45;
  const wheel = new THREE.Group();
  wheel.position.set(0, 0.85, 0.12);
  wheel.add(new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.04, 6, 18), wood));
  for (let k = 0; k < 4; k++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.04, 0.04), wood);
    spoke.rotation.z = (k * Math.PI) / 4;
    wheel.add(spoke);
  }
  wheel.rotation.y = Math.PI / 4; // 카메라 쪽을 본다
  for (const m of [post, ...wheel.children]) (m as THREE.Mesh).castShadow = true;
  root.add(post, wheel);
  return { root, wheel };
}

// 나무 배 한 척(길이 1.9m, 폭 0.8m): 둘레 판(가운데가 빈 뱃전) + 바닥 + 뱃머리 등불. +x가 뱃머리
function boat(): THREE.Group {
  const g = new THREE.Group();
  const hull = (s: number) => {
    const p = new THREE.Shape();
    p.moveTo(-0.95 * s, 0);
    p.quadraticCurveTo(-0.75 * s, 0.4 * s, 0, 0.4 * s);
    p.quadraticCurveTo(0.7 * s, 0.4 * s, 0.98 * s, 0);
    p.quadraticCurveTo(0.7 * s, -0.4 * s, 0, -0.4 * s);
    p.quadraticCurveTo(-0.75 * s, -0.4 * s, -0.95 * s, 0);
    return p;
  };
  const outer = hull(1);
  outer.holes.push(new THREE.Path(hull(0.86).getPoints(24).reverse()));
  const side = new THREE.Mesh(new THREE.ExtrudeGeometry(outer, { depth: 0.3, bevelEnabled: false, curveSegments: 12 }).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x4a3120, roughness: 0.85 }));
  const floor = new THREE.Mesh(new THREE.ShapeGeometry(hull(0.88), 12).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x6e5134, roughness: 0.9 }));
  floor.position.y = 0.1;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.55), new THREE.MeshStandardMaterial({ color: 0x3a2618 }));
  post.position.set(0.75, 0.42, 0);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshStandardMaterial({ color: 0x302010, emissive: 0xffc070, emissiveIntensity: 2.2 }));
  lamp.position.set(0.75, 0.72, 0);
  for (const m of [side, floor, post]) (m.castShadow = true), (m.receiveShadow = true);
  g.add(side, floor, post, lamp);
  return g;
}
