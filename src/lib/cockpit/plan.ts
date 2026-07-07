// ============================================================================
// COCKPIT — PLAN/ROADMAP en vivo (W6), ALERTAS críticas (W5), FLUJO (W4).
// ============================================================================
//
// PURO y read-only: datos derivados del estado del repo/docs (plan-ventana, ADRs,
// ESTADO-ACTUAL) codificados como DATO TIPADO — la fuente humana es el doc, este
// módulo lo espeja para que el cockpit lo muestre "al día" (refresco por poll). No
// hay datos de negocio de ningún tenant.
//
// Mantenimiento: cuando una tarea de reingeniería avanza, se actualiza acá (una fila)
// — igual que "sumar idea = sumar fila" de los blueprints. El cockpit lo refleja solo.

// ── W6 · Plan de reingeniería (T1–T5) ────────────────────────────────────────

export type EstadoTarea = "hecho" | "en-curso" | "pendiente";

export interface TareaReingenieria {
  id: string; // "T1"…"T5"
  titulo: string;
  estado: EstadoTarea;
  /** Commit donde aterrizó (si hecho) — trazabilidad. */
  commit?: string;
  detalle: string;
}

/**
 * Estado del bloque de reingeniería (Balde B, plan-ventana 2026-07-08). Espejo del
 * doc; se actualiza al cerrar cada tarea. T4 en-curso porque es esta misma sesión.
 */
export const PLAN_REINGENIERIA: TareaReingenieria[] = [
  {
    id: "T1",
    titulo: "Fundación repo de módulos/plugins",
    estado: "hecho",
    commit: "0843c9f",
    detalle: "Contrato + registro + asignación por variante (ADR-054/055), detrás de flag.",
  },
  {
    id: "T2",
    titulo: "Módulo Servicios/Catálogo (variante)",
    estado: "hecho",
    commit: "ce00385",
    detalle: "ABM objeto + ABM asignación servicio↔profesional (fix-forward A-1/DX-6).",
  },
  {
    id: "T3",
    titulo: "Módulos núcleo ARCA + Mercado Pago",
    estado: "hecho",
    commit: "5d5d8f5",
    detalle: "Facturación ARCA + cobros/links MP, sandbox por defecto, sin secretos.",
  },
  {
    id: "T4",
    titulo: "Rediseño consola operador + Cockpit",
    estado: "en-curso",
    detalle: "Cockpit interactivo read-only (W1–W6), 3D CSS/SVG sin inflar el bundle.",
  },
  {
    id: "T5",
    titulo: "Por definir (siguiente tarea del dueño)",
    estado: "pendiente",
    detalle: "Se abre al cerrar T4.",
  },
];

/** Resumen del plan (para la barra de avance del widget). */
export function resumenPlan(tareas: TareaReingenieria[] = PLAN_REINGENIERIA): {
  total: number;
  hechas: number;
  enCurso: number;
  pendientes: number;
  pctHecho: number;
} {
  const hechas = tareas.filter((t) => t.estado === "hecho").length;
  const enCurso = tareas.filter((t) => t.estado === "en-curso").length;
  const pendientes = tareas.filter((t) => t.estado === "pendiente").length;
  return {
    total: tareas.length,
    hechas,
    enCurso,
    pendientes,
    pctHecho: tareas.length ? Math.round((hechas / tareas.length) * 100) : 0,
  };
}

// ── Horizontes del roadmap (tiers/hitos) ─────────────────────────────────────

export interface Horizonte {
  id: string;
  titulo: string;
  hito: string;
}

/** Horizontes por tier (roadmap-gsg §3/§6), espejo doc. */
export const HORIZONTES: Horizonte[] = [
  { id: "ahora", titulo: "Ahora — vender lo que hay", hito: "Demos live + preventa (CH·Magra·Shine·A Dos Manos)" },
  { id: "proximo", titulo: "Próximo — cobrar de verdad", hito: "ARCA/MP reales + rotar secretos + PITR (pre-cobros)" },
  { id: "despues", titulo: "Después — escalar el catálogo", hito: "Nutrir el repo de módulos por rubro (gate de venta)" },
];

// ── W5 · Alertas / información crítica ───────────────────────────────────────

export type Severidad = "roja" | "amarilla";

export interface AlertaCritica {
  id: string;
  severidad: Severidad;
  titulo: string;
  detalle: string;
  /** Qué acción del DUEÑO destraba (el cockpit señala, no ejecuta). */
  accionDueno: string;
}

/**
 * Ítems que requieren atención del dueño (gates pendientes, migraciones sin aplicar,
 * rojos de seguridad). Espejo de ESTADO-ACTUAL / plan-ventana §C. El cockpit SEÑALA;
 * ninguna de estas acciones la ejecuta el cockpit (read-only puro).
 */
export const ALERTAS_CRITICAS: AlertaCritica[] = [
  {
    id: "sec-secretos",
    severidad: "roja",
    titulo: "Rotar secretos + PITR (pre-cobros)",
    detalle: "Dos rojos bloqueantes antes de cobrar en real (NEON_API_KEY + password app_rls, PITR).",
    accionDueno: "Rotar credenciales y activar PITR en Neon.",
  },
  {
    id: "mig-fiscal",
    severidad: "amarilla",
    titulo: "Migraciones fiscales sin aplicar",
    detalle: "Invoice/config fiscal (ARCA) y las de inventario quedan escritas, sin aplicar a Neon (Gate 2).",
    accionDueno: "Aprobar `prisma migrate deploy` (Gate 2).",
  },
  {
    id: "cred-arca-mp",
    severidad: "amarilla",
    titulo: "Credenciales ARCA/MP para pasar a real",
    detalle: "Módulos T3 corren en sandbox; falta cargar cert/CUIT ARCA y access token MP.",
    accionDueno: "Cargar credenciales en el entorno (docs/arquitectura/propuesta-activacion-arca-mp.md).",
  },
  {
    id: "deploy-magra",
    severidad: "amarilla",
    titulo: "Deploy de sitio Magra pendiente",
    detalle: "Magra ya es tenant real aislado en prod; falta publicar su sitio (Gate 1).",
    accionDueno: "Autorizar el deploy (Gate 1: “deployá”).",
  },
];

export function resumenAlertas(alertas: AlertaCritica[] = ALERTAS_CRITICAS): {
  rojas: number;
  amarillas: number;
} {
  return {
    rojas: alertas.filter((a) => a.severidad === "roja").length,
    amarillas: alertas.filter((a) => a.severidad === "amarilla").length,
  };
}

// ── W4 · Flujo de trabajo (gobernanza) ───────────────────────────────────────

export interface PasoFlujo {
  id: string;
  actor: string;
  hace: string;
}

/** Flujo canónico de gobernanza (ADR-049 RACI): quién decide/ejecuta qué. */
export const FLUJO_TRABAJO: PasoFlujo[] = [
  { id: "pmo", actor: "PMO", hace: "Prioriza y baja la tarea (autor)" },
  { id: "dueno", actor: "Dueño", hace: "Decide lo irreversible (gates)" },
  { id: "arquitecto", actor: "Arquitecto", hace: "Ejecuta lo reversible" },
  { id: "gate", actor: "Gate GSG (Opus)", hace: "Audita antes de mergear" },
  { id: "dispatch", actor: "Dispatch", hace: "Corre las células por ola" },
];
