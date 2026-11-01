import Link from "next/link";
import { notFound } from "next/navigation";
import { requireApp } from "@/lib/require-app";
import { Badge, buttonClasses, cn } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import { fichaProyecto } from "@/lib/proyectos/datos.server";
import {
  agregarItem,
  agregarTarea,
  alternarTarea,
  alternarVisibleArchivo,
  anularCobro,
  anularGasto,
  borrarArchivo,
  borrarItem,
  crearEntregable,
  enviarPropuesta,
  guardarDatosProyecto,
  guardarTextosPresupuesto,
  moverEtapa,
  nuevaVersionPresupuesto,
  pagarGasto,
  registrarCobro,
} from "@/lib/proyectos/acciones";
import {
  ayudaEspecificacion,
  ESTADO_ENTREGABLE_LABEL,
  ESTADO_PRESUPUESTO_LABEL,
  estadoDelEntregable,
  etapaLabel,
  etapaSiguiente,
  etapasDe,
  fechaCorta,
  fechaParaInput,
  MEDIOS,
  MEDIO_LABEL,
  pesos,
  porcentaje,
  porRubro,
  resumenEntregables,
  SERVICIO_LABEL,
  sePuedeEditar,
  totalDelGasto,
  totales,
  ultimaEnviada,
  waLink,
  yaVencio,
  type MedioPago,
  type Servicio,
} from "@/lib/proyectos/core";
import { campo, etiqueta, tarjeta } from "../_vista";
import { BotonNuevoStand, CopiarLink, SubirArchivo } from "./_piezas";
import { FormGasto } from "./_gastos";

export const dynamic = "force-dynamic";
export const metadata = { title: "Proyecto" };

const areaTexto = "w-full rounded-lg border border-line bg-surface p-3 text-sm text-strong";

