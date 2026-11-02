import Link from "next/link";
import { cn } from "@/components/ui";
import { fechaCorta, fechaParaInput, pesos } from "@/lib/proyectos/core";
import { aPesos, codigoProyecto, diasDeAtraso, estadoCuota, plataEn } from "@/lib/proyectos/gestion-core";
import { FILTROS_CUOTA, pasaFiltro, type FiltroCuota } from "@/lib/proyectos/empresa-core";
import { proveedoresActivos, type CuotaDelNegocio } from "@/lib/proyectos/empresa.server";
import { anularCuotaEmpresa, crearPagoEmpresa } from "@/lib/proyectos/acciones-empresa";
import { campo, etiqueta, tarjeta } from "../_vista";
import { BotonDosPasos, DatoCuota, FormAccion, MarcarCuota, VenceCuota } from "./_controles";

const MAX_FILAS = 300;
const FILTRO_LABEL: Record<FiltroCuota, string> = { pendientes: "Pendientes", vencidos: "Vencidos", pagados: "Pagados", todos: "Todos" };
const ESTADO_LABEL = { PAGADA: "Pagada", VENCIDA: "Vencida", PENDIENTE: "Pendiente" } as const;

const contraparte = (c: CuotaDelNegocio): string => (c.tipo === "COBRO" ? c.proyecto?.client.name : c.supplier?.name) ?? "—";

