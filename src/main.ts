// 게임 흐름: 층 만들기·이동, 저장·이어하기, 입력 연결, 60Hz 고정 틱 루프. 화면 위 HTML은 hud.ts.
import { snapshot, soundEvents } from './audio/events';
import * as sound from './audio/sound';
import { $, initHud, sayLocked, sayShort, showBag, showTitle, showTree, showFloor, showLoadError, showShop, showSound, updateHud } from './hud';
import { aim, aiming, amoving, cancelAim, commands, dragAim, fireAim, setSkillGate, hovered, initInput, pollInput, startAim, startAmove, type AimCmd } from './input';
import { drawAutomap, initAutomap, resetAutomap, toggleAutomap } from './render/automap';
import { hitstop } from './render/feel';
import { drawLabels, initLabels, type Sign } from './render/labels';
import { camera, draw, initRender, renderer, setAim, setWorld } from './render/render';
import { walkable } from './sim/path';
import { clearRun, loadRun, saveRun, type Keys, type Mods, type Ranks, type Stats } from './save';
import { buy, deathGold, sell } from './shop';
import { cyclePower, FLOORS, floorPower } from './sim/dungeon';
import { makeMap, opposite, themeOf, type Side } from './sim/wilds';
import { canAfford, LANDS, LAND_LIST, type Land, BLINK, ROLL, SKILL, CURSE, curseStat, AXE, BOLT, boltStat, PIERCE, RAIN, rainStat, TRAP, bind, chainStat, COMET, cometStat, copyMods, CORPSE, createWorld, exitAt, sideOf, DASH, dashStat, discardFromBag, DT, equipFromBag, EXECUTE, FIREBALL, FIREFIELD, firefieldStat, fireRainStat, gainXp, HUNT, KEY_CD, LEAP, leapStat, learn as learnNow, newSkills, PLAGUE, plagueStat, PRISON, prisonStat, respec, TEMPEST, xpToNext, moveInBag, outcome, setLevel, step, type BagItem, type Gear, type HeroClass, type SkillId, type SkillName, type World } from './sim/world';

