"use server";

// ============================================================================
// ADMINISTRACIÓN — escrituras. Cada acción vuelve a pedir el permiso y acota por negocio; los cambios de plata quedan en el
// registro. Marcar una cuota de PROYECTO vive en acciones-ficha.ts: acá están las de la empresa, sin proyecto.
// ============================================================================

import { cuentaParaCuota } from "./gestion-cuentas.server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { tenantTransaction } from "@/lib/rls";
import { auditAdmin } from "@/lib/audit-core";
import { transferenciaEnElLibroTx } from "@/lib/caja/transferencia-en-el-libro";
import type { Prisma } from "@/generated/prisma/client";
import { leerNumero, MEDIOS, metodoDeCaja, redondear, type MedioPago } from "./core";
import { aPesos, extrasDelPeriodo, leerExtracto, MONEDAS } from "./gestion-core";
import { actorActual, avisar, exigirEditar, registrarCambio, tiposDeCambio } from "./gestion.server";
import { marcaDeGastoProyecto } from "./marcas";
import { etiquetaMes, extrasRecalculados, leerExtras, lineasNuevas, periodoValido, totalLiquidacion, type ExtraGuardado } from "./empresa-core";
import type { Resultado } from "./acciones";

const ADMIN = "/admin/proyectos/administracion";
/** Un extracto de varios meses entra de sobra, y no pasa el límite de lo que recibe una acción del servidor. */
const MAX_EXTRACTO = 500_000;
const MAX_LINEAS_EXTRACTO = 5000;

