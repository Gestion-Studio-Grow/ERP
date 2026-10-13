import Link from "next/link";
import { notFound } from "next/navigation";
import { requireApp } from "@/lib/require-app";
import { requireCapability } from "@/lib/authz";
import { buttonClasses, cn, Field, Input, Select } from "@/components/ui";
import { roleHasCapability } from "@/lib/capabilities";
import { getCurrentTenantId } from "@/lib/tenant";
import { configInmo, contratoAdmin, hoyDia } from "@/lib/inmobiliaria/datos.server";
import { origenDelSitio } from "@/lib/inmobiliaria/sitio.server";
import { agregarExtra, anularCobro, aplicarAjuste, cargarMora, cerrarContrato, quitarExtra, registrarCobro } from "@/lib/inmobiliaria/acciones";
import {
  armarMensaje,
  diaCorto,
  ESTADO_CONTRATO_LABEL,
  INDICE_LABEL,
  MEDIO_LABEL,
  MEDIOS,
  nombrePeriodo,
  pesos,
  variacion,
  type EstadoContrato,
  type IndiceAjuste,
  type MedioPago,
} from "@/lib/inmobiliaria/core";
import { CopiarLink } from "../../../taller/_piezas";
import { BarraInmo, ChipCuota, RAIZ, subtitulo, tarjeta, titulo } from "../../_vista";
import { Avisar, BotonEnviar, FormAccion } from "../../_piezas";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inmobiliaria · Contrato" };

