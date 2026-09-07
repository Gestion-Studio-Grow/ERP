// Extensión de Prisma que inyecta el contexto de tenant para RLS (ADR-018, B).
//
// Cómo encaja (ver src/lib/prisma-base.ts): `@/lib/prisma` exporta el cliente
// CONMUTADO por el flag RLS_ENFORCEMENT. Con el flag OFF el cliente es el crudo y
// esta extensión NO se usa → comportamiento idéntico al de siempre. Con el flag ON,
// `prisma` pasa a ser `rlsPrisma` y cada operación queda envuelta en
// una transacción que primero setea `app.current_tenant_id` con
// set_config(..., true) (== SET LOCAL, pero parametrizable → pooling-safe).
//
// ⚠️ El "(hoy)" que decía este comentario afirmaba que el flag estaba OFF. Es falso o al
// menos no verificable desde el código: `.env.vercel.template:33` trae `RLS_ENFORCEMENT=on`
// y el CLAUDE.md del repo declara RLS vivo y forzado en producción. El valor real vive en
// el entorno de Vercel, no acá, así que este archivo NO debe afirmar en qué estado está.
// Para saberlo de verdad: `prisma/rls/check-rls-live.mjs` contra la base.
//
// Resolución del tenant: primero el store de AsyncLocalStorage (si un request lo
// seteó con runInTenantContext); si no, cae a getCurrentTenantId() — la
// resolución universal que ya usa toda la app (hoy un solo tenant; fail-closed
// ADR-015). getCurrentTenantId usa el cliente BASE (no esta extensión) → sin
// recursión. El día del 2º tenant, el request setea el store y este fallback deja
// de usarse (ADR-018 §4).

import { Prisma } from "@/generated/prisma/client";
import { basePrisma, RLS_ENFORCEMENT } from "@/lib/prisma-base";
import { getTenantStore, runInTenantContext } from "@/lib/tenant-context";
import { getCurrentTenantId } from "@/lib/tenant";
import { scopeArgs, scopeTxClient } from "@/lib/tenant-scope";

async function resolveTenantId(): Promise<string> {
  return getTenantStore()?.tenantId ?? (await getCurrentTenantId());
}

// Cliente extendido. NO se usa directo: `@/lib/db` lo elige cuando el flag está ON.
export const rlsPrisma = basePrisma.$extends({
  query: {
    async $allOperations({ args, query, model, operation }) {
      // Ops crudas ($executeRaw/$queryRaw, model === undefined): no se envuelven.
      // Es inocuo porque la app no tiene queries crudas sobre tablas de tenant.
      if (model === undefined) return query(args);

      const store = getTenantStore();
      // Ya dentro de una transacción que seteó el GUC (tenantTransaction): correr
      // directo, sin abrir otra transacción (no se puede anidar).
      if (store?.insideTx) {
        return query(scopeArgs(model, operation, args, store.tenantId));
      }

      const tenantId = store?.tenantId ?? (await getCurrentTenantId());

      // Op suelta → transacción interactiva sobre el cliente BASE: setear el GUC
      // como primer statement y re-despachar la MISMA operación sobre `tx` (mismo
      // cliente, sin auto-referencia ni recursión del extension). set_config(...,
      // true) es transaction-scoped ⇒ pooling-safe.
      //
      // El candado de tenant (ADR-018 bis, src/lib/tenant-scope.ts) va ACÁ ADENTRO y
      // no como extensión por fuera: `tx` es el cliente crudo, sin extensiones, así
      // que una extensión externa se saltearía en silencio. Medido: con el candado
      // por fuera y el flag ON, 3 de 6 ataques cross-tenant volvían a pasar
      // (prisma/rls/aislamiento-capa-app.ts).
      const delegate = model.charAt(0).toLowerCase() + model.slice(1);
      return basePrisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (scopeTxClient(tx, tenantId) as any)[delegate][operation](args);
      });
    },
  },
});

// Tipo del cliente de transacción interactiva del cliente base.
type TxClient = Parameters<Parameters<typeof basePrisma.$transaction>[0]>[0];

