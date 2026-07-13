// ============================================================================
// MONITOR DE SOPORTE — agregador de datos (server-side, READ-ONLY). Control-plane.
// ============================================================================
//
// Reúne, desde fuentes de SOLO LECTURA (operatorPrisma, cross-tenant), todo lo que
// necesita un implementador/soporte para diagnosticar SIN salir de la pantalla:
//   - la cola del outbox de ARCA (pendientes/fallidos, reintentos, error en criollo),
//   - las facturas rechazadas (con el motivo traducido),
//   - el estado fiscal por tenant (modo, CUIT ✓/✗, cert ✓/✗ + vencimiento, últ. emisión),
//   - la salud de la plataforma (superficies up/down) + estado de los crons.
//
// PRINCIPIOS (ADR-021 / ADR-018 / ADR-064):
//   · REUSA lo que existe (OutboxEvent.lastError/attempts, Invoice.rechazoMotivo,
//     TenantFiscalCredential) — NO inventa tablas.
//   · RESILIENTE: un tablero de diagnóstico no puede caerse porque una fuente falle o
//     una migración esté pendiente (Gate 2). Cada lectura va en try/catch y degrada.
//   · CERO ESCRITURAS. CERO SECRETOS: solo metadata no sensible (certCuit/vencimiento),
//     NUNCA el material cifrado (sealed/wrappedDek), tokens ni connection strings.

import { operatorPrisma } from "@/lib/operator-db";
import { logger } from "@/lib/logger";
import { modoDesdeEnv } from "@/plugins/arca";
import { OUTBOX_INVOICE_CREATED } from "@/lib/invoice-core";
import { isInvoicingEnabled } from "@/lib/fiscal";
import { modoCobrosDesdeEnv } from "@/lib/mercadopago-cobros-dispatch";
import {
  type TenantSalud,
  type ResumenSalud,
  type ComponenteSalud,
  estadoDeTenant,
  resumenSalud,
  saludComponentes,
} from "@/lib/cockpit/salud";
import { traducirErrorArca, type DiagnosticoError, type SeveridadError } from "./arca-errores";

// ── Tipos de salida ───────────────────────────────────────────────────────────

/** Un comprobante en la cola del outbox (pendiente o fallido), con su error legible. */
export interface ComprobanteEnCola {
  /** id del OutboxEvent (lo que necesita el botón Reintentar). */
  eventId: string;
  invoiceId: string | null;
  tenantId: string;
  tenantNombre: string;
  intentos: number;
  esperandoDesde: string; // ISO createdAt
  /** "pendiente" = nunca despachado; "fallido" = intentó y falló (attempts>0). */
  estado: "pendiente" | "fallido";
  diagnostico: DiagnosticoError | null; // null si aún no falló (pendiente sin error)
}

/** Una factura rechazada por ARCA (rechazo determinístico), con el motivo traducido. */
export interface FacturaRechazada {
  invoiceId: string;
  tenantId: string;
  tenantNombre: string;
  total: number | null;
  fecha: string;
  cuando: string; // ISO createdAt
  diagnostico: DiagnosticoError | null;
}

/** Estado fiscal de un tenant "de un vistazo" (mismo criterio que la ficha del tenant). */
export interface FiscalTenant {
  id: string;
  nombre: string;
  slug: string;
  modo: "stub" | "homologacion" | "real";
  cuit: string | null;
  cuitOk: boolean;
  certOk: boolean;
  certCuit: string | null;
  certVence: string | null; // AAAA-MM-DD
  certVencido: boolean;
  cuitCertMismatch: boolean;
  ultimaEmision: string | null; // ISO — última factura AUTORIZADA
  ultimoError: DiagnosticoError | null; // último rechazo/fallo visto
  pendientes: number; // comprobantes en cola de este tenant
  listoParaFacturar: boolean;
}

/** Estado de un cron (lo que se puede derivar sin una tabla de corridas). */
export interface EstadoCron {
  id: string;
  nombre: string;
  agenda: string; // cron expression, legible
  ultimaSenal: string | null; // ISO — señal derivada (ej. últ. outbox procesado), o null
  nota: string;
}

/** Alerta cross-tenant para el panel "necesita tu ojo". */
export interface AlertaMonitor {
  id: string;
  severidad: SeveridadError;
  titulo: string;
  detalle: string;
  accion: string;
  tenantId: string | null;
}

export interface ResumenFacturacion {
  pendientes: number;
  fallidos: number;
  autorizadas: number;
  rechazadas: number;
}

export interface DatosMonitor {
  generadoTs: string;
  modoArca: "stub" | "homologacion" | "real";
  invoicingEnabled: boolean;
  resumen: ResumenFacturacion;
  cola: ComprobanteEnCola[];
  rechazadas: FacturaRechazada[];
  fiscalPorTenant: FiscalTenant[];
  superficies: ComponenteSalud[];
  tenantsSalud: TenantSalud[];
  resumenTenants: ResumenSalud;
  crons: EstadoCron[];
  alertas: AlertaMonitor[];
  /** true si alguna fuente clave no respondió (para avisar "vista parcial"). */
  degradado: boolean;
}

