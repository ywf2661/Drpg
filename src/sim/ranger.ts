// 궁수 스킬: 화살(평타), 관통 사격(Q), 덫(W), 화살비(E), 집중(R). 스페이스는 기사 구르기.
// 스킬 칸·명령·재사용 필드·단계·특성은 기사·마법사와 같은 것을 쓴다(rules의 HeroClass 설명). 명사수는 core의 hurt
import { RANGER, type Entity, type Shot, type World } from './rules';
import { dist, hurt, roll } from './core';
import { foes } from './wizard';

// 화살: 평타가 맞는 순간(swing) 대상 쪽으로 쏜다
export function shaft(w: World, hero: Entity, t: Entity) {
  const d = dist(hero, t) || 1;
  w.shots.push({ id: w.nextItem++, x: hero.x, z: hero.z, dx: (t.x - hero.x) / d, dz: (t.z - hero.z) / d, dmg: roll(w, hero), left: RANGER.flight, kind: 'shaft' });
}

// 비행 중인 화살(fly가 부른다): 처음 닿는 몬스터에게 피해. 계속 날아가면 true
export function arrowHit(w: World, hero: Entity, s: Shot): boolean {
  const t = foes(w, hero).find((e) => Math.hypot(e.x - s.x, e.z - s.z) <= RANGER.hit);
  if (!t) return true;
  hurt(w, t, s.dmg, hero);
  return false;
}
