"use client";

// LOS LINKS DE COBRO GENERADOS — la lista de la pestaña «Cobrar con link», la MISMA en los dos
// diseños (debajo del formulario de cada uno). Paginada en el servidor (links.server.ts): acá
// llega sólo la página que se mira, con los totales por estado de todo el filtro. La búsqueda y
// el estado viajan en la URL (formulario GET), así que atrás/adelante y compartir el link andan.
// El estado de cada link sale de lo que la base sabe (links-core.ts): el de un pedido, del pedido;
// el de un link con monto a mano, se mira en Mercado Pago.

import Link from "next/link";
import { Tabla } from "@/components/ui/Tabla";
import { Button, Marca, Plata, type TipoMarca } from "@/components/ui";
import { fmtDateTimeAr } from "@/lib/datetime";
import {
  ESTADOS_LINK,
  ETIQUETA_ESTADO_LINK,
  LINKS_POR_PAGINA,
  cantidadDelFiltro,
  urlDeLinks,
  type EstadoLink,
  type FiltrosLinks,
  type PaginaDeLinks,
  type RenglonLink,
} from "@/lib/cobros/links-core";

const CAMPO = "min-h-11 w-full rounded-md border border-line bg-surface px-3 text-base text-strong sm:text-sm";
const ENLACE = "inline-flex min-h-11 items-center font-medium text-accent-ink underline underline-offset-4";

const MARCA: Record<EstadoLink, TipoMarca> = { pagado: "hecho", pendiente: "pendiente", anulado: "anulado", "sin-seguimiento": "info" };

const miles = (n: number) => n.toLocaleString("es-AR");

/** El estado del link y, si todavía no lo pagaron, cómo abrirlo. */
function EstadoDelLink({ f }: { f: RenglonLink }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-3">
      <Marca tipo={MARCA[f.estado]}>{ETIQUETA_ESTADO_LINK[f.estado]}</Marca>
      {f.estado === "pendiente" && f.url && (
        <a href={f.url} target="_blank" rel="noopener noreferrer" className={ENLACE}>
          Abrir el link
        </a>
      )}
    </span>
  );
}