// ── Lecturas resilientes ────────────────────────────────────────────────────

interface TenantMetaFiscal {
  id: string;
  name: string;
  slug: string;
  status: "ACTIVE" | "TRIAL" | "SUSPENDED";
  subdomain: string | null;
  arcaCuit: string | null;
}

async function leerTenants(): Promise<{ filas: TenantMetaFiscal[]; ok: boolean }> {
  try {
    const filas = await operatorPrisma.tenant.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, slug: true, status: true, subdomain: true, arcaCuit: true },
    });
    return { filas: filas as TenantMetaFiscal[], ok: true };
  } catch (e) {
    logger.warn("monitor", "leerTenants falló", { err: e instanceof Error ? e.message : String(e) });
    return { filas: [], ok: false };
  }
}

interface CredFiscal {
  tenantId: string;
  certCuit: string;
  certNotAfter: Date | null;
}

/** Credenciales fiscales (metadata NO sensible). Tolera que la tabla no exista (Gate 2). */
async function leerCredenciales(): Promise<Map<string, CredFiscal>> {
  const map = new Map<string, CredFiscal>();
  try {
    const filas = await operatorPrisma.tenantFiscalCredential.findMany({
      // SOLO metadata no sensible — NUNCA sealed/wrappedDek/kekId.
      select: { tenantId: true, certCuit: true, certNotAfter: true },
    });
    for (const f of filas) map.set(f.tenantId, f as CredFiscal);
  } catch (e) {
    logger.warn("monitor", "leerCredenciales falló", { err: e instanceof Error ? e.message : String(e) });
  }
  return map;
}

interface OutboxFila {
  id: string;
  tenantId: string;
  payload: unknown;
  attempts: number;
  lastError: string | null;
  createdAt: Date;
}

/** Tope de la cola que se lista y que "Reintentar todos" procesa (alineados a propósito). */
export const COLA_LIMIT = 100;

/** Cola del outbox: eventos de factura NO procesados (pendientes/fallidos). */
async function leerCola(): Promise<{ filas: OutboxFila[]; ok: boolean }> {
  try {
    const filas = await operatorPrisma.outboxEvent.findMany({
      where: { type: OUTBOX_INVOICE_CREATED, processedAt: null },
      orderBy: { createdAt: "asc" },
      take: COLA_LIMIT,
      select: { id: true, tenantId: true, payload: true, attempts: true, lastError: true, createdAt: true },
    });
    return { filas: filas as OutboxFila[], ok: true };
  } catch (e) {
    logger.warn("monitor", "leerCola falló", { err: e instanceof Error ? e.message : String(e) });
    return { filas: [], ok: false };
  }
}

/** Momento del último evento del outbox procesado (proxy de "el worker corrió"). */
async function leerUltimoOutboxProcesado(): Promise<Date | null> {
  try {
    const f = await operatorPrisma.outboxEvent.findFirst({
      where: { processedAt: { not: null } },
      orderBy: { processedAt: "desc" },
      select: { processedAt: true },
    });
    return f?.processedAt ?? null;
  } catch {
    return null;
  }
}

interface InvoiceFila {
  id: string;
  tenantId: string;
  status: "PENDING" | "AUTHORIZED" | "REJECTED";
  total: unknown; // Decimal | number según migración
  fecha: string;
  rechazoMotivo: string | null;
  createdAt: Date;
  authorizedAt: Date | null;
}

/** Facturas recientes (para últ. emisión, últ. error y rechazos por tenant). */
async function leerFacturasRecientes(): Promise<{ filas: InvoiceFila[]; ok: boolean }> {
  try {
    const filas = await operatorPrisma.invoice.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true, tenantId: true, status: true, total: true,
        fecha: true, rechazoMotivo: true, createdAt: true, authorizedAt: true,
      },
    });
    return { filas: filas as InvoiceFila[], ok: true };
  } catch (e) {
    logger.warn("monitor", "leerFacturasRecientes falló", { err: e instanceof Error ? e.message : String(e) });
    return { filas: [], ok: false };
  }
}

/** Conteo global de facturas por estado. */
async function leerConteos(): Promise<{ autorizadas: number; rechazadas: number }> {
  try {
    const grupos = await operatorPrisma.invoice.groupBy({ by: ["status"], _count: { _all: true } });
    let autorizadas = 0;
    let rechazadas = 0;
    for (const g of grupos) {
      if (g.status === "AUTHORIZED") autorizadas = g._count._all;
      if (g.status === "REJECTED") rechazadas = g._count._all;
    }
    return { autorizadas, rechazadas };
  } catch (e) {
    logger.warn("monitor", "leerConteos falló", { err: e instanceof Error ? e.message : String(e) });
    return { autorizadas: 0, rechazadas: 0 };
  }
}

