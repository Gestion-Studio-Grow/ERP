// ============================================================================
// Esquemas de `datos` de los eventos de dominio (P2 · catálogo v1) — mini-validador tipado
// ============================================================================
//
// Sin dependencias (no hay zod en el repo y no se suman sin preguntar). Cada esquema sabe
// VALIDAR un valor, INFERIR su tipo de TypeScript (así `emitirEvento` no compila con un `datos`
// que no cumple) y DESCRIBIRSE (para generar docs/integrations/eventos.md).
//
// Objetos ESTRICTOS: un campo que el catálogo no conoce es un error. Es la primera muralla de
// la regla de datos personales (§7.3): nadie «agrega el teléfono por las dudas» sin pasar por
// el catálogo, y el test de redacción revisa los nombres del catálogo.
//
// Dos tipos de texto con trato especial:
//   · `textoLibre`: lo escribe una persona (motivo de anulación, nombre de un renglón a mano,
//     motivo del rechazo de ARCA). Se REDACTA al emitir: emails y tiradas de 6+ dígitos
//     (teléfono, DNI, CUIT) quedan enmascarados (`redactarTextoLibre`).
//   · `enmascarado`: un dato personal YA enmascarado (`telefonoEnmascarado`). Sólo pasa si tiene
//     la forma de la máscara (`enmascararTelefono`): `******1234`.
// ============================================================================

import { redondearAlCentavo } from "@/lib/dinero/redondeo";

export type Ruta = string;

export interface Esquema<T> {
  readonly clase: string;
  /** Agrega a `errores` lo que no cumple. */
  validar(valor: unknown, ruta: Ruta, errores: string[]): void;
  /** Devuelve el valor con los textos libres redactados (se llama después de validar). */
  redactar(valor: T): T;
  /** Una línea legible para la documentación. */
  describir(): string;
  /** Marca de tipo (no existe en tiempo de ejecución). */
  readonly __tipo?: T;
}

export interface EsquemaOpcional<T> extends Esquema<T | undefined> {
  readonly opcional: true;
}

export type TipoDe<E> = E extends Esquema<infer T> ? T : never;

type ClavesOpcionales<S> = { [K in keyof S]: S[K] extends EsquemaOpcional<unknown> ? K : never }[keyof S];
type Aplanar<T> = { [K in keyof T]: T[K] } & {};
export type InferirObjeto<S extends Record<string, Esquema<unknown>>> = Aplanar<
  { [K in Exclude<keyof S, ClavesOpcionales<S>>]: TipoDe<S[K]> } & {
    [K in ClavesOpcionales<S>]?: Exclude<TipoDe<S[K]>, undefined>;
  }
>;

// ── Redacción de texto libre ──────────────────────────────────────────────────

