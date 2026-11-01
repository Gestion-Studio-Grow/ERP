import Link from "next/link";
import { KpiTile, cn } from "@/components/ui";
import { etapaLabel, fechaCorta, pesos, porcentaje } from "@/lib/proyectos/core";
import { claveMes } from "@/lib/proyectos/gestion-core";
import { alertasDeDireccion, etiquetaMes } from "@/lib/proyectos/empresa-core";
import { cashflowDeEmpresa, proyectosConNumeros, resumenDeDireccion } from "@/lib/proyectos/empresa.server";
import { BarrasPorMes, SaldoPorMes } from "../administracion/_graficos";
import { tarjeta } from "../_vista";

export async function TabTablero({ tenantId }: { tenantId: string }) {
  const [proyectos, caja] = await Promise.all([proyectosConNumeros(tenantId), cashflowDeEmpresa(tenantId)]);
  const r = resumenDeDireccion(proyectos);
  const alertas = alertasDeDireccion({ proyectos: proyectos.filter((p) => !p.perdidoEl), proyeccion: caja.proyeccion });
  const meses = Array.from({ length: 12 }, (_, i) => {
    const mes = claveMes(new Date(r.anio, i, 1));
    const venta = r.delAnio.filter((p) => claveMes(p.fechaEvento ?? p.createdAt) === mes).reduce((s, p) => s + p.venta, 0);
    return { etiqueta: etiquetaMes(mes, true), valores: [venta] };
  });
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <KpiTile label="Caja hoy" value={pesos(caja.cajaHoy)} />
        <KpiTile label={`Facturación ${r.anio}`} value={pesos(r.facturacion)} sub="venta confirmada, sin IVA" />
        <KpiTile label="Margen acumulado" value={pesos(r.margen)} sub={porcentaje(r.margenPct)} />
        <KpiTile label="Eventos activos" value={r.activos} />
        <KpiTile label="Pipeline abierto" value={pesos(r.pipeline)} />
      </div>

      <section className={tarjeta}>
        <h2 className="mb-2 font-semibold text-strong">Alertas</h2>
        {alertas.length === 0 ? (
          <p className="text-sm text-muted">Sin alertas por ahora.</p>
        ) : (
          <ul className="grid gap-1">
            {alertas.map((al) => (
              <li key={al.clave}><Link href={al.enlace} className="flex min-h-11 items-center text-sm text-danger underline">{al.texto}</Link></li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={tarjeta}><BarrasPorMes titulo={`Venta confirmada por mes, ${r.anio}`} series={[{ nombre: "Venta", clase: "bg-accent" }]} filas={meses} /></section>
        <section className={tarjeta}><SaldoPorMes titulo="Saldo de caja proyectado" filas={caja.proyeccion.map((m) => ({ etiqueta: etiquetaMes(m.mes, true), saldo: m.saldo }))} /></section>
      </div>

      <section className={cn(tarjeta, "overflow-x-auto")}>
        <h2 className="mb-2 font-semibold text-strong">Próximos eventos</h2>
        {r.proximos.length === 0 ? (
          <p className="text-sm text-muted">No hay eventos con fecha por delante.</p>
        ) : (
          <table className="w-full min-w-[560px] text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="py-1 pr-3 font-medium">Fecha</th>
                <th className="pr-3 font-medium">Evento</th>
                <th className="pr-3 font-medium">Etapa</th>
                <th className="text-right font-medium">Venta</th>
              </tr>
            </thead>
            <tbody>
              {r.proximos.map((p) => (
                <tr key={p.id} className="border-t border-line">
                  <td className="whitespace-nowrap py-1.5 pr-3">{fechaCorta(p.fechaEvento)}</td>
                  <td className="pr-3"><Link href={`/admin/proyectos/${p.id}`} className="underline">{p.codigo} {p.nombre}</Link><span className="block text-xs text-muted">{p.cliente}</span></td>
                  <td className="pr-3">{etapaLabel(p.etapa, p.servicio)}</td>
                  <td className="whitespace-nowrap text-right tabular-nums">{p.venta > 0 ? pesos(p.venta) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