const credits = document.querySelector<HTMLDialogElement>('#credits')!;
const help = document.querySelector<HTMLDialogElement>('#help')!;
const bag = document.querySelector<HTMLDialogElement>('#bag')!;
const tree = document.querySelector<HTMLDialogElement>('#tree')!;
// 새 판의 시작 상태: 2단계 장비(기사 = 숏소드 + 가죽 갑옷·두건·장화, 마법사 = 마법 막대 + 견습 로브·두건·장화)
const startOf = (cls: HeroClass): Carry => ({ pity: 0, cls, potions: 2, gear: { weapon: 2, armor: 2, helm: 2, boots: 2 }, mods: { weapon: [], armor: [], helm: [], boots: [] }, level: 1, xp: 0, gold: 0, ...newSkills(cls), points: 0, bag: [], autoEquip: true });
type Carry = { pity: number; cls: HeroClass; potions: number; gear: Gear; mods: Mods; level: number; xp: number; gold: number; ranks: Ranks; points: number; keys: Keys; bag: BagItem[]; autoEquip: boolean };
// 다음 층(또는 상점·회차)으로 가져갈 것만 복사. World·저장(Run)도 이 필드를 다 갖고 있다
const carryOf = (c: Carry): Carry => ({ pity: c.pity, cls: c.cls, potions: c.potions, gear: { ...c.gear }, mods: copyMods(c.mods), level: c.level, xp: c.xp, gold: c.gold, ranks: { ...c.ranks }, points: c.points, keys: { ...c.keys }, bag: [...c.bag], autoEquip: c.autoEquip });
const newStats = (): Stats => ({ time: 0, kills: 0, deaths: 0 });
const saved = loadRun(); // 지난번 진행(있으면 시작 화면에 이어하기)
let choosing = true; // 시작 화면(이어하기·직업 선택)을 보는 중. 뒤에는 기사 1층이 미리 그려져 있다
let stats = newStats(); // 이번 판 기록(이어하기면 저장된 것부터)
let floor = 1;
let land: Land = 'field'; // 지역(미궁·초원·설원). 한 판은 초원 1구역에서 시작하고, 구역 끝의 출구로 다음 지역을 고른다
let from: Side = 'w'; // 바깥 지역에서 들어온 가장자리(나간 출구의 맞은편)
let next: { land: Land; from: Side } = { land, from }; // 상점을 떠나면 갈 곳(출구를 지날 때 정한다)
let cycle = 0; // 회차(0 = 첫 판). 보스를 잡고 다음 회차로 가면 1씩
let entry: Carry = startOf('knight'); // 이 층에 들어올 때의 물약·장비·레벨(사망 후 다시 시작하면 이것으로)
let world = makeFloor(floor, entry);
let lostGold: number | null = null; // 이번 죽음에서 잃은 금화(null = 아직 안 죽음)
let shopping: Carry | null = null; // 계단을 내려가 상점을 보는 중(다음 층으로 가져갈 상태)
let stayed = false; // 상점에서 '이 층에 남기'를 골랐다: 계단에서 벗어났다가 다시 와야 상점이 열린다
const STAIRS_AWAY = 1.5; // 이만큼 멀어지면 벗어난 것(m). 계단 그림(3×3칸)의 바깥
let signs: Sign[] = []; // 이 구역의 출구 이름표
// 출구마다(같은 지역 칸끼리 묶어 가운데) "▶ 설원 3구역", 바깥 지역의 계단은 동굴 입구 "▼ 지하 3층"
function signsOf(w: World, n: number): Sign[] {
  const out: Sign[] = [];
  for (const to of ['field', 'snow'] as const) {
    const cells = w.exits.filter((e) => e.to === to);
    if (cells.length) out.push({ x: cells.reduce((a, e) => a + e.x, 0) / cells.length + 0.5, z: cells.reduce((a, e) => a + e.z, 0) / cells.length + 0.5, text: `▶ ${LANDS[to].name} ${n + 1}${LANDS[to].unit}` });
  }
  if (land !== 'dungeon' && w.stairs) out.push({ x: w.stairs[0] + 0.5, z: w.stairs[1] + 0.5, text: `▼ ${LANDS.dungeon.name} ${n + 1}${LANDS.dungeon.unit}` });
  return out;
}
const progress = () => ({ floor, ...entry, cycle, stats, land, from }); // 저장할 진행
// 새 판·새 회차: 초원 1구역 서쪽에서
const fresh = () => ([land, from] = ['field', 'w']);

// 층마다 새 시드(sim 밖이라 Math.random 사용). 층 배율 floorPower, 떨어지는 장비는 층 + 1단계까지
function makeFloor(n: number, carry: Carry): World {
  const seed = Math.floor(Math.random() * 2 ** 31);
  const w = createWorld(seed, makeMap(seed, n, land, from), floorPower(n, cycle), cyclePower(cycle), LANDS[land].skins);
  w.cls = carry.cls;
  w.potions = carry.potions;
  w.gear = { ...carry.gear };
  w.mods = copyMods(carry.mods);
  w.gold = carry.gold;
  w.ranks = { ...carry.ranks };
  w.points = carry.points;
  w.keys = { ...carry.keys };
  w.bag = [...carry.bag];
  w.autoEquip = carry.autoEquip;
  w.pity = carry.pity;
  w.maxTier = Math.min(4, n + 1);
  setLevel(w, carry.level, carry.xp);
  return w;
}

function enterFloor(n: number, carry: Carry) {
  floor = n;
  lostGold = null;
  stayed = false;
  entry = carryOf(carry);
  saveRun(progress()); // 층에 들어갈 때마다 자동 저장
  world = makeFloor(n, entry);
  signs = signsOf(world, n);
  setWorld(world, themeOf(n, land));
  resetAutomap(world);
  commands.length = 0; // 이전 층에서 쌓인 명령을 새 층에 적용하지 않는다
  showFloor(n, cycle, land);
  sound.playMusic(sound.musicFor(n));
}

