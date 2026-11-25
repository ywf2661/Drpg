// 게임 흐름: 층 만들기·이동, 저장·이어하기, 입력 연결, 60Hz 고정 틱 루프. 화면 위 HTML은 hud.ts.
import { snapshot, soundEvents } from './audio/events';
import * as sound from './audio/sound';
import { $, initHud, say, sayLocked, sayShort, showBag, showPick, showTalk, showTalks, showTitle, showTree, showFloor, showLoadError, showShop, showSound, talking, updateHud } from './hud';
import { aim, aiming, amoving, cancelAim, commands, dragAim, fireAim, setSkillGate, hovered, initInput, pollInput, startAim, startAmove, type AimCmd } from './input';
import { drawAutomap, initAutomap, resetAutomap, toggleAutomap } from './render/automap';
import { hitstop } from './render/feel';
import { drawLabels, initLabels, type Sign } from './render/labels';
import { drawEcho, initEcho } from './render/echo';
import { camera, draw, headOf, initRender, renderer, setAim, setGaze, setWorld } from './render/render';
import { OUTRO, setOutro } from './render/ending';
import { setHideBeams, setHoldHalo } from './render/props';
import { walkable } from './sim/path';
import { loadSlots, saveRun, useSlot, type Keys, type Mods, type Ranks, type Stats } from './save';
import { buy, deathGold, sell } from './shop';
import { bossScale, cyclePower, FLOORS, floorPower } from './sim/dungeon';
import { makeMap, opposite, themeOf, type Side } from './sim/wilds';
import { isHub, PRAYER_WEAPON, uniqueOf, wear as wearGear, makeUnique, hurt, bagSpot, type Slot, FREE_AGAIN, FREE_GOAL, beatCount, runeRow, socketRune, unsocketRune, afterClear, bossHpScale, bossName, MARK_LETTER, markBit, markCount, markGold, captainNews, questOn, depthOf, tierOf, openLands, STORY, canAfford, LANDS, LAND_LIST, type Land, BLINK, ROLL, SKILL, CURSE, curseStat, AXE, BOLT, boltStat, PIERCE, RAIN, rainStat, TRAP, bind, chainStat, COMET, cometStat, copyMods, CORPSE, createWorld, exitAt, sideOf, DASH, GRAZE, dashStat, discardFromBag, DT, equipFromBag, moveGear, BAG, STASH, EXECUTE, FIREBALL, FIREFIELD, firefieldStat, fireRainStat, gainXp, HUNT, KEY_CD, LEAP, leapStat, learn as learnNow, newSkills, PLAGUE, plagueStat, PRISON, prisonStat, respec, TEMPEST, xpToNext, moveInBag, outcome, setLevel, step, type BagItem, type Gear, type HeroClass, type SkillId, type SkillName, type World } from './sim/world';
import { canSummonKnight, summonKnight } from './sim/gimmicks';
import { toughenBoss } from './sim/world';
import { ACT2_OPEN, act2Step, CHIEF_HINT, CLEANSED, KEG_HINT, LAKE_DONE, RAID_DONE, PRIEST, PRIEST_AGAIN, SICK, WELL } from './sim/act2';
import { ALL_RELICS, ARENA, hasAllRelics, hasHorse, missAfter, nameSalt, prayerFall, prayerMeet, PRAYER_RISE, relicCount, relicDue, RELICS, RELICS_READY, RELICS_AGAIN, RELICS_GOAL, SANCTUM, SANCTUM_DONE, TRACES, WITCH_LINES, EPILOGUE } from './sim/sanctum';

