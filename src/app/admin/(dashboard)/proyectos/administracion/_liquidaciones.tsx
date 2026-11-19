import Link from "next/link";
import { buttonClasses, cn } from "@/components/ui";
import { fechaCorta, pesos } from "@/lib/proyectos/core";
import { claveMes } from "@/lib/proyectos/gestion-core";
import { esLoPropio, etiquetaMes, leerExtras, periodoValido, totalDeExtras } from "@/lib/proyectos/empresa-core";
import { cuentasEnPesos, liquidacionesDelPeriodo } from "@/lib/proyectos/empresa.server";
import { borrarLiquidacion, publicarBorradores } from "@/lib/proyectos/acciones-empresa";
import { campo, etiqueta, tarjeta } from "../_vista";
import { accionesMovil, cabezaMovil, celdaMovil, cuerpoMovil, filaMovil, tablaMovil } from "../_tabla";
import { BotonDosPasos, EditarExtras, GenerarLiquidaciones, PagarLiquidacion } from "./_controles";
import { CampoCodigo } from "@/components/segundo-paso/CampoCodigo";
import { rigeSegundoPaso } from "@/lib/proyectos/segundo-factor-core";
import { rubroDe } from "@/lib/proyectos/segundo-factor.server";
import { saldosAFavorDe } from "@/lib/proyectos/liquidacion-proyecto.server";
import { formatearPesos } from "@/lib/rendiciones/dinero";

/**
 * `paga`: Dirección o Administración (el servidor lo vuelve a decidir, y nadie se paga lo propio). `yo`: quien mira; la
 * liquidación propia no se genera, edita, publica, borra ni paga desde acá (G4: el servidor la rechaza igual).
 */
export async function TabLiquidaciones({ tenantId, mes, edita, paga = false, yo }: { tenantId: string; mes?: string; edita: boolean; paga?: boolean; yo: { personaId: string | null; userId: string } }) {
  const periodo = mes && periodoValido(mes) ? mes : claveMes(new Date());
  const [filas, cuentas, rubro, saldos] = await Promise.all([liquidacionesDelPeriodo(tenantId, periodo), paga ? cuentasEnPesos(tenantId) : [], paga ? rubroDe(tenantId) : null, saldosAFavorDe(tenantId)]);
  // MIA-50 T11 (O47, D10): pagar pide el código de la app en el momento, donde rigen los dos pasos.
  const dosPasos = paga && rigeSegundoPaso(rubro);
  const esMia = (f: (typeof filas)[number]) => esLoPropio(yo, { personaId: f.personaId, userId: f.persona.userId });
  const borradores = filas.filter((f) => f.estado === "BORRADOR" && !esMia(f)).length;
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
          <table className={cn("w-full text-sm md:min-w-[920px]", tablaMovil)}>
            <thead className={cn("text-left text-xs text-muted", cabezaMovil)}>
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
            <tbody className={cuerpoMovil}>
              {filas.map((f) => {
                const extras = leerExtras(f.extras);
                return (
                  <tr key={f.id} className={cn("border-t border-line align-top", filaMovil)}>
                    <td data-label="Persona" className={cn("py-2 pr-3", celdaMovil)}><div><span className="text-strong">{f.persona.nombre}</span>{f.persona.puesto && <span className="block text-xs text-muted">{f.persona.puesto}</span>}</div></td>
                    <td data-label="Factura a" className={cn("py-2 pr-3", celdaMovil)}>{f.facturaA || "—"}</td>
                    <td data-label="Base" className={cn("whitespace-nowrap py-2 pr-3 text-right tabular-nums", celdaMovil)}>{pesos(f.base)}</td>
                    <td data-label="Extras" className={cn("py-2 pr-3", celdaMovil)}>
                      <div>
                      {extras.length === 0 ? (
                        <span className="text-muted">—</span>
                      ) : (
                        <>
                          <span className="font-medium tabular-nums text-strong">{pesos(totalDeExtras(extras))}</span>
                          <ul className="text-xs text-muted">
                            {extras.map((e, i) => <li key={i}>{e.nombre}{e.manual ? " (a mano)" : ""}{e.reintegro ? " (rendición)" : ""}: {pesos(e.monto)}</li>)}
                          </ul>
                        </>
                      )}
                      </div>
                    </td>
                    <td data-label="Total" className={cn("whitespace-nowrap py-2 pr-3 text-right font-semibold tabular-nums text-strong", celdaMovil)}>{pesos(f.total)}</td>
                    <td data-label="Estado" className={cn("whitespace-nowrap py-2 pr-3", celdaMovil)}>{f.estado === "PAGADA" ? "Pagada" : f.estado === "PUBLICADA" ? `Publicada ${fechaCorta(f.publicadaEl)}` : "Borrador"}</td>
                    <td data-label="Visto" className={cn("whitespace-nowrap py-2 pr-3", celdaMovil)}>{f.vistaEl ? fechaCorta(f.vistaEl) : "—"}</td>
                    <td className={cn("py-2", accionesMovil)}>
                      <div className="flex flex-wrap items-start gap-1">
                        {edita && f.estado === "BORRADOR" && !esMia(f) && <EditarExtras id={f.id} persona={f.persona.nombre} base={f.base} manuales={extras.filter((e) => e.manual)} />}
                        {edita && f.estado === "BORRADOR" && !esMia(f) && <BotonDosPasos accion={borrarLiquidacion} campos={{ id: f.id }} etiqueta="Borrar" pregunta="Las rendiciones que tenía quedan libres. ¿Borrar el borrador?" />}
                        {esMia(f) && f.estado !== "PAGADA" && <p className="max-w-56 text-xs text-muted">Es tuya: la arma, la publica y la paga otra persona de Dirección o Administración.</p>}
                        {paga && f.estado === "PUBLICADA" && !esMia(f) && <PagarLiquidacion id={f.id} total={pesos(f.total)} cuentas={cuentas} codigo={dosPasos ? <CampoCodigo accion="pagar" id={`codigo-${f.id}`} /> : null} />}
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
      {saldos.length > 0 && (
        <section className={tarjeta} aria-labelledby="titulo-saldos">
          <h2 id="titulo-saldos" className="font-semibold text-strong">Saldos a favor de la empresa</h2>
          <p className="text-sm text-muted">{"Personas cuya parte de un proyecto cerró en negativo o bajó por un ajuste. No se descuenta solo de su liquidación del mes: Dirección decide cómo se compensa."}</p>
          <ul className="mt-3 grid gap-2 text-sm">
            {saldos.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2">
                <span className="min-w-0 break-words text-strong">{`${x.persona} · `}<Link href={`/admin/proyectos/${x.proyectoId}?tab=liquidacion`} prefetch={false} className="underline">{x.proyecto}</Link></span>
                <span className="tabular-nums font-semibold text-strong">{formatearPesos(x.monto - x.aplicado)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
