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
import { actorActual, avisar, exigirEditar, puede, regenerarCuotasDe, registrarCambio, tiposDeCambio } from "./gestion.server";
import { marcaDeGastoProyecto } from "./marcas";
import { actorDelMotor, faltaLaMigracion, rendicionDelMotor, SIN_MIGRACION } from "./rendiciones-core";
import { puedeReintegrarRendicion } from "./gestion-core";
import { aplicarAccion } from "@/lib/rendiciones/rendicion";
import type { RolActor } from "@/lib/rendiciones/tipos";
import { conReintegros, etiquetaMes, extrasRecalculados, leerExtras, lineasNuevas, periodoValido, reintegrosCuadran, totalLiquidacion, type ExtraGuardado } from "./empresa-core";
import type { Resultado } from "./acciones";
import { listoMarcada } from "./avisos-cuota";

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
  const tipo = txt(formData.get("tipo")) === "COBRO" ? "COBRO" : "PAGO";
  const concepto = txt(formData.get("concepto")).slice(0, 200);
  if (!concepto) return { ok: false, error: tipo === "COBRO" ? "Escribí qué hay que cobrar." : "Escribí qué hay que pagar." };
  const monto = redondear(numero(formData.get("monto")));
  if (!(monto > 0)) return { ok: false, error: "Escribí el monto." };
  const venceEl = fecha(formData.get("venceEl"));
  if (!venceEl) return { ok: false, error: "Elegí cuándo vence." };
  const supplierId = tipo === "PAGO" ? txt(formData.get("supplierId")) || null : null;
  if (supplierId && !(await prisma.supplier.findFirst({ where: { id: supplierId, tenantId: a.tenantId }, select: { id: true } }))) return { ok: false, error: "Ese proveedor no existe." };
  const mon = moneda(formData.get("moneda"));
  await tenantTransaction(async (tx) => {
    const c = await tx.proyectoCuota.create({
      data: { tenantId: a.tenantId, proyectoId: null, supplierId, tipo, concepto, monto, moneda: mon, venceEl, factura: txt(formData.get("factura")).slice(0, 60) || null },
      select: { id: true },
    });
    await registrarCambio(tx, { tenantId: a.tenantId, entidad: "cuota", entidadId: c.id, campo: tipo === "COBRO" ? "alta de cobro de empresa" : "alta de pago de empresa", despues: `${concepto} · ${mon} ${monto}`, autor: a.nombre });
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
export async function marcarCuotaEmpresa(formData: FormData): Promise<Resultado<{ listo?: string }>> {
  const a = await exigirEditar("empresa");
  const id = txt(formData.get("id"));
  const medio = txt(formData.get("medio")) as MedioPago;
  if (!MEDIOS.includes(medio)) return { ok: false, error: "Elegí el medio de pago." };
  const c = await prisma.proyectoCuota.findFirst({
    where: { id, tenantId: a.tenantId, proyectoId: null },
    select: { id: true, tipo: true, concepto: true, monto: true, moneda: true, supplier: { select: { name: true } } },
  });
  if (!c) return { ok: false, error: "Esa cuota no existe." };
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
    await registrarCambio(tx, { tenantId: a.tenantId, entidad: "cuota", entidadId: id, campo: c.tipo === "COBRO" ? "cobro de empresa" : "pago de empresa", antes: "pendiente", despues: `${c.tipo === "COBRO" ? "cobrada" : "pagada"} · ${medio} · $ ${amount}`, autor: a.nombre });
    return true;
  });
  if (!hecho) return { ok: false, error: "Esa cuota ya estaba marcada." };
  await auditAdmin({ action: "proyecto.cuota-empresa.pagar", entity: "ProyectoCuota", entityId: id, changes: { amount, medio } });
  refrescar();
  return { ok: true, listo: listoMarcada(c.tipo === "COBRO", amount) };
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
  if (campo === "venceEl") {
    const texto = txt(formData.get("valor"));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return { ok: false, error: "Elegí una fecha." };
    const q = await prisma.proyectoCuota.findFirst({ where: { id, tenantId: a.tenantId, pagadoEl: null, anuladoEl: null }, select: { proyectoId: true, venceEl: true } });
    if (!q) return { ok: false, error: "Esa cuota ya se pagó o ya no corre." };
    const venceEl = new Date(`${texto}T12:00:00-03:00`);
    await prisma.proyectoCuota.updateMany({ where: { id, tenantId: a.tenantId }, data: { venceEl, venceManual: true } });
    await registrarCambio(prisma, { tenantId: a.tenantId, proyectoId: q.proyectoId, entidad: "cuota", entidadId: id, campo: "vencimiento", antes: q.venceEl.toISOString().slice(0, 10), despues: texto, autor: a.nombre });
    revalidatePath(ADMIN);
    return { ok: true };
  }
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
  if (lineas.length === 0) return { ok: false, error: `No se entendió ninguna línea (${ilegibles} sin leer). Tiene que tener fecha, descripción e importe.` };
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
  if (previo?.porUnidad !== porUnidad) await regenerarCuotasDe(a.tenantId, { OR: [{ moneda: "USD" }, { presupuestos: { some: { items: { some: { moneda: "USD" } } } } }] });
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

/** Rendí: lo que una liquidación puede reclamar. Sólo lo PROPIO, aprobado y que nadie reclamó ni reintegró todavía. */
const RECLAMABLE = { medio: "PROPIO", estado: "aprobada", liquidacionId: null, reintegradoEl: null } as const;

/** Las personas con reintegros por cobrar; `null` si la migración de Rendí no está aplicada (la liquidación sigue sin ellos). */
async function personasConReintegros(tenantId: string): Promise<Set<string> | null> {
  try {
    const filas = await prisma.proyectoRendicion.findMany({ where: { tenantId, ...RECLAMABLE }, select: { personaId: true }, distinct: ["personaId"] });
    return new Set(filas.map((f) => f.personaId));
  } catch (e) {
    if (faltaLaMigracion(e)) return null;
    throw e;
  }
}

/**
 * Rendí: la liquidación reclama los reintegros de la persona (claim `updateMany where liquidacionId IS NULL AND
 * reintegradoEl IS NULL AND estado = 'aprobada'`: un reintegro directo concurrente gana o pierde entero) y devuelve los
 * extras rehechos desde la base. Primero libera los que ya tenía y los vuelve a reclamar: regenerar no duplica.
 */
async function reclamarReintegrosTx(tx: Prisma.TransactionClient, tenantId: string, liquidacionId: string, personaId: string, extras: readonly ExtraGuardado[]): Promise<ExtraGuardado[]> {
  await tx.proyectoRendicion.updateMany({ where: { tenantId, liquidacionId, estado: "aprobada", reintegradoEl: null }, data: { liquidacionId: null } });
  await tx.proyectoRendicion.updateMany({ where: { tenantId, personaId, ...RECLAMABLE }, data: { liquidacionId } });
  const reclamadas = await tx.proyectoRendicion.findMany({ where: { tenantId, liquidacionId, estado: "aprobada" }, orderBy: { createdAt: "asc" }, select: { gastoId: true, proyectoId: true, montoCentavos: true, gasto: { select: { descripcion: true } } } });
  return conReintegros(extras, reclamadas.map((r) => ({ gastoId: r.gastoId, proyectoId: r.proyectoId, montoCentavos: r.montoCentavos, descripcion: r.gasto.descripcion })));
}

/**
 * Base + plus de los eventos terminados en el mes + reintegros de Rendí aprobados y sin reclamar. Lo publicado no se
 * toca; lo cargado a mano en un borrador se conserva.
 */
export async function generarLiquidaciones(formData: FormData): Promise<Resultado<{ generadas: number; publicadas: number }>> {
  const a = await exigirEditar("liquidaciones");
  const periodo = txt(formData.get("periodo"));
  if (!periodoValido(periodo)) return { ok: false, error: "Elegí el mes." };
  const [personas, actuales, conReintegro] = await Promise.all([
    prisma.proyectoPersona.findMany({
      where: { tenantId: a.tenantId, activa: true },
      select: { id: true, nombre: true, sueldoBase: true, facturaA: true, equipos: { where: { proyecto: { perdidoEl: null } }, select: { plus: true, proyecto: { select: { id: true, nombre: true, fechaEvento: true, fechaFin: true } } } } },
    }),
    prisma.proyectoLiquidacion.findMany({ where: { tenantId: a.tenantId, periodo }, select: { id: true, personaId: true, estado: true, extras: true, total: true } }),
    personasConReintegros(a.tenantId),
  ]);
  const publicadas = actuales.filter((l) => l.estado !== "BORRADOR").length;
  let generadas = 0;
  await tenantTransaction(async (tx) => {
    for (const p of personas) {
      const previa = actuales.find((l) => l.personaId === p.id);
      if (previa && previa.estado !== "BORRADOR") continue;
      const delPeriodo = extrasDelPeriodo(p.equipos, periodo);
      if (!previa && !(p.sueldoBase > 0) && delPeriodo.length === 0 && !conReintegro?.has(p.id)) continue;
      if (!previa) await tx.proyectoLiquidacion.createMany({ data: [{ tenantId: a.tenantId, personaId: p.id, periodo, base: p.sueldoBase, facturaA: p.facturaA }], skipDuplicates: true });
      // Toma la fila y confirma que sigue en borrador: si alguien la publicó recién, queda como está; si la publican
      // ahora, esperan a que esta transacción termine (el claim de reintegros y el total van juntos).
      const tomada = await tx.proyectoLiquidacion.updateMany({ where: { tenantId: a.tenantId, personaId: p.id, periodo, estado: "BORRADOR" }, data: { facturaA: p.facturaA } });
      if (tomada.count === 0) continue;
      // Los extras se leen con la fila ya tomada: lo que otra edición guardó recién no se pisa con una lectura vieja.
      const fila = await tx.proyectoLiquidacion.findFirstOrThrow({ where: { tenantId: a.tenantId, personaId: p.id, periodo }, select: { id: true, extras: true } });
      const id = fila.id;
      const sinReintegros = extrasRecalculados(leerExtras(fila.extras), delPeriodo);
      const extras = conReintegro ? await reclamarReintegrosTx(tx, a.tenantId, id, p.id, sinReintegros) : [...sinReintegros, ...leerExtras(fila.extras).filter((e) => e.reintegro)];
      const total = totalLiquidacion(p.sueldoBase, extras);
      await tx.proyectoLiquidacion.updateMany({ where: { id, tenantId: a.tenantId, estado: "BORRADOR" }, data: { base: p.sueldoBase, extras: extras as unknown as Prisma.InputJsonValue, total, facturaA: p.facturaA } });
      generadas++;
      await registrarCambio(tx, { tenantId: a.tenantId, entidad: "liquidacion", entidadId: id, campo: `total ${periodo} de ${p.nombre}`, antes: previa?.total, despues: total, autor: a.nombre });
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

/**
 * Rendí: pagar una liquidación publicada. PAGADA + un egreso por el total (clave única `proyectoLiquidacionId`: dos clics
 * = un egreso) + las rendiciones que reclamó pasan a reintegradas. Dirección o Administración; nadie se paga lo propio.
 */
/** Aborta la transacción del pago: los reintegros reclamados no coinciden con los del total. */
class Descuadre extends Error {}
const DESCUADRE = "Los reintegros de esta liquidación no cuadran con su total: no se pagó nada. Avisá a Dirección para revisarla.";

export async function pagarLiquidacion(formData: FormData): Promise<Resultado> {
  const a = await actorActual();
  const id = txt(formData.get("id"));
  const medioPedido = txt(formData.get("medio")) || "TRANSFERENCIA";
  if (!MEDIOS.includes(medioPedido as MedioPago)) return { ok: false, error: "Elegí cómo se pagó." };
  const medio = medioPedido as MedioPago;
  try {
    const l = await prisma.proyectoLiquidacion.findFirst({ where: { id, tenantId: a.tenantId }, select: { id: true, periodo: true, total: true, estado: true, personaId: true, persona: { select: { nombre: true, userId: true } } } });
    if (!l) return { ok: false, error: "Esa liquidación no existe." };
    const actorId = actorDelMotor({ personaId: a.personaId, userId: a.user.id });
    if (actorId === l.personaId || (!!l.persona.userId && l.persona.userId === a.user.id)) return { ok: false, error: "Nadie se paga lo propio: esta liquidación es tuya." };
    if (!puedeReintegrarRendicion(a.rol, actorId, l.personaId) || !puede(a, "liquidaciones", "editar")) return { ok: false, error: "Sólo Dirección o Administración, con permiso para editar liquidaciones, las pagan." };
    if (l.estado === "PAGADA") return { ok: false, error: "Esta liquidación ya está pagada." };
    if (l.estado !== "PUBLICADA") return { ok: false, error: "Primero publicala: se paga lo que la persona ya vio." };
    const ahora = new Date();
    const hecho = await tenantTransaction(async (tx) => {
      // El claim: dos clics o dos pestañas pagan una sola vez.
      const r = await tx.proyectoLiquidacion.updateMany({ where: { id, tenantId: a.tenantId, estado: "PUBLICADA" }, data: { estado: "PAGADA", pagadaEl: ahora, pagadaPor: a.nombre } });
      if (r.count === 0) return false;
      // Con la fila tomada: lo reclamado en la base tiene que ser lo que suma el total. Si no cuadra, no se paga nada.
      const fila = await tx.proyectoLiquidacion.findFirstOrThrow({ where: { id, tenantId: a.tenantId }, select: { extras: true } });
      const incluidas = await tx.proyectoRendicion.findMany({ where: { tenantId: a.tenantId, liquidacionId: id, estado: "aprobada" }, select: { id: true, gastoId: true, personaId: true, medio: true, anticipoId: true, montoCentavos: true, estado: true, eventos: true } });
      if (!reintegrosCuadran(leerExtras(fila.extras), incluidas)) throw new Descuadre();
      if (l.total > 0) {
        const session = await tx.cashSession.findFirst({ where: { tenantId: a.tenantId, status: "OPEN" }, select: { id: true } });
        await tx.cashMovement.create({
          data: {
            tenantId: a.tenantId,
            sessionId: session?.id ?? null,
            type: "EGRESO",
            method: metodoDeCaja(medio, await transferenciaEnElLibroTx(tx)),
            amount: redondear(l.total),
            reason: `Liquidación ${etiquetaMes(l.periodo)} · ${l.persona.nombre}${medio === "CHEQUE" ? " · Cheque" : ""}`,
            proyectoLiquidacionId: id,
            createdBy: marcaDeGastoProyecto(`liquidacion-${id}`),
          },
        });
      }
      for (const f of incluidas) {
        const res = aplicarAccion(rendicionDelMotor(f), "reintegrar", { fecha: ahora.toISOString(), actorId, rolActor: a.rol as RolActor, comentario: `Con la liquidación de ${etiquetaMes(l.periodo)}` });
        if (!res.ok) throw new Error(res.motivo);
        await tx.proyectoRendicion.updateMany({ where: { id: f.id, tenantId: a.tenantId, liquidacionId: id, estado: "aprobada" }, data: { estado: "reintegrada", reintegradoEl: ahora, eventos: res.rendicion.eventos as unknown as Prisma.InputJsonValue } });
      }
      await registrarCambio(tx, { tenantId: a.tenantId, entidad: "liquidacion", entidadId: id, campo: `pago ${l.periodo} de ${l.persona.nombre}`, antes: "publicada", despues: `pagada · ${medio} · $ ${l.total}`, autor: a.nombre });
      if (l.persona.userId) await avisar(tx, { tenantId: a.tenantId, destinatarios: [l.persona.userId], tipo: "liquidacion", texto: `Te pagamos la liquidación de ${etiquetaMes(l.periodo)}.`, enlace: `/admin/proyectos/mi-liquidacion?periodo=${l.periodo}` });
      return true;
    });
    if (!hecho) return { ok: false, error: "Esta liquidación ya está pagada." };
  } catch (e) {
    if (e instanceof Descuadre) return { ok: false, error: DESCUADRE };
    if (faltaLaMigracion(e)) return { ok: false, error: SIN_MIGRACION };
    throw e;
  }
  await auditAdmin({ action: "proyecto.liquidacion.pagar", entity: "ProyectoLiquidacion", entityId: id, changes: { medio } });
  revalidatePath(ADMIN);
  revalidatePath("/admin/proyectos/mi-liquidacion");
  return { ok: true };
}

/** Borrar un borrador: los reintegros que había reclamado quedan libres para otra liquidación o un reintegro directo. */
export async function borrarLiquidacion(formData: FormData): Promise<Resultado> {
  const a = await exigirEditar("liquidaciones");
  const id = txt(formData.get("id"));
  const hecho = await tenantTransaction(async (tx) => {
    const l = await tx.proyectoLiquidacion.findFirst({ where: { id, tenantId: a.tenantId, estado: "BORRADOR" }, select: { periodo: true, total: true } });
    if (!l) return false;
    try {
      await tx.$executeRaw`SAVEPOINT rendi_liberar`;
      await tx.proyectoRendicion.updateMany({ where: { tenantId: a.tenantId, liquidacionId: id, reintegradoEl: null }, data: { liquidacionId: null } });
    } catch (e) {
      if (!faltaLaMigracion(e)) throw e;
      await tx.$executeRaw`ROLLBACK TO SAVEPOINT rendi_liberar`;
    }
    const r = await tx.proyectoLiquidacion.deleteMany({ where: { id, tenantId: a.tenantId, estado: "BORRADOR" } });
    if (r.count === 0) return false;
    await registrarCambio(tx, { tenantId: a.tenantId, entidad: "liquidacion", entidadId: id, campo: `borrador ${l.periodo}`, antes: l.total, despues: "borrado", autor: a.nombre });
    return true;
  });
  if (!hecho) return { ok: false, error: "Sólo se borra un borrador." };
  revalidatePath(ADMIN);
  return { ok: true };
}

/**
 * Reemplaza la base y los extras manuales. Los que salen de los eventos y los reintegros de Rendí quedan como están: un
 * reintegro sólo lo pone o lo saca generar, que lo reclama en la base. Un descuento va en negativo. Toma la fila en
 * borrador antes de leer los extras (mismo candado que generar): una generación en paralelo espera o se ve entera.
 */
export async function editarExtrasLiquidacion(d: { id: string; base?: string; manuales: readonly { nombre: string; monto: string }[] }): Promise<Resultado> {
  const a = await exigirEditar("liquidaciones");
  const id = String(d.id ?? "");
  const manuales: ExtraGuardado[] = (Array.isArray(d.manuales) ? d.manuales : [])
    .slice(0, 30)
    .map((m) => ({ proyectoId: null, nombre: String(m.nombre ?? "").trim().slice(0, 120), monto: redondear(leerNumero(String(m.monto ?? ""))), manual: true }))
    .filter((m) => m.nombre || m.monto !== 0);
  if (manuales.some((m) => !m.nombre)) return { ok: false, error: "Cada extra necesita un concepto." };
  if (manuales.some((m) => m.monto === 0)) return { ok: false, error: "Cada extra necesita un monto." };
  const pedida = d.base === undefined ? null : redondear(leerNumero(String(d.base)));
  if (pedida !== null && pedida < 0) return { ok: false, error: "La base no puede ser negativa." };
  const r = await tenantTransaction(async (tx): Promise<Resultado> => {
    const tomada = await tx.proyectoLiquidacion.updateMany({ where: { id, tenantId: a.tenantId, estado: "BORRADOR" }, data: { estado: "BORRADOR" } });
    if (tomada.count === 0) {
      const existe = await tx.proyectoLiquidacion.findFirst({ where: { id, tenantId: a.tenantId }, select: { id: true } });
      return { ok: false, error: existe ? "Ya está publicada: no se puede cambiar." : "Esa liquidación no existe." };
    }
    const l = await tx.proyectoLiquidacion.findFirstOrThrow({ where: { id, tenantId: a.tenantId }, select: { periodo: true, base: true, extras: true, total: true } });
    const extras = [...leerExtras(l.extras).filter((e) => !e.manual || e.reintegro), ...manuales];
    const base = pedida ?? l.base;
    const total = totalLiquidacion(base, extras);
    if (total < 0) return { ok: false, error: "El total no puede quedar negativo." };
    await tx.proyectoLiquidacion.updateMany({ where: { id, tenantId: a.tenantId, estado: "BORRADOR" }, data: { base, extras: extras as unknown as Prisma.InputJsonValue, total } });
    await registrarCambio(tx, { tenantId: a.tenantId, entidad: "liquidacion", entidadId: id, campo: `total ${l.periodo}`, antes: l.total, despues: total, autor: a.nombre });
    return { ok: true };
  });
  if (r.ok) revalidatePath(ADMIN);
  return r;
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
