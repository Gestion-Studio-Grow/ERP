import { requireApp } from "@/lib/require-app";
import { requireCapability } from "@/lib/authz";
import { buttonClasses, cn, EmptyState, Field, Input, Select } from "@/components/ui";
import { roleHasCapability } from "@/lib/capabilities";
import { getCurrentTenantId } from "@/lib/tenant";
import { configInmo, listaLiquidaciones, paraLiquidar } from "@/lib/inmobiliaria/datos.server";
import { origenDelSitio } from "@/lib/inmobiliaria/sitio.server";
import { anularLiquidacion, emitirLiquidacion, pagarLiquidacion } from "@/lib/inmobiliaria/acciones";
import { armarMensaje, diaCorto, MEDIO_LABEL, MEDIOS, nombrePeriodo, pesos, type MedioPago } from "@/lib/inmobiliaria/core";
import { CopiarLink } from "../../taller/_piezas";
import { BarraInmo, RAIZ, subtitulo, tarjeta, titulo } from "../_vista";
import { Avisar, BotonEnviar, FormAccion } from "../_piezas";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inmobiliaria · Liquidaciones" };

const enPalabras = (concepto: string): string => concepto.replace(/(\d{4}-\d{2})$/, (m) => nombrePeriodo(m));

export default async function Liquidaciones() {
  const user = await requireApp("inmobiliaria");
  await requireCapability("agenda:manage");
  const tenantId = await getCurrentTenantId();
  const [pendientes, emitidas, config, origen] = await Promise.all([paraLiquidar(), listaLiquidaciones(), configInmo(tenantId), origenDelSitio()]);

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-5">
      <header className="mb-4">
        <h1 className={titulo}>Liquidaciones a propietarios</h1>
        <p className="text-sm text-muted">Lo que se cobró y todavía no se le pasó al dueño, y el historial de lo ya liquidado.</p>
      </header>

      <BarraInmo activa={`${RAIZ}/liquidaciones`} conPlata esDuenio={roleHasCapability(user.role, "users:manage")} />

      <section className="mb-6 grid grid-cols-1 gap-3" aria-label="Para liquidar">
        <h2 className={subtitulo}>Para liquidar</h2>
        {pendientes.length === 0 ? (
          <EmptyState title="No hay nada para liquidar" description="Cuando se registre un cobro de alquiler, aparece acá a nombre del propietario." />
        ) : (
          pendientes.map((p) => (
            <article key={p.propietarioId} className={cn(tarjeta, "grid grid-cols-1 gap-3")}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-lg font-semibold text-strong">{p.propietario}</h3>
                <span className="text-sm text-muted">
                  le corresponden <strong className="text-lg tabular-nums text-strong">{pesos(p.previa.neto)}</strong>
                </span>
              </div>
              <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
                {p.cobros.map((c) => (
                  <div key={c.cuotaId} className="contents">
                    <dt>
                      <span className="inline-block first-letter:uppercase">{enPalabras(c.concepto)}</span>
                      {(c.extras > 0 || c.punitorios > 0) && (
                        <span className="block text-xs text-muted">
                          alquiler {pesos(c.alquiler)}
                          {c.extras > 0 ? ` · otros ${pesos(c.extras)}` : ""}
                          {c.punitorios > 0 ? ` · mora ${pesos(c.punitorios)}` : ""}
                        </span>
                      )}
                    </dt>
                    <dd className="text-right tabular-nums">{pesos(c.alquiler + c.extras + c.punitorios)}</dd>
                  </div>
                ))}
                <dt className="text-muted">Comisión por administración</dt>
                <dd className="text-right tabular-nums text-muted">− {pesos(p.previa.comision)}</dd>
                {p.previa.ivaComision > 0 && (
                  <>
                    <dt className="text-muted">IVA de la comisión</dt>
                    <dd className="text-right tabular-nums text-muted">− {pesos(p.previa.ivaComision)}</dd>
                  </>
                )}
              </dl>
              <FormAccion accion={emitirLiquidacion} mensajeOk="Liquidación emitida." confirmar={`¿Emitir la liquidación de ${p.propietario}?`} className="grid grid-cols-1 gap-2 border-t border-line pt-3">
                <input type="hidden" name="propietarioId" value={p.propietarioId} />
                <input type="hidden" name="cobradoVisto" value={p.previa.cobrado.toFixed(2).replace(".", ",")} />
                <p className="text-sm font-medium text-strong">Gastos a cargo del propietario (opcional)</p>
                {[0, 1].map((i) => (
                  <div key={i} className="grid grid-cols-[2fr_1fr] gap-2">
                    <Input name="gastoConcepto" maxLength={80} placeholder={i === 0 ? "Plomero, ABL, arreglo de persiana…" : "Otro gasto"} aria-label={`Concepto del gasto ${i + 1}`} />
                    <Input name="gastoMonto" importe inputMode="decimal" placeholder="$" aria-label={`Monto del gasto ${i + 1}`} />
                  </div>
                ))}
                <BotonEnviar pendingText="Emitiendo…" className="sm:justify-self-start">
                  Emitir liquidación
                </BotonEnviar>
              </FormAccion>
            </article>
          ))
        )}
      </section>

      <section className="grid grid-cols-1 gap-3" aria-label="Liquidaciones emitidas">
        <h2 className={subtitulo}>Emitidas</h2>
        {emitidas.length === 0 && <p className="text-sm text-muted">Todavía no se emitió ninguna.</p>}
        {emitidas.map((l) => {
          const link = `${origen}/liquidacion/${l.token}`;
          const anulada = l.estado === "ANULADA";
          return (
            <article key={l.id} className={cn(tarjeta, "grid grid-cols-1 gap-2", anulada && "opacity-60")} style={{ borderLeft: `4px solid ${l.estado === "PAGADA" ? "var(--success)" : anulada ? "var(--text-faint)" : "var(--warning)"}` }}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-semibold text-strong">
                  Nº {l.numero} · {l.propietario}
                </h3>
                <strong className="text-lg tabular-nums text-strong">{pesos(l.totales.neto)}</strong>
              </div>
              <p className="text-sm text-muted">
                Emitida el {diaCorto(l.emitida)} · cobrado {pesos(l.totales.cobrado)} · comisión {pesos(l.totales.comision)}
                {l.totales.gastos > 0 ? ` · gastos ${pesos(l.totales.gastos)}` : ""} ·{" "}
                <strong className="text-strong">
                  {l.estado === "PAGADA" ? `pagada el ${diaCorto(l.pagadaEl)} (${MEDIO_LABEL[l.medio as MedioPago] ?? l.medio})` : anulada ? "anulada" : "sin pagar"}
                </strong>
              </p>
              {!anulada && (
                <div className="flex flex-wrap items-center gap-2">
                  <CopiarLink url={link} etiqueta="Copiar link del propietario" />
                  <a href={`/liquidacion/${l.token}`} target="_blank" rel="noopener noreferrer" className={buttonClasses("ghost", "md")}>
                    Verla ↗
                  </a>
                  <Avisar
                    telefono={l.telefono}
                    etiqueta="Avisarle por WhatsApp"
                    texto={armarMensaje(config.plantillas.liquidacion, { nombre: l.propietario.split(" ")[0], periodo: nombrePeriodo(l.periodo), neto: pesos(l.totales.neto), link })}
                  />
                </div>
              )}
              {l.estado === "EMITIDA" && (
                <div className="grid grid-cols-1 gap-2 border-t border-line pt-2 sm:grid-cols-[1fr_auto] sm:items-end">
                  <FormAccion accion={pagarLiquidacion} mensajeOk="Marcada como pagada." className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                    <input type="hidden" name="id" value={l.id} />
                    <Field label="Se le pagó por" htmlFor={`medio-${l.id}`}>
                      <Select id={`medio-${l.id}`} name="medio" defaultValue="TRANSFERENCIA">
                        {MEDIOS.map((m) => (
                          <option key={m} value={m}>
                            {MEDIO_LABEL[m]}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Nota" htmlFor={`nota-${l.id}`}>
                      <Input id={`nota-${l.id}`} name="nota" maxLength={300} placeholder="Nº de operación" />
                    </Field>
                    <BotonEnviar pendingText="…">Marcar pagada</BotonEnviar>
                  </FormAccion>
                  <FormAccion accion={anularLiquidacion} confirmar="¿Anular esta liquidación? Sus cobros vuelven a «para liquidar».">
                    <input type="hidden" name="id" value={l.id} />
                    <BotonEnviar variant="ghost" size="md" pendingText="…">
                      Anular
                    </BotonEnviar>
                  </FormAccion>
                </div>
              )}
            </article>
          );
        })}
      </section>
    </main>
  );
}