export default function LinksDeCobro({ pagina: p, filtros, fallo }: { pagina: PaginaDeLinks | null; filtros: FiltrosLinks; fallo?: string | null }) {
  if (!p) {
    return (
      <section aria-labelledby="links-titulo" className="mt-8">
        <h2 id="links-titulo" className="mb-2 text-lg font-semibold text-strong">Links generados</h2>
        <p className="text-sm text-danger">{fallo ?? "No pudimos leer los links ahora. Recargá la página en un rato."}</p>
      </section>
    );
  }
  const { renglones, totales, pagina, paginas } = p;
  const cantidad = cantidadDelFiltro(totales, filtros.estado);
  const filtrado = Boolean(filtros.q || filtros.estado);

  const vacio =
    totales.cantidad === 0 && !filtros.q ? (
      <p className="text-sm text-muted">
        Todavía no generaste links de cobro. Creá el primero arriba con el concepto y el monto, o desde un pedido con el botón «Link de pago».
      </p>
    ) : (
      <p className="text-sm text-muted">
        No hay links {filtros.q ? <>que coincidan con «{filtros.q}»</> : null}
        {filtros.estado ? <> en «{ETIQUETA_ESTADO_LINK[filtros.estado]}»</> : null}.{" "}
        <Link href={urlDeLinks(filtros, { q: "", estado: null })} className={ENLACE}>
          Ver todos los links
        </Link>
      </p>
    );

  return (
    <section aria-labelledby="links-titulo" className="mt-8">
      <h2 id="links-titulo" className="text-lg font-semibold text-strong">Links generados</h2>
      <p className="mb-3 text-sm text-muted">
        El estado de un link de pedido sale del pedido. Los links con monto a mano se siguen en tu cuenta de Mercado Pago.
      </p>

      <nav aria-label="Links por estado" className="mb-3 flex flex-wrap gap-x-4 text-sm">
        <Link href={urlDeLinks(filtros, { estado: null })} aria-current={filtros.estado === null ? "page" : undefined} className={`${ENLACE} ${filtros.estado === null ? "no-underline" : ""}`}>
          Todos · {miles(totales.cantidad)}
        </Link>
        {ESTADOS_LINK.filter((e) => totales.porEstado[e].cantidad > 0 || filtros.estado === e).map((e) => (
          <Link key={e} href={urlDeLinks(filtros, { estado: e })} aria-current={filtros.estado === e ? "page" : undefined} className={`${ENLACE} gap-1 ${filtros.estado === e ? "no-underline" : ""}`}>
            <Marca tipo={MARCA[e]}>{ETIQUETA_ESTADO_LINK[e]}</Marca> · {miles(totales.porEstado[e].cantidad)}
            {totales.porEstado[e].importe > 0 && (
              <span className="text-muted">
                {" "}(<Plata valor={totales.porEstado[e].importe} />)
              </span>
            )}
          </Link>
        ))}
      </nav>

      <form method="get" action="/admin/facturacion" role="search" aria-label="Buscar links de cobro" className="mb-4 flex flex-wrap items-center gap-2">
        <input type="hidden" name="vista" value="cobrar-con-link" />
        {filtros.estado && <input type="hidden" name="estado" value={filtros.estado} />}
        <label className="min-w-0 flex-1 basis-60">
          <span className="sr-only">Buscar</span>
          <input type="search" name="q" defaultValue={filtros.q} maxLength={80} placeholder="Buscar por concepto, cliente, n.º de pedido o importe" className={CAMPO} />
        </label>
        <Button type="submit">Buscar</Button>
        {filtrado && (
          <Link href={urlDeLinks(filtros, { q: "", estado: null })} className={ENLACE}>
            Limpiar
          </Link>
        )}
      </form>

      <Tabla<RenglonLink>
        titulo="Links de cobro generados"
        filas={renglones}
        clave={(f) => f.id}
        vacio={vacio}
        cuenta={paginas > 1 ? `Página ${miles(pagina)} de ${miles(paginas)}` : undefined}
        columnas={[
          { clave: "creado", titulo: "Generado", movil: "folio", celda: (f) => fmtDateTimeAr(f.creado) },
          {
            clave: "concepto",
            titulo: "Concepto",
            movil: "asunto",
            celda: (f) => (
              <span className="inline-flex flex-wrap items-baseline gap-x-2">
                <span>{f.concepto || "Sin concepto"}</span>
                {f.referencia && <span className="text-muted">Ref.: {f.referencia}</span>}
              </span>
            ),
          },
          {
            clave: "cliente",
            titulo: "Cliente",
            movil: "detalle",
            // En el celular la tabla muestra una sola línea de detalle: el estado va al lado del
            // cliente (la columna «Estado» se esconde ahí).
            celda: (f) => (
              <span className="inline-flex flex-wrap items-center gap-x-3">
                {f.cliente ?? <span className="text-muted">—</span>}
                <span className="hidden tabla-movil:inline-flex">
                  <EstadoDelLink f={f} />
                </span>
              </span>
            ),
          },
          { clave: "estado", titulo: "Estado", movil: "detalle", celda: (f) => <EstadoDelLink f={f} /> },
          { clave: "monto", titulo: "Monto", alinear: "derecha", movil: "plata", celda: (f) => (f.monto === null ? "—" : <Plata valor={f.monto} />) },
        ]}
      />

      {paginas > 1 && (
        <nav aria-label="Páginas de links" className="mt-3 flex items-center justify-between gap-2 text-sm">
          {pagina > 1 ? (
            <Link href={urlDeLinks(filtros, { pagina: pagina - 1 })} className={ENLACE} rel="prev">
              ← Más nuevos
            </Link>
          ) : (
            <span />
          )}
          <span className="tabular-nums text-muted">
            {miles((pagina - 1) * LINKS_POR_PAGINA + 1)}–{miles(Math.min(pagina * LINKS_POR_PAGINA, cantidad))} de {miles(cantidad)}
          </span>
          {pagina < paginas ? (
            <Link href={urlDeLinks(filtros, { pagina: pagina + 1 })} className={ENLACE} rel="next">
              Más viejos →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </section>
  );
}
