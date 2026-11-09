/**
 * Persistencia de Contabilidad, ola 1 (docs/producto/contabilidad/PLAN.md §5).
 *
 * Toda escritura va dentro de `tenantTransaction` con el negocio explícito (RLS + candado de la
 * app). El motor puro (`asiento.ts`, `plan-modelo.ts`, `vencimientos.ts`) decide; esto guarda.
 * La base vuelve a controlar lo crítico (migración 20261104122000_contabilidad_ola1): FKs
 * compuestas con `tenantId`, CHECK de línea, cuadre diferido e inmutabilidad del confirmado.
 *
 * Numeración: el número se asigna AL CONFIRMAR, correlativo por ejercicio, bajo
 * `pg_advisory_xact_lock(negocio, ejercicio)`. Dos confirmaciones simultáneas se encolan; la
 * segunda ve el número de la primera ya commiteado. Como el número se toma dentro de la misma
 * transacción que confirma, un fallo hace rollback del número: no quedan saltos.
 *
 * Si la migración no está aplicada (P2021/P2022), cada función devuelve `MIGRACION_PENDIENTE`
 * en vez de un 500.
 */

import { tenantTransaction } from "@/lib/rls";
import {
  contraAsiento,
  validarAsiento,
  type ErrorAsiento,
  type EstadoEjercicio,
  type LineaAsiento,
  type OrigenAsiento,
} from "./asiento";
import { planModelo, type RubroContable } from "./plan-modelo";
import { problemaDeAsignacion, rolesModelo, type RolCuenta } from "./roles";
import {
  calcularVencimientos,
  diaIso,
  ESTADOS_VENCIMIENTO,
  hoyEnArgentina,
  type EstadoVencimiento,
  type TablaVencimientos,
} from "./vencimientos";
import { FERIADOS_2026, TABLA_VENCIMIENTOS_2026 } from "./tabla-vencimientos-2026";

type Tx = Parameters<Parameters<typeof tenantTransaction>[0]>[0];

export type CodigoErrorRepo =
  | "MIGRACION_PENDIENTE"
  | "ASIENTO_INVALIDO"
  | "NO_ENCONTRADO"
  | "YA_CONFIRMADO"
  | "NO_CONFIRMADO"
  | "YA_ANULADO"
  | "EJERCICIO_SUPERPUESTO"
  | "FECHAS_INVALIDAS"
  | "SIN_CUIT"
  | "CUIT_INVALIDO"
  | "PERIODO_INVALIDO"
  | "ESTADO_INVALIDO"
  | "ROL_INVALIDO";

export type Resultado<T> = ({ ok: true } & T) | { ok: false; error: CodigoErrorRepo; mensaje: string; errores?: ErrorAsiento[] };

export const MENSAJE_MIGRACION_PENDIENTE =
  "Contabilidad todavía no está habilitada en este negocio: falta aplicar las migraciones 20261104122000_contabilidad_ola1 y 20261108150000_contabilidad_ola2_roles.";

/** P2021 (tabla inexistente) / P2022 (columna inexistente): el código llegó antes que su migración. */
export function esMigracionPendiente(e: unknown): boolean {
  const code = (e as { code?: string } | null)?.code;
  return code === "P2021" || code === "P2022";
}

class Rechazo extends Error {
  constructor(
    readonly codigo: CodigoErrorRepo,
    mensaje: string,
    readonly errores?: ErrorAsiento[],
  ) {
    super(mensaje);
  }
}

