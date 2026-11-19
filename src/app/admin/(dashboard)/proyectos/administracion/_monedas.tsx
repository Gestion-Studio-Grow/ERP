import { cn } from "@/components/ui";
import { fechaCorta, fechaParaInput, pesos } from "@/lib/proyectos/core";
import { monedasYFijos } from "@/lib/proyectos/empresa.server";
import { bajaGastoFijo, guardarGastoFijo, guardarTipoCambio } from "@/lib/proyectos/acciones-empresa";
import { hayM6, historialDelCambio, hoyArgentina } from "@/lib/proyectos/moneda-bancos.server";
import { valorDelNegocio } from "@/lib/proyectos/parametros/leer.server";
import { campo, etiqueta, tarjeta } from "../_vista";
import { BotonDosPasos, FormAccion } from "./_controles";

const FRECUENCIA: Record<string, string> = { MENSUAL: "Mensual", ANUAL: "Anual", UNICO: "Único" };
const TIPO: Record<string, string> = { FIJO: "Gasto fijo", IMPUESTO: "Impuesto" };

type Fijo = { id?: string; tipo?: string; nombre?: string; frecuencia?: string; monto?: number; moneda?: string; fecha?: Date | null };

function CamposFijo({ g = {} }: { g?: Fijo }) {
  return (
    <>
      {g.id && <input type="hidden" name="id" value={g.id} />}
      <label className={etiqueta}>Tipo
        <select name="tipo" defaultValue={g.tipo ?? "FIJO"} className={campo}><option value="FIJO">Gasto fijo</option><option value="IMPUESTO">Impuesto</option></select>
      </label>
      <label className={etiqueta}>Nombre<input name="nombre" required maxLength={120} defaultValue={g.nombre} className={campo} /></label>
      <label className={etiqueta}>Frecuencia
        <select name="frecuencia" defaultValue={g.frecuencia ?? "MENSUAL"} className={campo}><option value="MENSUAL">Mensual</option><option value="ANUAL">Anual</option><option value="UNICO">Único</option></select>
      </label>
      <label className={etiqueta}>Monto<input name="monto" inputMode="decimal" required defaultValue={g.monto != null ? String(g.monto).replace(".", ",") : undefined} className={campo} /></label>
      <label className={etiqueta}>Moneda
        <select name="moneda" defaultValue={g.moneda ?? "ARS"} className={campo}><option value="ARS">Pesos</option><option value="USD">Dólares</option></select>
      </label>
      <label className={etiqueta}>Fecha (anual o único)<input name="fecha" type="date" defaultValue={fechaParaInput(g.fecha)} className={campo} /></label>
    </>
  );
}

