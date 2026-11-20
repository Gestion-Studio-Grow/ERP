// MIA-50 T09 · O49: el resultado por proyecto (venta − costo real, los mismos números de la ficha) y el de la empresa en
// el mes (suma de los proyectos − gastos de administración), con lo previsto de los gastos fijos contra lo real.

import Link from "next/link";
import { KpiTile, cn } from "@/components/ui";
import { pesos } from "@/lib/proyectos/core";
import { claveMes } from "@/lib/proyectos/gestion-core";
import { etiquetaMes } from "@/lib/proyectos/empresa-core";
import { resultadoDeLaEmpresa } from "@/lib/proyectos/resultado.server";
import { tarjeta } from "../_vista";

const mesVecino = (mes: string, delta: number) => {
  const [a, m] = mes.split("-").map(Number);
  return claveMes(new Date(a, m - 1 + delta, 1));
};

export async function TabResultado({ tenantId, mes: pedido }: { tenantId: string; mes?: string }) {
  const mes = pedido && /^\d{4}-(0[1-9]|1[0-2])$/.test(pedido) ? pedido : claveMes(new Date());
  const r = await resultadoDeLaEmpresa(tenantId, mes);
  const ruta = (m: string) => `/admin/proyectos/direccion?tab=resultado&mes=${m}`;
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-strong first-letter:uppercase">{etiquetaMes(mes)}</h2>
        <nav aria-label="Mes" className="flex gap-2">
          <Link href={ruta(mesVecino(mes, -1))} className="inline-flex min-h-11 items-center rounded-lg border border-line px-3 text-sm text-strong">Anterior</Link>
          <Link href={ruta(mesVecino(mes, 1))} className="inline-flex min-h-11 items-center rounded-lg border border-line px-3 text-sm text-strong">Siguiente</Link>
        </nav>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiTile label="Resultado de los proyectos" value={pesos(r.sumaProyectos)} sub={r.proyectos.length === 1 ? "1 proyecto del mes" : `${r.proyectos.length} proyectos del mes`} />
        <KpiTile label="Gastos de administración" value={pesos(r.administracionReal)} sub={`Previsto: ${pesos(r.fijosPrevisto)}`} />
        <KpiTile label="Resultado de la empresa" value={pesos(r.resultadoEmpresa)} sub="proyectos menos administración" />
      </div>
      <p className="text-sm text-muted">
        Cada proyecto cuenta en el mes de su evento (o de su alta, si no tiene fecha) y cada gasto en el de su comprobante. Venta sin IVA menos costo real: los mismos números de la ficha.
      </p>

      <section className={tarjeta} aria-labelledby="resultado-proyectos">
        <h3 id="resultado-proyectos" className="mb-2 font-semibold text-strong">Por proyecto</h3>
        {r.proyectos.length === 0 ? (
          <p className="text-sm text-muted">No hay proyectos confirmados en este mes.</p>
        ) : (
          <ul className="grid gap-2">
            {r.proyectos.map((p) => (
              <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t border-line pt-2 text-sm">
                <Link href={`/admin/proyectos/${p.id}`} className="min-w-0 break-words font-medium text-strong underline underline-offset-2">{p.codigo} {p.nombre}</Link>
                <span className="tabular-nums text-muted">
                  {pesos(p.venta)} − {pesos(p.costoReal)} = <strong className={cn(p.resultado < 0 ? "text-danger" : "text-strong")}>{pesos(p.resultado)}</strong>
                  {!p.conGastos && <span className="block text-xs">Todavía sin costo real cargado</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={tarjeta} aria-labelledby="resultado-admin">
          <h3 id="resultado-admin" className="mb-2 font-semibold text-strong">Administración, lo real</h3>
          {r.sinComprobantes && <p className="mb-2 text-sm text-muted">La carga de comprobantes todavía no está habilitada en tu negocio.</p>}
          {r.administracion.length === 0 ? (
            <p className="text-sm text-muted">Sin gastos de administración imputados este mes.</p>
          ) : (
            <ul className="grid gap-1 text-sm">
              {r.administracion.map((x) => (
                <li key={x.categoria} className="flex justify-between gap-3 border-t border-line pt-1"><span className="min-w-0 break-words">{x.categoria}</span><span className="tabular-nums">{pesos(x.real)}</span></li>
              ))}
            </ul>
          )}
        </section>
        <section className={tarjeta} aria-labelledby="resultado-fijos">
          <h3 id="resultado-fijos" className="mb-2 font-semibold text-strong">Gastos fijos, lo previsto</h3>
          {r.fijosPrevistos.length === 0 ? (
            <p className="text-sm text-muted">No hay gastos fijos que caigan este mes.</p>
          ) : (
            <ul className="grid gap-1 text-sm">
              {r.fijosPrevistos.map((x, i) => (
                <li key={`${x.nombre}-${i}`} className="flex justify-between gap-3 border-t border-line pt-1"><span className="min-w-0 break-words">{x.nombre}</span><span className="tabular-nums">{pesos(x.previsto)}</span></li>
              ))}
            </ul>
          )}
          <p className={cn("mt-2 border-t border-line pt-2 text-sm font-medium", r.desvioFijos > 0 ? "text-danger" : "text-strong")}>
            {r.administracion.length === 0 ? "Sin gastos reales cargados todavía: no hay desvío que medir." : r.desvioFijos > 0 ? `Se gastó ${pesos(r.desvioFijos)} más de lo previsto` : r.desvioFijos < 0 ? `Se gastó ${pesos(-r.desvioFijos)} menos de lo previsto` : "Lo real coincide con lo previsto"}
          </p>
        </section>
      </div>
    </div>
  );
}