const credits = document.querySelector<HTMLDialogElement>('#credits')!;
const help = document.querySelector<HTMLDialogElement>('#help')!;
const bag = document.querySelector<HTMLDialogElement>('#bag')!;
bag.addEventListener('close', () => (stashOpen = false));
const tree = document.querySelector<HTMLDialogElement>('#tree')!;
// 새 판의 시작 상태: 2단계 장비(기사 = 숏소드 + 가죽 갑옷·두건·장화, 마법사 = 마법 막대 + 견습 로브·두건·장화)
const startOf = (cls: HeroClass): Carry => ({ pity: 0, cls, potions: 2, gear: { weapon: 2, armor: 2, helm: 2, boots: 2 }, mods: { weapon: [], armor: [], helm: [], boots: [] }, level: 1, xp: 0, gold: 0, ...newSkills(cls), points: 0, bag: [], runes: {}, autoEquip: true });
type Carry = { pity: number; cls: HeroClass; potions: number; gear: Gear; mods: Mods; level: number; xp: number; gold: number; ranks: Ranks; points: number; keys: Keys; bag: BagItem[]; runes: World['runes']; autoEquip: boolean };
// 다음 층(또는 상점·회차)으로 가져갈 것만 복사. World·저장(Run)도 이 필드를 다 갖고 있다
const carryOf = (c: Carry): Carry => ({ pity: c.pity, cls: c.cls, potions: c.potions, gear: { ...c.gear }, mods: copyMods(c.mods), level: c.level, xp: c.xp, gold: c.gold, ranks: { ...c.ranks }, points: c.points, keys: { ...c.keys }, bag: [...c.bag], runes: { ...c.runes }, autoEquip: c.autoEquip });
const newStats = (): Stats => ({ time: 0, kills: 0, deaths: 0 });
const slots = loadSlots(); // 저장 슬롯 셋(있으면 시작 화면에 이어하기)
let name = ''; // 아이디(새 게임에서 입력)
let choosing = true; // 시작 화면(이어하기·직업 선택)을 보는 중. 뒤에는 기사 1층이 미리 그려져 있다
let stats = newStats(); // 이번 판 기록(이어하기면 저장된 것부터)
let floor = 0;
let land: Land = 'camp'; // 지역. 한 판은 야영지에서 시작하고, 야영지 출구는 초원 1구역(갈림길에서 열린 지역을 고른다)
let from: Side = 'w'; // 바깥 지역에서 들어온 가장자리(나간 출구의 맞은편)
let next: { land: Land; from: Side; floor: number } = { land, from, floor: 1 }; // 상점을 떠나면 갈 곳(출구를 지날 때 정한다)
let cycle = 0; // 회차(0 = 첫 판). 마지막 이야기(폐허) 보스를 잡으면 1씩
let stage = 0; // 이야기 단계(STORY). 지금 단계 지역의 보스를 잡으면 다음 단계
let marks = 0; // 지금 단계 지역 의뢰의 진행(비트: 2·3·4구역). 죽어도 남고, 단계가 넘어가면 0
let news = false; // 순찰대장에게 아직 안 들은 이야기(야영지에 오자마자 말을 걸지 않고 머리 위 !)
let took = false; // 지금 단계 의뢰의 부탁을 주민에게 받았다(부탁이 있는 의뢰만 의미). 단계가 넘어가면 false
// 2회차부터(순서 자유): beat = 이번 회차에 깬 지역 보스(비트, 이야기 순서), marksBy = 지역마다 의뢰 진행(stage는 마지막으로 고른 지역)
let beat = 0;
let marksBy = [0, 0, 0, 0];
// 무너진 성소: relics = 모은 성물(비트, STORY 순서, 회차가 넘어가도 남는다), relicMiss = 지역마다 성물을 놓친 횟수(두 번이면 다음은 확정)
let relics = 0;
let relicMiss = [0, 0, 0, 0];
// 야영지 창고(캐릭터마다). 창고를 눌러 연 보관함 창에서만 넣고 뺀다(stashOpen)
let stash: BagItem[] = [];
let stashOpen = false;
let act2 = 0; // 2막 진행(0 = 아직 안 열림, sim/act2.ts). 기도하는 자를 처음 쓰러뜨리고 야영지에 오면 1
// 죽거나 보스를 깨면 돌아오는 거점: 2막 땅(지금은 천막뿐)에서는 원정대 천막, 그 밖은 야영지
// ponytail: 2막 땅이 생기면 여기에 더한다(지금은 호숫가)
const hubOf = (l: Land): Land => (l === 'tent' || l === 'lake' || l === 'raid' ? 'tent' : 'camp');
// ponytail: 성소가 열렸을 때·성기사를 쓰러뜨렸을 때의 순찰대장 말은 저장하지 않는다(새로고침하면 늘 하던 말). 남겨야 하면 Run에 한 줄
let captainLine: string[] | null = null;
// 성소 5층: risen = 체력 절반 한 줄을 했다, fell = 쓰러진 뒤 대화를 했다(층마다 처음부터)
let [risen, fell] = [false, false];
// 5층 첫 만남 연출: wait = 통로를 빠져나오길 기다림 → walk = 레터박스, 남쪽 두 성소 사이까지 저절로 걷기 → look = 기도하는 자를 바라봄 → talk = 대화. 대화가 끝나면 기도하는 자가 주인공을 노린다
let intro: 'wait' | 'walk' | 'look' | 'talk' | null = null;
let introT = 0;
const INTRO_LOOK = 1.5; // 바라보는 시간(초)
// 엔딩 1(처음 쓰러뜨릴 때): 쓰러진 뒤 대사를 닫으면 흐르는 연출 시간(render/ending.ts OUTRO). 대화창이 열린 동안은 멈춘다. null = 없음
let outro: number | null = null;
const outroOn = () => outro !== null && outro < OUTRO.end;
let ending = false; // 엔딩 2(검은 화면·후일담·크레딧)를 보는 중
const letterbox = (on: boolean) => ($('#letterbox').classList.toggle('on', on), document.body.classList.toggle('cine', on)); // 연출: 띠 + UI 숨김
let entry: Carry = startOf('knight'); // 이 층에 들어올 때의 물약·장비·레벨(사망 후 다시 시작하면 이것으로)
// 지역 의뢰: 지금 이야기 단계의 지역에서만. 이 구역에 놓을 대상 글자(2·3·4구역, 아직 안 끝낸 구역)
const questHere = () => STORY[stage].land === land;
// 성소 1~4층: 층마다 흔적 하나(TRACES, 글자는 단서와 같은 L)
const markLetter = () => (land === 'sanctum' ? (floor < FLOORS ? 'L' : undefined) : questHere() && questOn(stage, took) && markBit(floor) && !(marks & markBit(floor)) ? MARK_LETTER[STORY[stage].quest.kind] : undefined);
// 성물이 다 모였고 아직 기도하는 자를 쓰러뜨리지 않았다: 성소로 안내한다
const sanctumNext = () => cycle > 0 && hasAllRelics(relics) && !hasHorse(relics);
const goalLine = () => hubOf(land) === 'tent' ? act2Step(act2).goal : sanctumNext() ? RELICS_GOAL : (cycle ? `${FREE_GOAL} ${beatCount(beat)}/${STORY.length}` : STORY[stage].goal) + (questOn(stage, took) ? ` · ${STORY[stage].quest.name} ${markCount(marks)}/3` : '');
let world = makeFloor(floor, entry);
let lostGold: number | null = null; // 이번 죽음에서 잃은 금화(null = 아직 안 죽음)
let clearT = 0; // 보스를 쓰러뜨린 뒤 흐른 초. LOOT_TIME 전에는 결과 버튼이 없다(공격하던 연타가 버튼을 누르지 않게)
const LOOT_TIME = 2.5;
let shopping: Carry | null = null; // 계단을 내려가 상점을 보는 중(다음 층으로 가져갈 상태)
let stayed = false; // 상점에서 '이 층에 남기'를 골랐다: 계단에서 벗어났다가 다시 와야 상점이 열린다
const STAIRS_AWAY = 1.5; // 이만큼 멀어지면 벗어난 것(m). 계단 그림(3×3칸)의 바깥
let signs: Sign[] = []; // 이 구역의 출구 이름표
// 출구마다(같은 지역 칸끼리 묶어 가운데) "▶ 설원 3구역", 바깥 지역의 계단은 동굴 입구 "▼ 지하 3층"
// 출구 너머의 구역 번호: 같은 지역이면 다음 구역, 갈림길(초원 1구역)에서 새 지역으로 가면 그 지역의 1구역
const nextFloor = (to: Land) => (isHub(to) ? 0 : to === land ? floor + 1 : 1);
const middle = (cells: { x: number; z: number }[]) => ({ x: cells.reduce((a, e) => a + e.x, 0) / cells.length + 0.5, z: cells.reduce((a, e) => a + e.z, 0) / cells.length + 0.5 });
const CHEST_SIGN: Partial<Record<string, string>> = { elder: '순찰대장', merchant: '상인', asker: '주민', stash: '창고', priest: '사제', sick: '앓는 주민', keg: '화약통' };
// 머리 위 !: 순찰대장은 새 이야기가 있을 때, 의뢰인은 아직 안 맡긴 부탁이 있을 때
const alertOf = (kind?: string) => (kind === 'elder' ? news : kind === 'priest' ? act2 < 2 : kind === 'asker' && !questOn(stage, took));
const QUEST_CHESTS = ['clue', 'beacon', 'keeper', 'seal'];
function signsOf(w: World): Sign[] {
  const out: Sign[] = [];
  for (const to of ['field', 'snow', 'ruins', 'sanctum', 'tent', 'camp', 'lake', 'raid'] as const) {
    const cells = w.exits.filter((e) => e.to === to);
    const mark = to === 'sanctum' ? '▼' : '▶';
    if (cells.length) out.push({ ...middle(cells), text: isHub(to) ? `${mark} ${LANDS[to].name}` : `${mark} ${LANDS[to].name} ${nextFloor(to)}${LANDS[to].unit}` });
    const shut = w.locked.filter((e) => e.to === to);
    if (shut.length && to !== 'sanctum') out.push({ ...middle(shut), text: `▶ ${LANDS[to].name} (길이 막혔다)` }); // 성소 입구 자리는 이름표 없이 땅만 갈라진다
  }
  for (const c of w.chests) {
    const text = QUEST_CHESTS.includes(c.kind ?? '') ? (c.open ? '' : land === 'sanctum' ? TRACES[floor - 1]?.name : STORY[stage].quest.sign) : c.kind === 'keg' && c.open ? '' : CHEST_SIGN[c.kind ?? '']; // 터진 화약통은 이름표를 뗀다
    if (text) out.push({ x: c.x + 0.5, z: c.z + 0.5, text, alert: alertOf(c.kind) });
  }
  if (land !== 'dungeon' && land !== 'sanctum' && w.stairs) out.push({ x: w.stairs[0] + 0.5, z: w.stairs[1] + 0.5, text: `▼ ${LANDS.dungeon.name} ${nextFloor('dungeon')}${LANDS.dungeon.unit}` });
  return out;
}
const progress = () => ({ name, floor, ...entry, cycle, stats, land, from, stage, marks, news, took, beat, marksBy: [...marksBy], relics, relicMiss: [...relicMiss], stash, act2 }); // 저장할 진행

