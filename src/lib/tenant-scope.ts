// Candado de tenant en la CAPA DE APLICACIÓN (segunda muralla, independiente de RLS).
//
// POR QUÉ EXISTE
// El aislamiento entre los cuatro negocios que comparten una sola base Postgres
// descansaba 100% en RLS. La suite `prisma/rls/aislamiento-*.mjs` mostró las dos
// caras: con RLS bien encendido los 7 intentos cross-tenant se bloquean, pero el
// código tiene ~78 consultas del tipo `where: { id }` sin `tenantId` y varias
// `findMany` sin `where` alguno. Con RLS apagado (o con la conexión apuntando a un
// rol dueño de las tablas, que es EXENTO), esas consultas son IDOR real: se
// demostró leer el PII de un cliente de otro tenant editando el id en la URL y
// cancelar un turno ajeno manipulando un campo del formulario.
//
// QUÉ HACE
// Inyecta `tenantId` en el `where` de toda operación que filtre filas existentes,
// para los 44 modelos que tienen la columna. Es una sola pieza en vez de 78 parches
// a mano: cubre también el código que se escriba mañana, y no se puede olvidar.
//
// QUÉ NO HACE
//   * No toca `create`/`createMany`: no hay `where` que filtrar, y el `tenantId` es
//     NOT NULL en el esquema, así que omitirlo revienta ruidosamente en el insert.
//   * No pisa un `tenantId` que el código ya puso explícito. Los paths que trabajan
//     sobre un tenant distinto del ambiente (workers, cron por tenant) lo pasan a
//     propósito, y ese valor viene del código, nunca del usuario.
//   * No reemplaza a RLS. RLS es el backstop en la base; esto es el candado en la
//     app. Las dos murallas fallan distinto: RLS se cae si el rol es exento o el
//     flag está en off; esto se cae si alguien usa `basePrisma` a mano.
//
// CÓMO SE ENCHUFA
// `@/lib/db` envuelve con esto al cliente que corresponda (crudo o el de RLS). Tiene
// que quedar POR FUERA de la extensión de RLS: la de RLS re-despacha la operación
// sobre el cliente base, así que una extensión por dentro se saltearía. El orden
// está verificado en `src/lib/tenant-scope.test.ts`.
//
// Paths que legítimamente cruzan tenants (resolución de tenant, seed, provisioning)
// importan `basePrisma` de `@/lib/prisma-base` y no pasan por acá — igual que con RLS.

import { getTenantStore } from "@/lib/tenant-context";
import { getCurrentTenantId } from "@/lib/tenant";

/**
 * Modelos SIN columna `tenantId`. Filtrar por tenant acá sería un error de SQL.
 * `src/lib/tenant-scope.test.ts` lee `prisma/schema.prisma` y falla si esta lista
 * se desincroniza — o sea: el día que alguien agregue un modelo global, se entera.
 */
export const MODELOS_SIN_TENANT: ReadonlySet<string> = new Set(["Tenant"]);

/**
 * Operaciones cuyo `where` selecciona filas YA existentes. Son las únicas que se
 * pueden filtrar por tenant, y son exactamente por donde se fuga.
 */
export const OPERACIONES_FILTRABLES: ReadonlySet<string> = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "upsert",
  "delete",
  "deleteMany",
  "count",
  "aggregate",
  "groupBy",
]);

type Args = { where?: Record<string, unknown> } & Record<string, unknown>;

/**
 * Devuelve los args con el candado puesto. PURA: sin base, sin contexto, testeable.
 *
 * - Modelo sin `tenantId` u operación sin `where` → los args tal cual (misma
 *   referencia, para no gastar en clonar lo que no se toca).
 * - `where` ausente o sin `tenantId` → se agrega.
 * - `tenantId` ya presente (y distinto de `undefined`) → se respeta, no se pisa.
 *
 * Sobre `findUnique`/`update`/`delete`: agregar un campo NO único al lado del id es
 * válido en Prisma (extendedWhereUnique, GA desde Prisma 5). Verificado contra la
 * base real: `findUnique` con el tenant ajeno devuelve `null` y `update` tira P2025,
 * que es exactamente el "no existe" que la app ya sabe manejar.
 */
