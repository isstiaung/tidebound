// Visual effects: the starfield, particle bursts, tide sweeps and card flights.

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------------------
// Starfield: a slow, twinkling sky behind everything.

export function startStarfield(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  let w = 0;
  let h = 0;
  let stars: { x: number; y: number; r: number; phase: number; speed: number }[] = [];

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = Math.round((w * h) / 9000);
    stars = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      // denser toward the top, like a real horizon
      y: Math.pow(Math.random(), 1.6) * h * 0.85,
      r: Math.random() < 0.08 ? 1.4 : Math.random() * 0.9 + 0.3,
      phase: Math.random() * Math.PI * 2,
      speed: 0.4 + Math.random() * 1.2,
    }));
  };

  const draw = (t: number) => {
    ctx.clearRect(0, 0, w, h);
    for (const s of stars) {
      const a = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(s.phase + (t / 1000) * s.speed));
      ctx.globalAlpha = a * (1 - s.y / h);
      ctx.fillStyle = '#e8ecf4';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  };

  resize();
  window.addEventListener('resize', resize);
  if (reducedMotion()) {
    draw(0);
    window.addEventListener('resize', () => draw(0));
    return;
  }
  let last = 0;
  const loop = (t: number) => {
    // ~30fps is plenty for twinkling
    if (t - last > 33 && !document.hidden) {
      draw(t);
      last = t;
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

// ---------------------------------------------------------------------------
// Particles: sparks when a shrine seals, a shower when you win.

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  spin: number;
  shape: 'dot' | 'star';
}

let pctx: CanvasRenderingContext2D | null = null;
let pcanvas: HTMLCanvasElement | null = null;
let particles: Particle[] = [];
let running = false;

export function initParticles(canvas: HTMLCanvasElement) {
  pcanvas = canvas;
  pctx = canvas.getContext('2d');
  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    pctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  window.addEventListener('resize', resize);
}

function tick() {
  if (!pctx || !pcanvas) return;
  const ctx = pctx;
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  particles = particles.filter((p) => p.life > 0);
  for (const p of particles) {
    p.life--;
    p.vy += 0.12;
    p.vx *= 0.985;
    p.vy *= 0.985;
    p.x += p.vx;
    p.y += p.vy;
    p.spin += 0.1;
    ctx.globalAlpha = Math.min(1, (p.life / p.max) * 1.6);
    ctx.fillStyle = p.color;
    if (p.shape === 'star') {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.spin);
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        ctx.rotate(Math.PI / 2);
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(p.size * 0.25, p.size * 0.25, 0, p.size);
        ctx.quadraticCurveTo(-p.size * 0.25, p.size * 0.25, 0, 0);
      }
      ctx.fill();
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  if (particles.length) requestAnimationFrame(tick);
  else running = false;
}

function kick() {
  if (!running) {
    running = true;
    requestAnimationFrame(tick);
  }
}

export function burst(x: number, y: number, colors: string[], count = 48) {
  if (reducedMotion() || !pctx) return;
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = 2 + Math.random() * 5.5;
    const max = 50 + Math.random() * 40;
    particles.push({
      x,
      y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v - 2.5,
      life: max,
      max,
      size: Math.random() < 0.3 ? 5 + Math.random() * 4 : 1.5 + Math.random() * 2,
      color: colors[i % colors.length],
      spin: Math.random() * 6,
      shape: Math.random() < 0.3 ? 'star' : 'dot',
    });
  }
  kick();
}

export function shower(colors: string[]) {
  if (reducedMotion() || !pctx) return;
  const w = window.innerWidth;
  for (let i = 0; i < 140; i++) {
    const max = 120 + Math.random() * 90;
    particles.push({
      x: Math.random() * w,
      y: -20 - Math.random() * 300,
      vx: (Math.random() - 0.5) * 2,
      vy: 1 + Math.random() * 3,
      life: max,
      max,
      size: 4 + Math.random() * 6,
      color: colors[i % colors.length],
      spin: Math.random() * 6,
      shape: 'star',
    });
  }
  kick();
}

export function burstAt(el: Element, colors: string[]) {
  const r = el.getBoundingClientRect();
  burst(r.left + r.width / 2, r.top + r.height / 2, colors);
}

// ---------------------------------------------------------------------------
// Sweeps across a shrine when its sky changes.

export function sweep(shrine: HTMLElement, kind: 'tide' | 'eclipse' | 'undertow' | 'anchor') {
  if (reducedMotion()) return;
  const el = document.createElement('div');
  el.className = `sweep sweep-${kind}`;
  el.setAttribute('aria-hidden', 'true');
  shrine.append(el);
  el.addEventListener('animationend', () => el.remove(), { once: true });
  window.setTimeout(() => el.remove(), 2000);
}

// ---------------------------------------------------------------------------
// Card flights: animate a card from where it was (a hand) to where it is now.

export function flyFrom(el: HTMLElement, from: DOMRect, duration = 460): Promise<void> {
  if (reducedMotion()) return Promise.resolve();
  const to = el.getBoundingClientRect();
  if (!to.width || !from.width) return Promise.resolve();
  const dx = from.left + from.width / 2 - (to.left + to.width / 2);
  const dy = from.top + from.height / 2 - (to.top + to.height / 2);
  const s = from.width / to.width;
  const anim = el.animate(
    [
      { transform: `translate(${dx}px, ${dy}px) scale(${s}) rotate(-4deg)`, zIndex: 10 },
      { transform: `translate(${dx * 0.35}px, ${dy * 0.35 - 30}px) scale(${(s + 1) / 2 + 0.08}) rotate(3deg)`, zIndex: 10, offset: 0.55 },
      { transform: 'none', zIndex: 10 },
    ],
    { duration, easing: 'cubic-bezier(.3,.7,.2,1)' },
  );
  return anim.finished.then(
    () => undefined,
    () => undefined,
  );
}
