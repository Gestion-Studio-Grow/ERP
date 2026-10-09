import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireApp } from "@/lib/require-app";
import { buttonClasses, cn, Input, Select, Textarea } from "@/components/ui";
import { ordenCompleta } from "@/lib/taller/datos.server";
import {
  agregarItem,
  anularPago,
  cambiarEstado,
  decidirItem,
  entregar,
  guardarTrabajo,
  marcarPresupuestoEnviado,
  marcarResenaPedida,
  quitarFoto,
  quitarItem,
} from "@/lib/taller/acciones";
import {
  armarMensaje,
  dentroDe,
  ESTADOS,
  ESTADO_LABEL,
  fechaCorta,
  MEDIO_LABEL,
  pesos,
  siguienteEstado,
  type EstadoOrden,
  type MedioPago,
} from "@/lib/taller/core";
import { ChipEstado, Patente, tarjeta } from "../../_vista";
import { BotonEnviar, CopiarLink, EnviarWhatsApp, SubirFotos } from "../../_piezas";
import CobroForm from "./CobroForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Taller · Orden" };

const NIVEL = ["Reserva", "", "1/4", "", "1/2", "", "3/4", "", "Lleno"];
const h2 = "mb-3 text-lg font-bold text-strong";
const etiqueta = "mb-1 block text-sm font-semibold text-strong";

