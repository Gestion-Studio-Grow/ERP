/**
 * Configuración fiscal del Core (semilla del Tax Engine, ADR-006 / ADR-024).
 *
 * El Core es dueño del cálculo de impuestos y del perfil fiscal del emisor; los
 * plugins (ARCA, MP) solo integran. El perfil sale del `Tenant` (ADR-022 §5,
 * opción B: metadata fiscal NO sensible en la DB; el certificado y la clave del
 * emisor viven en env/secret store).
 *
 * REGLA DURA (fix del rojo fiscal, 2026-08-15): acá NO hay placeholder. Un CUIT o
 * un punto de venta inventados producen un comprobante ante ARCA que NO se borra
 * — se anula con nota de crédito, con consecuencia fiscal para el cliente. Por
 * eso, si el tenant no tiene su perfil cargado, esto LANZA. No emitir es
 * reversible; emitir mal, no.
 */

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
// Validador ÚNICO de CUIT del repo (dígito verificador + prefijo de tipo). Vive
// en el Core; el plugin BANCOS lo reexporta. No se duplica acá.
import { cuitValido, normalizarCuit } from "@/lib/cuit";

/**
 * Feature flag maestro de facturación (ADR-024 §2.b). OFF por default: la
 * migración de Invoice/OutboxEvent NO está aplicada, así que sin esto llamar a
 * `createInvoice` rompería `completeAppointment` en prod. Se prende (env
 * `ARCA_INVOICING_ENABLED=true`) recién con la migración aplicada.
 */
export function isInvoicingEnabled(): boolean {
  return process.env.ARCA_INVOICING_ENABLED === "true";
}

/** Condición del emisor frente al IVA (mismos valores que el catálogo del plugin). */
export type CondicionIva =
  | "RESPONSABLE_INSCRIPTO"
  | "MONOTRIBUTO"
  | "EXENTO"
  | "CONSUMIDOR_FINAL";

const CONDICIONES_IVA: readonly CondicionIva[] = [
  "RESPONSABLE_INSCRIPTO",
  "MONOTRIBUTO",
  "EXENTO",
  "CONSUMIDOR_FINAL",
];

/**
 * Default de condición de IVA para un `Tenant` con `arcaCondicionIva` vacía (la columna
 * la agrega `20260925120000_lanzamiento_base`, sin backfill: todos los negocios, CH
 * incluido, arrancan en NULL). SOLO se aplica en homologación y queda marcado en el
 * perfil (`condicionIvaAsumida`): así CH emite igual que antes de la columna. En
 * producción NO hay default: lanza.
 */
export const CONDICION_IVA_DEFAULT: CondicionIva = "MONOTRIBUTO";

/** Perfil fiscal del emisor, resuelto desde el `Tenant`. */
export interface FiscalProfile {
  /** CUIT del emisor, 11 dígitos. Siempre real: si no está cargado, esto no se construye. */
  cuit: number;
  condicionIva: CondicionIva;
  puntoVenta: number;
  /**
   * `true` = homologación ARCA (testing, comprobantes sin valor fiscal).
   * `false` = PRODUCCIÓN (el comprobante existe ante ARCA y solo se anula con NC).
   * Reemplaza al viejo `provisional`, que marcaba "estos datos son placeholder":
   * ya no hay placeholder posible; lo que queda por distinguir es testing vs real.
   */
  homologacion: boolean;
  /**
   * `true` = la condición de IVA NO está cargada en el tenant y se asumió
   * `CONDICION_IVA_DEFAULT`. Solo puede ser `true` en homologación.
   */
  condicionIvaAsumida: boolean;
  /**
   * Clase A que ARCA le asignó al inscripto (RG 1575: "A", "A_CON_LEYENDA" o "M"), tal como está
   * cargada; `null` si no está cargada o si el negocio no es inscripto. La valida la decisión
   * única (`decidirComprobante`): sin dato, cada A pasa por revisión. Opcional sólo por los
   * perfiles armados a mano en tests de otros módulos.
   */
  regimenFacturaA?: string | null;
}

/** Campo del perfil que faltaba o vino inválido. */
export type CampoFiscalFaltante =
  | "tenant"
  | "arcaCuit"
  | "arcaPuntoVenta"
  | "condicionIva";