export async function TabMonedas({ tenantId, editaEmpresa }: { tenantId: string; editaEmpresa: boolean }) {
  const [{ cambio, fijos }, m6, habilitadas] = await Promise.all([monedasYFijos(tenantId), hayM6(), valorDelNegocio(tenantId, "moneda.habilitadas")]);
  // MIA-50 · T08 (O39): con M6 el cambio se guarda por día; cada cobro o pago toma el del día o el último anterior.
  const otras = (Array.isArray(habilitadas) ? habilitadas : ["USD"]).filter((m) => m !== "ARS");
  const historial = m6 ? (await Promise.all(otras.map(async (m) => (await historialDelCambio(tenantId, m)).map((h) => ({ ...h, moneda: m }))))).flat().sort((x, y) => (x.dia < y.dia ? 1 : x.dia > y.dia ? -1 : x.moneda.localeCompare(y.moneda))).slice(0, 60) : [];
  const hoy = hoyArgentina();
  return (
    <div className="grid gap-4">
      <section className={cn(tarjeta, "min-w-0")}>
        <h2 className="mb-1 font-semibold text-strong">Tipo de cambio</h2>
        <p className="mb-3 text-sm text-muted">{cambio ? `Actualizado el ${fechaCorta(cambio.updatedAt)}.` : "Todavía no está cargado: sin él, los dólares no suman a los totales."}</p>
        {editaEmpresa ? (
          <FormAccion accion={guardarTipoCambio} boton="Guardar" limpiar={false} className="max-w-xs">
            {m6 && (
              <>
                <label className={etiqueta}>Moneda
                  <select name="moneda" defaultValue={otras[0] ?? "USD"} className={campo}>{otras.map((m) => <option key={m} value={m}>{m === "USD" ? "Dólares (USD)" : m}</option>)}</select>
                </label>
                <label className={etiqueta}>Del día<input name="fecha" type="date" required max={hoy} defaultValue={hoy} className={campo} /></label>
              </>
            )}
            <label className={etiqueta}>Pesos por unidad<input name="porUnidad" inputMode="decimal" required defaultValue={cambio ? String(cambio.porUnidad).replace(".", ",") : undefined} className={campo} /></label>
          </FormAccion>
        ) : (
          <p className="font-semibold tabular-nums text-strong">{cambio ? pesos(cambio.porUnidad, "ARS") : "—"}</p>
        )}
        {m6 && (
          <div className="mt-4 overflow-x-auto">
            <h3 className="mb-1 text-sm font-semibold text-strong">Historial por día</h3>
            <p className="mb-2 text-xs text-muted">Un cobro o un pago usa el cambio de su día o el último cargado antes. Cargar uno nuevo no cambia lo ya registrado.</p>
            {historial.length === 0 ? (
              <p className="text-sm text-muted">Todavía no hay ninguno.</p>
            ) : (
              <table className="w-full min-w-[360px] text-sm">
                <thead className="text-left text-xs text-muted">
                  <tr><th className="py-1 pr-3 font-medium">Día</th><th className="pr-3 font-medium">Moneda</th><th className="pr-3 text-right font-medium">Pesos por unidad</th><th className="font-medium">Lo cargó</th></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {historial.map((h) => (
                    <tr key={`${h.moneda}-${h.dia}`}>
                      <td className="py-2 pr-3 tabular-nums">{h.dia.split("-").reverse().join("/")}</td>
                      <td className="py-2 pr-3">{h.moneda}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-strong">{pesos(h.centavosPorUnidad / 100)}</td>
                      <td className="py-2 text-muted">{h.cargadoPor}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </section>

      <section className={cn(tarjeta, "overflow-x-auto")}>
        <h2 className="mb-2 font-semibold text-strong">Gastos fijos e impuestos</h2>
        {fijos.length === 0 ? (
          <p className="text-sm text-muted">Todavía no hay ninguno.</p>
        ) : (
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="py-1 pr-3 font-medium">Tipo</th>
                <th className="pr-3 font-medium">Nombre</th>
                <th className="pr-3 font-medium">Frecuencia</th>
                <th className="pr-3 text-right font-medium">Monto</th>
                {editaEmpresa && <th className="font-medium">Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {fijos.map((g) => (
                <tr key={g.id} className="border-t border-line align-top">
                  <td className="py-2 pr-3">{TIPO[g.tipo] ?? g.tipo}</td>
                  <td className="py-2 pr-3 text-strong">{g.nombre}</td>
                  <td className="py-2 pr-3">{FRECUENCIA[g.frecuencia] ?? g.frecuencia}{g.fecha && g.frecuencia !== "MENSUAL" ? ` · ${fechaCorta(g.fecha)}` : ""}</td>
                  <td className="whitespace-nowrap py-2 pr-3 text-right font-medium tabular-nums text-strong">{pesos(g.monto, g.moneda)}</td>
                  {editaEmpresa && (
                    <td className="py-2">
                      <details className="group">
                        <summary className="flex min-h-11 cursor-pointer items-center text-strong underline">Editar</summary>
                        <div className="mt-2 grid gap-3">
                          <FormAccion accion={guardarGastoFijo} boton="Guardar" limpiar={false} className="min-w-64">
                            <CamposFijo g={g} />
                          </FormAccion>
                          <BotonDosPasos accion={bajaGastoFijo} campos={{ id: g.id }} etiqueta="Dar de baja" pregunta="¿Dar de baja?" />
                        </div>
                      </details>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {editaEmpresa && (
        <section className={tarjeta}>
          <h2 className="mb-2 font-semibold text-strong">Nuevo gasto fijo o impuesto</h2>
          <FormAccion accion={guardarGastoFijo} boton="Sumar" className="sm:grid-cols-2 lg:grid-cols-3">
            <CamposFijo />
          </FormAccion>
        </section>
      )}
    </div>
  );
}
