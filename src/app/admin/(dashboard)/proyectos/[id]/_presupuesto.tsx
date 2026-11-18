// MIA T06 · lo nuevo del presupuesto en la ficha: detalle de las líneas del borrador (O08), adicionales (O09 y O11) y la
// previsión de pagos por línea (O12). Sin M2 aplicada (Gate 2) no se muestra nada: la ficha sigue como hoy.

import { prisma } from "@/lib/prisma";
import { Badge, buttonClasses, cn } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import { agregarLineaAdicional, aprobarAdicionalInterno, borrarLineaAdicional, crearAdicional, enviarAdicional, guardarAnticipoLinea, guardarLineaDetalle, marcarPrevision, responderAdicional } from "@/lib/proyectos/acciones-presupuesto";
import { fechaCorta, porcentaje } from "@/lib/proyectos/core";
import { plataEn } from "@/lib/proyectos/gestion-core";
import { parametrosDelNegocio } from "@/lib/proyectos/parametros/leer.server";
import { anticipoDeLaLinea, cantidadDeLaLinea, ESTADO_ADICIONAL_LABEL, subtotalCentavos, totalesDelAdicional } from "@/lib/proyectos/presupuesto-core";
import { adicionalesDelProyecto, detallesDeLineas, estadosDePrevision, hayM2 } from "@/lib/proyectos/presupuesto-m2.server";
import type { Actor } from "@/lib/proyectos/gestion.server";
import type { Vista } from "@/lib/proyectos/ficha.server";
import { campo, etiqueta, tarjeta } from "../_vista";
import { BotonConConfirmacion, FormAccion } from "./_cliente";
import { Numero } from "./_pestanas-datos";

interface Linea {
  id: string;
  descripcion: string;
  cantidad: number;
  costo: number;
  moneda: string;
  proveedor: string | null;
  supplierId: string | null;
}

const centavos = (n: number) => plataEn(n / 100, "ARS");

/** «(provisional a confirmar)» al lado de lo que todavía es un valor del rubro sin confirmar con el negocio (R8). */
function Provisional({ si }: { si: boolean }) {
  return si ? <span className="text-xs text-muted"> (provisional a confirmar)</span> : null;
}

function Opciones({ valores, actual }: { valores: readonly string[]; actual: string | null }) {
  // Un valor guardado que ya no está en la lista se sigue viendo: guardar exige elegir uno de la lista.
  const todas = actual && !valores.includes(actual) ? [actual, ...valores] : valores;
  return todas.map((v) => <option key={v} value={v}>{v}</option>);
}

// ── O08 · detalle de las líneas del borrador ─────────────────────────────────

