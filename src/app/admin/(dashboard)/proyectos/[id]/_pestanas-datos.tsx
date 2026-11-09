// Las pestañas Resumen, Ficha, Seguimiento e Historial de un proyecto. Componentes de servidor: piden lo suyo y nada más.

import Link from "next/link";
import { Badge, buttonClasses, cn } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import { agregarTarea, alternarTarea, borrarTarea } from "@/lib/proyectos/acciones";
import { agregarChecklist, alternarChecklist, asignarEquipo, borrarChecklist, cargarPlantillaChecklist, generarPortal, generarPortalCliente, guardarDatos, nuevaVersion, quitarEquipo, revocarPortal, revocarPortalCliente } from "@/lib/proyectos/acciones-ficha";
import { fechaCorta, fechaParaInput, MEDIO_LABEL, pesos, porcentaje, sePuedeEditar, yaVencio, type MedioPago } from "@/lib/proyectos/core";
import { conteoPorEstado } from "@/lib/proyectos/ficha-core";
import { cambioDeVenta, ESTADOS_ITEM, ESTADO_ITEM_LABEL, MONEDAS, plataEn, TIPOS_EVENTO, ventaEn, veTodosLosProyectos } from "@/lib/proyectos/gestion-core";
import { datosFicha, datosHistorial, datosResumen, datosSeguimiento, type Cabecera, type Vista } from "@/lib/proyectos/ficha.server";
import { prisma } from "@/lib/prisma";
import { puede, type Actor } from "@/lib/proyectos/gestion.server";
import { campo, etiqueta, tarjeta } from "../_vista";
import { BotonConConfirmacion, FormAccion } from "./_cliente";
import { CopiarLink } from "./_piezas";
import { etapa2ActivaPara } from "@/lib/proyectos/etapa2.server";
import { hayTablaPortalCliente, tokenPortalDelCliente } from "@/lib/proyectos/portal-cliente.server";
import { TablaFicha } from "./_tabla-ficha";

const areaTexto = "w-full rounded-lg border border-line bg-surface p-3 text-sm text-strong";
const dato = "grid gap-0.5";

export function Numero({ titulo, valor, alerta }: { titulo: string; valor: string; alerta?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{titulo}</dt>
      <dd className={cn("font-semibold tabular-nums", alerta ? "text-danger" : "text-strong")}>{valor}</dd>
    </div>
  );
}

const CUANDO = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Argentina/Buenos_Aires" });

// ── Resumen ─────────────────────────────────────────────────────────────────

