// ============================================================================
// EQUIPO DE AGENTES · `ctx.db`: acceso de SÓLO LECTURA al negocio (03 §6.1, cierre 1).
// ============================================================================
// Fachada escrita a mano: sólo `findMany`, `findFirst`, `count`, `aggregate` y `groupBy`, sobre los
// modelos que el puesto declara, con `tenantId` FORZADO en el `where` (pisa el que venga), sin
// `include` y con `select` anidado sólo hacia relaciones declaradas. Cualquier otra cosa LANZA.
// Nunca da acceso a las tablas Agente*: esas sólo se tocan por las puertas del motor.
//
// Sobre qué cliente: el `prisma` de `@/lib/prisma` (con RLS, cada operación suelta abre su
// transacción corta y fija el negocio, src/lib/rls.ts:139-143). NUNCA `basePrisma`. Y NUNCA dentro
// de una transacción: ahí el cliente extendido consulta por otra conexión y sin el ajuste del
// negocio (rls.ts:118-119) → con RLS devolvería VACÍO sin avisar. Por eso cada método mira el
// contexto y lanza.

import "server-only";
import { prisma } from "@/lib/prisma";
import { getTenantStore, runInTenantContext } from "@/lib/tenant-context";
import type { LecturaDeModelo, LecturaDelNegocio, ModeloDeLectura } from "./tipos";

const OPERACIONES = ["findMany", "findFirst", "count", "aggregate", "groupBy"] as const;
type Operacion = (typeof OPERACIONES)[number];

const CLAVES_PERMITIDAS: Readonly<Record<Operacion, ReadonlySet<string>>> = {
  findMany: new Set(["where", "select", "orderBy", "take", "skip", "distinct", "cursor"]),
  findFirst: new Set(["where", "select", "orderBy", "skip", "distinct", "cursor"]),
  count: new Set(["where", "orderBy", "take", "skip", "cursor"]),
  aggregate: new Set(["where", "orderBy", "take", "skip", "cursor", "_count", "_sum", "_avg", "_min", "_max"]),
  groupBy: new Set(["where", "by", "orderBy", "take", "skip", "having", "_count", "_sum", "_avg", "_min", "_max"]),
};

export class LecturaNoPermitida extends Error {
  constructor(mensaje: string) {
    super(`ctx.db: ${mensaje}`);
    this.name = "LecturaNoPermitida";
  }
}

/** Un `select` sólo puede pedir columnas (true/false) o relaciones DECLARADAS, recursivamente. */
function validarSelect(select: unknown, modelo: string, modelos: Readonly<Record<string, ModeloDeLectura>>, ruta: string): void {
  if (select === undefined) return;
  if (select === null || typeof select !== "object" || Array.isArray(select)) throw new LecturaNoPermitida(`select inválido en ${ruta}`);
  const relaciones = modelos[modelo]?.relaciones ?? {};
  for (const [campo, v] of Object.entries(select as Record<string, unknown>)) {
    if (v === true || v === false) continue;
    const destino = relaciones[campo];
    if (!destino || !modelos[destino]) throw new LecturaNoPermitida(`la relación ${ruta}.${campo} no está declarada`);
    if (v === null || typeof v !== "object" || Array.isArray(v)) throw new LecturaNoPermitida(`select inválido en ${ruta}.${campo}`);
    const anidado = v as Record<string, unknown>;
    const claves = Object.keys(anidado);
    if (claves.some((k) => k !== "select" && k !== "where" && k !== "orderBy" && k !== "take")) throw new LecturaNoPermitida(`en ${ruta}.${campo} sólo se permite select, where, orderBy y take`);
    if (anidado.select === undefined) throw new LecturaNoPermitida(`${ruta}.${campo} tiene que elegir columnas con select`);
    validarSelect(anidado.select, destino, modelos, `${ruta}.${campo}`);
  }
}

const delegadoDe = (modelo: string) => modelo.charAt(0).toLowerCase() + modelo.slice(1);
const esTablaDelMotor = (modelo: string) => /^agente[A-Z]/.test(delegadoDe(modelo));

/**
 * Arma `ctx.db` para un negocio y los modelos del puesto (claves = delegados de Prisma:
 * "proyectoCuota"). `cliente` sólo se cambia en los tests unitarios.
 */
export function lecturaDelNegocio(
  tenantId: string,
  modelos: Readonly<Record<string, ModeloDeLectura>>,
  cliente: unknown = prisma,
): LecturaDelNegocio {
  for (const m of Object.keys(modelos)) if (esTablaDelMotor(m)) throw new LecturaNoPermitida(`las tablas del motor (${m}) no se leen por ctx.db`);

  const fachada = (modelo: string): LecturaDeModelo => {
    const correr = async (op: Operacion, args: Record<string, unknown> | undefined) => {
      const store = getTenantStore();
      if (store?.insideTx) throw new LecturaNoPermitida("se llamó dentro de una transacción (leer va en la fase 1, fuera de toda transacción)");
      if (store && store.tenantId !== tenantId) throw new LecturaNoPermitida("el negocio del contexto no es el de esta lectura");
      const a = { ...(args ?? {}) };
      for (const k of Object.keys(a)) if (!CLAVES_PERMITIDAS[op].has(k)) throw new LecturaNoPermitida(`${op} no admite «${k}»`);
      validarSelect(a.select, modelo, modelos, modelo);
      const where = a.where;
      if (where !== undefined && (where === null || typeof where !== "object" || Array.isArray(where))) throw new LecturaNoPermitida("where inválido");
      // El negocio lo pone el código: un tenantId que venga en el where se pisa.
      a.where = { ...((where as Record<string, unknown>) ?? {}), tenantId };
      const delegado = (cliente as Record<string, Record<Operacion, (x: unknown) => Promise<unknown>>>)[delegadoDe(modelo)];
      if (!delegado) throw new LecturaNoPermitida(`el modelo ${modelo} no existe`);
      // Sin contexto, se abre uno con ESTE negocio: la extensión de RLS fija el GUC con él.
      return store ? await delegado[op](a) : await runInTenantContext(tenantId, async () => await delegado[op](a));
    };
    return {
      findMany: (args) => correr("findMany", args) as Promise<unknown[]>,
      findFirst: (args) => correr("findFirst", args) as Promise<unknown | null>,
      count: (args) => correr("count", args) as Promise<number>,
      aggregate: (args) => correr("aggregate", args),
      groupBy: (args) => correr("groupBy", args) as Promise<unknown[]>,
    };
  };

  const cache = new Map<string, LecturaDeModelo>();
  return new Proxy({} as Record<string, LecturaDeModelo>, {
    get(_t, prop) {
      if (typeof prop !== "string" || prop === "then") return undefined;
      if (!Object.prototype.hasOwnProperty.call(modelos, prop)) throw new LecturaNoPermitida(`el modelo «${prop}» no está declarado para este puesto`);
      let f = cache.get(prop);
      if (!f) {
        // Sólo las cinco lecturas: cualquier otra operación (update, create, $executeRaw…) lanza.
        const base = fachada(prop);
        f = new Proxy(base, {
          get(obj, op) {
            if (typeof op === "string" && (OPERACIONES as readonly string[]).includes(op)) return obj[op as Operacion];
            if (typeof op === "symbol" || op === "then") return undefined;
            throw new LecturaNoPermitida(`la operación «${String(op)}» no existe: ctx.db es de sólo lectura`);
          },
        });
        cache.set(prop, f);
      }
      return f;
    },
    set() {
      throw new LecturaNoPermitida("ctx.db no se modifica");
    },
  }) as LecturaDelNegocio;
}
