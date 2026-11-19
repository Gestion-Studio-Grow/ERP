"use server";

// ============================================================================
// Órdenes de pago a proveedor (MIA-50 T05 · O33). Una orden agrupa pagos a UN proveedor y dice qué comprobantes y
// cuotas cancela. El número es correlativo por negocio (contador en la misma transacción: sin huecos ni repetidos).
// Pagar asienta UN egreso en caja (índice único por orden y tipo). Quien cargó un comprobante de la orden no la aprueba.
// ============================================================================

import { textoAlCentavo } from "@/lib/dinero/redondeo";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { tenantTransaction } from "@/lib/rls";
import { auditAdmin } from "@/lib/audit-core";
import { centavosDe } from "@/lib/dinero/redondeo";
import { esTablaInexistente } from "@/lib/rendiciones/pin-core";
import { transferenciaEnElLibroTx } from "@/lib/caja/transferencia-en-el-libro";
import { Prisma } from "@/generated/prisma/client";
import { MEDIO_LABEL, MEDIOS, metodoDeCaja, type MedioPago } from "./core";
import { veLaPlata } from "./datos.server";
import { actorActual, puede, registrarCambio, type Actor } from "./gestion.server";
import { exigirCodigoEnElMomento } from "./segundo-factor.server";
import { asentarEnCajaTx, rechazoDePeriodo, transaccionQueAsienta } from "./periodo-cerrado.server";
import { marcaDeGastoProyecto } from "./marcas";
import { esClaveRepetida } from "./rendiciones-core";
import { claveDeEnvio } from "./pago-columnas";
import { errorDeAprobacion, errorDeOrden, numeroDeOrden, SERIE_ORDEN_PAGO, type ComprobanteParaOrden, type LineaDeOrden } from "./orden-pago-core";
import { SIN_M1, tomarCuotas } from "./comprobantes.server";
import { centavosDelTexto } from "./comprobantes-core";
import { fotoEnPesos, type FotoEnPesos } from "./moneda-bancos-core";
import { cambioDelMovimiento, cambiosDeComprobantes, cuentaDelNegocio, enPesosDelComprobante, fotoDe, guardarFotoTx, hayM8, hoyArgentina, moverCuentaTx, revertirCuentaTx } from "./moneda-bancos.server";

export type Resultado<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const RAIZ = "/admin/proyectos";
const n = (v: bigint | number): number => Number(v);
/** La marca del asiento: el libro ya la reconoce como del sistema (no se borra desde ahí) y la clasifica como gasto de proyecto. */
const marcaDeOrden = (id: string) => marcaDeGastoProyecto(`orden-${id}`);

function refrescar(proyectoIds: readonly (string | null)[] = []) {
  revalidatePath(`${RAIZ}/proveedores`);
  revalidatePath(`${RAIZ}/administracion`);
  revalidatePath(`${RAIZ}/direccion`);
  for (const id of new Set(proyectoIds)) if (id) revalidatePath(`${RAIZ}/${id}`);
}

/** Las órdenes son de Administración: editar Pagos y ver la plata del negocio. */
async function actorDePagos(): Promise<Actor | string> {
  const a = await actorActual();
  if (!puede(a, "pagos", "editar")) return "Para las órdenes de pago hace falta el permiso de editar Pagos: pedíselo a quien administra.";
  if (!veLaPlata(a.user)) return "Tu usuario no ve la plata del negocio: las órdenes de pago son de Administración.";
  return a;
}

async function conM1<T>(hacer: () => Promise<Resultado<T>>): Promise<Resultado<T>> {
  try {
    return await hacer();
  } catch (e) {
    if (esTablaInexistente(e)) return { ok: false, error: SIN_M1 };
    const cerrado = rechazoDePeriodo(e);
    if (cerrado) return { ok: false, error: cerrado };
    throw e;
  }
}

class Rechazo extends Error {}

