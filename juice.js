// Local eye coordinates keep the liquid attached as the face moves and resizes.
export function createJuiceAnimation(tears, fountain, watcher) {
  const tc = tears.getContext("2d"), fc = fountain.getContext("2d");
  if (!tc || !fc) return { setState() {}, react() {}, clear() {} };
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const eyes = [...watcher.querySelectorAll(".eye")];
  let level = 0, celebrating = false, crying = false, raf = 0, last = 0, time = 0;
  let width = 0, height = 0, tw = 0, th = 0, anchors = [];
  let particles = [], ripples = [], emission = 0, burst = 0;
  let surface = innerHeight, targetSurface = innerHeight;
  const cap = (x, a, b) => Math.min(b, Math.max(a, x));

  function size(canvas, context, w, h) {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function resize() {
    width = innerWidth; height = innerHeight;
    tw = watcher.clientWidth; th = watcher.clientHeight + 90;
    size(tears, tc, tw, th); size(fountain, fc, width, height);
    anchors = eyes.map((eye, i) => ({
      // Sample the lower rim, not an arbitrary point inside the white eye.
      x: eye.offsetLeft + eye.offsetWidth * (i ? .43 : .57),
      y: eye.offsetTop + eye.offsetHeight - 4,
    }));
    surface = targetSurface = height * (1 - level / 100);
    particles = []; ripples = [];
    wake();
  }

  function drop(ctx, x, y, r, stretch = 1, alpha = 1, angle = 0) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.scale(1, stretch);
    ctx.globalAlpha = alpha;
    const color = ctx.createRadialGradient(-r * .35, -r * .3, .2, 0, 0, r * 1.2);
    color.addColorStop(0, "#ffe0cd"); color.addColorStop(.5, "#f6aa94"); color.addColorStop(1, "#e97662");
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.ellipse(0, 0, r, r, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawTears() {
    tc.clearRect(0, 0, tw, th);
    if (!level || !crying) return;
    const scale = tw / 400;
    const period = level > 42 ? 1.65 : 2.7;
    anchors.forEach((a, i) => {
      const p = motion.matches ? .45 : ((time + i * period * .43) % period) / period;
      // Grow at the lid, slide over the cheek, then detach and accelerate.
      const slide = cap((p - .24) / .35, 0, 1);
      const fall = Math.max(0, p - .59) * period;
      const length = 39 * scale * slide * slide;
      const x = a.x + Math.sin(slide * 2.4) * (i ? -2 : 2) * scale;
      const fade = p > .7 ? cap((.98 - p) / .28, 0, 1) : 1;
      if (p < .8) {
        tc.save(); tc.globalAlpha = p > .59 ? (.8 - p) / .21 : 1;
        const gradient = tc.createLinearGradient(0, a.y - 3, 0, a.y + 44 * scale);
        gradient.addColorStop(0, "rgba(255,204,183,.88)");
        gradient.addColorStop(1, "rgba(248,155,131,.6)");
        tc.fillStyle = gradient;
        const r = (2.5 + Math.min(p / .24, 1) * 3.5) * scale;
        tc.beginPath();
        tc.moveTo(a.x - r, a.y - 2);
        tc.bezierCurveTo(a.x - r * .5, a.y + length * .5, x - r * .55, a.y + length, x, a.y + length + r);
        tc.bezierCurveTo(x + r * .65, a.y + length, a.x + r * .5, a.y + length * .5, a.x + r, a.y - 2);
        tc.quadraticCurveTo(a.x, a.y + 2, a.x - r, a.y - 2); tc.fill();
        tc.restore();
      }
      const y = a.y + length + 36 * scale * fall + 260 * scale * fall * fall;
      if (p > .15) drop(tc, x, y, (3.5 + Math.min(p / .28, 1) * 2.3) * scale,
        1 + Math.min(fall * 1.4, .7), .86 * fade);
    });
  }

  function emit() {
    const scale = Math.min(1, width / 650);
    const pulse = .94 + .06 * Math.sin(time * 7);
    for (let lane = -1; lane <= 1; lane++) {
      particles.push({ x: width / 2 + lane * 4, y: surface,
        vx: lane * (90 + Math.random() * 34) * scale + (Math.random() - .5) * 16,
        vy: -(lane ? 280 : 385) * Math.sqrt(scale) * pulse - Math.random() * 24,
        r: (3 + Math.random() * 2.4) * Math.sqrt(scale), age: 0, splash: false });
    }
  }
  function drawFountain(dt) {
    fc.clearRect(0, 0, width, height);
    surface += (targetSurface - surface) * (1 - Math.exp(-dt * 5));
    if (celebrating && !motion.matches && burst < 2.6) {
      emission += dt * 65;
      while (emission >= 1) { emit(); emission--; }
      burst += dt;
    }
    const splashes = [];
    particles = particles.filter(p => {
      p.age += dt;
      p.vy += 640 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.vy > 0 && p.y >= surface) {
        if (!p.splash) {
          ripples.push({x: p.x, age: 0});
          for (const sign of [-1, 1]) splashes.push({x:p.x, y:surface - 1,
            vx:sign * (25 + Math.random() * 40), vy:-35 - Math.random() * 55,
            r:p.r * .45, age:0, splash:true});
        }
        return false;
      }
      if (p.age > 2 || p.y > height + 20) return false;
      const speed = Math.hypot(p.vx, p.vy);
      if (!p.splash && p.vy < 80) {
        // Overlapping velocity-aligned strokes make a liquid jet, not a string of beads.
        fc.lineCap = "round"; fc.strokeStyle = "#f3a28b"; fc.lineWidth = p.r * 1.7;
        fc.beginPath(); fc.moveTo(p.x - p.vx * .022, p.y - p.vy * .022);
        fc.lineTo(p.x, p.y); fc.stroke();
      } else {
        drop(fc, p.x, p.y, p.r * .8, Math.min(2.3, 1 + speed / 360),
          p.splash ? .65 : .83, Math.atan2(p.vy, p.vx) - Math.PI / 2);
      }
      return true;
    });
    particles.push(...splashes);
    // Bound memory and drawing cost, including repeatedly clicked previews.
    particles = particles.slice(-650);
    ripples = ripples.filter(r => {
      r.age += dt;
      if (r.age > .55) return false;
      fc.strokeStyle = `rgba(255,224,206,${(.55 - r.age) * .65})`;
      fc.lineWidth = 1.3; fc.beginPath();
      fc.ellipse(r.x, surface, 4 + r.age * 24, 1 + r.age * 4, 0, 0, Math.PI * 2); fc.stroke();
      return true;
    }).slice(-100);
  }
  function frame(now) {
    raf = 0;
    if (document.hidden) { last = 0; return; }
    const dt = last ? Math.min((now - last) / 1000, .04) : 1 / 60;
    last = now; time += dt;
    drawTears(); drawFountain(dt);
    if (!motion.matches && ((crying && level > 0) || celebrating || particles.length || ripples.length)) raf = requestAnimationFrame(frame);
    else last = 0;
  }
  function wake() {
    if (!raf && !document.hidden) raf = requestAnimationFrame(frame);
  }
  function clear() {
    cancelAnimationFrame(raf); raf = 0; last = 0;
    level = 0; celebrating = false; crying = false; particles = []; ripples = []; emission = 0; burst = 0;
    tc.clearRect(0, 0, tw, th); fc.clearRect(0, 0, width, height);
  }
  document.addEventListener("visibilitychange", () => {
    cancelAnimationFrame(raf); raf = 0; last = 0; wake();
  });
  motion.addEventListener("change", () => { particles = []; ripples = []; wake(); });
  window.addEventListener("resize", resize, {passive:true});
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(resize).observe(watcher);
  resize();
  return {
    setState(water, active, tearsActive = true) {
      crying = tearsActive;
      if (!crying) tc.clearRect(0, 0, tw, th);
      if (active && !celebrating) { burst = 0; emission = 0; }
      if (!active && celebrating) { particles = []; ripples = []; }
      level = cap(water, 0, 100); celebrating = active;
      targetSurface = height * (1 - level / 100); wake();
    },
    react() { if (level) { time = 0; wake(); } },
    clear,
  };
}
