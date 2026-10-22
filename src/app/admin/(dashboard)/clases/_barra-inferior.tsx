"use client";

// LA BARRA DE ABAJO DEL PROFE (matias-DISENO.md §2.1 · M-046): Hoy · Semana · ＋ · Alumnos ·
// Plata, a mano del pulgar. Reemplaza a la tira de chips de arriba (BarraClases).
//
// - Cada lugar es un ícono CON rótulo debajo (no sólo ícono), 64 px de alto y 1/5 del ancho:
//   a 360 px entran los cinco sin desplazar.
// - El de la pantalla actual se marca con color Y con `aria-current="page"` (itemActivo).
// - Hoy lleva el globito rojo de pendientes (lo cuenta el layout con badgePendientes()).
// - El ＋ del medio es un círculo de 56 px que va a Agendar.
// - Su alto entero (con la zona segura del celular) es `--alto-barra-inferior`, que declara el
//   layout del módulo: la cola de avisos y todo lo fijo abajo se apoyan ENCIMA con
//   `bottom-[var(--alto-barra-inferior,0px)]`.
// - En la PC (lg) arranca después de la barra lateral del shell (236 px, AdminShell.tsx).

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn, Icono, type NombreIconoPieza } from "@/components/ui";
import { ITEMS_BARRA, itemActivo, textoBadge, type ItemBarra } from "./_navegacion";

const ICONO: Record<ItemBarra, NombreIconoPieza> = {
  hoy: "casa",
  semana: "calendario",
  agendar: "mas",
  alumnos: "persona",
  plata: "efectivo",
};

const foco = "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus";

export function BarraInferior({ pendientes }: { pendientes: number }) {
  const actual = itemActivo(usePathname());
  const badge = textoBadge(pendientes);

  return (
    <nav
      aria-label="Secciones de clases"
      data-barra-clases
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface-raised pb-[env(safe-area-inset-bottom)] shadow-overlay lg:left-[236px]"
    >
      <ul className="mx-auto flex h-16 max-w-3xl items-stretch">
        {ITEMS_BARRA.map((item) => {
          const activo = actual === item.id;
          if (item.id === "agendar") {
            return (
              <li key={item.id} className="flex min-w-0 flex-1 justify-center">
                <Link
                  href={item.href}
                  aria-current={activo ? "page" : undefined}
                  data-qa="agendar"
                  className={cn("group flex flex-col items-center justify-end gap-0.5 rounded-lg px-1 pb-1.5 text-xs font-semibold text-strong", foco)}
                >
                  {/* El círculo sobresale arriba de la barra: es LA acción, se encuentra sin mirar. */}
                  <span
                    aria-hidden
                    className="-mt-5 grid size-14 place-items-center rounded-full bg-accent text-on-accent shadow-overlay transition-transform duration-[120ms] group-active:translate-y-px motion-reduce:transition-none"
                  >
                    <Icono nombre="mas" className="size-7" />
                  </span>
                  <span>Agendar</span>
                </Link>
              </li>
            );
          }
          return (
            <li key={item.id} className="min-w-0 flex-1">
              <Link
                href={item.href}
                aria-current={activo ? "page" : undefined}
                data-qa={`barra-${item.id}`}
                className={cn(
                  "relative flex h-full flex-col items-center justify-center gap-1 px-1 text-xs leading-tight",
                  foco,
                  activo ? "font-semibold text-accent-ink" : "font-medium text-muted",
                )}
              >
                <span className="relative">
                  <Icono nombre={ICONO[item.id]} className="size-6" />
                  {item.id === "hoy" && badge && (
                    <span
                      aria-hidden
                      data-qa="badge-pendientes"
                      className="absolute -right-3 -top-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-xs font-bold tabular-nums text-surface-raised"
                    >
                      {badge}
                    </span>
                  )}
                </span>
                <span className="max-w-full truncate">{item.rotulo}</span>
                {item.id === "hoy" && badge && <span className="sr-only">{`, ${badge} esperando tu respuesta`}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
