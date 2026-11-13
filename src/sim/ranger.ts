// 궁수 스킬: 화살(평타), 관통 사격(Q), 덫(W), 화살비(E), 집중(R). 스페이스는 기사 구르기.
// 스킬 칸·명령·재사용 필드·단계·특성은 기사·마법사와 같은 것을 쓴다(rules의 HeroClass 설명). 명사수는 core의 hurt
import { walkable } from './path';
import { KNOCK, PIERCE, RANGER, type Entity, type Shot, type SkillName, type World } from './rules';
import { dist, hurt, knock, mastered, roll, skillHit } from './core';
import { aimDir, foes, stun } from './wizard';

// 스킬 단계별 수치(1단계 = 기본값)
const extra = (w: World, s: SkillName) => w.ranks[s] - 1;
export const pierceStat = (w: World) => ({ cd: PIERCE.cd - 0.3 * extra(w, 'cleave'), mult: PIERCE.mult + 0.25 * extra(w, 'cleave') });

// 화살: 평타가 맞는 순간(swing) 대상 쪽으로 쏜다
export function shaft(w: World, hero: Entity, t: Entity) {
  const d = dist(hero, t) || 1;
  w.shots.push({ id: w.nextItem++, x: hero.x, z: hero.z, dx: (t.x - hero.x) / d, dz: (t.z - hero.z) / d, dmg: roll(w, hero), left: RANGER.flight, kind: 'shaft' });
}

// 비행 중인 화살(fly가 부른다): 처음 닿는 몬스터에게 피해. 계속 날아가면 true
// 관통 사격은 맞은 적마다 한 번씩 피해·밀어냄을 주며 꿰뚫고 지나간다(밀쳐내기 특성: 멀리 밀고, 벽에 닿으면 기절)
export function arrowHit(w: World, hero: Entity, s: Shot): boolean {
  const hit = (s.hit ??= []);
  const t = foes(w, hero).find((e) => !hit.includes(e.id) && Math.hypot(e.x - s.x, e.z - s.z) <= (s.kind === 'pierce' ? PIERCE.hit : RANGER.hit));
  if (!t) return true;
  if (s.kind === 'shaft') {
    hurt(w, t, s.dmg, hero);
    return false;
  }
  hit.push(t.id);
  skillHit(w, t, s.dmg);
  const push = w.traits.cleave === 1;
  knock(w, t, s.dx, s.dz, push ? PIERCE.push : KNOCK.axe);
  if (push && !walkable(w.grid, Math.floor(t.x + s.dx * 0.5), Math.floor(t.z + s.dz * 0.5))) stun(t, PIERCE.wallStun);
  return true;
}

// 관통 사격: 조준 방향으로 꿰뚫는 화살(세 갈래 특성은 셋). 5단계는 같은 화살이 PIERCE.wait초 뒤 한 번 더
export function pierce(w: World, hero: Entity, x?: number, z?: number) {
  if (w.skillCd > 0) return;
  const [dx, dz] = aimDir(w, hero, PIERCE.aim, x, z);
  hero.facing = Math.atan2(dx, dz);
  const st = pierceStat(w);
  for (const wait of mastered(w, 'cleave') ? [0, PIERCE.wait] : [0])
    for (const a of w.traits.cleave === 2 ? [-PIERCE.spread, 0, PIERCE.spread] : [0]) {
      const [c, sn] = [Math.cos(a), Math.sin(a)];
      w.shots.push({ id: w.nextItem++, x: hero.x, z: hero.z, dx: dx * c + dz * sn, dz: dz * c - dx * sn, dmg: Math.round(roll(w, hero) * st.mult), left: PIERCE.flight, kind: 'pierce', ...(wait ? { wait } : {}) });
    }
  w.casts++;
  w.skillCd = st.cd;
}
