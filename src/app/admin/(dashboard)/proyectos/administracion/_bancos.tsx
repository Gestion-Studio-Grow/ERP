import { cn } from "@/components/ui";
import { fechaCorta } from "@/lib/proyectos/core";
import { aPesos } from "@/lib/proyectos/gestion-core";
import { ofreceMarcarConciliada, propuestasDeConciliacion } from "@/lib/proyectos/empresa-core";
import { datosDeBancos } from "@/lib/proyectos/empresa.server";
import { conciliarMovimiento, crearCuenta, desconciliarMovimiento, guardarSaldo } from "@/lib/proyectos/acciones-empresa";
import { movimientosParaConciliar, origenesDeMovimientos } from "@/lib/proyectos/moneda-bancos.server";
import { campo, etiqueta, tarjeta } from "../_vista";
import { cabezaMovil, celdaMovil, cuerpoMovil, filaMovil, importe, tablaMovil } from "../_tabla";
import { BotonDosPasos, FormAccion, ImportarExtracto, MarcarCuota } from "./_controles";

/** Un cobro partido o una comisión descontada no coinciden con ninguna cuota: lo decide la persona. */
function ElegirCuota({ id, opciones, etiqueta: titulo }: { id: string; opciones: readonly { id: string; concepto: string; monto: number; moneda: string; venceEl: Date }[]; etiqueta: string }) {
  if (opciones.length === 0) return null;
  return (
    <details>
      <summary className="min-h-11 cursor-pointer py-2 text-sm text-strong">{titulo}</summary>
      <FormAccion accion={conciliarMovimiento} boton="Conciliar">
        <input type="hidden" name="id" value={id} />
        <label className={etiqueta}>Cuota
          <select name="cuotaId" required defaultValue="" className={campo}>
            <option value="" disabled>Elegí una cuota</option>
            {opciones.map((c) => <option key={c.id} value={c.id}>{c.concepto} · {importe(c.monto, c.moneda)} · vence {fechaCorta(c.venceEl)}</option>)}
          </select>
        </label>
      </FormAccion>
    </details>
  );
}

const ORIGEN: Record<string, string> = { COBRO: "Cobro", PAGO: "Pago de gasto", ORDEN_PAGO: "Orden de pago", LIQUIDACION: "Pago de sueldo" };

type Candidato = Awaited<ReturnType<typeof movimientosParaConciliar>>[number];

/** O38: conciliar el renglón del extracto con lo que ya movió la cuenta (un cobro, un pago, una orden o un sueldo). */
function ElegirOrigen({ id, opciones }: { id: string; opciones: readonly Candidato[] }) {
  if (opciones.length === 0) return null;
  return (
    <details>
      <summary className="min-h-11 cursor-pointer py-2 text-sm text-strong">Conciliar con un movimiento de la cuenta</summary>
      <FormAccion accion={conciliarMovimiento} boton="Conciliar">
        <input type="hidden" name="id" value={id} />
        <label className={etiqueta}>Movimiento
          <select name="origen" required defaultValue="" className={campo}>
            <option value="" disabled>Elegí uno</option>
            {opciones.map((o) => <option key={`${o.origenTipo}|${o.origenId}`} value={`${o.origenTipo}|${o.origenId}`}>{ORIGEN[o.origenTipo] ?? o.origenTipo} · {importe(o.importe, "ARS")} · {fechaCorta(o.createdAt)}</option>)}
          </select>
        </label>
      </FormAccion>
    </details>
  );
}

