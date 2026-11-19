// Las pestañas Cotización y Finanzas, y lo que viene de antes y sigue vivo: costo real, cobros, propuesta con su link.

import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Badge, buttonClasses, cn } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import { pagarGasto, registrarCobro } from "@/lib/proyectos/acciones";
import { anularCobroFicha, anularGastoFicha, aprobarInterno, pedirAprobacion, crearMovimientoManual, enviarCotizacion, guardarTextos, marcarCuota, nuevaVersion, quitarMovimiento, recalcularCuotas, registrarRespuesta } from "@/lib/proyectos/acciones-ficha";
import { fechaCorta, fechaParaInput, MEDIOS, MEDIO_LABEL, pesos, porcentaje, redondear, sePuedeEditar, totalDelGasto, waLink, type MedioPago } from "@/lib/proyectos/core";
import { esFoto, FILTROS_CASHFLOW, filtrarCashflow, fotoDeVersion, margenDeFoto, perdidoAdmite, planillaDeVenta } from "@/lib/proyectos/ficha-core";
import { aItemFicha } from "@/lib/proyectos/gestion.server";
import { cambiosEntreVersiones, cambioDeVenta, estadoCuota, MONEDAS, totalesFicha } from "@/lib/proyectos/gestion-core";
import { datosCotizacion, datosFinanzas, type Cabecera, type Vista } from "@/lib/proyectos/ficha.server";
import { veLaPlata } from "@/lib/proyectos/datos.server";
import { textoPagado } from "@/lib/proyectos/cobranza-core";
import { ofreceNuevaVersion } from "@/lib/proyectos/presupuesto-vista-core";
import { textoCubierta } from "@/lib/proyectos/avisos-cuota";
import { nombreDelComprobante } from "@/lib/factura-de-prueba";
import type { Actor } from "@/lib/proyectos/gestion.server";
import { campo, etiqueta, tarjeta } from "../_vista";
import { BotonConConfirmacion, FormAccion } from "./_cliente";
import { CostosEnColumnas, FormGasto } from "./_gastos";
import { CopiarLink } from "./_piezas";
import { PlanillaVenta } from "./_planilla";
import { importe as importeEn, importeDeVenta } from "../_tabla";
import { Numero } from "./_pestanas-datos";
import { Adicionales, DetalleDeLineas, PrevisionDePagos } from "./_presupuesto";

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
  const enComparada = (n: number) => importeDeVenta(n, p.moneda, cambioDeVenta(p.moneda, comparada?.tcVenta, tc));
  const viva = versiones[0];
  const hayBorrador = !!viva && sePuedeEditar(viva.estado);
  const planillaViva = viva ? planillaDeVenta(viva.items, tc, recargo) : null;
  // O10: una sola base aprobada por proyecto (la garantiza la base con M2); los cambios después van como adicional.
  const baseAprobada = versiones.find((v) => v.estado === "APROBADO") ?? null;
  const wa = waLink(p.client.phone, `Hola ${p.client.name}! Te compartimos la propuesta de ${negocio.nombre} para "${p.nombre}":`);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <section className={tarjeta} aria-label="Versiones">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="font-semibold text-strong">Versiones</h2>
            {baseAprobada && (
              <p className="text-sm text-body">
                Versión base aprobada: <strong className="text-strong">v{baseAprobada.version}</strong>
                {hayBorrador && viva.id !== baseAprobada.id && <span className="text-muted"> · la v{viva.version} es un borrador y no mueve plata</span>}
              </p>
            )}
            {baseAprobada && vista.editaCotizaciones && <p className="text-sm text-muted">No se abre otra versión: un cambio va como adicional, más abajo.</p>}
          </div>
          {vista.editaCotizaciones && ofreceNuevaVersion({ baseAprobada: !!baseAprobada, hayBorrador }) && (
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
            // Lo enviado guarda su costo; las versiones anteriores a esa foto siguen calculándose al cambio de hoy.
            const fotoGuardada = esFoto(v.foto) && v.foto.every((i) => typeof i.costo === "number") ? v.foto : null;
            const enviado = fotoGuardada ? margenDeFoto(fotoGuardada) : null;
            const editable = sePuedeEditar(v.estado);
            const cambio = cambioDeVenta(p.moneda, v.tcVenta, tc);
            const ruta = `/propuesta/${v.token}`;
            return (
              <li key={v.id} className="rounded-xl border border-line p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-strong">Versión {v.version}</h3>
                  <Badge tone={v.estado === "APROBADO" ? "success" : v.estado === "RECHAZADO" ? "danger" : "neutral"}>{ESTADO_VERSION[v.estado] ?? v.estado}</Badge>
                  {v.aprobadoInternoEl ? <span className="text-xs text-muted">Precios aprobados por {v.aprobadoInternoPor}</span> : editable && <span className="text-xs font-medium text-danger">Falta la aprobación de Dirección</span>}
                  {!v.aprobadoInternoEl && editable && a.rol !== "DIRECCION" && vista.editaCotizaciones && (
                    <FormAccion accion={pedirAprobacion}>
                      <input type="hidden" name="proyectoId" value={p.id} />
                      <SubmitButton className={buttonClasses("outline", "md")}>Pedir aprobación</SubmitButton>
                    </FormAccion>
                  )}
                </div>
                <dl className="mb-2 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <Numero titulo="Total sin IVA" valor={importeDeVenta(t.venta, p.moneda, cambio)} />
                  {verMargen && <Numero titulo={editable ? "Margen" : enviado ? "Margen al enviar" : "Margen al cambio de hoy"} valor={`${importeDeVenta(enviado?.margen ?? t.margen, p.moneda, cambio)} (${porcentaje(enviado?.pct ?? t.margenPct)})`} />}
                  <Numero titulo="Fecha" valor={fechaCorta(v.enviadoEl ?? v.createdAt)} />
                  <Numero titulo="Quién" valor={v.creadoPor ?? "—"} />
                </dl>
                {v.nota && <p className="mb-1 text-sm">Nota: {v.nota}</p>}
                {v.respondidoPor && <p className="mb-1 text-sm">Respondió {v.respondidoPor} el {fechaCorta(v.respondidoEl)}{v.motivoRechazo && `: «${v.motivoRechazo}»`}</p>}
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`?tab=cotizacion&ver=${v.id}`} scroll={false} className={buttonClasses("outline", "md")}>Ver</Link>
                  {n < versiones.length - 1 && <Link href={`?tab=cotizacion&cambios=${v.id}`} scroll={false} className={buttonClasses("outline", "md")}>Qué cambió</Link>}
                  <a href={`/admin/proyectos/imprimir/venta/${p.id}/pdf?version=${v.id}`} className={buttonClasses("outline", "md")}>PDF</a>
                  <a href={`/admin/proyectos/imprimir/venta/${p.id}?version=${v.id}`} target="_blank" rel="noopener noreferrer" className={buttonClasses("outline", "md")}>Imprimir</a>
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
                      {p.moneda !== "ARS" && <label className={cn(etiqueta, "max-w-64")}>Cambio de venta: pesos por {p.moneda}<input name="tcVenta" defaultValue={cambio > 0 ? String(cambio).replace(".", ",") : ""} inputMode="decimal" className={campo} /></label>}
                      <SubmitButton className={buttonClasses("outline", "md")}>Guardar textos</SubmitButton>
                    </FormAccion>
                    <FormAccion accion={enviarCotizacion}>
                      <input type="hidden" name="id" value={v.id} />
                      {/* V1: sin corte de línea el texto mide ~370 px y a 390 la tarjeta desbordaba (423); en el teléfono va en dos renglones. */}
                      <SubmitButton className={cn(buttonClasses("solid", "lg"), "h-auto! min-h-14 w-full justify-center py-2 text-center whitespace-normal!")}>Enviar: cerrar versión y generar link</SubmitButton>
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

      {hayBorrador && <DetalleDeLineas a={a} vista={vista} lineas={viva.items} />}
      <Adicionales a={a} vista={vista} proyectoId={p.id} baseAprobada={baseAprobada?.version ?? null} />

      {comparada && (
        <section className={tarjeta} aria-label="Qué cambió">
          <h2 className="mb-2 font-semibold text-strong">Qué cambió en la versión {comparada.version}</h2>
          {diferencia ? (
            <>
              <dl className="mb-3 grid grid-cols-3 gap-3 text-sm">
                <Numero titulo={`Versión ${anterior?.version}`} valor={enComparada(diferencia.totalAnterior)} />
                <Numero titulo={`Versión ${comparada.version}`} valor={enComparada(diferencia.totalNuevo)} />
                <Numero titulo="Diferencia" valor={`${diferencia.diferencia > 0 ? "+" : ""}${enComparada(diferencia.diferencia)}`} />
              </dl>
              {diferencia.cambios.length === 0 && <p className="text-sm text-muted">Los precios son los mismos.</p>}
              <ul className="grid gap-1 text-sm">
                {diferencia.cambios.map((c, n) => (
                  <li key={n} className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-1">
                    <span className="min-w-0"><Badge tone={c.tipo === "quitado" ? "danger" : c.tipo === "agregado" ? "success" : "neutral"}>{c.tipo}</Badge> {c.descripcion} <span className="text-xs text-muted">{c.rubro}</span></span>
                    <span className="tabular-nums">
                      {c.antes !== null && <s className="mr-2 text-muted">{enComparada(c.antes)}</s>}
                      {c.despues !== null && <strong className="text-strong">{enComparada(c.despues)}</strong>}
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
            return <PlanillaVenta grupos={pl.grupos} neto={pl.neto} ivaPct={abierta.ivaPct} moneda={p.moneda} cambio={cambioDeVenta(p.moneda, abierta.tcVenta, tc)} />;
          })()}
        </section>
      )}

      {planillaViva && (
        <section className={tarjeta} aria-label="Planilla de venta en vivo">
          <h2 className="mb-2 font-semibold text-strong">Planilla de venta en vivo</h2>
          <PlanillaVenta grupos={planillaViva.grupos} neto={planillaViva.neto} ivaPct={viva.ivaPct} moneda={p.moneda} cambio={cambioDeVenta(p.moneda, viva.tcVenta, tc)} />
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
  // Con cuotas, se cobra y se paga marcándolas: cargar además por acá contaría dos veces. Sin cuotas, es el único camino.
  const cargaDirecta = vista.editaPagos && veLaPlata(a.user);
  const conCobros = d.cuotas.some((c) => c.tipo === "COBRO" && !c.anuladoEl);
  const conPagos = d.cuotas.some((c) => c.tipo === "PAGO" && !c.anuladoEl);
  // Un perdido no debe nada (pregunta 2 = A): no se ofrece cobrar ni marcar sus cuotas de cobro ni cargar un cobro a mano;
  // el servidor también lo rechaza (`PERDIDO_NO_COBRA`). Lo que se le debe a un proveedor se paga sin reabrir
  // (`perdidoAdmite`, decisión 2 = A, provisional a confirmar por el dueño). Anular un cobro hecho sigue andando (V2).
  const perdido = !!p.perdidoEl;
  const admite = (tipo: string) => !perdido || perdidoAdmite(tipo);
  // Lo cobrado que ninguna cuota viva tomó: primera línea del cashflow (el saldo arranca con eso).
  const sinCuota = d.flujo.inicial > 0 && (activo === "todos" || activo === "cobros") ? d.flujo.inicial : 0;
  const verCosto = !vista.ocultas.has("costoTotal");
  const cambioEvento = cambioDeVenta(p.moneda, cab.base?.tcVenta, cab.tc);
  const enEvento = (n: number) => importeDeVenta(n, p.moneda, cambioEvento);
  // El cashflow se calcula al cambio de hoy, cuota por cuota: se muestra con ese mismo, no con el fijado al vender.
  const enCaja = (n: number) => importeDeVenta(n, p.moneda, cambioDeVenta(p.moneda, null, cab.tc));

  // minmax(0,1fr): sin eso la columna de la grilla toma el ancho de la tabla (920 px) y en un celular la página
  // entera desborda (QA MIA #7). Así la tabla se desliza adentro de su contenedor con overflow-x-auto.
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      {cab.borradorSobreAprobada && cab.base && cab.viva && (
        <p role="status" className="rounded-md border border-line bg-surface-raised px-3 py-2.5 text-sm text-body">
          La versión {cab.viva.version} es un borrador: las cuotas, lo que falta cobrar y estos importes siguen saliendo de la versión aprobada ({cab.base.version}). El borrador no mueve plata hasta que se aprueba.
        </p>
      )}
      {vista.costos && cab.sinProveedor.cuantos > 0 && (
        <p role="status" className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2.5 text-sm text-danger">
          {cab.sinProveedor.cuantos === 1 ? "1 ítem con costo no tiene" : `${cab.sinProveedor.cuantos} ítems con costo no tienen`} proveedor: {pesos(cab.sinProveedor.monto)} no están en este cashflow, y el saldo se ve mejor de lo que es.
        </p>
      )}
      <section className={tarjeta} aria-label="Resultado del evento">
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Numero titulo="Venta presupuestada" valor={enEvento(t.venta)} />
          {verCosto && <Numero titulo="Costo presupuestado" valor={enEvento(t.costo)} />}
          {vista.costos && <Numero titulo="Saldo final" valor={enCaja(d.flujo.saldoFinal)} alerta={d.flujo.saldoFinal < 0} />}
          {vista.costos && <Numero titulo="Máximo a financiar" valor={enCaja(d.flujo.maximoAFinanciar)} alerta={d.flujo.maximoAFinanciar > 0} />}
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
        {lineas.length === 0 && sinCuota === 0 ? (
          <p className="mb-3 text-sm text-muted">Sin movimientos. Los cobros y pagos se generan solos cuando el proyecto está confirmado y la ficha tiene fecha de evento.</p>
        ) : (
          <div className="mb-3 overflow-x-auto">
            {lineas.some((l) => l.cuota.prevista && !l.cuota.pagadoEl) && <p className="mb-2 text-sm text-muted">Las cuotas previstas son una proyección: no suman en Administración, agenda ni proveedores, y se pueden marcar recién con el evento confirmado y con fecha.</p>}
            {/* En el teléfono cada cuota es un bloque (concepto y monto arriba, la acción abajo): la tabla de 920 px dejaba
                el monto y el botón fuera de la vista. Desde sm, la tabla de siempre. */}
            <table className="block w-full text-sm sm:table sm:min-w-[920px]">
              <thead className="hidden text-left text-xs text-muted sm:table-header-group">
                <tr>
                  <th className="py-1 pr-2 font-medium">Fecha</th>
                  <th className="pr-2 font-medium">Concepto</th>
                  <th className="pr-2 font-medium">Contraparte</th>
                  <th className="pr-2 text-right font-medium">Original</th>
                  <th className="pr-2 text-right font-medium">Importe {p.moneda === "USD" ? "US$" : "$"}</th>
                  <th className="pr-2 text-right font-medium">Saldo</th>
                  <th className="pr-2 font-medium">Estado</th>
                  <th aria-label="Acción" />
                </tr>
              </thead>
              <tbody className="block sm:table-row-group">
                {sinCuota > 0 && (
                  <tr className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 border-t border-line py-2 align-top sm:table-row sm:py-0">
                    <td className="hidden py-1.5 pr-2 sm:table-cell">—</td>
                    <td className="py-1.5 pr-2">
                      Cobrado sin cuota
                      <span className="block text-xs text-muted">{perdido ? "Lo que se cobró antes de perderse: queda como cobrado." : "Cobros registrados aparte que ninguna cuota pendiente toma."}</span>
                    </td>
                    <td className="hidden py-1.5 pr-2 sm:table-cell">{p.client.name}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{enCaja(sinCuota)}</td>
                    <td className="hidden py-1.5 pr-2 text-right tabular-nums text-strong sm:table-cell">{enCaja(sinCuota)}</td>
                    <td className="hidden py-1.5 pr-2 text-right font-medium tabular-nums sm:table-cell">{enCaja(sinCuota)}</td>
                    <td className="col-span-2 py-1.5 pr-2"><Badge tone="success">Cobrado</Badge></td>
                    <td className="col-span-2 py-1" />
                  </tr>
                )}
                {lineas.map(({ cuota: c, importe, saldo }) => {
                  const estado = estadoCuota(c);
                  const fecha = c.prevista && !p.fechaEvento ? "Sin fecha" : fechaCorta(c.venceEl);
                  const contraparte = c.tipo === "COBRO" ? p.client.name : c.supplier?.name ?? "—";
                  return (
                    <tr key={c.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 border-t border-line py-2 align-top sm:table-row sm:py-0">
                      <td className="hidden py-1.5 pr-2 whitespace-nowrap sm:table-cell">{fecha}</td>
                      <td className="py-1.5 pr-2">
                        {c.concepto}{c.auto && <span className="ml-1 text-xs text-muted">auto</span>}
                        <span className="block text-xs text-muted sm:hidden">{fecha} · {contraparte}</span>
                      </td>
                      <td className="hidden py-1.5 pr-2 sm:table-cell">{contraparte}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">
                        {importeEn(c.monto, c.moneda)}
                        {/* Lo que le falta: a un cobro, después de lo cobrado aparte o en parte; a un pago, de lo pagado en parte. */}
                        {!c.pagadoEl && !c.anuladoEl && redondear(c.pendiente) !== c.monto && <span className="block text-xs text-muted">Falta {importeEn(c.pendiente, c.moneda)}</span>}
                        {/* Lo que se pagó tal como entró (el original y los pesos asentados), no lo que vale hoy: eso va en el importe. */}
                        {c.pagado && (c.pagado.pesos !== null || c.pagado.moneda !== c.moneda || c.pagado.monto !== c.monto) && <span className="block text-xs text-muted">Pagó {textoPagado(c.pagado)}</span>}
                      </td>
                      <td className={cn("hidden py-1.5 pr-2 text-right tabular-nums sm:table-cell", importe < 0 ? "text-danger" : "text-strong")}>
                        {enCaja(importe)}
                        {/* La línea es la cuota entera (como la de cobro: lo que entró más lo que falta); lo ya pagado en partes se dice. */}
                        {c.tipo !== "COBRO" && !c.pagadoEl && !c.anuladoEl && c.cobrado > 0 && <span className="block text-xs text-muted">{importeEn(c.cobrado, c.moneda)} ya pagado en partes</span>}
                      </td>
                      <td className={cn("hidden py-1.5 pr-2 text-right font-medium tabular-nums sm:table-cell", saldo < 0 && "text-danger")}>{enCaja(saldo)}</td>
                      <td className="col-span-2 py-1.5 pr-2">{c.prevista && !c.pagadoEl ? <Badge tone="neutral">Prevista</Badge> : <Badge tone={estado === "PAGADA" ? "success" : estado === "VENCIDA" ? "danger" : "neutral"}>{estado === "PAGADA" ? (c.tipo === "COBRO" ? "Cobrado" : "Pagado") : estado === "VENCIDA" ? "Vencido" : "Pendiente"}</Badge>}</td>
                      <td className="col-span-2 py-1">
                        {c.pagadoEl && c.tipo === "COBRO" && !c.anuladoEl && <a href={`/admin/proyectos/imprimir/cobro/${c.id}`} className={buttonClasses("ghost", "sm")}>Constancia</a>}
                        {!c.pagadoEl && !c.anuladoEl && c.tipo === "COBRO" && perdido && <span className="text-xs text-muted">Proyecto perdido: no se cobra</span>}
                        {!c.pagadoEl && !c.anuladoEl && c.tipo === "COBRO" && !perdido && !(c.pendiente > 0) && (
                          c.prevista ? (
                            <span className="text-xs text-muted">Prevista (sin marcar)</span>
                          ) : (
                            <div className="grid justify-items-end gap-1">
                              <span className="text-xs text-muted">{textoCubierta(c.auto)}</span>
                              {!c.auto && vista.editaPagos && <BotonConConfirmacion accion={quitarMovimiento} ocultos={{ id: c.id, proyectoId: p.id }} texto="Quitar" textoConfirma="Quitar" etiqueta={`Quitar ${c.concepto}`} />}
                            </div>
                          )
                        )}
                        {!c.pagadoEl && !c.prevista && vista.editaPagos && admite(c.tipo) && (c.tipo !== "COBRO" || c.pendiente > 0) && (
                          <div className="flex flex-wrap items-center gap-1 sm:justify-end">
                            {/* `limpiar`: tras una parte que salió bien, el monto no queda escrito para un segundo clic. */}
                            <FormAccion accion={marcarCuota} limpiar className="flex flex-wrap items-center gap-1">
                              <input type="hidden" name="id" value={c.id} />
                              <select name="medio" aria-label={`Medio de ${c.concepto}`} defaultValue="TRANSFERENCIA" className={campoEnLinea}>
                                {MEDIOS.map((m) => <option key={m} value={m}>{MEDIO_LABEL[m]}</option>)}
                              </select>
                              {cuentas.length > 0 && (
                                <select name="cuenta" aria-label={`Cuenta de ${c.concepto}`} defaultValue="" required className={campoEnLinea}>
                                  <option value="" disabled>Elegí la cuenta</option>
                                  <option value="ninguna">Ninguna cuenta del banco: va sólo al libro de caja</option>
                                  {cuentas.map((x) => <option key={x.id} value={x.id}>{x.nombre} ({x.moneda})</option>)}
                                </select>
                              )}
                              {/* Una parte (cobro o pago): un monto menor que lo que falta, en la moneda de la cuota. Vacío: todo, y la
                                  cuota queda marcada. `visto`: lo que faltaba al cargar la pantalla; si cambió, «todo» no se asienta. */}
                              <input type="hidden" name="envio" value={randomUUID()} />
                              <input type="hidden" name="visto" value={String(c.pendiente)} />
                              <input name="monto" inputMode="decimal" aria-label={`Monto a ${c.tipo === "COBRO" ? "cobrar" : "pagar"} de ${c.concepto}, en ${c.moneda} (vacío: todo lo que falta)`} placeholder={`Todo: ${importeEn(c.pendiente, c.moneda)}`} className={cn(campoEnLinea, "w-40")} />
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
            {(admite("COBRO") || vista.costos) && <details>
              <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-strong">Movimiento manual</summary>
              <FormAccion accion={crearMovimientoManual} limpiar claveDeEnvio className="grid gap-2 pt-2 sm:grid-cols-3">
                <input type="hidden" name="proyectoId" value={p.id} />
                <select name="tipo" aria-label="Tipo" defaultValue={perdido ? "PAGO" : "COBRO"} className={campo}>
                  {admite("COBRO") && <option value="COBRO">Cobro</option>}
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
            </details>}
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
          <CostosEnColumnas original={d.totalesAprobada ? d.totalesAprobada.costo : null} real={d.real} />
          {/* Una rendición o un gasto aparte al mismo proveedor mientras quedan cuotas a proveedor por pagar: si pagó una de esas
              cuotas, está contado dos veces. No hay enlace que lo diga, así que no se resta solo: se avisa hasta cuánto. */}
          {d.enDuda > 0 && (
            <p role="status" className="mb-3 rounded-md border border-warning/30 bg-warning-soft px-3 py-2.5 text-sm text-strong">
              Ojo: hasta {pesos(d.enDuda)} pueden estar contados dos veces. Hay rendiciones o gastos cargados aparte al mismo proveedor mientras quedan cuotas a proveedores por pagar. Si alguno de esos gastos pagó una de esas cuotas, el costo real es hasta {pesos(d.enDuda)} menor y la ganancia real, hasta {pesos(d.enDuda)} mayor. Avisale a Administración para que lo revise.
            </p>
          )}
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
                        <FormAccion accion={pagarGasto} className="flex flex-wrap items-center gap-1">
                          <input type="hidden" name="id" value={g.id} />
                          <select name="medio" aria-label={`Medio de pago de ${g.descripcion}`} defaultValue="TRANSFERENCIA" className={campoEnLinea}>
                            {MEDIOS.map((m) => <option key={m} value={m}>{MEDIO_LABEL[m]}</option>)}
                          </select>
                          <button type="submit" className={buttonClasses("outline", "md")} aria-label={`Pagar ${g.descripcion}`}>Pagar</button>
                        </FormAccion>
                      )}
                      <BotonConConfirmacion accion={anularGastoFicha} ocultos={{ id: g.id }} texto="Anular" textoConfirma="Sí, anular" etiqueta={`Anular gasto ${g.descripcion}`} />
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {cargaDirecta && !conPagos && <FormGasto proyectoId={p.id} proveedores={d.proveedores.map((s) => s.name)} rubros={d.rubros.map((r) => r.rubro)} hoy={hoy} />}
          <p className="mt-2 text-sm text-muted">Lo pagado sale por el libro de caja. El neto es lo que se compara contra el presupuesto.</p>
        </section>
      )}

      <PrevisionDePagos a={a} vista={vista} proyectoId={p.id} lineas={cab.base?.estado === "APROBADO" ? cab.base.items : []} />

      <section className={tarjeta} aria-label="Cobros">
        <h2 className="mb-1 font-semibold text-strong">Cobros</h2>
        <p className="mb-3 text-sm">
          {perdido ? (
            <>Perdido · Cobrado {pesos(d.cobrado)} · <strong className="text-strong">No se le cobra más</strong></>
          ) : (
            <>Aprobado {pesos(d.totalAprobado)} · Cobrado {pesos(d.cobrado)} · <strong className="text-strong">{d.totalAprobado > 0 ? `Saldo ${pesos(d.saldo)}` : "Sin presupuesto aprobado"}</strong></>
          )}
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
        {perdido && <p className="text-sm text-muted">El proyecto está perdido: no se le registran cobros. Si vuelve, reabrilo y se cobra como siempre. Anular un cobro hecho sigue andando.</p>}
        {conCobros && !perdido && <p className="text-sm text-muted">Los cobros de este evento se registran marcando su cuota, en la tabla de arriba.</p>}
        {cargaDirecta && !conCobros && !perdido && (
          <FormAccion accion={registrarCobro} limpiar claveDeEnvio className="grid gap-2 sm:grid-cols-4">
            <input type="hidden" name="proyectoId" value={p.id} />
            {/* O41: un id por formulario; el mismo envío dos veces (doble clic, reintento) asienta un solo cobro. */}
            <input type="hidden" name="envio" value={randomUUID()} />
            <input name="monto" required aria-label="Monto" placeholder="Monto" inputMode="decimal" className={campo} />
            <select name="medio" aria-label="Medio de cobro" defaultValue="TRANSFERENCIA" className={campo}>
              {MEDIOS.map((m) => <option key={m} value={m}>{MEDIO_LABEL[m]}</option>)}
            </select>
            <input name="nota" aria-label="Nota del cobro" placeholder="Ej.: anticipo 50%" className={campo} />
            <SubmitButton className={buttonClasses("solid", "md")}>Registrar cobro</SubmitButton>
          </FormAccion>
        )}
        <p className="mt-2 text-sm text-muted">Cada cobro entra al libro de caja. La factura se emite desde Facturación.</p>
      </section>
    </div>
  );
}