const RE_EMAIL = /[^\s@<>()"',;:]{1,64}@[^\s@<>()"',;:]{1,255}\.[a-z]{2,24}/gi;
// Tiradas de 6 o más dígitos, con hasta 3 separadores entre dígito y dígito (espacio, guion,
// punto, barra, paréntesis) y un «+» adelante opcional: teléfonos («11 5566-7788», «11 - 5566 -
// 7788», «(011) 5566-7788», «+54 9 11…»), DNI («30.123.456», «30  123  456»), CUIT
// («20-30123456-7»). Las de 5 o menos (un código de pedido, un precio) quedan como están.
const RE_DIGITOS = /\+?\d(?:[\s.\-/()]{0,3}\d){5,}/g;

/** Enmascara un dato personal dejando los últimos 4 dígitos: «11 5566-7788» → «******7788». */
export function enmascararTelefono(valor: string | null | undefined): string | null {
  const digitos = String(valor ?? "").replace(/\D/g, "");
  if (digitos.length < 6) return digitos.length ? "******" : null;
  return `******${digitos.slice(-4)}`;
}

/** Lo que una persona escribió, sin emails ni números de teléfono/documento, recortado a 500. */
export function redactarTextoLibre(texto: string): string {
  return texto
    .slice(0, 500)
    .replace(RE_EMAIL, "[email]")
    .replace(RE_DIGITOS, (m) => enmascararTelefono(m) ?? "******");
}

const RE_MASCARA = /^\*{6}\d{0,4}$/;
const RE_FECHA = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/;
const RE_FECHA_AFIP = /^\d{8}$/;

function primitivo<T>(
  clase: string,
  ok: (v: unknown) => boolean,
  esperado: string,
  redactar: (v: T) => T = (v) => v,
): Esquema<T> {
  return {
    clase,
    validar(v, ruta, errores) {
      if (!ok(v)) errores.push(`${ruta}: se esperaba ${esperado} (llegó ${JSON.stringify(v) ?? "undefined"})`);
    },
    redactar,
    describir: () => clase,
  };
}

const esTexto = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 2000;
const esNumero = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export const e = {
  /** Identificador (cuid, id externo). Texto no vacío. */
  id: () => primitivo<string>("id", esTexto, "un id (texto no vacío)"),
  /** Texto corto de sistema (no lo escribe una persona: códigos, referencias). */
  texto: () => primitivo<string>("texto", esTexto, "un texto no vacío"),
  /**
   * Texto que escribe una persona (o que manda ARCA): se redacta y se recorta a 500 al emitir.
   * Cualquier largo pasa la validación: un motivo de rechazo de ARCA con 25 observaciones no
   * puede tumbar la transacción que registra el rechazo (se recorta, no se rechaza).
   */
  textoLibre: () => primitivo<string>("texto libre (se redacta)", (v) => typeof v === "string", "un texto", redactarTextoLibre),
  /** Pesos argentinos, número finito con hasta 2 decimales. */
  monto: () =>
    primitivo<number>(
      "monto (ARS)",
      (v) => esNumero(v) && Math.abs(redondearAlCentavo(v) - v) < 1e-9,
      "un monto en pesos con hasta 2 decimales",
    ),
  numero: () => primitivo<number>("número", esNumero, "un número finito"),
  entero: () => primitivo<number>("entero", (v) => Number.isInteger(v), "un entero"),
  bool: () => primitivo<boolean>("sí/no", (v) => typeof v === "boolean", "true o false"),
  /** Fecha ISO 8601 (AAAA-MM-DD o con hora y zona). */
  fecha: () => primitivo<string>("fecha ISO 8601", (v) => typeof v === "string" && RE_FECHA.test(v), "una fecha ISO 8601"),
  /** Fecha AFIP/ARCA AAAAMMDD. */
  fechaArca: () => primitivo<string>("fecha AAAAMMDD", (v) => typeof v === "string" && RE_FECHA_AFIP.test(v), "una fecha AAAAMMDD"),
  /** Dato personal enmascarado (`enmascararTelefono`). */
  enmascarado: () =>
    primitivo<string>("enmascarado (******1234)", (v) => typeof v === "string" && RE_MASCARA.test(v), "un dato enmascarado (******1234)"),

  uno<const V extends readonly string[]>(valores: V): Esquema<V[number]> {
    return primitivo<V[number]>(valores.join(" | "), (v) => typeof v === "string" && valores.includes(v), `uno de ${valores.join(", ")}`);
  },

  lista<T>(item: Esquema<T>): Esquema<T[]> & { readonly item: Esquema<T> } {
    return {
      clase: `lista de ${item.clase}`,
      item,
      validar(v, ruta, errores) {
        if (!Array.isArray(v)) {
          errores.push(`${ruta}: se esperaba una lista`);
          return;
        }
        if (v.length > 1000) errores.push(`${ruta}: más de 1000 elementos`);
        v.forEach((x, i) => item.validar(x, `${ruta}[${i}]`, errores));
      },
      redactar: (v) => v.map((x) => item.redactar(x)),
      describir: () => `[${item.describir()}]`,
    };
  },

  objeto<S extends Record<string, Esquema<unknown>>>(campos: S): Esquema<InferirObjeto<S>> & { readonly campos: S } {
    return {
      clase: "objeto",
      campos,
      validar(v, ruta, errores) {
        if (typeof v !== "object" || v === null || Array.isArray(v)) {
          errores.push(`${ruta}: se esperaba un objeto`);
          return;
        }
        const o = v as Record<string, unknown>;
        for (const k of Object.keys(o)) {
          if (!(k in campos)) errores.push(`${ruta}.${k}: campo que el catálogo no conoce`);
        }
        for (const [k, esq] of Object.entries(campos)) {
          const valor = o[k];
          if (valor === undefined && (esq as Partial<EsquemaOpcional<unknown>>).opcional) continue;
          esq.validar(valor, `${ruta}.${k}`, errores);
        }
      },
      redactar(v) {
        const o = v as Record<string, unknown>;
        const r: Record<string, unknown> = {};
        for (const [k, esq] of Object.entries(campos)) {
          if (o[k] === undefined) continue;
          r[k] = esq.redactar(o[k]);
        }
        return r as InferirObjeto<S>;
      },
      describir: () =>
        `{ ${Object.entries(campos)
          .map(([k, esq]) => `${k}${(esq as Partial<EsquemaOpcional<unknown>>).opcional ? "?" : ""}: ${esq.describir()}`)
          .join(", ")} }`,
    };
  },

  opcional<T>(base: Esquema<T>): EsquemaOpcional<T> & { readonly base: Esquema<T> } {
    return {
      clase: base.clase,
      opcional: true,
      base,
      validar(v, ruta, errores) {
        if (v !== undefined) base.validar(v, ruta, errores);
      },
      redactar: (v) => (v === undefined ? v : base.redactar(v)),
      describir: () => base.describir(),
    };
  },

  nulo<T>(base: Esquema<T>): Esquema<T | null> & { readonly base: Esquema<T> } {
    return {
      clase: `${base.clase} | null`,
      base,
      validar(v, ruta, errores) {
        if (v !== null) base.validar(v, ruta, errores);
      },
      redactar: (v) => (v === null ? v : base.redactar(v)),
      describir: () => `${base.describir()} | null`,
    };
  },
};

/** Valida y devuelve la lista de errores (vacía = cumple). */
export function erroresDe<T>(esquema: Esquema<T>, valor: unknown): string[] {
  const errores: string[] = [];
  esquema.validar(valor, "datos", errores);
  return errores;
}

/** Los nombres de campo de un esquema, recorriendo objetos y listas (para el test de redacción). */
export function nombresDeCampos(esquema: Esquema<unknown>, prefijo = ""): { ruta: string; esquema: Esquema<unknown> }[] {
  const salida: { ruta: string; esquema: Esquema<unknown> }[] = [];
  const envuelto = esquema as { campos?: Record<string, Esquema<unknown>>; item?: Esquema<unknown>; base?: Esquema<unknown> };
  if (envuelto.item) return nombresDeCampos(envuelto.item, `${prefijo}[]`);
  if (envuelto.base) return nombresDeCampos(envuelto.base, prefijo);
  const campos = envuelto.campos;
  if (campos) {
    for (const [k, sub] of Object.entries(campos)) {
      const ruta = prefijo ? `${prefijo}.${k}` : k;
      salida.push({ ruta, esquema: sub });
      salida.push(...nombresDeCampos(sub, ruta));
    }
  }
  return salida;
}