export default async function FichaProyecto({ params }: { params: Promise<{ id: string }> }) {
  await requireApp("proyectos");
  const { id } = await params;
  const data = await fichaProyecto(id);
  if (!data) notFound();
  const { proyecto: p, conPlata, cobrado, saldo, totalAprobado, negocio, totalesVigente, real, rubros, proveedores } = data;
  const etapas = etapasDe(p.servicio);
  const actual = etapas.indexOf(p.etapa as (typeof etapas)[number]);
  const siguiente = etapaSiguiente(p.servicio, p.etapa);
  const borrador = p.presupuestos.find((b) => sePuedeEditar(b.estado));
  const piezas = resumenEntregables(p.entregables);
  const waPiezas = waLink(p.client.phone, `Hola ${p.client.name}! Te compartimos las piezas de ${negocio.nombre} para "${p.nombre}", para que las revises:`);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-5">
      <Link href="/admin/proyectos" className="text-sm underline">← Proyectos</Link>
      <header className="mb-4 mt-2">
        <p className="text-sm text-muted">#{p.numero} · {SERVICIO_LABEL[p.servicio as Servicio] ?? p.servicio} · {p.client.name}</p>
        <h1 className="text-2xl font-bold text-strong">{p.nombre}</h1>
      </header>

      <section className={cn(tarjeta, "mb-4")} aria-label="Etapa">
        <ol className="mb-3 flex flex-wrap gap-1.5">
          {etapas.map((e, i) => (
            <li key={e} aria-current={i === actual ? "step" : undefined} className={cn("rounded-full px-3 py-1 text-xs font-medium", i === actual ? "bg-accent text-on-accent" : i < actual ? "bg-surface text-strong" : "border border-line text-muted")}>
              {etapaLabel(e, p.servicio)}
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap items-end gap-2">
          {siguiente && (
            <form action={moverEtapa}>
              <input type="hidden" name="id" value={p.id} />
              <input type="hidden" name="etapa" value={siguiente} />
              <SubmitButton className={buttonClasses("solid", "md")}>Pasar a {etapaLabel(siguiente, p.servicio)}</SubmitButton>
            </form>
          )}
          <form action={moverEtapa} className="flex items-end gap-2">
            <input type="hidden" name="id" value={p.id} />
            <label className="grid gap-1 text-sm">
              Corregir etapa
              <select name="etapa" defaultValue={p.etapa} className={campo}>
                {etapas.map((e) => <option key={e} value={e}>{etapaLabel(e, p.servicio)}</option>)}
              </select>
            </label>
            <SubmitButton className={buttonClasses("outline", "md")}>Cambiar</SubmitButton>
          </form>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className={tarjeta} aria-label="Datos del proyecto">
          <h2 className="mb-3 font-semibold text-strong">Datos y pedido del cliente</h2>
          <form action={guardarDatosProyecto} className="grid gap-3">
            <input type="hidden" name="id" value={p.id} />
            <label className={etiqueta}>Nombre<input name="nombre" required defaultValue={p.nombre} className={campo} /></label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={etiqueta}>Evento o feria<input name="evento" defaultValue={p.evento ?? ""} className={campo} /></label>
              <label className={etiqueta}>Lugar<input name="lugar" defaultValue={p.lugar ?? ""} className={campo} /></label>
            </div>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
              <label className={etiqueta}>Armado<input type="date" name="fechaArmado" defaultValue={fechaParaInput(p.fechaArmado)} className={campo} /></label>
              <label className={etiqueta}>Evento<input type="date" name="fechaEvento" defaultValue={fechaParaInput(p.fechaEvento)} className={campo} /></label>
              <label className={etiqueta}>Desarme<input type="date" name="fechaDesarme" defaultValue={fechaParaInput(p.fechaDesarme)} className={campo} /></label>
            </div>
            <label className={etiqueta}>Responsable<input name="responsable" defaultValue={p.responsable ?? ""} className={campo} /></label>
            <label className={etiqueta}>Qué pidió el cliente<textarea name="brief" rows={4} defaultValue={p.brief} className={areaTexto} /></label>
            <SubmitButton className={buttonClasses("outline", "md")}>Guardar datos</SubmitButton>
          </form>
        </section>

        <section className={tarjeta} aria-label="Tareas">
          <h2 className="mb-3 font-semibold text-strong">Tareas</h2>
          {p.tareas.length === 0 && <p className="mb-3 text-sm text-muted">Sin tareas todavía.</p>}
          <ul className="mb-3 grid gap-1">
            {p.tareas.map((t) => (
              <li key={t.id}>
                <form action={alternarTarea} className="flex items-center gap-2">
                  <input type="hidden" name="id" value={t.id} />
                  <button type="submit" aria-label={t.hechaEl ? `Reabrir ${t.titulo}` : `Marcar hecha ${t.titulo}`} className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-line text-strong">{t.hechaEl ? "✓" : ""}</button>
                  <span className={cn("min-w-0 flex-1 text-sm", t.hechaEl && "text-muted line-through")}>
                    {t.titulo}
                    {(t.responsable || t.venceEl) && <span className="block text-xs text-muted">{[t.responsable, t.venceEl && `vence ${fechaCorta(t.venceEl)}`].filter(Boolean).join(" · ")}</span>}
                  </span>
                </form>
              </li>
            ))}
          </ul>
          <form action={agregarTarea} className="grid gap-2 border-t border-line pt-3">
            <input type="hidden" name="proyectoId" value={p.id} />
            <input name="titulo" required aria-label="Nueva tarea" placeholder="Nueva tarea" className={campo} />
            <div className="grid grid-cols-2 gap-2">
              <input name="responsable" aria-label="Responsable de la tarea" placeholder="Responsable" className={campo} />
              <input type="date" name="venceEl" aria-label="Vencimiento de la tarea" className={campo} />
            </div>
            <SubmitButton className={buttonClasses("outline", "md")}>Agregar tarea</SubmitButton>
          </form>
        </section>

        <section className={tarjeta} aria-label="Stands en 3D">
          <h2 className="mb-3 font-semibold text-strong">Stands en 3D</h2>
          {p.stands.length === 0 && <p className="mb-3 text-sm text-muted">Todavía no hay opciones armadas.</p>}
          <ul className="mb-3 grid gap-2">
            {p.stands.map((s) => (
              <li key={s.id}>
                <Link href={`/admin/proyectos/${p.id}/stand/${s.id}`} className="flex min-h-11 items-center justify-between rounded-lg border border-line px-3 text-sm font-medium text-strong hover:border-accent">
                  {s.nombre}<span className="text-xs font-normal text-muted">Abrir</span>
                </Link>
              </li>
            ))}
          </ul>
          <BotonNuevoStand proyectoId={p.id} />
        </section>

        <section className={tarjeta} aria-label="Archivos">
          <h2 className="mb-3 font-semibold text-strong">Renders, diseños y planos</h2>
          {p.archivos.length > 0 && (
            <ul className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {p.archivos.map((a) => (
                <li key={a.id} className="overflow-hidden rounded-lg border border-line">
                  {a.datos ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.datos} alt={a.nombre} loading="lazy" className="aspect-video w-full object-cover" />
                  ) : (
                    <a href={a.url ?? "#"} target="_blank" rel="noopener noreferrer" className="flex aspect-video items-center justify-center p-3 text-center text-sm underline">Abrir link</a>
                  )}
                  <div className="p-2">
                    <p className="truncate text-sm font-medium text-strong" title={a.nombre}>{a.nombre}</p>
                    <div className="mt-1 flex gap-1">
                      {a.datos && (
                        <form action={alternarVisibleArchivo}>
                          <input type="hidden" name="id" value={a.id} />
                          <button type="submit" className={buttonClasses("ghost", "md")}>{a.visibleCliente ? "Sacar de propuesta" : "Sumar a propuesta"}</button>
                        </form>
                      )}
                      <form action={borrarArchivo}>
                        <input type="hidden" name="id" value={a.id} />
                        <button type="submit" className={buttonClasses("ghost", "md")} aria-label={`Borrar ${a.nombre}`}>Borrar</button>
                      </form>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <SubirArchivo proyectoId={p.id} />
        </section>
      </div>

      <section className={cn(tarjeta, "mt-4")} aria-label="Piezas para aprobar">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold text-strong">Piezas para aprobar</h2>
            {piezas.total > 0 && <p className="text-sm text-muted">{piezas.aprobados} de {piezas.total} aprobadas{piezas.esperando > 0 && ` · ${piezas.esperando} esperando al cliente`}{piezas.paraCorregir > 0 && ` · ${piezas.paraCorregir} para corregir`}</p>}
          </div>
          {p.tokenEntregables && (
            <div className="flex flex-wrap gap-2">
              <a href={`/entregables/${p.tokenEntregables}`} target="_blank" rel="noopener noreferrer" className={buttonClasses("outline", "md")}>Ver como el cliente</a>
              <CopiarLink ruta={`/entregables/${p.tokenEntregables}`} />
              {waPiezas && <a href={waPiezas} target="_blank" rel="noopener noreferrer" className={buttonClasses("outline", "md")}>Abrir WhatsApp</a>}
            </div>
          )}
        </div>
        {p.entregables.length === 0 && <p className="mb-3 text-sm text-muted">Cargá cada pieza que el cliente tiene que aprobar: una gráfica, una escenografía, un video.</p>}
        {p.entregables.length > 0 && (
          <ul className="mb-3 grid gap-2">
            {p.entregables.map((e) => {
              const estado = estadoDelEntregable(e.versiones);
              const respuesta = estado === "CAMBIOS" ? ultimaEnviada(e.versiones) : null;
              return (
                <li key={e.id}>
                  <Link href={`/admin/proyectos/${p.id}/entregable/${e.id}`} className="block min-h-11 rounded-lg border border-line px-3 py-2 text-sm hover:border-accent">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-strong">{e.nombre}</span>
                      <Badge tone={estado === "APROBADO" ? "success" : estado === "CAMBIOS" ? "danger" : "neutral"}>{ESTADO_ENTREGABLE_LABEL[estado]}</Badge>
                      {e.versiones.length > 0 && <span className="text-xs text-muted">Versión {e.versiones[0].numero}</span>}
                      {e.venceEl && <span className={cn("text-xs", estado !== "APROBADO" && yaVencio(e.venceEl) ? "font-medium text-danger" : "text-muted")}>Para el {fechaCorta(e.venceEl)}</span>}
                    </span>
                    {e.especificacion && <span className="mt-0.5 block text-xs text-muted">{e.especificacion}</span>}
                    {respuesta?.comentario && <span className="mt-1 block">{respuesta.respondidoPor}: «{respuesta.comentario}»</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        <form action={crearEntregable} className="grid gap-2 border-t border-line pt-3 sm:grid-cols-[2fr_2fr_1fr_auto]">
          <input type="hidden" name="proyectoId" value={p.id} />
          <input name="nombre" required maxLength={120} aria-label="Nombre de la pieza" placeholder="Pieza" className={campo} />
          <input name="especificacion" maxLength={300} aria-label="Especificación de la pieza" placeholder={ayudaEspecificacion(p.servicio)} className={campo} />
          <input type="date" name="venceEl" aria-label="Para cuándo" className={campo} />
          <SubmitButton className={buttonClasses("outline", "md")}>Agregar pieza</SubmitButton>
        </form>
      </section>

      {conPlata && (
        <>
          <section className={cn(tarjeta, "mt-4")} aria-label="Presupuesto y propuesta">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold text-strong">Presupuesto y propuesta</h2>
              {!borrador && (
                <form action={nuevaVersionPresupuesto}>
                  <input type="hidden" name="proyectoId" value={p.id} />
                  <SubmitButton className={buttonClasses(p.presupuestos.length ? "outline" : "solid", "md")}>{p.presupuestos.length ? "Abrir nueva versión" : "Empezar presupuesto"}</SubmitButton>
                </form>
              )}
            </div>
            {p.presupuestos.length === 0 && <p className="text-sm text-muted">Empezá el presupuesto acá, o armá un stand y pasá su cómputo.</p>}
            <div className="grid grid-cols-1 gap-4">
              {p.presupuestos.map((b) => {
                const t = totales(b.items, b.ivaPct);
                const editable = sePuedeEditar(b.estado);
                const ruta = `/propuesta/${b.token}`;
                const wa = waLink(p.client.phone, `Hola ${p.client.name}! Te compartimos la propuesta de ${negocio.nombre} para "${p.nombre}":`);
                return (
                  <article key={b.id} className="min-w-0 rounded-xl border border-line p-3" aria-label={`Versión ${b.version}`}>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-strong">Versión {b.version}</h3>
                      <Badge tone={b.estado === "APROBADO" ? "success" : b.estado === "RECHAZADO" ? "danger" : "neutral"}>{ESTADO_PRESUPUESTO_LABEL[b.estado] ?? b.estado}</Badge>
                      {b.validoHasta && b.estado === "ENVIADO" && <span className="text-sm text-muted">vale hasta {fechaCorta(b.validoHasta)}</span>}
                      {b.respondidoPor && <span className="text-sm text-muted">respondió {b.respondidoPor} el {fechaCorta(b.respondidoEl)}</span>}
                    </div>
                    {b.motivoRechazo && <p className="mb-2 text-sm">Motivo: {b.motivoRechazo}</p>}

                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[620px] text-sm">
                        <thead className="text-left text-xs text-muted">
                          <tr><th className="py-1 pr-2 font-medium">Detalle</th><th className="pr-2 font-medium">Cant.</th><th className="pr-2 text-right font-medium">Costo u.</th><th className="pr-2 text-right font-medium">Precio u.</th><th className="pr-2 text-right font-medium">Subtotal</th>{editable && <th aria-label="Acciones" />}</tr>
                        </thead>
                        {porRubro(b.items).map((g) => (
                          <tbody key={g.rubro}>
                            <tr><th colSpan={editable ? 6 : 5} className="pt-2 text-left text-xs font-semibold uppercase tracking-wide text-strong">{g.rubro}</th></tr>
                            {g.items.map((i) => (
                              <tr key={i.id} className="border-t border-line">
                                <td className="py-1.5 pr-2">{i.descripcion}{i.proveedor && <span className="block text-xs text-muted">{i.proveedor}</span>}</td>
                                <td className="pr-2">{i.cantidad.toLocaleString("es-AR")} {i.unidad}</td>
                                <td className="pr-2 text-right text-muted">{pesos(i.costo)}</td>
                                <td className="pr-2 text-right">{pesos(i.precio)}</td>
                                <td className="pr-2 text-right font-medium text-strong">{pesos(i.cantidad * i.precio)}</td>
                                {editable && (
                                  <td className="text-right">
                                    <form action={borrarItem}>
                                      <input type="hidden" name="id" value={i.id} />
                                      <button type="submit" className={buttonClasses("ghost", "md")} aria-label={`Sacar ${i.descripcion}`}>Sacar</button>
                                    </form>
                                  </td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        ))}
                      </table>
                    </div>

                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
                      <div><dt className="text-muted">Costo</dt><dd className="font-medium text-strong">{pesos(t.costo)}</dd></div>
                      <div><dt className="text-muted">Ganancia</dt><dd className="font-medium text-strong">{pesos(t.ganancia)} ({porcentaje(t.margenPct)})</dd></div>
                      <div><dt className="text-muted">Neto + IVA {b.ivaPct}%</dt><dd className="font-medium text-strong">{pesos(t.neto)} + {pesos(t.iva)}</dd></div>
                      <div><dt className="text-muted">Total al cliente</dt><dd className="text-lg font-bold text-strong">{pesos(t.total)}</dd></div>
                    </dl>

                    {editable && (
                      <div className="mt-3 grid gap-3 border-t border-line pt-3">
                        <form action={agregarItem} className="grid gap-2 sm:grid-cols-6">
                          <input type="hidden" name="presupuestoId" value={b.id} />
                          <input name="rubro" aria-label="Rubro" placeholder="Rubro" list="rubros" className={campo} />
                          <input name="descripcion" required aria-label="Detalle" placeholder="Detalle" className={cn(campo, "sm:col-span-2")} />
                          <input name="cantidad" aria-label="Cantidad" placeholder="Cant." inputMode="decimal" className={campo} />
                          <input name="unidad" aria-label="Unidad" placeholder="Unidad" className={campo} />
                          <input name="proveedor" aria-label="Proveedor" placeholder="Proveedor" className={campo} />
                          <input name="costo" aria-label="Costo unitario" placeholder="Costo unit." inputMode="decimal" className={campo} />
                          <input name="precio" aria-label="Precio unitario" placeholder="Precio (vacío = con margen)" inputMode="decimal" className={cn(campo, "sm:col-span-2")} />
                          <SubmitButton className={cn(buttonClasses("outline", "md"), "sm:col-span-3")}>Agregar renglón</SubmitButton>
                          <datalist id="rubros"><option value="Diseño" /><option value="Estructura y piso" /><option value="Gráfica" /><option value="Equipamiento" /><option value="Audio e iluminación" /><option value="Logística y armado" /><option value="Producción" /></datalist>
                        </form>
                        <form action={guardarTextosPresupuesto} className="grid gap-2">
                          <input type="hidden" name="id" value={b.id} />
                          <label className={etiqueta}>Presentación para el cliente<textarea name="presentacion" rows={3} defaultValue={b.presentacion} className={areaTexto} /></label>
                          <label className={etiqueta}>Condiciones<textarea name="condiciones" rows={3} defaultValue={b.condiciones} className={areaTexto} /></label>
                          <label className={cn(etiqueta, "max-w-40")}>IVA %<input name="ivaPct" defaultValue={String(b.ivaPct)} inputMode="decimal" className={campo} /></label>
                          <SubmitButton className={buttonClasses("outline", "md")}>Guardar textos</SubmitButton>
                        </form>
                        <form action={enviarPropuesta}>
                          <input type="hidden" name="id" value={b.id} />
                          {b.items.length > 0 ? <SubmitButton className={cn(buttonClasses("solid", "lg"), "w-full justify-center")}>Cerrar versión y generar link</SubmitButton> : <p className="text-sm font-medium text-strong">Cargá al menos un renglón para generar el link.</p>}
                          <p className="mt-1 text-sm text-muted">Después de esto, la versión no se edita: para cambiarla se abre otra.</p>
                        </form>
                      </div>
                    )}

                    {!editable && (
                      <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
                        <a href={ruta} target="_blank" rel="noopener noreferrer" className={buttonClasses("solid", "md")}>Ver propuesta</a>
                        <CopiarLink ruta={ruta} />
                        {wa && b.estado === "ENVIADO" && <a href={wa} target="_blank" rel="noopener noreferrer" className={buttonClasses("outline", "md")}>Abrir WhatsApp</a>}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>

          <section className={cn(tarjeta, "mt-4")} aria-label="Costo real">
            <h2 className="mb-1 font-semibold text-strong">Costo real</h2>
            <dl className="mb-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-5">
              <div><dt className="text-muted">Presupuestado</dt><dd className="font-medium text-strong">{totalesVigente ? pesos(totalesVigente.costo) : "—"}</dd></div>
              <div><dt className="text-muted">Real, sin IVA</dt><dd className="font-medium text-strong">{real.conGastos ? pesos(real.costoReal) : "—"}</dd></div>
              <div>
                <dt className="text-muted">Diferencia</dt>
                <dd className={cn("font-medium", real.desvio !== null && real.desvio > 0 ? "text-danger" : "text-strong")}>
                  {real.desvio === null ? "—" : `${real.desvio > 0 ? "Gastaste " : real.desvio < 0 ? "Ahorraste " : ""}${pesos(Math.abs(real.desvio))}`}
                </dd>
              </div>
              <div><dt className="text-muted">Ganancia real</dt><dd className="font-bold text-strong">{real.gananciaReal === null ? "—" : `${pesos(real.gananciaReal)} (${porcentaje(real.margenReal ?? 0)})`}</dd></div>
              <div><dt className="text-muted">Por pagar</dt><dd className="font-medium text-strong">{pesos(real.porPagar)}</dd></div>
            </dl>
            {rubros.some((r) => r.real > 0) && (
              <div className="mb-3 overflow-x-auto">
                <table className="w-full min-w-[420px] text-sm">
                  <thead className="text-left text-xs text-muted">
                    <tr><th className="py-1 pr-2 font-medium">Rubro</th><th className="pr-2 text-right font-medium">Presupuestado</th><th className="pr-2 text-right font-medium">Real</th><th className="text-right font-medium">Diferencia</th></tr>
                  </thead>
                  <tbody>
                    {rubros.map((r) => (
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
            {p.gastos.length > 0 && (
              <ul className="mb-3 grid gap-1 text-sm">
                {p.gastos.map((g) => (
                  <li key={g.id} className={cn("flex flex-wrap items-center justify-between gap-2 border-t border-line py-1", g.anuladoEl && "text-muted line-through")}>
                    <span className="min-w-0">
                      {fechaCorta(g.fecha)} · {g.supplier?.name ?? "Sin proveedor"} · {g.descripcion} · <strong>{pesos(totalDelGasto(g))}</strong>
                      <span className="block text-xs text-muted">
                        {g.rubro}{g.iva > 0 && ` · neto ${pesos(g.neto)} + IVA ${pesos(g.iva)}`}{g.comprobante && ` · comp. ${g.comprobante}`}
                        {g.pagadoEl ? ` · Pagado, ${MEDIO_LABEL[g.medio as MedioPago] ?? g.medio}` : " · Por pagar"}
                      </span>
                    </span>
                    {!g.anuladoEl && (
                      <span className="flex flex-wrap items-center gap-1">
                        {!g.pagadoEl && (
                          <form action={pagarGasto} className="flex items-center gap-1">
                            <input type="hidden" name="id" value={g.id} />
                            <select name="medio" aria-label={`Medio de pago de ${g.descripcion}`} defaultValue="TRANSFERENCIA" className={cn(campo, "w-auto")}>
                              {MEDIOS.map((m) => <option key={m} value={m}>{MEDIO_LABEL[m]}</option>)}
                            </select>
                            <button type="submit" className={buttonClasses("outline", "md")} aria-label={`Pagar ${g.descripcion}`}>Pagar</button>
                          </form>
                        )}
                        <form action={anularGasto}>
                          <input type="hidden" name="id" value={g.id} />
                          <button type="submit" className={buttonClasses("ghost", "md")} aria-label={`Anular gasto ${g.descripcion}`}>Anular</button>
                        </form>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <FormGasto proyectoId={p.id} proveedores={proveedores} rubros={rubros.map((r) => r.rubro)} hoy={fechaParaInput(new Date())} />
            <p className="mt-2 text-sm text-muted">Lo pagado sale por el libro de caja. El neto es lo que se compara contra el presupuesto.</p>
          </section>

          <section className={cn(tarjeta, "mt-4")} aria-label="Cobros">
            <h2 className="mb-1 font-semibold text-strong">Cobros</h2>
            <p className="mb-3 text-sm">
              Aprobado {pesos(totalAprobado)} · Cobrado {pesos(cobrado)} · <strong className="text-strong">{totalAprobado > 0 ? `Saldo ${pesos(saldo)}` : "Sin presupuesto aprobado"}</strong>
            </p>
            {p.pagos.length > 0 && (
              <ul className="mb-3 grid gap-1 text-sm">
                {p.pagos.map((c) => (
                  <li key={c.id} className={cn("flex items-center justify-between gap-2 border-t border-line py-1", c.anuladoEl && "text-muted line-through")}>
                    <span>{fechaCorta(c.createdAt)} · {MEDIO_LABEL[c.medio as MedioPago] ?? c.medio}{c.nota && ` · ${c.nota}`} · <strong>{pesos(c.monto)}</strong></span>
                    {!c.anuladoEl && (
                      <form action={anularCobro}>
                        <input type="hidden" name="id" value={c.id} />
                        <button type="submit" className={buttonClasses("ghost", "md")} aria-label={`Anular cobro de ${pesos(c.monto)}`}>Anular</button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <form action={registrarCobro} className="grid gap-2 sm:grid-cols-4">
              <input type="hidden" name="proyectoId" value={p.id} />
              <input name="monto" required aria-label="Monto" placeholder="Monto" inputMode="decimal" className={campo} />
              <select name="medio" aria-label="Medio de cobro" defaultValue="TRANSFERENCIA" className={campo}>
                {MEDIOS.map((m) => <option key={m} value={m}>{MEDIO_LABEL[m]}</option>)}
              </select>
              <input name="nota" aria-label="Nota del cobro" placeholder="Ej.: anticipo 50%" className={campo} />
              <SubmitButton className={buttonClasses("solid", "md")}>Registrar cobro</SubmitButton>
            </form>
            <p className="mt-2 text-sm text-muted">Cada cobro entra al libro de caja. La factura se emite desde Facturación.</p>
          </section>
        </>
      )}
    </main>
  );
}
