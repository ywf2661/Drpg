import * as THREE from 'three';
import { expect, test } from 'vitest';
import hero from '../assets/sprites/hero.json';
import heads from '../assets/sprites/fallen_paladin_heads.json';
import { createWorld } from '../sim/world';
import { heroKey, looksOf, CAST_SHOW, cardGeometry, dirIndex, frameAt, HERO_LAYERS, HERO_ORDER, layerUrl, updateSprite, viewHalf, attachHalo, HALO, haloLevel, HERO_RING, heroRingLevel, setHeroRing, type Sprite } from './sprites';

test('후광 맥동: min~max 사이를 period 주기로 오르내린다', () => {
  const xs = Array.from({ length: 200 }, (_, i) => haloLevel((i / 200) * HALO.period));
  expect(Math.min(...xs)).toBeCloseTo(HALO.min, 2);
  expect(Math.max(...xs)).toBeCloseTo(HALO.max, 2);
  expect(haloLevel(0.3)).toBeCloseTo(haloLevel(0.3 + HALO.period), 6);
});

test('후광은 기도하는 자(성기사 그림)와 주인공에게만 붙고, 죽으면 꺼진다', () => {
  const w = createWorld(1, ['H.M']);
  const boss = w.entities[1];
  const card = () => {
    const mat = new THREE.MeshBasicMaterial({ map: new THREE.Texture() });
    return { mesh: new THREE.Mesh(cardGeometry(hero as never), mat), mat, info: hero as never, anim: 'stance' as const, t: 0, hp: boss.hp, maxHp: boss.maxHp, hitT: 0, castT: 0, tint: new THREE.Color(1, 1, 1) } as Sprite;
  };
  const plain = card();
  attachHalo(plain, boss);
  expect(plain.halo).toBeUndefined();
  boss.skin = 'fallen_paladin';
  const s = card();
  attachHalo(s, boss);
  expect(s.halo).toBeDefined();
  updateSprite(s, boss, 2, 1.8);
  expect(s.halo!.k).toBe(1);
  // 고리는 지금 장면의 머리 자리(발 기준 화면 m, 세운 판자라 높이는 cos30으로 나눈다)를 따라간다
  s.anim = 'stance';
  s.t = 0;
  updateSprite(s, boss, 0.001, 1.8);
  const [hx, hy] = heads.stance[dirIndex(boss.facing)][0];
  expect(s.halo!.ring.position.x).toBeCloseTo(hx, 5);
  expect(s.halo!.ring.position.y).toBeCloseTo(hy / Math.cos(Math.PI / 6), 5);
  boss.state = 'dead';
  for (let i = 0; i < 120; i++) updateSprite(s, boss, 1 / 30, 1.8);
  expect(s.halo!.k).toBe(0);
  expect(s.halo!.glow.visible).toBe(false);
});

// 카메라는 +x+z 쪽에서 -x-z를 내려다본다. facing = atan2(dx, dz)
// FLARE 방향 번호(화면 기준): 0=W 1=NW 2=N 3=NE 4=E 5=SE 6=S 7=SW
test.each([
  ['카메라 쪽(+x+z) = 화면 아래 S', Math.atan2(1, 1), 6],
  ['카메라 반대(-x-z) = 화면 위 N', Math.atan2(-1, -1), 2],
  ['+x = 화면 오른쪽 아래 SE', Math.atan2(1, 0), 5],
  ['+z = 화면 왼쪽 아래 SW', Math.atan2(0, 1), 7],
  ['-x = 화면 왼쪽 위 NW', Math.atan2(-1, 0), 1],
  ['-z = 화면 오른쪽 위 NE', Math.atan2(0, -1), 3],
  ['+x-z = 화면 오른쪽 E', Math.atan2(1, -1), 4],
  ['-x+z = 화면 왼쪽 W', Math.atan2(-1, 1), 0],
])('dirIndex: %s', (_, facing, dir) => {
  expect(dirIndex(facing)).toBe(dir);
});

const clip = (loop: 'back_forth' | 'looped' | 'play_once') => ({ row: 0, frames: 4, ms: 400, loop });

