"use client";

import { useEffect } from "react";

// Isla de MOTION del landing premium. Todo el contenido lo renderiza el server
// (SEO); esto solo agrega el comportamiento tras la hidratación, sobre el DOM ya
// pintado. Reglas de performance:
//  - Solo anima transform/opacity (compositor / GPU), nunca layout.
//  - Respeta prefers-reduced-motion (no engancha mouse/parallax/magnético).
//  - IntersectionObserver para reveals (sin polling) + fallback de seguridad.
export default function PremiumMotion() {
  useEffect(() => {
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const root = document.querySelector<HTMLElement>(".pl");
    if (!root) return;

    const cleanups: Array<() => void> = [];

    // Reveal on scroll
    const reveals = Array.from(root.querySelectorAll<HTMLElement>(".reveal"));
    let io: IntersectionObserver | null = null;
    if ("IntersectionObserver" in window) {
      io = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) {
              e.target.classList.add("in");
              io!.unobserve(e.target);
            }
          });
        },
        { rootMargin: "0px 0px -12% 0px", threshold: 0.15 }
      );
      reveals.forEach((el) => io!.observe(el));
    } else {
      reveals.forEach((el) => el.classList.add("in"));
    }
    // Fallback: nada queda oculto si el observer no dispara.
    const fb = window.setTimeout(() => {
      root.querySelectorAll<HTMLElement>(".reveal:not(.in)").forEach((el) => el.classList.add("in"));
    }, 1400);
    cleanups.push(() => { io?.disconnect(); window.clearTimeout(fb); });

    if (reduce) return () => cleanups.forEach((c) => c());

    // Parallax de glows (rAF, solo transform)
    const glows = Array.from(root.querySelectorAll<HTMLElement>(".glows .glow"));
    const depth = [26, -34, 18];
    let tx = 0, ty = 0, cx = 0, cy = 0, ticking = false;
    const apply = () => {
      cx += (tx - cx) * 0.08; cy += (ty - cy) * 0.08;
      glows.forEach((g, i) => {
        const d = depth[i % depth.length];
        g.style.transform = `translate3d(${cx * d}px,${cy * d}px,0)`;
      });
      if (Math.abs(tx - cx) > 0.001 || Math.abs(ty - cy) > 0.001) requestAnimationFrame(apply);
      else ticking = false;
    };
    const onMove = (e: PointerEvent) => {
      tx = e.clientX / window.innerWidth - 0.5;
      ty = e.clientY / window.innerHeight - 0.5;
      if (!ticking) { ticking = true; requestAnimationFrame(apply); }
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    cleanups.push(() => window.removeEventListener("pointermove", onMove));

    // Botón magnético
    root.querySelectorAll<HTMLElement>("[data-magnetic]").forEach((btn) => {
      const lbl = btn.querySelector<HTMLElement>(".lbl") || btn;
      let raf = 0;
      const move = (e: PointerEvent) => {
        const r = btn.getBoundingClientRect();
        const mx = e.clientX - (r.left + r.width / 2);
        const my = e.clientY - (r.top + r.height / 2);
        if (raf) return;
        raf = requestAnimationFrame(() => {
          btn.style.transform = `translate3d(${mx * 0.28}px,${my * 0.4}px,0)`;
          lbl.style.transform = `translate3d(${mx * 0.14}px,${my * 0.2}px,0)`;
          raf = 0;
        });
      };
      const leave = () => { btn.style.transform = ""; lbl.style.transform = ""; };
      btn.addEventListener("pointermove", move);
      btn.addEventListener("pointerleave", leave);
      cleanups.push(() => { btn.removeEventListener("pointermove", move); btn.removeEventListener("pointerleave", leave); });
    });

    // Spotlight de cards (posición del brillo por CSS var)
    root.querySelectorAll<HTMLElement>("[data-tilt]").forEach((card) => {
      const move = (e: PointerEvent) => {
        const r = card.getBoundingClientRect();
        card.style.setProperty("--mx", `${((e.clientX - r.left) / r.width) * 100}%`);
        card.style.setProperty("--my", `${((e.clientY - r.top) / r.height) * 100}%`);
      };
      card.addEventListener("pointermove", move);
      cleanups.push(() => card.removeEventListener("pointermove", move));
    });

    return () => cleanups.forEach((c) => c());
  }, []);

  return null;
}
