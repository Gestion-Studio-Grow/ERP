// Las pestañas Cotización y Finanzas, y lo que viene de antes y sigue vivo: costo real, cobros, propuesta con su link.

import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Badge, buttonClasses, cn } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import { pagarGasto, registrarCobro } from "@/lib/proyectos/acciones";
import { anularCobroFicha, anularGastoFicha, aprobarInterno, crearMovimientoManual, enviarCotizacion, guardarTextos, marcarCuota, nuevaVersion, quitarMovimiento, recalcularCuotas, registrarRespuesta } from "@/lib/proyectos/acciones-ficha";
import { fechaCorta, fechaParaInput, MEDIOS, MEDIO_LABEL, pesos, porcentaje, sePuedeEditar, totalDelGasto, waLink, type MedioPago } from "@/lib/proyectos/core";
import { esFoto, FILTROS_CASHFLOW, filtrarCashflow, fotoDeVersion, planillaDeVenta } from "@/lib/proyectos/ficha-core";
import { aItemFicha } from "@/lib/proyectos/gestion.server";
import { cambiosEntreVersiones, estadoCuota, MONEDAS, plataEn, totalesFicha } from "@/lib/proyectos/gestion-core";
import { datosCotizacion, datosFinanzas, type Cabecera, type Vista } from "@/lib/proyectos/ficha.server";
import { veLaPlata } from "@/lib/proyectos/datos.server";
import type { Actor } from "@/lib/proyectos/gestion.server";
import { campo, etiqueta, tarjeta } from "../_vista";
import { BotonConConfirmacion, FormAccion } from "./_cliente";
import { FormGasto } from "./_gastos";
import { CopiarLink } from "./_piezas";
import { PlanillaVenta } from "./_planilla";
import { Numero } from "./_pestanas-datos";

const campoEnLinea = "min-h-11 min-w-0 rounded-lg border border-line bg-surface px-3 text-sm text-strong";
const areaTexto = "w-full rounded-lg border border-line bg-surface p-3 text-sm text-strong";

const ESTADO_VERSION: Record<string, string> = { BORRADOR: "Borrador", ENVIADO: "Enviada", APROBADO: "Cliente aprobó", RECHAZADO: "Cliente pidió cambios", REEMPLAZADO: "Reemplazada" };

// ── Cotización ──────────────────────────────────────────────────────────────