/** El próximo número de la serie, en la transacción: si la orden no se crea, el número vuelve (no deja huecos). */
async function proximoNumeroTx(tx: Prisma.TransactionClient, tenantId: string, serie: string): Promise<number> {
  const [{ ultimo }] = await tx.$queryRaw<{ ultimo: number }[]>`
    INSERT INTO "ProyectoNumerador" ("tenantId", "serie", "ultimo") VALUES (${tenantId}, ${serie}, 1)
    ON CONFLICT ("tenantId", "serie") DO UPDATE SET "ultimo" = "ProyectoNumerador"."ultimo" + 1
    RETURNING "ultimo"`;
  return Number(ultimo);
}

// ── Crear ───────────────────────────────────────────────────────────────────

export interface LineaOrdenDelForm {
  comprobanteId: string;
  cuotaId: string | null;
  importeCentavos: number;
}

/**
 * Crea la orden (queda «para aprobar y pagar»). Toma con candado los comprobantes que paga, así dos órdenes a la vez no
 * pagan dos veces el mismo saldo. Idempotente por `claveEnvio`.
 */
export async function crearOrdenPago(d: { supplierId: string; medio: string; claveEnvio?: string; lineas: LineaOrdenDelForm[] }): Promise<Resultado<{ id: string; numero: number }>> {
  const a = await actorDePagos();
  if (typeof a === "string") return { ok: false, error: a };
  const { tenantId, user } = a;
  const medio = String(d.medio ?? "") as MedioPago;
  if (!MEDIOS.includes(medio)) return { ok: false, error: "Elegí cómo se va a pagar." };
  const supplierId = String(d.supplierId ?? "");
  const lineas: LineaDeOrden[] = (Array.isArray(d.lineas) ? d.lineas : []).map((l) => ({
    comprobanteId: String(l.comprobanteId ?? ""),
    cuotaId: l.cuotaId ? String(l.cuotaId) : null,
    importeCentavos: Number(l.importeCentavos),
  }));
  if (lineas.length > 40) return { ok: false, error: "Hasta 40 renglones por orden." };
  const clave = claveDeEnvio(d.claveEnvio ?? null);
  return conM1<{ id: string; numero: number }>(async () => {
    try {
      const creada = await tenantTransaction(async (tx) => {
        const ids = [...new Set(lineas.map((l) => l.comprobanteId))].sort();
        if (ids.length > 0) {
          // Candado en orden fijo (sin abrazo mortal): la segunda orden espera y lee el saldo ya tomado por la primera.
          await tx.$queryRaw`SELECT "id" FROM "ProyectoComprobante" WHERE "tenantId" = ${tenantId} AND "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR UPDATE`;
        }
        // CERT-4b: después, las cuotas de la orden (el candado de `marcarCuota` y `enlazarCuota`): una pagada no entra.
        const cuotasTomadas = await tomarCuotas(tx, tenantId, lineas.flatMap((l) => (l.cuotaId ? [l.cuotaId] : [])));
        const filas = await tx.proyectoComprobante.findMany({
          where: { tenantId, id: { in: ids } },
          select: {
            id: true, supplierId: true, totalCentavos: true, anuladoEl: true, cargadoPorId: true,
            pagos: { where: { orden: { estado: { not: "ANULADA" } } }, select: { importeCentavos: true, cuotaId: true } },
            cuotas: { select: { cuota: { select: { id: true, monto: true } } } },
          },
        });
        const mapa = new Map<string, ComprobanteParaOrden>(
          filas.map((c) => [
            c.id,
            {
              id: c.id,
              supplierId: c.supplierId,
              totalCentavos: n(c.totalCentavos),
              anulado: !!c.anuladoEl,
              cargadoPorId: c.cargadoPorId,
              enOrdenesCentavos: c.pagos.reduce((s, p) => s + n(p.importeCentavos), 0),
              cuotas: c.cuotas.map(({ cuota }) => ({
                id: cuota.id,
                montoCentavos: centavosDe(cuota.monto),
                enOrdenesCentavos: c.pagos.filter((p) => p.cuotaId === cuota.id).reduce((s, p) => s + n(p.importeCentavos), 0),
                pagada: cuotasTomadas.get(cuota.id)?.pagado ?? false,
              })),
            },
          ]),
        );
        const error = errorDeOrden(supplierId, lineas, mapa);
        if (error) throw new Rechazo(error);
        const numero = await proximoNumeroTx(tx, tenantId, SERIE_ORDEN_PAGO);
        const total = lineas.reduce((s, l) => s + l.importeCentavos, 0);
        const o = await tx.proyectoOrdenPago.create({
          data: {
            tenantId,
            numero,
            supplierId,
            estado: "PENDIENTE",
            totalCentavos: BigInt(total),
            medio,
            claveEnvio: clave,
            creadaPorId: user.id,
            creadaNombre: user.name,
          },
          select: { id: true, numero: true },
        });
        // Las líneas aparte: el `tenantId` es de dos relaciones compuestas (orden y comprobante) y Prisma no lo acepta anidado.
        await tx.proyectoOrdenPagoLinea.createMany({
          data: lineas.map((l) => ({ tenantId, ordenId: o.id, comprobanteId: l.comprobanteId, cuotaId: l.cuotaId, importeCentavos: BigInt(l.importeCentavos) })),
        });
        await registrarCambio(tx, { tenantId, entidad: "ProyectoOrdenPago", entidadId: o.id, campo: "Orden de pago creada", despues: `${numeroDeOrden(numero)} · ${textoAlCentavo(total / 100)}`, autor: user.name });
        return o;
      });
      await auditAdmin({ action: "proyecto.orden-pago.crear", entity: "ProyectoOrdenPago", entityId: creada.id, changes: { numero: creada.numero, medio } });
      refrescar();
      return { ok: true, id: creada.id, numero: creada.numero };
    } catch (e) {
      if (e instanceof Rechazo) return { ok: false, error: e.message };
      if (esClaveRepetida(e) && clave) {
        const misma = await prisma.proyectoOrdenPago.findFirst({ where: { tenantId, claveEnvio: clave }, select: { id: true, numero: true } });
        if (misma) return { ok: true, id: misma.id, numero: misma.numero };
      }
      throw e;
    }
  });
}