// 계단을 내려가면 다음 층을 만들기 전에 상점. 떠나면 산 것을 가지고 다음 층으로
function openShop() {
  shopping = carryOf(world);
  // 바깥 출구면 그 지역(맞은편 가장자리에서), 계단(미궁·동굴 입구)이면 미궁
  const ex = exitAt(world);
  next = ex ? { land: ex.to, from: opposite[sideOf(world, ex)] } : { land: 'dungeon', from: 'w' };
  const coin = () => sound.play([{ name: 'gold', x: world.entities[0].x, z: world.entities[0].z }], world.entities[0].x, world.entities[0].z);
  const render = () =>
    showShop(
      shopping!,
      (item) => {
        const after = buy(shopping!, item);
        if (after === shopping) return;
        shopping = after;
        coin();
        render();
      },
      (i) => {
        shopping = sell(shopping!, i);
        coin();
        render();
      },
      () => {
        const c = shopping!;
        shopping = null;
        ({ land, from } = next);
        enterFloor(floor + 1, c);
      },
      () => {
        // 남기: 사고판 것은 그대로 가지고 이 층에서 계속한다
        const c = shopping!;
        shopping = null;
        stayed = true;
        Object.assign(world, { potions: c.potions, gear: { ...c.gear }, gold: c.gold, bag: [...c.bag], toStairs: false });
      },
      `${LANDS[next.land].name} ${floor + 1}${LANDS[next.land].unit}`,
    );
  render();
}

function begin(n: number, carry: Carry) {
  choosing = false;
  showTitle(false);
  enterFloor(n, carry);
}

function restart() {
  const o = outcome(world);
  if (o === 'dead') {
    stats.deaths++;
    enterFloor(floor, entry); // 같은 층을 새 모양으로, 들어올 때의 물약·장비로
  } else if (o === 'clear') {
    stats = newStats();
    cycle = 0;
    fresh();
    enterFloor(1, startOf(world.cls));
  }
}

// 보스를 잡은 뒤: 레벨·장비·물약·금화를 가지고 더 강한 1층부터
function nextCycle() {
  if (outcome(world) !== 'clear') return;
  cycle++;
  fresh();
  enterFloor(1, carryOf(world));
}

// 보관함 창. 게임이 멈춘 동안 바로 고치고 다시 그린다
function renderBag() {
  showBag(world, {
    equip: (i) => {
      const ok = equipFromBag(world, i);
      renderBag();
      return ok;
    },
    move: (i, x, y) => {
      moveInBag(world, i, x, y);
      renderBag();
    },
    discard: (i) => {
      discardFromBag(world, i);
      renderBag();
    },
    auto: (on) => {
      // 설정은 진행이 아니므로 바로 저장한다(사망·새로고침에도 유지)
      world.autoEquip = entry.autoEquip = on;
      saveRun(progress());
    },
  });
}

function openBag() {
  if (!choosing && !shopping && !outcome(world) && !document.querySelector('dialog[open]')) renderBag();
}

// 스킬 트리 창. 창이 열린 동안 sim이 멈추므로 배우기·끼우기·되돌리기를 바로 하고 다시 그린다(보관함과 같다)
function renderTree() {
  showTree(world, {
    learn: (id) => (learnNow(world, id), renderTree()),
    bind: (key, id) => (bind(world, key, id), renderTree()),
    respec: () => (respec(world), renderTree()),
  });
}
function openTree() {
  if (tree.open) return tree.close();
  if (!choosing && !shopping && !outcome(world) && !document.querySelector('dialog[open]')) renderTree();
}