const txt = (v: FormDataEntryValue | null): string => String(v ?? "").trim();
const numero = (v: FormDataEntryValue | null): number => leerNumero(String(v ?? ""));
const fecha = (v: FormDataEntryValue | null): Date | null => {
  const s = txt(v);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T12:00:00-03:00`) : null;
};
const moneda = (v: FormDataEntryValue | null): string => ((MONEDAS as readonly string[]).includes(txt(v)) ? txt(v) : "ARS");

function refrescar() {
  revalidatePath(ADMIN);
  revalidatePath("/admin/proyectos/direccion");
  revalidatePath("/admin/proyectos/inicio");
}

const marcaDeCuota = (id: string) => marcaDeGastoProyecto(`cuota-${id}`);

// ── Cuotas ──────────────────────────────────────────────────────────────────

export async function crearPagoEmpresa(formData: FormData): Promise<Resultado> {
  const a = await exigirEditar("empresa");
  const concepto = txt(formData.get("concepto")).slice(0, 200);
  if (!concepto) return { ok: false, error: "Escribí qué hay que pagar." };
  const monto = redondear(numero(formData.get("monto")));
  if (!(monto > 0)) return { ok: false, error: "Escribí el monto." };
  const venceEl = fecha(formData.get("venceEl"));
  if (!venceEl) return { ok: false, error: "Elegí cuándo vence." };
  const supplierId = txt(formData.get("supplierId")) || null;
  if (supplierId && !(await prisma.supplier.findFirst({ where: { id: supplierId, tenantId: a.tenantId }, select: { id: true } }))) return { ok: false, error: "Ese proveedor no existe." };
  const mon = moneda(formData.get("moneda"));
  await tenantTransaction(async (tx) => {
    const c = await tx.proyectoCuota.create({
      data: { tenantId: a.tenantId, proyectoId: null, supplierId, tipo: "PAGO", concepto, monto, moneda: mon, venceEl, factura: txt(formData.get("factura")).slice(0, 60) || null },
      select: { id: true },
    });
    await registrarCambio(tx, { tenantId: a.tenantId, entidad: "cuota", entidadId: c.id, campo: "alta de pago de empresa", despues: `${concepto} · ${mon} ${monto}`, autor: a.nombre });
  });
  refrescar();
  return { ok: true };
}

/** Las cuentas para elegir al marcar un cobro o un pago. */
export async function cuentasParaMarcar(): Promise<{ id: string; nombre: string; moneda: string }[]> {
  const a = await exigirEditar("empresa");
  return prisma.proyectoCuentaBanco.findMany({ where: { tenantId: a.tenantId }, orderBy: { createdAt: "asc" }, select: { id: true, nombre: true, moneda: true } });
}

/** Marca pagada una cuota de la empresa y asienta el movimiento. El `where` con `pagadoEl: null` es lo que frena el doble clic. */
export async function marcarCuotaEmpresa(formData: FormData): Promise<Resultado> {
  const a = await exigirEditar("empresa");
  const id = txt(formData.get("id"));
  const medio = txt(formData.get("medio")) as MedioPago;
  if (!MEDIOS.includes(medio)) return { ok: false, error: "Elegí el medio de pago." };
  const c = await prisma.proyectoCuota.findFirst({
    where: { id, tenantId: a.tenantId, proyectoId: null },
    select: { id: true, tipo: true, concepto: true, monto: true, moneda: true, supplier: { select: { name: true } } },
  });
  if (!c) return { ok: false, error: "Ese pago no existe." };
  const amount = aPesos(c.monto, c.moneda, await tiposDeCambio(a.tenantId));
  if (!(amount > 0)) return { ok: false, error: "Falta el tipo de cambio: cargalo en Monedas y gastos fijos." };
  const cuenta = await cuentaParaCuota(a.tenantId, formData, { tipo: c.tipo, monto: c.monto, moneda: c.moneda, importeEnPesos: amount });
  if (typeof cuenta === "string") return { ok: false, error: cuenta };
  const hecho = await tenantTransaction(async (tx) => {
    const r = await tx.proyectoCuota.updateMany({ where: { id, tenantId: a.tenantId, proyectoId: null, pagadoEl: null, anuladoEl: null }, data: { pagadoEl: new Date(), pagadoPor: a.nombre, medio } });
    if (r.count === 0) return false;
    if (cuenta) {
      await tx.proyectoCuota.updateMany({ where: { id, tenantId: a.tenantId }, data: { cuentaId: cuenta.id, cuentaMovido: cuenta.movido } });
      await tx.proyectoCuentaBanco.updateMany({ where: { id: cuenta.id, tenantId: a.tenantId }, data: { saldo: { increment: cuenta.movido } } });
    }
    const session = await tx.cashSession.findFirst({ where: { tenantId: a.tenantId, status: "OPEN" }, select: { id: true } });
    await tx.cashMovement.create({
      data: {
        tenantId: a.tenantId,
        sessionId: session?.id ?? null,
        type: c.tipo === "COBRO" ? "INGRESO" : "EGRESO",
        method: metodoDeCaja(medio, await transferenciaEnElLibroTx(tx)),
        amount,
        reason: `Empresa · ${c.concepto}${c.supplier ? ` · ${c.supplier.name}` : ""}${medio === "CHEQUE" ? " · Cheque" : ""}`,
        createdBy: marcaDeCuota(id),
      },
    });
    await registrarCambio(tx, { tenantId: a.tenantId, entidad: "cuota", entidadId: id, campo: "pago de empresa", antes: "pendiente", despues: `pagada · ${medio} · $ ${amount}`, autor: a.nombre });
    return true;
  });
  if (!hecho) return { ok: false, error: "Ese pago ya estaba marcado." };
  await auditAdmin({ action: "proyecto.cuota-empresa.pagar", entity: "ProyectoCuota", entityId: id, changes: { amount, medio } });
  refrescar();
  return { ok: true };
}

/** Anular no borra. Si ya se pagó, la plata vuelve al libro con fecha de hoy, como un gasto anulado. */
export async function anularCuotaEmpresa(formData: FormData): Promise<Resultado> {
  const a = await exigirEditar("empresa");
  const id = txt(formData.get("id"));
  const hecho = await tenantTransaction(async (tx) => {
    const r = await tx.proyectoCuota.updateMany({ where: { id, tenantId: a.tenantId, proyectoId: null, anuladoEl: null }, data: { anuladoEl: new Date() } });
    if (r.count === 0) return false;
    const c = await tx.proyectoCuota.findFirst({ where: { id, tenantId: a.tenantId }, select: { concepto: true, tipo: true, monto: true, moneda: true, cuentaId: true, cuentaMovido: true } });
    if (c?.cuentaId && c.cuentaMovido) await tx.proyectoCuentaBanco.updateMany({ where: { id: c.cuentaId, tenantId: a.tenantId }, data: { saldo: { decrement: c.cuentaMovido } } });
    const salida = c?.tipo === "COBRO" ? "INGRESO" : "EGRESO";
    const pago = await tx.cashMovement.findFirst({ where: { tenantId: a.tenantId, createdBy: marcaDeCuota(id), type: salida }, select: { amount: true, method: true } });
    if (pago) {
      const session = await tx.cashSession.findFirst({ where: { tenantId: a.tenantId, status: "OPEN" }, select: { id: true } });
      await tx.cashMovement.create({
        data: {
          tenantId: a.tenantId,
          sessionId: session?.id ?? null,
          type: salida === "EGRESO" ? "INGRESO" : "EGRESO",
          method: pago.method,
          amount: pago.amount,
          reason: `Anulación · Empresa · ${c?.concepto ?? ""}`,
          createdBy: marcaDeCuota(id),
        },
      });
    }
    await registrarCambio(tx, { tenantId: a.tenantId, entidad: "cuota", entidadId: id, campo: "anulación de pago de empresa", antes: `${c?.moneda} ${c?.monto}`, despues: pago ? "anulada, con vuelta al libro" : "anulada", autor: a.nombre });
    return true;
  });
  if (!hecho) return { ok: false, error: "Ese pago ya estaba anulado." };
  await auditAdmin({ action: "proyecto.cuota-empresa.anular", entity: "ProyectoCuota", entityId: id, changes: {} });
  refrescar();
  return { ok: true };
}

/** Factura y comentario, de cualquier cuota del negocio. */
export async function guardarDatoCuota(formData: FormData): Promise<Resultado> {
  const a = await exigirEditar("empresa");
  const id = txt(formData.get("id"));
  const campo = txt(formData.get("campo"));
  if (campo !== "factura" && campo !== "comentario") return { ok: false, error: "Ese dato no se puede cambiar." };
  const valor = txt(formData.get("valor")).slice(0, campo === "factura" ? 60 : 300) || null;
  const c = await prisma.proyectoCuota.findFirst({ where: { id, tenantId: a.tenantId }, select: { proyectoId: true, factura: true, comentario: true } });
  if (!c) return { ok: false, error: "Esa cuota no existe." };
  await prisma.proyectoCuota.updateMany({ where: { id, tenantId: a.tenantId }, data: { [campo]: valor } });
  await registrarCambio(prisma, { tenantId: a.tenantId, proyectoId: c.proyectoId, entidad: "cuota", entidadId: id, campo, antes: c[campo], despues: valor, autor: a.nombre });
  revalidatePath(ADMIN);
  return { ok: true };
}

// ── Bancos ──────────────────────────────────────────────────────────────────

export async function crearCuenta(formData: FormData): Promise<Resultado> {
  const a = await exigirEditar("empresa");
  const nombre = txt(formData.get("nombre")).slice(0, 80);
  if (!nombre) return { ok: false, error: "Escribí el nombre de la cuenta." };
  const c = await prisma.proyectoCuentaBanco.create({ data: { tenantId: a.tenantId, nombre, moneda: moneda(formData.get("moneda")), saldo: redondear(numero(formData.get("saldo"))) }, select: { id: true, saldo: true } });
  await registrarCambio(prisma, { tenantId: a.tenantId, entidad: "cuenta", entidadId: c.id, campo: "saldo", despues: c.saldo, autor: a.nombre });
  refrescar();
  return { ok: true };
}

export async function guardarSaldo(formData: FormData): Promise<Resultado> {
  const a = await exigirEditar("empresa");
  const id = txt(formData.get("id"));
  const c = await prisma.proyectoCuentaBanco.findFirst({ where: { id, tenantId: a.tenantId }, select: { saldo: true } });
  if (!c) return { ok: false, error: "Esa cuenta no existe." };
  const saldo = redondear(numero(formData.get("saldo")));
  await prisma.proyectoCuentaBanco.updateMany({ where: { id, tenantId: a.tenantId }, data: { saldo } });
  await registrarCambio(prisma, { tenantId: a.tenantId, entidad: "cuenta", entidadId: id, campo: "saldo", antes: c.saldo, despues: saldo, autor: a.nombre });
  refrescar();
  return { ok: true };
}

export async function importarExtracto(formData: FormData): Promise<Resultado<{ importadas: number; repetidas: number; ilegibles: number }>> {
  const a = await exigirEditar("empresa");
  const cuentaId = txt(formData.get("cuentaId"));
  const csv = String(formData.get("csv") ?? "");
  if (!csv.trim()) return { ok: false, error: "El archivo está vacío." };
  if (csv.length > MAX_EXTRACTO) return { ok: false, error: "El extracto es demasiado grande: subilo de a un período por vez." };
  if (!(await prisma.proyectoCuentaBanco.findFirst({ where: { id: cuentaId, tenantId: a.tenantId }, select: { id: true } }))) return { ok: false, error: "Elegí una cuenta." };
  const { lineas, ilegibles } = leerExtracto(csv);
  if (lineas.length === 0) return { ok: false, error: `No se entendió ninguna línea (${ilegibles} sin leer). Tiene que ser fecha;descripción;importe.` };
  if (lineas.length > MAX_LINEAS_EXTRACTO) return { ok: false, error: `Un extracto puede tener hasta ${MAX_LINEAS_EXTRACTO} líneas: subilo de a un período por vez.` };
  const existentes = await prisma.proyectoMovBanco.findMany({ where: { tenantId: a.tenantId, cuentaId, fecha: { gte: new Date(Math.min(...lineas.map((l) => l.fecha.getTime())) - 86_400_000) } }, select: { fecha: true, descripcion: true, importe: true } });
  const nuevas = lineasNuevas(lineas, existentes);
  const lote = `Extracto ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;
  if (nuevas.length > 0) {
    await prisma.proyectoMovBanco.createMany({ data: nuevas.map((l) => ({ tenantId: a.tenantId, cuentaId, fecha: l.fecha, descripcion: l.descripcion.slice(0, 300), importe: redondear(l.importe), lote })) });
  }
  await auditAdmin({ action: "proyecto.extracto", entity: "ProyectoCuentaBanco", entityId: cuentaId, changes: { importadas: nuevas.length, repetidas: lineas.length - nuevas.length, ilegibles } });
  revalidatePath(ADMIN);
  return { ok: true, importadas: nuevas.length, repetidas: lineas.length - nuevas.length, ilegibles };
}