export default async function OrdenPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ nuevo?: string }> }) {
  await requireApp("taller");
  const [{ id }, { nuevo }] = await Promise.all([params, searchParams]);
  const data = await ordenCompleta(id);
  if (!data) notFound();
  const { orden, config, negocio, mecanicos, repuestos, totales: t, pagado, saldo, conPlata, user } = data;

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const base = `${host.startsWith("localhost") || host.endsWith(".localhost") || host.includes("localhost:") ? "http" : "https"}://${host}`;
  const link = `${base}/seguimiento/${orden.token}`;
  const estado = orden.estado as EstadoOrden;
  const entregado = estado === "ENTREGADO";
  const sig = siguienteEstado(estado);
  const vehiculo = `${orden.vehiculo.marca} ${orden.vehiculo.modelo}`.trim() || "auto";
  const vars = {
    nombre: orden.client.name.split(" ")[0],
    vehiculo,
    patente: orden.vehiculo.patente,
    taller: negocio.nombre,
    direccion: negocio.direccion,
    horario: negocio.horario,
    link,
    total: pesos(t.presupuestado),
    saldo: pesos(Math.max(0, saldo)),
    validez: fechaCorta(orden.presupuestoValidoHasta ?? dentroDe(config.validezDias)),
    garantia: fechaCorta(orden.garantiaHasta),
    resena: config.linkResena,
    alias: config.aliasCbu,
    turnos: `${base}/reserva`,
  };
  const msg = (k: keyof typeof config.plantillas) => armarMensaje(config.plantillas[k], vars);
  const tel = orden.client.phone;

  return (
    <main className="mx-auto grid grid-cols-1 w-full max-w-3xl gap-4 px-4 py-5">
      <Link href="/admin/taller" className="text-sm underline">← Volver al taller</Link>

      <header className={cn(tarjeta, "grid grid-cols-1 gap-3")}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Patente valor={orden.vehiculo.patente} grande />
          <ChipEstado estado={estado} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-strong">{vehiculo}{orden.vehiculo.anio ? ` (${orden.vehiculo.anio})` : ""}</h1>
          <p className="text-sm text-muted">
            Orden #{orden.numero} · ingresó el {fechaCorta(orden.createdAt)}
            {orden.km != null && ` · ${orden.km.toLocaleString("es-AR")} km`}
            {orden.combustible != null && NIVEL[orden.combustible] && ` · tanque ${NIVEL[orden.combustible]}`}
          </p>
        </div>
        <p className="text-sm">
          <Link href={`/admin/taller/vehiculos/${orden.vehiculoId}`} className="font-semibold text-strong underline">{orden.client.name}</Link>
          <span className="text-muted"> · {tel}</span>
        </p>
        {orden.problema && <p className="rounded-xl bg-surface-sunken p-3 text-sm"><span className="font-semibold text-strong">Lo que contó el cliente: </span>{orden.problema}</p>}

        {nuevo && conPlata && (
          <div className="grid grid-cols-1 gap-2 rounded-xl border border-line p-3" style={{ background: "var(--success-soft)" }}>
            <p className="text-sm font-semibold text-strong">✓ Auto ingresado. Avisale al cliente y pasale su link de seguimiento:</p>
            <EnviarWhatsApp telefono={tel} texto={msg("recibido")} etiqueta="Avisar por WhatsApp" />
          </div>
        )}
      </header>

      {/* ── Estado ── */}
      {!entregado && (
        <section className={tarjeta} aria-label="Estado del auto">
          <h2 className={h2}>¿En qué está?</h2>
          <div className="grid grid-cols-1 gap-2">
            {sig && sig !== "ENTREGADO" && (
              <form action={cambiarEstado}>
                <input type="hidden" name="id" value={orden.id} />
                <input type="hidden" name="estado" value={sig} />
                <BotonEnviar pendingText="Guardando…" variant="solid" size="lg" className="h-14 w-full justify-center text-base">
                  Pasar a: {ESTADO_LABEL[sig]} →
                </BotonEnviar>
              </form>
            )}
            <form action={cambiarEstado} className="flex gap-2">
              <input type="hidden" name="id" value={orden.id} />
              <Select name="estado" defaultValue={estado} aria-label="Cambiar a otro estado" className="h-12 flex-1">
                {ESTADOS.filter((e) => e !== "ENTREGADO").map((e) => <option key={e} value={e}>{ESTADO_LABEL[e]}</option>)}
              </Select>
              <BotonEnviar pendingText="…" variant="outline" size="lg">Cambiar</BotonEnviar>
            </form>
            {estado === "LISTO" && conPlata && <EnviarWhatsApp telefono={tel} texto={msg("listo")} etiqueta="Avisar que está listo" variante="outline" />}
          </div>
        </section>
      )}

      {/* ── Trabajo ── */}
      <section className={tarjeta} aria-label="Diagnóstico y trabajo">
        <h2 className={h2}>Diagnóstico y trabajo</h2>
        <form action={guardarTrabajo} className="grid grid-cols-1 gap-3">
          <input type="hidden" name="id" value={orden.id} />
          <div>
            <label htmlFor="diagnostico" className={etiqueta}>Qué encontramos</label>
            <Textarea id="diagnostico" name="diagnostico" rows={3} defaultValue={orden.diagnostico ?? ""} disabled={entregado} placeholder="Pastillas delanteras gastadas, disco rayado…" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="mecanicoUserId" className={etiqueta}>Mecánico</label>
              <Select id="mecanicoUserId" name="mecanicoUserId" defaultValue={orden.mecanicoUserId ?? ""} disabled={entregado || user.role === "PROFESSIONAL"} className="h-12">
                <option value="">Sin asignar</option>
                {mecanicos.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </Select>
            </div>
            <div>
              <label htmlFor="horas" className={etiqueta}>Horas trabajadas</label>
              <Input id="horas" name="horas" inputMode="decimal" defaultValue={orden.horas ? String(orden.horas).replace(".", ",") : ""} disabled={entregado} placeholder="0" className="h-12" />
            </div>
          </div>
          {!entregado && <BotonEnviar pendingText="Guardando…" variant="outline" size="lg" className="justify-center">Guardar</BotonEnviar>}
        </form>
      </section>

      {/* ── Presupuesto ── */}
      <section className={tarjeta} aria-label="Presupuesto">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-strong">Presupuesto</h2>
          {orden.presupuestoEnviadoEl && (
            <span className="text-xs text-muted">
              Enviado el {fechaCorta(orden.presupuestoEnviadoEl)} · vale hasta el {fechaCorta(orden.presupuestoValidoHasta)}
            </span>
          )}
        </div>

        {orden.items.length === 0 ? (
          <p className="mb-3 text-sm text-muted">Todavía no hay ítems. {conPlata ? "Agregá la mano de obra y los repuestos acá abajo." : "Lo carga el dueño o la administración."}</p>
        ) : (
          <ul className="mb-3 grid grid-cols-1 gap-2">
            {orden.items.map((i) => (
              <li key={i.id} className="rounded-xl border border-line p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className={cn("font-medium text-strong", i.decision === "RECHAZADO" && "line-through opacity-60")}>{i.descripcion}</p>
                    <p className="text-xs text-muted">
                      {i.tipo === "MANO_OBRA" ? "Mano de obra" : "Repuesto"}
                      {i.cantidad !== 1 && ` · ${String(i.cantidad).replace(".", ",")} ×`}
                      {conPlata && i.cantidad !== 1 && !i.traidoPorCliente && ` ${pesos(i.precio)}`}
                      {" · "}
                      <span className="font-semibold">{i.decision === "APROBADO" ? "✓ Aprobado" : i.decision === "RECHAZADO" ? "✕ Rechazado" : "Sin responder"}</span>
                    </p>
                  </div>
                  {conPlata && <p className="shrink-0 font-semibold tabular-nums text-strong">{i.traidoPorCliente ? "—" : pesos(i.cantidad * i.precio)}</p>}
                </div>
                {conPlata && !entregado && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(["APROBADO", "RECHAZADO"] as const).filter((d) => d !== i.decision).map((d) => (
                      <form key={d} action={decidirItem}>
                        <input type="hidden" name="id" value={i.id} />
                        <input type="hidden" name="decision" value={d} />
                        <button className={buttonClasses("outline", "sm")}>{d === "APROBADO" ? "Aprobó" : "Rechazó"}</button>
                      </form>
                    ))}
                    <form action={quitarItem} className="ml-auto">
                      <input type="hidden" name="id" value={i.id} />
                      <button className={buttonClasses("ghost", "sm")} aria-label={`Quitar ${i.descripcion}`}>Quitar</button>
                    </form>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {conPlata && orden.items.length > 0 && (
          <dl className="mb-4 grid grid-cols-1 gap-1 rounded-xl bg-surface-sunken p-3 text-sm tabular-nums">
            <div className="flex justify-between"><dt>Mano de obra</dt><dd>{pesos(t.manoDeObra)}</dd></div>
            <div className="flex justify-between"><dt>Repuestos</dt><dd>{pesos(t.repuestos)}</dd></div>
            <div className="flex justify-between text-base font-bold text-strong"><dt>Presupuestado</dt><dd>{pesos(t.presupuestado)}</dd></div>
            <div className="flex justify-between"><dt>Aprobado por el cliente</dt><dd>{pesos(t.aprobado)}</dd></div>
          </dl>
        )}

        {conPlata && !entregado && (
          <div className="grid grid-cols-1 gap-2">
            <details className="rounded-xl border border-line" open={orden.items.length === 0}>
              <summary className="flex min-h-12 cursor-pointer items-center px-3 font-semibold text-strong">+ Mano de obra</summary>
              <form action={agregarItem} className="grid grid-cols-1 gap-3 p-3 pt-0">
                <input type="hidden" name="ordenId" value={orden.id} />
                <input type="hidden" name="tipo" value="MANO_OBRA" />
                <div>
                  <label htmlFor="mo-desc" className={etiqueta}>Trabajo</label>
                  <Input id="mo-desc" name="descripcion" required placeholder="Cambio de pastillas delanteras" className="h-12" />
                </div>
                <div>
                  <label htmlFor="mo-precio" className={etiqueta}>Precio</label>
                  <Input id="mo-precio" name="precio" inputMode="decimal" required placeholder="45000" className="h-12" />
                </div>
                <BotonEnviar pendingText="Agregando…" variant="solid" size="lg" className="justify-center">Agregar</BotonEnviar>
              </form>
            </details>

            <details className="rounded-xl border border-line">
              <summary className="flex min-h-12 cursor-pointer items-center px-3 font-semibold text-strong">+ Repuesto</summary>
              <form action={agregarItem} className="grid grid-cols-1 gap-3 p-3 pt-0">
                <input type="hidden" name="ordenId" value={orden.id} />
                <input type="hidden" name="tipo" value="REPUESTO" />
                {repuestos.length > 0 && (
                  <div>
                    <label htmlFor="rep-prod" className={etiqueta}>Del catálogo <span className="font-normal text-muted">(opcional)</span></label>
                    <Select id="rep-prod" name="productId" defaultValue="" className="h-12">
                      <option value="">— Escribirlo a mano —</option>
                      {repuestos.map((p) => <option key={p.id} value={p.id}>{p.name}{p.price ? ` · ${pesos(p.price)}` : ""}</option>)}
                    </Select>
                  </div>
                )}
                <div>
                  <label htmlFor="rep-desc" className={etiqueta}>Repuesto</label>
                  <Input id="rep-desc" name="descripcion" placeholder="Juego de pastillas Ferodo" className="h-12" />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label htmlFor="rep-cant" className={etiqueta}>Cant.</label>
                    <Input id="rep-cant" name="cantidad" inputMode="decimal" defaultValue="1" className="h-12" />
                  </div>
                  <div>
                    <label htmlFor="rep-costo" className={etiqueta}>Costo</label>
                    <Input id="rep-costo" name="costo" inputMode="decimal" placeholder="0" className="h-12" />
                  </div>
                  <div>
                    <label htmlFor="rep-precio" className={etiqueta}>Precio</label>
                    <Input id="rep-precio" name="precio" inputMode="decimal" placeholder="auto" className="h-12" />
                  </div>
                </div>
                <p className="text-xs text-muted">Si dejás el precio vacío, se calcula solo: costo + {String(config.margenPct).replace(".", ",")} % de margen.</p>
                <label className="flex min-h-11 items-center gap-2 text-sm">
                  <input type="checkbox" name="traidoPorCliente" className="size-5" /> Lo trae el cliente (no se cobra)
                </label>
                <BotonEnviar pendingText="Agregando…" variant="solid" size="lg" className="justify-center">Agregar</BotonEnviar>
              </form>
            </details>

            {orden.items.length > 0 && (
              <div className="mt-2 grid grid-cols-1 gap-2">
                <EnviarWhatsApp telefono={tel} texto={msg("presupuesto")} etiqueta="Enviar presupuesto por WhatsApp" alEnviar={marcarPresupuestoEnviado.bind(null, orden.id)} />
                <div className="flex flex-wrap gap-2">
                  <CopiarLink url={link} etiqueta="Copiar link del cliente" />
                  <Link href={`/admin/taller/orden/${orden.id}/imprimir?doc=presupuesto`} className={buttonClasses("outline", "md")}>PDF del presupuesto</Link>
                  <Link href={`/admin/taller/orden/${orden.id}/imprimir?doc=orden`} className={buttonClasses("outline", "md")}>PDF de la orden</Link>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Fotos ── */}
      <section className={tarjeta} aria-label="Fotos">
        <h2 className={h2}>Fotos</h2>
        {orden.fotos.length > 0 && (
          <ul className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {orden.fotos.map((f) => (
              <li key={f.id} className="relative">
                <a href={f.datos} target="_blank" rel="noopener noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.datos} alt={`Foto de ${f.momento === "INGRESO" ? "cómo llegó" : f.momento === "ENTREGA" ? "la entrega" : "el trabajo"}`} className="aspect-square w-full rounded-xl border border-line object-cover" />
                </a>
                <span className="absolute bottom-1 left-1 rounded bg-surface-inverted px-1.5 py-0.5 text-[10px] font-semibold text-on-accent">
                  {f.momento === "INGRESO" ? "Ingreso" : f.momento === "ENTREGA" ? "Entrega" : "Trabajo"}
                </span>
                {conPlata && (
                  <form action={quitarFoto} className="absolute right-1 top-1">
                    <input type="hidden" name="id" value={f.id} />
                    <button aria-label="Quitar foto" className="grid size-8 place-items-center rounded-full bg-surface-inverted text-xs text-on-accent">✕</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
        <SubirFotos ordenId={orden.id} momento={estado === "RECIBIDO" ? "INGRESO" : entregado || estado === "LISTO" ? "ENTREGA" : "TRABAJO"} etiqueta={orden.fotos.length ? "Sacar otra foto" : "Sacar foto"} />
        {orden.firmaIngreso && (
          <div className="mt-3">
            <p className="text-sm text-muted">Firma de conformidad de {orden.firmaNombre}:</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={orden.firmaIngreso} alt={`Firma de ${orden.firmaNombre}`} className="mt-1 h-20 rounded-lg border border-line bg-white" />
          </div>
        )}
      </section>

      {/* ── Cobro ── */}
      {conPlata && (
        <section className={tarjeta} aria-label="Cobro">
          <h2 className={h2}>Cobro</h2>
          <dl className="mb-3 grid grid-cols-1 gap-1 text-sm tabular-nums">
            <div className="flex justify-between"><dt>Total aprobado</dt><dd>{pesos(t.aprobado)}</dd></div>
            <div className="flex justify-between"><dt>Cobrado</dt><dd>{pesos(pagado)}</dd></div>
            <div className="flex justify-between text-lg font-bold text-strong"><dt>{saldo < -0.5 ? "A favor del cliente" : "Falta cobrar"}</dt><dd>{pesos(Math.abs(saldo))}</dd></div>
          </dl>
          {orden.pagos.length > 0 && (
            <ul className="mb-3 grid grid-cols-1 gap-1.5 text-sm">
              {orden.pagos.map((p) => (
                <li key={p.id} className={cn("flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2", p.anuladoEl && "opacity-60")}>
                  <span className={p.anuladoEl ? "line-through" : undefined}>
                    {fechaCorta(p.createdAt)} · {MEDIO_LABEL[p.medio as MedioPago] ?? p.medio}
                    {p.cuotas > 1 && ` en ${p.cuotas} cuotas`}
                    {p.recargo > 0 && <span className="text-muted"> (+{pesos(p.recargo)} de recargo)</span>}
                    {p.nota && <span className="text-muted"> · {p.nota}</span>}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="font-semibold tabular-nums text-strong">{pesos(p.monto)}</span>
                    {p.anuladoEl ? (
                      <span className="text-xs font-semibold">Anulado</span>
                    ) : (
                      <form action={anularPago}>
                        <input type="hidden" name="id" value={p.id} />
                        <button className="h-11 px-2 text-xs underline" aria-label="Anular este cobro">Anular</button>
                      </form>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <CobroForm key={`${saldo}-${orden.pagos.length}-${orden.pagos.filter((p) => p.anuladoEl).length}`} ordenId={orden.id} saldo={Math.max(0, saldo)} recargos={config.recargos} alias={config.aliasCbu} linkMp={config.linkMercadoPago} sinAprobados={t.aprobado === 0} />
          {saldo > 0.5 && entregado && <div className="mt-3"><EnviarWhatsApp telefono={tel} texto={msg("deuda")} etiqueta="Recordarle el saldo" variante="outline" chico /></div>}
        </section>
      )}

      {/* ── Entrega ── */}
      {conPlata && !entregado && (
        <section className={tarjeta} aria-label="Entrega">
          <h2 className={h2}>Entregar el auto</h2>
          <form action={entregar} className="grid grid-cols-1 gap-3">
            <input type="hidden" name="id" value={orden.id} />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="garantiaDias" className={etiqueta}>Garantía (días)</label>
                <Input id="garantiaDias" name="garantiaDias" inputMode="numeric" defaultValue={config.garantiaDias} className="h-12" />
              </div>
              <div>
                <label htmlFor="proximoServiceKm" className={etiqueta}>Próximo service (km)</label>
                <Input id="proximoServiceKm" name="proximoServiceKm" inputMode="numeric" placeholder={orden.km ? String(orden.km + 10000) : "95000"} className="h-12" />
              </div>
            </div>
            <div>
              <label htmlFor="proximoServiceFecha" className={etiqueta}>…o por fecha</label>
              <Input id="proximoServiceFecha" name="proximoServiceFecha" type="date" className="h-12" />
            </div>
            <div>
              <label htmlFor="garantiaDetalle" className={etiqueta}>Qué cubre la garantía <span className="font-normal text-muted">(opcional)</span></label>
              <Input id="garantiaDetalle" name="garantiaDetalle" placeholder="Mano de obra y repuestos colocados" className="h-12" />
            </div>
            {saldo > 0.5 && (
              orden.client.tallerCtaCte ? (
                <p className="rounded-xl border border-line p-3 text-sm" style={{ background: "var(--info-soft)" }}>
                  Tiene cuenta corriente: se lleva el auto y quedan {pesos(saldo)} a cobrar.
                </p>
              ) : (
                <label className="flex min-h-11 items-start gap-2 rounded-xl border border-line p-3 text-sm" style={{ background: "var(--warning-soft)" }}>
                  <input type="checkbox" name="entregarConSaldo" required className="mt-0.5 size-5" />
                  <span>Faltan cobrar <strong>{pesos(saldo)}</strong>. Lo entrego igual y queda debiendo.</span>
                </label>
              )
            )}
            <BotonEnviar pendingText="Entregando…" variant="solid" size="lg" className="h-14 justify-center text-base">Entregar auto</BotonEnviar>
          </form>
        </section>
      )}

      {entregado && (
        <section className={tarjeta} aria-label="Después de la entrega">
          <h2 className={h2}>Entregado el {fechaCorta(orden.entregadoEl)}</h2>
          <p className="mb-3 text-sm">
            {orden.garantiaHasta ? <>Garantía hasta el <strong>{fechaCorta(orden.garantiaHasta)}</strong>{orden.garantiaDetalle && ` — ${orden.garantiaDetalle}`}.</> : "Sin garantía cargada."}
          </p>
          {conPlata && (
            <div className="grid grid-cols-1 gap-2">
              <EnviarWhatsApp
                telefono={tel}
                texto={msg("entregado")}
                etiqueta={orden.resenaPedidaEl ? "Volver a pedir la reseña" : "Agradecer y pedir reseña en Google"}
                alEnviar={marcarResenaPedida.bind(null, orden.id)}
                variante={orden.resenaPedidaEl ? "outline" : "solid"}
              />
              {!config.linkResena && <p className="text-xs text-muted">Todavía no cargaste el link de reseñas de Google: <Link href="/admin/taller/config" className="underline">cargalo en Configuración</Link>.</p>}
              <div className="flex flex-wrap gap-2">
                <Link href={`/admin/taller/orden/${orden.id}/imprimir?doc=comprobante`} className={buttonClasses("outline", "md")}>Comprobante (PDF)</Link>
                <EnviarWhatsApp telefono={tel} texto={msg("referido")} etiqueta="Invitarlo a recomendar" variante="outline" chico />
              </div>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