const drink = () => commands.push({ type: 'drink' });
const skill = () => commands.push({ type: 'skill' }); // 버튼: 자동 조준
const dash = (aimed: boolean) => commands.push({ type: 'dash', ...((aimed && aim()) || {}) }); // 키보드는 커서 방향, 버튼은 자동
const shout = () => commands.push({ type: 'shout' });
const throwAxe = (aimed: boolean) => commands.push({ type: 'throw', ...((aimed && aim()) || {}) });
const roll = (aimed: boolean) => ROLL.on && commands.push({ type: 'roll', ...((aimed && aim()) || {}) }); // 버튼은 가까운 적의 반대쪽
// 칸에 끼운 스킬의 단계를 올린다(버튼의 [+]·Shift+키)
const learn = (key: SkillName) => {
  const id = world.keys[key];
  if (id) commands.push({ type: 'learn', skill: id });
};
const CMD_SKILL: Record<Exclude<AimCmd, 'roll'>, SkillName> = { skill: 'cleave', dash: 'dash', shout: 'shout', throw: 'throw' };
// 빈 칸을 누르면: 포인트가 있으면 스킬 창, 없으면 알림
const emptyKey = (key: SkillName) => (world.points ? openTree() : sayLocked(key));
// 스킬 버튼: 끼운 스킬은 쓰고, 빈 칸이면 emptyKey
// 칸의 스킬을 쓸 기력·마나가 모자라면 알리고 true(조준도 시작하지 않는다)
const short = (cmd: Exclude<AimCmd, 'roll'>) => {
  const id = world.keys[CMD_SKILL[cmd]];
  if (!id || canAfford(world, id)) return false;
  sayShort(world, id);
  return true;
};
const tap = (cmd: Exclude<AimCmd, 'roll'>, use: () => void) => () => {
  if (!world.keys[CMD_SKILL[cmd]]) emptyKey(CMD_SKILL[cmd]);
  else if (!short(cmd)) use();
};
// 스킬 조준(롤의 일반 시전): 날아가는 스킬은 직선, 지점에 떨어지는 스킬은 원. 표에 없는 스킬은 누르면 바로 쓴다
type AimShape = { kind: 'line'; len: number; width: number } | { kind: 'circle'; range: number; r: number };
const ARROW = (): AimShape => ({ kind: 'line', len: PIERCE.flight, width: PIERCE.hit * 2 });
const AXE_LINE = (): AimShape => ({ kind: 'line', len: AXE.flight, width: AXE.hit * 2 });
const AIM: Partial<Record<SkillId, (w: World) => AimShape>> = {
  dash: (w) => ({ kind: 'line', len: dashStat(w).dist, width: DASH.hit * 2 }),
  throw: AXE_LINE,
  bounce: AXE_LINE,
  execute: () => ({ kind: 'circle', range: EXECUTE.reach, r: 0.6 }),
  leap: (w) => ({ kind: 'circle', range: LEAP.range, r: leapStat(w).radius }),
  fireball: () => ({ kind: 'line', len: FIREBALL.flight, width: FIREBALL.hit * 2 }),
  firefield: (w) => ({ kind: 'circle', range: FIREFIELD.range, r: firefieldStat(w).radius }),
  comet: (w) => ({ kind: 'circle', range: COMET.range, r: cometStat(w).radius }),
  lightning: (w) => ({ kind: 'circle', range: BOLT.range, r: boltStat(w).radius }),
  chain: (w) => ({ kind: 'circle', range: BOLT.range, r: chainStat(w).radius }),
  tempest: () => ({ kind: 'circle', range: TEMPEST.range, r: TEMPEST.radius }),
  pierce: ARROW,
  spread: ARROW,
  push: ARROW,
  spear: ARROW,
  trap: () => ({ kind: 'circle', range: TRAP.range, r: TRAP.trigger }),
  hunt: () => ({ kind: 'circle', range: HUNT.range, r: HUNT.ring }),
  rain: (w) => ({ kind: 'circle', range: RAIN.range, r: rainStat(w).radius }),
  fireRain: (w) => ({ kind: 'circle', range: RAIN.range, r: fireRainStat(w).radius }),
  curse: (w) => ({ kind: 'circle', range: CURSE.range, r: curseStat(w).radius }),
  plague: (w) => ({ kind: 'circle', range: PLAGUE.range, r: plagueStat(w).radius }),
  corpseBlast: () => ({ kind: 'circle', range: CORPSE.range, r: CORPSE.radius }),
  prison: (w) => ({ kind: 'circle', range: PRISON.range, r: prisonStat(w).radius }),
};
// 칸에 끼운 스킬의 조준 모양(표에 없으면 null = 누르면 바로 쓴다)
function aimShape(cmd: AimCmd): AimShape | null {
  const id = cmd !== 'roll' && world.keys[CMD_SKILL[cmd]];
  return (id && AIM[id]?.(world)) || null;
}
// 터치로 버튼을 끌어 조준할 때의 궤적: 키보드 조준 스킬 + 방향이 있는 구르기·순간이동·기사 가르기(키보드로는 바로 쓴다)
function dragShape(cmd: AimCmd): AimShape | null {
  if (cmd === 'roll') return !ROLL.on ? null : world.cls === 'wizard' ? { kind: 'circle', range: BLINK.dist, r: 0.5 } : { kind: 'line', len: ROLL.dist, width: 0.8 };
  if (world.keys[CMD_SKILL[cmd]] === 'cleave') return { kind: 'line', len: SKILL.radius, width: SKILL.radius * 2 };
  return aimShape(cmd);
}
const COOLDOWN: Record<AimCmd, 'skillCd' | 'dashCd' | 'shoutCd' | 'throwCd' | 'rollCd'> = { skill: KEY_CD.cleave, dash: KEY_CD.dash, shout: KEY_CD.shout, throw: KEY_CD.throw, roll: 'rollCd' };
const canDrag = (cmd: AimCmd) => !!dragShape(cmd) && world[COOLDOWN[cmd]] <= 0 && world.entities[0].state !== 'dead' && (cmd === 'roll' || (!!world.keys[CMD_SKILL[cmd]] && canAfford(world, world.keys[CMD_SKILL[cmd]]!)));
// 스마트 키(설정): 켜면 조준 없이 누르는 순간 커서 쪽으로 쓴다
const SMART_KEY = 'drpg-smart';
let smartKey = (() => {
  try {
    return localStorage.getItem(SMART_KEY) === '1';
  } catch {
    return false;
  }
})();
// 스킬 키(Q W E R): 조준할 스킬이면 조준 시작 → 좌클릭(또는 같은 키 한 번 더)에 쓴다. 재사용 대기 중이면 조준하지 않는다.
// 조준 표(AIM)에 없는 스킬(가르기·함성·소환 등)은 바로 쓴다(가르기는 가까운 적 쪽 — 커서 쪽은 우클릭)
function skillKey(cmd: Exclude<AimCmd, 'roll'>) {
  if (!world.keys[CMD_SKILL[cmd]]) return emptyKey(CMD_SKILL[cmd]);
  if (short(cmd)) return void (aiming === cmd && cancelAim()); // 모자라면 조준하지 않고 알린다
  const shape = aimShape(cmd);
  if (!shape) return commands.push({ type: cmd });
  if (smartKey) return commands.push({ type: cmd, ...(aim() ?? {}) });
  if (aiming === cmd) return fireAim();
  if (world[COOLDOWN[cmd]] <= 0 && world.entities[0].state !== 'dead') startAim(cmd);
}
// 조준 표시: 직선은 주인공에서 커서 쪽으로 사거리만큼(벽·닫힌 문에서 끊음), 원은 커서 지점(사거리까지로 당김). 커서가 없으면 null
function aimGuide() {
  const shape = aiming && dragShape(aiming);
  const hero = world.entities[0];
  const p = aim();
  const d = p ? Math.hypot(p.x - hero.x, p.z - hero.z) : 0;
  if (!shape || !p || d < 1e-6) return null;
  const [dx, dz] = [(p.x - hero.x) / d, (p.z - hero.z) / d];
  if (shape.kind === 'circle') {
    const k = Math.min(d, shape.range);
    return { kind: 'circle' as const, x: hero.x + dx * k, z: hero.z + dz * k, r: shape.r, cx: hero.x, cz: hero.z, range: shape.range };
  }
  let len = 0;
  while (len < shape.len && walkable(world.grid, Math.floor(hero.x + dx * (len + 0.1)), Math.floor(hero.z + dz * (len + 0.1)))) len += 0.1;
  return { kind: 'line' as const, x: hero.x, z: hero.z, dx, dz, len: Math.max(len, 0.7), width: shape.width };
}

