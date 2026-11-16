// 바깥(낮) 지역의 시야: 화면은 밝지만 주인공에게서 멀리 있는 적은 안 보인다(디아블로2처럼). 미궁은 어둠이 대신한다.
export const SIGHT = 14; // 시야 반경(m)
const EDGE = 2; // 반경 안쪽 이만큼에서 서서히 사라진다(m)

// 거리 d의 적이 보이는 정도(1 = 다 보임, 0 = 안 보임)
export const sightFade = (d: number, sight = SIGHT) => Math.min(1, Math.max(0, (sight - d) / EDGE));

// 지금 지역의 시야. 렌더가 지역이 바뀔 때(day)와 눈보라 동안(sight) 바꾼다
export const view = { day: false, sight: SIGHT };

// 설원의 눈보라: GAP초 쉬고 LEN초 분다(앞뒤 RAMP초에 걸쳐 차오르고 걷힘). 시작 WARN초 전에 예고. 시간표는 시드로 정한다
const GAP = [40, 60];
const LEN = 8;
const RAMP = 1.5;
const WARN = 2;
const unit = (seed: number, k: number) => {
  const s = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453;
  return s - Math.floor(s); // 0..1
};
// t 이후(또는 t를 포함하는) 눈보라의 시작 시각
function nextStart(t: number, seed: number) {
  let end = 0;
  for (let k = 0; ; k++) {
    const start = end + GAP[0] + (GAP[1] - GAP[0]) * unit(seed, k);
    if (start + LEN > t) return start;
    end = start + LEN;
  }
}
// 구역에 들어온 지 t초에 눈보라 세기(0~1)
export function blizzard(t: number, seed: number) {
  const u = t - nextStart(t, seed);
  return u < 0 ? 0 : Math.min(1, u / RAMP, (LEN - u) / RAMP);
}
export const warnBlizzard = (t: number, seed: number) => {
  const s = nextStart(t, seed);
  return t >= s - WARN && t < s;
};

type Pos = { x: number; z: number };
export const fadeOf = (hero: Pos, e: Pos) => (view.day ? sightFade(Math.hypot(e.x - hero.x, e.z - hero.z), view.sight) : 1);
export const isSeen = (hero: Pos, e: Pos) => fadeOf(hero, e) > 0;