/** El formulario de una orden de un renglón (un comprobante y, si se elige, la cuota que cancela): importe en pesos. */
export async function crearOrdenDesdeForm(formData: FormData): Promise<Resultado<{ id: string; numero: number; listo: string }>> {
  // La misma puerta que `crearOrdenPago`, a la vista: la matriz A1 lee la de cada acción exportada.
  const puerta = await actorDePagos();
  if (typeof puerta === "string") return { ok: false, error: puerta };
  const txt = (k: string) => String(formData.get(k) ?? "").trim();
  const r = await crearOrdenPago({
    supplierId: txt("supplierId"),
    medio: txt("medio"),
    claveEnvio: txt("claveEnvio") || undefined,
    lineas: [{ comprobanteId: txt("comprobanteId"), cuotaId: txt("cuotaId") || null, importeCentavos: centavosDelTexto(txt("importe")) }],
  });
  return r.ok ? { ...r, listo: `${numeroDeOrden(r.numero)} creada: la aprueba y la paga otra persona de Administración.` } : r;
}

// ── Aprobar y pagar ─────────────────────────────────────────────────────────

/**
 * Aprueba y paga la orden: UN egreso en caja por el total (dos clics no pagan dos veces: el estado cambia con
 * `updateMany` condicionado y el asiento tiene índice único por orden). La cuota que queda cubierta se marca pagada.
 */
