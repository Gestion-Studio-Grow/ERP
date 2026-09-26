"use client";

// LA ESTELA — el rastro que deja un perfume, dibujado detrás del puntero.
//
// Polvo dorado que sube y se abre como humo, en el color de la familia que se está mirando. Es un
// lienzo 2D fijo, sin eventos (pointer-events: none), en modo `screen` sobre la página: no tapa texto,
// lo aclara apenas. Sólo con mouse (en el teléfono el dedo tapa lo que dibujaría) y nunca con
// movimiento reducido. El cuadro se apaga solo cuando no quedan partículas: quieto, no gasta nada.

import { useEffect, useRef } from "react";

type Mota = { x: number; y: number; vx: number; vy: number; vida: number; max: number; r: number };

const MAX = 160;

export default function Estela({ color, activa }: { color: string; activa: boolean }) {
  const lienzo = useRef<HTMLCanvasElement>(null);
  const colorRef = useRef(color);
  useEffect(() => {
    colorRef.current = color;
  }, [color]);

  useEffect(() => {
    const c = lienzo.current;
    if (!c || !activa) return;
    if (!window.matchMedia("(pointer: fine)").matches) return;
    const g = c.getContext("2d");
    if (!g) return;

    const motas: Mota[] = [];
    let raf = 0;
    let ultimo = 0;
    let px = -1;
    let py = -1;
    let dpr = 1;
    // Sprite: un punto suave pre-dibujado, re-teñido cuando cambia la familia.
    const sprite = document.createElement("canvas");
    sprite.width = sprite.height = 64;
    let tinte = "";
    const tenir = () => {
      if (tinte === colorRef.current) return;
      tinte = colorRef.current;
      const s = sprite.getContext("2d")!;
      s.clearRect(0, 0, 64, 64);
      const d = s.createRadialGradient(32, 32, 0, 32, 32, 32);
      d.addColorStop(0, "rgba(255, 240, 210, 0.9)");
      d.addColorStop(0.25, tinte);
      d.addColorStop(1, "rgba(0,0,0,0)");
      s.fillStyle = d;
      s.fillRect(0, 0, 64, 64);
    };

    const medir = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      c.width = Math.round(window.innerWidth * dpr);
      c.height = Math.round(window.innerHeight * dpr);
    };
    medir();

    const cuadro = (ahora: number) => {
      const dt = Math.min(0.05, (ahora - (ultimo || ahora)) / 1000);
      ultimo = ahora;
      tenir();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, c.width, c.height);
      g.globalCompositeOperation = "lighter";
      for (let i = motas.length - 1; i >= 0; i--) {
        const m = motas[i];
        m.vida -= dt;
        if (m.vida <= 0) {
          motas.splice(i, 1);
          continue;
        }
        m.vx = m.vx * 0.95 + Math.sin(m.y * 0.018 + ahora * 0.0021) * 0.06;
        m.vy = m.vy * 0.95 - 0.045;
        m.x += m.vx;
        m.y += m.vy;
        const f = m.vida / m.max;
        const r = m.r * (1.8 - f) * dpr;
        g.globalAlpha = f * f * 0.32;
        g.drawImage(sprite, m.x * dpr - r, m.y * dpr - r, r * 2, r * 2);
      }
      g.globalAlpha = 1;
      raf = motas.length ? requestAnimationFrame(cuadro) : 0;
      if (!raf) ultimo = 0;
    };

    const alMover = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const dx = px < 0 ? 0 : e.clientX - px;
      const dy = py < 0 ? 0 : e.clientY - py;
      px = e.clientX;
      py = e.clientY;
      const paso = Math.min(4, Math.floor(Math.hypot(dx, dy) / 7) + 1);
      for (let k = 0; k < paso && motas.length < MAX; k++) {
        const max = 0.8 + Math.random() * 0.7;
        motas.push({
          x: e.clientX - (dx * k) / paso + (Math.random() - 0.5) * 6,
          y: e.clientY - (dy * k) / paso + (Math.random() - 0.5) * 6,
          vx: dx * 0.04 + (Math.random() - 0.5) * 0.6,
          vy: dy * 0.04 - Math.random() * 0.5,
          vida: max,
          max,
          r: 5 + Math.random() * 9,
        });
      }
      if (!raf) raf = requestAnimationFrame(cuadro);
    };

    window.addEventListener("pointermove", alMover, { passive: true });
    window.addEventListener("resize", medir);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", alMover);
      window.removeEventListener("resize", medir);
    };
  }, [activa]);

  return <canvas ref={lienzo} className="qb-estela" aria-hidden="true" />;
}
