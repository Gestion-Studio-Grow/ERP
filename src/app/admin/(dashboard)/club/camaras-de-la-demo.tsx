"use client";

// ============================================================================
// CÁMARAS SIMULADAS — las cámaras del club en la DEMO (en la jornada real no se ven).
// ============================================================================
//
// La versión React de las cámaras del Tablero del sistema de hoy (public/previews/breakpoint/club/app.mjs: la
// sección «Cámaras» de `vistaTablero`, sólo `!MODO_REAL`, y `camaraGrande`): una tecla por cámara con la imagen
// simulada, «CAM 01 · Cancha 1», «DEMO» y lo que dice esa cancha (quién juega y si debe); tocarla la amplía en una
// hoja. Lo que dice cada cámara sale de camaras-core.ts; el dibujo, de camaras-escena.ts.
//
// Movimiento: la imagen se mueve (~8 cuadros por segundo) SÓLO mientras se ve: fuera de pantalla o con la pestaña
// oculta se para; con «menos movimiento» se pinta un cuadro quieto (y se repinta si cambia el turno o la luz).
//
// Va montada en el Tablero del dueño (TableroDelDuenio.tsx), como el vanilla. Recibe sólo el almacén, así que sirve
// también como pieza global (`PropsDePieza`) o solapa (`PropsDeSolapa`) si algún día se la quiere en la recepción.
// Fuera de la demo (`almacen.modo() !== "demo"`) no pinta nada.

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Hoja } from "@/components/ui/Hoja";
import { cn } from "@/components/ui/cn";
import { usePrefersReducedMotion } from "@/lib/use-reduced-motion";
import type { EstadoClub, Ahora } from "@/lib/club/motor.mjs";
import type { Almacen } from "./almacen";
import { CUADRO_MS, NOTA_DE_LA_DEMO, armarCamaras, type CamaraDelClub, type VistaCamaras } from "./camaras-core";
import { dibujarCamara } from "./camaras-escena";
import { porFirma, useSeleccion } from "./usar-almacen";

const seleccionarCamaras = (e: EstadoClub, a: Ahora) => armarCamaras(e, a);

/** Pinta los lienzos de `contenedor` (cada uno con `data-cam`): en bucle mientras se ven, o un cuadro quieto. */
function usePintarCamaras(contenedor: React.RefObject<HTMLElement | null>, v: VistaCamaras, quieto: boolean) {
  const vista = useRef(v);
  useEffect(() => {
    vista.current = v;
  }, [v]);
  useEffect(() => {
    const raiz = contenedor.current;
    if (!raiz) return;
    const pintar = () => {
      const t = performance.now();
      for (const cv of raiz.querySelectorAll<HTMLCanvasElement>("canvas[data-cam]")) {
        const cam = vista.current.camaras[Number(cv.dataset.cam)];
        const ctx = cv.getContext("2d");
        if (cam && ctx) dibujarCamara(ctx, cam, t, vista.current.sello);
      }
    };
    pintar();
    if (quieto) return;
    let enPantalla = true;
    const io = typeof IntersectionObserver === "function" ? new IntersectionObserver((es) => (enPantalla = es.some((e) => e.isIntersecting))) : null;
    io?.observe(raiz);
    const reloj = setInterval(() => {
      if (enPantalla && !document.hidden) pintar();
    }, CUADRO_MS);
    return () => {
      clearInterval(reloj);
      io?.disconnect();
    };
  }, [contenedor, quieto, v.firma]);
}

function CamaraAmpliada({ cam, sello, quieto, onCerrar }: { cam: CamaraDelClub; sello: string; quieto: boolean; onCerrar: () => void }) {
  const lienzo = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = lienzo.current?.getContext("2d");
    if (!ctx) return;
    let cuadro = 0;
    const pintar = () => {
      dibujarCamara(ctx, cam, performance.now(), sello);
      if (!quieto) cuadro = requestAnimationFrame(pintar);
    };
    pintar();
    return () => cancelAnimationFrame(cuadro);
  }, [cam, sello, quieto]);
  return (
    <Hoja abierta onCerrar={onCerrar} titulo={cam.rotulo} descripcion="Simulación de demo: en el club se conecta a la grabadora que ya tienen." className="sm:max-w-2xl">
      <canvas ref={lienzo} width={960} height={540} role="img" aria-label={`Vista ampliada de la cámara ${cam.nombre}: ${cam.pie}`} className="block aspect-video h-auto w-full rounded-md" />
      <p className="mt-2 text-sm text-body">{cam.pie}</p>
    </Hoja>
  );
}

function CamarasDelClub({ almacen }: { almacen: Almacen }) {
  const v = useSeleccion(almacen, seleccionarCamaras, porFirma);
  const quieto = usePrefersReducedMotion();
  const id = useId();
  const grilla = useRef<HTMLUListElement>(null);
  const [ampliada, setAmpliada] = useState<number | null>(null);
  const cerrar = useCallback(() => setAmpliada(null), []);
  usePintarCamaras(grilla, v, quieto);
  const cam = ampliada === null ? null : v.camaras[ampliada];
  return (
    <section aria-labelledby={`${id}-t`} className="flex min-w-0 flex-col gap-3 rounded-lg border border-line bg-surface-raised p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={`${id}-t`} className="text-lg font-semibold text-strong">
          Cámaras
        </h2>
        <p className="text-sm text-body">Cada cámara muestra el turno que está en esa cancha y lo que debe</p>
      </div>
      <ul ref={grilla} aria-label="Cámaras del club" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {v.camaras.map((c, i) => (
          <li key={c.id} className="min-w-0">
            <button
              type="button"
              aria-label={c.etiqueta}
              onClick={() => setAmpliada(i)}
              className="relative block w-full overflow-hidden rounded-md border border-line text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              <canvas width={320} height={200} data-cam={i} aria-hidden className="block aspect-[8/5] h-auto w-full" />
              <span aria-hidden className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 bg-surface-inverted/90 px-2 py-1 text-xs text-surface">
                <span className="tabular-nums">{c.numero}</span>
                <span className="font-semibold">DEMO</span>
              </span>
              <span aria-hidden className="absolute inset-x-0 bottom-0 flex flex-col bg-surface-inverted/90 px-2 py-1 text-xs text-surface">
                <span className="truncate font-semibold">{c.nombre}</span>
                <span className={cn("truncate", c.pie.includes("debe") && "font-semibold")}>{c.pie}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="text-sm text-body">{NOTA_DE_LA_DEMO}</p>
      {cam && <CamaraAmpliada key={cam.id} cam={cam} sello={v.sello} quieto={quieto} onCerrar={cerrar} />}
    </section>
  );
}

/** Las cámaras de la demo; en la jornada real, nada (como el vanilla: `!MODO_REAL`). */
export default function CamarasDeLaDemo({ almacen }: { almacen: Almacen }) {
  return almacen.modo() === "demo" ? <CamarasDelClub almacen={almacen} /> : null;
}