export async function aprobarYPagarOrden(formData: FormData): Promise<Resultado> {
  const a = await actorDePagos();
  if (typeof a === "string") return { ok: false, error: a };
  const { tenantId, user } = a;
  // MIA-50 T11 (O47, D10): pagar pide el código de la app en este momento (o la ventana de 10 min de pagos seguidos).
  const sinCodigo = await exigirCodigoEnElMomento(user, formData, "pagar");
  if (sinCodigo) return { ok: false, error: sinCodigo };
  const id = String(formData.get("id") ?? "").trim();
  return conM1<object>(async () => {
    const o = await prisma.proyectoOrdenPago.findFirst({
      where: { tenantId, id },
      select: {
        id: true, numero: true, estado: true, totalCentavos: true, medio: true,
        supplier: { select: { name: true } },
        lineas: { select: { cuotaId: true, comprobanteId: true, importeCentavos: true, comprobante: { select: { cargadoPorId: true, moneda: true } } } },
      },
    });
    if (!o) return { ok: false, error: "Esa orden de pago no existe." };
    // T08 · O31: una orden en otra moneda sale en pesos al cambio del día del pago. La diferencia contra lo que costó
    // cada comprobante (su foto) es «Diferencia de cambio» de Administración: el costo del proyecto no se mueve.
    const monedas = [...new Set(o.lineas.map((l) => l.comprobante.moneda))];
    if (monedas.length > 1) return { ok: false, error: "La orden mezcla comprobantes en monedas distintas: hacé una orden por moneda." };
    const monedaOrden = monedas[0] ?? "ARS";
    let fotoOrden: { foto: FotoEnPesos; cambioDia: string | null; diferenciaCentavos: number } = { foto: fotoEnPesos("ARS", n(o.totalCentavos) / 100, 100), cambioDia: null, diferenciaCentavos: 0 };
    if (monedaOrden !== "ARS") {
      const cambio = await cambioDelMovimiento(prisma, tenantId, monedaOrden, hoyArgentina());
      if (!cambio.ok) return { ok: false, error: cambio.error };
      const foto = fotoEnPesos(monedaOrden, n(o.totalCentavos) / 100, cambio.cambioCentavos);
      const cambios = await cambiosDeComprobantes(prisma, tenantId, o.lineas.map((l) => ({ id: l.comprobanteId, moneda: l.comprobante.moneda })));
      const registrado = o.lineas.reduce((s, l) => s + enPesosDelComprobante(n(l.importeCentavos), l.comprobante.moneda, cambios.get(l.comprobanteId)), 0);
      fotoOrden = { foto, cambioDia: cambio.dia, diferenciaCentavos: foto.pesosCentavos - registrado };
    }
    // T08 · O38: la orden pagada por transferencia sale de una cuenta del negocio (una sola vez; vuelve al anular).
    const cuentaId = String(formData.get("cuentaId") ?? "").trim();
    if (cuentaId && !(await hayM8())) return { ok: false, error: "Para elegir la cuenta falta una actualización de la base. Pagala sin cuenta." };
    if (cuentaId && !(await cuentaDelNegocio(prisma, tenantId, cuentaId))) return { ok: false, error: "Esa cuenta no existe." };
    const error = errorDeAprobacion(user.id, [...new Set(o.lineas.map((l) => l.comprobante.cargadoPorId))]);
    if (error) return { ok: false, error };
    if (o.estado !== "PENDIENTE") return { ok: false, error: "Esa orden ya estaba pagada o anulada." };
    const medio = o.medio as MedioPago;
    const cuotaIds = [...new Set(o.lineas.map((l) => l.cuotaId).filter((x): x is string => !!x))];
    const comprobanteIds = [...new Set(o.lineas.map((l) => l.comprobanteId))].sort();
    const r = await transaccionQueAsienta(async (tx) => {
      // Un comprobante anulado no se paga (O27 · O33, CERT-2b). Se mira con el candado que toman la anulación y
      // `crearOrdenPago`, en el mismo orden fijo.
      if (comprobanteIds.length > 0) {
        const filas = await tx.$queryRaw<{ anuladoEl: Date | null }[]>`
          SELECT "anuladoEl" FROM "ProyectoComprobante" WHERE "tenantId" = ${tenantId} AND "id" IN (${Prisma.join(comprobanteIds)})
          ORDER BY "id" FOR UPDATE`;
        if (filas.some((f) => f.anuladoEl !== null)) return { pagada: false, anulado: true, cuotaPagada: false, proyectos: [] as (string | null)[] };
      }
      // CERT-4b: las cuotas de la orden, con su candado y después de los comprobantes. Una que ya figura pagada (a mano,
      // antes de este arreglo o por una carrera) no se paga otra vez: la orden queda pendiente para anularla.
      const tomadas = await tomarCuotas(tx, tenantId, cuotaIds);
      if ([...tomadas.values()].some((q) => q.pagado)) return { pagada: false, anulado: false, cuotaPagada: true, proyectos: [] as (string | null)[] };
      const u = await tx.proyectoOrdenPago.updateMany({
        where: { tenantId, id, estado: "PENDIENTE" },
        data: { estado: "PAGADA", aprobadaPorId: user.id, aprobadaNombre: user.name, pagadaEl: new Date() },
      });
      if (u.count === 0) return { pagada: false, anulado: false, cuotaPagada: false, proyectos: [] as (string | null)[] };
      const session = await tx.cashSession.findFirst({ where: { tenantId, status: "OPEN" }, select: { id: true } });
      await asentarEnCajaTx(tx, "pago", {
        tenantId,
        sessionId: session?.id ?? null,
        type: "EGRESO",
        method: metodoDeCaja(medio, await transferenciaEnElLibroTx(tx)),
        amount: fotoOrden.foto.pesosCentavos / 100,
        reason: `${numeroDeOrden(o.numero)} · ${o.supplier.name}${medio === "CHEQUE" ? " · Cheque" : ""}`,
        proyectoOrdenPagoId: id,
        createdBy: marcaDeOrden(id),
      });
      await guardarFotoTx(tx, tenantId, { origenTipo: "ORDEN_PAGO", origenId: id, foto: fotoOrden.foto, cambioDia: fotoOrden.cambioDia, diferenciaCentavos: fotoOrden.diferenciaCentavos });
      if (cuentaId) await moverCuentaTx(tx, tenantId, { cuentaId, origenTipo: "ORDEN_PAGO", origenId: id, importeEnPesos: -fotoOrden.foto.pesosCentavos / 100 });
      // La cuota cubierta por órdenes pagadas queda pagada; con saldo, sigue abierta.
      const proyectos: (string | null)[] = [];
      if (cuotaIds.length > 0) {
        const cuotas = await tx.proyectoCuota.findMany({
          where: { tenantId, id: { in: cuotaIds }, pagadoEl: null },
          select: { id: true, monto: true, proyectoId: true, pagosEnOrden: { where: { orden: { estado: "PAGADA" } }, select: { importeCentavos: true } } },
        });
        for (const q of cuotas) {
          const pagado = q.pagosEnOrden.reduce((s, p) => s + n(p.importeCentavos), 0);
          if (pagado < centavosDe(q.monto)) continue;
          await tx.proyectoCuota.updateMany({ where: { tenantId, id: q.id, pagadoEl: null }, data: { pagadoEl: new Date(), pagadoPor: numeroDeOrden(o.numero), medio } });
          await registrarCambio(tx, { tenantId, proyectoId: q.proyectoId, entidad: "ProyectoCuota", entidadId: q.id, campo: "Pagada", despues: `${numeroDeOrden(o.numero)} · ${MEDIO_LABEL[medio]}`, autor: user.name });
          proyectos.push(q.proyectoId);
        }
      }
      await registrarCambio(tx, { tenantId, entidad: "ProyectoOrdenPago", entidadId: id, campo: "Orden de pago pagada", despues: MEDIO_LABEL[medio], autor: user.name });
      return { pagada: true, anulado: false, cuotaPagada: false, proyectos };
    });
    if (r.anulado) return { ok: false, error: "Uno de los comprobantes de esta orden está anulado: no se paga. Anulá la orden." };
    if (r.cuotaPagada) return { ok: false, error: "Una cuota de esta orden ya está pagada: no se paga dos veces. Anulá la orden." };
    if (!r.pagada) return { ok: false, error: "Esa orden ya estaba pagada o anulada." };
    await auditAdmin({ action: "proyecto.orden-pago.pagar", entity: "ProyectoOrdenPago", entityId: id, changes: { medio } });
    refrescar(r.proyectos);
    return { ok: true };
  });
}

