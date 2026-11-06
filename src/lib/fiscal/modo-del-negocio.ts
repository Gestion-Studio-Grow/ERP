// ============================================================================
// EL MODO DE ARCA DE UN NEGOCIO — núcleo PURO (sin env, sin Prisma, sin Node)
// ============================================================================
//
// `ARCA_MODO` es el TECHO de la plataforma; cada negocio decide por debajo, sin que uno le cambie
// el modo a otro. Tabla de decisión (`modoDelNegocio`):
//
//   techo stub                                              → stub (nadie habla con ARCA)
//   negocio en pruebas (arcaHomologacion=true), sin cert    → stub (CAE simulado, como en stub)
//   negocio en pruebas, con certificado                     → homologación
//   negocio marcado real, techo homologación                → ERROR (la plataforma está en pruebas)
//   negocio marcado real, techo real, y además: slug en ARCA_REAL_TENANTS (segunda llave) y
//     certificado de PRODUCCIÓN cargado                     → real
//   negocio marcado real, techo real, falta alguna llave    → ERROR que dice qué falta
//
// Falla CERRADA: un negocio marcado real nunca cae a homologación ni a simulado en silencio
// (emitiría comprobantes sin validez creyendo que valen, o al revés).

export type ModoArcaDelNegocio = "stub" | "homologacion" | "real";

/** De qué entorno de ARCA es el certificado, según quién lo firmó (`entornoDeCertPem`). */
export type EntornoDeCertificado = "produccion" | "homologacion" | "desconocido";

/**
 * El entorno del certificado según su emisor. ARCA firma los de homologación con la autoridad
 * «Computadores Test» y los de producción con «Computadores», ambas de la organización AFIP.
 * PROVISIONAL A CONFIRMAR contra un certificado productivo real: si ARCA firma con otro nombre,
 * esto contesta "desconocido" y el pase se niega diciendo el emisor (falla cerrada), nunca al revés.
 */
export function entornoDelEmisor(emisor: { cn: string | null; o: string | null }): EntornoDeCertificado {
  const cn = (emisor.cn ?? "").trim().toLowerCase();
  const o = (emisor.o ?? "").trim().toLowerCase();
  if (o !== "afip" && o !== "arca") return "desconocido";
  if (/\btest\b|homolog/.test(cn)) return "homologacion";
  if (cn === "computadores") return "produccion";
  return "desconocido";
}

export interface DatosDelModo {
  /** `ARCA_MODO` de la plataforma (`modoDesdeEnv`). */
  techo: ModoArcaDelNegocio;
  /** `Tenant.arcaHomologacion`: true = pruebas, false = marcado real. */
  arcaHomologacion: boolean;
  slug: string | null | undefined;
  /** Los slugs de `ARCA_REAL_TENANTS` (`habilitadosRealDesdeEnv`). */
  habilitadosReal: readonly string[];
  /** El certificado con el que firmaría (propio o del estudio por delegación), o null si no hay. */
  credencial: null | { entorno: EntornoDeCertificado };
}

export type ResultadoDelModo = { modo: ModoArcaDelNegocio } | { error: string };

/** La variable de la segunda llave: slugs separados por coma, sin distinguir mayúsculas. */
export const VARIABLE_HABILITADOS_REAL = "ARCA_REAL_TENANTS";

function normalizarSlug(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

/** Lee `ARCA_REAL_TENANTS` («almacen-pepe, kiosco-ana») como lista de slugs. Vacía si no está. */
export function habilitadosRealDesdeEnv(env: Record<string, string | undefined>): string[] {
  return (env[VARIABLE_HABILITADOS_REAL] ?? "")
    .split(",")
    .map(normalizarSlug)
    .filter((s) => s !== "");
}

/** ¿El slug está en la lista de negocios habilitados a facturar en real? */
export function slugHabilitadoReal(slug: string | null | undefined, habilitados: readonly string[]): boolean {
  const s = normalizarSlug(slug);
  return s !== "" && habilitados.map(normalizarSlug).includes(s);
}

/** El modo en que corre UN negocio, o por qué no puede correr (ver la tabla de la cabecera). */
export function modoDelNegocio(d: DatosDelModo): ResultadoDelModo {
  if (d.techo === "stub") return { modo: "stub" };

  if (d.arcaHomologacion) return { modo: d.credencial ? "homologacion" : "stub" };

  // Marcado real.
  if (d.techo === "homologacion") {
    return {
      error:
        "El negocio está marcado para facturar en real, pero la plataforma está en pruebas (ARCA_MODO=homologacion): " +
        "no se emite nada. Volvelo a pruebas desde su ficha, o que el dueño de GSG ponga la plataforma en real.",
    };
  }
  const faltan: string[] = [];
  if (!slugHabilitadoReal(d.slug, d.habilitadosReal)) {
    faltan.push(
      `que su nombre corto («${normalizarSlug(d.slug) || "sin nombre"}») esté en ${VARIABLE_HABILITADOS_REAL} (lo carga el dueño de GSG)`,
    );
  }
  if (!d.credencial) {
    faltan.push("el certificado de producción de ARCA cargado");
  } else if (d.credencial.entorno === "homologacion") {
    faltan.push("un certificado de producción (el cargado es de pruebas)");
  } else if (d.credencial.entorno !== "produccion") {
    faltan.push("un certificado que se pueda confirmar como de producción de ARCA");
  }
  if (faltan.length > 0) {
    return {
      error:
        `El negocio está marcado para facturar en real pero falta ${faltan.join(" y ")}. No se emite nada ` +
        "(ni en real ni en pruebas) hasta que esté todo, o volvelo a pruebas desde su ficha.",
    };
  }
  return { modo: "real" };
}