export async function PestanaResumen({ a, cab, vista }: { a: Actor; cab: Cabecera; vista: Vista }) {
  const { proyecto: p } = cab;
  const { personas, finanzas, cantCuotas, cantChecklist } = await datosResumen(a, cab, vista);
  // Etapa 2: el portal del cliente se prende por negocio (apagado por defecto): si está apagado, no se ofrece el link.
  const conPortal = await etapa2ActivaPara(a.tenantId, "portal");
  // T5: el link del cliente reúne TODOS sus eventos: sólo lo ve quien ve todos los proyectos, y sólo con la tabla aplicada.
  const conPortalCliente = conPortal && veTodosLosProyectos(a.rol) && (await hayTablaPortalCliente());
  // null = no se pudo leer (sin tabla o error de base): la tarjeta no se muestra.
  const linkCliente = conPortalCliente ? await tokenPortalDelCliente(a.tenantId, p.client.id) : null;
  const tokenCliente = linkCliente?.token ?? null;
  const avance = finanzas && finanzas.cobrado + finanzas.aCobrar > 0 ? (finanzas.cobrado / (finanzas.cobrado + finanzas.aCobrar)) * 100 : 0;
  const libres = personas.filter((x) => !p.equipo.some((e) => e.personaId === x.id));
  const clientes = vista.pipelineEdita ? await prisma.client.findMany({ where: { tenantId: a.tenantId }, orderBy: { name: "asc" }, take: 500, select: { id: true, name: true } }) : [];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <section className={tarjeta} aria-label="Datos del proyecto">
        <h2 className="mb-2 font-semibold text-strong">Brief</h2>
        <p className="mb-3 whitespace-pre-line text-sm">{p.brief || <span className="text-muted">Sin brief todavía.</span>}</p>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div className={dato}><dt className="text-xs text-muted">Lugar</dt><dd className="text-strong">{p.lugar || "—"}</dd></div>
          <div className={dato}><dt className="text-xs text-muted">Invitados</dt><dd className="text-strong">{p.invitados?.toLocaleString("es-AR") ?? "—"}</dd></div>
          <div className={dato}><dt className="text-xs text-muted">Moneda de venta</dt><dd className="text-strong">{p.moneda}</dd></div>
          <div className={dato}><dt className="text-xs text-muted">Responsable</dt><dd className="text-strong">{p.responsable || "—"}</dd></div>
          <div className={dato}><dt className="text-xs text-muted">Anticipo del cliente</dt><dd className="text-strong">{porcentaje(p.anticipoClientePct)}</dd></div>
          <div className={dato}><dt className="text-xs text-muted">Presupuesto estimado</dt><dd className="text-strong">{p.presupuestoEstimado != null ? plataEn(p.presupuestoEstimado, p.moneda) : "—"}</dd></div>
          <div className={dato}><dt className="text-xs text-muted">Creado</dt><dd className="text-strong">{fechaCorta(p.createdAt)}</dd></div>
          {p.evento && <div className={dato}><dt className="text-xs text-muted">Feria o marco</dt><dd className="text-strong">{p.evento}</dd></div>}
        </dl>
        {vista.pipelineEdita && (
          <details className="mt-3 border-t border-line pt-2">
            <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-strong">Editar datos</summary>
            <FormAccion accion={guardarDatos} className="grid gap-3 pt-2">
              <input type="hidden" name="id" value={p.id} />
              <label className={etiqueta}>Nombre del evento<input name="nombre" required maxLength={120} defaultValue={p.nombre} className={campo} /></label>
              <label className={etiqueta}>Cliente
                <select name="clientId" defaultValue={p.clientId} className={campo}>
                  {!clientes.some((c) => c.id === p.clientId) && <option value={p.clientId}>{p.client.name}</option>}
                  {clientes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className={etiqueta}>Tipo de evento
                  <select name="tipoEvento" defaultValue={p.tipoEvento ?? ""} className={campo}>
                    <option value="">Sin definir</option>
                    {TIPOS_EVENTO.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </label>
                <label className={etiqueta}>Feria o marco<input name="evento" maxLength={120} defaultValue={p.evento ?? ""} className={campo} /></label>
                <label className={etiqueta}>Ciudad<input name="ciudad" maxLength={80} defaultValue={p.ciudad ?? ""} className={campo} /></label>
                <label className={etiqueta}>Lugar<input name="lugar" maxLength={120} defaultValue={p.lugar ?? ""} className={campo} /></label>
                <label className={etiqueta}>Armado<input type="date" name="fechaArmado" defaultValue={fechaParaInput(p.fechaArmado)} className={campo} /></label>
                <label className={etiqueta}>Inicio del evento<input type="date" name="fechaEvento" defaultValue={fechaParaInput(p.fechaEvento)} className={campo} /></label>
                <label className={etiqueta}>Fin del evento<input type="date" name="fechaFin" defaultValue={fechaParaInput(p.fechaFin)} className={campo} /></label>
                <label className={etiqueta}>Desarme<input type="date" name="fechaDesarme" defaultValue={fechaParaInput(p.fechaDesarme)} className={campo} /></label>
                <label className={etiqueta}>Invitados<input name="invitados" inputMode="numeric" defaultValue={p.invitados ?? ""} className={campo} /></label>
                <label className={etiqueta}>Moneda de venta
                  <select name="moneda" defaultValue={p.moneda} className={campo}>{MONEDAS.map((m) => <option key={m} value={m}>{m}</option>)}</select>
                </label>
                <label className={etiqueta}>Presupuesto estimado<input name="presupuestoEstimado" inputMode="decimal" defaultValue={p.presupuestoEstimado ?? ""} className={campo} /></label>
                <label className={etiqueta}>Anticipo del cliente %<input name="anticipoClientePct" inputMode="decimal" defaultValue={p.anticipoClientePct} className={campo} /></label>
                <label className={etiqueta}>Responsable<input name="responsable" maxLength={80} defaultValue={p.responsable ?? ""} className={campo} /></label>
                <label className={etiqueta}>Contacto del cliente<input name="contactoNombre" maxLength={120} defaultValue={p.contactoNombre ?? ""} className={campo} /></label>
                <label className={etiqueta}>Mail del contacto<input name="contactoEmail" type="email" maxLength={160} defaultValue={p.contactoEmail ?? ""} className={campo} /></label>
              </div>
              <label className={etiqueta}>Brief<textarea name="brief" rows={4} defaultValue={p.brief} className={areaTexto} /></label>
              <SubmitButton className={buttonClasses("outline", "md")}>Guardar datos</SubmitButton>
            </FormAccion>
          </details>
        )}
      </section>

      <div className="grid content-start gap-4">
        {finanzas && (
          <section className={tarjeta} aria-label="Estado financiero">
            <h2 className="mb-2 font-semibold text-strong">Estado financiero</h2>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Numero titulo="Cobrado" valor={pesos(finanzas.cobrado)} />
              <Numero titulo="A cobrar" valor={pesos(finanzas.aCobrar)} alerta={finanzas.cantCobrosVencidos > 0} />
              {vista.costos && <Numero titulo="Pagado a proveedores" valor={pesos(finanzas.pagado)} />}
              {vista.costos && <Numero titulo="A pagar" valor={pesos(finanzas.aPagar)} alerta={finanzas.cantPagosVencidos > 0} />}
            </dl>
            <p className="mt-3 text-xs text-muted">Avance de cobro: {porcentaje(Math.round(avance))}</p>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface" role="progressbar" aria-valuenow={Math.round(avance)} aria-valuemin={0} aria-valuemax={100} aria-label="Avance de cobro">
              <div className="h-full bg-accent" style={{ width: `${Math.min(100, avance)}%` }} />
            </div>
          </section>
        )}

        <section className={tarjeta} aria-label="Lo que sale de la ficha">
          <h2 className="mb-1 font-semibold text-strong">Se carga una vez, sale en todos lados</h2>
          <p className="mb-2 text-sm text-muted">Con los ítems de la ficha se arman solos la planilla de venta, los cobros, los pagos y las fechas de la agenda.</p>
          <ul className="grid gap-1 text-sm">
            <li><Link className="flex min-h-11 items-center underline" href={`?tab=ficha`}>{cab.totales.items} ítems en la ficha</Link></li>
            {vista.pagos && <li><Link className="flex min-h-11 items-center underline" href={`?tab=finanzas`}>{cantCuotas} movimientos en el cashflow</Link></li>}
            <li><Link className="flex min-h-11 items-center underline" href={`?tab=seguimiento`}>{cantChecklist} puntos en el checklist</Link></li>
          </ul>
        </section>
      </div>

      <section className={tarjeta} aria-label="Equipo del evento">
        <h2 className="mb-1 font-semibold text-strong">Equipo del evento</h2>
        <p className="mb-3 text-sm text-muted">Cada persona ve sólo sus proyectos, salvo Dirección, Administración y Comercial.</p>
        {p.equipo.length === 0 && <p className="mb-3 text-sm text-muted">Sin personas asignadas.</p>}
        <ul className="mb-3 grid gap-1">
          {p.equipo.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-1 text-sm">
              <span className="min-w-0">
                <span className="font-medium text-strong">{e.persona.nombre}</span>
                <span className="block text-xs text-muted">{[e.funcion || e.persona.puesto, vista.costos && e.plus > 0 ? `plus ${pesos(e.plus)}` : null].filter(Boolean).join(" · ")}</span>
              </span>
              {vista.pipelineEdita && <BotonConConfirmacion accion={quitarEquipo} ocultos={{ id: e.id, proyectoId: p.id }} texto="Quitar" textoConfirma="Quitar" etiqueta={`Quitar a ${e.persona.nombre}`} />}
            </li>
          ))}
        </ul>
        {vista.pipelineEdita && (
          libres.length === 0 ? (
            <p className="text-sm text-muted">{personas.length === 0 ? "Cargá personas en Equipo y permisos para poder asignarlas." : "Ya están todas las personas asignadas."}</p>
          ) : (
            <FormAccion accion={asignarEquipo} limpiar className="grid gap-2 border-t border-line pt-3 sm:grid-cols-2">
              <input type="hidden" name="proyectoId" value={p.id} />
              <select name="personaId" required aria-label="Persona" defaultValue="" className={campo}>
                <option value="" disabled>Persona</option>
                {libres.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
              </select>
              <input name="funcion" maxLength={80} aria-label="Función" placeholder="Función" className={campo} />
              {vista.editaCostos && <input name="plus" inputMode="decimal" aria-label="Plus por evento" placeholder="Plus por evento" className={campo} />}
              <SubmitButton className={buttonClasses("outline", "md")}>Asignar</SubmitButton>
            </FormAccion>
          )
        )}
      </section>

      {conPortal && <section className={tarjeta} aria-label="Portal del cliente">
        <h2 className="mb-1 font-semibold text-strong">Portal del cliente</h2>
        <p className="mb-3 text-sm">{[p.contactoNombre || p.client.name, p.contactoEmail || p.client.email].filter(Boolean).join(" · ")}</p>
        {p.tokenPortal ? (
          <div className="grid gap-2">
            <code className="break-all rounded-lg border border-line bg-surface p-2 text-xs text-strong">/portal/{p.tokenPortal}</code>
            <div className="flex flex-wrap gap-2">
              <a href={`/portal/${p.tokenPortal}`} target="_blank" rel="noopener noreferrer" className={buttonClasses("outline", "md")}>Abrir</a>
              <CopiarLink ruta={`/portal/${p.tokenPortal}`} />
              {vista.pipelineEdita && <BotonConConfirmacion accion={revocarPortal} ocultos={{ id: p.id }} texto="Sacar el acceso" textoConfirma="Sí, sacar el acceso" />}
            </div>
          </div>
        ) : vista.pipelineEdita ? (
          <FormAccion accion={generarPortal}>
            <input type="hidden" name="id" value={p.id} />
            <SubmitButton className={buttonClasses("outline", "md")}>Generar acceso</SubmitButton>
          </FormAccion>
        ) : (
          <p className="text-sm text-muted">Todavía sin acceso.</p>
        )}
        {conPortalCliente && linkCliente && (
          <div className="mt-4 grid gap-2 border-t border-line pt-3" aria-label="Link del cliente">
            <h3 className="text-sm font-semibold text-strong">Link del cliente (todos sus eventos)</h3>
            <p className="text-xs text-muted">Un solo link para {p.client.name} con la lista de sus eventos con ustedes: fechas, lugar y en qué está cada uno. Cada evento que tenga su acceso generado abre su propio portal, con su propuesta y sus montos.</p>
            {tokenCliente ? (
              <>
                <code className="break-all rounded-lg border border-line bg-surface p-2 text-xs text-strong">/portal/cliente/{tokenCliente}</code>
                <div className="flex flex-wrap gap-2">
                  <a href={`/portal/cliente/${tokenCliente}`} target="_blank" rel="noopener noreferrer" className={buttonClasses("outline", "md")}>Abrir</a>
                  <CopiarLink ruta={`/portal/cliente/${tokenCliente}`} />
                  {vista.pipelineEdita && <BotonConConfirmacion accion={revocarPortalCliente} ocultos={{ id: p.id }} texto="Sacar el acceso" textoConfirma="Saca el acceso a la lista de eventos. Los links de cada evento siguen abiertos hasta que los revoques en cada proyecto." />}
                </div>
              </>
            ) : vista.pipelineEdita ? (
              <FormAccion accion={generarPortalCliente}>
                <input type="hidden" name="id" value={p.id} />
                <SubmitButton className={buttonClasses("outline", "md")}>Generar link del cliente</SubmitButton>
              </FormAccion>
            ) : (
              <p className="text-sm text-muted">Todavía sin link.</p>
            )}
          </div>
        )}
      </section>}
    </div>
  );
}