try {
  await initRender(world, themeOf(floor, land));
} catch (err) {
  showLoadError(err);
  throw err;
}
// 시작 화면: 이어하기 또는 직업을 골라 새 게임. 처음 하는 사람에게는 고른 뒤 조작법
const pickClass = (cls: HeroClass) => {
  stats = newStats();
  cycle = 0;
  fresh();
  begin(1, startOf(cls));
  if (!saved) help.showModal();
};
showTitle(true, saved);
$('#help-btn').addEventListener('click', () => help.showModal());
initHud({
  drink,
  skill: tap('skill', skill),
  dash: tap('dash', () => dash(false)),
  shout: tap('shout', shout),
  throwAxe: tap('throw', () => throwAxe(false)),
  roll: () => roll(false),
  learn,
  bag: openBag,
  tree: openTree,
  restart,
  nextCycle,
  toggleMap: toggleAutomap,
  sound: (patch) => {
    sound.setSound(patch);
    showSound(sound.settings);
  },
  resume: () => {
    if (!saved) return;
    stats = { ...saved.stats };
    cycle = saved.cycle;
    ({ land, from } = saved);
    begin(saved.floor, saved);
  },
  pick: pickClass,
  smart: (on) => {
    smartKey = on;
    cancelAim();
    try {
      localStorage.setItem(SMART_KEY, on ? '1' : '0');
    } catch {
      // 저장 못 해도 이번에는 적용된다
    }
  },
  smartOn: () => smartKey,
});
initInput();
setSkillGate((cmd) => cmd === 'roll' || !short(cmd)); // 우클릭·조준 발사도 기력·마나가 모자라면 알린다
for (const [sel, cmd] of [['#skill', 'skill'], ['#dash', 'dash'], ['#shout', 'shout'], ['#throw', 'throw'], ['#roll', 'roll']] as const) dragAim($(sel), cmd, () => canDrag(cmd));
initAutomap(document.querySelector<HTMLCanvasElement>('#automap')!);
initLabels($('#labels'));
sound.initSound();
sound.playMusic(sound.musicFor(floor)); // 곡만 정해 두고, 첫 입력 때 재생
showSound(sound.settings);
resetAutomap(world);
showFloor(floor, cycle);
// 스킬 Q W E R(하단 버튼 순서), 물약 1. R은 사망·클리어 화면에서는 다시 시작.
// e.code: 한글 입력 상태에서도 물리 키
const ended = () => ['dead', 'clear'].includes(outcome(world) ?? '');
const SKILL_KEYS: Record<string, SkillName> = { KeyQ: 'cleave', KeyW: 'dash', KeyE: 'shout', KeyR: 'throw' };
addEventListener('keydown', (e) => {
  if (e.code === 'KeyI') {
    if (!e.repeat && !e.ctrlKey && !e.metaKey) (bag.open ? bag.close() : openBag()); // 누르고 있을 때·개발자 도구 단축키는 무시
    return;
  }
  if (e.code === 'KeyT') {
    if (!e.repeat && !e.ctrlKey && !e.metaKey) openTree(); // 스킬 트리(열려 있으면 닫기)
    return;
  }
  if (document.querySelector('dialog[open]')) return; // 창을 보는 동안은 게임 키를 쌓지 않는다
  if (e.shiftKey && SKILL_KEYS[e.code]) return learn(SKILL_KEYS[e.code]); // Shift + 스킬 키 = 포인트로 단계 올리기
  if (e.code === 'KeyQ') skillKey('skill');
  else if (e.code === 'KeyW') skillKey('dash');
  else if (e.code === 'KeyE') skillKey('shout');
  else if (e.code === 'KeyR') (ended() ? restart() : skillKey('throw'));
  else if (e.code === 'Escape') cancelAim();
  else if (e.code === 'KeyA' && !e.ctrlKey && !e.metaKey && world.entities[0].state !== 'dead') startAmove(); // 공격 이동: 다음 좌클릭 지점으로
  else if (e.code === 'Space') (e.preventDefault(), roll(true));
  else if (e.code === 'Digit1') drink();
  else if (e.code === 'KeyM') toggleAutomap();
});
// 테스터 모드: 주소 끝에 ?test를 붙이면 왼쪽 위에 레벨 +1·다음 층 버튼(배포판에서도 폰으로 시험할 수 있게)
// ponytail: 진행 저장에도 그대로 남는다(테스트로 올린 레벨·층). 섞이는 게 싫으면 테스터 모드에서는 saveRun을 건너뛸 것
if (new URLSearchParams(location.search).has('test')) {
  $('#tester').hidden = false;
  const playing = () => !choosing && !shopping && !outcome(world);
  $('#test-level').addEventListener('click', () => playing() && gainXp(world, xpToNext(world.level) - world.xp));
  $('#test-floor').addEventListener('click', () => playing() && floor < FLOORS && enterFloor(floor + 1, carryOf(world)));
  $('#test-land').addEventListener('click', () => {
    if (!playing()) return;
    land = LAND_LIST[(LAND_LIST.indexOf(land) + 1) % LAND_LIST.length];
    enterFloor(floor, carryOf(world));
  });
}
// 헤드리스 확인용: 현재 world, 명령 큐, 층 바로 가기
if (import.meta.env.DEV) Object.assign(window, { __game: { get world() { return world; }, commands, goto: (n: number, l: Land = land) => ((land = l), enterFloor(n, world)), get played() { return sound.played; } } });