export function scopeArgs(
  model: string | undefined,
  operation: string,
  args: unknown,
  tenantId: string,
): unknown {
  if (!model || MODELOS_SIN_TENANT.has(model)) return args;
  if (!OPERACIONES_FILTRABLES.has(operation)) return args;

  const a = (args ?? {}) as Args;
  const where = a.where;
  if (where && where.tenantId !== undefined) return args;

  return { ...a, where: { ...(where ?? {}), tenantId } };
}

/**
 * Envuelve un cliente de TRANSACCIÓN interactiva con el mismo candado.
 *
 * Hace falta un Proxy y no una extensión porque el `tx` que Prisma le pasa al
 * callback de `$transaction` no expone `$extends` (está en la deny-list del tipo).
 * Y hace falta cubrirlo: 87 operaciones del repo escriben sobre `tx` dentro de
 * `tenantTransaction`, o sea justo las que corrompen datos, no sólo las que los leen.
 *
 * El `tenantId` se conoce al abrir la transacción, así que acá es sincrónico.
 */
export function scopeTxClient<T extends object>(tx: T, tenantId: string): T {
  return new Proxy(tx, {
    get(target, prop, receiver) {
      const valor = Reflect.get(target, prop, receiver);
      // `$transaction`, `$executeRaw`, símbolos internos: derecho.
      if (typeof prop !== "string" || prop.startsWith("$")) return valor;
      if (typeof valor !== "object" || valor === null) return valor;

      const modelo = prop.charAt(0).toUpperCase() + prop.slice(1);
      if (MODELOS_SIN_TENANT.has(modelo)) return valor;

      return new Proxy(valor as object, {
        get(delegado, op, recDelegado) {
          const fn = Reflect.get(delegado, op, recDelegado);
          if (typeof op !== "string" || typeof fn !== "function") return fn;
          if (!OPERACIONES_FILTRABLES.has(op)) return fn;
          return (args: unknown, ...resto: unknown[]) =>
            (fn as (...a: unknown[]) => unknown).call(
              delegado,
              scopeArgs(modelo, op, args, tenantId),
              ...resto,
            );
        },
      }) as unknown;
    },
  });
}

/** Resuelve el tenant igual que la extensión de RLS: primero el store del request. */
async function resolverTenantId(): Promise<string> {
  return getTenantStore()?.tenantId ?? (await getCurrentTenantId());
}

/**
 * Envuelve un cliente Prisma con el candado. El tipo de retorno es el del cliente
 * que entra: la extensión sólo reescribe args, no cambia la API.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withTenantScope<T extends { $extends: (ext: any) => unknown }>(
  client: T,
): T {
  return client.$extends({
    name: "tenant-scope",
    query: {
      async $allOperations({
        args,
        query,
        model,
        operation,
      }: {
        args: unknown;
        query: (args: unknown) => Promise<unknown>;
        model?: string;
        operation: string;
      }) {
        // Ops crudas ($queryRaw/$executeRaw): no tienen modelo ni `where` que tocar.
        if (model === undefined) return query(args);
        if (MODELOS_SIN_TENANT.has(model)) return query(args);
        if (!OPERACIONES_FILTRABLES.has(operation)) return query(args);

        const a = (args ?? {}) as Args;
        // Cortocircuito ANTES de resolver el tenant: si ya vino explícito no hace
        // falta ir a buscarlo (y así los paths sin request no rompen por resolverlo).
        if (a.where && a.where.tenantId !== undefined) return query(args);

        return query(scopeArgs(model, operation, args, await resolverTenantId()));
      },
    },
  }) as unknown as T;
}
