/**
 * CUIT / CUIL para comprobantes (R0-F4): validación con MOTIVO y formato.
 *
 * El dígito verificador (módulo 11) y los prefijos NO se reimplementan acá: el
 * validador único del repo es `cuitValido` de `@/lib/cuit` (lo usan fiscal.ts,
 * bancos y el contador). Este módulo le agrega lo que necesita quien decide un
 * comprobante o muestra un error en pantalla: POR QUÉ no vale, en castellano
 * llano y diciendo cómo seguir, y si el número es de una persona o de una empresa.
 *
 * El mensaje nunca sugiere "el dígito correcto": si el error está en otro número,
 * "corregir" el último fabrica un CUIT válido de OTRA persona. Se pide copiarlo
 * de la constancia de ARCA.
 *
 * PURO, sin dependencias de framework.
 */

import { cuitValido, normalizarCuit } from "@/lib/cuit";

export { cuitValido, normalizarCuit };

/** Por qué un CUIT/CUIL no sirve. */
export type ErrorCuit =
  | "VACIO"
  | "CARACTERES"
  | "LARGO"
  | "DIGITO_VERIFICADOR"
  | "NO_EXISTE";

export type ResultadoCuit =
  | {
      ok: true;
      /** 11 dígitos, sin guiones. */
      cuit: string;
      /** `XX-XXXXXXXX-X`, como figura en la constancia. */
      formateado: string;
      /** 20/23/24/27… = persona humana; 30/33/34 = persona jurídica (empresa). */
      persona: "humana" | "juridica";
    }
  | { ok: false; error: ErrorCuit; motivo: string };

/**
 * Qué número se pide, para que el mensaje diga la palabra correcta. La CDI
 * (clave de identificación de quien no tiene CUIT ni CUIL) usa el mismo largo,
 * prefijos y dígito verificador (según fuentes secundarias; a confirmar en
 * homologación con DocTipo 87).
 */
export type NombreDocumento = "CUIT" | "CUIL" | "CDI" | "CUIT o CUIL";

// Se admiten dígitos y lo que usa la gente para separar: guión, punto, espacio, barra.
const RE_CARACTERES_ADMITIDOS = /^[\d\s.\-/]*$/;

/**
 * Valida un CUIT, CUIL o CDI (el algoritmo es el mismo) y explica el rechazo.
 * Acepta texto con guiones, puntos o espacios, o un número entero.
 */
export function validarCuit(
  valor: string | number | null | undefined,
  nombre: NombreDocumento = "CUIT",
): ResultadoCuit {
  const crudo = valor == null ? "" : String(valor).trim();

  if (crudo === "") {
    return {
      ok: false,
      error: "VACIO",
      motivo: `Falta el ${nombre}. Copialo de la constancia de inscripción de ARCA o de una factura anterior.`,
    };
  }
  if (!RE_CARACTERES_ADMITIDOS.test(crudo)) {
    return {
      ok: false,
      error: "CARACTERES",
      motivo: `El ${nombre} lleva sólo números (se puede escribir con guiones). Revisá que no se haya colado una letra.`,
    };
  }

  const cuit = normalizarCuit(crudo);
  if (cuit.length !== 11) {
    return {
      ok: false,
      error: "LARGO",
      motivo: `El ${nombre} tiene 11 números y este tiene ${cuit.length}. Copialo de nuevo de la constancia de ARCA.`,
    };
  }

  if (cuitValido(cuit)) {
    return {
      ok: true,
      cuit,
      formateado: formatearCuit(cuit)!,
      persona: cuit.startsWith("3") ? "juridica" : "humana",
    };
  }

  // ¿Es sólo el verificador? Si con OTRO último dígito el validador único lo
  // acepta, el prefijo y el cuerpo existen y lo que no cierra es el verificador.
  // Si ningún último dígito lo salva, el número no existe (prefijo desconocido o
  // una combinación a la que ARCA nunca le asigna CUIT).
  const cuerpo = cuit.slice(0, 10);
  let soloElVerificador = false;
  for (let d = 0; d <= 9; d++) {
    if (cuitValido(`${cuerpo}${d}`)) {
      soloElVerificador = true;
      break;
    }
  }

  return soloElVerificador
    ? {
        ok: false,
        error: "DIGITO_VERIFICADOR",
        motivo:
          `Ese ${nombre} no existe: el último número (el verificador) no coincide con los demás. ` +
          `Seguramente hay un número cambiado; copialo de la constancia de ARCA.`,
      }
    : {
        ok: false,
        error: "NO_EXISTE",
        motivo:
          `Ese número no corresponde a ningún ${nombre}. Revisá los dos primeros números y ` +
          `copialo de la constancia de ARCA.`,
      };
}

/** `20111111112` → `20-11111111-2`. `null` si no son 11 dígitos. No valida el verificador. */
export function formatearCuit(valor: string | number | null | undefined): string | null {
  if (valor == null) return null;
  const s = normalizarCuit(valor);
  if (s.length !== 11) return null;
  return `${s.slice(0, 2)}-${s.slice(2, 10)}-${s.slice(10)}`;
}