export async function PestanaCotizacion({ a, cab, vista, ver, cambios }: { a: Actor; cab: Cabecera; vista: Vista; ver?: string; cambios?: string }) {
  const { proyecto: p, tc, config, negocio } = cab;
  const versiones = await datosCotizacion(a, p.id);
  const recargo = config.margenPct;
  const verMargen = !vista.ocultas.has("margen");
  const foto = (v: (typeof versiones)[number]) => (esFoto(v.foto) ? v.foto : fotoDeVersion(v.items, tc, recargo));
  const abierta = versiones.find((v) => v.id === ver);
  const comparada = versiones.find((v) => v.id === cambios);
  const anterior = comparada ? versiones.find((v) => v.version < comparada.version) : undefined;
  const diferencia = comparada && anterior ? cambiosEntreVersiones(foto(anterior), foto(comparada)) : null;
  const viva = versiones[0];
  const hayBorrador = !!viva && sePuedeEditar(viva.estado);
  const planillaViva = viva ? planillaDeVenta(viva.items, tc, recargo) : null;
  const wa = waLink(p.client.phone, `Hola ${p.client.name}! Te compartimos la propuesta de ${negocio.nombre} para "${p.nombre}":`);

  return (
    <div className="grid gap-4">
      <section className={tarjeta} aria-label="Versiones">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-strong">Versiones</h2>
          {vista.editaCotizaciones && !hayBorrador && (
            <FormAccion accion={nuevaVersion} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="proyectoId" value={p.id} />
              <input name="nota" maxLength={300} aria-label="Nota de la versión" placeholder="Qué cambia" className={cn(campoEnLinea, "flex-1")} />
              <SubmitButton className={buttonClasses("solid", "md")}>Nueva versión</SubmitButton>
            </FormAccion>
          )}
        </div>
        {versiones.length === 0 && <p className="text-sm text-muted">Todavía no hay versiones.</p>}
        <ul className="grid gap-3">
          {versiones.map((v, n) => {
            const t = totalesFicha(v.items.map(aItemFicha), tc, recargo);
            const editable = sePuedeEditar(v.estado);
            const ruta = `/propuesta/${v.token}`;
            return (
              <li key={v.id} className="rounded-xl border border-line p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-strong">Versión {v.version}</h3>
                  <Badge tone={v.estado === "APROBADO" ? "success" : v.estado === "RECHAZADO" ? "danger" : "neutral"}>{ESTADO_VERSION[v.estado] ?? v.estado}</Badge>
                  {v.aprobadoInternoEl ? <span className="text-xs text-muted">Precios aprobados por {v.aprobadoInternoPor}</span> : editable && <span className="text-xs font-medium text-danger">Falta la aprobación de Dirección</span>}
                </div>
                <dl className="mb-2 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <Numero titulo="Total sin IVA" valor={pesos(t.venta)} />
                  {verMargen && <Numero titulo="Margen" valor={`${pesos(t.margen)} (${porcentaje(t.margenPct)})`} />}
                  <Numero titulo="Fecha" valor={fechaCorta(v.enviadoEl ?? v.createdAt)} />
                  <Numero titulo="Quién" valor={v.creadoPor ?? "—"} />
                </dl>
                {v.nota && <p className="mb-1 text-sm">Nota: {v.nota}</p>}
                {v.respondidoPor && <p className="mb-1 text-sm">Respondió {v.respondidoPor} el {fechaCorta(v.respondidoEl)}{v.motivoRechazo && `: «${v.motivoRechazo}»`}</p>}
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`?tab=cotizacion&ver=${v.id}`} scroll={false} className={buttonClasses("outline", "md")}>Ver</Link>
                  {n < versiones.length - 1 && <Link href={`?tab=cotizacion&cambios=${v.id}`} scroll={false} className={buttonClasses("outline", "md")}>Qué cambió</Link>}
                  <a href={`/admin/proyectos/imprimir/venta/${p.id}?version=${v.id}`} target="_blank" rel="noopener noreferrer" className={buttonClasses("outline", "md")}>PDF</a>
                  <a href={`/admin/proyectos/imprimir/venta/${p.id}/xlsx?version=${v.id}`} className={buttonClasses("outline", "md")}>Excel</a>
                  {!editable && <a href={ruta} target="_blank" rel="noopener noreferrer" className={buttonClasses("outline", "md")}>Ver propuesta</a>}
                  {!editable && <CopiarLink ruta={ruta} />}
                  {wa && v.estado === "ENVIADO" && <a href={wa} target="_blank" rel="noopener noreferrer" className={buttonClasses("outline", "md")}>Abrir WhatsApp</a>}
                </div>

                {editable && a.rol === "DIRECCION" && vista.editaCotizaciones && !v.aprobadoInternoEl && (
                  <FormAccion accion={aprobarInterno} className="mt-3 border-t border-line pt-3">
                    <input type="hidden" name="id" value={v.id} />
                    <SubmitButton className={buttonClasses("solid", "md")}>Aprobar precios</SubmitButton>
                  </FormAccion>
                )}

                {editable && vista.editaCotizaciones && (
                  <div className="mt-3 grid gap-3 border-t border-line pt-3">
                    <FormAccion accion={guardarTextos} className="grid gap-2">
                      <input type="hidden" name="id" value={v.id} />
                      <label className={etiqueta}>Presentación para el cliente<textarea name="presentacion" rows={3} defaultValue={v.presentacion} className={areaTexto} /></label>
                      <label className={etiqueta}>Condiciones<textarea name="condiciones" rows={3} defaultValue={v.condiciones} className={areaTexto} /></label>
                      <label className={cn(etiqueta, "max-w-40")}>IVA %<input name="ivaPct" defaultValue={String(v.ivaPct).replace(".", ",")} inputMode="decimal" className={campo} /></label>
                      <SubmitButton className={buttonClasses("outline", "md")}>Guardar textos</SubmitButton>
                    </FormAccion>
                    <FormAccion accion={enviarCotizacion}>
                      <input type="hidden" name="id" value={v.id} />
                      <SubmitButton className={cn(buttonClasses("solid", "lg"), "w-full justify-center")}>Enviar: cerrar versión y generar link</SubmitButton>
                      <p className="mt-1 text-sm text-muted">Después de esto, la versión no se edita: para cambiarla se abre otra.</p>
                    </FormAccion>
                  </div>
                )}

                {v.estado === "ENVIADO" && vista.editaCotizaciones && (
                  <details className="mt-3 border-t border-line pt-2">
                    <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-strong">El cliente respondió por otro lado</summary>
                    <FormAccion accion={registrarRespuesta} className="grid gap-2 pt-2 sm:grid-cols-2">
                      <input type="hidden" name="id" value={v.id} />
                      <select name="respuesta" aria-label="Respuesta" defaultValue="APROBADO" className={campo}>
                        <option value="APROBADO">Aprobó</option>
                        <option value="RECHAZADO">Pidió cambios</option>
                      </select>
                      <input name="nombre" required maxLength={120} aria-label="Quién respondió" placeholder="Quién respondió" className={campo} />
                      <input name="motivo" maxLength={500} aria-label="Qué cambios pidió" placeholder="Qué cambios pidió" className={cn(campo, "sm:col-span-2")} />
                      <SubmitButton className={cn(buttonClasses("outline", "md"), "sm:col-span-2")}>Registrar respuesta</SubmitButton>
                    </FormAccion>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {comparada && (
        <section className={tarjeta} aria-label="Qué cambió">
          <h2 className="mb-2 font-semibold text-strong">Qué cambió en la versión {comparada.version}</h2>
          {diferencia ? (
            <>
              <dl className="mb-3 grid grid-cols-3 gap-3 text-sm">
                <Numero titulo={`Versión ${anterior?.version}`} valor={pesos(diferencia.totalAnterior)} />
                <Numero titulo={`Versión ${comparada.version}`} valor={pesos(diferencia.totalNuevo)} />
                <Numero titulo="Diferencia" valor={`${diferencia.diferencia > 0 ? "+" : ""}${pesos(diferencia.diferencia)}`} />
              </dl>
              {diferencia.cambios.length === 0 && <p className="text-sm text-muted">Los precios son los mismos.</p>}
              <ul className="grid gap-1 text-sm">
                {diferencia.cambios.map((c, n) => (
                  <li key={n} className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-1">
                    <span className="min-w-0"><Badge tone={c.tipo === "quitado" ? "danger" : c.tipo === "agregado" ? "success" : "neutral"}>{c.tipo}</Badge> {c.descripcion} <span className="text-xs text-muted">{c.rubro}</span></span>
                    <span className="tabular-nums">
                      {c.antes !== null && <s className="mr-2 text-muted">{pesos(c.antes)}</s>}
                      {c.despues !== null && <strong className="text-strong">{pesos(c.despues)}</strong>}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-sm text-muted">Es la primera versión: no hay contra qué comparar.</p>
          )}
        </section>
      )}

      {abierta && (
        <section className={tarjeta} aria-label={`Versión ${abierta.version}`}>
          <h2 className="mb-2 font-semibold text-strong">Versión {abierta.version}</h2>
          {(() => {
            const pl = planillaDeVenta(abierta.items, tc, recargo);
            return <PlanillaVenta grupos={pl.grupos} neto={pl.neto} ivaPct={abierta.ivaPct} />;
          })()}
        </section>
      )}

      {planillaViva && (
        <section className={tarjeta} aria-label="Planilla de venta en vivo">
          <h2 className="mb-2 font-semibold text-strong">Planilla de venta en vivo</h2>
          <PlanillaVenta grupos={planillaViva.grupos} neto={planillaViva.neto} ivaPct={viva.ivaPct} />
        </section>
      )}
    </div>
  );
}

// ── Finanzas ────────────────────────────────────────────────────────────────

export async function PestanaFinanzas({ a, cab, vista, filtro }: { a: Actor; cab: Cabecera; vista: Vista; filtro?: string }) {
  const cuentas = vista.editaPagos ? await prisma.proyectoCuentaBanco.findMany({ where: { tenantId: a.tenantId }, orderBy: { createdAt: "asc" }, select: { id: true, nombre: true, moneda: true } }) : [];
  const { proyecto: p, totales: t, faltanCambio } = cab;
  const d = await datosFinanzas(a, cab, vista);
  const activo = FILTROS_CASHFLOW.some((f) => f.id === filtro) ? (filtro as string) : "todos";
  const lineas = filtrarCashflow(d.flujo.lineas, activo);
  const hoy = fechaParaInput(new Date());
  // Las acciones viejas de cobro y gasto piden además poder manejar plata en el ERP.
  const cargaDirecta = vista.editaPagos && veLaPlata(a.user);
  const verCosto = !vista.ocultas.has("costoTotal");

  return (
    <div className="grid gap-4">
      <section className={tarjeta} aria-label="Resultado del evento">
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Numero titulo="Venta presupuestada" valor={pesos(t.venta)} />
          {verCosto && <Numero titulo="Costo presupuestado" valor={pesos(t.costo)} />}
          {vista.costos && <Numero titulo="Saldo final" valor={pesos(d.flujo.saldoFinal)} alerta={d.flujo.saldoFinal < 0} />}
          {vista.costos && <Numero titulo="Máximo a financiar" valor={pesos(d.flujo.maximoAFinanciar)} alerta={d.flujo.maximoAFinanciar > 0} />}
        </dl>
        {faltanCambio.length > 0 && <p role="alert" className="mt-3 text-sm font-medium text-danger">Falta el tipo de cambio de {faltanCambio.join(", ")}: esos importes están valiendo cero.</p>}
      </section>

      <section className={tarjeta} aria-label="Cashflow del evento">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-strong">Cashflow del evento</h2>
          <nav aria-label="Filtrar cashflow" className="flex flex-wrap gap-1">
            {FILTROS_CASHFLOW.map((f) => (
              <Link key={f.id} scroll={false} href={`?tab=finanzas&filtro=${f.id}`} aria-current={f.id === activo ? "true" : undefined} className={cn("flex min-h-11 items-center rounded-lg px-3 text-sm font-medium", f.id === activo ? "bg-accent text-on-accent" : "border border-line text-strong")}>{f.label}</Link>
            ))}
          </nav>
        </div>
        {lineas.length === 0 ? (
          <p className="mb-3 text-sm text-muted">Sin movimientos. Los cobros y pagos se generan solos cuando el proyecto está confirmado y la ficha tiene fecha de evento.</p>
        ) : (
          <div className="mb-3 overflow-x-auto">
            <table className="w-full min-w-[920px] text-sm">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th className="py-1 pr-2 font-medium">Fecha</th>
                  <th className="pr-2 font-medium">Concepto</th>
                  <th className="pr-2 font-medium">Contraparte</th>
                  <th className="pr-2 text-right font-medium">Original</th>
                  <th className="pr-2 text-right font-medium">Importe $</th>
                  <th className="pr-2 text-right font-medium">Saldo</th>
                  <th className="pr-2 font-medium">Estado</th>
                  <th aria-label="Acción" />
                </tr>
              </thead>
              <tbody>
                {lineas.map(({ cuota: c, importe, saldo }) => {
                  const estado = estadoCuota(c);
                  return (
                    <tr key={c.id} className="border-t border-line align-top">
                      <td className="py-1.5 pr-2 whitespace-nowrap">{fechaCorta(c.venceEl)}</td>
                      <td className="py-1.5 pr-2">{c.concepto}{c.auto && <span className="ml-1 text-xs text-muted">auto</span>}</td>
                      <td className="py-1.5 pr-2">{c.tipo === "COBRO" ? p.client.name : c.supplier?.name ?? "—"}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{plataEn(c.monto, c.moneda)}</td>
                      <td className={cn("py-1.5 pr-2 text-right tabular-nums", importe < 0 ? "text-danger" : "text-strong")}>{pesos(importe)}</td>
                      <td className={cn("py-1.5 pr-2 text-right font-medium tabular-nums", saldo < 0 && "text-danger")}>{pesos(saldo)}</td>
                      <td className="py-1.5 pr-2"><Badge tone={estado === "PAGADA" ? "success" : estado === "VENCIDA" ? "danger" : "neutral"}>{estado === "PAGADA" ? (c.tipo === "COBRO" ? "Cobrado" : "Pagado") : estado === "VENCIDA" ? "Vencido" : "Pendiente"}</Badge></td>
                      <td className="py-1">
                        {!c.pagadoEl && vista.editaPagos && (
                          <div className="flex flex-wrap items-center justify-end gap-1">
                            <FormAccion accion={marcarCuota} className="flex flex-wrap items-center gap-1">
                              <input type="hidden" name="id" value={c.id} />
                              <select name="medio" aria-label={`Medio de ${c.concepto}`} defaultValue="TRANSFERENCIA" className={campoEnLinea}>
                                {MEDIOS.map((m) => <option key={m} value={m}>{MEDIO_LABEL[m]}</option>)}
                              </select>
                              {cuentas.length > 0 && (
                                <select name="cuenta" aria-label={`Cuenta de ${c.concepto}`} defaultValue="" className={campoEnLinea}>
                                  <option value="">Sin cuenta</option>
                                  {cuentas.map((x) => <option key={x.id} value={x.id}>{x.nombre} ({x.moneda})</option>)}
                                </select>
                              )}
                              <SubmitButton className={buttonClasses("outline", "md")}>{c.tipo === "COBRO" ? "Marcar cobrado" : "Marcar pagado"}</SubmitButton>
                            </FormAccion>
                            {!c.auto && <BotonConConfirmacion accion={quitarMovimiento} ocultos={{ id: c.id, proyectoId: p.id }} texto="Quitar" textoConfirma="Quitar" etiqueta={`Quitar ${c.concepto}`} />}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {vista.editaPagos && (
          <div className="grid gap-3 border-t border-line pt-3">
            <details>
              <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-strong">Movimiento manual</summary>
              <FormAccion accion={crearMovimientoManual} limpiar className="grid gap-2 pt-2 sm:grid-cols-3">
                <input type="hidden" name="proyectoId" value={p.id} />
                <select name="tipo" aria-label="Tipo" defaultValue="COBRO" className={campo}>
                  <option value="COBRO">Cobro</option>
                  {vista.costos && <option value="PAGO">Pago</option>}
                </select>
                <input name="concepto" required maxLength={200} aria-label="Concepto" placeholder="Concepto" className={cn(campo, "sm:col-span-2")} />
                <input name="monto" required inputMode="decimal" aria-label="Monto" placeholder="Monto" className={campo} />
                <select name="moneda" aria-label="Moneda" defaultValue="ARS" className={campo}>{MONEDAS.map((m) => <option key={m} value={m}>{m}</option>)}</select>
                <input type="date" name="venceEl" required aria-label="Fecha" defaultValue={hoy} className={campo} />
                <select name="supplierId" aria-label="Proveedor, si es un pago" defaultValue="" className={cn(campo, "sm:col-span-2")}>
                  <option value="">Sin proveedor</option>
                  {d.proveedores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <SubmitButton className={buttonClasses("solid", "md")}>Agregar movimiento</SubmitButton>
              </FormAccion>
            </details>
            <FormAccion accion={recalcularCuotas}>
              <input type="hidden" name="proyectoId" value={p.id} />
              <SubmitButton className={buttonClasses("ghost", "md")}>Poner las cuotas al día</SubmitButton>
            </FormAccion>
          </div>
        )}
      </section>

      {vista.costos && (
        <section className={tarjeta} aria-label="Costo real">
          <h2 className="mb-1 font-semibold text-strong">Costo real</h2>
          <dl className="mb-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-5">
            <div><dt className="text-muted">Presupuestado</dt><dd className="font-medium text-strong">{d.totalesAprobada ? pesos(d.totalesAprobada.costo) : "—"}</dd></div>
            <div><dt className="text-muted">Real, sin IVA</dt><dd className="font-medium text-strong">{d.real.conGastos ? pesos(d.real.costoReal) : "—"}</dd></div>
            <div>
              <dt className="text-muted">Diferencia</dt>
              <dd className={cn("font-medium", d.real.desvio !== null && d.real.desvio > 0 ? "text-danger" : "text-strong")}>
                {d.real.desvio === null ? "—" : `${d.real.desvio > 0 ? "Gastaste " : d.real.desvio < 0 ? "Ahorraste " : ""}${pesos(Math.abs(d.real.desvio))}`}
              </dd>
            </div>
            <div><dt className="text-muted">Ganancia real</dt><dd className="font-bold text-strong">{d.real.gananciaReal === null ? "—" : `${pesos(d.real.gananciaReal)} (${porcentaje(d.real.margenReal ?? 0)})`}</dd></div>
            <div><dt className="text-muted">Por pagar</dt><dd className="font-medium text-strong">{pesos(d.real.porPagar)}</dd></div>
          </dl>
          {d.rubros.some((r) => r.real > 0) && (
            <div className="mb-3 overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead className="text-left text-xs text-muted">
                  <tr><th className="py-1 pr-2 font-medium">Rubro</th><th className="pr-2 text-right font-medium">Presupuestado</th><th className="pr-2 text-right font-medium">Real</th><th className="text-right font-medium">Diferencia</th></tr>
                </thead>
                <tbody>
                  {d.rubros.map((r) => (
                    <tr key={r.rubro} className="border-t border-line">
                      <td className="py-1 pr-2">{r.rubro}</td>
                      <td className="pr-2 text-right">{pesos(r.presupuestado)}</td>
                      <td className="pr-2 text-right">{pesos(r.real)}</td>
                      <td className={cn("text-right font-medium", r.diferencia > 0 ? "text-danger" : "text-strong")}>{r.diferencia > 0 ? "+" : r.diferencia < 0 ? "−" : ""}{pesos(Math.abs(r.diferencia))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {d.gastos.length > 0 && (
            <ul className="mb-3 grid gap-1 text-sm">
              {d.gastos.map((g) => (
                <li key={g.id} className={cn("flex flex-wrap items-center justify-between gap-2 border-t border-line py-1", g.anuladoEl && "text-muted line-through")}>
                  <span className="min-w-0">
                    {fechaCorta(g.fecha)} · {g.supplier?.name ?? "Sin proveedor"} · {g.descripcion} · <strong>{pesos(totalDelGasto(g))}</strong>
                    <span className="block text-xs text-muted">
                      {g.rubro}{g.iva > 0 && ` · neto ${pesos(g.neto)} + IVA ${pesos(g.iva)}`}{g.comprobante && ` · comp. ${g.comprobante}`}
                      {g.pagadoEl ? ` · Pagado, ${MEDIO_LABEL[g.medio as MedioPago] ?? g.medio}` : " · Por pagar"}
                    </span>
                  </span>
                  {!g.anuladoEl && vista.editaPagos && (
                    <span className="flex flex-wrap items-center gap-1">
                      {!g.pagadoEl && cargaDirecta && (
                        <form action={pagarGasto} className="flex items-center gap-1">
                          <input type="hidden" name="id" value={g.id} />
                          <select name="medio" aria-label={`Medio de pago de ${g.descripcion}`} defaultValue="TRANSFERENCIA" className={campoEnLinea}>
                            {MEDIOS.map((m) => <option key={m} value={m}>{MEDIO_LABEL[m]}</option>)}
                          </select>
                          <button type="submit" className={buttonClasses("outline", "md")} aria-label={`Pagar ${g.descripcion}`}>Pagar</button>
                        </form>
                      )}
                      <BotonConConfirmacion accion={anularGastoFicha} ocultos={{ id: g.id }} texto="Anular" textoConfirma="Sí, anular" etiqueta={`Anular gasto ${g.descripcion}`} />
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {cargaDirecta && <FormGasto proyectoId={p.id} proveedores={d.proveedores.map((s) => s.name)} rubros={d.rubros.map((r) => r.rubro)} hoy={hoy} />}
          <p className="mt-2 text-sm text-muted">Lo pagado sale por el libro de caja. El neto es lo que se compara contra el presupuesto.</p>
        </section>
      )}

      <section className={tarjeta} aria-label="Cobros">
        <h2 className="mb-1 font-semibold text-strong">Cobros</h2>
        <p className="mb-3 text-sm">
          Aprobado {pesos(d.totalAprobado)} · Cobrado {pesos(d.cobrado)} · <strong className="text-strong">{d.totalAprobado > 0 ? `Saldo ${pesos(d.saldo)}` : "Sin presupuesto aprobado"}</strong>
        </p>
        {d.pagos.length > 0 && (
          <ul className="mb-3 grid gap-1 text-sm">
            {d.pagos.map((c) => (
              <li key={c.id} className={cn("flex flex-wrap items-center justify-between gap-2 border-t border-line py-1", c.anuladoEl && "text-muted line-through")}>
                <span>{fechaCorta(c.createdAt)} · {MEDIO_LABEL[c.medio as MedioPago] ?? c.medio}{c.nota && ` · ${c.nota}`} · <strong>{pesos(c.monto)}</strong></span>
                {!c.anuladoEl && vista.editaPagos && <BotonConConfirmacion accion={anularCobroFicha} ocultos={{ id: c.id }} texto="Anular" textoConfirma="Sí, anular" etiqueta={`Anular cobro de ${pesos(c.monto)}`} />}
              </li>
            ))}
          </ul>
        )}
        {cargaDirecta && (
          <form action={registrarCobro} className="grid gap-2 sm:grid-cols-4">
            <input type="hidden" name="proyectoId" value={p.id} />
            <input name="monto" required aria-label="Monto" placeholder="Monto" inputMode="decimal" className={campo} />
            <select name="medio" aria-label="Medio de cobro" defaultValue="TRANSFERENCIA" className={campo}>
              {MEDIOS.map((m) => <option key={m} value={m}>{MEDIO_LABEL[m]}</option>)}
            </select>
            <input name="nota" aria-label="Nota del cobro" placeholder="Ej.: anticipo 50%" className={campo} />
            <SubmitButton className={buttonClasses("solid", "md")}>Registrar cobro</SubmitButton>
          </form>
        )}
        <p className="mt-2 text-sm text-muted">Cada cobro entra al libro de caja. La factura se emite desde Facturación.</p>
      </section>
    </div>
  );
}