export async function TabBancos({ tenantId, editaEmpresa, editaPagos }: { tenantId: string; editaEmpresa: boolean; editaPagos: boolean }) {
  const { cuentas, movimientos, candidatas, tc } = await datosDeBancos(tenantId);
  // MIA-50 · T08 (O38): con M8, un renglón también se concilia con un movimiento de la cuenta. Sin M8, vacío.
  const [origenes, paraConciliar] = await Promise.all([origenesDeMovimientos(tenantId, movimientos.filter((m) => !m.cuotaId).map((m) => m.id)), editaEmpresa ? movimientosParaConciliar(tenantId) : []]);
  const deLaCuenta = (m: { cuentaId: string; importe: number }) => paraConciliar.filter((o) => o.cuentaId === m.cuentaId && o.importe > 0 === m.importe > 0);
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
              <p className="text-xl font-bold tabular-nums text-strong">{importe(c.saldo, c.moneda)}</p>
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
          <table className={cn("w-full text-sm md:min-w-[920px]", tablaMovil)}>
            <thead className={cn("text-left text-xs text-muted", cabezaMovil)}>
              <tr>
                <th className="py-1 pr-3 font-medium">Fecha</th>
                <th className="pr-3 font-medium">Cuenta</th>
                <th className="pr-3 font-medium">Descripción</th>
                <th className="pr-3 text-right font-medium">Importe</th>
                <th className="pr-3 font-medium">Conciliado con</th>
                <th className="font-medium">Lote</th>
              </tr>
            </thead>
            <tbody className={cuerpoMovil}>
              {movimientos.map((m) => {
                const propuesta = propuestas.get(m.id);
                const cuota = m.cuota;
                const puedeMarcar = cuota && ofreceMarcarConciliada(cuota, { editaPagos, editaEmpresa });
                const origen = origenes.get(m.id);
                return (
                  <tr key={m.id} className={cn("border-t border-line align-top", filaMovil)}>
                    <td data-label="Fecha" className={cn("whitespace-nowrap py-2 pr-3", celdaMovil)}>{fechaCorta(m.fecha)}</td>
                    <td data-label="Cuenta" className={cn("py-2 pr-3", celdaMovil)}>{m.cuenta.nombre}</td>
                    <td data-label="Descripción" className={cn("py-2 pr-3", celdaMovil)}>{m.descripcion || "—"}</td>
                    <td data-label="Importe" className={cn("whitespace-nowrap py-2 pr-3 text-right font-medium tabular-nums", m.importe < 0 ? "text-danger" : "text-strong", celdaMovil)}>{importe(m.importe, m.cuenta.moneda)}</td>
                    <td data-label="Conciliado con" className={cn("py-2 pr-3", celdaMovil)}>
                      {cuota ? (
                        <div className="grid justify-items-start gap-1">
                          <span className="text-strong">{cuota.concepto}</span>
                          <span className="text-xs text-muted">{cuota.pagadoEl ? `Marcada el ${fechaCorta(cuota.pagadoEl)}` : cuota.noSeCobra ? "Proyecto perdido: no se cobra" : "Sin marcar como pagada"}</span>
                          {puedeMarcar && <MarcarCuota id={cuota.id} deEmpresa={!cuota.proyectoId} etiqueta={cuota.tipo === "COBRO" ? "Marcar cobrada" : "Marcar pagada"} />}
                          {editaEmpresa && <BotonDosPasos accion={desconciliarMovimiento} campos={{ id: m.id }} etiqueta="Deshacer" pregunta="¿Deshacer la conciliación?" />}
                        </div>
                      ) : origen ? (
                        <div className="grid justify-items-start gap-1">
                          <span className="text-strong">{ORIGEN[origen.origenTipo] ?? origen.origenTipo}</span>
                          <span className="text-xs text-muted">Conciliado con un movimiento de la cuenta</span>
                          {editaEmpresa && <BotonDosPasos accion={desconciliarMovimiento} campos={{ id: m.id }} etiqueta="Deshacer" pregunta="¿Deshacer la conciliación?" />}
                        </div>
                      ) : propuesta ? (
                        <div className="grid justify-items-start gap-1">
                          <span className="text-muted">Propuesta: <span className="text-strong">{propuesta.concepto}</span> · vence {fechaCorta(propuesta.venceEl)}</span>
                          {editaEmpresa && <FormAccion accion={conciliarMovimiento} boton="Conciliar"><input type="hidden" name="id" value={m.id} /><input type="hidden" name="cuotaId" value={propuesta.id} /></FormAccion>}
                          {editaEmpresa && <ElegirCuota id={m.id} opciones={candidatas.filter((c) => (c.tipo === "COBRO") === m.importe > 0)} etiqueta="Elegir otra cuota" />}
                          {editaEmpresa && <ElegirOrigen id={m.id} opciones={deLaCuenta(m)} />}
                        </div>
                      ) : (
                        <div className="grid justify-items-start gap-1">
                          <span className="text-muted">Sin cuota con ese importe</span>
                          {editaEmpresa && <ElegirCuota id={m.id} opciones={candidatas.filter((c) => (c.tipo === "COBRO") === m.importe > 0)} etiqueta="Elegir la cuota a mano" />}
                          {editaEmpresa && <ElegirOrigen id={m.id} opciones={deLaCuenta(m)} />}
                        </div>
                      )}
                    </td>
                    <td data-label="Lote" className={cn("py-2 text-xs text-muted", celdaMovil)}>{m.lote || "—"}</td>
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
