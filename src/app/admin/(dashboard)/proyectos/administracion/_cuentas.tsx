import Link from "next/link";
import { cn } from "@/components/ui";
import { fechaCorta, fechaParaInput, pesos } from "@/lib/proyectos/core";
import { aPesos, codigoProyecto, diasDeAtraso, estadoCuota, plataEn } from "@/lib/proyectos/gestion-core";
import { FILTROS_CUOTA, pasaFiltro, type FiltroCuota } from "@/lib/proyectos/empresa-core";
import { proveedoresActivos, type CuotaDelNegocio, type GastoSinPagar, type SinCalendarioDelNegocio } from "@/lib/proyectos/empresa.server";
import type { PagadoDeCuota } from "@/lib/proyectos/cobranza-core";
import { anularCuotaEmpresa, crearPagoEmpresa } from "@/lib/proyectos/acciones-empresa";
import { quitarMovimiento } from "@/lib/proyectos/acciones-ficha";
import { textoCubierta } from "@/lib/proyectos/avisos-cuota";
import { aPagarPorComprobante, siHayM1 } from "@/lib/proyectos/comprobantes.server";
import { filaDeCuota, vistaAplicable } from "@/lib/proyectos/vistas.server";
import { agrupar, columnasPermitidas, ordenar, pasaFiltros, AGRUPACIONES, ORDENES, type ListaId, type VistaGuardada } from "@/lib/proyectos/vistas-core";
import { actorActual, columnasOcultas } from "@/lib/proyectos/gestion.server";
import { ROL_LABEL, ROLES_GESTION } from "@/lib/proyectos/gestion-core";
import { borrarVista, guardarVista } from "@/lib/proyectos/acciones-vistas";
import { campo, etiqueta, tarjeta } from "../_vista";
import { BotonDosPasos, DatoCuota, FormAccion, MarcarCuota, VenceCuota } from "./_controles";
import { GuardarVista } from "./_guardar-vista";

const MAX_FILAS = 300;
const FILTRO_LABEL: Record<FiltroCuota, string> = { pendientes: "Pendientes", vencidos: "Vencidos", pagados: "Pagados", todos: "Todos" };
const ESTADO_LABEL = { PAGADA: "Pagada", VENCIDA: "Vencida", PENDIENTE: "Pendiente" } as const;

const contraparte = (c: CuotaDelNegocio): string => (c.tipo === "COBRO" ? c.proyecto?.client.name : c.supplier?.name) ?? "—";

function coincide(c: CuotaDelNegocio, q: string): boolean {
  const codigo = c.proyecto ? codigoProyecto(c.proyecto.numero, c.proyecto.createdAt) : "empresa";
  return [c.concepto, contraparte(c), c.proyecto?.nombre, codigo, c.factura, c.comentario].some((t) => t?.toLowerCase().includes(q));
}

function coincideSinCalendario(f: SinCalendarioDelNegocio, q: string): boolean {
  return ["sin calendario", f.proyecto.nombre, codigoProyecto(f.proyecto.numero, f.proyecto.createdAt), f.proyecto.client.name].some((t) => t?.toLowerCase().includes(q));
}

function vence(d: Date, vencida: boolean) {
  const dias = diasDeAtraso(d);
  return (
    <>
      <span className="block whitespace-nowrap">{fechaCorta(d)}</span>
      {vencida && <span className="block whitespace-nowrap text-xs font-medium">{dias === 0 ? "hoy" : dias === 1 ? "hace 1 día" : `hace ${dias} días`}</span>}
    </>
  );
}

/** En la PC la columna de las acciones queda pegada a la derecha; en el celular cada cuota es una ficha apilada, con
 *  el rótulo de cada dato arriba: el importe, el estado y los botones nunca quedan fuera de la vista (plan V2, R6). */
const fijaDerecha = "sm:sticky sm:right-0 sm:bg-surface-raised max-sm:col-span-2";
const celda = "max-sm:py-1 max-sm:pr-0 max-sm:before:block max-sm:before:text-xs max-sm:before:text-muted max-sm:before:content-[attr(data-label)]";
const renglon = "max-sm:grid max-sm:grid-cols-2 max-sm:gap-x-3 max-sm:py-2";

