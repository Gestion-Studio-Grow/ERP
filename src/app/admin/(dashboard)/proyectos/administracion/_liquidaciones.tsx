import Link from "next/link";
import { buttonClasses, cn } from "@/components/ui";
import { fechaCorta, pesos } from "@/lib/proyectos/core";
import { claveMes } from "@/lib/proyectos/gestion-core";
import { etiquetaMes, leerExtras, periodoValido, totalDeExtras } from "@/lib/proyectos/empresa-core";
import { liquidacionesDelPeriodo } from "@/lib/proyectos/empresa.server";
import { publicarBorradores } from "@/lib/proyectos/acciones-empresa";
import { campo, etiqueta, tarjeta } from "../_vista";
import { BotonDosPasos, EditarExtras, GenerarLiquidaciones } from "./_controles";

export async function TabLiquidaciones({ tenantId, mes, edita }: { tenantId: string; mes?: string; edita: boolean }) {
  const periodo = mes && periodoValido(mes) ? mes : claveMes(new Date());
  const filas = await liquidacionesDelPeriodo(tenantId, periodo);
  const borradores = filas.filter((f) => f.estado === "BORRADOR").length;
  return (
    <div className="grid gap-4">
      <section className={cn(tarjeta, "flex flex-wrap items-end gap-3")}>
        <form method="get" className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="tab" value="liquidaciones" />
          <label className={etiqueta}>Mes<input type="month" name="mes" defaultValue={periodo} className={campo} /></label>
          <button type="submit" className={cn(buttonClasses("ghost", "md"), "min-h-11")}>Ver</button>
        </form>
        {edita && (
          <>
            <GenerarLiquidaciones periodo={periodo} />
            {borradores > 0 && (
              <BotonDosPasos accion={publicarBorradores} campos={{ periodo }} etiqueta={`Publicar borradores (${borradores})`} pregunta="Una vez publicadas no se pueden cambiar, y cada persona recibe el aviso. ¿Publicar?" principal />
            )}
          </>
        )}
      </section>

      <section className={cn(tarjeta, "overflow-x-auto")}>
        <h2 className="mb-2 font-semibold text-strong first-letter:uppercase">{etiquetaMes(periodo)}</h2>
        {filas.length === 0 ? (
          <p className="text-sm text-muted">No hay liquidaciones de este mes.{edita ? " Generalas con el botón de arriba: salen del sueldo base y de los plus de los eventos terminados en el mes." : ""}</p>
        ) : (
          <table className="w-full min-w-[920px] text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="py-1 pr-3 font-medium">Persona</th>
                <th className="pr-3 font-medium">Factura a</th>
                <th className="pr-3 text-right font-medium">Base</th>
                <th className="pr-3 font-medium">Extras</th>
                <th className="pr-3 text-right font-medium">Total</th>
                <th className="pr-3 font-medium">Estado</th>
                <th className="pr-3 font-medium">Visto</th>
                <th className="font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => {
                const extras = leerExtras(f.extras);
                return (
                  <tr key={f.id} className="border-t border-line align-top">
                    <td className="py-2 pr-3"><span className="text-strong">{f.persona.nombre}</span>{f.persona.puesto && <span className="block text-xs text-muted">{f.persona.puesto}</span>}</td>
                    <td className="py-2 pr-3">{f.facturaA || "—"}</td>
                    <td className="whitespace-nowrap py-2 pr-3 text-right tabular-nums">{pesos(f.base)}</td>
                    <td className="py-2 pr-3">
                      {extras.length === 0 ? (
                        <span className="text-muted">—</span>
                      ) : (
                        <>
                          <span className="font-medium tabular-nums text-strong">{pesos(totalDeExtras(extras))}</span>
                          <ul className="text-xs text-muted">
                            {extras.map((e, i) => <li key={i}>{e.nombre}{e.manual ? " (a mano)" : ""}: {pesos(e.monto)}</li>)}
                          </ul>
                        </>
                      )}
                    </td>
                    <td className="whitespace-nowrap py-2 pr-3 text-right font-semibold tabular-nums text-strong">{pesos(f.total)}</td>
                    <td className="whitespace-nowrap py-2 pr-3">{f.estado === "PUBLICADA" ? `Publicada ${fechaCorta(f.publicadaEl)}` : "Borrador"}</td>
                    <td className="whitespace-nowrap py-2 pr-3">{f.vistaEl ? fechaCorta(f.vistaEl) : "—"}</td>
                    <td className="py-2">
                      <div className="flex flex-wrap items-start gap-1">
                        {edita && f.estado === "BORRADOR" && <EditarExtras id={f.id} persona={f.persona.nombre} base={f.base} manuales={extras.filter((e) => e.manual)} />}
                        <Link href={`/admin/proyectos/imprimir-liquidacion/${f.id}`} className={cn(buttonClasses("ghost", "md"), "min-h-11")}>PDF</Link>
                      </div>
                    </td>
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
