"use client";

// El frasco 3D del portal. Envuelve la escena (frasco-escena.ts, three.js) con lo que es de React y
// del navegador: cuándo cargarla, cuándo pausarla, qué hacer si no hay WebGL y cómo se rocía.
//
// · three.js se pide con import dinámico cuando el portal ya pintó: el titular y los botones nunca
//   esperan al 3D. Mientras tanto (y si no hay WebGL) se ve la caja con la Q de su portada.
// · Rociar: apretar y sostener sobre el frasco, o el botón «Rociá» (también con Espacio/Enter
//   sostenidos). Con movimiento reducido no hay bruma: el botón igual dice «¡Qué bien olés!».
// · El bucle se apaga fuera de pantalla y con la pestaña oculta (batería del teléfono).

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { Frasco as Escena } from "./frasco-escena";

type Props = {
  color: string;
  fondo: string;
  letra: string;
  movimiento: boolean;
  /** Avisa cuando se rocía (el portal muestra el «¡Qué bien olés!»). */
  alRociar: (si: boolean) => void;
  /** Progreso de salida del portal (0..1), lo mide el padre. */
  salida: number;
};

function calidadDelEquipo(): "alta" | "baja" {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const pocos = (nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 4;
  const chico = Math.min(window.screen.width, window.screen.height) < 480;
  return pocos || chico ? "baja" : "alta";
}

function hayWebGL2(): boolean {
  try {
    return Boolean(document.createElement("canvas").getContext("webgl2"));
  } catch {
    return false;
  }
}

export default function Frasco({ color, fondo, letra, movimiento, alRociar, salida }: Props) {
  const lienzo = useRef<HTMLCanvasElement>(null);
  const escena = useRef<Escena | null>(null);
  // Frasco se carga sólo en el navegador (dynamic, ssr: false): acá ya se puede preguntar por WebGL.
  const [estado, setEstado] = useState<"cargando" | "listo" | "sin-3d">(() => (hayWebGL2() ? "cargando" : "sin-3d"));
  // El color con el que nace la escena (los cambios siguientes van por `escena.color`).
  const colorActual = useRef(color);
  useEffect(() => {
    colorActual.current = color;
  }, [color]);

  useEffect(() => {
    const c = lienzo.current;
    if (!c || estado === "sin-3d") return;
    let vivo = true;
    let observador: IntersectionObserver | null = null;
    let enPantalla = true;
    const visible = () => escena.current?.activo(enPantalla && document.visibilityState === "visible");
    const medir = () => escena.current?.medir();

    import("./frasco-escena")
      .then(({ crearFrasco }) =>
        crearFrasco({
          lienzo: c,
          color: colorActual.current,
          fondo,
          letra,
          movimiento,
          calidad: calidadDelEquipo(),
          alPerder: () => vivo && setEstado("sin-3d"),
        }),
      )
      .then((f) => {
        if (!vivo) return f.soltar();
        escena.current = f;
        f.color(colorActual.current);
        setEstado("listo");
        observador = new IntersectionObserver(([e]) => {
          enPantalla = e.isIntersecting;
          visible();
        });
        observador.observe(c);
      })
      .catch(() => vivo && setEstado("sin-3d"));

    const ro = new ResizeObserver(medir);
    ro.observe(c);
    document.addEventListener("visibilitychange", visible);

    // El frasco sigue al puntero en toda la pantalla (no sólo sobre el lienzo): se siente vivo.
    let pendiente = 0;
    const alMover = (e: PointerEvent) => {
      if (pendiente) return;
      pendiente = requestAnimationFrame(() => {
        pendiente = 0;
        const r = c.getBoundingClientRect();
        const x = ((e.clientX - (r.left + r.width * 0.66)) / (r.width * 0.5)) || 0;
        const y = ((e.clientY - (r.top + r.height * 0.5)) / (r.height * 0.5)) || 0;
        escena.current?.mirar(x, y);
      });
    };
    window.addEventListener("pointermove", alMover, { passive: true });

    return () => {
      vivo = false;
      cancelAnimationFrame(pendiente);
      window.removeEventListener("pointermove", alMover);
      document.removeEventListener("visibilitychange", visible);
      ro.disconnect();
      observador?.disconnect();
      escena.current?.soltar();
      escena.current = null;
    };
    // La escena se crea una vez: color y salida se le pasan por sus métodos, no se rearma.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    escena.current?.color(color);
  }, [color]);

  useEffect(() => {
    escena.current?.salida(salida);
  }, [salida]);

  const rociar = (si: boolean) => {
    escena.current?.rociar(si);
    alRociar(si);
    if (si && "vibrate" in navigator) navigator.vibrate?.(12);
  };

  return (
    <div className="qb-frasco" data-estado={estado}>
      <canvas
        ref={lienzo}
        className="qb-frasco-lienzo"
        aria-hidden="true"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          rociar(true);
        }}
        onPointerUp={() => rociar(false)}
        onPointerCancel={() => rociar(false)}
        onPointerLeave={(e) => e.buttons === 0 && rociar(false)}
      />
      {estado !== "listo" && (
        <div className="qb-frasco-respaldo" aria-hidden="true">
          <Image src="/tenants/quebienoles/perfumes/marca-caja-q.jpg" alt="" width={560} height={700} priority />
        </div>
      )}
      <button
        type="button"
        className="qb-rociar"
        onPointerDown={(e) => {
          e.preventDefault();
          rociar(true);
        }}
        onPointerUp={() => rociar(false)}
        onPointerLeave={() => rociar(false)}
        onKeyDown={(e) => {
          if ((e.key === " " || e.key === "Enter") && !e.repeat) {
            e.preventDefault();
            rociar(true);
          }
        }}
        onKeyUp={(e) => {
          if (e.key === " " || e.key === "Enter") rociar(false);
        }}
        onBlur={() => rociar(false)}
      >
        <span className="qb-rociar-punto" aria-hidden="true" />
        Mantené apretado para rociar
      </button>
    </div>
  );
}
