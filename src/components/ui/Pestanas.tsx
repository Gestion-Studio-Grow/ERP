import Link from "next/link";
import { cn } from "./cn";

// ============================================================================
// PESTAÑAS — las apps de un espacio (cabecera) y las vistas de una app.
// ============================================================================
//
// Una fila de 44 px con la raya de abajo; la activa con la raya del acento de 2 px y peso 600.
// Son ENLACES (cada vista tiene su URL, así se comparte y se vuelve con «Atrás») con
// `aria-current="page"` en la actual: no hay estado escondido en el navegador. Si no entran,
// la fila se desplaza de costado (sin barra) y nunca empuja el ancho de la pantalla.
//
// Sirve en servidor (la página sabe cuál es la actual) y en cliente (el armazón).

export type Pestana = {
  href: string;
  etiqueta: React.ReactNode;
  /** ¿Es la vista en la que está parada? */
  actual?: boolean;
  /** Un número al lado («Abiertos 10»), en cifras tabulares. */
  conteo?: number;
};

export function Pestanas({
  pestanas,
  etiqueta,
  conRaya = false,
  className,
}: {
  pestanas: readonly Pestana[];
  /** Qué agrupan, para el lector de pantalla («Apps de Caja», «Vistas de Clientes»). */
  etiqueta: string;
  /** Con la raya de abajo de toda la fila (dentro de una página; en la cabecera ya hay una). */
  conRaya?: boolean;
  className?: string;
}) {
  return (
    <nav data-ui="pestanas" data-con-raya={conRaya || undefined} aria-label={etiqueta} className={cn("flex overflow-x-auto", className)}>
      {pestanas.map((p) => (
        <Link key={p.href} href={p.href} aria-current={p.actual ? "page" : undefined} className="inline-flex min-h-11 items-center gap-1.5 px-3 text-sm">
          {p.etiqueta}
          {p.conteo !== undefined && (
            <span data-parte="conteo" className="tabular-nums text-muted">
              {p.conteo}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}