async function enTransaccion<T>(tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<Resultado<T>> {
  try {
    const valor = await tenantTransaction(fn, { tenantId });
    return { ok: true, ...valor };
  } catch (e) {
    if (e instanceof Rechazo) return { ok: false, error: e.codigo, mensaje: e.message, ...(e.errores ? { errores: e.errores } : {}) };
    if (esMigracionPendiente(e)) return { ok: false, error: "MIGRACION_PENDIENTE", mensaje: MENSAJE_MIGRACION_PENDIENTE };
    throw e;
  }
}

/** Fecha civil como DATE (00:00 UTC). */
function soloDia(d: Date): Date {
  return new Date(`${diaIso(d)}T00:00:00Z`);
}

async function candado(tx: Tx, clave: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${clave}, 0))`;
}

// ── Plan de cuentas ──────────────────────────────────────────────────────────────────────────

/**
 * Siembra el plan modelo del rubro con sus atributos de gestión (ola 2), deja asignados los roles
 * de cuenta del rubro y anota el rubro en `ConfigContable`. Idempotente: las cuentas que ya existen
 * (por código) no se tocan, un rol ya asignado no se reasigna y el rubro anotado no se pisa.
 */
export function sembrarPlanModelo(
  tenantId: string,
  rubro: RubroContable,
): Promise<Resultado<{ creadas: number; existentes: number; rolesAsignados: number }>> {
  return enTransaccion(tenantId, async (tx) => {
    await candado(tx, `contabilidad-plan:${tenantId}`);
    const existentes = await tx.cuentaContable.findMany({ where: { tenantId }, select: { id: true, codigo: true, tipo: true, imputable: true, activa: true } });
    const porCodigo = new Map(existentes.map((c) => [c.codigo, c]));
    let creadas = 0;
    for (const c of planModelo(rubro)) {
      if (porCodigo.has(c.codigo)) continue;
      const nueva = await tx.cuentaContable.create({
        data: {
          tenantId,
          codigo: c.codigo,
          nombre: c.nombre,
          tipo: c.tipo,
          naturaleza: c.naturaleza,
          padreId: c.padreCodigo ? (porCodigo.get(c.padreCodigo)?.id ?? null) : null,
          imputable: c.imputable,
          activa: true,
          rubro: c.rubro,
          plazo: c.plazo,
          funcion: c.funcion,
          monetaria: c.monetaria,
          ritmo: c.ritmo,
          nombreDueno: c.nombreDueno,
        },
        select: { id: true, codigo: true, tipo: true, imputable: true, activa: true },
      });
      porCodigo.set(c.codigo, nueva);
      creadas++;
    }

    // Roles: sólo los que faltan, y sólo si la cuenta del código puede cumplirlos (un negocio que
    // cambió el uso de un código no recibe un rol equivocado: queda sin asignar para el contador).
    const yaAsignados = new Set((await tx.cuentaRol.findMany({ where: { tenantId }, select: { rol: true } })).map((r) => r.rol));
    const nuevos: { tenantId: string; rol: RolCuenta; cuentaId: string }[] = [];
    for (const [rol, codigo] of rolesModelo(rubro)) {
      const cuenta = porCodigo.get(codigo);
      if (yaAsignados.has(rol) || !cuenta || problemaDeAsignacion(rol, cuenta)) continue;
      nuevos.push({ tenantId, rol, cuentaId: cuenta.id });
    }
    const roles = nuevos.length ? await tx.cuentaRol.createMany({ data: nuevos, skipDuplicates: true }) : { count: 0 };

    await tx.configContable.upsert({
      where: { tenantId },
      create: { tenantId, rubroNegocio: rubro },
      update: {},
    });
    await tx.configContable.updateMany({ where: { tenantId, rubroNegocio: null }, data: { rubroNegocio: rubro } });

    return { creadas, existentes: existentes.length, rolesAsignados: roles.count };
  });
}

/**
 * Asigna (o cambia) la cuenta que cumple un rol. La cuenta tiene que ser de ESTE negocio (se busca
 * con su `tenantId`; además la FK compuesta lo garantiza), imputable, activa y del tipo del rol.
 */
export function asignarRolCuenta(tenantId: string, rol: string, cuentaId: string): Promise<Resultado<{ rol: RolCuenta; cuentaId: string }>> {
  return enTransaccion(tenantId, async (tx) => {
    const cuenta = await tx.cuentaContable.findFirst({ where: { id: cuentaId, tenantId }, select: { id: true, tipo: true, imputable: true, activa: true } });
    if (!cuenta) throw new Rechazo("NO_ENCONTRADO", "Esa cuenta no existe en el plan de este negocio.");
    const problema = problemaDeAsignacion(rol, cuenta);
    if (problema) throw new Rechazo("ROL_INVALIDO", problema.mensaje);
    await tx.cuentaRol.upsert({
      where: { tenantId_rol: { tenantId, rol } },
      create: { tenantId, rol, cuentaId },
      update: { cuentaId },
    });
    return { rol: rol as RolCuenta, cuentaId };
  });
}

// ── Ejercicios ───────────────────────────────────────────────────────────────────────────────

export function abrirEjercicio(
  tenantId: string,
  input: { fechaInicio: Date; fechaCierre: Date },
): Promise<Resultado<{ ejercicioId: string }>> {
  return enTransaccion(tenantId, async (tx) => {
    const inicio = soloDia(input.fechaInicio);
    const cierre = soloDia(input.fechaCierre);
    if (Number.isNaN(inicio.getTime()) || Number.isNaN(cierre.getTime()) || cierre < inicio) {
      throw new Rechazo("FECHAS_INVALIDAS", "El cierre del ejercicio tiene que ser igual o posterior al inicio.");
    }
    await candado(tx, `contabilidad-ejercicio:${tenantId}`);
    const pisado = await tx.ejercicio.findFirst({
      where: { tenantId, fechaInicio: { lte: cierre }, fechaCierre: { gte: inicio } },
      select: { id: true },
    });
    if (pisado) throw new Rechazo("EJERCICIO_SUPERPUESTO", "Ya hay un ejercicio que cubre parte de esas fechas.");
    const ej = await tx.ejercicio.create({ data: { tenantId, fechaInicio: inicio, fechaCierre: cierre, estado: "ABIERTO" }, select: { id: true } });
    return { ejercicioId: ej.id };
  });
}

// ── Asientos ─────────────────────────────────────────────────────────────────────────────────

export interface AsientoInput {
  fecha: Date;
  descripcion: string;
  lineas: LineaAsiento[];
  origenTipo?: OrigenAsiento;
  origenId?: string | null;
  /** true: se guarda y se confirma (con número) en la misma transacción. */
  confirmar?: boolean;
}

export interface AsientoGuardado {
  asientoId: string;
  ejercicioId: string;
  numero: number | null;
  estado: "BORRADOR" | "CONFIRMADO";
}

/**
 * Valida contra las cuentas y el ejercicio que ve ESTE negocio (las de otro no existen para él).
 * `inactivasPermitidas`: cuentas que pueden estar dadas de baja (el contra-asiento revierte las
 * mismas cuentas del original aunque hoy ya no se usen).
 */
async function validarEnTx(tx: Tx, tenantId: string, fecha: Date, lineas: readonly LineaAsiento[], inactivasPermitidas?: ReadonlySet<string>) {
  const ids = [...new Set(lineas.map((l) => l.cuentaId))];
  const encontradas = await tx.cuentaContable.findMany({
    where: { tenantId, id: { in: ids } },
    select: { id: true, tenantId: true, codigo: true, nombre: true, imputable: true, activa: true },
  });
  const cuentas = inactivasPermitidas ? encontradas.map((c) => (inactivasPermitidas.has(c.id) ? { ...c, activa: true } : c)) : encontradas;
  const ejercicios = await tx.ejercicio.findMany({
    where: { tenantId, fechaInicio: { lte: fecha }, fechaCierre: { gte: fecha } },
    select: { id: true, fechaInicio: true, fechaCierre: true, estado: true },
  });
  const ejercicio = ejercicios.find((e) => e.estado === "ABIERTO") ?? ejercicios[0] ?? null;
  const r = validarAsiento(lineas, cuentas, {
    tenantId,
    fecha,
    ejercicio: ejercicio ? { ...ejercicio, estado: ejercicio.estado as EstadoEjercicio } : null,
  });
  if (!r.ok) throw new Rechazo("ASIENTO_INVALIDO", r.errores.map((e) => e.mensaje).join(" "), r.errores);
  return ejercicio!;
}

/** Asigna el próximo número del ejercicio y confirma. Se llama dentro de la transacción. */
async function confirmarEnTx(tx: Tx, tenantId: string, asientoId: string, ejercicioId: string): Promise<number> {
  await candado(tx, `contabilidad-numero:${tenantId}:${ejercicioId}`);
  const max = await tx.asiento.aggregate({ where: { tenantId, ejercicioId }, _max: { numero: true } });
  const numero = (max._max.numero ?? 0) + 1;
  await tx.asiento.update({ where: { id: asientoId, tenantId }, data: { numero, estado: "CONFIRMADO" } });
  return numero;
}

async function crearEnTx(
  tx: Tx,
  tenantId: string,
  input: AsientoInput,
  anula?: { asientoId: string; cuentas: ReadonlySet<string> },
): Promise<AsientoGuardado> {
  const fecha = soloDia(input.fecha);
  const ejercicio = await validarEnTx(tx, tenantId, fecha, input.lineas, anula?.cuentas);
  const anulaAsientoId = anula?.asientoId;
  const asiento = await tx.asiento.create({
    data: {
      tenantId,
      ejercicioId: ejercicio.id,
      fecha,
      descripcion: input.descripcion.trim(),
      origenTipo: input.origenTipo ?? "MANUAL",
      origenId: input.origenId ?? null,
      anulaAsientoId: anulaAsientoId ?? null,
      estado: "BORRADOR",
    },
    select: { id: true },
  });
  await tx.asientoLinea.createMany({
    data: input.lineas.map((l) => ({
      tenantId,
      asientoId: asiento.id,
      cuentaId: l.cuentaId,
      debe: l.debe,
      haber: l.haber,
      detalle: l.detalle ?? null,
      // Sólo si vino: un asiento sin fechas de origen se sigue guardando aunque falte la ola 2.
      ...(l.fechaOrigen != null ? { fechaOrigen: soloDia(l.fechaOrigen) } : {}),
    })),
  });
  if (!input.confirmar) return { asientoId: asiento.id, ejercicioId: ejercicio.id, numero: null, estado: "BORRADOR" };
  const numero = await confirmarEnTx(tx, tenantId, asiento.id, ejercicio.id);
  return { asientoId: asiento.id, ejercicioId: ejercicio.id, numero, estado: "CONFIRMADO" };
}

/** Alta de un asiento (borrador, o confirmado con número si `confirmar`). Valida con el motor. */
export function registrarAsiento(tenantId: string, input: AsientoInput): Promise<Resultado<AsientoGuardado>> {
  return enTransaccion(tenantId, (tx) => crearEnTx(tx, tenantId, input));
}

/**
 * Toma el asiento con FOR UPDATE: dos confirmaciones o anulaciones simultáneas del mismo asiento se
 * encolan, y la segunda (READ COMMITTED) lee lo que dejó la primera ya commiteado.
 */
async function bloquearAsiento(tx: Tx, tenantId: string, asientoId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "Asiento" WHERE "id" = ${asientoId} AND "tenantId" = ${tenantId} FOR UPDATE`;
}

