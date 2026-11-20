// 타이틀 화면의 열린 문틈: 돌벽 가운데 거대한 문이 한 뼘 열려 있고, 틈으로 새어 나온 빛이 바닥에 깔리며 먼지가 떠다닌다.
// open()을 부르면 문이 양쪽으로 열리며 빛이 쏟아지고, 다 열리면 promise가 풀린다. stop()으로 멈춘다
type Dust = { x: number; y: number; v: number; k: number };
const OPEN_MS = 1100;

export function door(canvas: HTMLCanvasElement): { stop: () => void; open: () => Promise<void> } {
  const ctx = canvas.getContext('2d')!;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dust: Dust[] = Array.from({ length: 60 }, () => ({ x: Math.random(), y: 0.15 + Math.random() * 0.85, v: 0.0004 + Math.random() * 0.0008, k: Math.random() * 9 }));
  let W = 0, H = 0, raf = 0, go = 0;

  const fit = () => {
    const d = Math.min(2, devicePixelRatio || 1);
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width = W * d;
    canvas.height = H * d;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    if (still) draw(0);
  };

  function draw(t: number) {
    if (!W || !H) return;
    const tall = W < H; // 세로 화면: 문을 위로 올리고 메뉴는 아래(index.html의 orientation: portrait와 같은 기준)
    const fw = Math.min(W * (tall ? 0.6 : 0.3), H * 0.48), fh = fw * 1.25;
    const fb = H * (tall ? 0.62 : 0.86), fy = fb - fh, fx = W / 2 - fw / 2, gx = W / 2;
    const open = go ? Math.min(1, ((t - go) / OPEN_MS) ** 2) : 0;
    const crack = W * 0.014 * (0.95 + 0.05 * Math.sin(t / 900));
    const gap = crack + (fw - crack) * open;
    const a = 0.85 + 0.15 * Math.sin(t / 700) * Math.sin(t / 230); // 문 너머 불빛이 숨 쉬듯

    // 돌벽과 줄눈
    ctx.fillStyle = '#0c0907';
    ctx.fillRect(0, 0, W, H);
    let g = ctx.createRadialGradient(gx, fb, 0, gx, fb, Math.max(W, H) * 0.5);
    g.addColorStop(0, `rgba(120,70,30,${Math.min(1, 0.35 * a + open)})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const rh = Math.max(H, W * 0.6) / 12, bw = rh * 2.6;
    ctx.strokeStyle = 'rgba(0,0,0,.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let r = 0; r * rh < fb; r++) {
      ctx.moveTo(0, r * rh);
      ctx.lineTo(W, r * rh);
      for (let x = (r % 2) * bw / 2; x < W; x += bw) {
        ctx.moveTo(x, r * rh);
        ctx.lineTo(x, Math.min(fb, r * rh + rh));
      }
    }
    ctx.stroke();

    // 바닥
    g = ctx.createLinearGradient(0, fb, 0, H);
    g.addColorStop(0, '#1a120c');
    g.addColorStop(1, '#050302');
    ctx.fillStyle = g;
    ctx.fillRect(0, fb, W, H - fb);

    // 문틀
    const fm = fw * 0.083;
    ctx.fillStyle = '#2a2018';
    ctx.fillRect(fx - fm, fy - fm * 1.2, fw + fm * 2, fh + fm * 1.2);
    ctx.fillStyle = '#3a2c20';
    ctx.fillRect(fx - fm, fy - fm * 1.2, fw + fm * 2, fm * 0.45);

    // 문 너머 빛
    g = ctx.createLinearGradient(0, fy, 0, fb);
    g.addColorStop(0, '#ffb86a');
    g.addColorStop(1, '#fff1d0');
    ctx.fillStyle = g;
    ctx.fillRect(gx - gap / 2, fy, gap, fh);

    // 문짝 둘: 세로 널빤지, 쇠띠 둘과 징, 틈 쪽 가장자리에 빛이 번진다
    const leaf = (x0: number, x1: number, dir: 1 | -1) => {
      if (x1 - x0 < 1) return;
      ctx.fillStyle = '#241812';
      ctx.fillRect(x0, fy, x1 - x0, fh);
      ctx.strokeStyle = '#120c08';
      ctx.lineWidth = Math.max(1, fw / 180);
      ctx.beginPath();
      for (let x = x0; x < x1; x += fw / 10) {
        ctx.moveTo(x, fy);
        ctx.lineTo(x, fb);
      }
      ctx.stroke();
      for (const yy of [0.18, 0.78]) {
        ctx.fillStyle = '#3a3330';
        ctx.fillRect(x0, fy + fh * yy, x1 - x0, fh * 0.05);
        ctx.fillStyle = '#58504a';
        for (let x = x0 + fw * 0.04; x < x1; x += fw * 0.09) {
          ctx.beginPath();
          ctx.arc(x, fy + fh * (yy + 0.025), fw * 0.0095, 0, 7);
          ctx.fill();
        }
      }
      const ex = dir > 0 ? x1 : x0, ew = fw * 0.1;
      g = ctx.createLinearGradient(ex, 0, ex - dir * ew, 0);
      g.addColorStop(0, `rgba(255,190,110,${0.5 * a})`);
      g.addColorStop(1, 'rgba(255,150,60,0)');
      ctx.fillStyle = g;
      ctx.fillRect(Math.min(ex, ex - dir * ew), fy, ew, fh);
    };
    leaf(fx, gx - gap / 2, 1);
    leaf(gx + gap / 2, fx + fw, -1);

    // 바닥에 깔리는 빛줄기와 그 안의 먼지
    ctx.globalCompositeOperation = 'lighter';
    g = ctx.createLinearGradient(0, fb, 0, H);
    g.addColorStop(0, `rgba(255,200,130,${0.55 * a})`);
    g.addColorStop(1, 'rgba(255,140,60,0)');
    ctx.fillStyle = g;
    const spread = gap * 4 + fw * 0.13;
    ctx.beginPath();
    ctx.moveTo(gx - gap / 2, fb);
    ctx.lineTo(gx + gap / 2, fb);
    ctx.lineTo(gx + spread, H);
    ctx.lineTo(gx - spread, H);
    ctx.fill();
    const fbN = fb / H;
    for (const p of dust) {
      if (!still) {
        p.y -= p.v;
        p.x += Math.sin(t / 1500 + p.k) * 0.0003;
        if (p.y < fy / H) p.y = 0.98;
      }
      const w = gap * 3 + fw * 0.17;
      const px = gx + (p.x - 0.5) * w * (p.y > fbN ? 1 + ((p.y - fbN) / (1 - fbN)) * 1.6 : 0.6);
      ctx.fillStyle = `rgba(255,220,170,${0.5 * Math.sin(t / 800 + p.k) ** 2})`;
      ctx.fillRect(px, p.y * H, 1.5, 1.5);
    }
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
  if (!still) raf = requestAnimationFrame(loop);

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
          go = 0; // 뒤로 돌아오면 다시 한 뼘만 열린 문
        }, OPEN_MS),
      );
    },
  };
}