// 층마다 새 시드(sim 밖이라 Math.random 사용). 몬스터 세기·떨어지는 장비 상한은 이야기 깊이(5k + n)로 — 지역을 넘어 이어진다
function makeFloor(n: number, carry: Carry): World {
  const seed = Math.floor(Math.random() * 2 ** 31);
  const depth = depthOf(land, n);
  const w = createWorld(seed, makeMap(seed, n, land, from, [...openLands(stage, cycle), ...(hasAllRelics(relics) ? (['sanctum'] as const) : []), ...(act2 ? (['tent'] as const) : []), ...(act2 >= 3 ? (['raid'] as const) : [])], markLetter()), floorPower(depth, cycle), cyclePower(cycle), LANDS[land].skins, depth > FLOORS);
  w.cls = carry.cls;
  w.rest = land === 'field' || land === 'lake' || land === 'raid' || isHub(land); // 초원·호숫가·거점 모닥불에서 쉴 수 있다
  w.land = land;
  w.potions = carry.potions;
  w.gear = { ...carry.gear };
  w.mods = copyMods(carry.mods);
  w.gold = carry.gold;
  w.ranks = { ...carry.ranks };
  w.points = carry.points;
  w.keys = { ...carry.keys };
  w.bag = [...carry.bag];
  w.runes = { ...carry.runes };
  w.autoEquip = carry.autoEquip;
  w.pity = carry.pity;
  w.maxTier = tierOf(depth);
  setLevel(w, carry.level, carry.xp);
  toughenBoss(w, bossScale(depth)); // 깊은 지역 보스는 그 구역 몬스터만큼 세다
  // 보스 약화 의뢰: 끝낸 만큼 이 지역 보스가 약하다. 셋 다 끝냈으면 전설 확정
  if (questHere() && n === FLOORS && STORY[stage].quest.reward === 'weaken') {
    const k = markCount(marks);
    for (const e of w.entities) if (e.kind === 'boss') e.hp = e.maxHp = Math.round(e.maxHp * bossHpScale(k));
    w.sureLegend = k === 3;
  }
  w.relics = relics;
  // 성물: 그 회차에 그 지역 보스를 처음 깨는 판이면 굴린다(회차·지역·이름으로 정해져 다시 들어가도 같다)
  const k = runeRow(land);
  if (n === FLOORS && k >= 0 && afterClear(stage, cycle, land, beat).advanced && relicDue(relics, relicMiss, k, cycle, nameSalt(name))) w.relicDrop = k;
  // 기도하는 자: 고리가 깨진 창에만 맞으니 체력을 낮추고, 쓰러뜨리면 전설 확정. 처음(목마가 없다)이면 「금 간 빛 고리」·작은 목마 확정, 그 뒤엔 빛 고리가 낮은 확률로
  if (land === 'sanctum' && n === FLOORS) {
    for (const e of w.entities) if (e.kind === 'boss') e.hp = e.maxHp = Math.round(e.maxHp * SANCTUM.bossHp);
    w.sureLegend = true;
    w.horseDrop = !hasHorse(relics);
    w.haloDrop = w.horseDrop ? 1 : SANCTUM.haloAgain;
  }
  return w;
}