export async function DetalleDeLineas({ a, vista, lineas }: { a: Actor; vista: Vista; lineas: readonly Linea[] }) {
  if (lineas.length === 0 || !(await hayM2())) return null;
  const [detalles, par] = await Promise.all([detallesDeLineas(prisma, a.tenantId, lineas.map((l) => l.id)), parametrosDelNegocio(a.tenantId)]);
  const sectores = par["costos.sectores"];
  const categorias = par["costos.categorias"];
  const edita = vista.editaCotizaciones;
  const total = lineas.reduce((s, l) => s + l.cantidad * l.costo, 0);
  return (
    <section className={tarjeta} aria-label="Líneas del borrador">
      <h2 className="font-semibold text-strong">Líneas del borrador</h2>
      <p className="mb-3 text-sm text-muted">
        Sector y categoría salen de las listas del negocio
        <Provisional si={sectores.provisional || categorias.provisional} />. En una línea de personal, la cantidad es puestos × horas × días.
      </p>
      <ul className="grid gap-3">
        {lineas.map((l) => {
          const d = detalles.get(l.id);
          const personal = { puestos: d?.puestos ?? null, horas: d?.horas ?? null, dias: d?.dias ?? null };
          const cantidad = cantidadDeLaLinea(l.cantidad, personal);
          return (
            <li key={l.id} className="rounded-xl border border-line p-3">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-medium text-strong">{l.descripcion}</h3>
                <span className="text-sm tabular-nums text-body">
                  {cantidad} × {plataEn(l.costo, l.moneda)} = <strong className="text-strong">{plataEn(cantidad * l.costo, l.moneda)}</strong>
                </span>
              </div>
              <p className="mb-2 text-sm text-muted">Proveedor: {l.proveedor ?? "sin proveedor"}</p>
              {edita ? (
                <FormAccion accion={guardarLineaDetalle} className="grid grid-cols-1 gap-2 sm:grid-cols-5">
                  <input type="hidden" name="itemId" value={l.id} />
                  <label className={cn(etiqueta, "sm:col-span-1")}>
                    Sector
                    <select name="sector" defaultValue={d?.sector ?? ""} required className={campo}>
                      <option value="" disabled>Elegí</option>
                      <Opciones valores={sectores.valor} actual={d?.sector ?? null} />
                    </select>
                  </label>
                  <label className={cn(etiqueta, "sm:col-span-1")}>
                    Categoría
                    <select name="categoria" defaultValue={d?.categoria ?? ""} required className={campo}>
                      <option value="" disabled>Elegí</option>
                      <Opciones valores={categorias.valor} actual={d?.categoria ?? null} />
                    </select>
                  </label>
                  <label className={etiqueta}>Puestos<input name="puestos" inputMode="numeric" defaultValue={personal.puestos ?? ""} className={campo} /></label>
                  <label className={etiqueta}>Horas<input name="horas" inputMode="decimal" defaultValue={personal.horas != null ? String(personal.horas).replace(".", ",") : ""} className={campo} /></label>
                  <label className={etiqueta}>Días<input name="dias" inputMode="numeric" defaultValue={personal.dias ?? ""} className={campo} /></label>
                  <SubmitButton className={cn(buttonClasses("outline", "md"), "sm:col-span-5 sm:justify-self-start")}>Guardar línea</SubmitButton>
                </FormAccion>
              ) : (
                <p className="text-sm text-body">
                  {d?.sector ?? "Sin sector"} · {d?.categoria ?? "sin categoría"}
                  {personal.puestos != null && ` · ${personal.puestos} puestos × ${personal.horas} h × ${personal.dias} días`}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-right text-sm text-body">
        Total del costo: <strong className="tabular-nums text-strong">{plataEn(total, lineas[0].moneda)}</strong>
        {lineas.some((l) => l.moneda !== lineas[0].moneda) && <span className="text-muted"> (hay líneas en otra moneda: el total de la planilla las pasa al cambio)</span>}
      </p>
    </section>
  );
}

// ── O09 y O11 · adicionales ──────────────────────────────────────────────────

const TONO: Record<string, "neutral" | "success" | "danger"> = { APROBADO: "success", RECHAZADO: "danger" };

export async function Adicionales({ a, vista, proyectoId, baseAprobada }: { a: Actor; vista: Vista; proyectoId: string; baseAprobada: number | null }) {
  if (!(await hayM2())) return null;
  const edita = vista.editaCotizaciones;
  const [adicionales, par, proveedores] = await Promise.all([
    adicionalesDelProyecto(prisma, a.tenantId, proyectoId),
    parametrosDelNegocio(a.tenantId),
    edita ? prisma.supplier.findMany({ where: { tenantId: a.tenantId, active: true }, orderBy: { name: "asc" }, take: 500, select: { id: true, name: true } }) : [],
  ]);
  if (adicionales.length === 0 && (!edita || baseAprobada == null)) return null;
  const sectores = par["costos.sectores"].valor;
  const categorias = par["costos.categorias"].valor;
  const verCosto = vista.costos;
  return (
    <section className={tarjeta} aria-label="Adicionales">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-strong">Adicionales</h2>
        {edita && baseAprobada != null && (
          <FormAccion accion={crearAdicional} className="flex w-full flex-wrap items-center gap-2 sm:w-auto" limpiar>
            <input type="hidden" name="proyectoId" value={proyectoId} />
            <input name="nombre" required maxLength={120} aria-label="Qué es el adicional" placeholder="Qué es (p. ej., pantalla extra)" className={cn(campo, "flex-1 sm:w-64")} />
            <SubmitButton className={buttonClasses("solid", "md")}>Nuevo adicional</SubmitButton>
          </FormAccion>
        )}
      </div>
      <p className="mb-3 text-sm text-muted">Un cambio después de aprobada la versión base va como adicional: tiene sus líneas, su aprobación interna y la del cliente. Al aprobarse suma sus propias cuotas; las del base no cambian.</p>
      {adicionales.length === 0 && <p className="text-sm text-muted">Todavía no hay adicionales.</p>}
      <ul className="grid gap-3">
        {adicionales.map((ad) => {
          const t = totalesDelAdicional(ad);
          const borrador = ad.estado === "BORRADOR";
          return (
            <li key={ad.id} className="rounded-xl border border-line p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <h3 className="font-semibold text-strong">Adicional {ad.numero} · {ad.nombre}</h3>
                <Badge tone={TONO[ad.estado] ?? "neutral"}>{ESTADO_ADICIONAL_LABEL[ad.estado as keyof typeof ESTADO_ADICIONAL_LABEL] ?? ad.estado}</Badge>
                {ad.aprobadoInternoEl ? (
                  <span className="text-xs text-muted">Aprobado por {ad.aprobadoInternoPor} el {fechaCorta(ad.aprobadoInternoEl)}</span>
                ) : (
                  borrador && <span className="text-xs font-medium text-danger">Falta la aprobación interna</span>
                )}
              </div>
              <dl className="mb-2 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                {verCosto && <Numero titulo="Costo" valor={centavos(t.costo)} />}
                <Numero titulo="Precio sin IVA" valor={centavos(t.precio)} />
                <Numero titulo={`IVA ${porcentaje(ad.ivaPct)}`} valor={centavos(t.iva)} />
                <Numero titulo="Precio con IVA" valor={centavos(t.precioConIva)} />
              </dl>
              {ad.respondidoPor && <p className="mb-2 text-sm">Respondió {ad.respondidoPor} el {fechaCorta(ad.respondidoEl)}{ad.motivoRechazo && `: «${ad.motivoRechazo}»`}</p>}

              {ad.lineas.length > 0 && (
                <ul className="mb-2 grid gap-2">
                  {ad.lineas.map((l) => {
                    const cant = cantidadDeLaLinea(l.cantidad, l);
                    return (
                      <li key={l.id} className="grid gap-1 rounded-lg bg-surface px-3 py-2 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                        <div className="min-w-0">
                          <p className="font-medium text-strong">{l.detalle}</p>
                          <p className="text-muted">
                            {l.sector} · {l.categoria}
                            {l.proveedor && ` · ${l.proveedor}`}
                            {l.puestos != null && ` · ${l.puestos} puestos × ${l.horas} h × ${l.dias} días`}
                            {l.anticipoPct != null && ` · anticipo ${l.anticipoPct} %`}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 tabular-nums">
                          <span>
                            {cant} × {centavos(l.precioCentavos)} = <strong className="text-strong">{centavos(subtotalCentavos(l, l.precioCentavos))}</strong>
                            {verCosto && <span className="text-muted"> (costo {centavos(subtotalCentavos(l, l.costoCentavos))})</span>}
                          </span>
                          {borrador && edita && <BotonConConfirmacion accion={borrarLineaAdicional} ocultos={{ adicionalId: ad.id, lineaId: l.id }} texto="Borrar" textoConfirma="Sí, borrar la línea" etiqueta={`Borrar ${l.detalle}`} />}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              {borrador && edita && (
                <details className="mt-2 border-t border-line pt-2">
                  <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-strong">Agregar una línea</summary>
                  <FormAccion accion={agregarLineaAdicional} className="grid grid-cols-1 gap-2 pt-2 sm:grid-cols-4" limpiar>
                    <input type="hidden" name="adicionalId" value={ad.id} />
                    <label className={cn(etiqueta, "sm:col-span-2")}>Detalle<input name="detalle" required maxLength={200} className={campo} /></label>
                    <label className={etiqueta}>
                      Sector
                      <select name="sector" required defaultValue="" className={campo}>
                        <option value="" disabled>Elegí</option>
                        <Opciones valores={sectores} actual={null} />
                      </select>
                    </label>
                    <label className={etiqueta}>
                      Categoría
                      <select name="categoria" required defaultValue="" className={campo}>
                        <option value="" disabled>Elegí</option>
                        <Opciones valores={categorias} actual={null} />
                      </select>
                    </label>
                    <label className={cn(etiqueta, "sm:col-span-2")}>
                      Proveedor
                      <select name="supplierId" defaultValue="" className={campo}>
                        <option value="">Sin proveedor</option>
                        {proveedores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </label>
                    <label className={etiqueta}>Cantidad<input name="cantidad" inputMode="decimal" defaultValue="1" className={campo} /></label>
                    <label className={etiqueta}>Anticipo %<input name="anticipoPct" inputMode="numeric" placeholder="Del proveedor" className={campo} /></label>
                    <label className={etiqueta}>Puestos<input name="puestos" inputMode="numeric" className={campo} /></label>
                    <label className={etiqueta}>Horas<input name="horas" inputMode="decimal" className={campo} /></label>
                    <label className={etiqueta}>Días<input name="dias" inputMode="numeric" className={campo} /></label>
                    <span className="hidden sm:block" />
                    <label className={etiqueta}>Costo unitario ($)<input name="costo" inputMode="decimal" className={campo} /></label>
                    <label className={etiqueta}>Precio unitario sin IVA ($)<input name="precio" inputMode="decimal" className={campo} /></label>
                    <SubmitButton className={cn(buttonClasses("outline", "md"), "sm:col-span-2 sm:self-end")}>Agregar línea</SubmitButton>
                    <p className="text-sm text-muted sm:col-span-4">Personal: completá puestos, horas y días (los tres); la cantidad sale de multiplicarlos. Importes en pesos (provisional a confirmar).</p>
                  </FormAccion>
                </details>
              )}

              {borrador && edita && (
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                  {!ad.aprobadoInternoEl && a.rol === "DIRECCION" && (
                    <FormAccion accion={aprobarAdicionalInterno}>
                      <input type="hidden" name="adicionalId" value={ad.id} />
                      <SubmitButton className={buttonClasses("solid", "md")}>Aprobar adicional</SubmitButton>
                    </FormAccion>
                  )}
                  <FormAccion accion={enviarAdicional}>
                    <input type="hidden" name="adicionalId" value={ad.id} />
                    <SubmitButton className={buttonClasses(ad.aprobadoInternoEl ? "solid" : "outline", "md")}>Enviar al cliente</SubmitButton>
                  </FormAccion>
                  <p className="w-full text-sm text-muted">Lo aprueba alguien de Dirección que no esté en el equipo del proyecto. Sin esa aprobación no sale.</p>
                </div>
              )}

              {ad.estado === "ENVIADO" && edita && (
                <details className="mt-3 border-t border-line pt-2">
                  <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-strong">Registrar la respuesta del cliente</summary>
                  <FormAccion accion={responderAdicional} className="grid gap-2 pt-2 sm:grid-cols-2">
                    <input type="hidden" name="adicionalId" value={ad.id} />
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
  );
}

// ── O12 · previsión de pagos por línea ───────────────────────────────────────

export async function PrevisionDePagos({ a, vista, proyectoId, lineas }: { a: Actor; vista: Vista; proyectoId: string; lineas: readonly Linea[] }) {
  if (!vista.costos || lineas.length === 0 || !(await hayM2())) return null;
  const [detalles, cuotas, adicionales, par] = await Promise.all([
    detallesDeLineas(prisma, a.tenantId, lineas.map((l) => l.id)),
    prisma.proyectoCuota.findMany({ where: { tenantId: a.tenantId, proyectoId, tipo: "PAGO", anuladoEl: null, clave: { startsWith: `${proyectoId}:` } }, orderBy: { venceEl: "asc" }, select: { id: true, clave: true, concepto: true, monto: true, moneda: true, venceEl: true, pagadoEl: true } }),
    adicionalesDelProyecto(prisma, a.tenantId, proyectoId),
    parametrosDelNegocio(a.tenantId),
  ]);
  // Las líneas de los adicionales aprobados también tienen su anticipo y su saldo (claves `P:adic:<línea>:…`).
  const deAdicionales = adicionales.filter((ad) => ad.estado === "APROBADO").flatMap((ad) => ad.lineas.map((l) => ({ ...l, adicional: `Adicional ${ad.numero} · ${ad.nombre}` })));
  const proveedores = [...lineas.map((l) => l.supplierId), ...deAdicionales.map((l) => l.supplierId)].flatMap((s) => (s ? [s] : []));
  const fichas = await prisma.proyectoProveedorFicha.findMany({ where: { tenantId: a.tenantId, supplierId: { in: proveedores } }, select: { supplierId: true, anticipoPct: true } });
  const estados = await estadosDePrevision(prisma, a.tenantId, cuotas.map((c) => c.id));
  const delProveedor = new Map(fichas.map((f) => [f.supplierId, f.anticipoPct]));
  const palabras = par["prevision.palabras"];
  const editaPct = vista.editaCotizaciones || vista.editaPagos;
  const marca = vista.editaPagos && a.rol === "ADMINISTRACION";
  return (
    <section className={tarjeta} aria-label="Previsión de pagos">
      <h2 className="font-semibold text-strong">Previsión de pagos</h2>
      <p className="mb-3 text-sm text-muted">
        Por línea de la versión aprobada y de los adicionales aprobados: anticipo y saldo al proveedor, con fecha y monto sin IVA. Los estados «{palabras.valor.sinConfirmar}» y «{palabras.valor.confirmado}» los marca Administración
        <Provisional si={palabras.provisional} />.
      </p>
      <ul className="grid gap-3">
        {lineas.map((l) => {
          const d = detalles.get(l.id);
          const pct = anticipoDeLaLinea(d?.anticipoPct, l.supplierId ? delProveedor.get(l.supplierId) : undefined);
          const propias = cuotas.filter((c) => c.clave?.startsWith(`${proyectoId}:${l.id}:`));
          return (
            <li key={l.id} className="rounded-xl border border-line p-3">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-medium text-strong">{l.descripcion}</h3>
                <span className="text-sm text-body">
                  Anticipo {pct} % · saldo {100 - pct} %
                  {d?.anticipoPct == null && <span className="text-muted"> ({l.supplierId && delProveedor.has(l.supplierId) ? "del proveedor" : "por defecto"})</span>}
                </span>
              </div>
              <CuotasDeLaLinea cuotas={propias} estados={estados} palabras={palabras.valor} marca={marca} />
              {editaPct && (
                <FormAccion accion={guardarAnticipoLinea} className="mt-2 flex flex-wrap items-end gap-2">
                  <input type="hidden" name="itemId" value={l.id} />
                  <label className={cn(etiqueta, "w-40")}>Anticipo %<input name="anticipoPct" inputMode="numeric" defaultValue={d?.anticipoPct ?? ""} placeholder={String(pct)} className={campo} /></label>
                  <SubmitButton className={buttonClasses("outline", "md")}>Guardar porcentaje</SubmitButton>
                  <p className="w-full text-xs text-muted">Vacío vuelve al del proveedor. Lo ya pagado no cambia.</p>
                </FormAccion>
              )}
            </li>
          );
        })}
        {deAdicionales.map((l) => {
          const pct = anticipoDeLaLinea(l.anticipoPct, l.supplierId ? delProveedor.get(l.supplierId) : undefined);
          return (
            <li key={l.id} className="rounded-xl border border-line p-3">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-medium text-strong">
                  {l.detalle} <span className="text-sm font-normal text-muted">({l.adicional})</span>
                </h3>
                <span className="text-sm text-body">
                  Anticipo {pct} % · saldo {100 - pct} %
                  {l.anticipoPct == null && <span className="text-muted"> ({l.supplierId && delProveedor.has(l.supplierId) ? "del proveedor" : "por defecto"})</span>}
                </span>
              </div>
              <CuotasDeLaLinea cuotas={cuotas.filter((c) => c.clave?.startsWith(`${proyectoId}:adic:${l.id}:`))} estados={estados} palabras={palabras.valor} marca={marca} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

type CuotaDePago = { id: string; concepto: string; monto: Parameters<typeof plataEn>[0]; moneda: string; venceEl: Date; pagadoEl: Date | null };

/** Anticipo y saldo de una línea, con su estado de previsión y, para Administración, el botón para cambiarlo. */
function CuotasDeLaLinea({ cuotas, estados, palabras, marca }: { cuotas: CuotaDePago[]; estados: Awaited<ReturnType<typeof estadosDePrevision>>; palabras: Record<string, string>; marca: boolean }) {
  if (cuotas.length === 0) return <p className="text-sm text-muted">Sin cuotas a proveedor (la línea no tiene costo o el proyecto todavía no tiene plan de cuotas).</p>;
  return (
    <ul className="grid gap-2">
      {cuotas.map((c) => {
        const e = estados.get(c.id);
        return (
          <li key={c.id} className="grid gap-2 rounded-lg bg-surface px-3 py-2 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <div className="min-w-0">
              <p className="text-strong">{c.concepto}</p>
              <p className="tabular-nums text-muted">
                {fechaCorta(c.venceEl)} · {plataEn(c.monto, c.moneda)} sin IVA{c.pagadoEl && " · pagada"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={e?.confirmado ? "success" : "neutral"}>{e?.confirmado ? palabras.confirmado : palabras.sinConfirmar}</Badge>
              {e?.marcadoNombre && <span className="text-xs text-muted">{e.marcadoNombre}, {fechaCorta(e.marcadoEl)}</span>}
              {marca && (
                <FormAccion accion={marcarPrevision}>
                  <input type="hidden" name="cuotaId" value={c.id} />
                  <input type="hidden" name="estado" value={e?.confirmado ? "sinConfirmar" : "confirmado"} />
                  <SubmitButton className={buttonClasses("outline", "md")}>Marcar «{e?.confirmado ? palabras.sinConfirmar : palabras.confirmado}»</SubmitButton>
                </FormAccion>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
