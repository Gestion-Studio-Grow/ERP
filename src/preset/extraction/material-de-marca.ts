// Material de Marca — formato de salida ESTÁNDAR de la fase de INGESTA/EXTRACCIÓN del
// generador de preset por IA (docs/metodologia/generador-preset-ia.md).
//
// Este módulo es el CONTRATO entre el agente de Extracción (produce el Material) y el
// agente de Adaptación/Calidad (lo consume para provisionar un tenant a medida). Es
// lógica pura, sin dependencias de servidor ni de la registry de blueprints, para que
// (a) corra en el test runner nativo y (b) no acople la ingesta al provisioning.
//
// Regla de oro del playbook (docs/preventa/playbook-lectura-redes-a-tenant.md),
// hecha MÁQUINA-CHEQUEABLE: todo dato lleva `provenance` — verificado (visto en fuente
// pública), provisional (estimación razonable marcada) o pedido-al-dueno (no accesible).
// Un tenant con datos inventados es peor que uno honesto con huecos marcados.

// ─────────────────────────────────────────────────────────────────────────────
// Tipos base
// ─────────────────────────────────────────────────────────────────────────────

export const PROVENANCES = ["verificado", "provisional", "pedido-al-dueno"] as const;
export type Provenance = (typeof PROVENANCES)[number];

/** Presets de acento del branding (src/lib/branding.ts ACCENT_PRESETS). Se replica la
 *  unión acá para no importar branding (que arrastra código de servidor). Si branding
 *  suma un preset, sumarlo también acá (lo cubre un test de coherencia futuro). */
export const ACCENT_PRESETS = [
  "petroleo",
  "oxblood",
  "rosa",
  "celeste",
  "verde",
  "ambar",
] as const;
export type AccentPresetName = (typeof ACCENT_PRESETS)[number];

/** Un dato extraído + su trazabilidad. `value === null` = no se pudo obtener todavía. */
export interface Field<T> {
  value: T | null;
  provenance: Provenance;
  /** URL / "captura del dueño 2026-07-05" / "reseñas indexadas". Obligatorio si verificado. */
  source?: string;
  /** Por qué se estimó / qué falta. Obligatorio si provisional. */
  note?: string;
}

export interface AssetRef {
  /** URL pública del asset (hotlink temporal) o ruta local `public/tenants/<slug>/…`. */
  url: string;
  /** true una vez bajado al repo del tenant (playbook réplica §6). */
  downloaded: boolean;
  kind: "logo" | "foto-producto" | "foto-proceso" | "avatar-review" | "otro";
}

export interface CatalogoItem {
  categoria: string;
  /** Productos/servicios concretos si se pudieron leer. */
  items: string[];
  /** Marcas/proveedores citados (pistas de nivel: "distribuidor oficial de X" = premium). */
  marcas?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// El Material de Marca (documento estándar)
// ─────────────────────────────────────────────────────────────────────────────

export const SCHEMA_VERSION = "1.0";

export interface MaterialDeMarca {
  schemaVersion: string;
  /** Nombre del prospecto (clave del caso en el registro). */
  prospecto: string;
  /** ISO date de la extracción. Lo pasa quien construye el material (no se autogenera). */
  capturedAt?: string;

  /** Texto libre del rubro — alimenta `resolveBlueprint(rubro)` aguas abajo. */
  rubro: Field<string>;

  identidad: {
    nombrePublico: Field<string>;
    tagline: Field<string>;
    /** Descripción del tono de voz (formal vs. descontracturado, cercano, etc.). */
    tono: Field<string>;
    /** Paleta en hex ("#0B5FB0"…). */
    colores: Field<string[]>;
    /** Sugerencia mapeada al branding del ERP. */
    accentPreset: Field<AccentPresetName>;
    theme: Field<"light" | "dark">;
    logo: Field<AssetRef>;
  };

  /** El CÓMO vende, no solo el qué (insight que más reorienta el tenant). */
  modeloNegocio: Field<string>;

