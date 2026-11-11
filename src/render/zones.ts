// 바닥의 위험 구역(예고 공격): 붉은 테두리 + 안에서 차오르는 원(다 차면 터진다). world.zones를 읽기만 한다.
import * as THREE from 'three';
import type { World } from '../sim/world';

const flat = (color: number, opacity: number) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, toneMapped: false });
const RING = new THREE.RingGeometry(0.92, 1, 40).rotateX(-Math.PI / 2);
const DISC = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2);
const RING_MAT = flat(0xff3a22, 0.95);
const AREA_MAT = flat(0xff3a22, 0.14); // 구역 전체를 옅게
const FILL_MAT = flat(0xff5a30, 0.38); // 차오르는 부분
const shown = new Map<number, { g: THREE.Group; fill: THREE.Mesh }>();
export const zoneGroup = new THREE.Group();

export function syncZones(world: World) {
  for (const z of world.zones) {
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
    if (world.zones.some((z) => z.id === id)) continue;
    s.g.removeFromParent();
    shown.delete(id);
  }
}
