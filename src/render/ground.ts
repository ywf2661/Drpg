// 약탈자 진지 바닥(설계: docs/superpowers/specs/2026-11-24-act2-raid-design.md 2절): 받은 묶음에 흙바닥 그림이 없어
// 초원 바닥 재질 위에 셰이더로 밟아 다진 흙을 칠한다 — 큰 얼룩(누런 흙 ↔ 붉은 흙), 갈라진 금, 재가 앉은 검은 자리, 수레바퀴 자국, 잔돌.
// 재질 색(길은 더 어둡게 등)은 흙에 곱한다. 바닥 그림은 조금만 비친다(초원 풀이 보이지 않게)
import * as THREE from 'three';

export function dirtGround(mat: THREE.MeshStandardMaterial) {
  mat.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGround;').replace(
      '#include <project_vertex>',
      `#include <project_vertex>
vec4 gp = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
gp = instanceMatrix * gp;
#endif
vGround = (modelMatrix * gp).xyz;`,
    );
    s.fragmentShader = s.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vGround;
float gh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float gn(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(gh(i), gh(i + vec2(1, 0)), u.x), mix(gh(i + vec2(0, 1)), gh(i + vec2(1, 1)), u.x), u.y); }`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
{
  vec2 p = vGround.xz;
  float n = gn(p * 0.3) * 0.55 + gn(p * 1.1) * 0.3 + gn(p * 4.0) * 0.15;
  vec3 dirt = mix(vec3(0.16, 0.1, 0.055), vec3(0.3, 0.2, 0.11), n);
  dirt = mix(dirt, vec3(0.26, 0.1, 0.05), smoothstep(0.55, 0.8, gn(p * 0.12 + 3.0)) * 0.5); // 붉은 흙
  float crack = abs(gn(p * 1.8 + 11.0) - 0.5);
  dirt *= 0.88 + 0.12 * smoothstep(0.0, 0.03, crack); // 갈라진 금(가늘게)
  float ash = smoothstep(0.66, 0.8, gn(p * 0.2 + 7.0));
  dirt = mix(dirt, vec3(0.07, 0.065, 0.06), ash * 0.85); // 불탄 자리
  float rut = smoothstep(0.06, 0.0, abs(fract((p.x + p.y) * 0.12 + gn(p * 0.08) * 1.5) - 0.5) - 0.42);
  dirt *= 1.0 - rut * 0.25; // 수레바퀴 자국
  dirt = mix(dirt, vec3(0.34, 0.3, 0.24), step(0.992, gh(floor(p * 6.0))) * 0.6); // 잔돌(드문드문)
  diffuseColor.rgb = mix(diffuseColor.rgb * vec3(0.55, 0.42, 0.3), dirt * diffuse, 0.85);
}`,
      );
  };
}

// 사암 신전 바닥(설계: docs/superpowers/specs/2026-11-26-act2-temple-design.md 2절): 받은 묶음에 사막 바닥이 없어 셰이더로.
// 담 밖(가운데 (cx, cz)에서 r m 너머)은 바람 물결이 진 모래, 안은 모래가 낀 사암 판석(엇갈린 1.5m 판, 줄눈, 닳은 얼룩)
export function sandGround(mat: THREE.MeshStandardMaterial, cx: number, cz: number, r: number) {
  mat.onBeforeCompile = (s) => {
    s.uniforms.uTemple = { value: new THREE.Vector3(cx, cz, r) };
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGround;').replace(
      '#include <project_vertex>',
      `#include <project_vertex>
vec4 gp = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
gp = instanceMatrix * gp;
#endif
vGround = (modelMatrix * gp).xyz;`,
    );
    s.fragmentShader = s.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vGround;
uniform vec3 uTemple;
float gh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float gn(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(gh(i), gh(i + vec2(1, 0)), u.x), mix(gh(i + vec2(0, 1)), gh(i + vec2(1, 1)), u.x), u.y); }`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
{
  vec2 p = vGround.xz;
  float n = gn(p * 0.25) * 0.6 + gn(p * 1.3) * 0.25 + gn(p * 5.0) * 0.15;
  // 모래: 바람 물결(구불구불한 줄) + 큰 얼룩
  float rip = sin((p.x * 0.8 + p.y * 0.55) * 3.2 + gn(p * 0.35) * 6.0);
  vec3 sand = mix(vec3(0.46, 0.33, 0.18), vec3(0.62, 0.47, 0.27), n) * (0.93 + 0.07 * rip);
  sand = mix(sand, vec3(0.3, 0.24, 0.17), step(0.993, gh(floor(p * 7.0))) * 0.7); // 잔돌
  // 판석: 1.5m 판, 줄마다 반 칸 엇갈림
  vec2 q = p / 1.5;
  q.x += 0.5 * mod(floor(q.y), 2.0);
  vec2 f = abs(fract(q) - 0.5);
  float joint = smoothstep(0.47, 0.5, max(f.x, f.y));
  float slab = gh(floor(q));
  vec3 stone = mix(vec3(0.42, 0.32, 0.2), vec3(0.56, 0.44, 0.28), slab * 0.6 + n * 0.4);
  stone *= 1.0 - joint * 0.45;
  stone = mix(stone, sand, smoothstep(0.55, 0.85, gn(p * 0.4 + 9.0)) * 0.6); // 판석 틈에 쌓인 모래
  float inside = 1.0 - smoothstep(uTemple.z - 0.5, uTemple.z + 0.5, length(p - uTemple.xy));
  diffuseColor.rgb = mix(diffuseColor.rgb * 0.3, mix(sand, stone, inside) * diffuse, 0.9);
}`,
      );
  };
}
