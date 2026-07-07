// ============================================================================
// COCKPIT — derivación de SALUD (read-only, control-plane). Spec T4 §1 (W1/W2/W3).
// ============================================================================
//
// PURO: recibe metadata del control-plane (nunca filas de negocio) y deriva estados
// de salud. No consulta DB ni red — el aggregator (datos.ts) le pasa la foto. Así es
// testeable sin Neon y respeta el aislamiento (ADR-018/021): solo meta+salud.

/** Semáforo de salud, en criollo (ADR-044). */
export type EstadoSalud = "sano" | "atencion" | "caido";

/** Etiqueta y tono criollos de un estado (para la UI). */
export const SALUD_LABEL: Record<EstadoSalud, string> = {
  sano: "Anda",
  atencion: "Necesita tu ojo",
  caido: "Caído",
};

/** Orden de severidad (peor primero) — para ordenar y para el peor-caso agregado. */
const SEVERIDAD: Record<EstadoSalud, number> = { caido: 2, atencion: 1, sano: 0 };

/** El peor estado de una lista (para el color agregado de un grupo/componente). */
export function peorEstado(estados: EstadoSalud[]): EstadoSalud {
  return estados.reduce<EstadoSalud>(
    (peor, e) => (SEVERIDAD[e] > SEVERIDAD[peor] ? e : peor),
    "sano",
  );
}

// ── W1 · Mapa de tenants ─────────────────────────────────────────────────────

/** Metadata de plataforma de un tenant (control-plane, SIN datos de negocio). */
export interface TenantMeta {
  id: string;
  name: string;
  slug: string;
  status: "ACTIVE" | "TRIAL" | "SUSPENDED";
  subdomain: string | null;
}

/** Un tenant con su estado de salud derivado (lo que muestra el mapa W1). */
export interface TenantSalud extends TenantMeta {
  estado: EstadoSalud;
  motivo: string;
}

/**
 * Deriva el estado de salud de un tenant desde su metadata de plataforma.
 * NOTA: es la señal disponible en el control-plane (estado + si tiene URL publicada).
 * El health-ping HTTP por tenant (spec W1) es un follow-up; se documenta y el modelo
 * ya está listo para reemplazar esta derivación por el ping real sin tocar la UI.
 */
export function estadoDeTenant(t: TenantMeta): TenantSalud {
  if (t.status === "SUSPENDED") {
    return { ...t, estado: "caido", motivo: "Suspendido" };
  }
  if (t.status === "TRIAL") {
    return { ...t, estado: "atencion", motivo: "En pruebas — todavía no vendido" };
  }
  if (!t.subdomain) {
    return { ...t, estado: "atencion", motivo: "Activo sin URL publicada" };
  }
  return { ...t, estado: "sano", motivo: "Activo y publicado" };
}

/** Resumen del mapa: cuántos en cada estado + el peor (color del grupo). */
export interface ResumenSalud {
  total: number;
  sanos: number;
  atencion: number;
  caidos: number;
  peor: EstadoSalud;
}

export function resumenSalud(tenants: TenantSalud[]): ResumenSalud {
  const sanos = tenants.filter((t) => t.estado === "sano").length;
  const atencion = tenants.filter((t) => t.estado === "atencion").length;
  const caidos = tenants.filter((t) => t.estado === "caido").length;
  return {
    total: tenants.length,
    sanos,
    atencion,
    caidos,
    peor: peorEstado(tenants.map((t) => t.estado)),
  };
}

// ── W2 · Salud de componentes de la arquitectura ─────────────────────────────

/** Un componente de la arquitectura con su salud (app, DB, deploy, plugins…). */
export interface ComponenteSalud {
  id: string;
  label: string;
  estado: EstadoSalud;
  nota: string;
}

/** Señales de entrada para derivar la salud de los componentes. */
export interface SenalesComponentes {
  /** ¿La DB (Neon) respondió el último snapshot? */
  dbOk: boolean;
  /** ¿Está enforced RLS? (señal de aislamiento). */
  rlsEnforced: boolean;
  /** Modo de ARCA: "real" (vivo), "homologacion" (test oficial ARCA) o "stub" (sandbox). */
  modoArca: "real" | "homologacion" | "stub";
  /** Modo de Mercado Pago: "real", "test" (credenciales de prueba) o "stub". */
  modoMp: "real" | "test" | "stub";
  /** ¿WhatsApp conectado a un proveedor real? */
  whatsappVivo: boolean;
}

