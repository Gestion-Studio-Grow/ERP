// MARCA DE AGUA DE GSG: el mosaico de isotipos chicos como detalle del fondo (lib/gsg/marca-de-agua.ts).
// Sólo en pantallas de GSG o de sus productos (siempre con el isotipo de GSG, también en un producto);
// nunca en las de un negocio cliente ni en comprobantes.
//
// Capa decorativa: `aria-hidden`, sin eventos, no se imprime, detrás del contenido (el padre lleva
// `isolate` para que quede encima de su fondo). El color es `currentColor`: por defecto `text-strong`,
// que ya cambia con el tema; la opacidad por tema (4 % claro, 6 % oscuro) vive en globals.css
// (`.gsg-marca-de-agua`). El contraste del texto no cambia: la capa está debajo.
import type { CSSProperties } from "react";
import { CELDA_MOSAICO, urlAzulejoMosaico } from "@/lib/gsg/marca-de-agua";

export function MarcaDeAgua({
  className = "text-strong",
}: {
  /** El color (una clase de token). */
  className?: string;
}) {
  const url = urlAzulejoMosaico();
  const estilo: CSSProperties = {
    backgroundColor: "currentColor",
    maskImage: url,
    WebkitMaskImage: url,
    maskSize: `${CELDA_MOSAICO}px ${CELDA_MOSAICO}px`,
    WebkitMaskSize: `${CELDA_MOSAICO}px ${CELDA_MOSAICO}px`,
    maskRepeat: "repeat",
    WebkitMaskRepeat: "repeat",
  };
  return (
    <div
      aria-hidden
      data-marca-de-agua=""
      className={`gsg-marca-de-agua pointer-events-none fixed inset-0 -z-10 print:hidden ${className}`}
      style={estilo}
    />
  );
}