function enterFloor(n: number, carry: Carry) {
  floor = n;
  lostGold = null;
  clearT = 0;
  stayed = false;
  entry = carryOf(carry);
  saveRun(progress()); // 층에 들어갈 때마다 자동 저장
  world = makeFloor(n, entry);
  signs = signsOf(world);
  kegsBlown = 0;
  setWorld(world, themeOf(n, land));
  resetAutomap(world);
  commands.length = 0; // 이전 층에서 쌓인 명령을 새 층에 적용하지 않는다
  showFloor(n, cycle, land, goalLine());
  [risen, fell] = [false, false];
  intro = land === 'sanctum' && n === FLOORS ? 'wait' : null;
  outro = null;
  setOutro(null);
  setHoldHalo(world.horseDrop); // 처음 쓰러뜨리는 판: 빛 고리는 마녀 앞에서 떨어질 때 나타난다
  letterbox(false);
  setGaze(null);
  sound.playMusic(sound.musicFor(n));
}

// 거점으로(죽었을 때·보스를 깼을 때): 그 땅의 거점(hubOf). fresh = 순찰대장에게 새 이야기가 생겼다(바로 말을 걸지 않고 머리 위 !, 누르면 한다)
function toCamp(carry: Carry, fresh = false) {
  [land, from] = [hubOf(land), 'w'];
  if (fresh) news = true;
  enterFloor(0, carry);
}

// 출구·계단에 들어서면: 야영지 출구는 바로 초원 1구역, 그 밖은 떠돌이 상인을 거쳐 다음 구역
function leave() {
  const ex = exitAt(world);
  const to: Land = ex ? ex.to : land === 'sanctum' ? 'sanctum' : 'dungeon'; // 계단: 성소에선 다음 층
  next = { land: to, from: ex ? opposite[sideOf(world, ex)] : 'w', floor: nextFloor(to) };
  // 2회차부터: 다른 지역으로 가면 그 지역이 지금 의뢰 지역(하던 지역의 진행은 따로 둔다)
  const k = runeRow(to);
  if (cycle && k >= 0 && k !== stage) {
    marksBy[stage] = marks;
    [stage, marks, took] = [k, marksBy[k], true];
  }
  if (!isHub(land)) return openShop(false); // 거점에서 나갈 때는 상점 없이 바로
  if (to === 'tent' && captainLine?.includes(ACT2_OPEN)) [news, captainLine] = [false, null]; // 원정길 이야기를 안 듣고 왔어도 길은 찾았다(천막에서 "북쪽 길로" 소리를 하지 않게)
  ({ land, from } = next);
  enterFloor(next.floor, carryOf(world));
}

// 주민(배경)이 하는 말: 누를 때마다 다음 줄
// 성물이 둘 이상이면 땅 밑 기도 소리 한 줄이 섞인다
const VILLAGER = ['불 곁을 떠나지 마세요. 해가 지면 초원도 위험해요.', '정찰병은 아직 소식이 없대요.', '할머니가 그러는데, 초원 밑에 옛 왕국이 잠들어 있대요. 다 옛날이야기지만요.', '순찰대장님이 요즘 잠을 못 주무세요.', '상인한테 물약은 넉넉히 사 두세요.'];
const MURMUR = '요즘 밤마다 땅 밑에서 웅얼거리는 소리가 나요. 꼭 누가 기도하는 것 같아요.';
const chat = () => { const lines = relicCount(relics) >= 2 ? [...VILLAGER, MURMUR] : VILLAGER; return lines[chatter++ % lines.length]; };
let chatter = 0;
let kegsBlown = 0; // 이 맵에서 터진 화약통 수(이름표를 다시 달 때)
let kegHint = false;
let chiefHint = false; // 우두머리 안내 한 줄(판마다 한 번) // 화약통 안내 한 줄을 보였다(판마다 한 번)

// NPC·단서를 누르면(sim이 w.talk를 남긴다)
function talkTo(t: NonNullable<World['talk']>) {
  if (t === 'merchant') return openShop(true);
  if (t === 'stash') return (stashOpen = true), renderBag();
  if (t === 'villager') return say(chat());
  if (t === 'clue' && land === 'sanctum' && TRACES[floor - 1]) {
    signs = signsOf(world); // 읽은 흔적은 이름표를 뗀다
    return showTalk(TRACES[floor - 1].name, TRACES[floor - 1].text);
  }
  if (t === 'asker') return askerTalk();
  if (t === 'well') return say(world.sluice?.wells.some((w) => w.dirty) ? WELL.dirty : WELL.clean);
  if (t === 'sick') return showTalk('앓는 주민', world.sluice?.purified ? SICK.well : SICK.ill);
  if (t === 'priest') {
    if (act2 >= 2) return showTalk('사제', PRIEST_AGAIN);
    act2 = 2;
    showTalks(PRIEST.map((t): [string, string] => ['사제', t]));
    return changed();
  }
  if (t === 'elder') {
    if (!news) return showTalk('순찰대장', land === 'tent' ? act2Step(act2).again : sanctumNext() ? RELICS_AGAIN : cycle ? FREE_AGAIN : STORY[stage].again);
    news = false;
    const line = stage === 0 && cycle === 1 && hasAllRelics(relics) && !hasHorse(relics) ? RELICS_READY : captainNews(stage, cycle); // 1회차를 막 끝냈다: 성소가 열렸다
    showTalks((captainLine ?? [line]).map((t): [string, string] => ['순찰대장', t]));
    captainLine = null;
    return changed();
  }
  // 흔적의 글은 의뢰 대상을 끝낼 때(markDone) 나온다
}

// 의뢰인 주민: 부탁이 있는 의뢰면 맡기고(들으면 수락), 맡긴 뒤엔 진행을, 끝났거나 부탁이 없으면 잡담
function askerTalk() {
  const q = STORY[stage].quest;
  if (!q.ask || markCount(marks) === 3) return say(chat());
  if (took) return showTalk('주민', `${q.name} ${markCount(marks)}/3 — 잘 부탁해요.`);
  took = true;
  showTalk('주민', q.ask);
  changed();
}

// 야영지·의뢰 상태가 바뀌었다: 이름표(!)·임무 줄을 다시 그리고 바로 저장
function changed() {
  signs = signsOf(world);
  saveRun(progress());
  showFloor(floor, cycle, land, goalLine());
}

