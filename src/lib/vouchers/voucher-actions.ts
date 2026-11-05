"use server";

// ============================================================================
// VOUCHERS — Server Actions (CH Estética · La Alameda). Sin UI acá: la pantalla las llama.
// ============================================================================
//
// Cada acción: (1) capability del rol, (2) interruptor «vouchers» del negocio (apagado = rechazo,
// nada se escribe), (3) tenantId del request, (4) el repo con su transacción. Cobrar con voucher
// exige además `PaymentMethod.VOUCHER` en la base (cobrarConVoucher lo pregunta al probe). Un rechazo de dominio
// vuelve como `{ ok:false, error }` con el mensaje tal cual; la tabla ausente (migración
// 20261105120000_vouchers sin aplicar, Gate 2) vuelve como «falta un paso de base de datos», sin 500.

import { unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { isDemoSandbox } from "@/lib/demo-flag";
import { rechazoDeDominio } from "@/lib/rechazo-de-dominio";
import { isPrismaError } from "@/lib/prisma-errors";
import { interruptoresDelNegocio } from "@/cambios/interruptores.server";
import { vouchersPrendidos } from "@/cambios/interruptores";
import { isDayKey } from "@/lib/caja/cierre-diario";
import { leerFilasDeTurnos } from "@/lib/turnos/sin-cerrar.server";
import { puedeCobrarEsteTurno } from "@/lib/turnos/cobro-mostrador";
import { CobroTurnoRechazado } from "@/lib/turnos/cobro-turno-repo";
import { csvDelReporte, esEstadoVoucher, leerCsvLiquidacion, leerCsvOpenKey, leerMonto, MENSAJES_VOUCHER } from "./voucher-core";
import {
  cobrarConVoucher,
  crearLote as crearLoteRepo,
  importarFotoOpenKey,
  importarLiquidacionOpenKey,
  listarVouchersDe,
  type CobrarConVoucherResult,
  type FiltrosVouchers,
  type FilaVoucher,
  type ResultadoImportacion,
  type ResultadoImportacionLiquidacion,
} from "./voucher-repo";

export type ResultadoVoucher<T> = { ok: true; valor: T } | { ok: false; error: string };

const MIGRACION_PENDIENTE =
  "Los vouchers necesitan un paso de base de datos que todavía no se aplicó (lo hace el dueño). Cuando se aplique, se encienden solos.";
const NO_SE_PUDO = "No se pudo completar y no quedó nada a medias. Probá de nuevo; si sigue, avisá.";
const MODO_DEMO = "En la demo los vouchers no se guardan.";
const TOPE_CSV = 2 * 1024 * 1024; // 2 MB

function texto(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v.trim() : "";
}

function esMigracionPendiente(e: unknown): boolean {
  return isPrismaError(e, "P2021") || isPrismaError(e, "P2022");
}

function comoError(e: unknown, scope: string): { ok: false; error: string } {
  unstable_rethrow(e);
  if (esMigracionPendiente(e)) return { ok: false, error: MIGRACION_PENDIENTE };
  // El cobro de turno rechaza con su propio error (caja de hoy cerrada, saldo): el mensaje va tal cual.
  if (e instanceof CobroTurnoRechazado) return { ok: false, error: e.message };
  return { ok: false, error: rechazoDeDominio(e, NO_SE_PUDO, scope) };
}

async function apagado(): Promise<boolean> {
  return !vouchersPrendidos(await interruptoresDelNegocio());
}

const APAGADO = { ok: false as const, error: MENSAJES_VOUCHER.apagado };

function revalidar() {
  revalidatePath("/admin/turnos");
  revalidatePath("/admin/vouchers");
}

/**
 * Cobra el turno con un voucher: un cobro `VOUCHER` por el saldo (o por `monto`, si es menor), a
 * cobrar a OpenKey; el resto se cobra con los medios de siempre. Campos: `appointmentId`, `numero`,
 * `monto` (opcional). Capability `agenda:collect` + el permiso sobre ESTE turno (la profesional que
 * cobra aparte) + interruptor + `PaymentMethod.VOUCHER` en la base. Anular este cobro va por la
 * anulación de siempre (cobro-actions.ts), con `FilaVoucher.collectionId`.
 */
export async function aplicarVoucherAlTurno(formData: FormData): Promise<ResultadoVoucher<CobrarConVoucherResult>> {
  const user = await requireCapability("agenda:collect");
  if (await apagado()) return APAGADO;
  if (isDemoSandbox()) return { ok: false, error: MODO_DEMO };
  const appointmentId = texto(formData.get("appointmentId"));
  const numero = texto(formData.get("numero"));
  if (!appointmentId) return { ok: false, error: "Falta identificar el turno." };
  if (!numero) return { ok: false, error: "Falta el número del voucher." };
  const montoRaw = texto(formData.get("monto"));
  const monto = montoRaw ? leerMonto(montoRaw) : null;
  if (montoRaw && monto == null) return { ok: false, error: "El monto del voucher no se entiende." };
  const tenantId = await getCurrentTenantId();
  try {
    const [fila] = await leerFilasDeTurnos(tenantId, { ids: [appointmentId] });
    if (!fila) return { ok: false, error: "Ese turno ya no existe. Recargá la agenda." };
    const veredicto = puedeCobrarEsteTurno({
      rol: user.role,
      professionalIdDelUsuario: user.professionalId,
      professionalIdDelTurno: fila.professionalId,
      nombreProfesional: fila.professional.name,
      cobraEnMostrador: fila.professional.cobraEnMostrador,
    });
    if (!veredicto.ok) return { ok: false, error: veredicto.motivo };
    const valor = await cobrarConVoucher(tenantId, { numero, appointmentId, monto, actor: `user:${user.id}` });
    revalidar();
    return { ok: true, valor };
  } catch (e) {
    return comoError(e, "vouchers.cobrar");
  }
}

/**
 * Da de alta un lote. Campos: `lote` (número), `fecha` (YYYY-MM-DD, opcional), `clientId` (el vecino
 * al que se le dieron) y `numeros` (uno por renglón, o separados por coma, punto y coma o espacio).
 * [provisional a confirmar: un lote = un vecino]
 */
export async function crearLote(formData: FormData): Promise<ResultadoVoucher<{ loteId: string; creados: number }>> {
  await requireCapability("clients:manage");
  if (await apagado()) return APAGADO;
  if (isDemoSandbox()) return { ok: false, error: MODO_DEMO };
  const clientId = texto(formData.get("clientId"));
  if (!clientId) return { ok: false, error: "Elegí el vecino al que se le dieron los vouchers." };
  const numeros = texto(formData.get("numeros"))
    .split(/[\s,;]+/)
    .filter(Boolean);
  const fechaRaw = texto(formData.get("fecha"));
  if (fechaRaw && !isDayKey(fechaRaw)) return { ok: false, error: "La fecha del lote no es válida." };
  const tenantId = await getCurrentTenantId();
  try {
    const valor = await crearLoteRepo(tenantId, {
      numeroLote: texto(formData.get("lote")),
      fecha: fechaRaw ? new Date(`${fechaRaw}T12:00:00Z`) : undefined,
      asignaciones: numeros.map((numero) => ({ numero, clientId })),
    });
    revalidar();
    return { ok: true, valor };
  } catch (e) {
    return comoError(e, "vouchers.crear-lote");
  }
}

/** Importa la exportación de OpenKey y concilia. Campo `csv`: archivo (File) o texto. */
export async function importarOpenKey(formData: FormData): Promise<ResultadoVoucher<ResultadoImportacion & { erroresDeLectura: { linea: number; motivo: string }[] }>> {
  const user = await requireCapability("clients:manage");
  if (await apagado()) return APAGADO;
  if (isDemoSandbox()) return { ok: false, error: MODO_DEMO };
  const contenido = await contenidoDelCsv(formData);
  if (typeof contenido !== "string") return { ok: false, error: contenido.error };
  const lectura = leerCsvOpenKey(contenido);
  if (lectura.filas.length === 0) {
    return { ok: false, error: lectura.errores[0]?.motivo ?? "El archivo no trae vouchers." };
  }
  const tenantId = await getCurrentTenantId();
  try {
    const r = await importarFotoOpenKey(tenantId, {
      filas: lectura.filas,
      origen: "MANUAL",
      actor: `user:${user.id}`,
      erroresDeLectura: lectura.errores,
    });
    revalidar();
    return { ok: true, valor: { ...r, erroresDeLectura: lectura.errores } };
  } catch (e) {
    return comoError(e, "vouchers.importar-openkey");
  }
}

async function contenidoDelCsv(formData: FormData): Promise<string | { error: string }> {
  const campo = formData.get("csv");
  let contenido = "";
  if (typeof campo === "string") contenido = campo;
  else if (campo && typeof campo === "object" && "text" in campo) {
    if (campo.size > TOPE_CSV) return { error: "El archivo es muy grande (máximo 2 MB)." };
    contenido = await campo.text();
  }
  if (contenido.length > TOPE_CSV) return { error: "El archivo es muy grande (máximo 2 MB)." };
  return contenido;
}

/** Importa la LIQUIDACIÓN de OpenKey (lo que paga por cada voucher) y concilia. Campo `csv`. */
export async function importarLiquidacion(
  formData: FormData,
): Promise<ResultadoVoucher<ResultadoImportacionLiquidacion & { erroresDeLectura: { linea: number; motivo: string }[] }>> {
  const user = await requireCapability("clients:manage");
  if (await apagado()) return APAGADO;
  if (isDemoSandbox()) return { ok: false, error: MODO_DEMO };
  const contenido = await contenidoDelCsv(formData);
  if (typeof contenido !== "string") return { ok: false, error: contenido.error };
  const lectura = leerCsvLiquidacion(contenido);
  if (lectura.filas.length === 0) return { ok: false, error: lectura.errores[0]?.motivo ?? "El archivo no trae vouchers." };
  const tenantId = await getCurrentTenantId();
  try {
    const r = await importarLiquidacionOpenKey(tenantId, {
      filas: lectura.filas,
      origen: "MANUAL",
      actor: `user:${user.id}`,
      erroresDeLectura: lectura.errores,
    });
    revalidar();
    return { ok: true, valor: { ...r, erroresDeLectura: lectura.errores } };
  } catch (e) {
    return comoError(e, "vouchers.importar-liquidacion");
  }
}

function leerFiltros(f: Partial<Record<keyof FiltrosVouchers, string | null | undefined>>): FiltrosVouchers | string {
  const desde = f.desde?.trim() || null;
  const hasta = f.hasta?.trim() || null;
  if ((desde && !isDayKey(desde)) || (hasta && !isDayKey(hasta))) return "Las fechas del filtro no son válidas.";
  const estado = f.estado?.trim() || null;
  if (estado && !esEstadoVoucher(estado)) return "El estado del filtro no es válido.";
  return {
    desde,
    hasta,
    loteId: f.loteId?.trim() || null,
    clientId: f.clientId?.trim() || null,
    estado: estado as FiltrosVouchers["estado"],
    numero: f.numero?.trim() || null,
  };
}

/** El listado del reporte (número a la vista), con filtros por fecha de uso, lote, cliente y estado. */
export async function listarVouchers(
  filtros: Partial<Record<keyof FiltrosVouchers, string | null | undefined>> = {},
): Promise<ResultadoVoucher<FilaVoucher[]>> {
  await requireCapability("clients:read");
  if (await apagado()) return APAGADO;
  const f = leerFiltros(filtros);
  if (typeof f === "string") return { ok: false, error: f };
  try {
    return { ok: true, valor: await listarVouchersDe(await getCurrentTenantId(), f) };
  } catch (e) {
    return comoError(e, "vouchers.listar");
  }
}

/** El mismo listado como CSV (BOM, `;`, fórmulas neutralizadas), para mandarle a La Alameda. */
export async function exportarVouchersCsv(
  filtros: Partial<Record<keyof FiltrosVouchers, string | null | undefined>> = {},
): Promise<ResultadoVoucher<string>> {
  const r = await listarVouchers(filtros);
  if (!r.ok) return r;
  return { ok: true, valor: csvDelReporte(r.valor) };
}