// ── Ficha del evento ────────────────────────────────────────────────────────

export async function PestanaFicha({ a, cab, vista }: { a: Actor; cab: Cabecera; vista: Vista }) {
  const { viva, totales: t, faltanCambio, config, proyecto } = cab;
  const { filas, proveedores } = await datosFicha(a, cab, vista);
  const enBorrador = !viva || sePuedeEditar(viva.estado);
  const verCosto = !vista.ocultas.has("costoTotal");
  const verMargen = !vista.ocultas.has("margen");
  const cambioVenta = cambioDeVenta(proyecto.moneda, viva?.tcVenta, cab.tc);
  return (
    <section className={tarjeta} aria-label="Ficha del evento">
      <dl className="mb-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <Numero titulo="Ítems" valor={String(t.items)} />
        <Numero titulo="Venta total" valor={ventaEn(t.venta, proyecto.moneda, cambioVenta)} />
        {verCosto && <Numero titulo="Costo total" valor={pesos(t.costo)} />}
        {verMargen && <Numero titulo="Margen" valor={`${pesos(t.margen)} (${porcentaje(t.margenPct)})`} alerta={t.margen < 0} />}
      </dl>
      {faltanCambio.length > 0 && <p role="alert" className="mb-3 rounded-lg border border-line p-3 text-sm font-medium text-danger">Falta el tipo de cambio de {faltanCambio.join(", ")}: esos ítems están valiendo cero. Cargalo en Administración, Monedas y gastos fijos.</p>}
      {!viva && <p className="mb-3 text-sm text-muted">Este proyecto todavía no tiene ficha.</p>}
      {!enBorrador && (
        <div className="mb-3 rounded-lg border border-line p-3">
          <p className="text-sm font-medium text-strong">La versión {viva?.version} ya se envió al cliente: lo que vio no se reescribe.</p>
          {vista.fichaEdita && <p className="mb-2 text-sm text-muted">Para cambiar algo, abrí una versión nueva. Copia todos los ítems y lo ya pagado no vuelve a aparecer como deuda.</p>}
        </div>
      )}
      {vista.fichaEdita && (!viva || !enBorrador) && (
        <FormAccion accion={nuevaVersion} className="mb-3 flex flex-wrap items-center gap-2">
          <input type="hidden" name="proyectoId" value={proyecto.id} />
          <input name="nota" maxLength={300} aria-label="Nota de la versión" placeholder="Qué cambia en esta versión" className={cn(campo, "min-w-0 flex-1 sm:max-w-md")} />
          <SubmitButton className={buttonClasses("solid", "md")}>{viva ? "Nueva versión" : "Empezar ficha"}</SubmitButton>
        </FormAccion>
      )}
      <TablaFicha
        proyectoId={proyecto.id}
        presupuestoId={viva?.id ?? null}
        filas={filas}
        proveedores={proveedores}
        columnas={{ costoUnit: !vista.ocultas.has("costoUnit"), costoTotal: verCosto, recargo: !vista.ocultas.has("recargo"), margen: verMargen }}
        editable={vista.fichaEdita && !!viva && enBorrador}
        editaCostos={vista.editaCostos}
        recargoGeneral={config.margenPct}
        moneda={proyecto.moneda}
        cambio={cambioVenta}
      />
      <p className="mt-3 text-sm text-muted">Al guardar se regeneran solos los pagos a proveedores, los cobros al cliente y las fechas límite. Lo ya pagado no se toca.</p>
    </section>
  );
}