// 의뢰 대상 하나를 끝냈다: 진행을 켜고 이야기 조각(찾은 순서), 셋째면 스킬 포인트. 바로 저장(죽어도 남는다)
// 성물을 주웠다(바닥에서든 보스를 깨고 야영지로 가며 챙겼든)
function gotRelic(k: number) {
  world.relicGot = -1;
  if ((relics >> k) & 1) return;
  relics |= 1 << k;
  world.relics = relics;
  say(`${RELICS[k]}${(RELICS[k].charCodeAt(RELICS[k].length - 1) - 0xac00) % 28 ? '을' : '를'} 얻었다`); // 무엇에 쓰는지·몇 개인지는 말하지 않는다(초원 땅이 갈라지는 걸 보고 눈치채게)
  saveRun(progress());
}
function markDone() {
  const bit = markBit(floor);
  if (!questHere() || !bit || marks & bit) return;
  const q = STORY[stage].quest;
  const piece = q.marks[markCount(marks)];
  marks |= bit;
  const n = markCount(marks);
  const boss = bossName(LANDS[land].skins);
  // 보상: 금화 의뢰는 조각마다 금화, 약화 의뢰는 보스 체력(makeFloor). 셋째면 스킬 포인트(약화 의뢰는 전설 확정까지). 죽어도 남게 entry에도
  const gold = q.reward === 'gold' ? markGold(land, floor) : 0;
  world.gold += gold;
  entry.gold += gold;
  let note = `(${q.name} ${n}/3 — ${gold ? `금화 +${gold}` : `${boss}의 힘이 줄었다`})`;
  if (n === 3) {
    world.points++;
    entry.points++;
    note = `(${q.name} 완료 — ${gold ? `금화 +${gold}, 스킬 포인트 +1` : `스킬 포인트 +1, ${boss}의 전설 장비 확정`})`;
  }
  showTalk(piece.name, `${piece.text}\n\n${note}`);
  changed(); // 끝낸 대상의 이름표를 지운다
}

// 상점: 구역 사이의 떠돌이 상인(떠나면 산 것을 가지고 next로) 또는 야영지 상인(camp, 닫으면 그대로 야영지)
function openShop(camp: boolean) {
  shopping = carryOf(world);
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
        enterFloor(next.floor, c);
      },
      () => {
        // 남기: 사고판 것은 그대로 가지고 이 층에서 계속한다
        const c = shopping!;
        shopping = null;
        stayed = true;
        Object.assign(world, { potions: c.potions, gear: { ...c.gear }, gold: c.gold, bag: [...c.bag], runes: { ...c.runes }, toStairs: false });
      },
      `${LANDS[next.land].name} ${next.floor}${LANDS[next.land].unit}`,
      camp,
    );
  render();
}

function begin(n: number, carry: Carry) {
  choosing = false;
  showTitle(false);
  enterFloor(n, carry);
}

// 죽으면 야영지로: 그 구역에 들어올 때의 물약·장비로(금화는 절반). 지역 진행은 기억하지 않는다
function restart() {
  if (outcome(world) !== 'dead') return;
  stats.deaths++;
  toCamp(entry);
}

// 보스를 잡은 뒤 야영지로: 지금 이야기 단계의 보스면 다음 단계(마지막이면 회차 + 1), 순찰대장이 다음 이야기를 한다
function backToCamp() {
  if (outcome(world) !== 'clear' || clearT < LOOT_TIME || ending) return;
  if (land !== 'sanctum' || !world.horseDrop) return goCamp();
  // 처음 쓰러뜨린 판: 줍지 않은 고유 장비는 가방(자리가 없으면 창고)에 넣고, 어두워진 뒤 야영지로 → 후일담·크레딧
  for (const it of world.items) {
    if (!it.affixes || !uniqueOf({ affixes: it.affixes })) continue;
    const g = { kind: it.kind as Slot, tier: it.tier, affixes: it.affixes };
    const [box, at] = bagSpot(world.bag, g) ? [world.bag, bagSpot(world.bag, g)!] : [stash, bagSpot(stash, g, STASH)];
    if (at) box.push({ ...g, x: at[0], y: at[1] });
  }
  void epilogue(goCamp);
}

// 엔딩 2: 화면이 어두워지면 go(야영지로) → 후일담 한 줄씩 → 크레딧이 올라간다(아무 키나 누르면 건너뜀) → 밝아진다
async function epilogue(go: () => void) {
  const wait = (s: number) => new Promise((r) => setTimeout(r, s * 1000));
  const [box, line, roll] = [$('#ending'), $('#ending-line'), $('#ending-roll')];
  ending = true;
  box.classList.add('on');
  await wait(1.2);
  go();
  for (const text of EPILOGUE) {
    line.textContent = text;
    line.classList.add('show');
    await wait(2.4);
    line.classList.remove('show');
    await wait(0.9);
  }
  roll.innerHTML = `<h2>The Prayer</h2>${[...$('#credits').querySelectorAll('p')].map((p) => p.outerHTML).join('')}`;
  roll.classList.add('go');
  await Promise.race([
    new Promise((r) => roll.addEventListener('animationend', r, { once: true })),
    new Promise((r) => addEventListener('keydown', r, { once: true })),
    new Promise((r) => box.addEventListener('pointerdown', r, { once: true })),
  ]);
  box.classList.remove('on');
  await wait(1);
  roll.classList.remove('go');
  ending = false;
}

