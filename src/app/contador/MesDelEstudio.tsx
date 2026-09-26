// «El mes»: lo que la contadora tiene pendiente con toda la cartera, de lo más grave a lo menos
// (pendientesDelMes, mes-core.ts). Un bloque por grupo y un renglón por pendiente: el cliente, qué
// pasa con el dato real, qué hacer y quién lo resuelve. La tecla abre la ficha del cliente, donde
// están las acciones. Presentacional (sin "use client"): los datos llegan resueltos de page.tsx.

import Link from "next/link";
import { Bloque, Franja, Marca, Renglon, buttonClasses, fmtNumberAR } from "@/components/ui";
import type { GrupoDelMes, PendienteDelCliente } from "./mes-core";

/** Cuántos renglones se ven de entrada por grupo; el resto, a un toque. */
const VISIBLES = 6;

function Pendiente({ p }: { p: PendienteDelCliente }) {
  return (
    <Renglon
      folio={p.quien === "gsg" ? <Marca tipo="info">Soporte GSG</Marca> : undefined}
      titulo={p.alias}
      detalle={
        <>
          <span className="block">{p.detalle}</span>
          {p.accion && <span className="block text-muted">{p.accion}</span>}
        </>
      }
      tecla={
        <Link
          href={`/contador?cliente=${encodeURIComponent(p.clienteTenantId)}#cartera-cliente`}
          className={buttonClasses("outline", "sm")}
          data-ui="button"
          data-variant="outline"
          data-size="sm"
          aria-label={`Ver la ficha de ${p.alias}`}
        >
          Ver
        </Link>
      }
    />
  );
}

export default function MesDelEstudio({ grupos, mesTexto }: { grupos: GrupoDelMes[]; mesTexto: string }) {
  if (grupos.length === 0) {
    return (
      <section aria-label={`Pendientes de ${mesTexto}`} className="mb-xl">
        <Franja tono="info">
          Nada pendiente en {mesTexto}: todos pueden facturar, los cierres están congelados y los extractos del mes, cargados.
        </Franja>
      </section>
    );
  }
  const total = grupos.reduce((a, g) => a + g.pendientes.length, 0);
  return (
    <section aria-label={`Pendientes de ${mesTexto}`} className="mb-xl grid gap-6">
      <p className="text-[13px] text-muted">
        {fmtNumberAR(total)} {total === 1 ? "cosa pendiente" : "cosas pendientes"} en {mesTexto}, lo más grave primero. Dentro de cada grupo, primero el
        cliente que más factura.
      </p>
      {grupos.map((g) => (
        <Bloque key={g.id} id={`mes-${g.id}`} titulo={g.titulo} cuenta={fmtNumberAR(g.pendientes.length)}>
          {g.pendientes.slice(0, VISIBLES).map((p, i) => (
            <Pendiente key={`${p.clienteTenantId}-${i}`} p={p} />
          ))}
          {g.pendientes.length > VISIBLES && (
            <details>
              <summary className="flex min-h-11 cursor-pointer items-center text-[13px] text-muted">
                Ver {g.pendientes.length - VISIBLES === 1 ? "el otro" : `los otros ${fmtNumberAR(g.pendientes.length - VISIBLES)}`}
              </summary>
              {g.pendientes.slice(VISIBLES).map((p, i) => (
                <Pendiente key={`${p.clienteTenantId}-r${i}`} p={p} />
              ))}
            </details>
          )}
        </Bloque>
      ))}
    </section>
  );
}
