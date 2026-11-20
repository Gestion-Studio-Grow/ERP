import Link from "next/link";
import { cn } from "@/components/ui";
import { requireApp } from "@/lib/require-app";
import { exigirVer } from "@/lib/proyectos/gestion.server";
import { fechaCorta } from "@/lib/proyectos/core";
import { aPagarPorComprobante, ordenesDelNegocio, siHayM1 } from "@/lib/proyectos/comprobantes.server";
import { ESTADO_ORDEN_LABEL, numeroDeOrden } from "@/lib/proyectos/orden-pago-core";
import { tarjeta } from "../../_vista";
import { permisosDeCompras, NavCompras, plata, SinM1, SinPlata } from "../_compras";

export const dynamic = "force-dynamic";
export const metadata = { title: "Órdenes de pago" };

// O33 · a pagar por comprobante (agrupado por proveedor) y las órdenes de pago del negocio, con número correlativo.
export default async function Ordenes() {
  await requireApp("gestion-proveedores");
  const { a, vePlata } = await permisosDeCompras(await exigirVer("proveedores"));
  const [aPagar, ordenes] = vePlata ? await Promise.all([siHayM1(() => aPagarPorComprobante(a.tenantId)), siHayM1(() => ordenesDelNegocio(a.tenantId))]) : [null, null];
  const total = (aPagar ?? []).reduce((s, g) => s + g.porPagar, 0);

  return (
    <main className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-5">
      <NavCompras actual="/admin/proyectos/proveedores/ordenes" />
      <header>
        <h1 className="text-2xl font-bold text-strong">Órdenes de pago</h1>
        <p className="text-sm text-muted">Una orden paga a un proveedor uno o más comprobantes. La aprueba y la paga alguien que no los cargó.</p>
      </header>
      {!vePlata ? (
        <SinPlata />
      ) : aPagar === null || ordenes === null ? (
        <SinM1 />
      ) : (
        <>
          <section aria-labelledby="a-pagar" className={tarjeta}>
            <h2 id="a-pagar" className="font-semibold text-strong">A pagar por comprobantes</h2>
            <p className="mb-3 text-2xl font-bold text-strong">{plata(total)}</p>
            {aPagar.length === 0 ? (
              <p className="text-sm text-muted">No hay comprobantes con saldo.</p>
            ) : (
              <ul className="grid gap-3">
                {aPagar.map((g) => (
                  <li key={g.supplierId} className="grid gap-1 border-t border-line pt-2 text-sm">
                    <p className="flex flex-wrap justify-between gap-2">
                      <strong className="text-strong">{g.nombre}</strong>
                      <span>Falta pagar {plata(g.porPagar)}{g.saldo !== g.porPagar && <span className="text-muted"> · sin orden {plata(g.saldo)}</span>}</span>
                    </p>
                    <ul className="grid gap-1 pl-3">
                      {g.comprobantes.map((c) => (
                        <li key={c.id} className="flex flex-wrap justify-between gap-2">
                          <Link href={`/admin/proyectos/proveedores/comprobantes/${c.id}`} className="underline underline-offset-2">{c.tipo} {c.numero} · {fechaCorta(c.fecha)}</Link>
                          <span className="text-muted">{plata(c.porPagar)}</span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-muted">Para hacer una orden, entrá al comprobante y elegí cuánto pagar.</p>
          </section>

          <section aria-labelledby="ordenes" className={tarjeta}>
            <h2 id="ordenes" className="mb-2 font-semibold text-strong">Órdenes</h2>
            {ordenes.length === 0 ? (
              <p className="text-sm text-muted">Todavía no hay órdenes de pago.</p>
            ) : (
              <ul className="grid gap-1 text-sm">
                {ordenes.map((o) => (
                  <li key={o.id} className={cn("flex flex-wrap items-center justify-between gap-2 border-t border-line py-2", o.estado === "ANULADA" && "text-muted")}>
                    <span className="min-w-0">
                      <Link href={`/admin/proyectos/proveedores/ordenes/${o.id}`} className="font-medium text-strong underline underline-offset-2">{numeroDeOrden(o.numero)}</Link> · {o.supplier.name}
                      <span className="block text-xs text-muted">Hizo {o.creadaNombre}{o.aprobadaNombre ? ` · aprobó y pagó ${o.aprobadaNombre}` : ""}</span>
                    </span>
                    <span>{plata(o.total)} · <span className={cn(o.estado === "PENDIENTE" && "font-semibold text-strong")}>{ESTADO_ORDEN_LABEL[o.estado]}</span></span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  );
}
