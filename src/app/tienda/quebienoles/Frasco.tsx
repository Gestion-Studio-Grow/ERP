"use client";

// El frasco 3D del portal. Envuelve la escena (frasco-escena.ts, three.js) con lo que es de React y
// del navegador: cuándo cargarla, cuándo pausarla, qué hacer si no hay WebGL y cómo se rocía.
//
// · three.js se pide con import dinámico cuando el portal ya pintó, el hilo está libre
//   (requestIdleCallback) y el lienzo está en pantalla: el titular y los botones nunca esperan al 3D,
//   y si alguien nunca llega al frasco (teléfono, se fue antes) no baja los 136 KB. Mientras tanto (y
//   si no hay WebGL) se ve la caja con la Q de su portada, que dibuja el padre debajo del lienzo.
// · Rociar: apretar y sostener sobre el frasco, o el botón «Rociá» (también con Espacio/Enter
//   sostenidos). Con movimiento reducido no hay bruma: el botón igual dice «¡Qué bien olés!».
// · El bucle se apaga fuera de pantalla y con la pestaña oculta (batería del teléfono).
// · Lo que cambia con el scroll (cuánto salió el portal) y con el rocío vive ACÁ, no en el estado del
//   padre: antes cada cuadro de scroll re-renderizaba la vidriera entera para mover una cámara.

import { useEffect, useRef, useState, type RefObject } from "react";
import type { Frasco as Escena } from "./frasco-escena";

type Props = {
  color: string;
  fondo: string;
  letra: string;
  movimiento: boolean;
  /** La sección del portal: de su posición sale cuánto salió de pantalla (gira el frasco, sube la cámara). */
  portal: RefObject<HTMLElement | null>;
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

/** Cuando el hilo principal quede libre (o a más tardar en `tope` ms); sin requestIdleCallback (Safari), enseguida. */
function enRatoLibre(tarea: () => void, tope: number): () => void {
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
  if (w.requestIdleCallback) {
    const id = w.requestIdleCallback(tarea, { timeout: tope });
    return () => w.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(tarea, 250);
  return () => window.clearTimeout(id);
}

export default function Frasco({ color, fondo, letra, movimiento, portal }: Props) {
  const lienzo = useRef<HTMLCanvasElement>(null);
  const escena = useRef<Escena | null>(null);
  // Frasco se carga sólo en el navegador (dynamic, ssr: false): acá ya se puede preguntar por WebGL.
  const [estado, setEstado] = useState<"cargando" | "listo" | "sin-3d">(() => (hayWebGL2() ? "cargando" : "sin-3d"));
  const [rociando, setRociando] = useState(false);
  // El color con el que nace la escena (los cambios siguientes van por `escena.color`).
  const colorActual = useRef(color);
  useEffect(() => {
    colorActual.current = color;
  }, [color]);

  useEffect(() => {
    const c = lienzo.current;
    if (!c || estado === "sin-3d") return;
    let vivo = true;
    let enPantalla = true;
    let cargando = false;
    let cancelarEspera: (() => void) | null = null;
    const visible = () => escena.current?.activo(enPantalla && document.visibilityState === "visible");
    const medir = () => escena.current?.medir();

    const cargar = () => {
      if (cargando || !vivo) return;
      cargando = true;
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
          visible();
          medirSalida();
        })
        .catch(() => vivo && setEstado("sin-3d"));
    };

    // Primero mira si el lienzo está en pantalla; recién ahí, en un rato libre del hilo, baja three.js.
    // El mismo observador después prende y apaga el bucle al entrar y salir de pantalla.
    const observador = new IntersectionObserver(([e]) => {
      enPantalla = e.isIntersecting;
      if (enPantalla && !cargando && !cancelarEspera) cancelarEspera = enRatoLibre(cargar, 2500);
      visible();
    });
    observador.observe(c);

    const ro = new ResizeObserver(medir);
    ro.observe(c);
    document.addEventListener("visibilitychange", visible);

    // Cuánto salió el portal de pantalla: el frasco gira y la cámara sube al bajar. Se mide acá, con
    // el rAF de la escena como único consumidor (nada de estado de React en cada cuadro de scroll).
    let pendiente = 0;
    const medirSalida = () => {
      pendiente = 0;
      const p = portal.current;
      if (!p || !escena.current) return;
      const r = p.getBoundingClientRect();
      escena.current.salida(Math.max(0, Math.min(1, -r.top / Math.max(1, r.height))));
    };
    const alScroll = () => {
      if (!pendiente && enPantalla) pendiente = requestAnimationFrame(medirSalida);
    };
    window.addEventListener("scroll", alScroll, { passive: true });

    // El frasco sigue al puntero en toda la pantalla (no sólo sobre el lienzo): se siente vivo.
    let pendienteMirada = 0;
    const alMover = (e: PointerEvent) => {
      if (pendienteMirada || !enPantalla) return;
      pendienteMirada = requestAnimationFrame(() => {
        pendienteMirada = 0;
        const r = c.getBoundingClientRect();
        const x = ((e.clientX - (r.left + r.width * 0.66)) / (r.width * 0.5)) || 0;
        const y = ((e.clientY - (r.top + r.height * 0.5)) / (r.height * 0.5)) || 0;
        escena.current?.mirar(x, y);
      });
    };
    window.addEventListener("pointermove", alMover, { passive: true });

    return () => {
      vivo = false;
      cancelarEspera?.();
      cancelAnimationFrame(pendiente);
      cancelAnimationFrame(pendienteMirada);
      window.removeEventListener("scroll", alScroll);
      window.removeEventListener("pointermove", alMover);
      document.removeEventListener("visibilitychange", visible);
      ro.disconnect();
      observador.disconnect();
      escena.current?.soltar();
      escena.current = null;
    };
    // La escena se crea una vez: el color se le pasa por su método, no se rearma.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    escena.current?.color(color);
  }, [color]);

  const rociar = (si: boolean) => {
    escena.current?.rociar(si);
    setRociando(si);
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
      <p className="qb-rocio" data-visible={rociando} aria-live="polite">
        {rociando ? "¡Qué bien olés!" : ""}
      </p>
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
