"use client";

import { useEffect, useRef } from "react";

export default function SnowBackdrop() {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let w = 0;
    let h = 0;
    let raf = 0;
    let flakes = [];
    const COUNT = 55;

    function resize() {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    }
    function seed() {
      flakes = Array.from({ length: COUNT }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 2 + 0.6,
        sp: Math.random() * 0.55 + 0.22,
        drift: Math.random() * 0.5 - 0.25,
        o: Math.random() * 0.45 + 0.18,
      }));
    }
    function render(moving) {
      ctx.clearRect(0, 0, w, h);
      for (const f of flakes) {
        if (moving) {
          f.y += f.sp;
          f.x += f.drift + Math.sin(f.y / 60) * 0.15;
          if (f.y > h + 6) {
            f.y = -6;
            f.x = Math.random() * w;
          }
          if (f.x > w + 6) f.x = -6;
          else if (f.x < -6) f.x = w + 6;
        }
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(148, 163, 184, ${f.o})`;
        ctx.fill();
      }
    }
    function loop() {
      render(true);
      raf = requestAnimationFrame(loop);
    }

    resize();
    seed();
    if (reduce) render(false);
    else loop();

    const onResize = () => {
      resize();
      seed();
    };
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return <canvas ref={ref} className="absolute inset-0 block h-full w-full" />;
}
