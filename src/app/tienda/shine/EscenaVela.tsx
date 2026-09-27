"use client";

// La vela 3D de la portada de Shine. Envuelve la escena (vela-escena.ts, three.js) con lo que es de
// React y del navegador: dónde correrla, cuándo cargarla, cuándo pausarla, qué hacer sin WebGL, y los
// mandos (apagar/encender y el aroma).
//
// · Llega en un chunk asíncrono (VelaDiferida.tsx, `next/dynamic` sin SSR): ni este archivo ni sus
//   estilos viajan en el JS que comparten las vidrieras de /tienda. three.js es OTRO chunk más, que se
//   pide recién cuando la portada ya pintó, el hilo está libre y el lienzo está en pantalla. Mientras
//   tanto (y siempre, si no hay WebGL) se ve la foto de la portada, que sigue siendo el LCP; cuando la
//   escena avisa «listo», el lienzo se funde encima.
// · La escena corre en un WEB WORKER sobre un OffscreenCanvas (vela-worker.ts); si el navegador no
//   puede, la misma escena corre en el hilo principal. El worker se sondea ANTES de transferir el lienzo.
// · Tocar la vela (o el botón, también con teclado) la apaga y la enciende; al apagarla sale un hilo
//   de humo. Elegir un aroma cambia el color de la cera (tono ilustrativo, vela-reglas.ts).
// · El bucle se apaga fuera de pantalla, con la pestaña oculta y con la vela apagada y quieta. Con
//   movimiento reducido: un cuadro quieto, sin humo.

import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "@/lib/use-reduced-motion";
import type { Vela } from "./vela-escena";
import type { AlWorker, DelWorker } from "./vela-worker";
import { avisoDelEstado, CERA_DEL_CATALOGO, textoDelBoton, tinteDeAroma } from "./vela-reglas";