/** Código Prisma de un error, si lo tiene. */
function codigoDe(e: unknown): string | undefined {
  return (e as { code?: string } | null)?.code;
}

/** Confirma un borrador: revalida (cuentas y ejercicio pueden haber cambiado) y le da número. */
export function confirmarAsiento(tenantId: string, asientoId: string): Promise<Resultado<AsientoGuardado>> {
  return enTransaccion(tenantId, async (tx) => {
    await bloquearAsiento(tx, tenantId, asientoId);
    const a = await tx.asiento.findFirst({
      where: { id: asientoId, tenantId },
      select: { id: true, fecha: true, estado: true, lineas: { select: { cuentaId: true, debe: true, haber: true } } },
    });
    if (!a) throw new Rechazo("NO_ENCONTRADO", "No encontramos ese asiento.");
    if (a.estado === "CONFIRMADO") throw new Rechazo("YA_CONFIRMADO", "El asiento ya está confirmado.");
    const ejercicio = await validarEnTx(tx, tenantId, a.fecha, a.lineas);
    // Si cambió de ejercicio (p. ej. se abrió uno nuevo), queda en el que corresponde a su fecha.
    await tx.asiento.update({ where: { id: a.id, tenantId }, data: { ejercicioId: ejercicio.id } });
    const numero = await confirmarEnTx(tx, tenantId, a.id, ejercicio.id);
    return { asientoId: a.id, ejercicioId: ejercicio.id, numero, estado: "CONFIRMADO" as const };
  });
}