function coincide(c: CuotaDelNegocio, q: string): boolean {
  const codigo = c.proyecto ? codigoProyecto(c.proyecto.numero, c.proyecto.createdAt) : "empresa";
  return [c.concepto, contraparte(c), c.proyecto?.nombre, codigo, c.factura, c.comentario].some((t) => t?.toLowerCase().includes(q));
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

export async function TabCuentas({ tipo, estado, q, cuotas, tc, tenantId, editaEmpresa, editaPagos }: { tipo: "COBRO" | "PAGO"; estado?: string; q?: string; cuotas: readonly CuotaDelNegocio[]; tc: Readonly<Record<string, number>>; tenantId: string; editaEmpresa: boolean; editaPagos: boolean }) {
  const filtro: FiltroCuota = (FILTROS_CUOTA as readonly string[]).includes(estado ?? "") ? (estado as FiltroCuota) : "pendientes";
  const busqueda = (q ?? "").trim().toLowerCase();
  const tab = tipo === "COBRO" ? "cobrar" : "pagar";
  const hoy = new Date();
  const filas = cuotas.filter((c) => c.tipo === tipo && pasaFiltro(c, filtro, hoy) && (!busqueda || coincide(c, busqueda)));
  const proveedores = tipo === "PAGO" && editaEmpresa ? await proveedoresActivos(tenantId) : [];
  const enlace = (f: FiltroCuota) => `/admin/proyectos/administracion?tab=${tab}&estado=${f}${q ? `&q=${encodeURIComponent(q)}` : ""}`;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <nav aria-label="Filtrar por estado" className="flex flex-wrap gap-1">
          {FILTROS_CUOTA.map((f) => (
            <Link key={f} href={enlace(f)} aria-current={f === filtro ? "page" : undefined} className={cn("flex min-h-11 items-center rounded-lg border border-line px-3 text-sm", f === filtro ? "bg-accent text-on-accent" : "text-strong")}>{FILTRO_LABEL[f]}</Link>
          ))}
        </nav>
        <form method="get" role="search" className="flex min-w-0 flex-1 gap-1 sm:max-w-sm">
          <input type="hidden" name="tab" value={tab} />
          <input type="hidden" name="estado" value={filtro} />
          <input name="q" defaultValue={q} aria-label="Buscar" placeholder="Buscar evento, concepto, factura…" className={campo} />
          <button type="submit" className="min-h-11 rounded-lg border border-line px-3 text-sm text-strong">Buscar</button>
        </form>
      </div>

      {filas.length === 0 ? (
        <p className={cn(tarjeta, "text-sm text-muted")}>{busqueda ? "Nada coincide con esa búsqueda." : tipo === "COBRO" ? "No hay cobros en este filtro." : "No hay pagos en este filtro."}</p>
      ) : (
        <div className={cn(tarjeta, "overflow-x-auto")}>
          <table className="w-full min-w-[1180px] text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="py-1 pr-3 font-medium">Vence</th>
                <th className="pr-3 font-medium">Evento</th>
                <th className="pr-3 font-medium">{tipo === "COBRO" ? "Cliente" : "Proveedor"}</th>
                <th className="pr-3 font-medium">Concepto</th>
                <th className="pr-3 text-right font-medium">Monto</th>
                <th className="pr-3 text-right font-medium">En pesos</th>
                <th className="pr-3 font-medium">Factura</th>
                <th className="pr-3 font-medium">Estado</th>
                <th className="pr-3 font-medium">Acción</th>
                <th className="font-medium">Comentario</th>
              </tr>
            </thead>
            <tbody>
              {filas.slice(0, MAX_FILAS).map((c) => {
                const est = estadoCuota(c, hoy);
                const vencida = est === "VENCIDA";
                const deEmpresa = !c.proyecto;
                const puedeMarcar = deEmpresa ? editaEmpresa : editaPagos;
                const referencia = aPesos(c.monto, c.moneda, tc);
                return (
                  <tr key={c.id} className={cn("border-t border-line align-top", vencida && "bg-danger-soft")}>
                    <td className={cn("py-2 pr-3", vencida && "text-danger")}>
                      {editaEmpresa && !c.pagadoEl ? <VenceCuota id={c.id} valor={fechaParaInput(c.venceEl)} etiqueta={`Vencimiento de ${c.concepto}`} /> : null}
                      {vence(c.venceEl, vencida)}
                    </td>
                    <td className="py-2 pr-3">
                      {c.proyecto ? <Link href={`/admin/proyectos/${c.proyecto.id}`} className="underline">{codigoProyecto(c.proyecto.numero, c.proyecto.createdAt)} {c.proyecto.nombre}</Link> : <span className="text-muted">Empresa</span>}
                    </td>
                    <td className="py-2 pr-3">{contraparte(c)}</td>
                    <td className="py-2 pr-3">
                      {c.concepto}
                      {c.auto && <span className="ml-1 rounded border border-line px-1 text-xs text-muted">auto</span>}
                    </td>
                    <td className="whitespace-nowrap py-2 pr-3 text-right font-medium tabular-nums text-strong">{plataEn(c.monto, c.moneda)}</td>
                    <td className="whitespace-nowrap py-2 pr-3 text-right tabular-nums text-muted">{referencia > 0 ? pesos(referencia) : "—"}</td>
                    <td className="py-2 pr-3">{editaEmpresa ? <DatoCuota id={c.id} dato="factura" valor={c.factura ?? ""} etiqueta="Factura" /> : (c.factura ?? "—")}</td>
                    <td className={cn("whitespace-nowrap py-2 pr-3", vencida && "font-medium text-danger")}>{ESTADO_LABEL[est]}</td>
                    <td className="py-2 pr-3">
                      <div className="grid justify-items-start gap-1">
                        {est !== "PAGADA" && puedeMarcar && <MarcarCuota id={c.id} deEmpresa={deEmpresa} etiqueta={tipo === "COBRO" ? "Cobrado" : "Pagar"} />}
                        {est === "PAGADA" && <span className="whitespace-nowrap text-xs text-muted">{fechaCorta(c.pagadoEl)}{c.medio ? ` · ${c.medio.toLowerCase().replace("_", " ")}` : ""}</span>}
                        {deEmpresa && editaEmpresa && <BotonDosPasos accion={anularCuotaEmpresa} campos={{ id: c.id }} etiqueta="Anular" pregunta={est === "PAGADA" ? "¿Anular? La plata vuelve al libro." : "¿Anular?"} />}
                      </div>
                    </td>
                    <td className="py-2">{editaEmpresa ? <DatoCuota id={c.id} dato="comentario" valor={c.comentario ?? ""} etiqueta="Comentario" /> : (c.comentario ?? "—")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filas.length > MAX_FILAS && <p className="mt-2 text-sm text-muted">Se muestran las primeras {MAX_FILAS} de {filas.length}: usá el buscador para acotar.</p>}
        </div>
      )}

      {tipo === "PAGO" && editaEmpresa && (
        <section className={tarjeta}>
          <h2 className="mb-2 font-semibold text-strong">Nuevo pago de la empresa</h2>
          <p className="mb-3 text-sm text-muted">Lo que no es de ningún evento: alquiler, servicios, un honorario.</p>
          <FormAccion accion={crearPagoEmpresa} boton="Sumar pago" className="sm:grid-cols-2 lg:grid-cols-3">
            <label className={etiqueta}>Concepto<input name="concepto" required maxLength={200} className={campo} /></label>
            <label className={etiqueta}>Proveedor
              <select name="supplierId" className={campo} defaultValue="">
                <option value="">Sin proveedor</option>
                {proveedores.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
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
