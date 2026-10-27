"use client";

// ============================================================================
// TECLAS POR GÓNDOLA — las teclas de producto del mostrador nuevo (Magra tanda 2 · 2A).
// ============================================================================
//
// Pestañas: primero la principal (las que fijó el dueño, o las más vendidas completadas con el
// catálogo) y después UNA por góndola con TODO el catálogo vendible (Vaca, Cerdo, Pollo…): el
// primer día, sin ventas, ya están todos los cortes (MG-042). Cada tecla, 64 px de alto como
// mínimo, con tres líneas: nombre · «$28.600/kg» · «quedan 4,2 kg». Agotada: gris, «agotado».
//
// El dueño (`fijar`) toca «Elegir teclas fijas», marca las que quiere siempre a mano y guarda: la
// lista va a la config `TeclasFijadas` (src/lib/vender) y se ve en la pestaña principal.
//
// Sin animaciones (se usa cien veces por día). Teclado: flechas entre pestañas, Tab a las teclas.

import { useId, useRef, useState } from "react";
import { buttonClasses, cn } from "@/components/ui";
import {
  TECLAS_BOUTIQUE,
  alternarTeclaFijada,
  teclaDeProducto,
  type GondolaDeTeclas,
} from "./reglas-venta";

type ProductoDeTecla = {
  id: string;
  name: string;
  saleUnit: "UNIT" | "WEIGHT";
  price: number | null;
  pricePerKg: number | null;
};

export type FijarTeclas = {
  /** Las fijadas hoy (las de la pestaña principal, si las hay). */
  fijadas: readonly string[];
  /** Guarda la lista; devuelve el error en palabras, o null si quedó guardada. */
  onGuardar: (ids: string[]) => Promise<string | null>;
};