/** Anula un asiento confirmado con su contra-asiento (confirmado, con `anulaAsientoId`). */
export async function anularAsiento(tenantId: string, asientoId: string, fecha?: Date): Promise<Resultado<AsientoGuardado>> {
  try {
    return await anularEnTransaccion(tenantId, asientoId, fecha);
  } catch (e) {
    // Red de seguridad: si igual chocan dos anulaciones, el índice único de `anulaAsientoId` frena la segunda.
    if (codigoDe(e) === "P2002") return { ok: false, error: "YA_ANULADO", mensaje: "Ese asiento ya tiene su contra-asiento." };
    throw e;
  }
}

function anularEnTransaccion(tenantId: string, asientoId: string, fecha?: Date): Promise<Resultado<AsientoGuardado>> {
  return enTransaccion(tenantId, async (tx) => {
    await bloquearAsiento(tx, tenantId, asientoId);
    const a = await tx.asiento.findFirst({
      where: { id: asientoId, tenantId },
      select: {
        id: true,
        numero: true,
        fecha: true,
        descripcion: true,
        estado: true,
        // fechaOrigen viaja al contra-asiento: la partida no monetaria se revierte con SU origen (T8).
        lineas: { select: { cuentaId: true, debe: true, haber: true, detalle: true, fechaOrigen: true } },
        anuladoPor: { select: { id: true } },
      },
    });
    if (!a) throw new Rechazo("NO_ENCONTRADO", "No encontramos ese asiento.");
    if (a.estado !== "CONFIRMADO") throw new Rechazo("NO_CONFIRMADO", "Un borrador no se anula: se corrige o se borra.");
    if (a.anuladoPor.length) throw new Rechazo("YA_ANULADO", "Ese asiento ya tiene su contra-asiento.");
    const contra = contraAsiento({ numero: a.numero ?? undefined, fecha: a.fecha, descripcion: a.descripcion, lineas: a.lineas }, fecha ?? a.fecha);
    return crearEnTx(
      tx,
      tenantId,
      { ...contra, origenTipo: "AJUSTE", origenId: a.id, confirmar: true },
      { asientoId: a.id, cuentas: new Set(a.lineas.map((l) => l.cuentaId)) },
    );
  });
}