function goCamp() {
  for (const it of world.items) if (it.kind === 'rune') world.runes[it.rune!] = (world.runes[it.rune!] ?? 0) + 1; // 보스 자리에 남은 룬은 챙겨 간다
  for (const it of world.items) if (it.kind === 'relic') gotRelic(it.relic!); // 줍지 않은 성물도
  const k = runeRow(land);
  const was = cycle;
  const after = afterClear(stage, cycle, land, beat);
  ({ stage, cycle, beat } = after);
  if (after.advanced) relicMiss = missAfter(relicMiss, k, !!((relics >> k) & 1)); // 회차 첫 처치에 성물이 안 나왔으면 놓친 횟수 +1
  if (after.advanced) {
    [marks, took] = [0, cycle > 0];
    marksBy[stage] = 0;
  }
  if (after.newCycle) marksBy = [0, 0, 0, 0];
  if (land === 'sanctum') [news, captainLine] = [true, world.horseDrop && !act2 ? [SANCTUM_DONE, ACT2_OPEN] : [SANCTUM_DONE]];
  if (land === 'lake') [act2, news, captainLine] = [Math.max(act2, 3), true, [LAKE_DONE]];
  if (land === 'raid') [act2, news, captainLine] = [Math.max(act2, 4), true, [RAID_DONE]]; // 약탈자 우두머리: 다음 곳(광산) 이야기 // 뱃사공: 원정대 천막의 순찰대장이 다음 길 이야기
  if (land === 'sanctum' && world.horseDrop) act2 = Math.max(act2, 1); // 처음 쓰러뜨렸다: 2막이 열린다(야영지 북쪽 원정길)
  toCamp(carryOf(world), after.advanced && (!was || after.newCycle)); // 2회차부터 순찰대장은 회차가 넘어갈 때만 새로 말한다
  if (after.newCycle) say(`${cycle + 1}회차 — 몬스터가 강해졌다`);
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
    socket: (t, r) => {
      const ok = socketRune(world, t, r);
      if (ok) renderBag();
      return ok;
    },
    unsocket: (t, k) => {
      unsocketRune(world, t, k);
      renderBag();
    },
    auto: (on) => {
      // 설정은 진행이 아니므로 바로 저장한다(사망·새로고침에도 유지)
      world.autoEquip = entry.autoEquip = on;
      saveRun(progress());
    },
  }, stashOpen ? {
    items: stash,
    // 보관함 ↔ 창고. 야영지(죽지 않는 곳)라 지금 상태를 입구 기록으로 삼아 함께 저장한다(새로고침으로 장비가 둘이 되지 않게)
    move: (a, i, b, at) => {
      const ok = moveGear(a === 'bag' ? world.bag : stash, i, b === 'bag' ? world.bag : stash, b === 'bag' ? BAG : STASH, at);
      if (ok) {
        entry = carryOf(world);
        saveRun(progress());
      }
      renderBag();
      return ok;
    },
  } : undefined);
}

// 보관함·스킬 창을 열 수 있나: 죽은 때만 빼고(보스를 깬 뒤에도 가방을 비워 전리품을 줍고, 포인트를 쓴다)
const canOpen = () => !choosing && !shopping && outcome(world) !== 'dead' && !document.querySelector('dialog[open]');

