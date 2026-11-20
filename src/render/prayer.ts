// 타이틀 화면: 시계 십자가 앞에 무릎 꿇은 기도하는 자의 등(tools/title_art.py가 만든 도트 두 장).
// 허리 위만 숨 쉬듯 1~2도트 오르내리고, 금 간 고리가 은은히 밝아졌다 어두워지며, 빛줄기 속 먼지가 떠오른다.
// open()을 부르면 빛이 화면을 덮고, 다 덮이면 promise가 풀린다. stop()으로 멈춘다
import bgUrl from '../assets/sprites/title_bg.png';
import figUrl from '../assets/sprites/title_prayer.png';

const OPEN_MS = 1100;
const BREATH_MS = 4600; // 한 번 들이쉬고 내쉬는 시간
const WAIST = 0.62; // 그림 높이에서 허리띠 위치(여기 위만 숨 쉰다)
const BAND = 12; // 허리 위에서 늘어나는 줄 수(도트)
const LIFT = 3; // 들이쉴 때 어깨가 올라가는 도트
const HALO = [0.467, 0.165]; // 그림 안 고리 가운데(비율)
type Dust = { x: number; y: number; v: number; k: number };
// 먼지 하나: 배경 도트 좌표(0~1). 절반은 십자가 앞 빛줄기에, 나머지는 장면 전체에. v = 초당 오르는 비율
const mote = (): Dust => ({ x: Math.random() < 0.5 ? 0.3 + Math.random() * 0.4 : Math.random(), y: Math.random(), v: 0.006 + Math.random() * 0.014, k: Math.random() * 9 });

const load = (src: string) => Object.assign(new Image(), { src });

export function prayer(canvas: HTMLCanvasElement): { stop: () => void; open: () => Promise<void> } {
  const ctx = canvas.getContext('2d')!;
  // 움직임 줄이기 설정이면 화면을 덮는 빛만 뺀다(숨·먼지는 잔잔해서 그대로)
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const bg = load(bgUrl), fig = load(figUrl);
  const dust: Dust[] = Array.from({ length: 70 }, mote);
  let W = 0, H = 0, raf = 0, go = 0, last = 0;

  const fit = () => {
    const d = Math.min(2, devicePixelRatio || 1);
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width = W * d;
    canvas.height = H * d;
    ctx.setTransform(d, 0, 0, d, 0, 0);
  };

  function draw(t: number) {
    if (!W || !H || !bg.complete || !fig.complete) return;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    // 화면을 가득 채우게(넘치는 쪽은 잘림). s = 배경 한 도트의 화면 크기
    const s = Math.max(W / bg.width, H / bg.height);
    const ox = (W - bg.width * s) / 2, oy = (H - bg.height * s) / 2;
    ctx.drawImage(bg, ox, oy, bg.width * s, bg.height * s);

    // 기도하는 자: 바닥 가운데. 머리·어깨를 통째로 k도트 들어 올리고, 허리 위 띠(BAND줄)만 늘려 틈을 메운다(도트 단위로 끊어서)
    const fw = fig.width, fh = fig.height, wy = Math.round(fh * WAIST), by = wy - BAND;
    const fx = ox + ((bg.width - fw) / 2) * s, fb = oy + (bg.height + 6) * s;
    const breath = 0.5 - 0.5 * Math.cos((2 * Math.PI * t) / BREATH_MS); // 0 내쉼 → 1 들이쉼
    const k = Math.round(breath * LIFT);
    const top = fb - fh * s; // 숨 안 쉴 때 그림 위 끝
    ctx.drawImage(fig, 0, wy, fw, fh - wy, fx, top + wy * s, fw * s, (fh - wy) * s);
    ctx.drawImage(fig, 0, by, fw, BAND, fx, top + (by - k) * s, fw * s, (BAND + k) * s);
    ctx.drawImage(fig, 0, 0, fw, by, fx, top - k * s, fw * s, by * s);

    ctx.globalCompositeOperation = 'lighter';
    // 고리 빛: 숨과 같은 박자로
    const hx = fx + fw * HALO[0] * s, hy = top + (fh * HALO[1] - k) * s, hr = fw * 0.22 * s;
    const glow = 0.1 + 0.18 * breath;
    let g = ctx.createRadialGradient(hx, hy, 0, hx, hy, hr);
    g.addColorStop(0, `rgba(255,210,130,${glow})`);
    g.addColorStop(1, 'rgba(255,160,60,0)');
    ctx.fillStyle = g;
    ctx.fillRect(hx - hr, hy - hr, hr * 2, hr * 2);
    // 먼지: 한 도트 크기로 천천히 떠오르며 좌우로 흔들린다. 빛줄기(가운데) 안일수록 밝다
    const dt = Math.min(0.1, (t - last) / 1000);
    last = t;
    for (const p of dust) {
      p.y -= p.v * dt;
      if (p.y < -0.02) Object.assign(p, mote(), { y: 1.02 });
      const x = p.x + Math.sin(t / 2600 + p.k) * 0.008;
      const lit = Math.max(0.25, 1 - Math.abs(x - 0.5) * 3.2);
      ctx.fillStyle = `rgba(255,220,160,${lit * (0.15 + 0.5 * Math.sin(t / 1300 + p.k) ** 2)})`;
      ctx.fillRect(ox + Math.round(x * bg.width) * s, oy + Math.round(p.y * bg.height) * s, s, s);
    }
    const open = go ? Math.min(1, ((t - go) / OPEN_MS) ** 2) : 0;
    if (open) {
      ctx.fillStyle = `rgba(255,225,180,${open * 0.85})`;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  const ro = new ResizeObserver(fit);
  ro.observe(canvas);
  fit();
  const loop = (t: number) => {
    if (canvas.clientWidth) draw(t); // 슬롯·직업 화면으로 넘어가 숨었으면 건너뛴다
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  return {
    stop: () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    },
    open: () => {
      if (still) return Promise.resolve();
      go = performance.now();
      return new Promise((done) =>
        setTimeout(() => {
          done();
          go = 0;
        }, OPEN_MS),
      );
    },
  };
}