let heard = snapshot(world); // 직전 프레임 상태(효과음 비교용)
let acc = 0;
let last = performance.now();
requestAnimationFrame(function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.25); // 탭 전환 후 복귀 시 수천 틱 몰아서 돌지 않게
  last = now;
  const paused = credits.open || help.open || bag.open || tree.open || choosing || shopping !== null; // 크레딧·조작법·보관함·상점·이어하기 고르는 동안은 멈춘다
  pollInput(world, dt, paused);
  if (aiming && world.entities[0].state === 'dead') cancelAim();
  setAim(aiming ? aimGuide() : null);
  renderer.domElement.classList.toggle('aiming', !!aiming || amoving);
  if (paused || hitstop > 0) acc = 0; // 타격 멈춤 동안은 sim이 서 있다(명령은 큐에 남는다)
  else for (acc += dt; acc >= DT; acc -= DT) step(world, commands.splice(0));
  const events = soundEvents(heard, world);
  sound.play(events, world.entities[0].x, world.entities[0].z);
  stats.kills += events.filter((e) => e.name === 'skel_die' || e.name === 'boss_die').length;
  const o = outcome(world);
  if (!paused && !o) stats.time += dt;
  if (o === 'dead' && lostGold === null) {
    // 죽는 순간 금화 절반을 잃고 바로 저장(새로고침으로 피할 수 없게). 다시 시작하면 줄어든 금화로 같은 층
    lostGold = entry.gold - deathGold(entry.gold);
    entry = { ...entry, gold: deathGold(entry.gold) };
    saveRun(progress());
  }
  if (o === 'clear') clearRun(); // 다 깼으면 이어할 것이 없다
  const [hero, st] = [world.entities[0], world.stairs];
  if (stayed && (!st || Math.hypot(hero.x - st[0] - 0.5, hero.z - st[1] - 0.5) > STAIRS_AWAY) && !exitAt(world)) stayed = false; // 계단·출구에서 벗어나야 상점이 다시 열린다
  if (o === 'descend' && !shopping) {
    if (stayed) world.toStairs = false; // 계단 위에서 다시 눌러도 열리지 않는다
    else openShop();
  }
  heard = snapshot(world);
  draw(world, dt);
  drawAutomap(world);
  drawLabels(world, camera, renderer.domElement, signs);
  updateHud(world, hovered, choosing, stats, lostGold ?? 0);
  requestAnimationFrame(frame);
});
