"use client";

// Behind a call (Sean, Nov 2026): scenes drawn live, in the manner of an anime's sky, with depth as an
// After Effects piece has it (layers moving at their own pace, things turning in 3D, glow). Drawn here,
// so nothing is loaded and nothing is anyone else's: no film or still from a studio is copied. Each
// scene: init(w, h) → its state; frame(ctx, state, t, dt, w, h) draws it at t seconds.

import { useEffect, useRef } from "react";

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);

/** A vertical sky: [stop, colour] pairs. */
function sky(ctx, w, h, stops) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  for (const [at, c] of stops) g.addColorStop(at, c);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/** A soft light: a radial glow at (x, y). */
function glow(ctx, x, y, r, colour, alpha = 1) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, colour);
  g.addColorStop(1, "transparent");
  ctx.globalAlpha = alpha;
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = 1;
}

// An anime cloud: puffs of one flat colour, its shadow beneath and its lit edge above, as cel shading.
const PUFFS = [[0, 0, 1], [0.95, -0.28, 0.82], [1.8, 0.04, 0.9], [-0.9, 0.12, 0.74], [0.45, 0.36, 0.78], [1.3, 0.42, 0.66], [2.45, 0.3, 0.6]];
function cloud(ctx, x, y, s, { body, light, shade }, alpha = 1) {
  ctx.globalAlpha = alpha;
  for (const [fill, dx, dy, k] of [[shade, 0.06, 0.16, 1], [body, 0, 0, 1], [light, -0.1, -0.14, 0.62]]) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    for (const [px, py, r] of PUFFS) {
      ctx.moveTo(x + (px + dx) * s + r * s * k, y + (py + dy) * s);
      ctx.arc(x + (px + dx) * s, y + (py + dy) * s, r * s * k, 0, TAU);
    }
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** Hills along the foot: a ridge of summed waves at `base` (0-1 of the height). */
function hills(ctx, w, h, base, amp, colour, seed) {
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let x = 0; x <= w + 8; x += 8) {
    const y = h * base - amp * (Math.sin(x * 0.011 + seed) * 0.6 + Math.sin(x * 0.027 + seed * 2.3) * 0.3 + Math.sin(x * 0.061 + seed * 0.7) * 0.1);
    ctx.lineTo(x, y);
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();
}

/** A four-pointed sparkle, as anime light glints. */
function sparkle(ctx, x, y, r, colour, alpha) {
  if (alpha <= 0.02) return;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.fill();
  glow(ctx, x, y, r * 1.6, colour, alpha * 0.5);
  ctx.globalAlpha = 1;
}

/** Shooting stars: one now and then, across the upper sky, a bright head and a long fading tail. */
function shootingStars(ctx, s, t, dt, w, h) {
  if (t > s.nextStar) {
    s.stars.push({ x: rand(w * 0.3, w * 1.2), y: rand(-20, h * 0.25), life: 0, len: rand(90, 170), speed: rand(420, 620), angle: rand(2.45, 2.7) });
    s.nextStar = t + rand(1.4, 3.2);
  }
  for (const c of s.stars) {
    c.life += dt;
    c.x += Math.cos(c.angle) * c.speed * dt;
    c.y -= Math.sin(c.angle) * c.speed * dt * -1;
    const tx = c.x - Math.cos(c.angle) * c.len;
    const ty = c.y + Math.sin(c.angle) * -c.len;
    const fade = Math.max(0, 1 - c.life / 1.1);
    const g = ctx.createLinearGradient(c.x, c.y, tx, ty);
    g.addColorStop(0, `rgba(255,255,255,${0.95 * fade})`);
    g.addColorStop(0.3, `rgba(170,215,255,${0.45 * fade})`);
    g.addColorStop(1, "rgba(170,215,255,0)");
    ctx.strokeStyle = g;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    glow(ctx, c.x, c.y, 9, "rgba(220,240,255,0.9)", fade);
  }
  s.stars = s.stars.filter((c) => c.life < 1.1);
}

const SCENES = {
  // A pink and violet dusk: the sun low behind cel-shaded clouds drifting in three layers, the hills dark,
  // and cherry blossom falling past, each petal turning over in 3D, the near ones larger and brighter.
  sakura: {
    init: (w, h) => ({
      clouds: [0, 1, 2].flatMap((layer) =>
        Array.from({ length: 3 }, (_, i) => ({ layer, x: rand(-0.3, 1.1) * w + i * w * 0.45, y: h * (0.5 + layer * 0.075) + rand(-10, 10), s: (14 + layer * 8) * rand(0.85, 1.15) }))),
      petals: Array.from({ length: 70 }, () => ({
        x: rand(-20, w + 20), y: rand(-h, h), z: rand(0.2, 1),
        rx: rand(0, TAU), ry: rand(0, TAU), rz: rand(0, TAU), vrx: rand(1, 3), vry: rand(0.6, 2), vrz: rand(-1.5, 1.5),
        vy: rand(26, 52), sway: rand(0, TAU), hue: Math.random(),
      })),
      glints: Array.from({ length: 14 }, () => ({ x: rand(0, w), y: rand(h * 0.42, h * 0.8), r: rand(3, 7), ph: rand(0, TAU), sp: rand(1.2, 2.6) })),
    }),
    frame(ctx, s, t, dt, w, h) {
      sky(ctx, w, h, [[0, "#1d2163"], [0.32, "#5b3f9e"], [0.58, "#d97cb0"], [0.76, "#ffb59a"], [1, "#ffd9a8"]]);
      const sx = w * 0.66, sy = h * 0.66;
      glow(ctx, sx, sy, h * 0.55, "rgba(255,196,160,0.85)", 0.9);
      glow(ctx, sx, sy, w * 0.22, "rgba(255,240,215,1)");
      ctx.fillStyle = "#fff6e3";
      ctx.beginPath();
      ctx.arc(sx, sy, w * 0.07, 0, TAU);
      ctx.fill();
      const tones = [
        { body: "#c69ad6", light: "#e7c2ea", shade: "#8e6bb8" },
        { body: "#f0aecb", light: "#ffd7e6", shade: "#b77fb4" },
        { body: "#ffc9d6", light: "#fff0f3", shade: "#d68fae" },
      ];
      for (const c of s.clouds) {
        c.x += (6 + c.layer * 7) * dt;
        if (c.x - c.s > w + 10) c.x = -c.s * 3.4;
        cloud(ctx, c.x, c.y, c.s, tones[c.layer], 0.75 + c.layer * 0.1);
      }
      hills(ctx, w, h, 0.84, 34, "rgba(92,58,128,0.9)", 1.3);
      hills(ctx, w, h, 0.93, 26, "#2a1a46", 4.1);
      for (const g of s.glints) sparkle(ctx, g.x, g.y, g.r, "#fff1f6", Math.max(0, Math.sin(t * g.sp + g.ph)) * 0.8);
      // The petals, far ones first.
      s.petals.sort((a, b) => a.z - b.z);
      for (const p of s.petals) {
        p.y += p.vy * (0.4 + p.z) * dt;
        p.x += (Math.sin(t * 0.9 + p.sway) * 22 + 16) * (0.4 + p.z) * dt;
        p.rx += p.vrx * dt;
        p.ry += p.vry * dt;
        p.rz += p.vrz * dt;
        if (p.y > h + 20 || p.x > w + 30) {
          p.y = rand(-60, -10);
          p.x = rand(-40, w);
        }
        const size = 3 + 9 * p.z;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rz);
        ctx.scale(Math.cos(p.rx) * size, Math.cos(p.ry) * size * 0.75 + (Math.cos(p.ry) >= 0 ? 0.08 : -0.08) * size);
        ctx.globalAlpha = 0.35 + 0.6 * p.z;
        ctx.fillStyle = p.hue > 0.55 ? "#ffd1e1" : p.hue > 0.2 ? "#ffb3cd" : "#ff93b8";
        ctx.beginPath();
        ctx.moveTo(0, -1);
        ctx.bezierCurveTo(0.95, -0.85, 0.75, 0.7, 0, 1);
        ctx.bezierCurveTo(-0.75, 0.7, -0.95, -0.85, 0, -1);
        ctx.fill();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    },
  },

  // A deep night: the Milky Way across it, stars twinkling, shooting stars, a small town's lights on the
  // hills, and specks of light drifting up through the dark at their own depths.
  starfall: {
    init: (w, h) => ({
      sky: Array.from({ length: 170 }, () => ({ x: rand(0, w), y: rand(0, h * 0.8), r: rand(0.4, 1.5), ph: rand(0, TAU), sp: rand(0.8, 2.4) })),
      motes: Array.from({ length: 36 }, () => ({ x: rand(0, w), y: rand(0, h), z: rand(0.2, 1), ph: rand(0, TAU) })),
      town: Array.from({ length: 26 }, () => ({ x: rand(0, w), y: rand(0.885, 0.94), ph: rand(0, TAU) })),
      stars: [], nextStar: 0.6,
    }),
    frame(ctx, s, t, dt, w, h) {
      sky(ctx, w, h, [[0, "#050722"], [0.45, "#1a1452"], [0.72, "#3b2a7f"], [0.86, "#8a4f9e"], [1, "#e58bb0"]]);
      // The Milky Way: a soft band across the sky.
      ctx.save();
      ctx.translate(w * 0.5, h * 0.32);
      ctx.rotate(-0.55);
      ctx.scale(1, 0.24);
      glow(ctx, 0, 0, h * 0.62, "rgba(160,150,255,0.55)");
      glow(ctx, -w * 0.15, 0, h * 0.32, "rgba(255,200,240,0.4)");
      ctx.restore();
      for (const st of s.sky) {
        ctx.globalAlpha = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * st.sp + st.ph));
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(st.x, st.y, st.r, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      shootingStars(ctx, s, t, dt, w, h);
      hills(ctx, w, h, 0.9, 30, "#251a4c", 2.2);
      hills(ctx, w, h, 0.97, 18, "#0e0a24", 5.4);
      for (const l of s.town) {
        ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 1.3 + l.ph);
        ctx.fillStyle = "#ffd58a";
        ctx.fillRect(l.x, h * l.y, 2, 2);
      }
      ctx.globalAlpha = 1;
      for (const m of s.motes) {
        m.y -= (8 + 16 * m.z) * dt;
        m.x += Math.sin(t * 0.6 + m.ph) * 6 * m.z * dt;
        if (m.y < -10) { m.y = h + 10; m.x = rand(0, w); }
        glow(ctx, m.x, m.y, 3 + 7 * m.z, "rgba(150,255,230,0.9)", 0.25 + 0.55 * m.z * (0.6 + 0.4 * Math.sin(t * 2 + m.ph)));
      }
    },
  },

  // A neon night, as retro anime and synthwave draw it: a striped sun sinking, glowing mountain edges,
  // and a grid floor rushing toward you in perspective.
  neon: {
    init: (w, h) => ({
      sparks: Array.from({ length: 40 }, () => ({ x: rand(0, w), y: rand(0, h * 0.62), ph: rand(0, TAU), sp: rand(1, 3) })),
    }),
    frame(ctx, s, t, dt, w, h) {
      const horizon = h * 0.68;
      const air = ctx.createLinearGradient(0, 0, 0, horizon);
      for (const [at, c] of [[0, "#07011a"], [0.52, "#1b0640"], [0.86, "#5a0d6e"], [1, "#ff2e88"]]) air.addColorStop(at, c);
      ctx.fillStyle = air;
      ctx.fillRect(0, 0, w, horizon);
      for (const sp of s.sparks) {
        ctx.globalAlpha = 0.3 + 0.7 * Math.max(0, Math.sin(t * sp.sp + sp.ph));
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(sp.x, sp.y, 1.4, 1.4);
      }
      ctx.globalAlpha = 1;
      // The sun, striped across its lower half, the stripes sliding down.
      const cx = w / 2, cy = horizon - w * 0.05, r = w * 0.24;
      glow(ctx, cx, cy, r * 2.1, "rgba(255,60,150,0.7)");
      const sg = ctx.createLinearGradient(0, cy - r, 0, cy + r);
      sg.addColorStop(0, "#ffe66d");
      sg.addColorStop(0.55, "#ff7a59");
      sg.addColorStop(1, "#ff2e88");
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, TAU);
      ctx.clip();
      ctx.fillStyle = sg;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      // The stripes are the sky showing through.
      ctx.fillStyle = air;
      for (let i = 0; i < 7; i++) {
        const y = cy + ((i * 0.16 + (t * 0.05) % 0.16) * r);
        ctx.fillRect(cx - r, y, r * 2, 1.5 + i * 1.6);
      }
      ctx.restore();
      // The floor, the sun sinking behind it.
      const floor = ctx.createLinearGradient(0, horizon, 0, h);
      floor.addColorStop(0, "#1a0436");
      floor.addColorStop(1, "#05010f");
      ctx.fillStyle = floor;
      ctx.fillRect(0, horizon, w, h - horizon);
      // Mountains, their edges lit.
      ctx.beginPath();
      ctx.moveTo(0, horizon);
      const peaks = [[0, 0], [0.12, 0.09], [0.22, 0.04], [0.33, 0.13], [0.42, 0.05], [0.5, 0.02], [0.6, 0.06], [0.7, 0.15], [0.8, 0.07], [0.9, 0.11], [1, 0.03]];
      for (const [px, py] of peaks) ctx.lineTo(px * w, horizon - py * h);
      ctx.lineTo(w, horizon);
      ctx.closePath();
      ctx.fillStyle = "#14022e";
      ctx.fill();
      ctx.strokeStyle = "rgba(0,229,255,0.8)";
      ctx.lineWidth = 1.2;
      ctx.shadowColor = "#00e5ff";
      ctx.shadowBlur = 8;
      ctx.stroke();
      // The grid: lines toward the vanishing point, and rows coming closer.
      ctx.strokeStyle = "rgba(255,46,200,0.85)";
      ctx.shadowColor = "#ff2ec8";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = -12; i <= 12; i++) {
        ctx.moveTo(cx + i * 4, horizon);
        ctx.lineTo(cx + i * w * 0.2, h);
      }
      const rows = 14;
      for (let k = 0; k < rows; k++) {
        const z = ((k + (t * 1.6) % 1) / rows);
        const y = horizon + (h - horizon) * z ** 2.4;
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
      glow(ctx, cx, horizon, w * 0.6, "rgba(255,46,136,0.35)");
    },
  },

  // A moonlit sea: a great moon with its halo, thin clouds passing, stars, and the moon's path on the
  // water broken into glints that come and go, the waves rolling beneath.
  moonlit: {
    init: (w, h) => ({
      sky: Array.from({ length: 110 }, () => ({ x: rand(0, w), y: rand(0, h * 0.55), r: rand(0.4, 1.3), ph: rand(0, TAU), sp: rand(0.8, 2) })),
      wisps: Array.from({ length: 5 }, (_, i) => ({ x: rand(-w, w), y: h * (0.12 + i * 0.09), l: rand(0.5, 1) * w, sp: rand(5, 12) })),
      glints: Array.from({ length: 140 }, () => ({ d: Math.random() ** 1.6, o: rand(-1, 1), ph: rand(0, TAU), sp: rand(1.5, 4) })),
      stars: [], nextStar: 2,
    }),
    frame(ctx, s, t, dt, w, h) {
      const horizon = h * 0.62;
      sky(ctx, w, h, [[0, "#040a1e"], [0.4, "#0f1d48"], [0.62, "#2d4486"], [0.621, "#0d1a3d"], [1, "#030814"]]);
      for (const st of s.sky) {
        ctx.globalAlpha = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * st.sp + st.ph));
        ctx.fillStyle = "#e8f0ff";
        ctx.beginPath();
        ctx.arc(st.x, st.y, st.r, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      shootingStars(ctx, s, t, dt, w, h * 0.7);
      const mx = w * 0.7, my = h * 0.5, mr = w * 0.11;
      glow(ctx, mx, my, mr * 5, "rgba(140,170,255,0.45)");
      glow(ctx, mx, my, mr * 2.2, "rgba(220,230,255,0.7)");
      const mg = ctx.createRadialGradient(mx - mr * 0.3, my - mr * 0.3, mr * 0.1, mx, my, mr);
      mg.addColorStop(0, "#ffffff");
      mg.addColorStop(1, "#cfdcff");
      ctx.fillStyle = mg;
      ctx.beginPath();
      ctx.arc(mx, my, mr, 0, TAU);
      ctx.fill();
      // Craters, faintly.
      ctx.fillStyle = "rgba(150,170,220,0.25)";
      for (const [dx, dy, r] of [[-0.3, -0.1, 0.18], [0.25, 0.3, 0.12], [0.1, -0.35, 0.1], [-0.15, 0.4, 0.08]]) {
        ctx.beginPath();
        ctx.arc(mx + dx * mr, my + dy * mr, r * mr, 0, TAU);
        ctx.fill();
      }
      for (const wi of s.wisps) {
        wi.x += wi.sp * dt;
        if (wi.x > w + 20) wi.x = -wi.l - 20;
        ctx.save();
        ctx.translate(wi.x + wi.l / 2, wi.y);
        ctx.scale(1, 0.08);
        glow(ctx, 0, 0, wi.l / 2, "rgba(170,190,240,0.35)");
        ctx.restore();
      }
      // The waves, and the moon's path on them.
      ctx.strokeStyle = "rgba(90,120,200,0.18)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let k = 0; k < 9; k++) {
        const y = horizon + (h - horizon) * ((k + (t * 0.25) % 1) / 9) ** 1.6;
        ctx.moveTo(0, y + Math.sin(t * 1.5 + k) * 1.4);
        for (let x = 12; x <= w; x += 12) ctx.lineTo(x, y + Math.sin(x * 0.05 + t * 1.5 + k) * 1.4);
      }
      ctx.stroke();
      for (const g of s.glints) {
        const y = horizon + 3 + g.d * (h - horizon - 6);
        const spread = 6 + g.d * w * 0.28;
        const a = Math.max(0, Math.sin(t * g.sp + g.ph));
        ctx.globalAlpha = a * (0.9 - g.d * 0.4);
        ctx.fillStyle = "#e6eeff";
        ctx.fillRect(mx + g.o * spread, y, 2 + g.d * 10, 1.2);
      }
      ctx.globalAlpha = 1;
      glow(ctx, mx, horizon, w * 0.35, "rgba(160,190,255,0.25)");
    },
  },
};

/** The scenes there are. */
export const SCENE_NAMES = Object.keys(SCENES);

/**
 * A scene, drawn in a canvas filling its parent: playing, or (`playing` false, or less motion asked
 * for) one still frame.
 */
export function CallScene({ scene, playing = true, className }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    const def = SCENES[scene];
    if (!canvas || !def) return;
    const ctx = canvas.getContext("2d");
    const still = !playing || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0, h = 0, state = null, raf = 0, last = performance.now();
    // Begin a little way in, so the petals and stars are already about.
    let t = 3;
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = r.width;
      h = r.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      state = def.init(w, h);
      def.frame(ctx, state, t, 0, w, h);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const step = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;
      if (state) def.frame(ctx, state, t, dt, w, h);
      raf = requestAnimationFrame(step);
    };
    if (!still) raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [scene, playing]);
  return <canvas ref={ref} aria-hidden className={className} data-call-scene={scene} />;
}
