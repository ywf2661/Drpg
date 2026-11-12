// 바닥의 위험 구역(예고 공격): 붉은 테두리 + 안에서 차오르는 원(다 차면 터진다). world.zones와 평타 준비 중인 적을 읽기만 한다.
import * as THREE from 'three';
import { TELL, TRAIL, type World } from '../sim/world';

const flat = (color: number, opacity: number) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, toneMapped: false });
const RING = new THREE.RingGeometry(0.92, 1, 40).rotateX(-Math.PI / 2);
const DISC = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2);
const RING_MAT = flat(0xff3a22, 0.95);
const AREA_MAT = flat(0xff3a22, 0.14); // 구역 전체를 옅게
const FILL_MAT = flat(0xff5a30, 0.38); // 차오르는 부분
const shown = new Map<number, { g: THREE.Group; fill: THREE.Mesh }>();
export const zoneGroup = new THREE.Group();

export function syncZones(world: World) {
  // 근접 평타를 준비 중인 적의 발밑에도 같은 원(다 차면 맞는다). id는 음수로 구역과 겹치지 않게
  const tells = world.entities
    .filter((e) => e.state === 'attack' && e.attackT < (TELL[e.kind] ?? 0))
    .map((e) => ({ id: -1 - e.id, x: e.x, z: e.z, r: 0.6, t: TELL[e.kind]! - e.attackT, total: TELL[e.kind]! }));
  const zones = [...world.zones, ...tells];
  for (const z of zones) {
    let s = shown.get(z.id);
    if (!s) {
      const g = new THREE.Group();
      const fill = new THREE.Mesh(DISC, FILL_MAT);
      g.add(new THREE.Mesh(DISC, AREA_MAT), fill, new THREE.Mesh(RING, RING_MAT));
      g.traverse((o) => (o.renderOrder = 1)); // 바닥 다음, 캐릭터 전에
      zoneGroup.add(g);
      shown.set(z.id, (s = { g, fill }));
    }
    s.g.position.set(z.x, 0.03, z.z);
    s.g.scale.setScalar(z.r);
    s.fill.scale.setScalar(Math.max(0.001, 1 - z.t / z.total));
  }
  for (const [id, s] of shown) {
    if (zones.some((z) => z.id === id)) continue;
    s.g.removeFromParent();
    shown.delete(id);
  }
}

// 돌진 '불길'이 남긴 불타는 길: 바닥에 눕힌 주황 띠(일렁이고, 꺼질 때 옅어진다)
const STRIP = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const fires = new Map<number, THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>>();

export function syncFires(world: World, time: number) {
  for (const f of world.fires) {
    let m = fires.get(f.id);
    if (!m) {
      m = new THREE.Mesh(STRIP, flat(0xff7a1a, 0.5));
      m.renderOrder = 1;
      zoneGroup.add(m);
      fires.set(f.id, m);
    }
    const [dx, dz] = [f.x1 - f.x0, f.z1 - f.z0];
    m.position.set((f.x0 + f.x1) / 2, 0.035, (f.z0 + f.z1) / 2);
    m.rotation.y = Math.atan2(dx, dz);
    m.scale.set(2 * TRAIL.width, 1, Math.hypot(dx, dz) + 2 * TRAIL.width);
    m.material.opacity = Math.min(1, f.t) * (0.4 + 0.15 * Math.sin(time * 18 + f.id));
  }
  for (const [id, m] of fires) {
    if (world.fires.some((f) => f.id === id)) continue;
    m.removeFromParent();
    m.material.dispose();
    fires.delete(id);
  }
}