export async function TabCuentas({ tipo, estado, q, vista: vistaId, guardada = false, cuotas, sinCalendario = [], gastosSinPagar = [], tc, tenantId, editaEmpresa, editaPagos, veClientes = false }: { tipo: "COBRO" | "PAGO"; estado?: string; q?: string; vista?: string; guardada?: boolean; cuotas: readonly (CuotaDelNegocio & { pendiente?: number; cobrado?: number; noSeCobra?: boolean; pagado?: PagadoDeCuota | null })[]; sinCalendario?: readonly SinCalendarioDelNegocio[]; gastosSinPagar?: readonly GastoSinPagar[]; tc: Readonly<Record<string, number>>; tenantId: string; editaEmpresa: boolean; editaPagos: boolean; veClientes?: boolean }) {
  // La vista guardada (O46): sus filtros son el punto de partida; el estado elegido arriba manda sobre el de la vista.
  const lista: ListaId = tipo === "COBRO" ? "a-cobrar" : "a-pagar";
  const a = await actorActual();
  const { vistas, actual, columnas } = await vistaAplicable(a, lista, vistaId);
  const ve = new Set(columnas.map((c) => c.id));
  const filtro: FiltroCuota = (FILTROS_CUOTA as readonly string[]).includes(estado ?? "") ? (estado as FiltroCuota) : actual.filtros.estado;
  const busqueda = (q ?? "").trim().toLowerCase();
  const tab = tipo === "COBRO" ? "cobrar" : "pagar";
  const hoy = new Date();
  const conFila = cuotas.filter((c) => c.tipo === tipo && pasaFiltro(c, filtro, hoy) && (!busqueda || coincide(c, busqueda))).map((c) => ({ c, f: filaDeCuota(c, tc, hoy) }));
  const filtradas = conFila.filter(({ f }) => pasaFiltros(f, { ...actual.filtros, estado: "todos" }, hoy));
  const porId = new Map(filtradas.map((x) => [x.f.id, x.c]));
  const grupos = agrupar(ordenar(filtradas.map((x) => x.f), actual.orden), actual.agrupacion).map((g) => ({ ...g, filas: g.filas.map((f) => porId.get(f.id)!) }));
  const filas = grupos.flatMap((g) => g.filas);
  const cantColumnas = ve.size;
  // Lo aprobado que ninguna cuota espera: pendiente y sin fecha, así que sólo en «Pendientes» y «Todos».
  const faltantes = tipo === "COBRO" && (filtro === "pendientes" || filtro === "todos") ? sinCalendario.filter((f) => !busqueda || coincideSinCalendario(f, busqueda)) : [];
  // MIA-089 · V6: los gastos cargados sin pagar también están en «A pagar»: cada uno con su renglón.
  const gastos = tipo === "PAGO" && (filtro === "pendientes" || filtro === "todos") ? gastosSinPagar.filter((g) => !busqueda || `${g.descripcion} ${g.proyecto.nombre} ${g.supplier?.name ?? ""}`.toLowerCase().includes(busqueda.toLowerCase())) : [];
  const proveedores = tipo === "PAGO" && editaEmpresa ? await proveedoresActivos(tenantId) : [];
  // MIA-50 T05 · O33: lo que se debe por comprobantes de proveedor (sin M1, nada) se paga con órdenes de pago.
  const porComprobantes = tipo === "PAGO" ? ((await siHayM1(() => aPagarPorComprobante(tenantId))) ?? []).filter((g) => g.porPagar > 0) : [];
  const conVista = actual.id === vistas[0].id ? "" : `&vista=${encodeURIComponent(actual.id)}`;
  const enlace = (f: FiltroCuota) => `/admin/proyectos/administracion?tab=${tab}&estado=${f}${q ? `&q=${encodeURIComponent(q)}` : ""}${conVista}`;
  const enlaceVista = (v: VistaGuardada) => `/admin/proyectos/administracion?tab=${tab}&vista=${encodeURIComponent(v.id)}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
  const borrable = (actual.alcance === "PERSONA" && actual.propietario === a.user.id) || (actual.alcance === "ROL" && a.rol === "DIRECCION");

  return (
    <div className="grid gap-4">
      <nav aria-label="Vistas de la lista" className="flex flex-wrap items-center gap-1">
        <span className="mr-1 text-sm text-muted">Vista:</span>
        {vistas.map((v) => (
          <Link key={v.id} href={enlaceVista(v)} aria-current={v.id === actual.id ? "page" : undefined} className={cn("flex min-h-11 items-center rounded-lg border border-line px-3 text-sm", v.id === actual.id ? "bg-accent text-on-accent" : "text-strong")}>
            {v.nombre}{v.alcance === "ROL" ? ` · ${ROL_LABEL[v.propietario as keyof typeof ROL_LABEL] ?? v.propietario}` : v.alcance === "PERSONA" ? " · mía" : ""}
          </Link>
        ))}
      </nav>
      <div className="flex flex-wrap items-center gap-2">
        <nav aria-label="Filtrar por estado" className="flex flex-wrap gap-1">
          {FILTROS_CUOTA.map((f) => (
            <Link key={f} href={enlace(f)} aria-current={f === filtro ? "page" : undefined} className={cn("flex min-h-11 items-center rounded-lg border border-line px-3 text-sm", f === filtro ? "bg-accent text-on-accent" : "text-strong")}>{FILTRO_LABEL[f]}</Link>
          ))}
        </nav>
        <form method="get" role="search" className="flex min-w-0 flex-1 gap-1 sm:max-w-sm">
          <input type="hidden" name="tab" value={tab} />
          <input type="hidden" name="estado" value={filtro} />
          {conVista && <input type="hidden" name="vista" value={actual.id} />}
          <input name="q" defaultValue={q} aria-label="Buscar" placeholder="Buscar evento, concepto, factura…" className={campo} />
          <button type="submit" className="min-h-11 rounded-lg border border-line px-3 text-sm text-strong">Buscar</button>
        </form>
      </div>

      {porComprobantes.length > 0 && (
        <section aria-labelledby="a-pagar-comprobantes" className={cn(tarjeta, "grid gap-2")}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="a-pagar-comprobantes" className="font-semibold text-strong">A pagar por comprobantes de proveedor</h2>
            <Link href="/admin/proyectos/proveedores/ordenes" className="text-sm underline underline-offset-2">Órdenes de pago</Link>
          </div>
          <ul className="grid gap-1 text-sm">
            {porComprobantes.map((g) => (
              <li key={g.supplierId} className="flex flex-wrap justify-between gap-2 border-t border-line pt-1">
                <span className="text-strong">{g.nombre} · {g.comprobantes.length === 1 ? "1 comprobante" : `${g.comprobantes.length} comprobantes`}</span>
                <span>{pesos(g.porPagar / 100)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {filas.length === 0 && faltantes.length === 0 && gastos.length === 0 ? (
        <p className={cn(tarjeta, "text-sm text-muted")}>{busqueda ? "Nada coincide con esa búsqueda." : tipo === "COBRO" ? "No hay cobros en este filtro." : "No hay pagos en este filtro."}</p>
      ) : (
        <div className={cn(tarjeta, "sm:overflow-x-auto")}>
          <table className={cn("w-full text-sm max-sm:block", cantColumnas >= 8 ? "sm:min-w-[1080px]" : "sm:min-w-[720px]")}>
            <thead className="text-left text-xs text-muted max-sm:sr-only">
              <tr>
                <th className="py-1 pr-3 font-medium">Vence</th>
                {ve.has("evento") && <th className="pr-3 font-medium">Evento</th>}
                {ve.has("contraparte") && <th className="pr-3 font-medium">{tipo === "COBRO" ? "Cliente" : "Proveedor"}</th>}
                {ve.has("concepto") && <th className="pr-3 font-medium">Concepto</th>}
                {ve.has("monto") && <th className="pr-3 text-right font-medium">Monto</th>}
                {ve.has("enPesos") && <th className="pr-3 text-right font-medium">En pesos</th>}
                {ve.has("factura") && <th className="pr-3 font-medium">Factura</th>}
                {ve.has("estado") && <th className="pr-3 font-medium">Estado</th>}
                {ve.has("comentario") && <th className="pr-3 font-medium">Comentario</th>}
                <th className={cn("pl-3 font-medium", fijaDerecha)}>Acción</th>
              </tr>
            </thead>
            {grupos.map((g) => (
            <tbody key={g.clave} className="max-sm:block">
              {g.titulo && (
                <tr className="border-t border-line max-sm:block">
                  <th colSpan={cantColumnas} scope="colgroup" className="py-2 text-left text-sm font-semibold text-strong max-sm:block">{g.titulo} <span className="font-normal text-muted">({g.filas.length})</span></th>
                </tr>
              )}
              {g.filas.slice(0, MAX_FILAS).map((c) => {
                const est = estadoCuota(c, hoy);
                // ADV-7 (MIA-107): un cobro de un perdido no se cobra (`perdidoAdmite`, la regla de la ficha y del servidor):
                // ni «Cobrado» ni vencida; se ve en «Todos» con su porqué.
                const vencida = est === "VENCIDA" && !c.noSeCobra;
                const deEmpresa = !c.proyecto;
                const puedeMarcar = deEmpresa ? editaEmpresa : editaPagos;
                // Lo cobrado a mano por fuera ya se descontó de las cuotas más viejas: el renglón muestra lo que falta. Una
                // cuota de cobro ya cobrada muestra lo que entró por ella (su cobro y lo suelto que la cubrió), no su monto.
                // Una de pago sin marcar, lo que le falta después de lo pagado en parte (pago-parcial-core).
                const deCobro = c.tipo === "COBRO" ? (c.pagadoEl ? c.cobrado : c.pendiente) : c.pagadoEl ? undefined : c.pendiente;
                const falta = deCobro ?? c.monto;
                const cubierta = !c.pagadoEl && !(falta > 0) && !c.noSeCobra;
                // Una cobrada con su cobro: lo que se pagó tal como entró (el original y los pesos asentados), no lo que
                // vale hoy (eso es del cashflow). «US$ 100 · $ 100.000», no «US$ 66,66».
                const pagado = c.tipo === "COBRO" && c.pagadoEl ? (c.pagado ?? null) : null;
                const referencia = pagado ? (pagado.pesos ?? pagado.monto) : aPesos(falta, c.moneda, tc);
                return (
                  <tr key={c.id} className={cn("border-t border-line align-top", renglon, vencida && "bg-danger-soft")}>
                    <td data-label="Vence" className={cn("py-2 pr-3", celda, vencida && "text-danger")}>
                      {editaEmpresa && !c.pagadoEl && !c.noSeCobra ? <VenceCuota id={c.id} valor={fechaParaInput(c.venceEl)} etiqueta={`Vencimiento de ${c.concepto}`} /> : null}
                      {vence(c.venceEl, vencida)}
                    </td>
                    {ve.has("evento") && (
                      <td data-label="Evento" className={cn("py-2 pr-3", celda)}>
                        {c.proyecto ? <Link href={`/admin/proyectos/${c.proyecto.id}`} className="inline-flex min-h-11 items-center underline">{codigoProyecto(c.proyecto.numero, c.proyecto.createdAt)} {c.proyecto.nombre}</Link> : <span className="text-muted">Empresa</span>}
                      </td>
                    )}
                    {ve.has("contraparte") && (
                      <td data-label={tipo === "COBRO" ? "Cliente" : "Proveedor"} className={cn("py-2 pr-3", celda)}>
                        {c.tipo === "COBRO" && c.proyecto && veClientes ? <Link href={`/admin/clientes/${c.proyecto.client.id}`} className="inline-flex min-h-11 items-center underline">{c.proyecto.client.name}</Link> : contraparte(c)}
                      </td>
                    )}
                    {ve.has("concepto") && (
                      <td data-label="Concepto" className={cn("py-2 pr-3", celda)}>
                        {c.concepto}
                        {c.auto && <span className="ml-1 rounded border border-line px-1 text-xs text-muted">auto</span>}
                      </td>
                    )}
                    {ve.has("monto") && (
                      <td data-label="Monto" className={cn("whitespace-nowrap py-2 pr-3 font-medium tabular-nums text-strong sm:text-right", celda)}>
                        {pagado ? plataEn(pagado.monto, pagado.moneda) : plataEn(falta, c.moneda)}
                        {(pagado ? pagado.moneda !== c.moneda || pagado.monto !== c.monto : falta !== c.monto) && <span className="block text-xs font-normal text-muted">de {plataEn(c.monto, c.moneda)}</span>}
                      </td>
                    )}
                    {ve.has("enPesos") && <td data-label="En pesos" className={cn("whitespace-nowrap py-2 pr-3 tabular-nums text-muted sm:text-right", celda)}>{referencia > 0 ? pesos(referencia) : "—"}</td>}
                    {ve.has("factura") && <td data-label="Factura" className={cn("py-2 pr-3", celda)}>{editaEmpresa ? <DatoCuota id={c.id} dato="factura" valor={c.factura ?? ""} etiqueta="Factura" /> : (c.factura ?? "—")}</td>}
                    {ve.has("estado") && <td data-label="Estado" className={cn("whitespace-nowrap py-2 pr-3", celda, vencida && "font-medium text-danger")}>{c.noSeCobra ? "No se cobra" : est === "PAGADA" && c.tipo === "COBRO" ? "Cobrada" : ESTADO_LABEL[est]}</td>}
                    {ve.has("comentario") && <td data-label="Comentario" className={cn("py-2 pr-3", celda)}>{editaEmpresa ? <DatoCuota id={c.id} dato="comentario" valor={c.comentario ?? ""} etiqueta="Comentario" /> : (c.comentario ?? "—")}</td>}
                    <td className={cn("py-2 sm:pl-3", fijaDerecha, vencida && "sm:bg-danger-soft")}>
                      <div className="grid justify-items-start gap-1">
                        {c.noSeCobra && <span className="max-w-56 text-xs text-muted">Proyecto perdido: no se cobra. Si se retoma, reabrilo primero.</span>}
                        {cubierta && <span className="max-w-56 text-xs text-muted">{textoCubierta(c.auto)}</span>}
                        {cubierta && !deEmpresa && !c.auto && editaPagos && c.proyecto && <BotonDosPasos accion={quitarMovimiento} campos={{ id: c.id, proyectoId: c.proyecto.id }} etiqueta="Quitar" pregunta="¿Quitar esta cuota? Lo cobrado sigue registrado." />}
                        {est !== "PAGADA" && !cubierta && !c.noSeCobra && puedeMarcar && <MarcarCuota id={c.id} deEmpresa={deEmpresa} etiqueta={tipo === "COBRO" ? "Cobrado" : "Pagar"} falta={falta} moneda={c.moneda} concepto={c.concepto} esCobro={c.tipo === "COBRO"} />}
                        {est === "PAGADA" && <span className="whitespace-nowrap text-xs text-muted">{fechaCorta(c.pagadoEl)}{c.medio ? ` · ${c.medio.toLowerCase().replace("_", " ")}` : ""}</span>}
                        {deEmpresa && editaEmpresa && <BotonDosPasos accion={anularCuotaEmpresa} campos={{ id: c.id }} etiqueta="Anular" pregunta={est === "PAGADA" ? "¿Anular? La plata vuelve al libro." : "¿Anular?"} />}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            ))}
            <tbody className="max-sm:block">
              {faltantes.map((f) => (
                <tr key={`sin-calendario-${f.proyectoId}`} className={cn("border-t border-line align-top", renglon)}>
                  <td data-label="Vence" className={cn("py-2 pr-3 text-muted", celda)}>Sin fecha</td>
                  {ve.has("evento") && (
                    <td data-label="Evento" className={cn("py-2 pr-3", celda)}>
                      <Link href={`/admin/proyectos/${f.proyecto.id}`} className="inline-flex min-h-11 items-center underline">{codigoProyecto(f.proyecto.numero, f.proyecto.createdAt)} {f.proyecto.nombre}</Link>
                    </td>
                  )}
                  {ve.has("contraparte") && <td data-label="Cliente" className={cn("py-2 pr-3", celda)}>{f.proyecto.client.name}</td>}
                  {ve.has("concepto") && (
                    <td data-label="Concepto" className={cn("py-2 pr-3", celda)}>
                      Sin calendario
                      <span className="block max-w-56 text-xs text-muted">Falta cobrarlo y no tiene cuota cargada.</span>
                    </td>
                  )}
                  {ve.has("monto") && <td data-label="Monto" className={cn("whitespace-nowrap py-2 pr-3 font-medium tabular-nums text-strong sm:text-right", celda)}>{plataEn(f.monto, f.moneda)}</td>}
                  {ve.has("enPesos") && <td data-label="En pesos" className={cn("whitespace-nowrap py-2 pr-3 tabular-nums text-muted sm:text-right", celda)}>{pesos(f.pesos)}</td>}
                  {ve.has("factura") && <td data-label="Factura" className={cn("py-2 pr-3 text-muted", celda)}>—</td>}
                  {ve.has("estado") && <td data-label="Estado" className={cn("whitespace-nowrap py-2 pr-3", celda)}>Pendiente</td>}
                  {ve.has("comentario") && <td data-label="Comentario" className={cn("py-2 pr-3 text-muted", celda)}>—</td>}
                  <td className={cn("py-2 sm:pl-3", fijaDerecha)}>
                    <Link href={`/admin/proyectos/${f.proyecto.id}?tab=finanzas`} className="flex min-h-11 items-center whitespace-nowrap text-sm underline">Cargar cuota</Link>
                  </td>
                </tr>
              ))}
              {gastos.map((g) => (
                <tr key={`gasto-${g.id}`} className={cn("border-t border-line align-top", renglon)}>
                  <td data-label="Vence" className={cn("py-2 pr-3 text-muted", celda)}>Sin fecha</td>
                  {ve.has("evento") && (
                    <td data-label="Evento" className={cn("py-2 pr-3", celda)}>
                      <Link href={`/admin/proyectos/${g.proyecto.id}`} className="inline-flex min-h-11 items-center underline">{codigoProyecto(g.proyecto.numero, g.proyecto.createdAt)} {g.proyecto.nombre}</Link>
                    </td>
                  )}
                  {ve.has("contraparte") && <td data-label="Proveedor" className={cn("py-2 pr-3", celda)}>{g.supplier?.name ?? "—"}</td>}
                  {ve.has("concepto") && (
                    <td data-label="Concepto" className={cn("py-2 pr-3", celda)}>
                      {g.descripcion}
                      <span className="block max-w-56 text-xs text-muted">Gasto cargado sin pagar.</span>
                    </td>
                  )}
                  {ve.has("monto") && <td data-label="Monto" className={cn("whitespace-nowrap py-2 pr-3 font-medium tabular-nums text-strong sm:text-right", celda)}>{pesos(g.total)}</td>}
                  {ve.has("enPesos") && <td data-label="En pesos" className={cn("whitespace-nowrap py-2 pr-3 tabular-nums text-muted sm:text-right", celda)}>{pesos(g.total)}</td>}
                  {ve.has("factura") && <td data-label="Factura" className={cn("py-2 pr-3 text-muted", celda)}>—</td>}
                  {ve.has("estado") && <td data-label="Estado" className={cn("whitespace-nowrap py-2 pr-3", celda)}>Pendiente</td>}
                  {ve.has("comentario") && <td data-label="Comentario" className={cn("py-2 pr-3 text-muted", celda)}>—</td>}
                  <td className={cn("py-2 sm:pl-3", fijaDerecha)}>
                    <Link href={`/admin/proyectos/${g.proyecto.id}?tab=finanzas`} className="flex min-h-11 items-center whitespace-nowrap text-sm underline">Pagar en la ficha</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filas.length > MAX_FILAS && <p className="mt-2 text-sm text-muted">Se muestran las primeras {MAX_FILAS} de {filas.length}: usá el buscador para acotar.</p>}
        </div>
      )}

      <details className={tarjeta} open={guardada}>
        <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-strong">Guardar una vista de esta lista</summary>
        <p className="mb-3 mt-1 text-sm text-muted">Elegí qué columnas ver, qué filtrar y cómo ordenar. Lo que tu rol no puede ver no aparece aunque la vista lo pida.</p>
        <GuardarVista
          accion={guardarVista}
          tab={tab}
          aviso={!guardada ? null : actual.id === vistaId ? "Vista guardada: ya está elegida arriba." : "Vista guardada para el rol elegido: la ven quienes tienen ese rol en esta lista."}
        >
          <input type="hidden" name="lista" value={lista} />
          <label className={etiqueta}>Nombre<input name="nombre" required maxLength={60} defaultValue={actual.alcance === "SISTEMA" ? "" : actual.nombre} className={campo} /></label>
          {a.rol === "DIRECCION" ? (
            <label className={etiqueta}>Para
              <select name="alcance" defaultValue="PERSONA" className={campo}><option value="PERSONA">Sólo para mí</option><option value="ROL">Para un rol</option></select>
            </label>
          ) : (
            <input type="hidden" name="alcance" value="PERSONA" />
          )}
          {a.rol === "DIRECCION" && (
            <label className={etiqueta}>Rol (si es para un rol)
              <select name="rol" defaultValue="ADMINISTRACION" className={campo}>{ROLES_GESTION.map((r) => <option key={r} value={r}>{ROL_LABEL[r]}</option>)}</select>
            </label>
          )}
          <fieldset className="grid gap-1 sm:col-span-2"><legend className="mb-1 text-sm font-medium text-strong">Columnas</legend>
            <div className="grid grid-cols-2 gap-x-3 sm:grid-cols-3">
              {columnasPermitidas(lista, columnasOcultas(a)).filter((c) => !c.fija).map((c) => (
                <label key={c.id} className="flex min-h-11 items-center gap-2 text-sm text-strong"><input type="checkbox" name="columnas" value={c.id} defaultChecked={ve.has(c.id)} className="h-5 w-5" />{c.id === "contraparte" ? (tipo === "COBRO" ? "Cliente" : "Proveedor") : c.label}</label>
              ))}
            </div>
          </fieldset>
          <label className={etiqueta}>Estado
            <select name="estado" defaultValue={actual.filtros.estado} className={campo}>{FILTROS_CUOTA.map((f) => <option key={f} value={f}>{FILTRO_LABEL[f]}</option>)}</select>
          </label>
          <label className={etiqueta}>Vence
            <select name="venceEnDias" defaultValue={String(actual.filtros.venceEnDias)} className={campo}><option value="0">Cuando sea</option><option value="7">En los próximos 7 días (y lo vencido)</option><option value="30">En los próximos 30 días (y lo vencido)</option></select>
          </label>
          <label className={etiqueta}>De
            <select name="origen" defaultValue={actual.filtros.origen} className={campo}><option value="todos">Eventos y empresa</option><option value="eventos">Sólo eventos</option><option value="empresa">Sólo la empresa</option></select>
          </label>
          <label className={etiqueta}>Moneda
            <select name="moneda" defaultValue={actual.filtros.moneda} className={campo}><option value="todas">Todas</option><option value="ARS">Pesos</option><option value="USD">Dólares</option></select>
          </label>
          <label className={etiqueta}>Agrupar
            <select name="agrupacion" defaultValue={actual.agrupacion} className={campo}>{AGRUPACIONES.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}</select>
          </label>
          <label className={etiqueta}>Ordenar
            <select name="orden" defaultValue={actual.orden} className={campo}>{ORDENES.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
          </label>
        </GuardarVista>
        {borrable && <div className="mt-3"><BotonDosPasos accion={borrarVista} campos={{ id: actual.id }} etiqueta={`Borrar la vista «${actual.nombre}»`} pregunta="¿Borrar esta vista? La lista no cambia." /></div>}
      </details>

      {editaEmpresa && (
        <section className={tarjeta}>
          <h2 className="mb-2 font-semibold text-strong">{tipo === "COBRO" ? "Nuevo cobro de la empresa" : "Nuevo pago de la empresa"}</h2>
          <p className="mb-3 text-sm text-muted">{tipo === "COBRO" ? "Lo que no es de ningún evento: un alquiler de equipos, una asesoría." : "Lo que no es de ningún evento: alquiler, servicios, un honorario."}</p>
          <FormAccion accion={crearPagoEmpresa} claveDeEnvio boton={tipo === "COBRO" ? "Sumar cobro" : "Sumar pago"} className="sm:grid-cols-2 lg:grid-cols-3">
            <input type="hidden" name="tipo" value={tipo} />
            <label className={etiqueta}>Concepto<input name="concepto" required maxLength={200} className={campo} /></label>
            {tipo === "PAGO" && (
              <label className={etiqueta}>Proveedor
                <select name="supplierId" className={campo} defaultValue="">
                  <option value="">Sin proveedor</option>
                  {proveedores.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
            )}
            <label className={etiqueta}>Vence<input name="venceEl" type="date" required className={campo} /></label>
            <label className={etiqueta}>Monto<input name="monto" inputMode="decimal" required className={campo} /></label>
            <label className={etiqueta}>Moneda
              <select name="moneda" className={campo} defaultValue="ARS"><option value="ARS">Pesos</option><option value="USD">Dólares</option></select>
            </label>
            <label className={etiqueta}>Factura<input name="factura" maxLength={60} className={campo} /></label>
          </FormAccion>
        </section>
      )}
    </div>
  );
}
