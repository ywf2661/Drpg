// 벼림 연출: 손 높이의 빛 점(낮에도 보이게), 휘두를 때 떨어지는 불티·얼음 조각, 해방 참격 칼선.
// 무기 물들이기는 sprites.ts의 looksOf가, 횃불 색 섞기는 render.ts가 맡는다. sim은 바꾸지 않는다.
import * as THREE from 'three';
import type { World } from '../sim/world';
import { edgeBlink, edgeColor } from './edge';

const HAND = 0.7; // 빛 점 높이(m)
const TIP = 0.9; // 불티가 떨어지기 시작하는 칼끝 높이
const AHEAD = 0.35; // 바라보는 쪽으로 비키는 거리(몸통을 가리지 않게)
const SPARK = { n: 6, life: 0.4, size: 0.08, fall: 1.6, spread: 0.6 };
const SLASH = { len: 3, width: 0.22, life: 0.15 };
const VIEW = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(60), THREE.MathUtils.degToRad(45)); // 카메라 쪽(칼선이 화면을 향하게, iaido.ts와 같다)
const basis = new THREE.Matrix4();
const [ax, ay, az] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];

export const temperGroup = new THREE.Group();

// 부드러운 둥근 빛(가산 혼합). 처음 쓸 때 만든다(모듈만 불러오는 테스트엔 document가 없다)
let glowTex: THREE.Texture | null = null;
function glowTexture() {
  const c = Object.assign(document.createElement('canvas'), { width: 32, height: 32 });
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}
const additive = () => new THREE.SpriteMaterial({ map: (glowTex ??= glowTexture()), transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending });

let glow: THREE.Sprite | null = null;
type Spark = { s: THREE.Sprite; vx: number; vz: number; age: number };
const sparks: Spark[] = [];
let slash: { mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>; age: number } | null = null;
let swingsSeen = 0;
let slashesSeen = 0;

export function resetTemper(world: World) {
  swingsSeen = world.edgeSwings;
  slashesSeen = world.edgeSlashes;
  for (const p of sparks) p.age = SPARK.life;
  if (slash) slash.age = SLASH.life;
}

// at = 주인공 판자 자리(발밑), time = 실제 흐른 시간(깜빡임), dt = 이번 프레임
export function temperFx(world: World, at: THREE.Vector3, time: number, dt: number) {
  const hero = world.entities[0];
  const color = edgeColor(world);
  const [fx, fz] = [Math.sin(hero.facing), Math.cos(hero.facing)];
  if (!glow) {
    glow = new THREE.Sprite(additive());
    glow.scale.setScalar(0.3);
    glow.renderOrder = 5;
    temperGroup.add(glow);
  }
  glow.visible = !!color && hero.state !== 'dead';
  if (color) {
    glow.material.color.set(color);
    glow.material.opacity = edgeBlink(world, time) ? 0.15 : 0.9;
    glow.position.set(at.x + fx * AHEAD, HAND, at.z + fz * AHEAD);
  }
  // 충전을 쓴 휘두름: 칼끝에서 불티(서리는 얼음 조각, 해방은 흰빛)가 흩어져 떨어진다
  if (world.edgeSwings > swingsSeen && color)
    for (let i = 0; i < SPARK.n; i++) {
      let p = sparks.find((q) => q.age >= SPARK.life);
      if (!p) {
        p = { s: new THREE.Sprite(additive()), vx: 0, vz: 0, age: 0 };
        p.s.renderOrder = 5;
        temperGroup.add(p.s);
        sparks.push(p);
      }
      const a = (i / SPARK.n) * Math.PI * 2;
      Object.assign(p, { vx: Math.cos(a) * SPARK.spread, vz: Math.sin(a) * SPARK.spread, age: 0 });
      p.s.material.color.set(color);
      p.s.position.set(at.x + fx * AHEAD * 2, TIP, at.z + fz * AHEAD * 2);
    }
  swingsSeen = world.edgeSwings;
  for (const p of sparks) {
    p.s.visible = p.age < SPARK.life;
    if (!p.s.visible) continue;
    p.age += dt;
    p.s.position.x += p.vx * dt;
    p.s.position.z += p.vz * dt;
    p.s.position.y = Math.max(0.05, p.s.position.y - SPARK.fall * dt);
    p.s.scale.setScalar(SPARK.size * (1 - p.age / SPARK.life) + 0.02);
  }
  // 해방 참격: 바라보는 쪽으로 3m 가는 흰 칼선(바닥과 나란히, 손 높이)
  if (world.edgeSlashes > slashesSeen) {
    if (!slash) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
      slash = { mesh: new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat), age: 0 };
      slash.mesh.renderOrder = 5;
      temperGroup.add(slash.mesh);
    }
    slash.age = 0;
    slash.mesh.position.set(at.x + (fx * SLASH.len) / 2, HAND, at.z + (fz * SLASH.len) / 2);
    // 판자 가로 = 칼선 방향, 세로 = 화면 쪽으로 세운 폭(눕히면 위에서 비스듬히 보여 너무 가늘다)
    ax.set(fx, 0, fz);
    ay.crossVectors(VIEW, ax).normalize();
    az.crossVectors(ax, ay);
    slash.mesh.quaternion.setFromRotationMatrix(basis.makeBasis(ax, ay, az));
  }
  slashesSeen = world.edgeSlashes;
  if (slash) {
    slash.mesh.visible = slash.age < SLASH.life;
    if (slash.mesh.visible) {
      const p = slash.age / SLASH.life;
      slash.mesh.scale.set(SLASH.len, SLASH.width * (1 - p), 1);
      slash.mesh.material.opacity = 1 - p * p;
      slash.age += dt;
    }
  }
}
