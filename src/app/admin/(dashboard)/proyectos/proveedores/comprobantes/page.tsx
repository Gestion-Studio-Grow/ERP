import Link from "next/link";
import { buttonClasses, cn } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import { prisma } from "@/lib/prisma";
import { requireApp } from "@/lib/require-app";
import { cargarComprobante } from "@/lib/proyectos/acciones-comprobantes";
import { fechaCorta } from "@/lib/proyectos/core";
import { comprobantesDelNegocio, parametrosDeComprobantes, siHayM1 } from "@/lib/proyectos/comprobantes.server";
import { filtroDeProyectos, exigirVer } from "@/lib/proyectos/gestion.server";
import { FormAccion } from "../../[id]/_cliente";
import { campo, etiqueta, tarjeta } from "../../_vista";
import { permisosDeCompras, NavCompras, plata, SinM1, SinPlata } from "../_compras";

export const dynamic = "force-dynamic";
export const metadata = { title: "Comprobantes de proveedores" };

// O27 · los comprobantes de proveedor: alta con su PDF (el duplicado lo frena la base) y la lista con lo que falta imputar y pagar.
export default async function Comprobantes({ searchParams }: { searchParams: Promise<{ proveedor?: string }> }) {
  await requireApp("gestion-proveedores");
  const { a, vePlata, carga } = await permisosDeCompras(await exigirVer("proveedores"));
  const sp = await searchParams;
  const supplierId = (sp.proveedor ?? "").slice(0, 40);
  const [filas, p, proveedores, proyectos] = vePlata
    ? await Promise.all([
        siHayM1(() => comprobantesDelNegocio(a.tenantId, supplierId ? { supplierId } : {})),
        parametrosDeComprobantes(a.tenantId),
        prisma.supplier.findMany({ where: { tenantId: a.tenantId, active: true }, orderBy: { name: "asc" }, take: 500, select: { id: true, name: true } }),
        prisma.proyecto.findMany({ where: filtroDeProyectos(a), orderBy: { numero: "desc" }, take: 200, select: { id: true, numero: true, nombre: true } }),
      ])
    : [null, null, [], []];

  return (
    <main className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-5">
      <NavCompras actual="/admin/proyectos/proveedores/comprobantes" />
      <header>
        <h1 className="text-2xl font-bold text-strong">Comprobantes de proveedores</h1>
        <p className="text-sm text-muted">Cada factura que llega se carga una vez, con su PDF, y se reparte entre los proyectos y la administración.</p>
      </header>
      {!vePlata ? (
        <SinPlata />
      ) : filas === null || !p ? (
        <SinM1 />
      ) : (
        <>
          {carga && (
            <details className={tarjeta} open={filas.length === 0}>
              <summary className="min-h-11 cursor-pointer content-center font-semibold text-strong">Cargar un comprobante</summary>
              <FormAccion accion={cargarComprobante} limpiar claveDeEnvio className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className={cn(etiqueta, "sm:col-span-2")}>
                  Proveedor
                  <select name="supplierId" required defaultValue={supplierId} className={campo}>
                    <option value="">Elegí el proveedor</option>
                    {proveedores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </label>
                <label className={etiqueta}>
                  Tipo
                  <select name="tipo" required defaultValue="A" className={campo}>
                    {p.tiposConNombre.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                </label>
                <label className={etiqueta}>Número<input name="numero" required placeholder="0001-00001234" autoComplete="off" className={campo} /></label>
                <label className={etiqueta}>Fecha<input name="fecha" type="date" required className={campo} /></label>
                <label className={etiqueta}>Neto<input name="neto" required inputMode="decimal" placeholder="600.000" className={campo} /></label>
                <label className={etiqueta}>IVA<input name="iva" inputMode="decimal" placeholder="126.000" className={campo} /></label>
                <label className={etiqueta}>Total<input name="total" required inputMode="decimal" placeholder="726.000" className={campo} /></label>
                <label className={cn(etiqueta, "sm:col-span-2")}>PDF o foto (hasta 2,5 MB)<input name="adjunto" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className={cn(campo, "py-2")} /></label>
                <label className={cn(etiqueta, "sm:col-span-2")}>Detalle<input name="detalle" maxLength={300} placeholder="Qué se compró" className={campo} /></label>
                <fieldset className="grid gap-3 sm:col-span-2 lg:col-span-4 sm:grid-cols-3">
                  <legend className="mb-1 text-sm text-muted">Opcional: imputarlo entero a un solo destino. Para repartirlo, cargalo y entrá al comprobante.</legend>
                  <label className={etiqueta}>
                    Destino
                    <select name="destino" defaultValue="" className={campo}>
                      <option value="">Lo imputo después</option>
                      <option value="ADMINISTRACION">Administración</option>
                      {proyectos.map((x) => <option key={x.id} value={x.id}>#{x.numero} {x.nombre}</option>)}
                    </select>
                  </label>
                  <label className={etiqueta}>
                    Categoría
                    <select name="categoria" defaultValue="" className={campo}>
                      <option value="">Elegí</option>
                      <optgroup label="De proyecto">{p.listas.categorias.map((c) => <option key={`p-${c}`} value={c}>{c}</option>)}</optgroup>
                      <optgroup label="De administración">{p.listas.categoriasAdministracion.map((c) => <option key={`a-${c}`} value={c}>{c}</option>)}</optgroup>
                    </select>
                  </label>
                  <label className={etiqueta}>
                    Sector
                    <select name="sector" defaultValue="" className={campo}>
                      <option value="">Sin sector</option>
                      {p.listas.sectores.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </label>
                </fieldset>
                {p.vinculadas.length > 0 && (
                  <label className={cn(etiqueta, "sm:col-span-2")}>Referencia entre sociedades (sólo si el proveedor es vinculada)<input name="referencia" maxLength={60} className={campo} /></label>
                )}
                <div className="sm:col-span-2 lg:col-span-4">
                  <SubmitButton className={buttonClasses("solid", "md")}>Cargar comprobante</SubmitButton>
                </div>
              </FormAccion>
            </details>
          )}

          {filas.length === 0 ? (
            <p className={cn(tarjeta, "text-sm text-muted")}>{supplierId ? "Ese proveedor no tiene comprobantes cargados." : "Todavía no hay comprobantes cargados."}</p>
          ) : (
            <div className={cn(tarjeta, "sm:overflow-x-auto")}>
              <table className="w-full text-sm max-sm:block sm:min-w-[860px]">
                <caption className="sr-only">Comprobantes de proveedores</caption>
                <thead className="text-left text-xs text-muted max-sm:sr-only">
                  <tr>
                    <th className="py-1 pr-3 font-medium">Fecha</th>
                    <th className="pr-3 font-medium">Proveedor</th>
                    <th className="pr-3 font-medium">Comprobante</th>
                    <th className="pr-3 text-right font-medium">Total</th>
                    <th className="pr-3 text-right font-medium">Falta imputar</th>
                    <th className="pr-3 text-right font-medium">Falta pagar</th>
                    <th className="font-medium">Cargó</th>
                  </tr>
                </thead>
                <tbody className="max-sm:grid max-sm:gap-2">
                  {filas.map((c) => (
                    <tr key={c.id} className={cn("border-t border-line max-sm:grid max-sm:gap-1 max-sm:py-2", c.anulado && "text-muted line-through")}>
                      <td className="py-2 pr-3">{fechaCorta(c.fecha)}</td>
                      <td className="pr-3 break-words">{c.supplier.name}{c.vinculada && <span className="ml-1 rounded bg-accent-soft px-1 text-xs text-accent-ink no-underline">Vinculada</span>}</td>
                      <td className="pr-3">
                        <Link href={`/admin/proyectos/proveedores/comprobantes/${c.id}`} className="font-medium text-strong underline underline-offset-2">{c.tipo} {c.numero}</Link>
                        {c.adjunto && <span className="ml-1 text-xs text-muted">· con PDF</span>}
                      </td>
                      <td className="pr-3 sm:text-right"><span className="sm:hidden text-muted">Total </span>{plata(c.total)}</td>
                      <td className={cn("pr-3 sm:text-right", c.faltaImputar !== 0 && !c.anulado && "font-semibold text-strong")}><span className="sm:hidden text-muted">Falta imputar </span>{c.anulado ? "—" : plata(c.faltaImputar)}</td>
                      <td className="pr-3 sm:text-right"><span className="sm:hidden text-muted">Falta pagar </span>{plata(c.porPagar)}</td>
                      <td className="text-muted">{c.cargadoNombre}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </main>
  );
}