/** Conciliar sólo ata el movimiento a la cuota: marcarla pagada es otra decisión, que la pantalla ofrece después. */
export async function conciliarMovimiento(formData: FormData): Promise<Resultado> {
  const a = await exigirEditar("empresa");
  const id = txt(formData.get("id"));
  const cuotaId = txt(formData.get("cuotaId"));
  const [m, c] = await Promise.all([
    prisma.proyectoMovBanco.findFirst({ where: { id, tenantId: a.tenantId }, select: { importe: true } }),
    prisma.proyectoCuota.findFirst({ where: { id: cuotaId, tenantId: a.tenantId, anuladoEl: null }, select: { tipo: true, concepto: true, proyectoId: true } }),
  ]);
  if (!m || !c) return { ok: false, error: "Ese movimiento o esa cuota ya no existen." };
  if ((c.tipo === "COBRO") !== m.importe > 0) return { ok: false, error: "El movimiento y la cuota van en sentidos opuestos." };
  if (await prisma.proyectoMovBanco.findFirst({ where: { tenantId: a.tenantId, cuotaId }, select: { id: true } })) return { ok: false, error: "Esa cuota ya está conciliada con otro movimiento." };
  const r = await prisma.proyectoMovBanco.updateMany({ where: { id, tenantId: a.tenantId, cuotaId: null }, data: { cuotaId } });
  if (r.count === 0) return { ok: false, error: "Ese movimiento ya estaba conciliado." };
  await registrarCambio(prisma, { tenantId: a.tenantId, proyectoId: c.proyectoId, entidad: "movimiento", entidadId: id, campo: "conciliación", despues: c.concepto, autor: a.nombre });
  revalidatePath(ADMIN);
  return { ok: true };
}

