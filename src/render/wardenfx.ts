// 시간의 파수꾼 결전장 그림(설계: docs/superpowers/specs/2026-11-26-act2-rift-design.md 5절, 시안 https://claude.ai/artifact/5XxqtzbXxvgoaUUa7CPu7K). sim은 읽기만 한다.
//   문자판: 바닥 위에 시계 눈금(열두 시각 굵게, 분 눈금 가늘게)과 빛 테, 빛나는 짝을 가리키는 커다란 시곗바늘(짝이 바뀌면 째깍 넘어간다)
//   파수꾼 판자: 숨으면 안 보인다. 멈춘 시간·되감기·명멸의 틈은 기술 시트(time_warden_skill), 돌진은 휘두르기 끝 장면.
//     걸을 때는 째깍 걸음 — 그림 자리를 박자(BEAT초)마다 툭 옮긴다(시트 세로 한계로 키는 판자를 키워 3m)
//   잔상: 같은 시트를 푸른 빛으로 더한 반투명 판자, sim의 0.5초 전 모습 그대로(숨은 동안에도 보인다)
//   찢어진 틈: 허공이 세로로 찢어진다 — 위가 넓고 아래로 뾰족한 검은 틈, 안에 떠오르는 수정 부스러기, 가장자리에 위로 일렁이는 보랏빛 불꽃(셰이더)
//   멈춘 시간: 푸르스름한 원판 + 째깍이는 눈금 테
import * as THREE from 'three';
import mainInfo from '../assets/sprites/time_warden.json';
import mainUrl from '../assets/sprites/time_warden.png';
import skillInfo from '../assets/sprites/time_warden_skill.json';
import skillUrl from '../assets/sprites/time_warden_skill.png';
import { cardGeometry, dirIndex, frameAt, loadSheet, type SheetInfo, type Sprite } from './sprites';
import { WARDEN, wardenState, type WardenAnim } from '../sim/warden';
import { DIAL, hourDir } from '../sim/warpmap';
import { closeMarks, stitchState } from '../sim/stitch';
import type { Entity, World } from '../sim/world';
import { PAIR_COLORS } from './warp';

export const wardenGroup = new THREE.Group();
const BEAT = 0.46; // 째깍 걸음 박자(초) — tools/boss3d/time_warden.js 걸음 4박 = 1.1초 시트와 맞춘 것
const STEP = 0.09; // 한 박자에 툭 나가는 시간(초)
export const WARDEN_SIZE = 1.35; // 판자 배율(키 약 3m)
const GHOST = new THREE.Color(0.45, 0.7, 1.5);

type Sheet = { info: SheetInfo; tex: THREE.Texture; geo: THREE.BufferGeometry };
let sheets: { main: Sheet; skill: Sheet } | null = null;
void Promise.all([loadSheet(mainUrl), loadSheet(skillUrl)]).then(([a, b]) => {
  sheets = { main: { info: mainInfo as SheetInfo, tex: a, geo: cardGeometry(mainInfo as SheetInfo) }, skill: { info: skillInfo as SheetInfo, tex: b, geo: cardGeometry(skillInfo as SheetInfo) } };
});

// 판자에 시트 한 칸을 건다(필요하면 시트를 바꿔 끼운다)
function show(mesh: THREE.Mesh, mat: THREE.MeshBasicMaterial, sh: Sheet, clip: string, f: number, facing: number) {
  if (mesh.geometry !== sh.geo) mesh.geometry = sh.geo;
  if (mat.map?.source !== sh.tex.source) {
    mat.map = sh.tex.clone();
    mat.map.repeat.set(1 / sh.info.cols, 1 / sh.info.rows);
    mat.needsUpdate = true;
  }
  const c = sh.info.anims[clip];
  const row = c.row + dirIndex(facing);
  mat.map!.offset.set(Math.min(f, c.frames - 1) / sh.info.cols, 1 - (row + 1) / sh.info.rows);
}
// sim 동작 → (시트, 동작, 프레임). k = 동작 진행도, t = 걷기·서기 시간
function pick(anim: WardenAnim, k: number, t: number): [keyof NonNullable<typeof sheets>, string, number] | null {
  const S = sheets!;
  const at = (sh: Sheet, clip: string, kk: number) => Math.floor(Math.min(0.999, Math.max(0, kk)) * sh.info.anims[clip].frames);
  if (anim === 'cast' || anim === 'rewind' || anim === 'blink') return ['skill', anim, at(S.skill, anim, k)];
  if (anim === 'dash') return ['main', 'attack', at(S.main, 'attack', 0.55 + 0.45 * k)]; // 휘두르기 끝(칼이 지나간 뒤) 자세로 미끄러진다
  if (anim === 'attack') return null; // 시계바늘 베기는 updateSprite가 휘두르기 진행도로
  if (anim === 'hidden') return ['main', 'move', frameAt(S.main.info.anims.move, t)];
  return ['main', anim, frameAt(S.main.info.anims[anim], t)];
}

