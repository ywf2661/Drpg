// 바깥(낮) 지역의 시야: 화면은 밝지만 주인공에게서 멀리 있는 적은 안 보인다(디아블로2처럼). 미궁은 어둠이 대신한다.
export const SIGHT = 14; // 시야 반경(m)
const EDGE = 2; // 반경 안쪽 이만큼에서 서서히 사라진다(m)

// 거리 d의 적이 보이는 정도(1 = 다 보임, 0 = 안 보임)
export const sightFade = (d: number, sight = SIGHT) => Math.min(1, Math.max(0, (sight - d) / EDGE));

// 지금 지역의 시야. 렌더가 지역이 바뀔 때(day)와 눈보라 동안(sight) 바꾼다
export const view = { day: false, sight: SIGHT };

type Pos = { x: number; z: number };
export const fadeOf = (hero: Pos, e: Pos) => (view.day ? sightFade(Math.hypot(e.x - hero.x, e.z - hero.z), view.sight) : 1);
export const isSeen = (hero: Pos, e: Pos) => fadeOf(hero, e) > 0;
