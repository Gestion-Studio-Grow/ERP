import { cn } from "@/components/ui";
import { fechaCorta, fechaParaInput } from "@/lib/proyectos/core";
import { plataEn } from "@/lib/proyectos/gestion-core";
import { monedasYFijos } from "@/lib/proyectos/empresa.server";
import { bajaGastoFijo, guardarGastoFijo, guardarTipoCambio } from "@/lib/proyectos/acciones-empresa";
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
  const { cambio, fijos } = await monedasYFijos(tenantId);
  return (
    <div className="grid gap-4">
      <section className={tarjeta}>
        <h2 className="mb-1 font-semibold text-strong">Tipo de cambio</h2>
        <p className="mb-3 text-sm text-muted">{cambio ? `Actualizado el ${fechaCorta(cambio.updatedAt)}.` : "Todavía no está cargado: sin él, los dólares no suman a los totales."}</p>
        {editaEmpresa ? (
          <FormAccion accion={guardarTipoCambio} boton="Guardar" limpiar={false} className="max-w-xs">
            <label className={etiqueta}>Pesos por dólar<input name="porUnidad" inputMode="decimal" required defaultValue={cambio ? String(cambio.porUnidad).replace(".", ",") : undefined} className={campo} /></label>
          </FormAccion>
        ) : (
          <p className="font-semibold tabular-nums text-strong">{cambio ? plataEn(cambio.porUnidad, "ARS") : "—"}</p>
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
                  <td className="whitespace-nowrap py-2 pr-3 text-right font-medium tabular-nums text-strong">{plataEn(g.monto, g.moneda)}</td>
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
