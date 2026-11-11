// 타격감: 스킬이 맞은 순간의 멈춤·화면 흔들림, 떠오르는 데미지 숫자. sim을 건드리지 않고 render·main이 부른다.
import * as THREE from 'three';

export let hitstop = 0; // 남은 멈춤(초). main이 이 동안 sim 틱을 돌리지 않는다
let shake = 0; // 흔들림 크기(m)
const calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches; // 흔들림을 원치 않는 사용자
const v = new THREE.Vector3();

// 스킬이 한 프레임에 적 n을 맞혔을 때의 멈춤(초)·흔들림(m)
export function impactFeel(n: number): { stop: number; shake: number } {
  return n > 0 ? { stop: Math.min(0.14, 0.06 + 0.025 * n), shake: Math.min(0.45, 0.18 + 0.08 * n) } : { stop: 0, shake: 0 };
}

export function impact(n: number) {
  const f = impactFeel(n);
  hitstop = Math.max(hitstop, f.stop);
  rumble(f.shake);
}

export function rumble(m: number) {
  if (!calm) shake = Math.max(shake, m);
}

// 프레임마다: 멈춤을 줄이고 카메라를 흔든다(위치를 잡은 뒤, 픽셀 맞춤 전에)
export function updateFeel(dt: number, camera: THREE.Camera) {
  hitstop = Math.max(0, hitstop - dt);
  shake *= Math.exp(-14 * dt);
  camera.position.x += (Math.random() - 0.5) * shake;
  camera.position.y += (Math.random() - 0.5) * shake;
  camera.position.z += (Math.random() - 0.5) * shake;
}

// 떠오르는 숫자·글자. 월드 (x, z) 머리 위에서 시작해 위로 사라진다. combo = 연계 이름(숫자보다 위에서)
export function popNumber(camera: THREE.Camera, canvas: HTMLCanvasElement, x: number, z: number, n: number | string, kind: 'skill' | 'hit' | 'hurt' | 'combo') {
  const r = canvas.getBoundingClientRect();
  v.set(x, kind === 'combo' ? 2.1 : 1.4, z).project(camera);
  const div = Object.assign(document.createElement('div'), { className: `pop ${kind}`, textContent: String(n) });
  div.style.left = `${r.left + ((v.x + 1) / 2) * r.width}px`;
  div.style.top = `${r.top + ((1 - v.y) / 2) * r.height}px`;
  document.body.append(div);
  const side = (Math.random() - 0.5) * 40;
  div.animate(
    [
      { transform: `translate(-50%, -50%) scale(${kind === 'skill' ? 1.8 : 1.2})`, opacity: 1 },
      { transform: `translate(calc(-50% + ${side / 2}px), -110%) scale(1)`, opacity: 1, offset: 0.25 },
      { transform: `translate(calc(-50% + ${side}px), -220%) scale(0.9)`, opacity: 0 },
    ],
    { duration: kind === 'skill' || kind === 'combo' ? 800 : 550, easing: 'ease-out' },
  ).onfinish = () => div.remove();
}