// ── Vencimientos fiscales ────────────────────────────────────────────────────────────────────

export interface OpcionesCalendario {
  tabla?: TablaVencimientos;
  feriados?: readonly string[];
}

/**
 * Genera los vencimientos del período. Idempotente: los que ya existen no se tocan (ni su estado).
 * `cuit` null → el del negocio (ADR-066: `Tenant.arcaCuit`, si no el del certificado fiscal).
 * Si el negocio no tiene obligaciones cargadas, se siembran desde la tabla (provisional).
 */
export function generarCalendario(
  tenantId: string,
  cuit: string | null,
  periodo: string,
  opts: OpcionesCalendario = {},
): Promise<Resultado<{ creados: number; existentes: number; avisos: string[] }>> {
  const tabla = opts.tabla ?? TABLA_VENCIMIENTOS_2026;
  return enTransaccion(tenantId, async (tx) => {
    let elCuit = cuit;
    if (!elCuit) {
      const t = await tx.tenant.findUnique({ where: { id: tenantId }, select: { arcaCuit: true } });
      elCuit = t?.arcaCuit ?? null;
      if (!elCuit) {
        const cred = await tx.tenantFiscalCredential.findFirst({ where: { tenantId }, select: { certCuit: true } });
        elCuit = cred?.certCuit ?? null;
      }
    }
    if (!elCuit) throw new Rechazo("SIN_CUIT", "El negocio no tiene CUIT cargado. Cargalo en los datos fiscales.");

    await candado(tx, `contabilidad-calendario:${tenantId}`);
    let obligaciones = await tx.obligacionFiscal.findMany({ where: { tenantId }, select: { id: true, codigo: true, activa: true } });
    if (obligaciones.length === 0) {
      await tx.obligacionFiscal.createMany({
        data: tabla.obligaciones.map((o) => ({
          tenantId,
          codigo: o.codigo,
          nombre: o.nombre,
          organismo: o.organismo,
          jurisdiccion: o.jurisdiccion ?? null,
          periodicidad: o.periodicidad,
          accion: o.accion,
          activa: true,
        })),
        skipDuplicates: true,
      });
      obligaciones = await tx.obligacionFiscal.findMany({ where: { tenantId }, select: { id: true, codigo: true, activa: true } });
    }
    const activas = obligaciones.filter((o) => o.activa);
    const r = calcularVencimientos(elCuit, periodo, tabla, opts.feriados ?? FERIADOS_2026, activas.map((o) => o.codigo));
    if (!r.ok) throw new Rechazo(r.error, r.mensaje);

    const idPorCodigo = new Map(activas.map((o) => [o.codigo, o.id]));
    const { count } = await tx.vencimientoFiscal.createMany({
      data: r.vencimientos.map((v) => ({
        tenantId,
        obligacionId: idPorCodigo.get(v.codigo)!,
        periodo: v.periodo,
        cuota: v.cuota,
        fechaVencimiento: v.fechaVencimiento,
        estado: "PENDIENTE",
      })),
      skipDuplicates: true,
    });
    return { creados: count, existentes: r.vencimientos.length - count, avisos: r.avisos };
  });
}