/**
 * El tenant no tiene perfil fiscal utilizable. Es un error de CONFIGURACIÓN, no
 * transitorio: reintentar no lo arregla, lo arregla cargar el dato. Los
 * llamadores de facturación ya son best-effort con `try/catch` + `logger.error`
 * (ver `completeAppointment` en actions.ts y `external-orders.ts`), así que esto
 * NO rompe la operación del negocio: rompe la EMISIÓN, que es lo que se busca.
 */
export class PerfilFiscalIncompletoError extends Error {
  readonly tenantId: string;
  readonly campo: CampoFiscalFaltante;

  constructor(tenantId: string, campo: CampoFiscalFaltante, detalle: string) {
    super(
      `Perfil fiscal incompleto del tenant ${tenantId} (${campo}): ${detalle}. ` +
        `No se emite: un comprobante con datos fiscales inventados no se borra, se anula con nota de crédito.`,
    );
    this.name = "PerfilFiscalIncompletoError";
    this.tenantId = tenantId;
    this.campo = campo;
  }
}

/** Metadata fiscal del `Tenant` tal como vive en la DB (ADR-022 §5). */
export interface RegistroFiscalTenant {
  arcaCuit: string | null;
  arcaPuntoVenta: number | null;
  arcaHomologacion: boolean;
  /**
   * `Tenant.arcaCondicionIva` (R1-F5: el lector de Prisma la selecciona). Opcional sólo para
   * los lectores inyectados de los tests: ausente o NULL es "sin cargar".
   */
  arcaCondicionIva?: string | null;
  /**
   * Clase A asignada al inscripto (RG 1575). TODAVÍA SIN COLUMNA en `Tenant`: el lector de Prisma
   * no la trae, así que desde la base siempre llega "sin cargar" y cada A pasa por revisión.
   */
  arcaRegimenFacturaA?: string | null;
}

/** Lee la metadata fiscal de un tenant. Seam inyectable (default: Prisma). */
export type LeerRegistroFiscal = (
  tenantId: string,
) => Promise<RegistroFiscalTenant | null>;

/** CUIT placeholder que vivía hardcodeado acá hasta el fix. Se rechaza por nombre. */
const CUIT_PLACEHOLDER = "20000000000";

/**
 * Arma el perfil fiscal a partir del registro del tenant. PURA y testeable sin
 * DB — toda la política de "qué es aceptable emitir" vive acá.
 *
 * Lanza `PerfilFiscalIncompletoError` si:
 *  - el tenant no existe;
 *  - no tiene `arcaCuit`, o el CUIT es inválido / es el viejo placeholder;
 *  - no tiene `arcaPuntoVenta` (o no es un entero positivo);
 *  - está en PRODUCCIÓN (`arcaHomologacion = false`) y no tiene condición de IVA
 *    cargada. En homologación se asume `CONDICION_IVA_DEFAULT` y se marca
 *    `condicionIvaAsumida`. El porqué del corte: asumir Monotributo emite Factura
 *    C sin IVA discriminado; si el emisor es Responsable Inscripto corresponde
 *    A/B con IVA — comprobante equivocado, no un detalle de forma. Ver la
 *    propuesta de columna en `docs/fiscal/PROPUESTA-condicion-iva-por-tenant.md`.
 */
