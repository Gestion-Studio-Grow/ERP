"use client";

// «Guardá "Clases con Matías" en tu inicio» (A·E23, M-111). En Android/Chrome usa el aviso de
// instalación del navegador (`beforeinstallprompt`) con el manifiesto del ALUMNO
// (/mis-clases/app.webmanifest: abre en /mis-clases). En iPhone no existe ese aviso: se muestran los
// dos pasos de Safari, con el dibujo del botón «Compartir». Si ya está instalada, o el navegador no
// sabe instalar, no se muestra nada (nunca un botón que no hace nada). Va al final de la pantalla:
// aparecer después de cargar no corre nada de lugar (CLS 0).

import { useEffect, useState } from "react";
import { botonBorde, caja } from "@/app/clases/_estilos";
import { esIosSinInstalar } from "./puro";

type AvisoInstalar = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export function Instalar({ nombreApp }: { nombreApp: string }) {
  const [aviso, setAviso] = useState<AvisoInstalar | null>(null);
  const [ios, setIos] = useState(false);
  const [pasos, setPasos] = useState(false);
  const [hecho, setHecho] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) return;
    // Se decide después de montar (el servidor no sabe qué teléfono es): no hay desajuste de hidratación.
    const t = window.setTimeout(() => setIos(esIosSinInstalar(navigator.userAgent, standalone)), 0);
    const alAvisar = (e: Event) => {
      e.preventDefault();
      setAviso(e as AvisoInstalar);
    };
    const alInstalar = () => setHecho(true);
    window.addEventListener("beforeinstallprompt", alAvisar);
    window.addEventListener("appinstalled", alInstalar);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("beforeinstallprompt", alAvisar);
      window.removeEventListener("appinstalled", alInstalar);
    };
  }, []);

  if (hecho) {
    return (
      <p role="status" className="text-center text-base text-[var(--padel-suave)]">
        Listo: «{nombreApp}» quedó en tu inicio.
      </p>
    );
  }
  if (aviso) {
    return (
      <button
        type="button"
        className={`${botonBorde} w-full`}
        data-qa="instalar"
        onClick={async () => {
          await aviso.prompt();
          const r = await aviso.userChoice.catch(() => ({ outcome: "dismissed" }));
          if (r.outcome === "accepted") setHecho(true);
          setAviso(null);
        }}
      >
        <span aria-hidden>📲</span> Guardá «{nombreApp}» en tu inicio
      </button>
    );
  }
  if (!ios) return null;
  return (
    <section className={caja} aria-label="Guardar en el inicio" data-qa="instalar-ios">
      <button type="button" className={`${botonBorde} w-full`} aria-expanded={pasos} onClick={() => setPasos((v) => !v)}>
        <span aria-hidden>📲</span> Guardá «{nombreApp}» en tu inicio
      </button>
      {pasos && (
        <ol className="mt-3 grid gap-3 text-base">
          <li className="flex items-center gap-3">
            <span aria-hidden className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--padel-papel)] text-[var(--padel-cancha)]">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3v12" />
                <path d="M8 7l4-4 4 4" />
                <path d="M6 11v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-8" />
              </svg>
            </span>
            <span>
              1 · Tocá <strong>Compartir</strong> (el cuadrado con la flecha, abajo en Safari).
            </span>
          </li>
          <li className="flex items-center gap-3">
            <span aria-hidden className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--padel-papel)] text-xl font-bold text-[var(--padel-cancha)]">
              +
            </span>
            <span>
              2 · Elegí <strong>Agregar a inicio</strong> y tocá <strong>Agregar</strong>.
            </span>
          </li>
        </ol>
      )}
    </section>
  );
}