function openBag() {
  if (canOpen()) renderBag();
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
  if (canOpen()) renderTree();
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
  graze: () => ({ kind: 'line', len: GRAZE.dist, width: GRAZE.near * 2 }),
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
  if (world.keys[CMD_SKILL[cmd]] === 'cleave' || world.keys[CMD_SKILL[cmd]] === 'mark') return { kind: 'line', len: SKILL.radius, width: SKILL.radius * 2 };
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
const pickClass = (cls: HeroClass, id: string, n: number) => {
  useSlot(n);
  name = id;
  stats = newStats();
  [cycle, stage, land, from, marks, news, took, beat, marksBy, relics, relicMiss, stash, act2] = [0, 0, 'camp', 'w', 0, true, false, 0, [0, 0, 0, 0], 0, [0, 0, 0, 0], [], 0];
  begin(0, startOf(cls));
  if (!slots.some(Boolean)) help.showModal();
};
showTitle(true, slots);
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
  nextCycle: backToCamp,
  toggleMap: toggleAutomap,
  sound: (patch) => {
    sound.setSound(patch);
    showSound(sound.settings);
  },
  resume: (n) => {
    const saved = slots[n];
    if (!saved) return;
    useSlot(n);
    name = saved.name;
    stats = { ...saved.stats };
    ({ cycle, stage, land, from, marks, news, took, beat, relics, act2 } = saved);
    if (hasHorse(relics) && !act2) [act2, news, captainLine] = [1, true, [ACT2_OPEN]]; // 2막이 생기기 전에 기도하는 자를 쓰러뜨린 판
    marksBy = [...saved.marksBy];
    relicMiss = [...saved.relicMiss];
    stash = [...saved.stash];
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
initEcho($('#labels'));
sound.initSound();
sound.playMusic(sound.musicFor(floor)); // 곡만 정해 두고, 첫 입력 때 재생
showSound(sound.settings);
resetAutomap(world);
showFloor(floor, cycle, land, goalLine());
// 스킬 Q W E R(하단 버튼 순서), 물약 1. R은 사망 화면에서는 다시 시작(클리어 화면은 버튼으로만).
// e.code: 한글 입력 상태에서도 물리 키
const ended = () => outcome(world) === 'dead'; // 클리어 뒤 R(도끼 키 연타)로 '처음부터'가 눌리지 않게 — 클리어는 버튼으로만
const SKILL_KEYS: Record<string, SkillName> = { KeyQ: 'cleave', KeyW: 'dash', KeyE: 'shout', KeyR: 'throw' };
addEventListener('keydown', (e) => {
  if ((e.target as Element).matches?.('input[type=text], input:not([type])')) return; // 아이디를 치는 동안은 게임 키가 아니다
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
// 테스터 모드: 주소 끝에 ?test를 붙이면 왼쪽 위에 레벨 +5·다음 층 버튼(배포판에서도 폰으로 시험할 수 있게)
// ponytail: 진행 저장에도 그대로 남는다(테스트로 올린 레벨·층). 섞이는 게 싫으면 테스터 모드에서는 saveRun을 건너뛸 것
if (new URLSearchParams(location.search).has('test')) {
  $('#tester').hidden = false;
  const playing = () => !choosing && !shopping && !outcome(world);
  $('#test-level').addEventListener('click', () => {
    if (playing()) for (let i = 0; i < 5; i++) gainXp(world, xpToNext(world.level) - world.xp); // 5레벨씩
  });
  $('#test-floor').addEventListener('click', () => playing() && floor < FLOORS && enterFloor(floor + 1, carryOf(world)));
  $('#test-land').addEventListener('click', () => {
    if (!playing()) return;
    land = LAND_LIST[(LAND_LIST.indexOf(land) + 1) % LAND_LIST.length];
    enterFloor(isHub(land) ? 0 : Math.max(1, floor), carryOf(world)); // 거점(층 0)에서 바깥 땅으로 넘어가면 1구역부터
  });
  // 최종 보스: 주인공 근처에 기도하는 자(그 회차 성소 5층과 같은 수치, 야영지 제외)
  $('#test-knight').addEventListener('click', () => {
    if (playing() && canSummonKnight(world)) summonKnight(world, cycle); // 그 회차의 성소 5층 기도하는 자와 같은 수치
  });
  $('#test-warden').addEventListener('click', () => {
    if (playing() && canSummonKnight(world)) summonKnight(world, cycle, 'time_warden'); // 그림 시험: 수치는 기사와 같고 전용 기술은 없다
  });
  // 전설 무기: 지금 직업의 전설 무기를 4단계로 만들어 가방에 넣고 바로 입는다(입던 무기는 가방으로). 가방이 꽉 차면 그냥 입는다(입던 무기는 사라진다)
  $('#test-legend').addEventListener('click', () => {
    if (!playing()) return;
    const hero = world.entities[0];
    const it = makeUnique(world, PRAYER_WEAPON[world.cls], hero.x, hero.z, 4);
    const gear = { kind: it.kind as Slot, tier: it.tier, affixes: it.affixes! };
    const at = bagSpot(world.bag, gear);
    if (!at) return void wearGear(world, gear);
    world.bag.push({ ...gear, x: at[0], y: at[1] });
    equipFromBag(world, world.bag.length - 1);
  });
  // 결전 준비: 레벨 40(스킬 포인트 포함) + 정예 사냥꾼 세트 4부위(4단계, 입던 것은 사라진다) → 성소 5층
  $('#test-prayer').addEventListener('click', () => playing() && readyPrayer());
  // 엔딩 보기: 결전 준비 → 첫 만남 연출을 건너뛰고 성소를 끈 채 기도하는 자를 한 번에 쓰러뜨린다. 목마가 있어도 "처음 쓰러뜨리는 판"으로
  $('#test-ending').addEventListener('click', () => {
    if (!playing()) return;
    readyPrayer();
    Object.assign(world, { horseDrop: true, haloDrop: 1 });
    setHoldHalo(true);
    intro = null;
    const hero = world.entities[0];
    Object.assign(hero, { x: ARENA.center[0] + 0.5, z: ARENA.altars[2][1] + 1.5, path: [], target: null });
    for (const c of world.chests) if (c.kind === 'altar') c.open = true;
    const boss = world.entities.find((e) => e.kind === 'boss')!;
    hurt(world, boss, boss.hp, hero);
  });
  function readyPrayer() {
    for (let i = 0; i < 40 && world.level < 40; i++) gainXp(world, xpToNext(world.level) - world.xp);
    const hero = world.entities[0];
    for (const u of ['hunterWeapon', 'hunterArmor', 'hunterHelm', 'hunterBoots'] as const) {
      const it = makeUnique(world, u, hero.x, hero.z, 4);
      wearGear(world, { kind: it.kind as Slot, tier: it.tier, affixes: it.affixes! });
    }
    relics |= ALL_RELICS; // 성물 넷(작은 목마는 처음 쓰러뜨릴 때 받게 둔다)
    land = 'sanctum';
    enterFloor(FLOORS, carryOf(world));
  }
}
// 헤드리스 확인용: 현재 world, 명령 큐, 층 바로 가기
if (import.meta.env.DEV) Object.assign(window, { __game: { get world() { return world; }, commands, goto: (n: number, l: Land = land) => ((land = l), enterFloor(n, world)), get played() { return sound.played; }, get outro() { return outro; } } });

// 5층 첫 만남 연출 한 프레임(intro 참고). 연출 중엔 플레이어 명령을 버린다
function introStep(dt: number, cut: boolean) {
  const hero = world.entities[0];
  const [cx, cz] = ARENA.center;
  const spot = { type: 'move', x: cx + 0.5, z: ARENA.altars[2][1] + 1.5 } as const; // 남쪽 두 성소를 잇는 줄 조금 앞(기도하는 자가 알아채는 거리 밖)
  if (cut) commands.length = 0;
  if (intro === 'wait' && hero.z < cz + ARENA.r - 0.5) {
    intro = 'walk';
    letterbox(true);
    commands.length = 0;
  }
  if (intro === 'walk' && Math.hypot(hero.x - spot.x, hero.z - spot.z) > 0.3) {
    if (!hero.path.length) commands.push(spot); // 아직 안 걸었으면(이번 프레임에 sim이 안 돌았어도 다음 프레임에 다시)
  } else if (intro === 'walk') {
    [intro, introT] = ['look', 0];
    setGaze({ x: (hero.x + cx + 0.5) / 2, z: (hero.z + cz + 0.5) / 2 });
    say('성소 넷이 기도하는 자를 감싸고 있다');
  } else if (intro === 'look' && (introT += dt) >= INTRO_LOOK) {
    intro = 'talk';
    showTalks(prayerMeet(!hasHorse(relics))); // 열려 있는 동안 싸움은 멈춘다
  } else if (intro === 'talk' && !talking()) {
    intro = null;
    letterbox(false);
    setGaze(null);
    const boss = world.entities.find((e) => e.kind === 'boss' && e.state !== 'dead');
    if (boss) Object.assign(boss, { target: hero.id, repathT: 0 }); // 멀리서 성소만 끄지 못하게 바로 노린다
  }
}

let heard = snapshot(world); // 직전 프레임 상태(효과음 비교용)
let acc = 0;
let last = performance.now();
requestAnimationFrame(function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.25); // 탭 전환 후 복귀 시 수천 틱 몰아서 돌지 않게
  last = now;
  const paused = credits.open || help.open || bag.open || tree.open || talking() || choosing || shopping !== null || ending; // 크레딧·조작법·보관함·상점·이어하기 고르는 동안은 멈춘다
  const cut = intro === 'walk' || intro === 'look' || outroOn();
  pollInput(world, dt, paused || cut);
  if (cut) commands.length = 0;
  if (intro) introStep(dt, cut);
  if (aiming && world.entities[0].state === 'dead') cancelAim();
  setAim(aiming ? aimGuide() : null);
  renderer.domElement.classList.toggle('aiming', !!aiming || amoving);
  if (paused || hitstop > 0) acc = 0; // 타격 멈춤 동안은 sim이 서 있다(명령은 큐에 남는다)
  else for (acc += dt; acc >= DT; acc -= DT) step(world, commands.splice(0));
  if (world.talk) {
    const t = world.talk;
    world.talk = null;
    talkTo(t);
  }
  if (world.marked) {
    world.marked = false;
    markDone();
  }
  // 약탈자 진지: 화약통이 터지면 이름표를 다시 단다. 처음 불씨 통 곁에 오면 한 줄(무엇인지만 — 어디로 이어지는지는 말하지 않는다)
  if (world.kegs.length) {
    const blown = world.kegs.filter((k) => k.done).length;
    if (blown !== kegsBlown) [kegsBlown, signs] = [blown, signsOf(world)];
    const h = world.entities[0];
    if (!kegHint && world.kegs.some((k) => k.chest >= 0 && !k.done && Math.hypot(k.x + 0.5 - h.x, k.z + 0.5 - h.z) < 4)) {
      kegHint = true;
      say(KEG_HINT);
    }
  }
  // 약탈자 우두머리: 처음 막혔을 때 한 줄(통을 쓰라는 것까지만)
  if (land === 'raid' && !chiefHint && world.combos.some((c) => c.kind === 'ward')) {
    chiefHint = true;
    say(CHIEF_HINT);
  }
  if (world.cleansed) {
    world.cleansed = false;
    say(CLEANSED);
  }
  if (world.relicGot >= 0) gotRelic(world.relicGot);
  if (world.picked) {
    // 줍는 순간 카드. 보관함에 들어간 것은 카드를 누르면 입는다(그 사이 옮겼어도 옵션 배열로 찾는다)
    const p = world.picked;
    world.picked = null;
    showPick(p, () => {
      const i = world.bag.findIndex((b) => b.affixes === p.affixes);
      return i >= 0 && equipFromBag(world, i);
    });
  }
  const events = soundEvents(heard, world);
  sound.play(events, world.entities[0].x, world.entities[0].z);
  stats.kills += events.filter((e) => e.name === 'skel_die' || e.name === 'boss_die').length;
  const o = outcome(world);
  if (!paused && !o) stats.time += dt;
  if (o === 'dead' && lostGold === null) {
    // 죽는 순간 금화 절반을 잃고 야영지로 저장(새로고침으로 '1구역부터' 벌칙을 피할 수 없게)
    lostGold = entry.gold - deathGold(entry.gold);
    // 레벨·경험치는 지금 값으로 남긴다. 그 구역에서 오른 레벨만큼 스킬 포인트도(찍은 스킬은 구역에 들어설 때로 돌아가므로 이 셈이 맞다)
    entry = { ...entry, gold: deathGold(entry.gold), level: world.level, xp: world.xp, points: entry.points + world.level - entry.level };
    saveRun({ ...progress(), land: hubOf(land), floor: 0, from: 'w' });
  }
  if (o === 'clear' && !talking() && !outroOn()) clearT += dt; // 엔딩 1이면 레터박스가 걷힌 뒤부터
  // 성소 5층: 체력 절반에 기사가 일어날 때 한 줄, 쓰러지는 모습이 끝나면 대화(전리품 시간은 대화를 닫은 뒤부터)
  if (land === 'sanctum' && floor === FLOORS) {
    if (world.knightsUp && !risen) {
      risen = true;
      say(PRAYER_RISE);
    }
    const boss = world.entities.find((e) => e.kind === 'boss');
    if (o === 'clear' && !fell && clearT >= SANCTUM.fallTalk) {
      [fell, clearT] = [true, 0];
      showTalks(prayerFall(world.horseDrop)); // 처음 쓰러뜨린 판(목마를 떨군 판)이면 긴 대화 → 엔딩 1
      if (world.horseDrop && boss) {
        outro = 0;
        letterbox(true);
        setGaze({ x: boss.x, z: boss.z });
      }
    }
    if (outroOn() && !talking()) {
      const was = outro!;
      outro = Math.min(OUTRO.end, was + dt);
      if (was < OUTRO.say && outro >= OUTRO.say) showTalks(WITCH_LINES);
      if (outro >= OUTRO.end) {
        letterbox(false);
        setGaze(null);
      }
    }
    if (outro !== null && boss) setOutro({ t: outro, x: boss.x, z: boss.z, face: boss.facing, hx: world.entities[0].x, hz: world.entities[0].z });
  } // 저장은 지우지 않는다(야영지로 가기 전에 탭을 닫아도 캐릭터가 남는다)
  const [hero, st] = [world.entities[0], world.stairs];
  if (stayed && (!st || Math.hypot(hero.x - st[0] - 0.5, hero.z - st[1] - 0.5) > STAIRS_AWAY) && !exitAt(world)) stayed = false; // 계단·출구에서 벗어나야 상점이 다시 열린다
  if (o === 'descend' && !shopping) {
    if (stayed) world.toStairs = false; // 계단 위에서 다시 눌러도 열리지 않는다
    else leave();
  }
  setHideBeams(land === 'sanctum' && floor === FLOORS && world.horseDrop && o === 'clear' && (outro ?? 0) < OUTRO.end); // 엔딩 1(쓰러진 뒤~마녀가 떠날 때까지)
  heard = snapshot(world);
  draw(world, dt);
  drawAutomap(world);
  drawLabels(world, camera, renderer.domElement, signs);
  drawEcho(world, camera, renderer.domElement, headOf);
  updateHud(world, hovered, choosing, stats, lostGold ?? 0, clearT >= LOOT_TIME);
  requestAnimationFrame(frame);
});