export type PropsEscenaVela = {
  /** Los aromas de temporada de la marca (storefront.ts → gourmetItems). Sin aromas, no hay selector. */
  aromas: readonly string[];
  /** "columna": en la columna de la foto (vidriera de siempre); "sangre": portada a todo el ancho. */
  encuadre: "columna" | "sangre";
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

function puedeWorker(c: HTMLCanvasElement): boolean {
  return typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined" && typeof c.transferControlToOffscreen === "function";
}

/** Cuando el hilo principal quede libre (o a más tardar en `tope` ms); sin requestIdleCallback (Safari), en 250 ms. */
function enRatoLibre(tarea: () => void, tope: number): () => void {
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  if (w.requestIdleCallback) {
    const id = w.requestIdleCallback(tarea, { timeout: tope });
    return () => w.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(tarea, 250);
  return () => window.clearTimeout(id);
}

export default function EscenaVela({ aromas, encuadre }: PropsEscenaVela) {
  const raiz = useRef<HTMLDivElement>(null);
  const lienzo = useRef<HTMLCanvasElement>(null);
  const escena = useRef<Vela | null>(null);
  const reduce = usePrefersReducedMotion();
  // WebGL no se sondea acá: crear un contexto en el hilo principal es una tarea larga (medido: ~250 ms
  // sin GPU). Lo sondea el worker, fuera del hilo; sólo el camino de respaldo pregunta acá.
  const [estado, setEstado] = useState<"cargando" | "listo" | "sin-3d">("cargando");
  const [encendida, setEncendida] = useState(true);
  const [aroma, setAroma] = useState<string | null>(null);
  // Con lo que nace la escena (los cambios siguientes van por sus métodos).
  const inicial = useRef({ cera: CERA_DEL_CATALOGO, encendida: true, movimiento: !reduce });
  useEffect(() => {
    inicial.current = { cera: tinteDeAroma(aroma), encendida, movimiento: !reduce };
  }, [aroma, encendida, reduce]);

  useEffect(() => {
    const c = lienzo.current;
    const r = raiz.current;
    if (!c || !r || estado === "sin-3d") return;
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
    const opciones = () => ({
      ...medidas(),
      cera: inicial.current.cera,
      encendida: inicial.current.encendida,
      movimiento: inicial.current.movimiento,
      calidad: calidadDelEquipo(),
      encuadre,
    });
    // Lo que la escena informa se escribe en atributos (sin re-render): fps para la QA, dónde cae la vela.
    const alRitmo = (fps: number, paso: number) => {
      r.dataset.fps = String(fps);
      r.dataset.calidad = String(paso);
    };
    const alUbicar = (x: number, y: number) => {
      r.dataset.velaX = x.toFixed(3);
      r.dataset.velaY = y.toFixed(3);
    };

    const lista = (v: Vela) => {
      if (!vivo) return v.soltar();
      escena.current = v;
      setEstado("listo");
      visible();
    };

    // Camino de respaldo: la escena en este hilo (navegadores sin OffscreenCanvas en worker).
    const enHilo = () => {
      if (!hayWebGL2()) return setEstado("sin-3d");
      import("./vela-escena")
        .then(({ crearVela }) => crearVela({ lienzo: c, ...opciones(), alPerder: () => vivo && setEstado("sin-3d"), alRitmo, alUbicar }))
        .then(lista)
        .catch(() => vivo && setEstado("sin-3d"));
    };

    const enWorker = () => {
      let w: Worker;
      try {
        w = new Worker(new URL("./vela-worker.ts", import.meta.url), { type: "module" });
      } catch {
        return enHilo();
      }
      worker = w;
      let transferido = false;
      const mandar = (m: AlWorker, t?: Transferable[]) => (t ? w.postMessage(m, t) : w.postMessage(m));
      const abandonar = () => {
        w.terminate();
        worker = null;
        // Con el lienzo ya transferido no hay vuelta al hilo: queda la foto.
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
          mandar({ tipo: "iniciar", lienzo: off, ...opciones() }, [off]);
        } else if (m.tipo === "no-puedo" || m.tipo === "error") abandonar();
        else if (m.tipo === "perdido") setEstado("sin-3d");
        else if (m.tipo === "ritmo") alRitmo(m.fps, m.paso);
        else if (m.tipo === "ubicar") alUbicar(m.x, m.y);
        else if (m.tipo === "listo")
          lista({
            cera: (hex) => mandar({ tipo: "cera", hex }),
            encender: (si) => mandar({ tipo: "encender", si }),
            mirar: (x, y) => mandar({ tipo: "mirar", x, y }),
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
    const observador = new IntersectionObserver(([e]) => {
      enPantalla = e.isIntersecting;
      if (enPantalla && !cargando && !cancelarEspera) cancelarEspera = enRatoLibre(cargar, 2500);
      visible();
    });
    observador.observe(c);
    const ro = new ResizeObserver(medir);
    ro.observe(c);
    document.addEventListener("visibilitychange", visible);

    // La cámara sigue al puntero en toda la pantalla (paralaje); pasar rápido inclina la llama.
    let pendiente = 0;
    const alMover = (e: PointerEvent) => {
      if (pendiente || !enPantalla) return;
      pendiente = requestAnimationFrame(() => {
        pendiente = 0;
        const b = c.getBoundingClientRect();
        const x = (e.clientX - (b.left + b.width * Number(r.dataset.velaX ?? 0.5))) / (b.width * 0.5) || 0;
        const y = (e.clientY - (b.top + b.height * 0.5)) / (b.height * 0.5) || 0;
        escena.current?.mirar(x, y);
      });
    };
    window.addEventListener("pointermove", alMover, { passive: true });

    return () => {
      vivo = false;
      cancelarEspera?.();
      cancelAnimationFrame(pendiente);
      window.removeEventListener("pointermove", alMover);
      document.removeEventListener("visibilitychange", visible);
      ro.disconnect();
      observador.disconnect();
      escena.current?.soltar();
      escena.current = null;
      worker?.terminate();
    };
    // La escena se crea una vez: el color y el encendido se le pasan por sus métodos, no se rearma.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    escena.current?.cera(tinteDeAroma(aroma));
  }, [aroma]);
  useEffect(() => {
    escena.current?.encender(encendida);
  }, [encendida]);

  const alternar = () => setEncendida((v) => !v);

  return (
    <div
      ref={raiz}
      className="shv"
      data-escena-vela=""
      data-estado={estado}
      data-encuadre={encuadre}
      data-encendida={encendida ? "si" : "no"}
    >
      <style>{ESTILOS}</style>
      {estado !== "sin-3d" && (
        <canvas ref={lienzo} className="shv-lienzo" aria-hidden="true" onClick={alternar} title={textoDelBoton(encendida)} />
      )}
      {estado === "listo" && (
        <div className="shv-mandos">
          <button type="button" className="shv-boton" data-escena-vela-boton="" aria-pressed={!encendida} onClick={alternar}>
            <span className="shv-boton-llama" aria-hidden="true" />
            {textoDelBoton(encendida)}
          </button>
          {aromas.length > 0 && (
            <span className="shv-aromas-rotulo" aria-hidden="true">
              Aroma <small>· color ilustrativo</small>
            </span>
          )}
          {aromas.length > 0 && (
            <div className="shv-aromas" role="group" aria-label="Aroma de la vela. El color de la cera es ilustrativo.">
              {aromas.map((a) => (
                <button
                  key={a}
                  type="button"
                  className="shv-aroma"
                  data-aroma={a}
                  aria-pressed={aroma === a}
                  onClick={() => setAroma((actual) => (actual === a ? null : a))}
                >
                  <span className="shv-aroma-punto" style={{ background: tinteDeAroma(a) }} aria-hidden="true" />
                  {a}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <span className="shv-aviso" aria-live="polite">
        {estado === "listo" ? avisoDelEstado(encendida) : ""}
      </span>
    </div>
  );
}

// Piel de la escena y sus mandos. Viaja en ESTE chunk (asíncrono, sólo Shine), no en el HTML ni en
// el JS compartido de /tienda. Colores de la marca (manual Shine 2026): crema #fdf8f2, burdeos #671128.
const ESTILOS = `
.shv{position:absolute;inset:0}
.shv-lienzo{position:absolute;inset:0;display:block;width:100%;height:100%;touch-action:pan-y;cursor:pointer;opacity:0;transition:opacity 1.2s ease .1s}
.shv[data-estado="listo"] .shv-lienzo{opacity:1}
.shv-mandos{position:absolute;z-index:6;left:12px;right:12px;bottom:12px;display:flex;align-items:center;gap:8px;min-width:0}
.shv-boton{flex:none;display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:0 16px 0 12px;border-radius:999px;border:1px solid rgba(253,248,242,.38);background:rgba(36,20,14,.8);color:#fdf8f2;font:600 13px/1 var(--font-kumbh),system-ui,sans-serif;letter-spacing:.02em;cursor:pointer;-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}
.shv-boton:hover{background:rgba(103,17,40,.78)}
.shv-boton:focus-visible,.shv-aroma:focus-visible{outline:2px solid #fdf8f2;outline-offset:2px}
.shv-boton-llama{width:10px;height:16px;border-radius:50% 50% 50% 50%/62% 62% 38% 38%;background:radial-gradient(60% 70% at 50% 70%,#fff6d8,#ffb347 55%,#e8661a);box-shadow:0 0 10px 2px rgba(255,170,70,.55);transition:opacity .3s}
.shv[data-encendida="no"] .shv-boton-llama{background:#3a2a22;box-shadow:none;border:1px solid rgba(253,248,242,.5)}
.shv-aromas{display:flex;align-items:center;gap:6px;min-width:0;overflow-x:auto;scrollbar-width:none;-webkit-mask-image:linear-gradient(90deg,#000 88%,transparent);mask-image:linear-gradient(90deg,#000 88%,transparent);padding-right:24px}
.shv-aromas::-webkit-scrollbar{display:none}
.shv-aromas-rotulo{flex:none;color:#fdf8f2;font:600 11px/1.2 var(--font-kumbh),system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;text-shadow:0 1px 8px rgba(0,0,0,.6);padding:0 4px}
.shv-aromas-rotulo small{font-weight:500;letter-spacing:.04em;text-transform:none;opacity:.85}
.shv-aroma{flex:none;display:inline-flex;align-items:center;gap:7px;min-height:44px;padding:0 14px;border-radius:999px;border:1px solid rgba(253,248,242,.34);background:rgba(36,20,14,.78);color:#fdf8f2;font:500 13px/1 var(--font-kumbh),system-ui,sans-serif;white-space:nowrap;cursor:pointer;-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}
.shv-aroma[aria-pressed="true"]{background:#fdf8f2;color:#671128;border-color:#fdf8f2}
.shv-aroma-punto{width:12px;height:12px;border-radius:50%;box-shadow:inset 0 0 0 1px rgba(0,0,0,.18)}
.shv-aviso{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
/* Vidriera de siempre: el velo crema de la foto no tapa el toque; en PC los mandos van a la derecha
   (la izquierda es el velo), en el celular esquivan el sello y el texto que sube sobre la foto. */
.shine .sh-hero-veil{pointer-events:none}
/* Mientras la vela se arma, el sello (una vuelta cada 30 s) se queda quieto: su animación obliga a
   recomponer la pantalla en cada cuadro y le quita CPU al worker (medido sin GPU: la escena tardaba
   7,7 a 8,8 s en estar lista con el sello girando y 2,2 s con el sello quieto). */
.shine:has(.shv[data-estado="cargando"]) .sh-seal{animation-play-state:paused}
.shv[data-encuadre="columna"] .shv-mandos{left:auto;right:20px;bottom:20px;max-width:calc(100% - 140px)}
/* Celular: dos filas — el botón con el rótulo, y abajo los aromas a todo el ancho (se deslizan). */
@media(max-width:900px){
  .shv[data-encuadre="columna"] .shv-mandos{left:12px;right:12px;bottom:calc(6vh + 8px);max-width:none;flex-wrap:wrap;row-gap:6px}
  .shv[data-encuadre="columna"] .shv-aromas{flex-basis:100%}
}
@media(max-width:719px){
  .shv[data-encuadre="sangre"] .shv-mandos{flex-wrap:wrap;row-gap:6px}
  .shv[data-encuadre="sangre"] .shv-aromas{flex-basis:100%}
}
/* Portada a todo el ancho: en PC la etiqueta va a la izquierda; los mandos, abajo a la derecha. */
@media(min-width:720px){.shv[data-encuadre="sangre"] .shv-mandos{left:auto;right:max(16px,3vw);bottom:18px;max-width:min(58%,720px)}}
`;
