// 효과음 재생(Web Audio). 첫 사용자 입력에서 AudioContext를 만들고 파일을 받아 디코드한다.
// ponytail: FLARE 원본 Ogg Vorbis 그대로. 디코드 못 하는 브라우저(구형 Safari)는 그 소리만 무음
import { FLOORS } from '../sim/dungeon';
import type { SoundEvent, SoundName } from './events';

const URLS = import.meta.glob('../assets/sounds/*.ogg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const MUSIC = import.meta.glob('../assets/music/*.ogg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const MUSIC_VOLUME = 0.3;
let music: HTMLAudioElement | null = null; // 스트리밍 재생(곡당 약 3MB). 처음 재생할 때 만든다
let musicGain: GainNode | null = null;
let track = ''; // 지금 층의 곡
let loaded = ''; // music에 실제로 넣은 곡
const FILES: Record<SoundName, string[]> = {
  swing: ['melee_attack', 'melee_attack_2', 'melee_attack_3'],
  hero_hit: ['male_hit'],
  hero_die: ['male_die'],
  skel_attack: ['skeleton_phys'],
  skel_hit: ['skeleton_hit'],
  skel_die: ['skeleton_die'],
  boss_attack: ['minotaur_phys'],
  boss_hit: ['minotaur_hit'],
  boss_die: ['minotaur_die'],
  shoot: ['shoot'],
  fireball: ['fireball'],
  freeze: ['freeze'],
  blast: ['burn'],
  cleave: ['melee_attack_2'],
  dash: ['melee_attack_3'],
  shout: ['warcry'],
  throw: ['melee_attack'],
  summon: ['teleport'],
  chest: ['wood_open'],
  potion: ['inventory_potion'],
  gold: ['inventory_coins'],
  loot: ['flying_loot'],
  equip_weapon: ['inventory_metal'],
  equip_armor: ['inventory_maille'],
  level_up: ['level_up'],
  anvil: ['anvil'], // 담금질(tools/forge_art.py가 FLARE anvil_loop에서 한 번 치는 소리만 잘랐다)
};
const VOLUME = 0.5;
const HEAR = 12; // 이 거리(m) 밖의 소리는 들리지 않는다
const GAP = 0.05; // 같은 소리는 이 간격(초) 안에 한 번만
const SETTINGS_KEY = 'drpg-sound';
let ctx: AudioContext | null = null;
const buffers = new Map<string, AudioBuffer>();
const lastAt = new Map<SoundName, number>();
export type SoundSettings = { sfx: number; music: number; muted: boolean }; // 음량 0~1
export let settings = loadSettings();
export let played = 0; // 헤드리스 확인용 재생 횟수

// 저장된 소리 설정. 없거나 이상하면 기본값, 음량은 0~1로 자른다
export function parseSound(text: string | null): SoundSettings {
  const def: SoundSettings = { sfx: 1, music: 1, muted: false };
  let d: Record<string, unknown>;
  try {
    d = JSON.parse(text ?? 'null');
  } catch {
    return def;
  }
  if (!d || typeof d !== 'object') return def;
  const vol = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback);
  return { sfx: vol(d.sfx, 1), music: vol(d.music, 1), muted: d.muted === true };
}

function loadSettings(): SoundSettings {
  try {
    return parseSound(localStorage.getItem(SETTINGS_KEY));
  } catch {
    return parseSound(null);
  }
}

// 층 → 배경 음악 이름(마지막 층은 보스)
export function musicFor(floor: number) {
  return floor === FLOORS ? 'boss_theme' : 'dungeon_theme';
}

// 곡을 정한다. 소리를 켠 뒤(첫 입력 이후)에만 실제로 재생
export function playMusic(name: string) {
  track = name;
  if (!ctx || document.hidden || settings.muted || settings.music === 0) return music?.pause();
  if (!music) {
    // 음량은 Web Audio로(아이폰은 audio.volume을 무시한다)
    music = Object.assign(new Audio(), { loop: true });
    musicGain = ctx.createGain();
    ctx.createMediaElementSource(music).connect(musicGain).connect(ctx.destination);
  }
  musicGain!.gain.value = MUSIC_VOLUME * settings.music;
  if (loaded !== name) {
    loaded = name;
    music.src = MUSIC[`../assets/music/${name}.ogg`];
  }
  music.play().catch(() => {}); // 재생 못 하면(형식·정책) 조용히
}

// 설정 일부를 바꾸고 바로 적용·저장
export function setSound(patch: Partial<SoundSettings>) {
  settings = { ...settings, ...patch };
  playMusic(track);
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // 저장 못 해도 이번 세션에는 적용된다
  }
}

// 브라우저는 사용자 입력 전에는 소리를 막는다. 첫 입력에서 시작
export function initSound() {
  // 게임 소리는 배경 소리: 음악 앱을 끊지 않고 섞인다(무음 스위치를 따른다). iOS 사파리 16.4+
  const session = (navigator as { audioSession?: { type: string } }).audioSession;
  if (session) session.type = 'ambient';
  // 사파리를 나가거나 화면이 가려지면 음악·효과음을 멈추고, 돌아오면 이어서
  const away = () => {
    music?.pause();
    void ctx?.suspend();
  };
  addEventListener('pagehide', away);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return away();
    if (!ctx) return;
    void ctx.resume();
    playMusic(track);
  });
  const start = () => {
    if (ctx) {
      void ctx.resume();
      if (music?.paused) playMusic(track); // 돌아왔을 때 입력 없이는 재생을 막는 브라우저 대비
      return;
    }
    ctx = new AudioContext();
    playMusic(track);
    for (const [path, url] of Object.entries(URLS)) {
      const name = path.split('/').pop()!.replace('.ogg', '');
      fetch(url)
        .then((r) => r.arrayBuffer())
        .then((b) => ctx!.decodeAudioData(b))
        .then((buf) => buffers.set(name, buf))
        .catch(() => {}); // 디코드 실패 = 그 소리만 무음
    }
  };
  addEventListener('pointerdown', start);
  addEventListener('keydown', start);
}

export function play(events: SoundEvent[], hx: number, hz: number) {
  if (!ctx || settings.muted || settings.sfx === 0) return;
  for (const e of events) {
    const gain = Math.max(0, 1 - Math.hypot(e.x - hx, e.z - hz) / HEAR);
    if (gain <= 0 || ctx.currentTime - (lastAt.get(e.name) ?? -1) < GAP) continue;
    const files = FILES[e.name];
    const buf = buffers.get(files[Math.floor(Math.random() * files.length)]);
    if (!buf) continue;
    lastAt.set(e.name, ctx.currentTime);
    const src = ctx.createBufferSource();
    const vol = ctx.createGain();
    vol.gain.value = VOLUME * settings.sfx * gain;
    src.buffer = buf;
    src.connect(vol).connect(ctx.destination);
    src.start();
    played++;
  }
}

// 바람(2막 엔딩 — 틈이 빨아들이는 소리): 걸러 낸 노이즈를 돌린다(파일 없음). k = 세기 0~1, 0이면 잦아든다
let wind: { gain: GainNode; filter: BiquadFilterNode } | null = null;
export function setWind(k: number) {
  if (!ctx || (!wind && k <= 0)) return;
  if (!wind) {
    const n = ctx.sampleRate * 3;
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < n; i++) d[i] = (b = 0.97 * b + 0.03 * (Math.random() * 2 - 1)) * 6; // 낮게 웅웅대는 갈색 노이즈
    const src = Object.assign(ctx.createBufferSource(), { buffer: buf, loop: true });
    const filter = Object.assign(ctx.createBiquadFilter(), { type: 'bandpass' as BiquadFilterType });
    filter.Q.value = 0.7;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start();
    wind = { gain, filter };
  }
  const t = ctx.currentTime;
  wind.gain.gain.setTargetAtTime(settings.muted ? 0 : k * 0.45 * settings.sfx, t, k > 0 ? 0.4 : 0.15);
  wind.filter.frequency.setTargetAtTime(260 + k * 520 + Math.sin(t * 0.8) * 140 * k, t, 0.5); // 셀수록 높고 일렁인다
}