/**
 * Cambia el estado guardado de un vencimiento («vencido» no se guarda: se calcula). Al pasar a
 * PRESENTADO o PAGADO, si no viene la fecha se toma la de hoy en Argentina.
 */
export function cambiarEstadoVencimiento(
  tenantId: string,
  vencimientoId: string,
  estado: EstadoVencimiento,
  fechas: { fechaPresentacion?: Date | null; fechaPago?: Date | null } = {},
): Promise<Resultado<{ vencimientoId: string; estado: EstadoVencimiento }>> {
  return enTransaccion(tenantId, async (tx) => {
    if (!ESTADOS_VENCIMIENTO.includes(estado)) throw new Rechazo("ESTADO_INVALIDO", "Ese estado no existe para un vencimiento.");
    const v = await tx.vencimientoFiscal.findFirst({ where: { id: vencimientoId, tenantId }, select: { id: true, fechaPresentacion: true, fechaPago: true } });
    if (!v) throw new Rechazo("NO_ENCONTRADO", "No encontramos ese vencimiento.");
    const hoy = hoyEnArgentina();
    const fechaPresentacion =
      fechas.fechaPresentacion !== undefined ? fechas.fechaPresentacion && soloDia(fechas.fechaPresentacion) : estado === "PRESENTADO" ? (v.fechaPresentacion ?? hoy) : v.fechaPresentacion;
    const fechaPago = fechas.fechaPago !== undefined ? fechas.fechaPago && soloDia(fechas.fechaPago) : estado === "PAGADO" ? (v.fechaPago ?? hoy) : v.fechaPago;
    await tx.vencimientoFiscal.update({ where: { id: v.id, tenantId }, data: { estado, fechaPresentacion, fechaPago } });
    return { vencimientoId: v.id, estado };
  });
}
