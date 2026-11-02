import { KpiTile, cn } from "@/components/ui";
import { pesos } from "@/lib/proyectos/core";
import { plataEn } from "@/lib/proyectos/gestion-core";
import { etiquetaMes } from "@/lib/proyectos/empresa-core";
import { cashflowDeEmpresa } from "@/lib/proyectos/empresa.server";
import { tarjeta } from "../_vista";
import { BarrasPorMes, SaldoPorMes } from "./_graficos";

export async function TabCashflow({ tenantId }: { tenantId: string }) {
  const d = await cashflowDeEmpresa(tenantId);
  const egresos = (m: (typeof d.proyeccion)[number]) => m.proveedores + m.sueldos + m.fijos + m.impuestos;
  return (
    <div className="grid gap-4">
      {d.sinCambio && <p role="alert" className="rounded-lg border border-line bg-surface-raised p-3 text-sm text-danger">Hay importes en dólares sin tipo de cambio: la proyección no los cuenta hasta que lo cargues.</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiTile label="Caja hoy" value={pesos(d.cajaHoy)} sub={d.cuentas.length === 1 ? "1 cuenta" : `${d.cuentas.length} cuentas`} />
        <KpiTile label="Necesidad de financiamiento" value={pesos(d.necesidad)} sub={d.necesidad > 0 ? "lo más abajo de cero en 6 meses" : "la caja no baja de cero en 6 meses"} />
        <KpiTile label="Pipeline ponderado" value={pesos(d.ponderado)} sub="enviadas al 40 %; no suma al saldo" />
      </div>

      <section className={tarjeta}>
        <h2 className="mb-2 font-semibold text-strong">Caja hoy por cuenta</h2>
        {d.cuentas.length === 0 ? (
          <p className="text-sm text-muted">Todavía no hay cuentas: se cargan en Bancos.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {d.cuentas.map((c) => (
              <li key={c.id} className="rounded-lg border border-line p-3">
                <p className="text-sm text-muted">{c.nombre}</p>
                <p className="font-semibold tabular-nums text-strong">{plataEn(c.saldo, c.moneda)}</p>
                {c.moneda !== "ARS" && <p className="text-xs tabular-nums text-muted">{pesos(c.enPesos)}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={tarjeta}>
          <BarrasPorMes
            titulo="Ingresos contra egresos, por mes"
            series={[{ nombre: "Ingresos", clase: "bg-accent" }, { nombre: "Egresos", clase: "bg-muted" }]}
            filas={d.proyeccion.map((m) => ({ etiqueta: etiquetaMes(m.mes, true), valores: [m.cobros, egresos(m)] }))}
          />
        </section>
        <section className={tarjeta}>
          <SaldoPorMes titulo="Saldo proyectado" filas={d.proyeccion.map((m) => ({ etiqueta: etiquetaMes(m.mes, true), saldo: m.saldo }))} />
        </section>
      </div>

      <section className={cn(tarjeta, "overflow-x-auto")}>
        <h2 className="mb-2 font-semibold text-strong">Mes por mes</h2>
        <table className="w-full min-w-[760px] text-sm">
          <thead className="text-left text-xs text-muted">
            <tr>
              <th className="py-1 pr-3 font-medium">Mes</th>
              {["Cobros", "Proveedores", "Sueldos", "Gastos fijos", "Impuestos", "Neto", "Saldo"].map((t) => <th key={t} className="pr-3 text-right font-medium last:pr-0">{t}</th>)}
            </tr>
          </thead>
          <tbody>
            {d.proyeccion.map((m) => (
              <tr key={m.mes} className="border-t border-line tabular-nums">
                <td className="whitespace-nowrap py-1.5 pr-3 text-strong">{etiquetaMes(m.mes)}</td>
                <td className="pr-3 text-right">{pesos(m.cobros)}</td>
                <td className="pr-3 text-right">{pesos(m.proveedores)}</td>
                <td className="pr-3 text-right">{pesos(m.sueldos)}</td>
                <td className="pr-3 text-right">{pesos(m.fijos)}</td>
                <td className="pr-3 text-right">{pesos(m.impuestos)}</td>
                <td className={cn("pr-3 text-right", m.neto < 0 && "text-danger")}>{pesos(m.neto)}</td>
                <td className={cn("text-right font-medium", m.saldo < 0 ? "text-danger" : "text-strong")}>{pesos(m.saldo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-sm text-muted">Lo vencido sin pagar cae en el mes actual. Sueldos: suma de los sueldos base del equipo activo, {pesos(d.sueldosMes)} por mes.</p>
      </section>
    </div>
  );
}