test('looped는 마지막 다음에 처음으로', () => {
  expect([0, 0.1, 0.2, 0.3, 0.4, 0.55].map((t) => frameAt(clip('looped'), t))).toEqual([0, 1, 2, 3, 0, 1]);
});

test('play_once는 마지막 프레임에 머문다', () => {
  expect([0, 0.25, 0.39, 0.4, 5].map((t) => frameAt(clip('play_once'), t))).toEqual([0, 2, 3, 3, 3]);
});

test('back_forth는 0→3→0 왕복', () => {
  expect([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7].map((t) => frameAt(clip('back_forth'), t))).toEqual([0, 1, 2, 3, 2, 1, 0, 1]);
});

test('카드: 발 기준선 위는 서고, 아래(발끝·그림자·시체)는 카메라 쪽 바닥에 눕는다', () => {
  const [, ch] = hero.cell;
  const [, ay] = hero.anchor;
  const pos = cardGeometry(hero as never).attributes.position;
  const uv = cardGeometry(hero as never).attributes.uv;
  const ys = Array.from({ length: pos.count }, (_, i) => pos.getY(i));
  const zs = Array.from({ length: pos.count }, (_, i) => pos.getZ(i));
  expect(Math.min(...ys)).toBeGreaterThan(0); // 바닥 아래로 내려가는 부분이 없다
  expect(Math.max(...ys)).toBeCloseTo(0.01 + ay / 30 / Math.cos(Math.PI / 6), 5);
  expect(Math.max(...zs)).toBeCloseTo((ch - ay) / 30 / Math.sin(Math.PI / 6), 5); // 화면에서 텍셀 높이가 같게
  const foot = ys.findIndex((y, i) => Math.abs(y - 0.01) < 1e-9 && Math.abs(zs[i]) < 1e-9);
  expect(uv.getY(foot)).toBeCloseTo(1 - ay / ch, 5);
});

test('시체는 아래 층(깊이 기록 없음)에, 산 캐릭터는 그 위에 그린다', () => {
  const w = createWorld(1, ['H.m']);
  const mat = new THREE.MeshBasicMaterial({ map: new THREE.Texture() });
  const s = { mesh: new THREE.Mesh(cardGeometry(hero as never), mat), mat, info: hero as never, anim: 'stance' as const, t: 0, hp: 30, maxHp: 30, hitT: 0, castT: 0, tint: new THREE.Color(1, 1, 1) };
  const m = w.entities[1];
  updateSprite(s, m, 0.016, 1.2);
  expect([s.mesh.renderOrder, s.mat.depthWrite]).toEqual([2, true]);
  m.state = 'dead';
  updateSprite(s, m, 0.016, 1.2);
  expect([s.mesh.renderOrder, s.mat.depthWrite]).toEqual([1, false]);
});

test('화면 범위는 항상 렌더 픽셀 30개 = 1m', () => {
  expect(viewHalf(640, 360)).toEqual([640 / 60, 6]);
  expect(viewHalf(390, 844)).toEqual([6.5, 844 / 60]);
});

test('맞으면 피격 동작, 갑옷을 바꿔 체력이 줄면 피격 동작 없음', () => {
  const w = createWorld(1, ['H..']);
  const e = w.entities[0];
  const mat = new THREE.MeshBasicMaterial({ map: new THREE.Texture() });
  const s = { mesh: new THREE.Mesh(cardGeometry(hero as never), mat), mat, info: hero as never, anim: 'stance' as const, t: 0, hp: 130, maxHp: 130, hitT: 0, castT: 0, tint: new THREE.Color(1, 1, 1) };
  e.hp = 100;
  e.maxHp = 100;
  updateSprite(s, e, 0.016, 1);
  expect(s.anim).toBe('stance');
  e.hp = 90;
  updateSprite(s, e, 0.016, 1);
  expect(s.anim).toBe('hit');
});

test('주인공 레이어: 장비 조합마다 모든 레이어 그림이 있고, 8방향 모두 레이어를 한 번씩 겹친다', () => {
  for (let t = 1; t <= 4; t++) for (const l of Object.keys(HERO_LAYERS)) expect(layerUrl(l, { weapon: t, armor: t, helm: t, boots: t }), `${l} ${t}`).toBeTruthy();
  expect(HERO_ORDER).toHaveLength(8);
  for (const order of HERO_ORDER) expect([...order].sort()).toEqual(Object.keys(HERO_LAYERS).sort());
});