const importe = (v: number): string => v.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function Contrato({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireApp("inmobiliaria");
  await requireCapability("agenda:manage");
  const { id } = await params;
  const tenantId = await getCurrentTenantId();
  const [c, config, origen] = await Promise.all([contratoAdmin(id), configInmo(tenantId), origenDelSitio()]);
  if (!c) notFound();
  const hoy = hoyDia();
  const mes = hoy.slice(0, 7);
  const vigente = c.estado === "VIGENTE";
  const link = `${origen}/alquiler/${c.token}`;
  // A la vista: lo vencido, este mes y el que viene. El resto del cronograma queda plegado.
  const aLaVista = c.cuotas.filter((q) => q.estado !== "ANULADA" && (q.saldo > 0.005 ? q.periodo <= mes || q === c.cuotas.find((x) => x.periodo > mes) : q.periodo === mes));
  const resto = c.cuotas.filter((q) => !aLaVista.includes(q));
  const nombre = c.inquilino.nombre.split(" ")[0];

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-5">
      <header className="mb-4 flex flex-col gap-1">
        <Link href={`${RAIZ}/alquileres`} className="inline-flex min-h-11 items-center self-start text-sm underline">
          ← Alquileres
        </Link>
        <span className="text-sm text-muted">
          Contrato Nº {c.numero} · {ESTADO_CONTRATO_LABEL[c.estado as EstadoContrato] ?? c.estado} · {diaCorto(c.calc.inicio)} → {diaCorto(c.calc.fin)}
        </span>
        <h1 className={titulo}>{c.propiedad.nombre}</h1>
        <p className="text-sm text-muted">
          Alquila <strong className="text-strong">{c.inquilino.nombre}</strong> · dueño <strong className="text-strong">{c.propietario.nombre}</strong> · {INDICE_LABEL[c.calc.ajusteIndice]}
          {c.calc.ajusteIndice !== "SIN_AJUSTE" ? ` cada ${c.calc.ajusteCadaMeses} meses` : ""} · comisión {String(c.comisionPct).replace(".", ",")} %
        </p>
      </header>

      <BarraInmo activa={`${RAIZ}/alquileres`} conPlata esDuenio={roleHasCapability(user.role, "users:manage")} />

      {c.debe > 0 && (
        <p className="mb-4 rounded-xl border border-line px-3 py-2 text-sm font-semibold text-strong" style={{ background: "var(--warning-soft)" }}>
          Debe {pesos(c.debe)} de cuotas vencidas.
        </p>
      )}

      {c.ajuste && (
        <section className={cn(tarjeta, "mb-4 grid grid-cols-1 gap-3")} aria-label="Actualización del alquiler" style={{ borderLeft: "4px solid var(--warning)" }}>
          <h2 className={subtitulo}>
            {c.ajuste.dia <= hoy ? `Falta aplicar la actualización del ${diaCorto(c.ajuste.dia)}` : `El ${diaCorto(c.ajuste.dia)} se actualiza el alquiler`}
          </h2>
          {c.ajuste.resultado.ok ? (
            <p className="text-sm">
              Pasa de <strong>{pesos(c.ajuste.vigente)}</strong> a <strong className="text-lg">{pesos(c.ajuste.resultado.nuevo)}</strong> ({variacion(c.ajuste.resultado.coeficiente)}).
              <span className="block text-muted">{c.ajuste.resultado.detalle}</span>
            </p>
          ) : (
            <p className="text-sm">
              {c.ajuste.resultado.falta}{" "}
              <Link href={`${RAIZ}/config#indices`} className="underline">
                Cargar o bajar los índices
              </Link>
            </p>
          )}
          <FormAccion accion={aplicarAjuste} mensajeOk="Actualización aplicada." confirmar="¿Aplicar la actualización? Cambia el monto de las cuotas que siguen." className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
            <input type="hidden" name="contratoId" value={c.id} />
            <Field label="Monto nuevo a mano (opcional)" htmlFor="ajuste-monto" hint="Si el contrato dice otra cosa, cargá acá el monto y vale ése.">
              <Input id="ajuste-monto" name="monto" importe inputMode="decimal" placeholder={c.ajuste.resultado.ok ? importe(c.ajuste.resultado.nuevo) : ""} />
            </Field>
            <BotonEnviar pendingText="Aplicando…">Aplicar actualización</BotonEnviar>
          </FormAccion>
          {c.ajuste.resultado.ok && (
            <Avisar
              telefono={c.inquilino.telefono}
              etiqueta="Avisarle al inquilino"
              texto={armarMensaje(config.plantillas.ajuste, {
                nombre,
                propiedad: c.propiedad.nombre,
                periodo: nombrePeriodo(c.ajuste.dia.slice(0, 7)),
                indice: INDICE_LABEL[c.calc.ajusteIndice],
                variacion: variacion(c.ajuste.resultado.coeficiente),
                monto: pesos(c.ajuste.resultado.nuevo),
              })}
            />
          )}
        </section>
      )}

      <section className="mb-4 grid grid-cols-1 gap-3" aria-label="Cuotas para cobrar">
        <h2 className={subtitulo}>Para cobrar</h2>
        {aLaVista.length === 0 && <p className="text-sm text-muted">No hay cuotas pendientes en este momento.</p>}
        {aLaVista.map((q) => {
          const conMora = q.mora.monto > 0;
          const aCobrar = q.saldo + (conMora ? q.mora.monto : 0);
          const vencida = q.estado === "VENCIDA" || (q.estado === "PARCIAL" && q.vence < hoy);
          return (
            <article key={q.id} className={cn(tarjeta, "grid grid-cols-1 gap-3")} style={{ borderLeft: `4px solid ${vencida ? "var(--danger)" : q.estado === "PAGADA" ? "var(--success)" : "var(--info)"}` }}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold text-strong first-letter:uppercase">
                  {nombrePeriodo(q.periodo)} <span className="font-normal normal-case text-muted">· cuota {q.numero} · vence {diaCorto(q.vence)}</span>
                </h3>
                <ChipCuota estado={q.estado} />
              </div>
              <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
                <dt>Alquiler{q.ajustePendiente && <strong> · falta aplicar la actualización</strong>}</dt>
                <dd className="text-right tabular-nums">{pesos(q.alquiler)}</dd>
                {q.extras.map((e, i) => (
                  <div key={i} className="contents">
                    <dt className="flex items-center gap-2">
                      {e.concepto}
                      {q.saldo > 0.005 && (
                        <FormAccion accion={quitarExtra} className="inline">
                          <input type="hidden" name="cuotaId" value={q.id} />
                          <input type="hidden" name="concepto" value={e.concepto} />
                          <input type="hidden" name="monto" value={e.monto.toFixed(2)} />
                          <button type="submit" className="min-h-11 px-2 text-xs underline" aria-label={`Quitar ${e.concepto}`}>
                            quitar
                          </button>
                        </FormAccion>
                      )}
                    </dt>
                    <dd className="text-right tabular-nums">{pesos(e.monto)}</dd>
                  </div>
                ))}
                {q.punitorios > 0 && (
                  <>
                    <dt>Interés por mora</dt>
                    <dd className="text-right tabular-nums">{pesos(q.punitorios)}</dd>
                  </>
                )}
                {conMora && (
                  <>
                    <dt className="text-muted">Mora sugerida ({q.mora.dias} días)</dt>
                    <dd className="text-right tabular-nums text-muted">{pesos(q.mora.monto)}</dd>
                  </>
                )}
                {q.pagado > 0 && (
                  <>
                    <dt>Cobrado</dt>
                    <dd className="text-right tabular-nums">− {pesos(q.pagado)}</dd>
                  </>
                )}
                <dt className="font-bold text-strong">Saldo</dt>
                <dd className="text-right text-lg font-bold tabular-nums text-strong">{pesos(q.saldo)}</dd>
              </dl>

              {q.pagos.length > 0 && (
                <ul className="grid gap-1 border-t border-line pt-2 text-sm">
                  {q.pagos.map((p) => (
                    <li key={p.id} className={cn("flex flex-wrap items-center justify-between gap-2", p.anulado && "text-muted line-through")}>
                      <span>
                        {diaCorto(p.fecha)} · {MEDIO_LABEL[p.medio as MedioPago] ?? p.medio} · {pesos(p.monto)}
                        {p.cobradoPor ? ` · ${p.cobradoPor}` : ""}
                        {p.nota ? ` · ${p.nota}` : ""}
                      </span>
                      {!p.anulado && vigente && (
                        <FormAccion accion={anularCobro} confirmar="¿Anular este cobro? Queda el rastro de que se anuló.">
                          <input type="hidden" name="id" value={p.id} />
                          <button type="submit" className="min-h-11 px-2 text-xs underline">
                            Anular
                          </button>
                        </FormAccion>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {q.saldo > 0.005 && vigente && (
                <>
                  <FormAccion accion={registrarCobro} mensajeOk="Cobro registrado." className="grid grid-cols-2 gap-2 border-t border-line pt-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                    <input type="hidden" name="cuotaId" value={q.id} />
                    <Field label="Cobro ($)" htmlFor={`monto-${q.id}`}>
                      <Input id={`monto-${q.id}`} name="monto" importe inputMode="decimal" required defaultValue={importe(q.saldo)} />
                    </Field>
                    <Field label="Medio" htmlFor={`medio-${q.id}`}>
                      <Select id={`medio-${q.id}`} name="medio" defaultValue="TRANSFERENCIA">
                        {MEDIOS.map((m) => (
                          <option key={m} value={m}>
                            {MEDIO_LABEL[m]}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <BotonEnviar pendingText="Guardando…" className="col-span-2 justify-center sm:col-span-1">
                      Registrar cobro
                    </BotonEnviar>
                    {conMora && (
                      <label className="col-span-2 flex min-h-11 items-center gap-2 text-sm sm:col-span-3">
                        <input type="checkbox" name="conMora" className="size-5" /> Cobrarle también la mora ({pesos(q.mora.monto)}): el saldo pasa a {pesos(aCobrar)}
                      </label>
                    )}
                  </FormAccion>
                  <details className="rounded-xl border border-line px-3">
                    <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-strong">Sumar expensas u otro concepto · cambiar la mora · avisar</summary>
                    <div className="grid grid-cols-1 gap-3 pb-3">
                      <FormAccion accion={agregarExtra} vaciar className="grid grid-cols-2 gap-2 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
                        <input type="hidden" name="cuotaId" value={q.id} />
                        <Field label="Concepto" htmlFor={`concepto-${q.id}`}>
                          <Input id={`concepto-${q.id}`} name="concepto" maxLength={60} placeholder="Expensas, luz, ABL…" required />
                        </Field>
                        <Field label="Monto ($)" htmlFor={`extra-${q.id}`}>
                          <Input id={`extra-${q.id}`} name="monto" importe inputMode="decimal" required />
                        </Field>
                        <BotonEnviar variant="outline" size="md" pendingText="…" className="col-span-2 justify-center sm:col-span-1">
                          Sumar
                        </BotonEnviar>
                      </FormAccion>
                      <FormAccion accion={cargarMora} className="grid grid-cols-[1fr_auto] items-end gap-2">
                        <input type="hidden" name="cuotaId" value={q.id} />
                        <Field label="Interés por mora ($)" htmlFor={`mora-${q.id}`} hint="0 para perdonarla.">
                          <Input id={`mora-${q.id}`} name="monto" importe inputMode="decimal" defaultValue={importe(q.punitorios || q.mora.monto)} />
                        </Field>
                        <BotonEnviar variant="outline" size="md" pendingText="…">
                          Fijar mora
                        </BotonEnviar>
                      </FormAccion>
                      <Avisar
                        telefono={c.inquilino.telefono}
                        etiqueta={vencida ? "Reclamar por WhatsApp" : "Recordar por WhatsApp"}
                        texto={armarMensaje(vencida ? config.plantillas.mora : config.plantillas.vencimiento, {
                          nombre,
                          propiedad: c.propiedad.nombre,
                          periodo: nombrePeriodo(q.periodo),
                          fecha: diaCorto(q.vence),
                          total: pesos(aCobrar),
                          saldo: pesos(aCobrar),
                          link,
                        })}
                      />
                    </div>
                  </details>
                </>
              )}
              {q.estado === "PAGADA" && (
                <Avisar
                  telefono={c.inquilino.telefono}
                  etiqueta="Mandar el recibo"
                  texto={armarMensaje(config.plantillas.recibo, { nombre, monto: pesos(q.pagado), propiedad: c.propiedad.nombre, periodo: nombrePeriodo(q.periodo), link })}
                />
              )}
            </article>
          );
        })}
      </section>

      <section className={cn(tarjeta, "mb-4 grid grid-cols-1 gap-2")} aria-label="Link del inquilino">
        <h2 className={subtitulo}>Link del inquilino</h2>
        <p className="text-sm text-muted">Sin usuario ni contraseña: ve qué debe, cuándo vence, cómo pagar y sus últimos pagos.</p>
        <div className="flex flex-wrap gap-2">
          <CopiarLink url={link} />
          <a href={`/alquiler/${c.token}`} target="_blank" rel="noopener noreferrer" className={buttonClasses("ghost", "md")}>
            Verlo ↗
          </a>
        </div>
      </section>

      <details className={cn(tarjeta, "mb-4")}>
        <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-strong">Cronograma completo ({c.cuotas.length} cuotas)</summary>
        <div className="overflow-x-auto">
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-muted">
                <th scope="col" className="py-2 pr-3">Cuota</th>
                <th scope="col" className="py-2 pr-3">Vence</th>
                <th scope="col" className="py-2 pr-3 text-right">Alquiler</th>
                <th scope="col" className="py-2 pr-3 text-right">Cobrado</th>
                <th scope="col" className="py-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {[...aLaVista, ...resto]
                .sort((a, b) => a.numero - b.numero)
                .map((q) => (
                  <tr key={q.id} className="border-t border-line">
                    <td className="py-2 pr-3 first-letter:uppercase">
                      {q.numero} · {nombrePeriodo(q.periodo)}
                    </td>
                    <td className="py-2 pr-3">{diaCorto(q.vence)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {pesos(q.alquiler)}
                      {q.ajustePendiente && <span className="text-muted"> *</span>}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{q.pagado > 0 ? pesos(q.pagado) : "—"}</td>
                    <td className="py-2">
                      <ChipCuota estado={q.estado} />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">* Monto provisorio: falta aplicar la actualización de ese tramo.</p>
      </details>

      {c.ajustes.length > 0 && (
        <section className={cn(tarjeta, "mb-4")} aria-label="Actualizaciones aplicadas">
          <h2 className={cn(subtitulo, "mb-2")}>Actualizaciones aplicadas</h2>
          <ul className="grid gap-1 text-sm">
            {c.ajustes.map((a) => (
              <li key={a.tramo}>
                Desde el {diaCorto(a.desde)}: {pesos(a.montoAnterior)} → <strong>{pesos(a.montoNuevo)}</strong> ({variacion(a.coeficiente)}) · {a.detalle}
                {a.aplicadoPor ? ` · ${a.aplicadoPor}` : ""}
              </li>
            ))}
          </ul>
        </section>
      )}

      {(c.garantia || c.notas || c.deposito > 0) && (
        <section className={cn(tarjeta, "mb-4 grid gap-1 text-sm")} aria-label="Datos del contrato">
          <h2 className={subtitulo}>Datos del contrato</h2>
          {c.deposito > 0 && <p>Depósito: {pesos(c.deposito)}</p>}
          {c.garantia && <p>Garantía: {c.garantia}</p>}
          {c.notas && <p className="whitespace-pre-line text-muted">{c.notas}</p>}
          <p className="text-muted">
            Inquilino: {c.inquilino.telefono} · Propietario: {c.propietario.telefono} · {INDICE_LABEL[c.calc.ajusteIndice as IndiceAjuste]} · mora {String(c.punitorioDiarioPct).replace(".", ",")} % por día
          </p>
        </section>
      )}

      {vigente && (
        <details className={tarjeta}>
          <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-strong">Cerrar el contrato</summary>
          <p className="mb-2 text-sm text-muted">Las cuotas de los meses que siguen y que nadie pagó se anulan. Lo ya cobrado no se toca.</p>
          <div className="flex flex-wrap gap-2">
            {(["FINALIZADO", "RESCINDIDO"] as const).map((e) => (
              <FormAccion key={e} accion={cerrarContrato} confirmar={`¿Marcar el contrato como ${ESTADO_CONTRATO_LABEL[e].toLowerCase()}?`}>
                <input type="hidden" name="id" value={c.id} />
                <input type="hidden" name="estado" value={e} />
                <BotonEnviar variant="outline" size="md" pendingText="…">
                  {e === "FINALIZADO" ? "Terminó el plazo" : "Se rescindió antes"}
                </BotonEnviar>
              </FormAccion>
            ))}
          </div>
        </details>
      )}
    </main>
  );
}