/**
 * Transacción interactiva consciente de RLS. Reemplaza a
 * `prisma.$transaction(async tx => …)` en las server actions.
 *
 * - Flag OFF: es exactamente `basePrisma.$transaction(fn)` → cero cambio vs hoy.
 * - Flag ON: resuelve el tenant, abre la transacción y setea el GUC como PRIMER
 *   statement, marcando insideTx para que la extensión no anide.
 *
 * Regla dentro del callback: usar SIEMPRE `tx` (no el `prisma` externo), como ya
 * hace el código — así todas las ops caen en la misma conexión con el GUC seteado.
 *
 * `opts.tenantId` fuerza el tenant (para paths sin request donde el tenant se
 * conoce explícito, ej. el worker de facturación). Si se omite, se resuelve del
 * store o de getCurrentTenantId().
 *
 * `opts.isolationLevel` fija el nivel de aislamiento de la transacción (default:
 * el de la conexión, ReadCommitted). `opts.maxRetries` reintenta la transacción
 * completa ante un conflicto de serialización (ver `isWriteConflict`); por default
 * reintenta solo si se pidió Serializable. Ambos habilitan `bookingTransaction`
 * (fix del TOCTOU de overbooking, ADR-004/023 F2).
 */
export async function tenantTransaction<T>(
  fn: (tx: TxClient) => Promise<T>,
  opts?: {
    tenantId?: string;
    isolationLevel?: Prisma.TransactionIsolationLevel;
    maxRetries?: number;
  },
): Promise<T> {
  const txOptions = opts?.isolationLevel
    ? { isolationLevel: opts.isolationLevel }
    : undefined;
  // Reintentar solo tiene sentido en un nivel que aborta por conflicto (Serializable).
  const maxRetries =
    opts?.maxRetries ??
    (opts?.isolationLevel === Prisma.TransactionIsolationLevel.Serializable
      ? DEFAULT_SERIALIZABLE_RETRIES
      : 0);

  for (let attempt = 0; ; attempt++) {
    try {
      if (!RLS_ENFORCEMENT) {
        // Sin RLS el candado de la app es la ÚNICA muralla: el `tx` crudo no tiene
        // extensiones, así que se envuelve con el proxy que inyecta el tenant.
        const tenantId = opts?.tenantId ?? (await resolveTenantId());
        return await basePrisma.$transaction(
          (tx) => fn(scopeTxClient(tx, tenantId)),
          txOptions,
        );
      }

      const tenantId = opts?.tenantId ?? (await resolveTenantId());
      // Callback async que await-ea DENTRO del scope: así el contexto ALS (insideTx)
      // sobrevive a la parte asíncrona (las promesas de Prisma son lazy; un callback
      // no-async devolvería la promesa y perdería el contexto antes de ejecutarla).
      return await runInTenantContext(
        tenantId,
        async () =>
          basePrisma.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
            return fn(scopeTxClient(tx, tenantId));
          }, txOptions),
        { insideTx: true },
      );
    } catch (e) {
      // Serialization_failure/deadlock (Postgres 40001 → Prisma P2034): la
      // transacción abortó por una concurrente. Reintentar re-corre `fn` entero.
      if (attempt < maxRetries && isWriteConflict(e)) continue;
      throw e;
    }
  }
}

// Reintentos por default de una transacción Serializable antes de propagar el
// conflicto. 3 alcanza de sobra para la contención real de dos reservas del mismo
// hueco (a la 2ª pasada una ya está commiteada y `assertSlotAvailable` la ve).
const DEFAULT_SERIALIZABLE_RETRIES = 3;

/**
 * Postgres `serialization_failure` (SQLSTATE 40001) o deadlock, que Prisma expone
 * como P2034 ("Transaction failed due to a write conflict or a deadlock"). Es la
 * señal de que una transacción Serializable abortó por una concurrente y conviene
 * reintentarla, no un error de negocio.
 */
function isWriteConflict(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034";
}

/**
 * Transacción de RESERVA: `tenantTransaction` en nivel Serializable con reintentos.
 * Cierra el TOCTOU de overbooking (ADR-004 alt. B / ADR-023 F2). El check-then-insert
 * de `assertSlotAvailable` en ReadCommitted deja pasar dos reservas simultáneas del
 * mismo hueco (ambas leen "libre" antes de que cualquiera inserte); en Serializable
 * Postgres aborta una con serialization_failure y el reintento re-corre la
 * validación, que ahora ve el turno ya commiteado y falla con el error de negocio
 * "ese horario ya no está disponible". Úsala en todo alta/reprogramación de turno.
 */
export function bookingTransaction<T>(
  fn: (tx: TxClient) => Promise<T>,
  opts?: { tenantId?: string },
): Promise<T> {
  return tenantTransaction(fn, {
    ...opts,
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });
}
