// 효과음 재생(Web Audio). 첫 사용자 입력에서 AudioContext를 만들고 파일을 받아 디코드한다.
// ponytail: FLARE 원본 Ogg Vorbis 그대로. 디코드 못 하는 브라우저(구형 Safari)는 그 소리만 무음
import type { SoundEvent, SoundName } from './events';

const URLS = import.meta.glob('../assets/sounds/*.ogg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
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
  cleave: ['melee_attack_2'],
  potion: ['inventory_potion'],
  loot: ['flying_loot'],
  equip_weapon: ['inventory_metal'],
  equip_armor: ['inventory_maille'],
  level_up: ['level_up'],
};
const VOLUME = 0.5;
const HEAR = 12; // 이 거리(m) 밖의 소리는 들리지 않는다
const GAP = 0.05; // 같은 소리는 이 간격(초) 안에 한 번만
const MUTE_KEY = 'drpg-muted';
let ctx: AudioContext | null = null;
const buffers = new Map<string, AudioBuffer>();
const lastAt = new Map<SoundName, number>();
export let muted = load();
export let played = 0; // 헤드리스 확인용 재생 횟수

function load() {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setMuted(m: boolean) {
  muted = m;
  try {
    localStorage.setItem(MUTE_KEY, m ? '1' : '0');
  } catch {
    // 저장 못 해도 이번 세션에는 적용된다
  }
}

// 브라우저는 사용자 입력 전에는 소리를 막는다. 첫 입력에서 시작
export function initSound() {
  const start = () => {
    if (ctx) return void ctx.resume();
    ctx = new AudioContext();
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
  if (!ctx || muted) return;
  for (const e of events) {
    const gain = Math.max(0, 1 - Math.hypot(e.x - hx, e.z - hz) / HEAR);
    if (gain <= 0 || ctx.currentTime - (lastAt.get(e.name) ?? -1) < GAP) continue;
    const files = FILES[e.name];
    const buf = buffers.get(files[Math.floor(Math.random() * files.length)]);
    if (!buf) continue;
    lastAt.set(e.name, ctx.currentTime);
    const src = ctx.createBufferSource();
    const vol = ctx.createGain();
    vol.gain.value = VOLUME * gain;
    src.buffer = buf;
    src.connect(vol).connect(ctx.destination);
    src.start();
    played++;
  }
}
