"use client";

// El frasco 3D del portal. Envuelve la escena (frasco-escena.ts, three.js) con lo que es de React y
// del navegador: dónde correrla, cuándo cargarla, cuándo pausarla, qué hacer si no hay WebGL y cómo se rocía.
//
// · La escena corre en un WEB WORKER sobre un OffscreenCanvas (frasco-worker.ts): three.js, la
//   compilación de shaders y cada cuadro quedan fuera del hilo que responde al toque, al scroll y a
//   React. Si el navegador no puede (sin OffscreenCanvas/WebGL2 en worker), la misma escena corre en el
//   hilo principal como antes. El worker se sondea ANTES de transferir el lienzo: transferido, el
//   <canvas> ya no sirve acá.
// · Se arranca cuando el portal ya pintó, el hilo está libre (requestIdleCallback) y el lienzo está en
//   pantalla: el titular y los botones nunca esperan al 3D, y si alguien nunca llega al frasco no baja
//   los 137 KB. Mientras tanto (y si no hay WebGL) se ve la caja con la Q de su portada, que dibuja el
//   padre debajo del lienzo; cuando el worker avisa «listo», el lienzo se funde encima.
// · Rociar: apretar y sostener sobre el frasco, o el botón «Rociá» (también con Espacio/Enter
//   sostenidos). Con movimiento reducido no hay bruma: el botón igual dice «¡Qué bien olés!».
// · El bucle se apaga fuera de pantalla y con la pestaña oculta (batería del teléfono).
// · Lo que cambia con el scroll (cuánto salió el portal) y con el rocío vive ACÁ, no en el estado del
//   padre: cada cuadro de scroll manda un número, no re-renderiza la vidriera.

import { useEffect, useRef, useState, type RefObject } from "react";
import type { Frasco as Escena } from "./frasco-escena";
import type { AlWorker, DelWorker } from "./frasco-worker";
import { ARCHIVO_DIDONA } from "./tokens";

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

/** ¿Este navegador puede correr la escena en un worker? (Lo confirma después el propio worker.) */
function puedeWorker(c: HTMLCanvasElement): boolean {
  return typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined" && typeof c.transferControlToOffscreen === "function";
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
    let worker: Worker | null = null;
    const visible = () => escena.current?.activo(enPantalla && document.visibilityState === "visible");
    const medidas = () => ({ ancho: c.clientWidth, alto: c.clientHeight, dpr: window.devicePixelRatio || 1 });
    const medir = () => {
      const m = medidas();
      escena.current?.medir(m.ancho, m.alto, m.dpr);
    };
    const opciones = () => ({ ...medidas(), color: colorActual.current, fondo, letra, movimiento, calidad: calidadDelEquipo() });

    const lista = (f: Escena) => {
      if (!vivo) return f.soltar();
      escena.current = f;
      f.color(colorActual.current);
      setEstado("listo");
      visible();
      medirSalida();
    };

    // Camino de siempre: la escena en este hilo (navegadores sin OffscreenCanvas en worker).
    const enHilo = () => {
      import("./frasco-escena")
        .then(({ crearFrasco }) => crearFrasco({ lienzo: c, ...opciones(), alPerder: () => vivo && setEstado("sin-3d") }))
        .then(lista)
        .catch(() => vivo && setEstado("sin-3d"));
    };

    // Camino nuevo: el worker. Un mismo `Escena` para el resto del componente, que manda mensajes.
    const enWorker = () => {
      let w: Worker;
      try {
        w = new Worker(new URL("./frasco-worker.ts", import.meta.url), { type: "module" });
      } catch {
        return enHilo();
      }
      worker = w;
      let transferido = false;
      const mandar = (m: AlWorker, t?: Transferable[]) => (t ? w.postMessage(m, t) : w.postMessage(m));
      const abandonar = () => {
        w.terminate();
        worker = null;
        // Con el lienzo ya transferido no hay vuelta al hilo: queda la caja de la Q.
        if (transferido) setEstado("sin-3d");
        else enHilo();
      };
      w.onerror = () => vivo && abandonar();
      w.onmessage = (e: MessageEvent<DelWorker>) => {
        if (!vivo) return;
        const m = e.data;
        if (m.tipo === "puedo") {
          const off = c.transferControlToOffscreen();
          transferido = true;
          mandar(
            { tipo: "iniciar", lienzo: off, ...opciones(), urlLetra: new URL(ARCHIVO_DIDONA, window.location.href).href },
            [off],
          );
        } else if (m.tipo === "no-puedo" || m.tipo === "error") abandonar();
        else if (m.tipo === "perdido") setEstado("sin-3d");
        else if (m.tipo === "listo")
          lista({
            color: (hex) => mandar({ tipo: "color", hex }),
            mirar: (x, y) => mandar({ tipo: "mirar", x, y }),
            rociar: (si) => mandar({ tipo: "rociar", si }),
            salida: (p) => mandar({ tipo: "salida", p }),
            activo: (si) => mandar({ tipo: "activo", si }),
            medir: (ancho, alto, dpr) => mandar({ tipo: "medir", ancho, alto, dpr }),
            soltar: () => {
              mandar({ tipo: "soltar" });
              w.terminate();
            },
          });
      };
      mandar({ tipo: "sondear" });
    };

    const cargar = () => {
      if (cargando || !vivo) return;
      cargando = true;
      if (puedeWorker(c)) enWorker();
      else enHilo();
    };

    // Primero mira si el lienzo está en pantalla; recién ahí, en un rato libre del hilo, arranca.
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

    // Cuánto salió el portal de pantalla: el frasco gira y la cámara sube al bajar. Se mide acá y se
    // le manda a la escena como un número (nada de estado de React en cada cuadro de scroll).
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
      worker?.terminate();
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