/** Deriva la salud de cada componente desde las señales (PURO). */
export function saludComponentes(s: SenalesComponentes): ComponenteSalud[] {
  const modoEstado = (modo: "real" | "homologacion" | "test" | "stub"): EstadoSalud =>
    modo === "real" ? "sano" : "atencion";
  return [
    { id: "app", label: "App (backoffice + vidriera)", estado: "sano", nota: "Renderizando" },
    {
      id: "db",
      label: "Base de datos (Neon)",
      estado: s.dbOk ? "sano" : "caido",
      nota: s.dbOk ? "Responde" : "Sin respuesta en el último snapshot",
    },
    {
      id: "rls",
      label: "Aislamiento (RLS)",
      estado: s.rlsEnforced ? "sano" : "atencion",
      nota: s.rlsEnforced ? "Enforced" : "No enforced — revisar antes de multi-tenant",
    },
    {
      id: "arca",
      label: "ARCA (facturación)",
      estado: modoEstado(s.modoArca),
      nota:
        s.modoArca === "real"
          ? "Modo real"
          : s.modoArca === "homologacion"
            ? "Homologación (test oficial ARCA)"
            : "Modo prueba (sandbox)",
    },
    {
      id: "mp",
      label: "Mercado Pago (cobros)",
      estado: modoEstado(s.modoMp),
      nota:
        s.modoMp === "real"
          ? "Modo real"
          : s.modoMp === "test"
            ? "Test (credenciales de prueba MP)"
            : "Modo prueba (sandbox)",
    },
    {
      id: "whatsapp",
      label: "WhatsApp",
      estado: s.whatsappVivo ? "sano" : "atencion",
      nota: s.whatsappVivo ? "Conectado" : "Sin proveedor conectado",
    },
  ];
}

// ── W3 · Estado de la DB (Neon) — snapshot read-only, Neon-free-consciente ────

/**
 * Snapshot de la DB. Cuando el monitoreo está en pausa (default, ahorro Neon), el
 * estado es "en_pausa" y los números son null — la UI muestra la estructura sin
 * pegarle a Neon. Cuando está activo, el aggregator llena estos campos desde las
 * vistas de sistema (pg_stat_activity/pg_locks), NUNCA tablas de negocio.
 */
export interface SnapshotNeon {
  estado: "sano" | "atencion" | "caido" | "en_pausa";
  conexiones: number | null;
  latenciaMs: number | null;
  locks: number | null;
  nota: string;
}

/** Snapshot "en pausa" — el default seguro (no toca Neon). */
export const NEON_EN_PAUSA: SnapshotNeon = {
  estado: "en_pausa",
  conexiones: null,
  latenciaMs: null,
  locks: null,
  nota: "Monitoreo de DB en pausa (ahorro de plan free). Se activa con COCKPIT_NEON=on.",
};

/**
 * Deriva el estado de salud de la DB desde las métricas crudas (PURO). Umbrales
 * conservadores y simples (ADR-006: sin sobre-ingeniería); se afinan con datos reales.
 */
export function estadoNeon(m: {
  conexiones: number;
  latenciaMs: number;
  locks: number;
}): SnapshotNeon {
  let estado: SnapshotNeon["estado"] = "sano";
  const razones: string[] = [];
  if (m.latenciaMs > 500 || m.locks > 5 || m.conexiones > 80) {
    estado = "atencion";
  }
  if (m.latenciaMs > 2000 || m.conexiones > 150) {
    estado = "caido";
  }
  if (m.latenciaMs > 500) razones.push(`latencia ${m.latenciaMs}ms`);
  if (m.locks > 5) razones.push(`${m.locks} locks`);
  if (m.conexiones > 80) razones.push(`${m.conexiones} conexiones`);
  return {
    estado,
    conexiones: m.conexiones,
    latenciaMs: m.latenciaMs,
    locks: m.locks,
    nota: razones.length ? razones.join(" · ") : "Todo en rango",
  };
}