// ── Seguimiento ─────────────────────────────────────────────────────────────

export async function PestanaSeguimiento({ a, cab, vista }: { a: Actor; cab: Cabecera; vista: Vista }) {
  const { proyecto: p, viva } = cab;
  const { checklist, tareas, cuotas, pagos } = await datosSeguimiento(a, cab, vista);
  const listos = checklist.filter((c) => c.hechoEl).length;
  const conteo = conteoPorEstado(viva?.items ?? []);
  const editaTareas = puede(a, "ficha", "editar") || puede(a, "diseno", "editar");
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <section className={tarjeta} aria-label="Checklist hasta el evento">
        <h2 className="font-semibold text-strong">Checklist hasta el evento</h2>
        <p className="mb-3 text-sm text-muted">{listos}/{checklist.length} listos</p>
        {checklist.length === 0 && vista.fichaEdita && (
          <FormAccion accion={cargarPlantillaChecklist} className="mb-3">
            <input type="hidden" name="proyectoId" value={p.id} />
            <SubmitButton className={buttonClasses("outline", "md")}>Cargar la plantilla</SubmitButton>
          </FormAccion>
        )}
        <ul className="mb-3 grid gap-1">
          {checklist.map((c) => (
            <li key={c.id} className="flex items-center gap-2">
              {vista.fichaEdita ? (
                <FormAccion accion={alternarChecklist}>
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="proyectoId" value={p.id} />
                  <button type="submit" aria-label={c.hechoEl ? `Reabrir ${c.texto}` : `Marcar listo ${c.texto}`} className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-line text-strong">{c.hechoEl ? "✓" : ""}</button>
                </FormAccion>
              ) : (
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-line text-strong">{c.hechoEl ? "✓" : ""}</span>
              )}
              <span className={cn("min-w-0 flex-1 text-sm", c.hechoEl && "text-muted line-through")}>
                {c.texto}
                <span className={cn("block text-xs", !c.hechoEl && yaVencio(c.fecha) ? "font-medium text-danger" : "text-muted")}>{[c.categoria, c.fecha && fechaCorta(c.fecha)].filter(Boolean).join(" · ")}</span>
              </span>
              {vista.fichaEdita && <BotonConConfirmacion accion={borrarChecklist} ocultos={{ id: c.id, proyectoId: p.id }} texto="Quitar" textoConfirma="Quitar" etiqueta={`Quitar ${c.texto}`} />}
            </li>
          ))}
        </ul>
        {vista.fichaEdita && (
          <FormAccion accion={agregarChecklist} limpiar className="grid gap-2 border-t border-line pt-3 sm:grid-cols-[2fr_1fr_1fr_auto]">
            <input type="hidden" name="proyectoId" value={p.id} />
            <input name="texto" required maxLength={200} aria-label="Qué hay que confirmar" placeholder="Qué hay que confirmar" className={campo} />
            <input name="categoria" maxLength={40} aria-label="Categoría" placeholder="Categoría" className={campo} />
            <input type="date" name="fecha" aria-label="Fecha" className={campo} />
            <SubmitButton className={buttonClasses("outline", "md")}>Agregar</SubmitButton>
          </FormAccion>
        )}
      </section>

      <div className="grid content-start gap-4">
        <section className={tarjeta} aria-label="Ítems por estado">
          <h2 className="mb-2 font-semibold text-strong">Ítems por estado</h2>
          <ul className="flex flex-wrap gap-2 text-sm">
            {ESTADOS_ITEM.map((s) => <li key={s}><Badge tone={s === "ENTREGADO" ? "success" : "neutral"}>{ESTADO_ITEM_LABEL[s]}: {conteo[s] ?? 0}</Badge></li>)}
          </ul>
        </section>

        {vista.pagos && (
          <section className={tarjeta} aria-label="Pagos del cliente">
            <h2 className="mb-2 font-semibold text-strong">Pagos del cliente</h2>
            {cuotas.length === 0 && pagos.length === 0 && <p className="text-sm text-muted">Los cobros aparecen cuando el proyecto se confirma.</p>}
            <ul className="grid gap-1 text-sm">
              {cuotas.map((c) => (
                <li key={c.id} className="flex flex-wrap justify-between gap-2 border-t border-line py-1">
                  <span className="min-w-0">{c.concepto}<span className="block text-xs text-muted">Vence {fechaCorta(c.venceEl)}{c.pagadoEl ? ` · cobrado ${fechaCorta(c.pagadoEl)}` : ""}</span></span>
                  <strong className={cn("tabular-nums", !c.pagadoEl && yaVencio(c.venceEl) ? "text-danger" : "text-strong")}>{plataEn(c.monto, c.moneda)}</strong>
                </li>
              ))}
            </ul>
            {pagos.length > 0 && <p className="mt-2 text-xs text-muted">Último cobro: {fechaCorta(pagos[0].createdAt)}, {MEDIO_LABEL[pagos[0].medio as MedioPago] ?? pagos[0].medio}, {pesos(pagos[0].monto)}</p>}
          </section>
        )}

        <section className={tarjeta} aria-label="Tareas">
          <h2 className="mb-3 font-semibold text-strong">Tareas</h2>
          {tareas.length === 0 && <p className="mb-3 text-sm text-muted">Sin tareas todavía.</p>}
          <ul className="mb-3 grid gap-1">
            {tareas.map((t) => (
              <li key={t.id} className="flex items-center gap-2">
                <form action={alternarTarea} className="flex min-w-0 flex-1 items-center gap-2">
                  <input type="hidden" name="id" value={t.id} />
                  <button type="submit" disabled={!editaTareas} aria-label={t.hechaEl ? `Reabrir ${t.titulo}` : `Marcar hecha ${t.titulo}`} className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-line text-strong">{t.hechaEl ? "✓" : ""}</button>
                  <span className={cn("min-w-0 flex-1 text-sm", t.hechaEl && "text-muted line-through")}>
                    {t.titulo}
                    {(t.responsable || t.venceEl) && <span className="block text-xs text-muted">{[t.responsable, t.venceEl && `vence ${fechaCorta(t.venceEl)}`].filter(Boolean).join(" · ")}</span>}
                  </span>
                </form>
                {editaTareas && (
                  <form action={borrarTarea}>
                    <input type="hidden" name="id" value={t.id} />
                    <button type="submit" aria-label={`Borrar ${t.titulo}`} className={buttonClasses("ghost", "md")}>Borrar</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
          {editaTareas && (
            <form action={agregarTarea} className="grid gap-2 border-t border-line pt-3">
              <input type="hidden" name="proyectoId" value={p.id} />
              <input name="titulo" required aria-label="Nueva tarea" placeholder="Nueva tarea" className={campo} />
              <div className="grid grid-cols-2 gap-2">
                <select name="personaId" aria-label="Responsable de la tarea" defaultValue="" className={campo}>
                  <option value="">Sin responsable</option>
                  {p.equipo.map((e) => <option key={e.persona.id} value={e.persona.id}>{e.persona.nombre}</option>)}
                </select>
                <input type="date" name="venceEl" aria-label="Vencimiento de la tarea" className={campo} />
              </div>
              <SubmitButton className={buttonClasses("outline", "md")}>Agregar tarea</SubmitButton>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}

// ── Historial ───────────────────────────────────────────────────────────────

export async function PestanaHistorial({ a, cab, vista }: { a: Actor; cab: Cabecera; vista: Vista }) {
  const cambios = await datosHistorial(a, cab.proyecto.id, vista);
  return (
    <section className={tarjeta} aria-label="Historial">
      <h2 className="mb-2 font-semibold text-strong">Historial</h2>
      {cambios.length === 0 ? (
        <p className="text-sm text-muted">Sin cambios registrados todavía.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs text-muted">
              <tr><th className="py-1 pr-2 font-medium">Cuándo</th><th className="pr-2 font-medium">Quién</th><th className="pr-2 font-medium">Qué</th><th className="pr-2 font-medium">Antes</th><th className="font-medium">Después</th></tr>
            </thead>
            <tbody>
              {cambios.map((c) => (
                <tr key={c.id} className="border-t border-line align-top">
                  <td className="py-1.5 pr-2 whitespace-nowrap">{CUANDO.format(c.createdAt)}</td>
                  <td className="pr-2">{c.autor}</td>
                  <td className="pr-2">{c.campo}</td>
                  <td className="pr-2 text-muted">{c.antes ?? "—"}</td>
                  <td className="font-medium text-strong">{c.despues ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
