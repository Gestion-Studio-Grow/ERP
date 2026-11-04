"use client";

// Una placa dibujada en <canvas> con el motor puro (`dibujarPlaca`). El lienzo es de 1080 px de ancho y se muestra
// achicado por CSS (w-full), así la descarga sale en tamaño real sin volver a dibujar.
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { dibujarPlaca, FORMATOS, type MarcaDeLaPlaca, type PiezaADibujar } from "@/lib/contenido";

export interface PlacaCanvasRef {
  descargar(nombre: string): void;
}

export const PlacaCanvas = forwardRef<PlacaCanvasRef, { pieza: PiezaADibujar; marca: MarcaDeLaPlaca; etiqueta: string; onRecorte?: (r: boolean) => void }>(
  function PlacaCanvas({ pieza, marca, etiqueta, onRecorte }, ref) {
    const lienzo = useRef<HTMLCanvasElement>(null);
    const { ancho, alto } = FORMATOS[pieza.formato];

    useEffect(() => {
      const ctx = lienzo.current?.getContext("2d");
      if (!ctx) return;
      const { recortado } = dibujarPlaca(ctx, pieza, marca);
      onRecorte?.(recortado);
    }, [pieza, marca, onRecorte]);

    useImperativeHandle(ref, () => ({
      descargar(nombre) {
        lienzo.current?.toBlob((blob) => {
          if (!blob) return;
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${nombre}.png`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }, "image/png");
      },
    }));

    return (
      <canvas
        ref={lienzo}
        width={ancho}
        height={alto}
        role="img"
        aria-label={etiqueta}
        className="block h-auto w-full rounded-md border border-line bg-surface-sunken"
        style={{ aspectRatio: `${ancho} / ${alto}` }}
      />
    );
  },
);