export async function desconciliarMovimiento(formData: FormData): Promise<Resultado> {
  const a = await exigirEditar("empresa");
  const id = txt(formData.get("id"));
  const m = await prisma.proyectoMovBanco.findFirst({ where: { id, tenantId: a.tenantId }, select: { cuota: { select: { concepto: true, proyectoId: true } } } });
  if (!m?.cuota) return { ok: false, error: "Ese movimiento no está conciliado." };
  await prisma.proyectoMovBanco.updateMany({ where: { id, tenantId: a.tenantId }, data: { cuotaId: null } });
  await registrarCambio(prisma, { tenantId: a.tenantId, proyectoId: m.cuota.proyectoId, entidad: "movimiento", entidadId: id, campo: "conciliación", antes: m.cuota.concepto, autor: a.nombre });
  revalidatePath(ADMIN);
  return { ok: true };
}

// ── Monedas y gastos fijos ──────────────────────────────────────────────────

export async function guardarTipoCambio(formData: FormData): Promise<Resultado> {
  const a = await exigirEditar("empresa");
  const porUnidad = redondear(numero(formData.get("porUnidad")));
  if (!(porUnidad > 0)) return { ok: false, error: "Escribí cuántos pesos vale un dólar." };
  const previo = await prisma.proyectoTipoCambio.findFirst({ where: { tenantId: a.tenantId, moneda: "USD" }, select: { porUnidad: true } });
  await prisma.proyectoTipoCambio.upsert({ where: { tenantId_moneda: { tenantId: a.tenantId, moneda: "USD" } }, create: { tenantId: a.tenantId, moneda: "USD", porUnidad }, update: { porUnidad } });
  await registrarCambio(prisma, { tenantId: a.tenantId, entidad: "tipoCambio", entidadId: "USD", campo: "pesos por dólar", antes: previo?.porUnidad, despues: porUnidad, autor: a.nombre });
  refrescar();
  return { ok: true };
}

