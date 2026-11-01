import Link from "next/link";
import { cn } from "@/components/ui";
import { etapaLabel, pesos, porcentaje, redondear } from "@/lib/proyectos/core";
import { proyectosConNumeros } from "@/lib/proyectos/empresa.server";
import { tarjeta } from "../_vista";

const puntos = (n: number) => `${n > 0 ? "+" : ""}${n.toLocaleString("es-AR", { maximumFractionDigits: 1 })} pts`;

export async function TabEventos({ tenantId, abierto }: { tenantId: string; abierto?: string }) {
  const todos = await proyectosConNumeros(tenantId);
  // Sin venta en la ficha no hay nada que comparar: un lead recién cargado sólo haría ruido.
  const filas = todos.filter((p) => !p.perdidoEl && p.venta > 0);
  const elegido = abierto ? filas.find((p) => p.id === abierto) : undefined;
  return (
    <div className="grid gap-4">
      {elegido && (
        <section className={cn(tarjeta, "overflow-x-auto")}>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-strong">Desvíos de {elegido.codigo} {elegido.nombre}</h2>
            <Link href="/admin/proyectos/direccion?tab=eventos" className="flex min-h-11 items-center text-sm underline">Cerrar</Link>
          </div>
          {elegido.lineas.length === 0 ? (
            <p className="text-sm text-muted">La ficha no tiene ítems.</p>
          ) : (
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th className="py-1 pr-3 font-medium">Ítem o rubro</th>
                  <th className="pr-3 font-medium">Proveedor</th>
                  <th className="pr-3 text-right font-medium">Presupuestado</th>
                  <th className="pr-3 text-right font-medium">Real</th>
                  <th className="text-right font-medium">Desvío</th>
                </tr>
              </thead>
              <tbody>
                {elegido.lineas.map((l) => (
                  <tr key={l.clave} className="border-t border-line">
                    <td className="py-1.5 pr-3">{l.detalle}<span className="block text-xs text-muted">{l.rubro}</span></td>
                    <td className="pr-3">{l.proveedor ?? "—"}</td>
                    <td className="whitespace-nowrap pr-3 text-right tabular-nums">{pesos(l.presupuestado)}</td>
                    <td className="whitespace-nowrap pr-3 text-right tabular-nums">{l.real == null ? <span className="text-muted">sin dato</span> : pesos(l.real)}</td>
                    <td className={cn("whitespace-nowrap text-right tabular-nums", (l.desvio ?? 0) > 0 && "text-danger")}>
                      {l.desvio == null ? "—" : `${l.desvio > 0 ? "+" : ""}${pesos(l.desvio)}${l.desvioPct != null ? ` (${porcentaje(l.desvioPct)})` : ""}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="mt-2 text-sm text-muted">Sale del costo real de cada ítem o de los gastos cargados en el proyecto, sin IVA. Lo que no tiene dato cuenta como presupuestado.</p>
        </section>
      )}

      <section className={cn(tarjeta, "overflow-x-auto")}>
        {filas.length === 0 ? (
          <p className="text-sm text-muted">Todavía no hay eventos con venta cargada en la ficha.</p>
        ) : (
          <table className="w-full min-w-[980px] text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="py-1 pr-3 font-medium">Evento</th>
                <th className="pr-3 font-medium">Etapa</th>
                <th className="pr-3 text-right font-medium">Venta</th>
                <th className="pr-3 text-right font-medium">Margen presup.</th>
                <th className="pr-3 text-right font-medium">Margen real</th>
                <th className="pr-3 text-right font-medium">Desvío</th>
                <th className="pr-3 text-right font-medium">Cobros</th>
                <th className="pr-3 text-right font-medium">Vencido</th>
                <th className="font-medium">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((p) => {
                const desvio = p.margenRealPct == null ? null : redondear(p.margenRealPct - p.margenPct);
                return (
                  <tr key={p.id} className="border-t border-line">
                    <td className="py-1.5 pr-3"><Link href={`/admin/proyectos/${p.id}`} className="underline">{p.codigo} {p.nombre}</Link><span className="block text-xs text-muted">{p.cliente}</span></td>
                    <td className="pr-3">{etapaLabel(p.etapa, p.servicio)}</td>
                    <td className="whitespace-nowrap pr-3 text-right tabular-nums">{pesos(p.venta)}</td>
                    <td className="whitespace-nowrap pr-3 text-right tabular-nums">{porcentaje(p.margenPct)}</td>
                    <td className="whitespace-nowrap pr-3 text-right tabular-nums">{p.margenRealPct == null ? <span className="text-muted">sin dato</span> : porcentaje(p.margenRealPct)}</td>
                    <td className={cn("whitespace-nowrap pr-3 text-right tabular-nums", (desvio ?? 0) < 0 && "text-danger")}>{desvio == null ? "—" : puntos(desvio)}</td>
                    <td className="whitespace-nowrap pr-3 text-right tabular-nums">{porcentaje(p.cobrosPct)}</td>
                    <td className={cn("whitespace-nowrap pr-3 text-right tabular-nums", Math.round(p.vencido) > 0 && "font-medium text-danger")}>{Math.round(p.vencido) > 0 ? pesos(p.vencido) : "—"}</td>
                    <td><Link href={`/admin/proyectos/direccion?tab=eventos&proyecto=${p.id}`} className="flex min-h-11 items-center whitespace-nowrap underline">Ver desvíos</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
      <p className="text-sm text-muted">¿Buscás presupuestos aprobados con IVA y cobros registrados a mano? Están en <Link href="/admin/proyectos/reportes" className="underline">Rentabilidad</Link>.</p>
    </div>
  );
}
