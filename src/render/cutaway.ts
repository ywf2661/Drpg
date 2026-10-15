// 앞쪽 벽 낮추기: 주인공을 가리는 카메라 쪽 벽만 낮은 턱으로 바꿔 그린다(디아블로 2 방식).
import * as THREE from 'three';

const NEAR = 2.6; // 카메라 쪽으로 이 거리(m) 안의 벽이 1.7m 캐릭터를 가릴 수 있다(1.2m 벽, 30° 내려다봄)
const SIDE = 1.3; // 화면 가로로 이 거리(m) 안
const LOW = 0.25; // 낮춘 벽 높이(m)

// 벽 칸 (wx, wz)이 주인공 (hx, hz)을 가리는가. a = 카메라 방향(+x+z) 성분, b = 화면 가로 성분
export function occludes(hx: number, hz: number, wx: number, wz: number): boolean {
  const dx = wx + 0.5 - hx;
  const dz = wz + 0.5 - hz;
  const a = (dx + dz) / Math.SQRT2;
  const b = (dx - dz) / Math.SQRT2;
  return a > 0 && a <= NEAR && Math.abs(b) <= SIDE;
}

const m = new THREE.Matrix4();
const full = (x: number, z: number) => m.makeTranslation(x + 0.5, 0.6, z + 0.5);
// 1.2m 상자를 세로로 줄여 바닥에 붙인다
const low = (x: number, z: number) => m.makeScale(1, LOW / 1.2, 1).setPosition(x + 0.5, LOW / 2, z + 0.5);

// 벽 InstancedMesh(인스턴스 i = cells[i])에서 가리는 벽만 낮춘다. 바뀐 인스턴스만 다시 쓴다
export function makeCutaway(walls: THREE.InstancedMesh, cells: [number, number][]) {
  let lowered = new Set<number>();
  return (hx: number, hz: number) => {
    const next = new Set<number>();
    cells.forEach(([x, z], i) => {
      if (Math.abs(x - hx) <= 4 && Math.abs(z - hz) <= 4 && occludes(hx, hz, x, z)) next.add(i);
    });
    let changed = false;
    for (const i of lowered) if (!next.has(i)) (walls.setMatrixAt(i, full(...cells[i])), (changed = true));
    for (const i of next) if (!lowered.has(i)) (walls.setMatrixAt(i, low(...cells[i])), (changed = true));
    if (changed) walls.instanceMatrix.needsUpdate = true;
    lowered = next;
  };
}
