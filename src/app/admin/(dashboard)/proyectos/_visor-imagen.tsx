"use client";

// Visor para ver una imagen en grande: entera o acercada, con flechas para pasar a la siguiente y descarga. Usa <dialog>: el foco queda
// adentro, Escape cierra y el fondo no se mueve.

import { useEffect, useRef, useState } from "react";
import { buttonClasses, cn } from "@/components/ui";

export interface ImagenVisor {
  src: string;
  nombre: string;
}

const extensionDe = (src: string): string => (src.startsWith("data:image/png") ? "png" : src.startsWith("data:image/webp") ? "webp" : "jpg");
const nombreDeArchivo = (n: string): string => n.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "imagen";

export function VisorImagen({ imagenes, indice, alCerrar, alCambiar }: { imagenes: readonly ImagenVisor[]; indice: number; alCerrar: () => void; alCambiar: (i: number) => void }) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [acercada, setAcercada] = useState(false);
  const img = imagenes[indice];
  const hay = imagenes.length > 1;

  useEffect(() => {
    const d = dialogo.current;
    if (d && !d.open) d.showModal();
    return () => {
      if (d?.open) d.close();
    };
  }, []);

  // Al pasar a otra imagen vuelve sin zoom: se ajusta durante el render (patrón de React para estado que
  // depende de una prop), sin un efecto que pinte un cuadro con el zoom viejo.
  const [indiceVisto, setIndiceVisto] = useState(indice);
  if (indiceVisto !== indice) {
    setIndiceVisto(indice);
    setAcercada(false);
  }

  useEffect(() => {
    const alApretar = (e: KeyboardEvent) => {
      if (!hay) return;
      if (e.key === "ArrowRight") alCambiar((indice + 1) % imagenes.length);
      else if (e.key === "ArrowLeft") alCambiar((indice - 1 + imagenes.length) % imagenes.length);
    };
    window.addEventListener("keydown", alApretar);
    return () => window.removeEventListener("keydown", alApretar);
  }, [hay, indice, imagenes.length, alCambiar]);

  if (!img) return null;
  return (
    <dialog
      ref={dialogo}
      aria-label={`Imagen ampliada: ${img.nombre}`}
      onClose={alCerrar}
      onClick={(e) => e.target === dialogo.current && alCerrar()}
      className="m-auto h-[92vh] w-[96vw] max-w-6xl rounded-2xl border border-line bg-surface p-0 text-strong backdrop:bg-black/70"
    >
      <div className="flex h-full flex-col">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line p-3">
          <p className="min-w-0 flex-1 truncate text-sm font-medium">
            {img.nombre}
            {hay ? ` · ${indice + 1} de ${imagenes.length}` : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" aria-pressed={acercada} onClick={() => setAcercada((v) => !v)} className={cn(buttonClasses("outline", "md"), "min-h-11")}>
              {acercada ? "Ver entera" : "Acercar"}
            </button>
            <a href={img.src} download={`${nombreDeArchivo(img.nombre)}.${extensionDe(img.src)}`} className={cn(buttonClasses("outline", "md"), "min-h-11")}>
              Descargar
            </a>
            <button type="button" onClick={alCerrar} className={cn(buttonClasses("solid", "md"), "min-h-11")}>
              Cerrar
            </button>
          </div>
        </header>
        <div className={cn("min-h-0 flex-1 overflow-auto bg-surface-raised p-2", !acercada && "grid place-items-center")}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={img.src}
            alt={img.nombre}
            onClick={() => setAcercada((v) => !v)}
            className={cn("rounded-lg", acercada ? "max-w-none cursor-zoom-out" : "max-h-full max-w-full cursor-zoom-in object-contain")}
            style={acercada ? { width: "220%" } : undefined}
          />
        </div>
        {hay && (
          <footer className="flex items-center justify-between gap-2 border-t border-line p-3">
            <button type="button" onClick={() => alCambiar((indice - 1 + imagenes.length) % imagenes.length)} className={cn(buttonClasses("outline", "md"), "min-h-11")}>
              ← Anterior
            </button>
            <button type="button" onClick={() => alCambiar((indice + 1) % imagenes.length)} className={cn(buttonClasses("outline", "md"), "min-h-11")}>
              Siguiente →
            </button>
          </footer>
        )}
      </div>
    </dialog>
  );
}