  catalogo: Field<CatalogoItem[]>;
  ofertas: Field<string[]>;
  quienesSomos: Field<string>;

  servicios: {
    delivery: Field<string>;
    mediosPago: Field<string[]>;
    horarios: Field<string>;
    canalesVenta: Field<string[]>;
  };

  contacto: {
    whatsapp: Field<string>;
    telefono: Field<string>;
    email: Field<string>;
    direccion: Field<string>;
    ciudad: Field<string>;
    instagram: Field<string>;
    web: Field<string>;
  };

  /** Sistema incumbente que reemplazamos (playbook paso 6). */
  incumbente: Field<string>;

  /** Todas las fuentes consultadas (para auditoría y para el registro de casos). */
  fuentes: string[];
  /** Lo que hay que pedirle al dueño para cerrar el tenant a nivel producción. */
  pendientesDelDueno: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Constructores
// ─────────────────────────────────────────────────────────────────────────────

/** Helper para declarar un campo con su trazabilidad. */
export function field<T>(
  value: T | null,
  provenance: Provenance,
  extra?: { source?: string; note?: string },
): Field<T> {
  return { value, provenance, ...extra };
}

/** Campo "todavía no lo tengo" — pedido al dueño, sin valor. */
function pending<T>(note?: string): Field<T> {
  return { value: null, provenance: "pedido-al-dueno", note };
}

/** Un Material vacío pero estructuralmente completo: todo pedido-al-dueno. Punto de
 *  partida honesto para arrancar una extracción. */
export function emptyMaterial(prospecto: string, capturedAt?: string): MaterialDeMarca {
  return {
    schemaVersion: SCHEMA_VERSION,
    prospecto,
    capturedAt,
    rubro: pending(),
    identidad: {
      nombrePublico: pending(),
      tagline: pending(),
      tono: pending(),
      colores: pending(),
      accentPreset: pending(),
      theme: pending(),
      logo: pending(),
    },
    modeloNegocio: pending(),
    catalogo: pending(),
    ofertas: pending(),
    quienesSomos: pending(),
    servicios: {
      delivery: pending(),
      mediosPago: pending(),
      horarios: pending(),
      canalesVenta: pending(),
    },
    contacto: {
      whatsapp: pending(),
      telefono: pending(),
      email: pending(),
      direccion: pending(),
      ciudad: pending(),
      instagram: pending(),
      web: pending(),
    },
    incumbente: pending(),
    fuentes: [],
    pendientesDelDueno: [],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Recorrido de campos (para validación y scoring)
// ─────────────────────────────────────────────────────────────────────────────

interface FieldRef {
  path: string;
  field: Field<unknown>;
}

/** Enumera todos los `Field` del material con su ruta legible. */
export function listFields(m: MaterialDeMarca): FieldRef[] {
  return [
    { path: "rubro", field: m.rubro },
    { path: "identidad.nombrePublico", field: m.identidad.nombrePublico },
    { path: "identidad.tagline", field: m.identidad.tagline },
    { path: "identidad.tono", field: m.identidad.tono },
    { path: "identidad.colores", field: m.identidad.colores },
    { path: "identidad.accentPreset", field: m.identidad.accentPreset },
    { path: "identidad.theme", field: m.identidad.theme },
    { path: "identidad.logo", field: m.identidad.logo },
    { path: "modeloNegocio", field: m.modeloNegocio },
    { path: "catalogo", field: m.catalogo },
    { path: "ofertas", field: m.ofertas },
    { path: "quienesSomos", field: m.quienesSomos },
    { path: "servicios.delivery", field: m.servicios.delivery },
    { path: "servicios.mediosPago", field: m.servicios.mediosPago },
    { path: "servicios.horarios", field: m.servicios.horarios },
    { path: "servicios.canalesVenta", field: m.servicios.canalesVenta },
    { path: "contacto.whatsapp", field: m.contacto.whatsapp },
    { path: "contacto.telefono", field: m.contacto.telefono },
    { path: "contacto.email", field: m.contacto.email },
    { path: "contacto.direccion", field: m.contacto.direccion },
    { path: "contacto.ciudad", field: m.contacto.ciudad },
    { path: "contacto.instagram", field: m.contacto.instagram },
    { path: "contacto.web", field: m.contacto.web },
    { path: "incumbente", field: m.incumbente },
  ];
}

// Campos mínimos para una DEMO a medida creíble (vidriera con su marca + catálogo + copy).
const REQUIRED_FOR_DEMO = [
  "rubro",
  "identidad.nombrePublico",
  "identidad.tono",
  "modeloNegocio",
  "catalogo",
  "contacto.whatsapp",
];

// Campos que además pide el pase a PRODUCCIÓN (branding fiel + operación real).
const REQUIRED_FOR_PROD = [
  ...REQUIRED_FOR_DEMO,
  "identidad.tagline",
  "identidad.colores",
  "identidad.logo",
  "servicios.mediosPago",
  "servicios.horarios",
  "contacto.direccion",
  "contacto.ciudad",
];

// ─────────────────────────────────────────────────────────────────────────────
// Validación (integridad estructural + regla de oro)
// ─────────────────────────────────────────────────────────────────────────────

export interface ValidationIssue {
  path: string;
  severity: "error" | "warning";
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

/** Valida integridad estructural y la regla de oro de trazabilidad. NO exige completitud
 *  (eso es `completenessScore`): un material honesto con huecos marcados es válido. */
export function validateMaterial(m: MaterialDeMarca): ValidationResult {
  const issues: ValidationIssue[] = [];
  const err = (path: string, message: string) =>
    issues.push({ path, severity: "error", message });
  const warn = (path: string, message: string) =>
    issues.push({ path, severity: "warning", message });

  if (m.schemaVersion !== SCHEMA_VERSION) {
    warn("schemaVersion", `Esperado ${SCHEMA_VERSION}, recibido ${m.schemaVersion}.`);
  }
  if (!m.prospecto || !m.prospecto.trim()) {
    err("prospecto", "El nombre del prospecto es obligatorio.");
  }

  for (const { path, field } of listFields(m)) {
    if (!PROVENANCES.includes(field.provenance)) {
      err(path, `provenance inválido: "${field.provenance}".`);
      continue;
    }
    const hasValue =
      field.value !== null &&
      field.value !== undefined &&
      !(Array.isArray(field.value) && field.value.length === 0) &&
      !(typeof field.value === "string" && field.value.trim() === "");

    // Regla de oro, chequeable:
    // 1) un valor "verificado" DEBE citar fuente (si no, no es verificable).
    if (field.provenance === "verificado") {
      if (!hasValue) err(path, "verificado sin valor: no se puede verificar la nada.");
      if (!field.source || !field.source.trim())
        err(path, "verificado sin `source`: falta la fuente que lo respalda.");
    }
    // 2) un valor "provisional" DEBE explicar por qué se estimó.
    if (field.provenance === "provisional") {
      if (!hasValue) err(path, "provisional sin valor: usá pedido-al-dueno si no hay dato.");
      if (!field.note || !field.note.trim())
        warn(path, "provisional sin `note`: conviene marcar por qué es una estimación.");
    }
    // 3) si NO hay valor, la única provenance honesta es pedido-al-dueno.
    if (!hasValue && field.provenance !== "pedido-al-dueno") {
      err(path, `sin valor pero provenance="${field.provenance}"; debería ser pedido-al-dueno.`);
    }
  }

  return { ok: issues.every((i) => i.severity !== "error"), issues };
}

// ─────────────────────────────────────────────────────────────────────────────
// Completitud (el "gate" que Adaptación/Calidad puede consultar)
// ─────────────────────────────────────────────────────────────────────────────

export interface CompletenessReport {
  /** 0..1 sobre los campos requeridos para una demo. */
  demo: number;
  /** 0..1 sobre los campos requeridos para producción. */
  prod: number;
  /** Requeridos para demo que aún no tienen valor. */
  missingForDemo: string[];
  /** Requeridos para prod que aún no tienen valor. */
  missingForProd: string[];
  /** Cuántos campos totales quedaron "pedido-al-dueno". */
  pendientes: number;
}

function fieldHasValue(f: Field<unknown>): boolean {
  if (f.value === null || f.value === undefined) return false;
  if (Array.isArray(f.value)) return f.value.length > 0;
  if (typeof f.value === "string") return f.value.trim() !== "";
  return true;
}

export function completenessScore(m: MaterialDeMarca): CompletenessReport {
  const byPath = new Map(listFields(m).map((f) => [f.path, f.field]));
  const present = (path: string) => {
    const f = byPath.get(path);
    return f ? fieldHasValue(f) : false;
  };

  const missingForDemo = REQUIRED_FOR_DEMO.filter((p) => !present(p));
  const missingForProd = REQUIRED_FOR_PROD.filter((p) => !present(p));
  const pendientes = listFields(m).filter((f) => !fieldHasValue(f.field)).length;

  return {
    demo: 1 - missingForDemo.length / REQUIRED_FOR_DEMO.length,
    prod: 1 - missingForProd.length / REQUIRED_FOR_PROD.length,
    missingForDemo,
    missingForProd,
    pendientes,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Hand-off a Adaptación/Calidad (provisioning)
// ─────────────────────────────────────────────────────────────────────────────

export interface ProvisionHandoff {
  prospecto: string;
  /** Texto libre → el provisioning lo pasa a `resolveBlueprint(rubro)`. */
  rubro: string | null;
  /** Flags de branding del alta (ONBOARDING §4). Sólo se incluyen los que TIENEN valor. */
  flags: {
    nombre?: string;
    whatsapp?: string;
    city?: string;
    contactNote?: string;
    accentPreset?: AccentPresetName;
    theme?: "light" | "dark";
  };
  /** Datos usados que NO están verificados (el provisioning los marca como a-confirmar). */
  provisionales: string[];
  /** Lo que falta antes de poder ir a producción. */
  bloqueantesProd: string[];
}

/** Traduce el Material al insumo que consume el provisioning. Sólo emite valores presentes;
 *  nunca inventa. Los provisionales viajan marcados para que Adaptación no los trate como
 *  verificados. */
export function toProvisionHandoff(m: MaterialDeMarca): ProvisionHandoff {
  const provisionales: string[] = [];
  // Devuelve el valor sólo si existe; registra si era provisional.
  const use = <T>(path: string, f: Field<T>): T | undefined => {
    if (!fieldHasValue(f)) return undefined;
    if (f.provenance === "provisional") provisionales.push(path);
    return f.value as T;
  };

  const flags: ProvisionHandoff["flags"] = {};
  const nombre = use("identidad.nombrePublico", m.identidad.nombrePublico);
  if (nombre) flags.nombre = nombre;
  const whatsapp = use("contacto.whatsapp", m.contacto.whatsapp);
  if (whatsapp) flags.whatsapp = whatsapp;
  const city = use("contacto.ciudad", m.contacto.ciudad);
  if (city) flags.city = city;
  const tagline = use("identidad.tagline", m.identidad.tagline);
  if (tagline) flags.contactNote = tagline;
  const accent = use("identidad.accentPreset", m.identidad.accentPreset);
  if (accent) flags.accentPreset = accent;
  const theme = use("identidad.theme", m.identidad.theme);
  if (theme) flags.theme = theme;

  const { missingForProd } = completenessScore(m);

  return {
    prospecto: m.prospecto,
    rubro: fieldHasValue(m.rubro) ? (m.rubro.value as string) : null,
    flags,
    provisionales,
    bloqueantesProd: [...missingForProd, ...m.pendientesDelDueno],
  };
}
