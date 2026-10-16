"use client";

// Movimiento 3D del sitio: tres envoltorios chicos que sólo ponen variables CSS y atributos; el
// dibujo vive en movimiento.module.css. Ninguno toca la base ni el servidor, y los tres se
// apagan solos en pantallas táctiles o cuando la persona pidió menos movimiento.

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import m from "./movimiento.module.css";

const sinMovimiento = (): boolean => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * La portada con profundidad: las capas marcadas con `data-capa="fondo" | "texto" | "frente"`
 * se desplazan distinto según dónde está el mouse y cuánto se bajó la página.
 */
export function Escena({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || sinMovimiento()) return;
    let pedido = 0;
    let mx = 0;
    let my = 0;
    const pintar = () => {
      pedido = 0;
      el.style.setProperty("--mx", mx.toFixed(3));
      el.style.setProperty("--my", my.toFixed(3));
      el.style.setProperty("--sy", String(Math.min(window.scrollY, 900)));
    };
    const pedir = () => {
      if (!pedido) pedido = requestAnimationFrame(pintar);
    };
    const mover = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const r = el.getBoundingClientRect();
      mx = ((e.clientX - r.left) / r.width - 0.5) * 2;
      my = ((e.clientY - r.top) / r.height - 0.5) * 2;
      pedir();
    };
    const salir = () => {
      mx = 0;
      my = 0;
      pedir();
    };
    el.addEventListener("pointermove", mover);
    el.addEventListener("pointerleave", salir);
    window.addEventListener("scroll", pedir, { passive: true });
    return () => {
      el.removeEventListener("pointermove", mover);
      el.removeEventListener("pointerleave", salir);
      window.removeEventListener("scroll", pedir);
      if (pedido) cancelAnimationFrame(pedido);
    };
  }, []);
  return (
    <div ref={ref} className={[m.escena, className].filter(Boolean).join(" ")}>
      {children}
    </div>
  );
}

/** Una tarjeta que se inclina hacia el puntero. Lo que lleve `data-flota` se despega del plano. */
export function Inclinar({ children, maximo = 7, className }: { children: ReactNode; maximo?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [activo, setActivo] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || sinMovimiento()) return;
    let pedido = 0;
    let rx = 0;
    let ry = 0;
    let bx = 50;
    let by = 50;
    const pintar = () => {
      pedido = 0;
      el.style.setProperty("--rx", `${rx.toFixed(2)}deg`); // no-es-plata: grados de la inclinación 3D
      el.style.setProperty("--ry", `${ry.toFixed(2)}deg`); // no-es-plata: grados de la inclinación 3D
      el.style.setProperty("--brillo-x", `${bx.toFixed(1)}%`);
      el.style.setProperty("--brillo-y", `${by.toFixed(1)}%`);
    };
    const mover = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      ry = (px - 0.5) * 2 * maximo;
      rx = (0.5 - py) * 2 * maximo;
      bx = px * 100;
      by = py * 100;
      if (!pedido) pedido = requestAnimationFrame(pintar);
    };
    const entrar = (e: PointerEvent) => {
      if (e.pointerType === "mouse") setActivo(true);
    };
    const salir = () => {
      rx = 0;
      ry = 0;
      setActivo(false);
      if (!pedido) pedido = requestAnimationFrame(pintar);
    };
    el.addEventListener("pointerenter", entrar);
    el.addEventListener("pointermove", mover);
    el.addEventListener("pointerleave", salir);
    return () => {
      el.removeEventListener("pointerenter", entrar);
      el.removeEventListener("pointermove", mover);
      el.removeEventListener("pointerleave", salir);
      if (pedido) cancelAnimationFrame(pedido);
    };
  }, [maximo]);
  return (
    <div ref={ref} data-activo={activo ? "1" : "0"} className={[m.inclinable, className].filter(Boolean).join(" ")}>
      {children}
    </div>
  );
}

/** Lo que está adentro aparece cuando entra en pantalla: sube y se endereza. `orden` escalona. */
export function Revelar({ children, orden = 0, className, como = "div" }: { children: ReactNode; orden?: number; className?: string; como?: "div" | "li" | "section" }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Se marca en el DOM, no en estado: así no hay un render de más ni diferencia con el servidor.
    const mostrar = () => el.setAttribute("data-visto", "1");
    if (sinMovimiento() || !("IntersectionObserver" in window)) {
      mostrar();
      return;
    }
    const obs = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((e) => e.isIntersecting)) {
          mostrar();
          obs.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.12 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  const Tag = como;
  return (
    <Tag ref={ref as never} data-visto="0" style={{ "--i": orden } as CSSProperties} className={[m.revelar, className].filter(Boolean).join(" ")}>
      {children}
    </Tag>
  );
}

/** Una ilustración que flota despacio, para cuando la portada no tiene foto real. */
export const claseFlotar = m.flotar;
