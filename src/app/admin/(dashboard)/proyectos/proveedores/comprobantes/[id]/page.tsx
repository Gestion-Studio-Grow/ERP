import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonClasses, cn } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import { prisma } from "@/lib/prisma";
import { requireApp } from "@/lib/require-app";
import { anularComprobante, desenlazarCuota, enlazarCuota } from "@/lib/proyectos/acciones-comprobantes";
import { crearOrdenDesdeForm } from "@/lib/proyectos/acciones-orden-pago";
import { fechaCorta, MEDIOS, MEDIO_LABEL, pesos } from "@/lib/proyectos/core";
import { comprobanteParaVer, parametrosDeComprobantes, siHayM1 } from "@/lib/proyectos/comprobantes.server";
import { textoDeCentavos, tratamientoDelTipo, TRATAMIENTOS } from "@/lib/proyectos/comprobantes-core";
import { ESTADO_ORDEN_LABEL, numeroDeOrden, type EstadoOrden } from "@/lib/proyectos/orden-pago-core";
import { filtroDeProyectos, exigirVer } from "@/lib/proyectos/gestion.server";
import { FormAccion } from "../../../[id]/_cliente";
import { campo, etiqueta, tarjeta } from "../../../_vista";
import { permisosDeCompras, NavCompras, plata, SinPlata } from "../../_compras";
import { EditorImputacion } from "./_imputacion";

export const dynamic = "force-dynamic";
export const metadata = { title: "Comprobante de proveedor" };

const TRATAMIENTO_LABEL = Object.fromEntries(TRATAMIENTOS.map((t) => [t.id, t.label])) as Record<string, string>;