// ---- 찢어진 틈 셰이더 ----
const TEAR_W = 3.2;
const TEAR_H = 4.4;
export const tearGeo = new THREE.PlaneGeometry(TEAR_W, TEAR_H).translate(0, TEAR_H / 2 - 0.15, 0);
// 두 겹: glow = false면 검은 틈 안쪽만(일반 섞기), true면 바깥 불꽃·테만(빛을 더한다). 같은 uniforms를 쓴다
export const tearMat = (uniforms: Record<string, THREE.IUniform>, glow: boolean) =>
  new THREE.ShaderMaterial({
    uniforms,
    defines: glow ? { GLOW: 1 } : {},
    blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending,
    transparent: true,
    depthWrite: false,
    depthTest: false, // 파수꾼이 걸어 들어가고 튀어나오는 틈: 판자 위에 덮는다
    toneMapped: false,
    side: THREE.DoubleSide,
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform float uOpen, uTime, uSeed; varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7)) + uSeed) * 43758.5453); }
      float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
      float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
      void main() {
        float y = vUv.y, x = (vUv.x - 0.5) * ${(TEAR_W / TEAR_H).toFixed(3)} * 2.0; // x: 높이와 같은 눈금
        // 틈의 반폭: 아래로 뾰족, 위가 넓고 꼭대기에서 둥글게 닫힌다 + 들쭉날쭉한 가장자리
        float prof = pow(clamp(y, 0.0, 1.0), 0.85) * smoothstep(1.0, 0.78, y);
        float hw = uOpen * (0.22 * prof + (noise(vec2(y * 22.0, 5.0)) - 0.5) * 0.06 * prof);
        float d = abs(x) - hw; // 안쪽이면 음수
        #ifdef GLOW
        if (d < 0.0) discard;
        #else
        if (d >= 0.0) discard;
        #endif
        if (d < 0.0) {
          vec3 c = mix(vec3(0.01, 0.0, 0.03), vec3(0.09, 0.03, 0.16), y * 0.7);
          // 떠오르는 수정 부스러기
          vec2 g = vec2(x * 34.0, y * 26.0 - uTime * 2.2);
          float s = step(0.9, hash(floor(g))) * smoothstep(0.45, 0.0, length(fract(g) - 0.5));
          c += s * vec3(0.55, 0.5, 1.0);
          c += vec3(0.5, 0.15, 0.8) * smoothstep(-0.02, 0.0, d); // 안쪽 가장자리가 달아오른다
          gl_FragColor = vec4(c, 1.0);
          return;
        }
        // 바깥: 가장자리에 붙은 밝은 선 + 위로 일렁이는 보랏빛 불꽃
        float f = fbm(vec2(x * 7.0 + uSeed, y * 4.0 - uTime * 3.4)); // 위로 핥아 오르는 불꽃 혀
        float reach = uOpen * (0.1 + 0.42 * prof) * (0.35 + 1.1 * f);
        float flame = clamp(1.0 - d / max(reach, 1e-3), 0.0, 1.0);
        flame = pow(flame, 1.4) * (0.55 + 0.9 * f);
        float rim = exp(-d * 90.0) * uOpen;
        vec3 c = mix(vec3(0.5, 0.12, 1.0), vec3(1.0, 0.55, 1.0), flame * flame) * flame * 1.6 + rim * vec3(1.0, 0.85, 1.0);
        c *= smoothstep(0.0, 0.06, y) * smoothstep(1.0, 0.92, y);
        c += vec3(0.35, 0.1, 0.7) * uOpen * 0.35 * exp(-d * 7.0) * prof; // 바깥 은은한 빛무리
        gl_FragColor = vec4(c, 1.0); // 빛을 더한다(검은 곳은 그대로)
      }`,
  });
const openOf = (age: number) => (age < 0.1 ? age / 0.1 : age < WARDEN.tearOpen ? 1 : Math.max(0, 1 - (age - WARDEN.tearOpen) / (WARDEN.tearOpen * 1.3)));

// ---- 상태 ----
type Fx = {
  world: World;
  dial: THREE.Group | null;
  hand: THREE.Mesh | null;
  handA: number; handFrom: number; handT: number; lit: number;
  ghost: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial } | null;
  tears: Map<number, THREE.Mesh>;
  stops: THREE.Group[];
  shown: [number, number]; from: [number, number]; to: [number, number]; beat: number; stepT: number; t: number; gt: number;
};
let fx: Fx | null = null;

function reset(world: World): Fx {
  wardenGroup.clear();
  return { world, dial: null, hand: null, handA: 0, handFrom: 0, handT: 1, lit: -1, ghost: null, tears: new Map(), stops: [], shown: [0, 0], from: [0, 0], to: [0, 0], beat: 0, stepT: 1, t: 0, gt: 0 };
}

// 시각 h → 바닥 위 각(rotation.y: +z를 그쪽으로)
const yawOf = (h: number) => {
  const [dx, dz] = hourDir(h);
  return Math.atan2(dx, dz);
};

// 문자판 눈금: 캔버스(위 = 12시)에 그려 바닥에 눕힌다
function buildDial(cx: number, cz: number): THREE.Group {
  const g = new THREE.Group();
  const R = DIAL.r;
  const size = 1024;
  const c = Object.assign(document.createElement('canvas'), { width: size, height: size });
  const x = c.getContext('2d')!;
  const k = size / 2 / (R + 0.5);
  x.translate(size / 2, size / 2);
  x.strokeStyle = 'rgba(159,220,255,0.55)';
  x.lineWidth = 0.35 * k;
  x.beginPath();
  x.arc(0, 0, (R - 0.45) * k, 0, Math.PI * 2);
  x.stroke();
  x.lineWidth = 0.08 * k;
  x.beginPath();
  x.arc(0, 0, (R - 3.2) * k, 0, Math.PI * 2);
  x.stroke();
  for (let i = 0; i < 60; i++) {
    const big = i % 5 === 0;
    const a = (i / 60) * Math.PI * 2;
    const [s, co] = [Math.sin(a), -Math.cos(a)];
    x.strokeStyle = big ? 'rgba(220,238,255,0.6)' : 'rgba(159,220,255,0.35)';
    x.lineWidth = (big ? 0.32 : 0.1) * k;
    x.beginPath();
    x.moveTo(s * (R - 0.9) * k, co * (R - 0.9) * k);
    x.lineTo(s * (R - (big ? 2.8 : 1.6)) * k, co * (R - (big ? 2.8 : 1.6)) * k);
    x.stroke();
  }
  // 가운데 축 둘레 고리
  x.strokeStyle = 'rgba(159,220,255,0.35)';
  x.lineWidth = 0.12 * k;
  for (const r of [2.2, 6]) {
    x.beginPath();
    x.arc(0, 0, r * k, 0, Math.PI * 2);
    x.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const face = new THREE.Mesh(new THREE.PlaneGeometry((R + 0.5) * 2, (R + 0.5) * 2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }));
  face.rotation.y = Math.PI / 4; // 캔버스 위(-z) → 12시 쪽(hourDir(0))
  face.position.set(cx, 0.025, cz);
  face.renderOrder = 1;
  g.add(face);
  return g;
}

// 시곗바늘: 축에서 발판 고리 조금 안쪽까지 뻗은 빛 홈(마름모), +z가 끝
function buildHand(cx: number, cz: number): THREE.Mesh {
  const len = DIAL.pad - 2.4;
  const s = new THREE.Shape();
  s.moveTo(0, -2.2);
  s.lineTo(0.75, 0);
  s.lineTo(0, len);
  s.lineTo(-0.75, 0);
  s.closePath();
  const geo = new THREE.ShapeGeometry(s).rotateX(Math.PI / 2); // 모양의 +y → 바닥의 +z
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: PAIR_COLORS[0], transparent: true, opacity: 0.4, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  m.position.set(cx, 0.03, cz);
  m.renderOrder = 1;
  return m;
}

function stopMesh(): THREE.Group {
  const g = new THREE.Group();
  const flat = (geo: THREE.BufferGeometry, color: number, opacity: number) => {
    const m = new THREE.Mesh(geo.rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }));
    m.renderOrder = 1;
    g.add(m);
    return m;
  };
  flat(new THREE.CircleGeometry(WARDEN.stopR, 40), 0x3a6aff, 0.18);
  flat(new THREE.RingGeometry(WARDEN.stopR - 0.08, WARDEN.stopR, 48), 0x9fdcff, 0.8);
  const ticks = new THREE.Group();
  for (let i = 0; i < 12; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.4).rotateX(-Math.PI / 2).translate(0, 0, WARDEN.stopR - 0.35), new THREE.MeshBasicMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false }));
    m.rotation.y = (i / 12) * Math.PI * 2;
    m.renderOrder = 1;
    ticks.add(m);
  }
  ticks.name = 'ticks';
  g.add(ticks);
  return g;
}

// 매 프레임(판자 다음): 문자판·바늘·잔상·틈·멈춘 시간
export function tickWardenFx(time: number, dt: number, world: World, boss: Sprite | null, e: Entity | null) {
  const st = wardenState(world);
  if (!fx || fx.world !== world) fx = reset(world);
  if (!st || !e || !world.warp || !sheets) return;
  const f = fx;
  if (!f.dial) {
    const ps = world.warp.plates;
    const W = world.grid.w;
    const [cx, cz] = [ps.reduce((a, p) => a + (p.cell % W) + 0.5, 0) / ps.length, ps.reduce((a, p) => a + Math.floor(p.cell / W) + 0.5, 0) / ps.length];
    f.dial = buildDial(cx, cz);
    f.hand = buildHand(cx, cz);
    wardenGroup.add(f.dial, f.hand);
  }
  // 바늘: 빛나는 짝의 두 시각 사이를 가리킨다. 짝이 바뀌면 0.25초에 째깍 넘어가며 살짝 떨린다
  if (st.lit !== f.lit) {
    [f.handFrom, f.handT] = [f.lit < 0 ? yawOf(DIAL.hours[st.lit * 2] + 0.5) : f.handA, 0];
    f.lit = st.lit;
  }
  f.handT += dt;
  const target = yawOf(DIAL.hours[st.lit * 2] + 0.5);
  let diff = target - f.handFrom;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  const k = Math.min(1, f.handT / 0.25);
  f.handA = f.handFrom + diff * k * k + (k >= 1 ? 0.04 * Math.sin((f.handT - 0.25) * 40) * Math.exp(-(f.handT - 0.25) * 8) : 0);
  const hand = f.hand!;
  hand.rotation.y = f.handA;
  const hm = hand.material as THREE.MeshBasicMaterial;
  hm.color.setHex(PAIR_COLORS[st.lit]);
  hm.opacity = st.weakT > 0 ? 0.25 : 0.4 + 0.12 * Math.sin(time * 3);
  // 엔딩: 꿰매는 동안엔 바늘을 숨기고(무늬와 헷갈리지 않게), ⑥ 틈이 닫히고 흉터가 흘러간 뒤 다시 나타나 한 시간씩 째깍 돈다
  const ss = stitchState(world);
  if (ss) {
    const M = closeMarks();
    hand.visible = ss.phase === 'closed' || (ss.phase === 'closing' && ss.closeT >= M.scar);
    if (hand.visible) {
      const n = ss.phase === 'closed' ? Math.floor(time * 2) : Math.floor((ss.closeT - M.scar) / 0.5) + 1;
      hand.rotation.y = yawOf(n);
      hm.color.setHex(0xeaf6ff);
      hm.opacity = 0.55;
    }
  } else hand.visible = true;

  // 파수꾼 판자
  if (boss) {
    const now = st.frames.at(-1);
    const dead = e.state === 'dead';
    boss.mesh.scale.setScalar(WARDEN_SIZE);
    if (st.hidden && !dead) boss.mesh.visible = false;
    if (!dead && now) {
      f.t += dt;
      const p = pick(now.anim, now.k, f.t);
      if (p) show(boss.mesh, boss.mat, sheets[p[0]], p[1], p[2], e.facing);
      else updateFrameBack(boss, e);
    } else if (dead && boss.mesh.geometry !== sheets.main.geo) show(boss.mesh, boss.mat, sheets.main, 'die', 0, e.facing);
    // 째깍 걸음: 걷는 동안 그림 자리는 박자마다 툭 옮긴다
    if (e.state === 'move' && !dead) {
      f.beat += dt;
      if (f.beat >= BEAT) [f.beat, f.from, f.to, f.stepT] = [f.beat - BEAT, [...f.shown], [e.x, e.z], 0];
      f.stepT += dt;
      const ease = 1 - (1 - Math.min(1, f.stepT / STEP)) ** 3;
      f.shown = [f.from[0] + (f.to[0] - f.from[0]) * ease, f.from[1] + (f.to[1] - f.from[1]) * ease];
      boss.mesh.position.x += f.shown[0] - e.x;
      boss.mesh.position.z += f.shown[1] - e.z;
    } else [f.shown, f.beat] = [[e.x, e.z], BEAT];
    // 약점: 금빛 맥동
    if (st.weakT > 0 && !dead) boss.mat.color.lerp(new THREE.Color(1.8, 1.4, 0.5), 0.35 + 0.2 * Math.sin(time * 12));
  }

  // 잔상
  const g = st.ghost;
  if (g && e.state !== 'dead' && boss) {
    if (!f.ghost) {
      const mat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, color: GHOST });
      const mesh = new THREE.Mesh(sheets.main.geo, mat);
      mesh.rotation.y = Math.PI / 4;
      mesh.renderOrder = 3;
      f.ghost = { mesh, mat };
      wardenGroup.add(mesh);
    }
    f.gt += dt;
    const p = pick(g.anim, g.k, f.gt) ?? ['main', 'attack', Math.floor(Math.min(0.999, g.k) * sheets.main.info.anims.attack.frames)];
    show(f.ghost.mesh, f.ghost.mat, sheets[p[0]], p[1], p[2], g.f);
    f.ghost.mesh.position.set(g.x, 0, g.z);
    f.ghost.mesh.scale.setScalar(WARDEN_SIZE);
    f.ghost.mat.opacity = (g.anim === 'hidden' ? 0.75 : 0.5) + 0.1 * Math.sin(time * 9);
    f.ghost.mesh.visible = true;
  } else if (f.ghost) f.ghost.mesh.visible = false;

  // 찢어진 틈
  for (const r of st.tears)
    if (!f.tears.has(r.id)) {
      const u = { uOpen: { value: 0 }, uTime: { value: 0 }, uSeed: { value: (r.id * 7.31) % 10 } };
      const m = new THREE.Mesh(tearGeo, tearMat(u, false));
      const glow = new THREE.Mesh(tearGeo, tearMat(u, true));
      m.add(glow);
      m.position.set(r.x + 0.3, 0, r.z + 0.3); // 파수꾼 바로 앞(카메라 쪽)
      m.rotation.y = Math.PI / 4; // 카메라 쪽
      m.renderOrder = 4;
      glow.renderOrder = 5;
      f.tears.set(r.id, m);
      wardenGroup.add(m);
    }
  for (const [id, m] of f.tears) {
    const r = st.tears.find((q) => q.id === id);
    if (!r) {
      m.removeFromParent();
      (m.material as THREE.Material).dispose();
      ((m.children[0] as THREE.Mesh).material as THREE.Material).dispose();
      f.tears.delete(id);
      continue;
    }
    const u = (m.material as THREE.ShaderMaterial).uniforms;
    u.uOpen.value = openOf(r.age);
    u.uTime.value = time;
  }

  // 멈춘 시간
  while (f.stops.length < st.stops.length) {
    const s = stopMesh();
    f.stops.push(s);
    wardenGroup.add(s);
  }
  f.stops.forEach((s, i) => {
    const p = st.stops[i];
    s.visible = !!p;
    if (!p) return;
    s.position.set(p.x, 0.035, p.z);
    s.getObjectByName('ticks')!.rotation.y = -Math.floor(time * 2) * (Math.PI / 6); // 째깍
    const fade = Math.min(1, p.t / 0.3);
    s.traverse((o) => o instanceof THREE.Mesh && ((o.material as THREE.MeshBasicMaterial).opacity = (o.parent?.name === 'ticks' ? 0.85 : (o.geometry as THREE.BufferGeometry).type === 'RingGeometry' ? 0.8 : 0.18) * fade));
  });
}

// 시계바늘 베기: updateSprite가 원래 시트로 휘두르기 진행도에 맞춰 칸을 고른다 — 다른 시트를 끼웠던 판자만 되돌린 뒤 그 칸을 다시 건다
function updateFrameBack(s: Sprite, e: Entity) {
  const c = sheets!.main.info.anims.attack;
  const fr = Math.min(c.frames - 1, Math.floor((e.attackT / 1.2) * c.frames));
  show(s.mesh, s.mat, sheets!.main, 'attack', fr, e.facing);
}
