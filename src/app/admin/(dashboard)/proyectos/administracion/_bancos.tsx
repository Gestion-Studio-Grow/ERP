import { cn } from "@/components/ui";
import { fechaCorta } from "@/lib/proyectos/core";
import { aPesos, plataEn } from "@/lib/proyectos/gestion-core";
import { propuestasDeConciliacion } from "@/lib/proyectos/empresa-core";
import { datosDeBancos } from "@/lib/proyectos/empresa.server";
import { conciliarMovimiento, crearCuenta, desconciliarMovimiento, guardarSaldo } from "@/lib/proyectos/acciones-empresa";
import { campo, etiqueta, tarjeta } from "../_vista";
import { BotonDosPasos, FormAccion, ImportarExtracto, MarcarCuota } from "./_controles";

export async function TabBancos({ tenantId, editaEmpresa, editaPagos }: { tenantId: string; editaEmpresa: boolean; editaPagos: boolean }) {
  const { cuentas, movimientos, candidatas, tc } = await datosDeBancos(tenantId);
  // Las cuotas se comparan en pesos: el movimiento de una cuenta en dólares, también.
  const propuestas = propuestasDeConciliacion(movimientos.filter((m) => !m.cuotaId).map((m) => ({ ...m, importe: aPesos(m.importe, m.cuenta.moneda, tc) })), candidatas, tc);
  return (
    <div className="grid gap-4">
      {cuentas.length === 0 ? (
        <p className={cn(tarjeta, "text-sm text-muted")}>Todavía no hay cuentas. Sumá la primera para ver la caja e importar extractos.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cuentas.map((c) => (
            <li key={c.id} className={tarjeta}>
              <p className="text-sm text-muted">{c.nombre}</p>
              <p className="text-xl font-bold tabular-nums text-strong">{plataEn(c.saldo, c.moneda)}</p>
              <p className={cn("mb-2 text-sm", c.sinConciliar > 0 ? "text-strong" : "text-muted")}>{c.sinConciliar === 1 ? "1 sin conciliar" : `${c.sinConciliar} sin conciliar`}</p>
              {editaEmpresa && (
                <FormAccion accion={guardarSaldo} boton="Guardar saldo" limpiar={false}>
                  <input type="hidden" name="id" value={c.id} />
                  <label className={etiqueta}>Saldo<input name="saldo" inputMode="decimal" defaultValue={String(c.saldo).replace(".", ",")} className={campo} /></label>
                </FormAccion>
              )}
            </li>
          ))}
        </ul>
      )}

      {editaEmpresa && (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className={tarjeta}>
            <h2 className="mb-2 font-semibold text-strong">Nueva cuenta</h2>
            <FormAccion accion={crearCuenta} boton="Sumar cuenta" className="sm:grid-cols-3">
              <label className={cn(etiqueta, "sm:col-span-3")}>Nombre<input name="nombre" required maxLength={80} className={campo} /></label>
              <label className={etiqueta}>Moneda
                <select name="moneda" className={campo} defaultValue="ARS"><option value="ARS">Pesos</option><option value="USD">Dólares</option></select>
              </label>
              <label className={cn(etiqueta, "sm:col-span-2")}>Saldo de hoy<input name="saldo" inputMode="decimal" className={campo} /></label>
            </FormAccion>
          </section>
          {cuentas.length > 0 && (
            <section className={tarjeta}>
              <h2 className="mb-2 font-semibold text-strong">Importar extracto</h2>
              <p className="mb-3 text-sm text-muted">Importar no cambia el saldo de la cuenta, y volver a subir el mismo archivo no duplica.</p>
              <ImportarExtracto cuentas={cuentas} />
            </section>
          )}
        </div>
      )}

      <section className={cn(tarjeta, "overflow-x-auto")}>
        <h2 className="mb-2 font-semibold text-strong">Movimientos</h2>
        {movimientos.length === 0 ? (
          <p className="text-sm text-muted">Sin movimientos todavía.</p>
        ) : (
          <table className="w-full min-w-[920px] text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="py-1 pr-3 font-medium">Fecha</th>
                <th className="pr-3 font-medium">Cuenta</th>
                <th className="pr-3 font-medium">Descripción</th>
                <th className="pr-3 text-right font-medium">Importe</th>
                <th className="pr-3 font-medium">Conciliado con</th>
                <th className="font-medium">Lote</th>
              </tr>
            </thead>
            <tbody>
              {movimientos.map((m) => {
                const propuesta = propuestas.get(m.id);
                const cuota = m.cuota;
                const puedeMarcar = cuota && !cuota.pagadoEl && !cuota.anuladoEl && (cuota.proyectoId ? editaPagos : editaEmpresa);
                return (
                  <tr key={m.id} className="border-t border-line align-top">
                    <td className="whitespace-nowrap py-2 pr-3">{fechaCorta(m.fecha)}</td>
                    <td className="py-2 pr-3">{m.cuenta.nombre}</td>
                    <td className="py-2 pr-3">{m.descripcion || "—"}</td>
                    <td className={cn("whitespace-nowrap py-2 pr-3 text-right font-medium tabular-nums", m.importe < 0 ? "text-danger" : "text-strong")}>{plataEn(m.importe, m.cuenta.moneda)}</td>
                    <td className="py-2 pr-3">
                      {cuota ? (
                        <div className="grid justify-items-start gap-1">
                          <span className="text-strong">{cuota.concepto}</span>
                          <span className="text-xs text-muted">{cuota.pagadoEl ? `Marcada el ${fechaCorta(cuota.pagadoEl)}` : "Sin marcar como pagada"}</span>
                          {puedeMarcar && <MarcarCuota id={cuota.id} deEmpresa={!cuota.proyectoId} etiqueta={cuota.tipo === "COBRO" ? "Marcar cobrada" : "Marcar pagada"} />}
                          {editaEmpresa && <BotonDosPasos accion={desconciliarMovimiento} campos={{ id: m.id }} etiqueta="Deshacer" pregunta="¿Deshacer la conciliación?" />}
                        </div>
                      ) : propuesta ? (
                        <div className="grid justify-items-start gap-1">
                          <span className="text-muted">Propuesta: <span className="text-strong">{propuesta.concepto}</span> · vence {fechaCorta(propuesta.venceEl)}</span>
                          {editaEmpresa && <FormAccion accion={conciliarMovimiento} boton="Conciliar"><input type="hidden" name="id" value={m.id} /><input type="hidden" name="cuotaId" value={propuesta.id} /></FormAccion>}
                        </div>
                      ) : (
                        <span className="text-muted">Sin cuota con ese importe</span>
                      )}
                    </td>
                    <td className="py-2 text-xs text-muted">{m.lote || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
