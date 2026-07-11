// Fábrica de tenants — CONTRATO DE TIPOS (ADR-074).
//
// Superset del `ProvisionParams` de ADR-019 (`scripts/provision-tenant.ts`): agrega el eje
// `edicion` Comercio/Empresa (RFC-003 P1), la hoja de marca, el `mode` dry-run/commit de
// primera clase y la `idempotencyKey` de la orquestación. Este archivo es PURO: cero imports
// de Prisma o de la app, para que el motor sea trivialmente testeable sin DB.

/** Edición del negocio (eje GROW-AR). Mapea a `Tenant.profile` (`lite`/`enterprise`). */
export type ProvisionEdition = "comercio" | "empresa";

/** Modo de ejecución de la fábrica. */
export type ProvisionMode = "dry-run" | "commit";

/** Datos del negocio que aterrizan en BusinessSettings (módulo Localización, ADR-019). */
export interface EmpresaData {
  timezone?: string;
  city?: string;
  addressLine?: string;
  whatsapp?: string;
  email?: string;
  instagram?: string;
  mapsUrl?: string;
  hoursLabel?: string;
  shortLabel?: string;
  contactNote?: string;
}

/** Hoja de marca: acento, tema, monograma y host propuesto (RFC-003 §3.1 paso 4). */
export interface BrandSheet {
  accentPreset?: string;
  frontTheme?: "light" | "dark";
  monogram?: string;
  /** Subdominio/host propuesto (routing propio del tenant, ADR-029). */
  subdomain?: string;
}

/** Usuario admin inicial — la membresía raíz (User rol OWNER en ADR-017/019). */
export interface AdminUser {
  name?: string;
  email: string;
  /** Si no se pasa, el core de ADR-019 genera una password de bootstrap fuerte y la muestra una vez. */
  password?: string;
}

/** Entrada única de la fábrica de tenants (ADR-074). */
export interface ProvisionTenantInput {
  slug: string;
  name: string;
  /** Texto libre del descubrimiento; se resuelve a un blueprint (ADR-002). */
  rubro?: string;
  /** Clave de blueprint explícita; si viene, gana sobre `rubro`. */
  blueprint?: string;
  edicion: ProvisionEdition;
  empresa?: EmpresaData;
  brandSheet?: BrandSheet;
  admin: AdminUser;
  mode: ProvisionMode;
  /** Clave de idempotencia de la ORQUESTACIÓN (cubre toda la saga; distinta del slug). */
  idempotencyKey: string;
}

// --- Salida del dry-run: el PLAN --------------------------------------------------

/** Un objeto que el alta crearía (para el preview del wizard, RFC-003 §3.1). */
export interface PlannedObject {
  kind: "tenant" | "owner" | "settings" | "catalog";
  label: string;
  detail?: string;
}

/** Cómo se resolvió el blueprint (para logs y preview). */
export interface BlueprintResolution {
  id: string;
  label: string;
  /** Cómo se decidió: explícito / rubro→vertical / comodín genérico / default. */
  note: string;
  /** true si el rubro matcheó un vertical propio; false si cayó al comodín. */
  matched: boolean;
}

export type PlanIssueKind =
  | "slug-invalid"
  | "slug-taken"
  | "host-invalid"
  | "host-taken"
  | "email-invalid";

/** Colisión/validación que BLOQUEA el commit. */
export interface PlanCollision {
  kind: PlanIssueKind;
  message: string;
}

/** Advertencia de brand sheet: no bloquea, pero se muestra. */
export interface PlanWarning {
  code: string;
  message: string;
}

/** Resultado del motor de dry-run (`planProvision`). No escribe nada. */
export interface ProvisionPlan {
  slug: string;
  name: string;
  edicion: ProvisionEdition;
  blueprint: BlueprintResolution;
  /** Módulos derivados de la edición (base del rubro + Empresa si corresponde). */
  modules: string[];
  objects: PlannedObject[];
  collisions: PlanCollision[];
  warnings: PlanWarning[];
  /** true si no hay colisiones → el commit puede proceder. */
  ok: boolean;
}

// --- Salida del commit: el RESULTADO ----------------------------------------------

/** Resultado del commit de DB (lo que devuelve el core de ADR-019, resumido). */
export interface CommitResult {
  tenantId: string;
  slug: string;
  tenantCreated: boolean;
  ownerCreated: boolean;
  settingsCreated: boolean;
  blueprintId: string;
  catalogSeeded: boolean;
  /** Password de bootstrap SOLO si el core creó el OWNER sin recibir una. Mostrar una vez. */
  generatedPassword?: string;
}

/** Resultado terminal de la fábrica. */
export interface ProvisionOutcome {
  idempotencyKey: string;
  state: import("./state-machine").ProvisionState;
  plan: ProvisionPlan;
  /** Presente si se llegó al menos a DB_COMMITTED. */
  commit?: CommitResult;
  /** Efecto externo: host ligado (stub en esta iteración). */
  host?: { bound: boolean; subdomain?: string };
  /** Efecto externo: invitación enviada (stub en esta iteración). */
  invited?: { sent: boolean; email: string };
  /** Si el estado terminal es FAILED_COMPENSATED: qué se compensó y por qué. */
  failure?: { atState: import("./state-machine").ProvisionState; reason: string; compensated: string[] };
}
