// ============================================================================
// COCKPIT — agregador de datos (server-side, READ-ONLY). Spec T4.
// ============================================================================
//
// Reúne todo lo que muestra el cockpit desde fuentes de SOLO LECTURA:
//   - metadata de tenants (operatorPrisma — control-plane, SIN filas de negocio),
//   - snapshot de Neon (pg_stat_*, gated por flag; default "en pausa"),
//   - modos de ARCA/MP y señales de plataforma (env),
//   - plan/roadmap/alertas/flujo (datos del repo, plan.ts).
//
// RESILIENTE: un tablero de salud no puede caerse porque una fuente esté caída. Cada
// lectura va en try/catch y degrada con gracia (dbOk=false, tenants=[]). CERO
// escrituras. Respeta el aislamiento (ADR-018/021): solo meta + vistas de sistema.

import { operatorPrisma } from "@/lib/operator-db";
import { modoDesdeEnv } from "@/plugins/arca";
import { modoCobrosDesdeEnv } from "@/lib/mercadopago-cobros-dispatch";
import { cockpitNeonEnabled } from "./flag";
import {
  type TenantSalud,
  type ResumenSalud,
  type ComponenteSalud,
  type SnapshotNeon,
  estadoDeTenant,
  resumenSalud,
  saludComponentes,
  estadoNeon,
  NEON_EN_PAUSA,
} from "./salud";
import {
  PLAN_REINGENIERIA,
  HORIZONTES,
  ALERTAS_CRITICAS,
  FLUJO_TRABAJO,
  resumenPlan,
  resumenAlertas,
} from "./plan";

export interface DatosCockpit {
  tenants: TenantSalud[];
  resumenTenants: ResumenSalud;
  componentes: ComponenteSalud[];
  neon: SnapshotNeon;
  plan: typeof PLAN_REINGENIERIA;
  resumenPlan: ReturnType<typeof resumenPlan>;
  horizontes: typeof HORIZONTES;
  alertas: typeof ALERTAS_CRITICAS;
  resumenAlertas: ReturnType<typeof resumenAlertas>;
  flujo: typeof FLUJO_TRABAJO;
  /** Momento del snapshot (ISO), para el "última actualización" del cockpit. */
  ts: string;
}

/** Lee la metadata de tenants (control-plane). Devuelve [] + ok=false si falla. */
async function leerTenants(): Promise<{ tenants: TenantSalud[]; ok: boolean }> {
  try {
    const filas = await operatorPrisma.tenant.findMany({
      orderBy: { createdAt: "asc" },
      // SOLO metadata de plataforma — nada de datos de negocio (ADR-021).
      select: { id: true, name: true, slug: true, status: true, subdomain: true },
    });
    return { tenants: filas.map(estadoDeTenant), ok: true };
  } catch {
    return { tenants: [], ok: false };
  }
}

/**
 * Snapshot REAL de Neon (pg_stat_*), SOLO si el flag COCKPIT_NEON está prendido.
 * Consulta vistas de sistema (read-only), nunca tablas de negocio. Si falla o está
 * apagado, devuelve el estado "en pausa" (sin tocar Neon).
 */
async function leerNeon(): Promise<SnapshotNeon> {
  if (!cockpitNeonEnabled()) return NEON_EN_PAUSA;
  try {
    const t0 = performance.now();
    // Latencia: un SELECT 1 medido. Conexiones y locks: vistas de sistema.
    const [conexiones] = await operatorPrisma.$queryRawUnsafe<{ n: number }[]>(
      "select count(*)::int as n from pg_stat_activity",
    );
    const [locks] = await operatorPrisma.$queryRawUnsafe<{ n: number }[]>(
      "select count(*)::int as n from pg_locks where granted = false",
    );
    const latenciaMs = Math.round(performance.now() - t0);
    return estadoNeon({
      conexiones: conexiones?.n ?? 0,
      locks: locks?.n ?? 0,
      latenciaMs,
    });
  } catch {
    return { ...NEON_EN_PAUSA, estado: "caido", nota: "No se pudo leer el estado de la DB." };
  }
}

/** ¿RLS enforced? (señal de plataforma desde env; default false = conservador). */
function rlsEnforced(env: Record<string, string | undefined> = process.env): boolean {
  return env.RLS_ENFORCEMENT?.trim().toLowerCase() === "on";
}

/** ¿WhatsApp conectado a un proveedor real? (env; default false). */
function whatsappVivo(env: Record<string, string | undefined> = process.env): boolean {
  return !!(env.WA_PROVIDER ?? env.WHATSAPP_PROVIDER)?.trim();
}

/** Arma el snapshot completo del cockpit. Read-only, resiliente. */
export async function cargarCockpit(): Promise<DatosCockpit> {
  const [{ tenants, ok: dbOk }, neon] = await Promise.all([leerTenants(), leerNeon()]);

  const componentes = saludComponentes({
    dbOk: dbOk && neon.estado !== "caido",
    rlsEnforced: rlsEnforced(),
    modoArca: modoDesdeEnv(),
    modoMp: modoCobrosDesdeEnv(),
    whatsappVivo: whatsappVivo(),
  });

  return {
    tenants,
    resumenTenants: resumenSalud(tenants),
    componentes,
    neon,
    plan: PLAN_REINGENIERIA,
    resumenPlan: resumenPlan(),
    horizontes: HORIZONTES,
    alertas: ALERTAS_CRITICAS,
    resumenAlertas: resumenAlertas(),
    flujo: FLUJO_TRABAJO,
    ts: new Date().toISOString(),
  };
}
