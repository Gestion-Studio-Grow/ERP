// ============================================================================
// LA CAJA UNIFICADA — «Hoy · Cerrar el día · Libro» (reingeniería CH, Tanda 3 · §2.7).
// ============================================================================
//
// Las tres pantallas de la plata de un negocio de turnos, como pestañas de UNA caja: lo que entró hoy,
// el cierre en tres pasos y el libro del mes. Enlaces comunes (funcionan con el teclado y sin JS); la
// actual lleva `aria-current="page"`. Se muestra en los negocios de servicios (CH); el mostrador sigue
// con su caja de siempre (turno de cajero), sin cambios.

import Link from "next/link";
import { cn } from "@/components/ui/cn";

export type PestanaDeCaja = "hoy" | "cierre" | "libro";

const PESTANAS: readonly { id: PestanaDeCaja; href: string; etiqueta: string }[] = [
  { id: "hoy", href: "/admin/caja", etiqueta: "Hoy" },
  { id: "cierre", href: "/admin/caja/cierre", etiqueta: "Cerrar el día" },
  { id: "libro", href: "/admin/caja/libro", etiqueta: "Libro" },
];

export default function PestanasDeCaja({ actual, className }: { actual: PestanaDeCaja; className?: string }) {
  return (
    <nav aria-label="Caja" className={cn("mb-5 flex gap-4 border-b border-line text-sm", className)}>
      {PESTANAS.map((p) =>
        p.id === actual ? (
          <span key={p.id} aria-current="page" className="inline-flex min-h-11 items-end border-b-2 border-accent px-1 pb-2 font-medium text-strong">
            {p.etiqueta}
          </span>
        ) : (
          <Link key={p.id} href={p.href} className="inline-flex min-h-11 items-end px-1 pb-2 text-muted hover:text-strong">
            {p.etiqueta}
          </Link>
        ),
      )}
    </nav>
  );
}
