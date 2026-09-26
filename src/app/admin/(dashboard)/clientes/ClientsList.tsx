// LA LISTA DE CLIENTES DE SIEMPRE (negocios sin «Trabaja por apps» ni diseño nuevo, como CH).
//
// Las mismas tarjetas de siempre (nombre, teléfono, cantidad de turnos), pero ya no viajan todas
// las fichas al navegador: la búsqueda y la página se resuelven en la base
// (lib/clientes/lista-fichas.server.ts) y acá llegan las 50 de la página. La búsqueda viaja en la
// URL (?q=, y la página en ?cursor=, el mismo nombre que la lista del diseño nuevo).
// Componente de servidor: sin estado en el navegador.

import Link from "next/link";
import { Button } from "@/components/ui";
import { FICHAS_POR_PAGINA, type PaginaDeFichas } from "@/lib/clientes/lista-fichas.server";
import PasoVacio from "../turnos/PasoVacio";
import type { PasoVacio as Paso } from "../turnos/pasos";

const BASE = "/admin/clientes";
const ENLACE = "inline-flex min-h-11 items-center font-medium text-accent-ink underline underline-offset-4";
const miles = (n: number) => n.toLocaleString("es-AR");

function urlDePagina(q: string, pagina: number): string {
  const p = new URLSearchParams();
  if (q) p.set("q", q);
  if (pagina > 1) p.set("cursor", String(pagina));
  const s = p.toString();
  return s ? `${BASE}?${s}` : BASE;
}

export default function ClientsList({ pagina: p, q, vacio }: { pagina: PaginaDeFichas; q: string; vacio?: Paso }) {
  const { filas, total, coinciden, pagina, paginas } = p;

  if (total === 0) {
    return vacio ? (
      <PasoVacio paso={vacio} />
    ) : (
      <p className="text-sm text-muted">Todavía no hay clientes. Se cargan automáticamente cuando reservan un turno.</p>
    );
  }

  return (
    <>
      <form method="get" action={BASE} role="search" aria-label="Buscar cliente por nombre o teléfono" className="mb-4 flex flex-wrap items-center gap-2">
        <label className="min-w-0 flex-1 basis-60">
          <span className="sr-only">Buscar cliente por nombre o teléfono</span>
          <input
            type="search"
            name="q"
            defaultValue={q}
            maxLength={80}
            placeholder="Buscar por nombre o teléfono…"
            className="min-h-11 w-full rounded-md border border-line bg-surface px-3 text-base text-strong sm:text-sm"
          />
        </label>
        <Button type="submit">Buscar</Button>
        {q && (
          <Link href={BASE} className={ENLACE}>
            Ver todos
          </Link>
        )}
      </form>

      {q && coinciden > 0 && (
        <p className="mb-2 text-sm text-muted">
          {miles(coinciden)} {coinciden === 1 ? "cliente coincide" : "clientes coinciden"} con «{q}».
        </p>
      )}

      <div className="space-y-2">
        {filas.map((c) => (
          <Link
            key={c.id}
            href={`/admin/clientes/${c.id}`}
            className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-line bg-surface-raised px-4 py-3 transition-colors hover:border-line-strong"
          >
            <div className="min-w-0">
              <p className="truncate font-medium text-strong">{c.name}</p>
              <p className="text-sm text-muted">{c.phone}</p>
            </div>
            <span className="shrink-0 text-sm text-muted">
              {c.actividad} {p.rubro === "mostrador" ? (c.actividad === 1 ? "compra" : "compras") : c.actividad === 1 ? "turno" : "turnos"}
            </span>
          </Link>
        ))}
        {filas.length === 0 && (
          <p className="text-sm text-muted">
            No encontramos clientes con «{q}». Probá con parte del nombre o con el teléfono de corrido.{" "}
            <Link href={BASE} className={ENLACE}>
              Ver todos
            </Link>
          </p>
        )}
      </div>

      {paginas > 1 && (
        <nav aria-label="Páginas de clientes" className="mt-3 flex items-center justify-between gap-2 text-sm">
          {pagina > 1 ? (
            <Link href={urlDePagina(q, pagina - 1)} className={ENLACE} rel="prev">
              ← Anteriores
            </Link>
          ) : (
            <span />
          )}
          <span className="tabular-nums text-muted">
            {miles((pagina - 1) * FICHAS_POR_PAGINA + 1)}–{miles(Math.min(pagina * FICHAS_POR_PAGINA, coinciden))} de {miles(coinciden)}
          </span>
          {pagina < paginas ? (
            <Link href={urlDePagina(q, pagina + 1)} className={ENLACE} rel="next">
              Siguientes →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </>
  );
}
