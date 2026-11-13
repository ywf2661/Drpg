// 마나 방패 연출: 주인공을 감싼 푸른 막(가장자리가 빛나는 타원체, 위로 흐르는 물결) + 발밑에서 도는 룬 고리.
// 쓰면 튀어나오듯 커지고, 피해를 흡수할 때마다 번쩍이며 흔들리고, 남은 흡수량만큼 옅어지고, 끝나 갈 때 깜빡인다.
// 깨지면(피해로 0) 부풀며 터지고 파편이 튄다. 시간이 다 되면 사그라든다
import * as THREE from 'three';
import type { World } from '../sim/world';

const COLOR = new THREE.Color(0x4fa6ff);
const SHARDS = 28;
const BURST = 0.35; // 깨지거나 사그라드는 시간(초)
const WARN = 1.5; // 남은 시간이 이보다 적으면 깜빡인다(초)

const bubbleMat = new THREE.ShaderMaterial({
  uniforms: { color: { value: COLOR }, strength: { value: 0 }, flash: { value: 0 }, time: { value: 0 } },
  vertexShader: /* glsl */ `
    varying vec3 vN;
    varying float vY;
    void main() {
      vN = normalize(normalMatrix * normal);
      vY = position.y;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  // 직교 카메라라 시선은 늘 (0, 0, 1): 가장자리(시선과 직각)일수록 밝다
  fragmentShader: /* glsl */ `
    uniform vec3 color;
    uniform float strength;
    uniform float flash;
    uniform float time;
    varying vec3 vN;
    varying float vY;
    void main() {
      float rim = pow(1.0 - abs(vN.z), 2.0);
      float wave = pow(0.5 + 0.5 * sin(vY * 14.0 - time * 5.0), 10.0) * 0.5;
      float a = (0.05 + rim * 0.95 + wave * (0.3 + rim)) * strength + flash * (0.25 + rim * 0.6);
      gl_FragColor = vec4(mix(color, vec3(1.0), flash * 0.6 + rim * 0.1), a);
    }`,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});
const bubble = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 18), bubbleMat);
bubble.renderOrder = 3;

// 발밑 룬 고리(한 번만 그린다): 바깥·안쪽 고리와 그 사이의 룬 획
function runeTexture(): THREE.CanvasTexture {
  const S = 128;
  const h = S / 2;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.strokeStyle = 'rgba(170,220,255,1)';
  g.lineWidth = 3;
  g.beginPath();
  g.arc(h, h, h - 4, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 2;
  g.beginPath();
  g.arc(h, h, h - 22, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 2.5;
  for (let k = 0; k < 12; k++) {
    // 룬 획: 칸마다 모양을 바꾼 짧은 꺾은선
    const a = (k / 12) * Math.PI * 2;
    const at = (r: number, da: number) => [h + Math.cos(a + da) * r, h + Math.sin(a + da) * r] as const;
    const pts = [
      [at(h - 18, -0.12), at(h - 8, -0.04), at(h - 18, 0.06)],
      [at(h - 8, -0.1), at(h - 18, 0), at(h - 8, 0.1)],
      [at(h - 18, -0.08), at(h - 8, -0.08), at(h - 8, 0.08)],
    ][k % 3];
    g.beginPath();
    g.moveTo(...pts[0]);
    for (const p of pts.slice(1)) g.lineTo(...p);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const runeMat = new THREE.MeshBasicMaterial({ color: COLOR, transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending });
const rune = new THREE.Mesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), runeMat);
rune.renderOrder = 1;

const shardPos = new Float32Array(SHARDS * 3);
const shardVel = new Float32Array(SHARDS * 3);
const shardGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(shardPos, 3));
const shardMat = new THREE.PointsMaterial({ color: 0xbfe6ff, size: 3, sizeAttenuation: false, transparent: true, depthWrite: false, toneMapped: false });
const shards = new THREE.Points(shardGeo, shardMat);
shards.renderOrder = 3;
shards.frustumCulled = false;

export const wardFx = new THREE.Group().add(bubble, rune, shards);

// 상태: on = 방패가 있다, popT = 생긴 뒤 시간, endT = 사라진 뒤 시간(BURST까지 그린다), broke = 깨져서 사라졌다
const st = { on: false, hp: 0, max: 1, popT: 0, endT: BURST, broke: false, flash: 0, warn: false, time: 0, x: 0, z: 0, shardT: 1 };

export function resetWard() {
  Object.assign(st, { on: false, hp: 0, endT: BURST, flash: 0, shardT: 1 });
  wardFx.visible = false;
  if (!runeMat.map) runeMat.map = runeTexture();
}

// 매 프레임 sim 상태를 읽는다(생김·흡수·깨짐·끝남)
export function syncWard(w: World) {
  const hero = w.entities[0];
  const on = w.wardHp > 0 && hero.state !== 'dead';
  [st.x, st.z] = [hero.x, hero.z];
  if (on && (!st.on || w.wardHp > st.hp)) Object.assign(st, { max: w.wardHp, popT: 0, flash: 0.6 }); // 새로 씀
  else if (on && w.wardHp < st.hp) st.flash = 1; // 흡수
  if (st.on && !on) {
    st.endT = 0;
    st.broke = w.wardT > 0 && hero.state !== 'dead'; // 시간이 남았는데 0 = 피해로 깨짐
    if (st.broke) {
      st.flash = 1;
      st.shardT = 0;
      for (let i = 0; i < SHARDS; i++) {
        const a = (i / SHARDS) * Math.PI * 2 + Math.sin(i * 12.9) * 0.3;
        const sp = 2.5 + (0.5 + 0.5 * Math.sin(i * 78.2)) * 3;
        shardPos.set([hero.x + Math.cos(a) * 0.6, 0.4 + (0.5 + 0.5 * Math.sin(i * 3.7)) * 1.2, hero.z + Math.sin(a) * 0.6], i * 3);
        shardVel.set([Math.cos(a) * sp, 1 + (0.5 + 0.5 * Math.sin(i * 5.3)) * 3, Math.sin(a) * sp], i * 3);
      }
    }
  }
  st.on = on;
  st.hp = w.wardHp;
  st.warn = on && w.wardT < WARN;
}

export function updateWard(dt: number) {
  st.time += dt;
  st.popT += dt;
  st.flash = Math.max(0, st.flash - dt * 4);
  if (!st.on) st.endT += dt;
  const ending = !st.on && st.endT < BURST;
  wardFx.visible = st.on || ending || st.shardT < 1;
  if (!wardFx.visible) return;
  // 크기: 생길 때 튀어나왔다 자리 잡고, 맞으면 흔들리고, 깨지면 부풀고 사그라들면 줄어든다
  let s = 1 - 0.45 * Math.exp(-st.popT * 9) * Math.cos(st.popT * 22) + 0.06 * st.flash * Math.sin(st.time * 60);
  let k = 0.45 + 0.55 * (st.hp / st.max); // 남은 흡수량만큼 진하게
  if (st.warn && Math.sin(st.time * 16) < 0) k *= 0.35; // 끝나 가면 깜빡임
  if (ending) {
    const e = st.endT / BURST;
    s *= st.broke ? 1 + 0.6 * e : 1 - 0.4 * e;
    k = (st.broke ? 1.4 : 0.8) * (1 - e);
  }
  bubble.visible = rune.visible = st.on || ending;
  bubble.position.set(st.x, 0.85, st.z);
  bubble.scale.set(0.72 * s, 1.0 * s, 0.72 * s);
  Object.assign(bubbleMat.uniforms.strength, { value: k });
  bubbleMat.uniforms.flash.value = st.flash;
  bubbleMat.uniforms.time.value = st.time;
  rune.position.set(st.x, 0.03, st.z);
  rune.rotation.y = st.time * 0.8;
  rune.scale.setScalar(0.95 * s);
  runeMat.opacity = Math.min(1, k * 0.9 + st.flash * 0.5);
  // 파편: 날아가다 바닥에 떨어지고 옅어진다
  shards.visible = st.shardT < 1;
  if (!shards.visible) return;
  st.shardT += dt / 0.7;
  const pos = shardGeo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < SHARDS; i++) {
    if (pos.getY(i) <= 0.02) continue;
    shardVel[i * 3 + 1] -= 12 * dt;
    pos.setXYZ(i, pos.getX(i) + shardVel[i * 3] * dt, Math.max(0.02, pos.getY(i) + shardVel[i * 3 + 1] * dt), pos.getZ(i) + shardVel[i * 3 + 2] * dt);
  }
  pos.needsUpdate = true;
  shardMat.opacity = 1 - st.shardT;
}
