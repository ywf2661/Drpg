// 타이틀 화면의 모닥불: 화덕 돌 · 엇갈린 장작 · 숯불 위로, 불 알갱이를 'lighter'로 겹쳐 그린다.
// 아래는 희고 노랗게, 위로 갈수록 주황 → 붉게 식으며 흔들린다. 돌려주는 함수를 부르면 멈춘다
const W = 320, H = 400, CX = W / 2, BASE = H - 34;
const HOT = [255, 246, 214], MID = [255, 166, 64], COOL = [196, 48, 14];
const mix = (a: number[], b: number[], f: number) => a.map((v, i) => Math.round(v + (b[i] - v) * f));

type Flame = { x: number; y: number; vx: number; vy: number; life: number; max: number; r: number };
type Stone = { x: number; y: number; rx: number; ry: number };

// 화덕 돌: 타원 둘레에 9개. 뒤쪽은 장작 뒤에, 앞쪽(y ≥ BASE + 6)은 불 앞에 그린다
const STONES: Stone[] = Array.from({ length: 9 }, (_, i) => {
  const a = (i / 9) * Math.PI * 2 + 0.3;
  return { x: CX + Math.cos(a) * 92, y: BASE + 6 + Math.sin(a) * 20, rx: 15 + ((i * 7) % 6), ry: 10 + ((i * 5) % 4) };
});
const LOGS = [
  { a: -0.42, dy: -4, len: 150, th: 20 },
  { a: 0.38, dy: -2, len: 146, th: 19 },
  { a: 0.06, dy: 8, len: 160, th: 22 },
];

export function campfire(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext('2d')!;
  canvas.width = W * 2;
  canvas.height = H * 2;
  ctx.scale(2, 2);
  const ps: Flame[] = [];
  let t = 0;
  let raf = 0;

  const stone = (s: Stone) => {
    const g = ctx.createLinearGradient(s.x, s.y - s.ry, s.x, s.y + s.ry);
    g.addColorStop(0, '#6e5a48');
    g.addColorStop(0.5, '#3a3029');
    g.addColorStop(1, '#14100d');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(s.x, s.y, s.rx, s.ry, 0, 0, 7);
    ctx.fill();
  };
  // 통나무: 윗면은 불빛을 받고, 불 닿는 가장자리는 벌겋게 탄다. 나뭇결과 끝 나이테
  const log = (l: (typeof LOGS)[number], glow: number) => {
    const h = l.th / 2, w = l.len / 2;
    ctx.save();
    ctx.translate(CX, BASE + l.dy);
    ctx.rotate(l.a);
    const g = ctx.createLinearGradient(0, -h, 0, h);
    g.addColorStop(0, '#8a5a34');
    g.addColorStop(0.35, '#4a2c18');
    g.addColorStop(1, '#140b06');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(-w, -h, l.len, l.th, h);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1;
    for (let x = -w + 14; x < w - 10; x += 17) {
      ctx.beginPath();
      ctx.moveTo(x, -h + 3);
      ctx.lineTo(x + 7, h - 4);
      ctx.stroke();
    }
    const hot = `rgba(255,120,40,${0.55 * glow})`;
    const ember = ctx.createLinearGradient(-w, 0, w, 0);
    ember.addColorStop(0, 'rgba(255,90,20,0)');
    ember.addColorStop(0.35, hot);
    ember.addColorStop(0.65, hot);
    ember.addColorStop(1, 'rgba(255,90,20,0)');
    ctx.fillStyle = ember;
    ctx.fillRect(-w, -h, l.len, 3);
    for (const s of [-1, 1]) {
      ctx.fillStyle = '#6b4526';
      ctx.beginPath();
      ctx.ellipse(s * w, 0, 4, h, 0, 0, 7);
      ctx.fill();
      ctx.strokeStyle = '#2a170b';
      ctx.beginPath();
      ctx.ellipse(s * w, 0, 2, h * 0.55, 0, 0, 7);
      ctx.stroke();
    }
    ctx.restore();
  };

  const step = () => {
    t++;
    for (let i = 0; i < 4; i++) {
      const off = (Math.random() + Math.random() - 1) * 42;
      ps.push({ x: CX + off, y: BASE - 8, vx: (Math.random() - 0.5) * 0.5, vy: -(1.4 + Math.random() * 1.8) * (1 - Math.abs(off) / 90), life: 0, max: 45 + Math.random() * 45, r: 11 + Math.random() * 15 });
    }
    const glow = 0.75 + Math.sin(t * 0.13) * 0.15 + Math.random() * 0.1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, W, H);
    const sh = ctx.createRadialGradient(CX, BASE + 8, 0, CX, BASE + 8, 120);
    sh.addColorStop(0, 'rgba(0,0,0,0.6)');
    sh.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sh;
    ctx.beginPath();
    ctx.ellipse(CX, BASE + 8, 120, 30, 0, 0, 7);
    ctx.fill();
    STONES.filter((s) => s.y < BASE + 6).forEach(stone);
    ctx.globalCompositeOperation = 'lighter';
    const bed = ctx.createRadialGradient(CX, BASE, 0, CX, BASE, 70);
    bed.addColorStop(0, `rgba(255,170,80,${0.7 * glow})`);
    bed.addColorStop(0.5, `rgba(200,60,15,${0.45 * glow})`);
    bed.addColorStop(1, 'rgba(120,20,0,0)');
    ctx.fillStyle = bed;
    ctx.beginPath();
    ctx.ellipse(CX, BASE, 70, 16, 0, 0, 7);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    LOGS.forEach((l) => log(l, glow));
    ctx.globalCompositeOperation = 'lighter';
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      const k = ++p.life / p.max;
      if (k >= 1) {
        ps.splice(i, 1);
        continue;
      }
      p.vx += (Math.random() - 0.5) * 0.35 + (CX - p.x) * 0.003 + Math.sin(t * 0.06 + p.y * 0.05) * 0.04;
      p.vx *= 0.93;
      p.x += p.vx;
      p.y += p.vy;
      p.vy *= 0.997;
      const r = p.r * (1 - k * 0.7);
      const c = k < 0.3 ? mix(HOT, MID, k / 0.3) : mix(MID, COOL, (k - 0.3) / 0.7);
      const a = Math.min(1, k * 8) * (1 - k) * 0.24;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      g.addColorStop(0, `rgba(${c},${a})`);
      g.addColorStop(1, `rgba(${c},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, 7);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    STONES.filter((s) => s.y >= BASE + 6).forEach(stone);
  };

  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    for (let i = 0; i < 90; i++) step(); // 움직임 줄이기: 타오르는 한 장면만
    return () => {};
  }
  const loop = () => {
    step();
    raf = requestAnimationFrame(loop);
  };
  loop();
  return () => cancelAnimationFrame(raf);
}