/** Alta si no viene `id`; edición si viene. */
export async function guardarGastoFijo(formData: FormData): Promise<Resultado> {
  const a = await exigirEditar("empresa");
  const id = txt(formData.get("id"));
  const nombre = txt(formData.get("nombre")).slice(0, 120);
  if (!nombre) return { ok: false, error: "Escribí el nombre." };
  const monto = redondear(numero(formData.get("monto")));
  if (!(monto > 0)) return { ok: false, error: "Escribí el monto." };
  const frecuencia = ["MENSUAL", "ANUAL", "UNICO"].includes(txt(formData.get("frecuencia"))) ? txt(formData.get("frecuencia")) : "MENSUAL";
  const fechaGasto = fecha(formData.get("fecha"));
  // Sin fecha, la proyección nunca sabría en qué mes cae.
  if (frecuencia !== "MENSUAL" && !fechaGasto) return { ok: false, error: "Un gasto anual o único necesita fecha." };
  const data = { tipo: txt(formData.get("tipo")) === "IMPUESTO" ? "IMPUESTO" : "FIJO", nombre, frecuencia, monto, moneda: moneda(formData.get("moneda")), fecha: fechaGasto };
  if (id) {
    const g = await prisma.proyectoGastoFijo.findFirst({ where: { id, tenantId: a.tenantId }, select: { monto: true, moneda: true } });
    if (!g) return { ok: false, error: "Ese gasto no existe." };
    await prisma.proyectoGastoFijo.updateMany({ where: { id, tenantId: a.tenantId }, data });
    await registrarCambio(prisma, { tenantId: a.tenantId, entidad: "gastoFijo", entidadId: id, campo: `monto de ${nombre}`, antes: `${g.moneda} ${g.monto}`, despues: `${data.moneda} ${monto}`, autor: a.nombre });
  } else {
    const g = await prisma.proyectoGastoFijo.create({ data: { tenantId: a.tenantId, ...data }, select: { id: true } });
    await registrarCambio(prisma, { tenantId: a.tenantId, entidad: "gastoFijo", entidadId: g.id, campo: `alta de ${nombre}`, despues: `${data.moneda} ${monto}`, autor: a.nombre });
  }
  refrescar();
  return { ok: true };
}