test('궁수 레이어: 활과 궁수 옷 그림을 쓰고, 방패는 없다', () => {
  const g = (t: number) => ({ weapon: t, armor: t, helm: t, boots: t });
  for (let t = 1; t <= 4; t++) for (const l of ['main', 'head', 'feet', 'lower', 'chest']) expect(layerUrl(l, g(t), 'ranger'), `${l} ${t}`).toContain(`ranger_${l}_${t}`);
  expect(layerUrl('off', g(2), 'ranger')).toBeUndefined();
});

test('스킬 시전: 시전 시간 동안 공격(시전) 동작 프레임이 차례로 나오고, 끝나면 서 있기', () => {
  const w = createWorld(1, ['H..']);
  const e = w.entities[0];
  const mat = new THREE.MeshBasicMaterial({ map: new THREE.Texture() });
  const s = { mesh: new THREE.Mesh(cardGeometry(hero as never), mat), mat, info: hero as never, anim: 'stance' as const, t: 0, hp: e.hp, maxHp: e.maxHp, hitT: 0, castT: CAST_SHOW, tint: new THREE.Color(1, 1, 1) };
  const frames: number[] = [];
  for (let t = 0; t < CAST_SHOW; t += 0.05) {
    updateSprite(s, e, 0.05, 1);
    expect(s.anim).toBe('attack');
    frames.push(mat.map!.offset.x);
  }
  expect(new Set(frames).size).toBeGreaterThan(2);
  updateSprite(s, e, 0.05, 1);
  expect(s.anim).toBe('stance');
});

test('원색 외형: 특출난 전설을 입으면 그 부위 레이어 색, 아니면 없음. 조합 키에 색이 들어간다', () => {
  const w = createWorld(1, ['H....']);
  expect(looksOf(w)).toEqual({});
  w.mods.armor = [{ kind: 'unique', value: 0, u: 'crownless' }];
  w.mods.weapon = [{ kind: 'unique', value: 0, u: 'boomerang' }]; // 원색이 없는 전설
  expect(looksOf(w)).toEqual({ armor: '#f5c400', layers: { main: 'hero_main_axe' } }); // 도끼날은 색 대신 도끼 그림
  expect(heroKey(w.gear, 'knight', looksOf(w))).not.toBe(heroKey(w.gear, 'knight', {}));
});

test('주인공 「금 간 빛 고리」: 고리만 머리 위에, 안 쓰면 꺼짐, 되감기를 쓰면 단번에 깨지고 차오른다', () => {
  const w = createWorld(1, ['H.M']);
  const h = w.entities[0];
  const mat = new THREE.MeshBasicMaterial({ map: new THREE.Texture() });
  const s = { mesh: new THREE.Mesh(cardGeometry(hero as never), mat), mat, info: hero as never, anim: 'stance' as const, t: 0, hp: h.hp, maxHp: h.maxHp, hitT: 0, castT: 0, tint: new THREE.Color(1, 1, 1) } as Sprite;
  attachHalo(s, h);
  expect(s.halo!.hero).toBe(true);
  setHeroRing(0);
  updateSprite(s, h, 1, 1.8);
  expect(s.halo!.ring.visible).toBe(false);
  setHeroRing(heroRingLevel(0, 120));
  for (let i = 0; i < 60; i++) updateSprite(s, h, 1 / 30, 1.8);
  expect(s.halo!.k).toBe(1);
  expect(s.halo!.glow.visible).toBe(false); // 빛무리는 없다
  expect(s.halo!.ring.position.y).toBeCloseTo(HERO_RING.y / Math.cos(Math.PI / 6), 5);
  setHeroRing(heroRingLevel(120, 120));
  updateSprite(s, h, 1 / 30, 1.8);
  expect(s.halo!.k).toBe(HERO_RING.broken);
  expect(heroRingLevel(60, 120)).toBeGreaterThan(HERO_RING.broken);
  expect(heroRingLevel(60, 120)).toBeLessThan(1);
});