export default function TeclasPorGondola({
  productos,
  stockById,
  principal,
  gondolas,
  onTocar,
  fijar,
}: {
  productos: readonly ProductoDeTecla[];
  stockById: Readonly<Record<string, { stock: number; trackStock: boolean } | undefined>>;
  /** La pestaña de arriba: «Fijadas», «Más vendidos» o «Tus productos». */
  principal: { rotulo: string; ids: readonly string[] };
  gondolas: readonly GondolaDeTeclas[];
  onTocar: (productId: string) => void;
  /** Sólo para el dueño: elegir las teclas fijas. */
  fijar?: FijarTeclas | null;
}) {
  const base = useId();
  const pestanas: GondolaDeTeclas[] = [{ id: "principal", rotulo: principal.rotulo, ids: [...principal.ids] }, ...gondolas];
  const [activa, setActiva] = useState(pestanas[0].id);
  const actual = pestanas.find((p) => p.id === activa) ?? pestanas[0];
  const byId = new Map(productos.map((p) => [p.id, p]));
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Elegir teclas fijas: la lista en edición, y lo que contestó el guardado.
  const [eligiendo, setEligiendo] = useState<string[] | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function moverPestana(paso: number) {
    const i = pestanas.findIndex((p) => p.id === actual.id);
    const sig = pestanas[(i + paso + pestanas.length) % pestanas.length];
    setActiva(sig.id);
    refs.current[sig.id]?.focus();
  }

  async function guardar() {
    if (!fijar || !eligiendo || guardando) return;
    setGuardando(true);
    setError(null);
    const e = await fijar.onGuardar(eligiendo);
    setGuardando(false);
    if (e) {
      setError(e);
      return;
    }
    setEligiendo(null);
    setActiva("principal");
  }

  // En la pestaña principal, mientras se eligen, se ven las que van quedando fijas.
  const ids = eligiendo && actual.id === "principal" ? eligiendo : actual.ids;

  return (
    <section aria-label="Teclas de productos" data-vender="teclas-boutique" className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          role="tablist"
          aria-label="Góndolas"
          data-vender="gondolas"
          className="flex min-w-0 flex-wrap gap-1"
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") {
              e.preventDefault();
              moverPestana(1);
            } else if (e.key === "ArrowLeft") {
              e.preventDefault();
              moverPestana(-1);
            }
          }}
        >
          {pestanas.map((p) => {
            const elegida = p.id === actual.id;
            return (
              <button
                key={p.id}
                ref={(el) => {
                  refs.current[p.id] = el;
                }}
                id={`${base}-tab-${p.id}`}
                type="button"
                role="tab"
                aria-selected={elegida}
                aria-controls={`${base}-panel`}
                tabIndex={elegida ? 0 : -1}
                onClick={() => setActiva(p.id)}
                className={cn("chip-btn h-11 text-sm", elegida && "!border-accent !bg-accent !text-on-accent")}
              >
                {p.rotulo}
              </button>
            );
          })}
        </div>
        {fijar && !eligiendo && (
          <button
            type="button"
            className="h-11 px-2 text-sm text-muted underline"
            onClick={() => {
              setEligiendo([...fijar.fijadas]);
              setError(null);
            }}
          >
            Elegir teclas fijas
          </button>
        )}
      </div>

      {eligiendo && (
        <div role="group" aria-label="Elegir teclas fijas" data-vender="eligiendo-teclas" className="flex flex-wrap items-center gap-2 rounded-lg border border-accent p-2 text-sm">
          <p className="min-w-0 flex-1 text-body">
            Tocá las teclas que querés tener siempre a mano, en cualquier góndola ({eligiendo.length} de {TECLAS_BOUTIQUE}).
          </p>
          <button type="button" className={buttonClasses("solid", "md")} disabled={guardando} onClick={() => void guardar()}>
            {guardando ? "Guardando…" : "Guardar teclas"}
          </button>
          <button type="button" className="h-11 px-2 text-sm text-muted underline" disabled={guardando} onClick={() => setEligiendo(null)}>
            Cancelar
          </button>
          {error && (
            <p role="alert" className="w-full text-sm font-medium text-danger">
              {error}
            </p>
          )}
        </div>
      )}

      <div id={`${base}-panel`} role="tabpanel" aria-labelledby={`${base}-tab-${actual.id}`} className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
        {ids.length === 0 && (
          <p className="col-span-full text-sm text-muted">
            {eligiendo ? "Todavía no elegiste ninguna: andá a una góndola y tocá las que quieras." : "No hay productos en esta góndola."}
          </p>
        )}
        {ids.map((id) => {
          const p = byId.get(id);
          if (!p) return null;
          const t = teclaDeProducto(p, stockById[id]);
          const fija = eligiendo?.includes(id) ?? false;
          return (
            <button
              key={id}
              type="button"
              data-vender="tecla"
              data-agotado={t.agotado ? "" : undefined}
              aria-pressed={eligiendo ? fija : undefined}
              // Agotada: gris y no carga (la de kilo se puede vender igual desde el aviso: MAG-4).
              aria-disabled={!eligiendo && t.agotado ? true : undefined}
              onClick={() => (eligiendo ? setEligiendo((e) => alternarTeclaFijada(e ?? [], id)) : onTocar(id))}
              className={cn(
                "flex min-h-16 min-w-0 flex-col items-start justify-center gap-0.5 rounded-lg border px-3 py-2 text-left",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
                t.agotado && !eligiendo
                  ? "cursor-not-allowed border-line bg-surface-sunken text-muted"
                  : "border-line-strong bg-surface-raised hover:bg-accent-soft",
                fija && "!border-accent ring-2 ring-accent",
              )}
            >
              <span className={cn("w-full truncate text-sm font-semibold uppercase", t.agotado && !eligiendo ? "text-muted" : "text-strong")}>
                {t.nombre}
              </span>
              <span className={cn("text-sm tabular-nums", t.agotado && !eligiendo ? "text-muted" : "text-body")}>{t.precio}</span>
              <span className={cn("text-xs tabular-nums", t.agotado ? "font-semibold text-muted" : "text-muted")}>
                {eligiendo ? (fija ? "Fija" : "Tocá para fijar") : t.agotado ? "agotado" : (t.quedan ?? " ")}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