export async function bajaGastoFijo(formData: FormData): Promise<Resultado> {
  const a = await exigirEditar("empresa");
  const id = txt(formData.get("id"));
  const g = await prisma.proyectoGastoFijo.findFirst({ where: { id, tenantId: a.tenantId, activo: true }, select: { nombre: true, monto: true, moneda: true } });
  if (!g) return { ok: false, error: "Ese gasto ya no está." };
  await prisma.proyectoGastoFijo.updateMany({ where: { id, tenantId: a.tenantId }, data: { activo: false } });
  await registrarCambio(prisma, { tenantId: a.tenantId, entidad: "gastoFijo", entidadId: id, campo: `baja de ${g.nombre}`, antes: `${g.moneda} ${g.monto}`, autor: a.nombre });
  refrescar();
  return { ok: true };
}

// ── Liquidaciones ───────────────────────────────────────────────────────────

/** Base + plus de los eventos terminados en el mes. Lo publicado no se toca; lo cargado a mano en un borrador se conserva. */
export async function generarLiquidaciones(formData: FormData): Promise<Resultado<{ generadas: number; publicadas: number }>> {
  const a = await exigirEditar("liquidaciones");
  const periodo = txt(formData.get("periodo"));
  if (!periodoValido(periodo)) return { ok: false, error: "Elegí el mes." };
  const [personas, actuales] = await Promise.all([
    prisma.proyectoPersona.findMany({
      where: { tenantId: a.tenantId, activa: true },
      select: { id: true, nombre: true, sueldoBase: true, facturaA: true, equipos: { where: { proyecto: { perdidoEl: null } }, select: { plus: true, proyecto: { select: { id: true, nombre: true, fechaEvento: true, fechaFin: true } } } } },
    }),
    prisma.proyectoLiquidacion.findMany({ where: { tenantId: a.tenantId, periodo }, select: { id: true, personaId: true, estado: true, extras: true, total: true } }),
  ]);
  const publicadas = actuales.filter((l) => l.estado !== "BORRADOR").length;
  let generadas = 0;
  await tenantTransaction(async (tx) => {
    for (const p of personas) {
      const previa = actuales.find((l) => l.personaId === p.id);
      if (previa && previa.estado !== "BORRADOR") continue;
      const delPeriodo = extrasDelPeriodo(p.equipos, periodo);
      if (!previa && !(p.sueldoBase > 0) && delPeriodo.length === 0) continue;
      const extras = extrasRecalculados(leerExtras(previa?.extras), delPeriodo);
      const total = totalLiquidacion(p.sueldoBase, extras);
      const datos = { base: p.sueldoBase, extras: extras as unknown as Prisma.InputJsonValue, total, facturaA: p.facturaA };
      if (previa) {
        // Si alguien la publicó recién, este where la deja como está.
        const r = await tx.proyectoLiquidacion.updateMany({ where: { id: previa.id, tenantId: a.tenantId, estado: "BORRADOR" }, data: datos });
        if (r.count === 0) continue;
      } else {
        await tx.proyectoLiquidacion.createMany({ data: [{ tenantId: a.tenantId, personaId: p.id, periodo, ...datos }], skipDuplicates: true });
      }
      generadas++;
      await registrarCambio(tx, { tenantId: a.tenantId, entidad: "liquidacion", entidadId: previa?.id ?? p.id, campo: `total ${periodo} de ${p.nombre}`, antes: previa?.total, despues: total, autor: a.nombre });
    }
  });
  revalidatePath(ADMIN);
  return { ok: true, generadas, publicadas };
}

