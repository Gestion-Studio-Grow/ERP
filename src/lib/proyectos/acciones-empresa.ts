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
import { exigirCodigoEnElMomento } from "./segundo-factor.server";
import { claveDeEnvio } from "./pago-columnas";
import { envioYaGrabado, estaPerdido, trabarCobranza } from "./cobranza.server";
import { perdidoAdmite } from "./ficha-core";
import { marcaDeGastoProyecto } from "./marcas";
import { asentarEnCajaTx, oPeriodoCerrado, PeriodoCerradoError, transaccionQueAsienta } from "./periodo-cerrado.server";
import { actorDelMotor, faltaLaMigracion, rendicionDelMotor, SIN_MIGRACION } from "./rendiciones-core";
import { puedeReintegrarRendicion } from "./gestion-core";
import { aplicarAccion } from "@/lib/rendiciones/rendicion";
import type { RolActor } from "@/lib/rendiciones/tipos";
import { conReintegros, esLoPropio, etiquetaMes, extrasRecalculados, LIQUIDACION_PROPIA, leerExtras, lineasNuevas, periodoValido, reintegrosCuadran, totalLiquidacion, type ExtraGuardado } from "./empresa-core";
import type { Resultado } from "./acciones";
import { CUOTA_ENLAZADA, listoMarcada } from "./avisos-cuota";
import { siHayM1, tomarCuotas } from "./comprobantes.server";
import { randomUUID } from "node:crypto";
import { aCentavos, esDiaValido, esOrigenConciliable, esTramo, huellasDelExtracto, MEDIO_RETENCION, signoDelOrigen, TRAMO_LABEL, type OrigenConciliable } from "./moneda-bancos-core";
import { hayM6, hayM8, hoyArgentina, moverCuentaTx } from "./moneda-bancos.server";
import { valorDelNegocio } from "./parametros/leer.server";
import { hayM5, lineasParaLaMensual, proyectosConReparto, reclamarLineasDeProyectoTx } from "./liquidacion-proyecto.server";

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
  const clave = claveDeEnvio(formData.get("claveEnvio"));
  await tenantTransaction(async (tx) => {
    if (await envioYaGrabado(tx, a.tenantId, clave)) return;
    const c = await tx.proyectoCuota.create({
      data: { tenantId: a.tenantId, proyectoId: null, supplierId, tipo, concepto, monto, moneda: mon, venceEl, factura: txt(formData.get("factura")).slice(0, 60) || null },
      select: { id: true },
    });
    if (clave) await registrarCambio(tx, { tenantId: a.tenantId, entidad: "ProyectoCuota", entidadId: c.id, campo: "Envío", antes: clave, despues: c.id, autor: a.nombre });
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

/** Aborta la transacción de marcar una cuota o de pagar una liquidación: el mensaje es para la persona. */
class NoSeMarca extends Error {}

/**
 * Marca pagada una cuota de la empresa y asienta el movimiento. El `where` con `pagadoEl: null` es lo que frena el doble clic.
 * M4c (vuelta 3 de T05): una cuota de pago de la empresa también se enlaza a un comprobante; enlazada, se paga sólo con la
 * orden de pago (si no, por el comprobante sale la cuota a mano y además la orden sin cuota).
 */
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
  // Sin M1 (Gate 2) no hay enlaces: `null`, y adentro no se cuentan. Lo de afuera es para contestar rápido.
  const enlaces = c.tipo !== "COBRO" ? await siHayM1(() => prisma.proyectoCuotaComprobante.count({ where: { tenantId: a.tenantId, cuotaId: id } })) : null;
  if (enlaces) return { ok: false, error: CUOTA_ENLAZADA };
  let hecho: "marcada" | "cambio" | "enlazada" | { amount: number } | PeriodoCerradoError;
  try {
    hecho = await oPeriodoCerrado(() => transaccionQueAsienta(async (tx): Promise<"marcada" | "cambio" | "enlazada" | { amount: number }> => {
      // CERT-4 / M4c: la cuota, con el candado de `enlazarCuota` y de la orden de pago (sin comprobante acá: no hay otro
      // candado antes), y el enlace contado adentro. Un enlace que entró después de la foto de esta transacción
      // (Serializable) dejó una versión nueva de la fila: el candado aborta (40001) y el reintento ve el enlace.
      await tomarCuotas(tx, a.tenantId, [id]);
      if (enlaces !== null && (await tx.proyectoCuotaComprobante.count({ where: { tenantId: a.tenantId, cuotaId: id } })) > 0) return "enlazada";
      // Condicionado a lo leído afuera: si en el medio cambiaron el monto, la moneda o el tipo, no se asienta lo viejo.
      const r = await tx.proyectoCuota.updateMany({ where: { id, tenantId: a.tenantId, proyectoId: null, pagadoEl: null, anuladoEl: null, tipo: c.tipo, monto: c.monto, moneda: c.moneda }, data: { pagadoEl: new Date(), pagadoPor: a.nombre, medio } });
      if (r.count === 0) {
        const sigue = await tx.proyectoCuota.findFirst({ where: { id, tenantId: a.tenantId, proyectoId: null, pagadoEl: null, anuladoEl: null }, select: { id: true } });
        return sigue ? "cambio" : "marcada";
      }
      // Con la cuota ya tomada: el cambio y la cuenta se leen acá, así el libro y el banco usan lo vigente al marcar.
      // En Serializable (O40) la lectura sale de la foto del primer paso, sacada antes de esperar la cuota: el cambio se
      // lee con candado, y si alguien lo cambió después de la foto Postgres aborta y la transacción se reintenta con una
      // foto nueva (`tenantTransaction`). Así sigue siendo el cambio vigente al marcar (administracion-carrera 2.d).
      if (c.moneda !== "ARS") await tx.$queryRaw`SELECT 1 FROM "ProyectoTipoCambio" WHERE "tenantId" = ${a.tenantId} AND "moneda" = ${c.moneda} FOR SHARE`;
      const amount = aPesos(c.monto, c.moneda, await tiposDeCambio(a.tenantId, tx));
      if (!(amount > 0)) throw new NoSeMarca("Falta el tipo de cambio: cargalo en Monedas y gastos fijos.");
      const cuenta = await cuentaParaCuota(a.tenantId, formData, { tipo: c.tipo, monto: c.monto, moneda: c.moneda, importeEnPesos: amount }, tx);
      if (typeof cuenta === "string") throw new NoSeMarca(cuenta);
      if (cuenta) {
        await tx.proyectoCuota.updateMany({ where: { id, tenantId: a.tenantId }, data: { cuentaId: cuenta.id, cuentaMovido: cuenta.movido } });
        await tx.proyectoCuentaBanco.updateMany({ where: { id: cuenta.id, tenantId: a.tenantId }, data: { saldo: { increment: cuenta.movido } } });
      }
      const session = await tx.cashSession.findFirst({ where: { tenantId: a.tenantId, status: "OPEN" }, select: { id: true } });
      await asentarEnCajaTx(tx, c.tipo === "COBRO" ? "cobro" : "pago", {
        tenantId: a.tenantId,
        sessionId: session?.id ?? null,
        type: c.tipo === "COBRO" ? "INGRESO" : "EGRESO",
        method: metodoDeCaja(medio, await transferenciaEnElLibroTx(tx)),
        amount,
        reason: `Empresa · ${c.concepto}${c.supplier ? ` · ${c.supplier.name}` : ""}${medio === "CHEQUE" ? " · Cheque" : ""}`,
        createdBy: marcaDeCuota(id),
      });
      await registrarCambio(tx, { tenantId: a.tenantId, entidad: "cuota", entidadId: id, campo: c.tipo === "COBRO" ? "cobro de empresa" : "pago de empresa", antes: "pendiente", despues: `${c.tipo === "COBRO" ? "cobrada" : "pagada"} · ${medio} · $ ${amount}`, autor: a.nombre });
      return { amount };
    }));
  } catch (e) {
    // Deshace la marca: sin cambio o sin cuenta válida no queda nada a medias.
    if (e instanceof NoSeMarca) return { ok: false, error: e.message };
    throw e;
  }
  if (hecho instanceof PeriodoCerradoError) return { ok: false, error: hecho.message };
  if (hecho === "marcada") return { ok: false, error: "Esa cuota ya estaba marcada." };
  if (hecho === "enlazada") return { ok: false, error: CUOTA_ENLAZADA };
  if (hecho === "cambio") return { ok: false, error: "Esa cuota cambió mientras la marcabas (monto, moneda o tipo). Recargá la página y volvé a marcarla." };
  const { amount } = hecho;
  await auditAdmin({ action: "proyecto.cuota-empresa.pagar", entity: "ProyectoCuota", entityId: id, changes: { amount, medio } });
  refrescar();
  return { ok: true, listo: listoMarcada(c.tipo === "COBRO", amount) };
}

/**
 * Anular no borra. A-05 (MIA-049, hallazgo 4): una cuota PAGADA no queda «pagada» sin plata: anular le anula el pago,
 * la cuota vuelve a pendiente (a la vista en «A pagar»/«A cobrar») y el libro y la cuenta vuelven al saldo de antes,
 * con un contraasiento por lo que ese pago neto dejó en la caja. Una cuota sin pagar queda anulada (sale de la lista).
 * Dos clics: el `updateMany` condicionado deja pasar a uno solo; el segundo dice que ya estaba.
 */
export async function anularCuotaEmpresa(formData: FormData): Promise<Resultado<{ listo?: string }>> {
  const a = await exigirEditar("empresa");
  const id = txt(formData.get("id"));
  // Lo que la pantalla mostraba («PAGADA»): con eso, un segundo clic (u otra pestaña) sobre una cuota que ya volvió a
  // pendiente no la anula por error. La pantalla de Cuentas lo va a mandar con la parte visual de A-05, que va en la
  // tanda T05 (no en T03); sin él, como antes.
  const visto = txt(formData.get("visto"));
  const hecho = await oPeriodoCerrado(() => transaccionQueAsienta(async (tx): Promise<"pago" | "cuota" | "no-existe" | false> => {
    const c = await tx.proyectoCuota.findFirst({ where: { id, tenantId: a.tenantId, proyectoId: null, anuladoEl: null }, select: { concepto: true, tipo: true, monto: true, moneda: true, pagadoEl: true, cuentaId: true, cuentaMovido: true } });
    // ADM-143: un id de otro negocio no existe para este; a ése no se le afirma un estado. Lo propio sí lo dice.
    if (!c) return (await tx.proyectoCuota.findFirst({ where: { id, tenantId: a.tenantId, proyectoId: null }, select: { id: true } })) ? false : "no-existe";
    if (!c.pagadoEl && visto === "PAGADA") return false;
    if (!c.pagadoEl) {
      const r = await tx.proyectoCuota.updateMany({ where: { id, tenantId: a.tenantId, proyectoId: null, anuladoEl: null, pagadoEl: null }, data: { anuladoEl: new Date() } });
      if (r.count === 0) return false;
      await registrarCambio(tx, { tenantId: a.tenantId, entidad: "cuota", entidadId: id, campo: "anulación de cuota de empresa", antes: `${c.moneda} ${c.monto}`, despues: "anulada", autor: a.nombre });
      return "cuota";
    }
    // El pago: sólo uno de dos clics lo encuentra marcado.
    const r = await tx.proyectoCuota.updateMany({ where: { id, tenantId: a.tenantId, proyectoId: null, anuladoEl: null, pagadoEl: { not: null } }, data: { pagadoEl: null, pagadoPor: null, medio: null, cuentaId: null, cuentaMovido: null } });
    if (r.count === 0) return false;
    if (c.cuentaId && c.cuentaMovido) await tx.proyectoCuentaBanco.updateMany({ where: { id: c.cuentaId, tenantId: a.tenantId }, data: { saldo: { decrement: c.cuentaMovido } } });
    // Lo que la cuota tiene hoy en la caja, neto: sus pagos menos sus vueltas (una cuota se puede pagar, anular y volver a pagar).
    const salida = c.tipo === "COBRO" ? "INGRESO" : "EGRESO";
    const vuelta = salida === "EGRESO" ? "INGRESO" : "EGRESO";
    const asientos = await tx.cashMovement.findMany({ where: { tenantId: a.tenantId, createdBy: marcaDeCuota(id), type: { in: [salida, vuelta] } }, orderBy: { createdAt: "desc" }, select: { type: true, amount: true, method: true } });
    const neto = redondear(asientos.reduce((s, m) => s + (m.type === salida ? m.amount : -m.amount), 0));
    const ultimo = asientos.find((m) => m.type === salida);
    if (neto > 0 && ultimo) {
      const session = await tx.cashSession.findFirst({ where: { tenantId: a.tenantId, status: "OPEN" }, select: { id: true } });
      await asentarEnCajaTx(tx, "anulación", {
        tenantId: a.tenantId,
        sessionId: session?.id ?? null,
        type: vuelta,
        method: ultimo.method,
        amount: neto,
        reason: `Anulación · Empresa · ${c.concepto}`,
        createdBy: marcaDeCuota(id),
      });
    }
    await registrarCambio(tx, { tenantId: a.tenantId, entidad: "cuota", entidadId: id, campo: "anulación de pago de empresa", antes: `${c.tipo === "COBRO" ? "cobrada" : "pagada"} · ${c.moneda} ${c.monto}`, despues: neto > 0 ? "pendiente, con vuelta al libro" : "pendiente", autor: a.nombre });
    return "pago";
  }));
  if (hecho instanceof PeriodoCerradoError) return { ok: false, error: hecho.message };
  if (hecho === "no-existe") return { ok: false, error: "Esa cuota no existe." };
  if (!hecho) return { ok: false, error: "Ese pago ya estaba anulado." };
  await auditAdmin({ action: "proyecto.cuota-empresa.anular", entity: "ProyectoCuota", entityId: id, changes: { que: hecho } });
  refrescar();
  return { ok: true, listo: hecho === "pago" ? "Pago anulado: la cuota vuelve a quedar pendiente y la plata volvió a la caja." : "Cuota anulada." };
}

/** Factura y comentario, de cualquier cuota del negocio. */
export async function guardarDatoCuota(formData: FormData): Promise<Resultado> {
  const a = await exigirEditar("empresa");
  const id = txt(formData.get("id"));
  const campo = txt(formData.get("campo"));
  if (campo === "venceEl") {
    const texto = txt(formData.get("valor"));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return { ok: false, error: "Elegí una fecha." };
    const venceEl = new Date(`${texto}T12:00:00-03:00`);
    // Adentro y con la fila trabada: si en el medio la pagaron o la anularon, no se le cambia el vencimiento.
    const hecho = await tenantTransaction(async (tx) => {
      const [q] = await tx.$queryRaw<{ proyectoId: string | null; venceEl: Date }[]>`
        SELECT "proyectoId", "venceEl" FROM "ProyectoCuota"
         WHERE "id" = ${id} AND "tenantId" = ${a.tenantId} AND "pagadoEl" IS NULL AND "anuladoEl" IS NULL
         FOR UPDATE`;
      // ADM-143: un id de otro negocio no existe para este; a ése no se le afirma un estado. Lo propio sí lo dice.
      if (!q) return (await tx.proyectoCuota.findFirst({ where: { id, tenantId: a.tenantId }, select: { id: true } })) ? false : "no-existe";
      const u = await tx.proyectoCuota.updateMany({ where: { id, tenantId: a.tenantId, pagadoEl: null, anuladoEl: null }, data: { venceEl, venceManual: true } });
      if (u.count === 0) return false;
      await registrarCambio(tx, { tenantId: a.tenantId, proyectoId: q.proyectoId, entidad: "cuota", entidadId: id, campo: "vencimiento", antes: new Date(q.venceEl).toISOString().slice(0, 10), despues: texto, autor: a.nombre });
      return true;
    });
    if (hecho === "no-existe") return { ok: false, error: "Esa cuota no existe." };
    if (!hecho) return { ok: false, error: "Esa cuota ya se pagó o ya no corre." };
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
  // O38 · M8: cada línea lleva su huella (fecha, descripción, importe y orden en el archivo) y el único
  // (tenantId, cuentaId, huella) no deja entrar la misma dos veces, ni con dos importaciones a la vez. Lo importado antes
  // de M8 (sin huella) se compara como siempre, por fecha, descripción e importe.
  const m8 = await hayM8();
  const conHuella = huellasDelExtracto(lineas);
  const desde = new Date(Math.min(...lineas.map((l) => l.fecha.getTime())) - 86_400_000);
  const existentes = await prisma.proyectoMovBanco.findMany({ where: { tenantId: a.tenantId, cuentaId, fecha: { gte: desde }, ...(m8 ? { huella: null } : {}) }, select: { fecha: true, descripcion: true, importe: true } });
  const nuevas = lineasNuevas(conHuella, existentes);
  const lote = `Extracto ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;
  let importadas = 0;
  if (nuevas.length > 0) {
    const r = await prisma.proyectoMovBanco.createMany({
      data: nuevas.map((l) => ({ tenantId: a.tenantId, cuentaId, fecha: l.fecha, descripcion: l.descripcion.slice(0, 300), importe: redondear(l.importe), lote, ...(m8 ? { huella: l.huella } : {}) })),
      skipDuplicates: m8,
    });
    importadas = r.count;
  }
  await auditAdmin({ action: "proyecto.extracto", entity: "ProyectoCuentaBanco", entityId: cuentaId, changes: { importadas, repetidas: lineas.length - importadas, ilegibles } });
  revalidatePath(ADMIN);
  return { ok: true, importadas, repetidas: lineas.length - importadas, ilegibles };
}

/**
 * Conciliar sólo ata el movimiento a la cuota: marcarla pagada es otra decisión, que la pantalla ofrece después.
 * Una cuota, un movimiento: la fila de la cuota se traba (FOR UPDATE) y todo se vuelve a mirar adentro de la misma
 * transacción, así dos movimientos distintos a la misma cuota a la vez no pasan los dos.
 */
export async function conciliarMovimiento(formData: FormData): Promise<Resultado> {
  const a = await exigirEditar("empresa");
  const id = txt(formData.get("id"));
  const cuotaId = txt(formData.get("cuotaId"));
  // El origen llega en dos campos (`origenTipo`, `origenId`) o en uno de la lista de la pantalla (`origen` = «TIPO|id»).
  const [tipoElegido = "", idElegido = ""] = txt(formData.get("origen")).split("|");
  const origenTipo = txt(formData.get("origenTipo")) || tipoElegido;
  if (!cuotaId && origenTipo) return conciliarConMovimiento(a, id, origenTipo, txt(formData.get("origenId")) || idElegido);
  const r = await tenantTransaction(async (tx): Promise<Resultado> => {
    // MIA-111 · opción A de MIA-BANCOS-PERDIDO (PROVISIONAL A CONFIRMAR POR EL DUEÑO): el cobro de un perdido no se
    // concilia (`perdidoAdmite`, la misma regla de la ficha, Cuentas a cobrar y Bancos). En fila con «Marcar perdido»:
    // el candado de la cobranza del proyecto va antes que el de la cuota, en el mismo orden que `moverProyecto` y
    // `marcarCuota`. El tipo y el proyecto de una cuota no cambian: se leen sin candado para saber cuál tomar.
    const [pre] = await tx.$queryRaw<{ tipo: string; proyectoId: string | null }[]>`
      SELECT "tipo", "proyectoId" FROM "ProyectoCuota" WHERE "id" = ${cuotaId} AND "tenantId" = ${a.tenantId}`;
    if (pre?.proyectoId && !perdidoAdmite(pre.tipo)) await trabarCobranza(tx, a.tenantId, pre.proyectoId);
    // El candado de la cuota va primero: el segundo envío espera acá y, al entrar, ve lo que grabó el primero.
    const [c] = await tx.$queryRaw<{ tipo: string; concepto: string; proyectoId: string | null; pagadoEl: Date | null }[]>`
      SELECT "tipo", "concepto", "proyectoId", "pagadoEl" FROM "ProyectoCuota"
       WHERE "id" = ${cuotaId} AND "tenantId" = ${a.tenantId} AND "anuladoEl" IS NULL
       FOR UPDATE`;
    const m = await tx.proyectoMovBanco.findFirst({ where: { id, tenantId: a.tenantId }, select: { importe: true } });
    // ADM-143: un id de otro negocio no existe para este; a ése no se le afirma un estado. Lo propio sí lo dice.
    if (!m) return { ok: false, error: "Ese movimiento no existe." };
    if (!c) {
      const propia = await tx.proyectoCuota.findFirst({ where: { id: cuotaId, tenantId: a.tenantId }, select: { id: true } });
      return { ok: false, error: propia ? "Esa cuota está anulada: no se concilia." : "Esa cuota no existe." };
    }
    if ((c.tipo === "COBRO") !== m.importe > 0) return { ok: false, error: "El movimiento y la cuota van en sentidos opuestos." };
    // Lo ya cobrado entró de verdad: se concilia igual (`cobroFrenadoPorPerdido` sólo frena lo que falta cobrar).
    if (!c.pagadoEl && c.proyectoId && !perdidoAdmite(c.tipo) && (await estaPerdido(tx, a.tenantId, c.proyectoId))) return { ok: false, error: "Ese cobro es de un proyecto perdido: no se concilia. Si se retoma, reabrilo primero." };
    if (await tx.proyectoMovBanco.findFirst({ where: { tenantId: a.tenantId, cuotaId }, select: { id: true } })) return { ok: false, error: "Esa cuota ya está conciliada con otro movimiento." };
    const u = await tx.proyectoMovBanco.updateMany({ where: { id, tenantId: a.tenantId, cuotaId: null }, data: { cuotaId } });
    if (u.count === 0) return { ok: false, error: "Ese movimiento ya estaba conciliado." };
    await registrarCambio(tx, { tenantId: a.tenantId, proyectoId: c.proyectoId, entidad: "movimiento", entidadId: id, campo: "conciliación", despues: c.concepto, autor: a.nombre });
    return { ok: true };
  });
  if (r.ok) revalidatePath(ADMIN);
  return r;
}

/**
 * Suelta sólo la conciliación que se leyó: el update va condicionado a esa cuota, así un pedido viejo no suelta la que
 * otro hizo recién con otra cuota. Mismo orden de candados que conciliar (cuota primero, después el movimiento).
 */
export async function desconciliarMovimiento(formData: FormData): Promise<Resultado> {
  const a = await exigirEditar("empresa");
  const id = txt(formData.get("id"));
  const m8 = await hayM8();
  const r = await tenantTransaction(async (tx): Promise<Resultado> => {
    const m = await tx.proyectoMovBanco.findFirst({ where: { id, tenantId: a.tenantId }, select: { cuotaId: true } });
    // ADM-143: un id de otro negocio no existe para este; a ése no se le afirma un estado. Lo propio sí lo dice.
    if (!m) return { ok: false, error: "Ese movimiento no existe." };
    if (!m.cuotaId && m8) {
      // O38 · M8: conciliado contra un cobro, un pago, una orden o una liquidación: se suelta sólo ese, el que se leyó.
      const o = await tx.proyectoMovBanco.findFirst({ where: { id, tenantId: a.tenantId }, select: { origenTipo: true, origenId: true } });
      if (!o?.origenTipo || !o.origenId) return { ok: false, error: "Ese movimiento no está conciliado." };
      const u = await tx.proyectoMovBanco.updateMany({ where: { id, tenantId: a.tenantId, origenTipo: o.origenTipo, origenId: o.origenId }, data: { origenTipo: null, origenId: null } });
      if (u.count === 0) return { ok: false, error: "Ese movimiento cambió mientras tanto. Recargá la página." };
      await registrarCambio(tx, { tenantId: a.tenantId, entidad: "movimiento", entidadId: id, campo: "conciliación", antes: `${o.origenTipo} ${o.origenId}`, autor: a.nombre });
      return { ok: true };
    }
    if (!m.cuotaId) return { ok: false, error: "Ese movimiento no está conciliado." };
    // Sin filtrar por anulada: una cuota anulada también se puede soltar.
    const [c] = await tx.$queryRaw<{ concepto: string; proyectoId: string | null }[]>`
      SELECT "concepto", "proyectoId" FROM "ProyectoCuota"
       WHERE "id" = ${m.cuotaId} AND "tenantId" = ${a.tenantId}
       FOR UPDATE`;
    const u = await tx.proyectoMovBanco.updateMany({ where: { id, tenantId: a.tenantId, cuotaId: m.cuotaId }, data: { cuotaId: null } });
    if (u.count === 0) return { ok: false, error: "Ese movimiento cambió mientras tanto (alguien lo desconcilió o lo concilió con otra cuota). Recargá la página." };
    await registrarCambio(tx, { tenantId: a.tenantId, proyectoId: c?.proyectoId ?? null, entidad: "movimiento", entidadId: id, campo: "conciliación", antes: c?.concepto ?? "cuota", autor: a.nombre });
    return { ok: true };
  });
  if (r.ok) revalidatePath(ADMIN);
  return r;
}

// ── Monedas y gastos fijos ──────────────────────────────────────────────────

/**
 * El cambio de una moneda para un día (O39). Con M6 se guarda en el historial (un día, un cambio por moneda: volver a
 * cargar el mismo día lo corrige) y lo ya asentado no se mueve: cada cobro, pago y comprobante guardó el suyo. El
 * cambio «de hoy» de las pantallas (y de las cuotas en dólares) es el último cargado. Sin M6, como antes: sólo dólar, hoy.
 */
export async function guardarTipoCambio(formData: FormData): Promise<Resultado> {
  const a = await exigirEditar("empresa");
  const leido = numero(formData.get("porUnidad"));
  const porUnidad = redondear(leido);
  const m6 = await hayM6();
  const mon = m6 ? txt(formData.get("moneda")) || "USD" : "USD";
  const dia = m6 ? txt(formData.get("fecha")) || hoyArgentina() : hoyArgentina();
  if (m6) {
    const habilitadas = await valorDelNegocio(a.tenantId, "moneda.habilitadas");
    if (mon === "ARS" || !Array.isArray(habilitadas) || !habilitadas.includes(mon)) return { ok: false, error: `${mon} no es una moneda habilitada del negocio.` };
    if (!esDiaValido(dia)) return { ok: false, error: "La fecha no es válida." };
    if (dia > hoyArgentina()) return { ok: false, error: "El cambio se carga para hoy o para un día pasado, no para uno futuro." };
  }
  if (!(porUnidad > 0)) return { ok: false, error: `Escribí cuántos pesos vale un ${mon === "USD" ? "dólar" : mon}.` };
  // Sin redondear en silencio (UAT-008): el cambio pasa a pesos cada cuota en dólares; con más de dos decimales, se pide.
  if (Math.abs(leido - porUnidad) > 1e-9) return { ok: false, error: `El tipo de cambio se guarda con hasta 2 decimales. Escribilo así, por ejemplo ${String(porUnidad).replace(".", ",")}.` };
  let esElUltimo = true;
  if (m6) {
    const centavos = BigInt(aCentavos(porUnidad));
    esElUltimo = await tenantTransaction(async (tx) => {
      await tx.$executeRaw`
        INSERT INTO "ProyectoCambioDia" ("id", "tenantId", "moneda", "dia", "centavosPorUnidad", "cargadoPor")
        VALUES (${randomUUID()}, ${a.tenantId}, ${mon}, ${dia}, ${centavos}, ${a.nombre.slice(0, 120)})
        ON CONFLICT ("tenantId", "moneda", "dia") DO UPDATE SET "centavosPorUnidad" = EXCLUDED."centavosPorUnidad", "cargadoPor" = EXCLUDED."cargadoPor"`;
      const despues = await tx.proyectoCambioDia.count({ where: { tenantId: a.tenantId, moneda: mon, dia: { gt: dia } } });
      await registrarCambio(tx, { tenantId: a.tenantId, entidad: "tipoCambio", entidadId: `${mon}-${dia}`, campo: `pesos por unidad (${mon}, ${dia})`, despues: porUnidad, autor: a.nombre });
      return despues === 0;
    });
  }
  // El cambio «de hoy» (el que usan las cuotas en otra moneda) sólo lo mueve el último día cargado.
  if (esElUltimo) {
    const previo = await prisma.proyectoTipoCambio.findFirst({ where: { tenantId: a.tenantId, moneda: mon }, select: { porUnidad: true } });
    await prisma.proyectoTipoCambio.upsert({ where: { tenantId_moneda: { tenantId: a.tenantId, moneda: mon } }, create: { tenantId: a.tenantId, moneda: mon, porUnidad }, update: { porUnidad } });
    if (!m6) await registrarCambio(prisma, { tenantId: a.tenantId, entidad: "tipoCambio", entidadId: mon, campo: "pesos por dólar", antes: previo?.porUnidad, despues: porUnidad, autor: a.nombre });
    if (previo?.porUnidad !== porUnidad) await regenerarCuotasDe(a.tenantId, { OR: [{ moneda: mon }, { presupuestos: { some: { items: { some: { moneda: mon } } } } }] });
  }
  refrescar();
  return { ok: true };
}

// ── Conciliación contra un movimiento (O38) y cuota ↔ factura (O35) · MIA T08 ──────────────────────────────────

const ORIGEN_LABEL: Record<OrigenConciliable, string> = { COBRO: "cobro", PAGO: "pago de gasto", ORDEN_PAGO: "orden de pago", LIQUIDACION: "pago de sueldo" };

/** El cobro, pago, orden o liquidación del negocio, vigente y ya movido, con su sentido. null si no existe para éste. */
async function origenVigente(tx: Prisma.TransactionClient, tenantId: string, tipo: OrigenConciliable, origenId: string): Promise<{ texto: string; proyectoId: string | null } | null> {
  if (tipo === "COBRO") {
    const p = await tx.proyectoPago.findFirst({ where: { id: origenId, tenantId, anuladoEl: null, NOT: { medio: MEDIO_RETENCION } }, select: { monto: true, proyectoId: true } });
    return p ? { texto: `cobro de $ ${p.monto}`, proyectoId: p.proyectoId } : null;
  }
  if (tipo === "PAGO") {
    const g = await tx.proyectoGasto.findFirst({ where: { id: origenId, tenantId, anuladoEl: null, pagadoEl: { not: null } }, select: { descripcion: true, proyectoId: true } });
    return g ? { texto: `pago de ${g.descripcion}`, proyectoId: g.proyectoId } : null;
  }
  if (tipo === "ORDEN_PAGO") {
    const o = await tx.proyectoOrdenPago.findFirst({ where: { id: origenId, tenantId, estado: "PAGADA" }, select: { numero: true } });
    return o ? { texto: `orden de pago N° ${o.numero}`, proyectoId: null } : null;
  }
  const l = await tx.proyectoLiquidacion.findFirst({ where: { id: origenId, tenantId, estado: "PAGADA" }, select: { total: true } });
  return l ? { texto: `sueldo de $ ${l.total}`, proyectoId: null } : null;
}

/**
 * O38: concilia un movimiento del extracto contra un cobro, un pago, una orden de pago o un pago de sueldo (no sólo
 * contra cuotas). Un movimiento, un origen y un origen, un movimiento: el único (tenantId, origenTipo, origenId) frena
 * a dos movimientos que quieren el mismo cobro a la vez, y el update condicionado a «sin conciliar» frena al revés.
 */
async function conciliarConMovimiento(a: { tenantId: string; nombre: string }, id: string, tipo: string, origenId: string): Promise<Resultado> {
  if (!esOrigenConciliable(tipo) || !origenId) return { ok: false, error: "Elegí el cobro o el pago contra el que se concilia." };
  if (!(await hayM8())) return { ok: false, error: SIN_M8 };
  try {
    const r = await tenantTransaction(async (tx): Promise<Resultado> => {
      const m = await tx.proyectoMovBanco.findFirst({ where: { id, tenantId: a.tenantId }, select: { importe: true, cuotaId: true, origenTipo: true } });
      if (!m) return { ok: false, error: "Ese movimiento no existe." };
      if (m.cuotaId || m.origenTipo) return { ok: false, error: "Ese movimiento ya estaba conciliado." };
      const o = await origenVigente(tx, a.tenantId, tipo, origenId);
      if (!o) return { ok: false, error: `Ese ${ORIGEN_LABEL[tipo]} no existe o está anulado.` };
      if ((signoDelOrigen(tipo) > 0) !== m.importe > 0) return { ok: false, error: "El movimiento y el cobro o pago van en sentidos opuestos." };
      if (await tx.proyectoMovBanco.findFirst({ where: { tenantId: a.tenantId, origenTipo: tipo, origenId }, select: { id: true } })) return { ok: false, error: `Ese ${ORIGEN_LABEL[tipo]} ya está conciliado con otro movimiento.` };
      const u = await tx.proyectoMovBanco.updateMany({ where: { id, tenantId: a.tenantId, cuotaId: null, origenTipo: null }, data: { origenTipo: tipo, origenId } });
      if (u.count === 0) return { ok: false, error: "Ese movimiento ya estaba conciliado." };
      await registrarCambio(tx, { tenantId: a.tenantId, proyectoId: o.proyectoId, entidad: "movimiento", entidadId: id, campo: "conciliación", despues: o.texto, autor: a.nombre });
      return { ok: true };
    });
    if (r.ok) revalidatePath(ADMIN);
    return r;
  } catch (e) {
    // Dos movimientos al mismo origen a la vez: el segundo choca con el único y no pasa.
    if ((e as { code?: string })?.code === "P2002") return { ok: false, error: `Ese ${ORIGEN_LABEL[tipo]} ya está conciliado con otro movimiento.` };
    throw e;
  }
}

const SIN_M8 = "Falta un paso técnico para usar esto (la actualización de bancos de este negocio). Avisale a soporte.";

/**
 * O35: enlaza una cuota de cobro con su factura, por tramo (anticipo, saldo o adicional). Una factura por cuota; la
 * factura tiene que ser de este negocio (la de otro «no existe»: no se le afirma nada).
 */
export async function enlazarCuotaFactura(formData: FormData): Promise<Resultado> {
  const a = await exigirEditar("empresa");
  const cuotaId = txt(formData.get("cuotaId"));
  const facturaId = txt(formData.get("facturaId"));
  const tramo = txt(formData.get("tramo"));
  if (!esTramo(tramo)) return { ok: false, error: "Elegí el tramo: anticipo, saldo o adicional." };
  if (!(await hayM8())) return { ok: false, error: SIN_M8 };
  try {
    const r = await tenantTransaction(async (tx): Promise<Resultado> => {
      const c = await tx.proyectoCuota.findFirst({ where: { id: cuotaId, tenantId: a.tenantId }, select: { tipo: true, anuladoEl: true, concepto: true, proyectoId: true } });
      if (!c) return { ok: false, error: "Esa cuota no existe." };
      if (c.anuladoEl) return { ok: false, error: "Esa cuota está anulada." };
      if (c.tipo !== "COBRO") return { ok: false, error: "Sólo una cuota de cobro lleva factura." };
      const f = await tx.invoice.findFirst({ where: { id: facturaId, tenantId: a.tenantId }, select: { id: true, puntoVenta: true, numero: true } });
      if (!f) return { ok: false, error: "Esa factura no existe." };
      if (await tx.proyectoCuotaFactura.findFirst({ where: { cuotaId, tenantId: a.tenantId }, select: { id: true } })) return { ok: false, error: "Esa cuota ya tiene una factura enlazada. Desenlazala primero." };
      await tx.proyectoCuotaFactura.create({ data: { tenantId: a.tenantId, cuotaId, facturaId, tramo, creadoPor: a.nombre.slice(0, 120) } });
      await registrarCambio(tx, { tenantId: a.tenantId, proyectoId: c.proyectoId, entidad: "cuota", entidadId: cuotaId, campo: "factura", despues: `${TRAMO_LABEL[tramo]} · ${f.numero ? `${String(f.puntoVenta).padStart(4, "0")}-${String(f.numero).padStart(8, "0")}` : "pendiente"}`, autor: a.nombre });
      return { ok: true };
    });
    if (r.ok) refrescar();
    return r;
  } catch (e) {
    if ((e as { code?: string })?.code === "P2002") return { ok: false, error: "Esa cuota ya tiene una factura enlazada. Desenlazala primero." };
    throw e;
  }
}

export async function desenlazarCuotaFactura(formData: FormData): Promise<Resultado> {
  const a = await exigirEditar("empresa");
  const cuotaId = txt(formData.get("cuotaId"));
  if (!(await hayM8())) return { ok: false, error: SIN_M8 };
  const r = await tenantTransaction(async (tx): Promise<Resultado> => {
    const e = await tx.proyectoCuotaFactura.findFirst({ where: { cuotaId, tenantId: a.tenantId }, select: { id: true, tramo: true, cuota: { select: { proyectoId: true } } } });
    if (!e) return { ok: false, error: "Esa cuota no tiene factura enlazada." };
    await tx.proyectoCuotaFactura.deleteMany({ where: { id: e.id, tenantId: a.tenantId } });
    await registrarCambio(tx, { tenantId: a.tenantId, proyectoId: e.cuota.proyectoId, entidad: "cuota", entidadId: cuotaId, campo: "factura", antes: e.tramo, despues: "sin factura", autor: a.nombre });
    return { ok: true };
  });
  if (r.ok) refrescar();
  return r;
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
  const g = await prisma.proyectoGastoFijo.findFirst({ where: { id, tenantId: a.tenantId }, select: { nombre: true, monto: true, moneda: true, activo: true } });
  // ADM-143: un id de otro negocio no existe para este; a ése no se le afirma un estado. Lo propio sí lo dice.
  if (!g) return { ok: false, error: "Ese gasto no existe." };
  if (!g.activo) return { ok: false, error: "Ese gasto ya estaba dado de baja." };
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
export async function generarLiquidaciones(formData: FormData): Promise<Resultado<{ generadas: number; publicadas: number; salteada: string | null; esperando: string[] }>> {
  const a = await exigirEditar("liquidaciones");
  const yo = { personaId: a.personaId, userId: a.user.id };
  const periodo = txt(formData.get("periodo"));
  if (!periodoValido(periodo)) return { ok: false, error: "Elegí el mes." };
  const [personas, actuales, conReintegro, deProyectos] = await Promise.all([
    prisma.proyectoPersona.findMany({
      where: { tenantId: a.tenantId, activa: true },
      select: { id: true, userId: true, nombre: true, sueldoBase: true, facturaA: true, equipos: { where: { proyecto: { perdidoEl: null } }, select: { plus: true, proyecto: { select: { id: true, nombre: true, fechaEvento: true, fechaFin: true } } } } },
    }),
    prisma.proyectoLiquidacion.findMany({ where: { tenantId: a.tenantId, periodo }, select: { id: true, personaId: true, estado: true, extras: true, total: true } }),
    personasConReintegros(a.tenantId),
    // T10 (O23): las líneas de proyectos aprobados que «cuándo se paga» ya deja entrar; sin M5, ninguna.
    lineasParaLaMensual(prisma, a.tenantId),
  ]);
  const publicadas = actuales.filter((l) => l.estado !== "BORRADOR").length;
  // T12 (O25): con el reparto prendido, el plus de un proyecto que se liquida por reparto no entra (no se paga dos veces).
  const conReparto = await proyectosConReparto(prisma, a.tenantId, [...new Set(personas.flatMap((p) => p.equipos.map((e) => e.proyecto.id)))]);
  let generadas = 0;
  let salteada: string | null = null;
  await tenantTransaction(async (tx) => {
    for (const p of personas) {
      const previa = actuales.find((l) => l.personaId === p.id);
      if (previa && previa.estado !== "BORRADOR") continue;
      const delPeriodo = extrasDelPeriodo(p.equipos, periodo, conReparto);
      const deProyecto = deProyectos.porPersona.get(p.id) ?? [];
      if (!previa && !(p.sueldoBase > 0) && delPeriodo.length === 0 && !conReintegro?.has(p.id) && deProyecto.length === 0) continue;
      // G4: la propia no se genera ni se recalcula; la arma otra persona con permiso (el resultado lo dice).
      if (esLoPropio(yo, { personaId: p.id, userId: p.userId })) {
        salteada = p.nombre;
        continue;
      }
      if (!previa) await tx.proyectoLiquidacion.createMany({ data: [{ tenantId: a.tenantId, personaId: p.id, periodo, base: p.sueldoBase, facturaA: p.facturaA }], skipDuplicates: true });
      // Toma la fila y confirma que sigue en borrador: si alguien la publicó recién, queda como está; si la publican
      // ahora, esperan a que esta transacción termine (el claim de reintegros y el total van juntos).
      const tomada = await tx.proyectoLiquidacion.updateMany({ where: { tenantId: a.tenantId, personaId: p.id, periodo, estado: "BORRADOR" }, data: { facturaA: p.facturaA } });
      if (tomada.count === 0) continue;
      // Los extras se leen con la fila ya tomada: lo que otra edición guardó recién no se pisa con una lectura vieja.
      const fila = await tx.proyectoLiquidacion.findFirstOrThrow({ where: { tenantId: a.tenantId, personaId: p.id, periodo }, select: { id: true, extras: true } });
      const id = fila.id;
      const sinReintegros = extrasRecalculados(leerExtras(fila.extras), delPeriodo);
      const conRendi = conReintegro ? await reclamarReintegrosTx(tx, a.tenantId, id, p.id, sinReintegros) : [...sinReintegros, ...leerExtras(fila.extras).filter((e) => e.reintegro)];
      const extras = (await hayM5()) ? [...conRendi, ...(await reclamarLineasDeProyectoTx(tx, a.tenantId, id, deProyecto))] : conRendi;
      const total = totalLiquidacion(p.sueldoBase, extras);
      await tx.proyectoLiquidacion.updateMany({ where: { id, tenantId: a.tenantId, estado: "BORRADOR" }, data: { base: p.sueldoBase, extras: extras as unknown as Prisma.InputJsonValue, total, facturaA: p.facturaA } });
      generadas++;
      await registrarCambio(tx, { tenantId: a.tenantId, entidad: "liquidacion", entidadId: id, campo: `total ${periodo} de ${p.nombre}`, antes: previa?.total, despues: total, autor: a.nombre });
    }
  });
  revalidatePath(ADMIN);
  return { ok: true, generadas, publicadas, salteada, esperando: deProyectos.esperando };
}

export async function publicarBorradores(formData: FormData): Promise<Resultado<{ publicadas: number; salteada: string | null }>> {
  const a = await exigirEditar("liquidaciones");
  const periodo = txt(formData.get("periodo"));
  if (!periodoValido(periodo)) return { ok: false, error: "Elegí el mes." };
  const todos = await prisma.proyectoLiquidacion.findMany({ where: { tenantId: a.tenantId, periodo, estado: "BORRADOR" }, select: { id: true, total: true, personaId: true, persona: { select: { nombre: true, userId: true } } } });
  // G4: la propia queda en borrador; la publica otra persona con permiso.
  const propia = todos.find((b) => esLoPropio({ personaId: a.personaId, userId: a.user.id }, { personaId: b.personaId, userId: b.persona.userId }));
  const borradores = todos.filter((b) => b !== propia);
  if (borradores.length === 0) return { ok: false, error: propia ? "Sólo queda la tuya en borrador: la publica otra persona de Dirección o Administración. Nadie se liquida lo propio." : "No hay borradores para publicar en este mes." };
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
  return { ok: true, publicadas: borradores.length, salteada: propia?.persona.nombre ?? null };
}

/**
 * Rendí: pagar una liquidación publicada. PAGADA + un egreso por el total (clave única `proyectoLiquidacionId`: dos clics
 * = un egreso) + las rendiciones que reclamó pasan a reintegradas. Dirección o Administración; nadie se paga lo propio.
 * N1 (MIA-084): pide la cuenta que se mueve, o «ninguna», igual que una cuota, y baja su saldo en la misma transacción
 * que el asiento: si una de las dos falla (día cerrado, cuenta en otra moneda), no queda ninguna.
 */
/** Aborta la transacción del pago: los reintegros reclamados no coinciden con los del total. */
class Descuadre extends Error {}
const DESCUADRE = "Los reintegros de esta liquidación no cuadran con su total: no se pagó nada. Avisá a Dirección para revisarla.";
const SIN_CUENTA = "Elegí de qué cuenta sale el pago, o «Ninguna cuenta del banco» si no sale de ninguna. Si no ves la lista de cuentas, recargá la página.";

export async function pagarLiquidacion(formData: FormData): Promise<Resultado> {
  const a = await actorActual();
  const id = txt(formData.get("id"));
  const medioPedido = txt(formData.get("medio")) || "TRANSFERENCIA";
  if (!MEDIOS.includes(medioPedido as MedioPago)) return { ok: false, error: "Elegí cómo se pagó." };
  const medio = medioPedido as MedioPago;
  let deCuenta = ""; // « · Banco …» para el historial y la auditoría; vacío si el pago no movió ninguna cuenta
  try {
    const l = await prisma.proyectoLiquidacion.findFirst({ where: { id, tenantId: a.tenantId }, select: { id: true, periodo: true, total: true, estado: true, personaId: true, persona: { select: { nombre: true, userId: true } } } });
    if (!l) return { ok: false, error: "Esa liquidación no existe." };
    const actorId = actorDelMotor({ personaId: a.personaId, userId: a.user.id });
    if (actorId === l.personaId || (!!l.persona.userId && l.persona.userId === a.user.id)) return { ok: false, error: "Nadie se paga lo propio: esta liquidación es tuya." };
    if (!puedeReintegrarRendicion(a.rol, actorId, l.personaId) || !puede(a, "liquidaciones", "editar")) return { ok: false, error: "Sólo Dirección o Administración, con permiso para editar liquidaciones, las pagan." };
    if (l.estado === "PAGADA") return { ok: false, error: "Esta liquidación ya está pagada." };
    if (l.estado !== "PUBLICADA") return { ok: false, error: "Primero publicala: se paga lo que la persona ya vio." };
    // Con cuentas en pesos cargadas (las que ofrece la pantalla), el silencio no vale «ninguna»: así el sueldo por banco no
    // queda fuera del saldo sin que nadie lo elija.
    if (!txt(formData.get("cuenta")) && (await prisma.proyectoCuentaBanco.count({ where: { tenantId: a.tenantId, moneda: "ARS" } })) > 0) return { ok: false, error: SIN_CUENTA };
    // MIA-50 T11 (O47, D10): pagar pide el código de la app en este momento (o la ventana de 10 min de pagos seguidos).
    const sinCodigo = await exigirCodigoEnElMomento(a.user, formData, "pagar");
    if (sinCodigo) return { ok: false, error: sinCodigo };
    const ahora = new Date();
    const hecho = await transaccionQueAsienta(async (tx) => {
      deCuenta = ""; // una vuelta reintentada por Serializable empieza de cero
      // El claim: dos clics o dos pestañas pagan una sola vez.
      const r = await tx.proyectoLiquidacion.updateMany({ where: { id, tenantId: a.tenantId, estado: "PUBLICADA" }, data: { estado: "PAGADA", pagadaEl: ahora, pagadaPor: a.nombre } });
      if (r.count === 0) return false;
      // Con la fila tomada: lo reclamado en la base tiene que ser lo que suma el total. Si no cuadra, no se paga nada.
      const fila = await tx.proyectoLiquidacion.findFirstOrThrow({ where: { id, tenantId: a.tenantId }, select: { extras: true } });
      const incluidas = await tx.proyectoRendicion.findMany({ where: { tenantId: a.tenantId, liquidacionId: id, estado: "aprobada" }, select: { id: true, gastoId: true, personaId: true, medio: true, anticipoId: true, montoCentavos: true, estado: true, eventos: true } });
      if (!reintegrosCuadran(leerExtras(fila.extras), incluidas)) throw new Descuadre();
      if (l.total > 0) {
        const total = redondear(l.total);
        const cuenta = await cuentaParaCuota(a.tenantId, formData, { tipo: "PAGO", monto: total, moneda: "ARS", importeEnPesos: total }, tx, "la liquidación");
        if (typeof cuenta === "string") throw new NoSeMarca(cuenta);
        const session = await tx.cashSession.findFirst({ where: { tenantId: a.tenantId, status: "OPEN" }, select: { id: true } });
        await asentarEnCajaTx(tx, "pago", {
          tenantId: a.tenantId,
          sessionId: session?.id ?? null,
          type: "EGRESO",
          method: metodoDeCaja(medio, await transferenciaEnElLibroTx(tx)),
          amount: total,
          reason: `Liquidación ${etiquetaMes(l.periodo)} · ${l.persona.nombre}${medio === "CHEQUE" ? " · Cheque" : ""}`,
          proyectoLiquidacionId: id,
          createdBy: marcaDeGastoProyecto(`liquidacion-${id}`),
        });
        // Después del asiento: si el día está cerrado, `asentarEnCajaTx` ya abortó y el saldo no se tocó.
        if (cuenta) {
          // T08 · O38: con M8, el movimiento de la cuenta queda registrado (×1) y se puede conciliar con el extracto.
          if (await hayM8(tx)) await moverCuentaTx(tx, a.tenantId, { cuentaId: cuenta.id, origenTipo: "LIQUIDACION", origenId: id, importeEnPesos: cuenta.movido });
          else await tx.proyectoCuentaBanco.updateMany({ where: { id: cuenta.id, tenantId: a.tenantId }, data: { saldo: { increment: cuenta.movido } } });
          deCuenta = ` · ${cuenta.nombre}`;
        }
      }
      for (const f of incluidas) {
        const res = aplicarAccion(rendicionDelMotor(f), "reintegrar", { fecha: ahora.toISOString(), actorId, rolActor: a.rol as RolActor, comentario: `Con la liquidación de ${etiquetaMes(l.periodo)}` });
        if (!res.ok) throw new Error(res.motivo);
        await tx.proyectoRendicion.updateMany({ where: { id: f.id, tenantId: a.tenantId, liquidacionId: id, estado: "aprobada" }, data: { estado: "reintegrada", reintegradoEl: ahora, eventos: res.rendicion.eventos as unknown as Prisma.InputJsonValue } });
      }
      await registrarCambio(tx, { tenantId: a.tenantId, entidad: "liquidacion", entidadId: id, campo: `pago ${l.periodo} de ${l.persona.nombre}`, antes: "publicada", despues: `pagada · ${medio} · $ ${l.total}${deCuenta}`, autor: a.nombre });
      if (l.persona.userId) await avisar(tx, { tenantId: a.tenantId, destinatarios: [l.persona.userId], tipo: "liquidacion", texto: `Te pagamos la liquidación de ${etiquetaMes(l.periodo)}.`, enlace: `/admin/proyectos/mi-liquidacion?periodo=${l.periodo}` });
      return true;
    });
    if (!hecho) return { ok: false, error: "Esta liquidación ya está pagada." };
  } catch (e) {
    if (e instanceof Descuadre) return { ok: false, error: DESCUADRE };
    if (e instanceof NoSeMarca) return { ok: false, error: e.message };
    if (e instanceof PeriodoCerradoError) return { ok: false, error: e.message };
    if (faltaLaMigracion(e)) return { ok: false, error: SIN_MIGRACION };
    throw e;
  }
  await auditAdmin({ action: "proyecto.liquidacion.pagar", entity: "ProyectoLiquidacion", entityId: id, changes: { medio, cuenta: deCuenta.slice(3) || "ninguna" } });
  revalidatePath(ADMIN);
  revalidatePath("/admin/proyectos/mi-liquidacion");
  return { ok: true };
}

/** Borrar un borrador: los reintegros que había reclamado quedan libres para otra liquidación o un reintegro directo. */
export async function borrarLiquidacion(formData: FormData): Promise<Resultado> {
  const a = await exigirEditar("liquidaciones");
  const id = txt(formData.get("id"));
  const hecho = await tenantTransaction(async (tx): Promise<boolean | "propia" | "no-existe"> => {
    const l = await tx.proyectoLiquidacion.findFirst({ where: { id, tenantId: a.tenantId, estado: "BORRADOR" }, select: { periodo: true, total: true, personaId: true, persona: { select: { userId: true } } } });
    // ADM-143: un id de otro negocio no existe para este; a ése no se le afirma un estado. Lo propio sí lo dice.
    if (!l) return (await tx.proyectoLiquidacion.findFirst({ where: { id, tenantId: a.tenantId }, select: { id: true } })) ? false : "no-existe";
    if (esLoPropio({ personaId: a.personaId, userId: a.user.id }, { personaId: l.personaId, userId: l.persona.userId })) return "propia";
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
  if (hecho === "propia") return { ok: false, error: LIQUIDACION_PROPIA };
  if (hecho === "no-existe") return { ok: false, error: "Esa liquidación no existe." };
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
  // G4: la persona de una liquidación no cambia; se mira antes de tomar la fila.
  const de = await prisma.proyectoLiquidacion.findFirst({ where: { id, tenantId: a.tenantId }, select: { personaId: true, persona: { select: { userId: true } } } });
  if (de && esLoPropio({ personaId: a.personaId, userId: a.user.id }, { personaId: de.personaId, userId: de.persona.userId })) return { ok: false, error: LIQUIDACION_PROPIA };
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