// ── Helpers puros ──────────────────────────────────────────────────────────

function aNumero(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return v;
  // Prisma Decimal expone toNumber(); si no, intentamos Number().
  if (typeof v === "object" && v !== null && "toNumber" in v && typeof (v as { toNumber: unknown }).toNumber === "function") {
    try { return (v as { toNumber: () => number }).toNumber(); } catch { return null; }
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function invoiceIdDePayload(payload: unknown): string | null {
  if (payload && typeof payload === "object" && "invoiceId" in payload) {
    const v = (payload as { invoiceId: unknown }).invoiceId;
    return typeof v === "string" ? v : null;
  }
  return null;
}

function rlsEnforced(env = process.env): boolean {
  return env.RLS_ENFORCEMENT?.trim().toLowerCase() === "on";
}
function whatsappVivo(env = process.env): boolean {
  return !!(env.WA_PROVIDER ?? env.WHATSAPP_PROVIDER)?.trim();
}

// ── Ensamblado ─────────────────────────────────────────────────────────────

/** Arma el snapshot completo del monitor. Read-only, resiliente, sin secretos. */
export async function cargarMonitor(ahora: Date = new Date()): Promise<DatosMonitor> {
  const modoArca = modoDesdeEnv();
  // SECUENCIAL a propósito: `operatorPrisma` es UNA conexión compartida del control-plane
  // (cross-tenant, ADR-021). Es una pantalla de operador de baja frecuencia; serializar las
  // lecturas es más amable con el pool (no abre una ráfaga de conexiones a la vez) a cambio
  // de unos ms — que acá no importan. La resiliencia (cada lectura degrada sola) se mantiene.
  const { filas: tenants, ok: tenantsOk } = await leerTenants();
  const creds = await leerCredenciales();
  const cola = await leerCola();
  const facturas = await leerFacturasRecientes();
  const conteos = await leerConteos();
  const ultimoProcesado = await leerUltimoOutboxProcesado();

  const nombrePorId = new Map(tenants.map((t) => [t.id, t.name]));
  const nombre = (id: string) => nombrePorId.get(id) ?? id;

  // ── Cola del outbox (pendientes/fallidos) ──
  const colaSalida: ComprobanteEnCola[] = cola.filas.map((f) => ({
    eventId: f.id,
    invoiceId: invoiceIdDePayload(f.payload),
    tenantId: f.tenantId,
    tenantNombre: nombre(f.tenantId),
    intentos: f.attempts,
    esperandoDesde: f.createdAt.toISOString(),
    estado: f.attempts > 0 ? ("fallido" as const) : ("pendiente" as const),
    diagnostico: traducirErrorArca(f.lastError),
  }));
  const pendientes = colaSalida.filter((c) => c.estado === "pendiente").length;
  const fallidos = colaSalida.filter((c) => c.estado === "fallido").length;

  // ── Facturas rechazadas (recientes) ──
  const rechazadas: FacturaRechazada[] = facturas.filas
    .filter((f) => f.status === "REJECTED")
    .slice(0, 50)
    .map((f) => ({
      invoiceId: f.id,
      tenantId: f.tenantId,
      tenantNombre: nombre(f.tenantId),
      total: aNumero(f.total),
      fecha: f.fecha,
      cuando: f.createdAt.toISOString(),
      diagnostico: traducirErrorArca(f.rechazoMotivo),
    }));

  // ── Último emitido / último error por tenant (desde las facturas recientes) ──
  const ultimaEmisionPorTenant = new Map<string, string>();
  const ultimoErrorPorTenant = new Map<string, DiagnosticoError>();
  for (const f of facturas.filas) {
    if (f.status === "AUTHORIZED" && !ultimaEmisionPorTenant.has(f.tenantId)) {
      ultimaEmisionPorTenant.set(f.tenantId, (f.authorizedAt ?? f.createdAt).toISOString());
    }
    if (f.status === "REJECTED" && !ultimoErrorPorTenant.has(f.tenantId)) {
      const d = traducirErrorArca(f.rechazoMotivo);
      if (d) ultimoErrorPorTenant.set(f.tenantId, d);
    }
  }
  // Un fallo transitorio en cola cuenta como "último error" SOLO si el tenant no tiene ya
  // un rechazo (el rechazo de una factura pesa más que un fallo transitorio reintentable).
  const pendientesPorTenant = new Map<string, number>();
  for (const c of colaSalida) {
    pendientesPorTenant.set(c.tenantId, (pendientesPorTenant.get(c.tenantId) ?? 0) + 1);
    if (c.diagnostico && !ultimoErrorPorTenant.has(c.tenantId)) {
      ultimoErrorPorTenant.set(c.tenantId, c.diagnostico);
    }
  }

  // ── Estado fiscal por tenant ──
  const fiscalPorTenant: FiscalTenant[] = tenants.map((t) => {
    const cred = creds.get(t.id) ?? null;
    const cuitOk = !!t.arcaCuit;
    const certOk = !!cred;
    const certVence = cred?.certNotAfter ? cred.certNotAfter.toISOString().slice(0, 10) : null;
    const certVencido = !!(cred?.certNotAfter && cred.certNotAfter.getTime() < ahora.getTime());
    const cuitCertMismatch = !!(cred && cuitOk && cred.certCuit !== t.arcaCuit);
    return {
      id: t.id,
      nombre: t.name,
      slug: t.slug,
      modo: modoArca,
      cuit: t.arcaCuit,
      cuitOk,
      certOk,
      certCuit: cred?.certCuit ?? null,
      certVence,
      certVencido,
      cuitCertMismatch,
      ultimaEmision: ultimaEmisionPorTenant.get(t.id) ?? null,
      ultimoError: ultimoErrorPorTenant.get(t.id) ?? null,
      pendientes: pendientesPorTenant.get(t.id) ?? 0,
      listoParaFacturar: cuitOk && certOk && !cuitCertMismatch && !certVencido && modoArca !== "stub",
    };
  });

  // ── Salud de plataforma (superficies + tenants) — reusa el modelo del cockpit ──
  const superficies = saludComponentes({
    dbOk: tenantsOk,
    rlsEnforced: rlsEnforced(),
    modoArca,
    modoMp: modoCobrosDesdeEnv(),
    whatsappVivo: whatsappVivo(),
  });
  const tenantsSalud = tenants.map((t) =>
    estadoDeTenant({ id: t.id, name: t.name, slug: t.slug, status: t.status, subdomain: t.subdomain }),
  );

  // ── Crons (lo derivable sin una tabla de corridas) ──
  const crons: EstadoCron[] = [
    {
      id: "arca-outbox",
      nombre: "Outbox de ARCA (emisión de comprobantes)",
      agenda: "Todos los días 06:00",
      ultimaSenal: ultimoProcesado?.toISOString() ?? null,
      nota: ultimoProcesado
        ? "Señal derivada: último comprobante despachado."
        : "Sin comprobantes despachados todavía (o facturación apagada).",
    },
    {
      id: "reminders",
      nombre: "Recordatorios (turnos)",
      agenda: "Todos los días 12:00",
      ultimaSenal: null,
      nota: "No persiste corridas: el estado se mira en logs de Vercel. Mejora futura: tabla de corridas.",
    },
  ];

  // ── Alertas cross-tenant ("los que importan") ──
  const alertas: AlertaMonitor[] = [];
  for (const c of colaSalida) {
    if (c.diagnostico) {
      alertas.push({
        id: `cola:${c.eventId}`,
        severidad: c.diagnostico.severidad,
        titulo: `${c.tenantNombre}: ${c.diagnostico.titulo}`,
        detalle: c.diagnostico.queePaso,
        accion: c.diagnostico.accion,
        tenantId: c.tenantId,
      });
    }
  }
  for (const t of fiscalPorTenant) {
    if (t.cuitCertMismatch) {
      alertas.push({
        id: `mismatch:${t.id}`,
        severidad: "roja",
        titulo: `${t.nombre}: el CUIT no coincide con el certificado`,
        detalle: "La firma se rechaza por seguridad (ADR-066) mientras no coincidan.",
        accion: "Corregí el CUIT del tenant o recargá el certificado del CUIT correcto.",
        tenantId: t.id,
      });
    } else if (t.certVencido) {
      alertas.push({
        id: `certvenc:${t.id}`,
        severidad: "roja",
        titulo: `${t.nombre}: certificado vencido`,
        detalle: `El certificado venció el ${t.certVence}.`,
        accion: "El titular genera un cert nuevo en ARCA y lo cargás desde la consola.",
        tenantId: t.id,
      });
    }
  }
  // Ordena: rojas primero.
  alertas.sort((a, b) => (a.severidad === b.severidad ? 0 : a.severidad === "roja" ? -1 : 1));

  const degradado = !tenantsOk || !cola.ok || !facturas.ok;

  return {
    generadoTs: ahora.toISOString(),
    modoArca,
    invoicingEnabled: isInvoicingEnabled(),
    resumen: { pendientes, fallidos, autorizadas: conteos.autorizadas, rechazadas: conteos.rechazadas },
    cola: colaSalida,
    rechazadas,
    fiscalPorTenant,
    superficies,
    tenantsSalud,
    resumenTenants: resumenSalud(tenantsSalud),
    crons,
    alertas,
    degradado,
  };
}