// ── Anular ──────────────────────────────────────────────────────────────────

/**
 * Anula la orden. Pendiente: sólo cambia de estado (no salió plata). Pagada: asienta la vuelta (un ingreso por el mismo
 * total, también único) y reabre las cuotas que había marcado pagadas. No se borra nada.
 */
export async function anularOrden(formData: FormData): Promise<Resultado> {
  const a = await actorDePagos();
  if (typeof a === "string") return { ok: false, error: a };
  const { tenantId, user } = a;
  const id = String(formData.get("id") ?? "").trim();
  return conM1<object>(async () => {
    const o = await prisma.proyectoOrdenPago.findFirst({
      where: { tenantId, id },
      select: { id: true, numero: true, estado: true, totalCentavos: true, medio: true, supplier: { select: { name: true } }, lineas: { select: { cuotaId: true } } },
    });
    if (!o) return { ok: false, error: "Esa orden de pago no existe." };
    if (o.estado === "ANULADA") return { ok: false, error: "Esa orden ya estaba anulada." };
    const medio = o.medio as MedioPago;
    const cuotaIds = [...new Set(o.lineas.map((l) => l.cuotaId).filter((x): x is string => !!x))];
    const r = await transaccionQueAsienta(async (tx) => {
      const u = await tx.proyectoOrdenPago.updateMany({ where: { tenantId, id, estado: o.estado }, data: { estado: "ANULADA", anuladaEl: new Date(), anuladaPor: user.name } });
      if (u.count === 0) return { anulada: false, proyectos: [] as (string | null)[] };
      const proyectos: (string | null)[] = [];
      if (o.estado === "PAGADA") {
        const session = await tx.cashSession.findFirst({ where: { tenantId, status: "OPEN" }, select: { id: true } });
        // T08: vuelve lo que salió en pesos (en otra moneda, al cambio del pago) y el banco, exacto.
        const foto = await fotoDe(tx, tenantId, "ORDEN_PAGO", id);
        await revertirCuentaTx(tx, tenantId, "ORDEN_PAGO", id);
        await asentarEnCajaTx(tx, "anulación", {
          tenantId,
          sessionId: session?.id ?? null,
          type: "INGRESO",
          method: metodoDeCaja(medio, await transferenciaEnElLibroTx(tx)),
          amount: (foto ? n(foto.pesosCentavos) : n(o.totalCentavos)) / 100,
          reason: `Anulación ${numeroDeOrden(o.numero)} · ${o.supplier.name}`,
          proyectoOrdenPagoId: id,
          createdBy: marcaDeOrden(id),
        });
        if (cuotaIds.length > 0) {
          const reabiertas = await tx.proyectoCuota.findMany({ where: { tenantId, id: { in: cuotaIds }, pagadoPor: numeroDeOrden(o.numero) }, select: { id: true, proyectoId: true } });
          await tx.proyectoCuota.updateMany({ where: { tenantId, id: { in: reabiertas.map((q) => q.id) } }, data: { pagadoEl: null, pagadoPor: null, medio: null } });
          for (const q of reabiertas) {
            await registrarCambio(tx, { tenantId, proyectoId: q.proyectoId, entidad: "ProyectoCuota", entidadId: q.id, campo: "Pagada", antes: numeroDeOrden(o.numero), despues: null, autor: user.name });
            proyectos.push(q.proyectoId);
          }
        }
      }
      await registrarCambio(tx, { tenantId, entidad: "ProyectoOrdenPago", entidadId: id, campo: "Orden de pago anulada", despues: user.name, autor: user.name });
      return { anulada: true, proyectos };
    });
    if (!r.anulada) return { ok: false, error: "Esa orden cambió mientras tanto: recargá la página." };
    await auditAdmin({ action: "proyecto.orden-pago.anular", entity: "ProyectoOrdenPago", entityId: id, changes: { estabaPagada: o.estado === "PAGADA" } });
    refrescar(r.proyectos);
    return { ok: true };
  });
}
