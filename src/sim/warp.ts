// 뒤틀린 차원 퍼즐: 한 박자 늦은 나(설계: docs/superpowers/specs/2026-11-26-act2-rift-design.md 3절). three.js·Math.random 금지.
// 맵: 'α'~'δ' 발판(같은 글자 둘이 한 짝), 'Α'~'Δ' 그 짝의 문(닫히면 막힘), 'ψ' 불기둥.
// 메아리 = WARP.delay초 전 주인공 자리. 발판은 주인공이나 메아리가 올라서면 눌리고, 짝의 발판이 같은 틱에 다 눌리면 문이 열린다(다시 닫히지 않는다).
// 메아리는 발판만 누른다(싸우지도, 맞지도, 길을 막지도 않는다). 몬스터는 발판을 못 누른다.
import { dress, hurt } from './core';
import type { Grid } from './path';
import { DT, LANDS, WARP, type Entity, type Land, type World } from './rules';

export type Plate = { pair: number; cell: number; on: boolean };
export type Door = { pair: number; cells: number[]; open: boolean };
// trail = 주인공 자리 고리 버퍼(x, z 쌍), head = 다음에 쓸 칸, filled = 쌓인 수, room = 칸마다 방 번호(문을 닫은 채 걷는 칸 덩어리, 아니면 -1), rooms = 방마다 그 땅
export type Warp = { trail: Float32Array; head: number; filled: number; echo: [number, number] | null; plates: Plate[]; doors: Door[]; fires: number[]; fireT: number; fireHit: boolean; room: Int16Array; rooms: Land[]; ver: number };

export const PLATES = 'αβγδ';
export const DOORS = 'ΑΒΓΔ';
const LANDS_CYCLE: Land[] = ['lake', 'raid', 'mine', 'temple'];
const TICKS = Math.round(WARP.delay / DT);

export function makeWarp(map: string[], grid: Grid): Warp | null {
  const { w, h } = grid;
  const plates: Plate[] = [];
  const doors: Door[] = [];
  const fires: number[] = [];
  for (let z = 0; z < h; z++)
    for (let x = 0; x < w; x++) {
      const c = map[z][x];
      const i = z * w + x;
      if (PLATES.includes(c)) plates.push({ pair: PLATES.indexOf(c), cell: i, on: false });
      else if (DOORS.includes(c)) {
        const pair = DOORS.indexOf(c);
        const d = doors.find((o) => o.pair === pair) ?? doors[doors.push({ pair, cells: [], open: false }) - 1];
        d.cells.push(i);
      } else if (c === 'ψ') fires.push(i);
    }
  if (!plates.length && !doors.length && !fires.length) return null;
  // 방: 문을 닫은 채 걷는 칸 덩어리(위 → 아래 순서로 번호)
  const room = new Int16Array(w * h).fill(-1);
  const rooms: Land[] = [];
  for (let s = 0; s < w * h; s++) {
    if (grid.blocked[s] || room[s] >= 0) continue;
    const k = rooms.push(LANDS_CYCLE[rooms.length % 4]) - 1;
    const q = [s];
    room[s] = k;
    for (let i = 0; i < q.length; i++) {
      const [x, z] = [q[i] % w, Math.floor(q[i] / w)];
      for (const [nx, nz] of [[x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]]) {
        const n = nz * w + nx;
        if (nx >= 0 && nz >= 0 && nx < w && nz < h && !grid.blocked[n] && room[n] < 0) (room[n] = k), q.push(n);
      }
    }
  }
  return { trail: new Float32Array(TICKS * 2), head: 0, filled: 0, echo: null, plates, doors, fires, fireT: 0, fireHit: false, room, rooms, ver: 0 };
}

// 몬스터마다 그 칸 방의 땅 졸개로(createWorld가 땅 스킨 없이 만든 뒤)
export function warpSkins(wp: Warp, entities: Entity[], gw: number) {
  for (const e of entities) {
    if (e.kind === 'hero' || e.kind === 'boss' || e.skin) continue;
    const r = wp.room[Math.floor(e.z) * gw + Math.floor(e.x)];
    if (r >= 0) dress(e, LANDS[wp.rooms[r]].skins);
  }
}

const cellOf = (w: World, x: number, z: number) => Math.floor(z) * w.grid.w + Math.floor(x);

export function tickWarp(w: World) {
  const wp = w.warp;
  if (!wp) return;
  const hero = w.entities[0];
  // 메아리: 쌓인 기록이 다 찼으면 가장 오래된 자리(= delay초 전)
  if (wp.filled === TICKS) wp.echo = [wp.trail[wp.head * 2], wp.trail[wp.head * 2 + 1]];
  wp.trail[wp.head * 2] = hero.x;
  wp.trail[wp.head * 2 + 1] = hero.z;
  wp.head = (wp.head + 1) % TICKS;
  wp.filled = Math.min(TICKS, wp.filled + 1);
  // 발판·문
  const me = cellOf(w, hero.x, hero.z);
  const ec = wp.echo ? cellOf(w, wp.echo[0], wp.echo[1]) : -1;
  for (const p of wp.plates) {
    const on = p.cell === me || p.cell === ec;
    if (on !== p.on) (p.on = on), wp.ver++;
  }
  for (const d of wp.doors) {
    if (d.open) continue;
    const mine = wp.plates.filter((p) => p.pair === d.pair);
    // 같은 발판에 주인공과 메아리가 함께 있어도 한 번 눌린 것: 발판마다 따로 눌려야 한다
    if (mine.length && mine.every((p) => p.on)) {
      d.open = true;
      for (const i of d.cells) w.grid.blocked[i] = 0;
      wp.ver++;
    }
  }
  // 불기둥: fireEvery초마다 마지막 fireUp초 동안 솟는다. 위에 선 주인공은 한 번 솟을 때 한 번 다친다
  if (!wp.fires.length) return;
  wp.fireT = (wp.fireT + DT) % WARP.fireEvery;
  const up = wp.fireT >= WARP.fireEvery - WARP.fireUp;
  if (!up) wp.fireHit = false;
  else if (!wp.fireHit && hero.state !== 'dead' && wp.fires.includes(me)) {
    wp.fireHit = true;
    hurt(w, hero, Math.round(hero.maxHp * WARP.fireDmg));
  }
}

export const fireUp = (w: World) => !!w.warp && w.warp.fireT >= WARP.fireEvery - WARP.fireUp;