export default async function Comprobante({ params }: { params: Promise<{ id: string }> }) {
  await requireApp("gestion-proveedores");
  const { a, vePlata, carga, paga } = permisosDeCompras(await exigirVer("proveedores"));
  const { id } = await params;
  if (!vePlata) return <main className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-5"><SinPlata /></main>;
  const c = await siHayM1(() => comprobanteParaVer(a.tenantId, id));
  // Sin M1 o sin ese comprobante: 404 (la lista ya avisa si falta la actualización de la base).
  if (!c) notFound();
  const [p, proyectos] = await Promise.all([
    parametrosDeComprobantes(a.tenantId),
    prisma.proyecto.findMany({ where: filtroDeProyectos(a), orderBy: { numero: "desc" }, take: 200, select: { id: true, numero: true, nombre: true } }),
  ]);
  const porDefecto = tratamientoDelTipo(c.tipo, p.ivaPorTipo, p.ivaProvisional);
  const neto = Number(c.netoCentavos);
  const iva = Number(c.ivaCentavos);
  const imputado = c.lineas.reduce((s, l) => s + Number(l.netoCentavos) + Number(l.ivaCentavos), 0);
  const ordenesVivas = c.ordenes.filter((o) => o.orden.estado !== "ANULADA");
  const cuotasSinOrden = c.cuotas.map((x) => x.cuota).filter((q) => !q.pagadoEl);
  const titulo = `${c.tipo} ${c.numero}`;

  return (
    <main className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-5">
      <NavCompras actual="/admin/proyectos/proveedores/comprobantes" />
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted"><Link href="/admin/proyectos/proveedores/comprobantes" className="underline">Comprobantes</Link> › {c.supplier.name}</p>
          <h1 className="break-words text-2xl font-bold text-strong">{titulo}{c.anulado && <span className="ml-2 text-base font-medium text-danger">Anulado</span>}</h1>
          <p className="text-sm text-muted">{fechaCorta(c.fecha)} · cargó {c.cargadoNombre}{c.supplier.taxId ? ` · CUIT ${c.supplier.taxId}` : ""}</p>
        </div>
        {c.adjunto && (
          <a href={`/admin/proyectos/proveedores/comprobantes/${c.id}/adjunto`} target="_blank" rel="noopener" className={buttonClasses("outline", "md")}>
            Ver el {c.adjunto.tipoMime === "application/pdf" ? "PDF" : "comprobante"}
          </a>
        )}
      </header>

      <section aria-label="Importes" className="grid gap-3 sm:grid-cols-4">
        {[["Neto", neto], ["IVA", iva], ["Total", c.total], ["Falta pagar", c.porPagar]].map(([k, v]) => (
          <div key={k as string} className={tarjeta}>
            <p className="text-xs text-muted">{k}</p>
            <p className="text-xl font-bold text-strong">{plata(v as number)}</p>
          </div>
        ))}
      </section>
      {c.vinculada && (
        <p className={cn(tarjeta, "text-sm text-strong")}>
          Sociedad vinculada · referencia <strong>{c.referenciaVinculada ?? "sin referencia"}</strong> · modelo de compra {c.modeloCompra === "CADA_UNA_COMPRA" ? "cada una compra a su nombre" : c.modeloCompra}
          {c.modeloCompraProvisional && <span className="text-muted"> (provisional a confirmar)</span>}
        </p>
      )}

      <section aria-labelledby="imputacion" className={tarjeta}>
        <h2 id="imputacion" className="mb-1 font-semibold text-strong">Imputación</h2>
        <p className="mb-3 text-sm text-muted">A qué proyecto o a administración va cada parte. El IVA que es crédito fiscal no suma al costo del proyecto.</p>
        {carga && !c.anulado ? (
          <EditorImputacion
            comprobanteId={c.id}
            netoCentavos={neto}
            ivaCentavos={iva}
            tratamientoPorDefecto={porDefecto.tratamiento}
            provisional={porDefecto.provisional}
            proyectos={proyectos.map((x) => ({ id: x.id, label: `#${x.numero} ${x.nombre}` }))}
            categorias={p.listas.categorias}
            categoriasAdministracion={p.listas.categoriasAdministracion}
            sectores={p.listas.sectores}
            iniciales={c.lineas.map((l) => ({ destino: l.proyecto?.id ?? "ADMINISTRACION", categoria: l.categoria, sector: l.sector ?? "", netoCentavos: Number(l.netoCentavos), ivaCentavos: Number(l.ivaCentavos), tratamiento: l.ivaTratamiento === "COSTO" ? "COSTO" : "CREDITO" }))}
          />
        ) : c.lineas.length === 0 ? (
          <p className="text-sm text-muted">Sin imputar.</p>
        ) : (
          <ul className="grid gap-1 text-sm">
            {c.lineas.map((l) => (
              <li key={l.id} className="flex flex-wrap justify-between gap-2 border-t border-line pt-1">
                <span>{l.proyecto ? `#${l.proyecto.numero} ${l.proyecto.nombre}` : "Administración"} · {l.categoria}{l.sector ? ` · ${l.sector}` : ""}</span>
                <span>{plata(Number(l.netoCentavos) + Number(l.ivaCentavos))} · IVA: {TRATAMIENTO_LABEL[l.ivaTratamiento] ?? l.ivaTratamiento}{l.ivaProvisional ? " (provisional)" : ""}</span>
              </li>
            ))}
            <li className="pt-1 font-semibold text-strong">Falta imputar: {plata(c.total - imputado)}</li>
          </ul>
        )}
      </section>

      <section aria-labelledby="cuotas" className={tarjeta}>
        <h2 id="cuotas" className="mb-1 font-semibold text-strong">Cuotas del calendario que factura</h2>
        <p className="mb-3 text-sm text-muted">Enlazada, la cuota deja de contar como «previsto» (la cuenta este comprobante) y se paga con una orden de pago.</p>
        {c.cuotas.length === 0 ? (
          <p className="text-sm text-muted">No tiene cuotas enlazadas.</p>
        ) : (
          <ul className="grid gap-2 text-sm">
            {c.cuotas.map(({ cuota: q }) => (
              <li key={q.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2">
                <span>{q.concepto}{q.proyecto ? ` · #${q.proyecto.numero} ${q.proyecto.nombre}` : ""} · vence {fechaCorta(q.venceEl)} · {pesos(q.monto)}{q.pagadoEl ? " · pagada" : ""}</span>
                {carga && !q.pagadoEl && (
                  <FormAccion accion={desenlazarCuota}>
                    <input type="hidden" name="cuotaId" value={q.id} />
                    <SubmitButton className={buttonClasses("ghost", "sm")}>Desenlazar</SubmitButton>
                  </FormAccion>
                )}
              </li>
            ))}
          </ul>
        )}
        {carga && !c.anulado && c.enlazables.length > 0 && (
          <FormAccion accion={enlazarCuota} className="mt-3 flex flex-wrap items-end gap-2">
            <input type="hidden" name="comprobanteId" value={c.id} />
            <label className={cn(etiqueta, "min-w-0 flex-1")}>
              Enlazar una cuota de este proveedor
              <select name="cuotaId" required className={campo}>
                {c.enlazables.map((q) => <option key={q.id} value={q.id}>{q.concepto}{q.proyecto ? ` · #${q.proyecto.numero}` : ""} · {fechaCorta(q.venceEl)} · {pesos(q.monto)}{q.moneda !== "ARS" ? ` ${q.moneda}` : ""}</option>)}
              </select>
            </label>
            <SubmitButton className={buttonClasses("outline", "md")}>Enlazar</SubmitButton>
          </FormAccion>
        )}
      </section>

      <section aria-labelledby="pagos" className={tarjeta}>
        <h2 id="pagos" className="mb-1 font-semibold text-strong">Órdenes de pago</h2>
        {c.ordenes.length === 0 ? (
          <p className="text-sm text-muted">Ninguna orden lo paga todavía.</p>
        ) : (
          <ul className="grid gap-1 text-sm">
            {c.ordenes.map((o) => (
              <li key={o.orden.id} className="flex flex-wrap justify-between gap-2 border-t border-line pt-1">
                <Link href={`/admin/proyectos/proveedores/ordenes/${o.orden.id}`} className="underline">{numeroDeOrden(o.orden.numero)}</Link>
                <span>{plata(o.importeCentavos)} · {ESTADO_ORDEN_LABEL[o.orden.estado as EstadoOrden] ?? o.orden.estado}</span>
              </li>
            ))}
          </ul>
        )}
        {paga && !c.anulado && c.saldo > 0 && (
          <FormAccion accion={crearOrdenDesdeForm} claveDeEnvio className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1fr)_auto] sm:items-end">
            <input type="hidden" name="supplierId" value={c.supplier.id} />
            <input type="hidden" name="comprobanteId" value={c.id} />
            <label className={etiqueta}>Importe<input name="importe" required inputMode="decimal" defaultValue={textoDeCentavos(c.saldo)} className={campo} /></label>
            <label className={etiqueta}>
              Cancela la cuota
              <select name="cuotaId" defaultValue="" className={campo}>
                <option value="">Ninguna en particular</option>
                {cuotasSinOrden.map((q) => <option key={q.id} value={q.id}>{q.concepto} · {pesos(q.monto)}</option>)}
              </select>
            </label>
            <label className={etiqueta}>
              Se paga con
              <select name="medio" defaultValue="TRANSFERENCIA" className={campo}>
                {MEDIOS.map((m) => <option key={m} value={m}>{MEDIO_LABEL[m]}</option>)}
              </select>
            </label>
            <SubmitButton className={buttonClasses("solid", "md")}>Crear orden de pago</SubmitButton>
            <p className="text-xs text-muted sm:col-span-4">Falta pagar sin orden: {plata(c.saldo)}. La orden la aprueba y la paga otra persona de Administración.</p>
          </FormAccion>
        )}
      </section>

      {carga && !c.anulado && ordenesVivas.length === 0 && (
        <FormAccion accion={anularComprobante} className="flex justify-end">
          <input type="hidden" name="id" value={c.id} />
          <SubmitButton className={buttonClasses("ghost", "md")}>Anular el comprobante</SubmitButton>
        </FormAccion>
      )}
    </main>
  );
}