export async function publicarBorradores(formData: FormData): Promise<Resultado<{ publicadas: number }>> {
  const a = await exigirEditar("liquidaciones");
  const periodo = txt(formData.get("periodo"));
  if (!periodoValido(periodo)) return { ok: false, error: "Elegí el mes." };
  const borradores = await prisma.proyectoLiquidacion.findMany({ where: { tenantId: a.tenantId, periodo, estado: "BORRADOR" }, select: { id: true, total: true, persona: { select: { nombre: true, userId: true } } } });
  if (borradores.length === 0) return { ok: false, error: "No hay borradores para publicar en este mes." };
  await tenantTransaction(async (tx) => {
    await tx.proyectoLiquidacion.updateMany({ where: { tenantId: a.tenantId, periodo, estado: "BORRADOR", id: { in: borradores.map((b) => b.id) } }, data: { estado: "PUBLICADA", publicadaEl: new Date() } });
    await avisar(tx, {
      tenantId: a.tenantId,
      destinatarios: borradores.map((b) => b.persona.userId ?? ""),
      tipo: "liquidacion",
      texto: `Ya está publicada tu liquidación de ${etiquetaMes(periodo)}.`,
      enlace: `/admin/proyectos/mi-liquidacion?periodo=${periodo}`,
    });
    for (const b of borradores) {
      await registrarCambio(tx, { tenantId: a.tenantId, entidad: "liquidacion", entidadId: b.id, campo: `publicación ${periodo} de ${b.persona.nombre}`, antes: "borrador", despues: `publicada · $ ${b.total}`, autor: a.nombre });
    }
  });
  await auditAdmin({ action: "proyecto.liquidacion.publicar", entity: "ProyectoLiquidacion", entityId: periodo, changes: { cantidad: borradores.length } });
  revalidatePath(ADMIN);
  revalidatePath("/admin/proyectos/mi-liquidacion");
  return { ok: true, publicadas: borradores.length };
}

/** Reemplaza la base y los extras manuales. Los que salen de los eventos quedan como están. Un descuento va en negativo. */
export async function editarExtrasLiquidacion(d: { id: string; base?: string; manuales: readonly { nombre: string; monto: string }[] }): Promise<Resultado> {
  const a = await exigirEditar("liquidaciones");
  const l = await prisma.proyectoLiquidacion.findFirst({ where: { id: String(d.id ?? ""), tenantId: a.tenantId }, select: { id: true, periodo: true, base: true, extras: true, total: true, estado: true } });
  if (!l) return { ok: false, error: "Esa liquidación no existe." };
  if (l.estado !== "BORRADOR") return { ok: false, error: "Ya está publicada: no se puede cambiar." };
  const manuales: ExtraGuardado[] = (Array.isArray(d.manuales) ? d.manuales : [])
    .slice(0, 30)
    .map((m) => ({ proyectoId: null, nombre: String(m.nombre ?? "").trim().slice(0, 120), monto: redondear(leerNumero(String(m.monto ?? ""))), manual: true }))
    .filter((m) => m.nombre || m.monto !== 0);
  if (manuales.some((m) => !m.nombre)) return { ok: false, error: "Cada extra necesita un concepto." };
  if (manuales.some((m) => m.monto === 0)) return { ok: false, error: "Cada extra necesita un monto." };
  const extras = [...leerExtras(l.extras).filter((e) => !e.manual), ...manuales];
  const base = d.base === undefined ? l.base : redondear(leerNumero(String(d.base)));
  if (base < 0) return { ok: false, error: "La base no puede ser negativa." };
  const total = totalLiquidacion(base, extras);
  if (total < 0) return { ok: false, error: "El total no puede quedar negativo." };
  const r = await prisma.proyectoLiquidacion.updateMany({ where: { id: l.id, tenantId: a.tenantId, estado: "BORRADOR" }, data: { base, extras: extras as unknown as Prisma.InputJsonValue, total } });
  if (r.count === 0) return { ok: false, error: "Ya está publicada: no se puede cambiar." };
  await registrarCambio(prisma, { tenantId: a.tenantId, entidad: "liquidacion", entidadId: l.id, campo: `total ${l.periodo}`, antes: l.total, despues: total, autor: a.nombre });
  revalidatePath(ADMIN);
  return { ok: true };
}

/**
 * «Visto» lo marca sólo la persona dueña, al abrirla de verdad: por eso es una acción y no una escritura al armar la página.
 * Pide `actorActual` y no un módulo: cualquiera puede abrir la suya.
 */
export async function marcarLiquidacionVista(id: string): Promise<void> {
  const a = await actorActual();
  if (!a.personaId) return;
  await prisma.proyectoLiquidacion.updateMany({ where: { id: String(id ?? ""), tenantId: a.tenantId, personaId: a.personaId, estado: "PUBLICADA", vistaEl: null }, data: { vistaEl: new Date() } });
}