export function construirPerfilFiscal(
  tenantId: string,
  registro: RegistroFiscalTenant | null,
): FiscalProfile {
  if (!registro) {
    throw new PerfilFiscalIncompletoError(tenantId, "tenant", "el tenant no existe");
  }

  // El CUIT se guarda como texto y puede venir con guiones o espacios (formato de
  // carga humana, ver `normalizarCuit`): se normaliza ANTES de validar.
  const cuitCrudo = (registro.arcaCuit ?? "").trim();
  const cuitTexto = normalizarCuit(cuitCrudo);
  if (cuitTexto === "") {
    throw new PerfilFiscalIncompletoError(
      tenantId,
      "arcaCuit",
      "el tenant no tiene CUIT cargado",
    );
  }
  if (cuitTexto === CUIT_PLACEHOLDER) {
    throw new PerfilFiscalIncompletoError(
      tenantId,
      "arcaCuit",
      `${CUIT_PLACEHOLDER} es el CUIT placeholder, no un alta fiscal real`,
    );
  }
  if (!cuitValido(cuitTexto)) {
    throw new PerfilFiscalIncompletoError(
      tenantId,
      "arcaCuit",
      `"${cuitCrudo}" no es un CUIT válido (11 dígitos, prefijo de tipo y dígito verificador)`,
    );
  }

  const puntoVenta = registro.arcaPuntoVenta;
  if (puntoVenta == null || !Number.isInteger(puntoVenta) || puntoVenta <= 0) {
    throw new PerfilFiscalIncompletoError(
      tenantId,
      "arcaPuntoVenta",
      puntoVenta == null
        ? "el tenant no tiene punto de venta cargado"
        : `"${puntoVenta}" no es un punto de venta válido (entero > 0)`,
    );
  }

  const homologacion = registro.arcaHomologacion;
  const condicionCruda = (registro.arcaCondicionIva ?? "").trim();

  if (condicionCruda !== "") {
    if (!(CONDICIONES_IVA as readonly string[]).includes(condicionCruda)) {
      throw new PerfilFiscalIncompletoError(
        tenantId,
        "condicionIva",
        `"${condicionCruda}" no es una condición de IVA conocida (${CONDICIONES_IVA.join(", ")})`,
      );
    }
    // Un consumidor final no emite facturas: la decisión de la letra (decidirComprobante,
    // EMISOR_NO_FACTURA) también lo frena, pero acá se dice antes y con el dato a corregir.
    if (condicionCruda === "CONSUMIDOR_FINAL") {
      throw new PerfilFiscalIncompletoError(
        tenantId,
        "condicionIva",
        "un consumidor final no emite facturas; la condición del negocio frente al IVA " +
          "tiene que ser Responsable Inscripto, Monotributo o Exento",
      );
    }
    return {
      cuit: Number(cuitTexto),
      condicionIva: condicionCruda as CondicionIva,
      puntoVenta,
      homologacion,
      condicionIvaAsumida: false,
      regimenFacturaA:
        condicionCruda === "RESPONSABLE_INSCRIPTO" ? (registro.arcaRegimenFacturaA ?? "").trim() || null : null,
    };
  }

  // Sin condición cargada: en PRODUCCIÓN no se asume nada.
  if (!homologacion) {
    throw new PerfilFiscalIncompletoError(
      tenantId,
      "condicionIva",
      "el tenant no tiene condición de IVA cargada y está en producción; " +
        "asumir Monotributo emitiría el tipo de comprobante equivocado",
    );
  }

  logger.warn("fiscal", "condición de IVA asumida (solo homologación)", {
    tenantId,
    condicionIva: CONDICION_IVA_DEFAULT,
  });

  return {
    cuit: Number(cuitTexto),
    condicionIva: CONDICION_IVA_DEFAULT,
    puntoVenta,
    homologacion,
    condicionIvaAsumida: true,
    regimenFacturaA: null,
  };
}

/**
 * Lector real: toma la metadata fiscal del `Tenant`. Mismo criterio que
 * `leerConfigFiscalPrisma` (src/lib/arca-dispatch.ts): `Tenant` está excluido de
 * RLS (ADR-018) y se resuelve por id explícito, nunca ambiental.
 *
 * Lee también `arcaCondicionIva` (R1-F5): con el dato cargado, la condición es la del
 * negocio y no la asumida; vacío, rige `construirPerfilFiscal` (homologación asume,
 * producción se niega).
 */
export const leerRegistroFiscalPrisma: LeerRegistroFiscal = async (tenantId) =>
  prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { arcaCuit: true, arcaPuntoVenta: true, arcaHomologacion: true, arcaCondicionIva: true },
  });

/**
 * Construye el resolvedor de perfil fiscal a partir de un lector. Testeable
 * offline (se le inyecta un lector fake), mismo patrón que `crearClientePara`.
 */
export function crearGetFiscalProfile(
  leer: LeerRegistroFiscal = leerRegistroFiscalPrisma,
): (tenantId: string) => Promise<FiscalProfile> {
  return async (tenantId) => construirPerfilFiscal(tenantId, await leer(tenantId));
}

/**
 * Perfil fiscal REAL del tenant. Lanza `PerfilFiscalIncompletoError` si el tenant
 * no lo tiene cargado — no hay fallback a placeholder.
 */
export const getFiscalProfile = crearGetFiscalProfile();

// El cálculo de neto + IVA + total vive en el módulo PURO de impuestos (sin Prisma: lo alcanza
// Ventas, que llega a un componente de cliente). `calcularImpuestos` se movió allá sin cambios y se
// sigue exportando desde acá; la factura de un inscripto usa `calcularImpuestosPorAlicuota`.
export { calcularImpuestos } from "@/lib/fiscal/impuestos-por-alicuota";
export type { Impuestos } from "@/lib/fiscal/impuestos-por-alicuota";
