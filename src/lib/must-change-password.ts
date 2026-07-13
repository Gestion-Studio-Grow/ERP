// Flag `User.mustChangePassword` — leído/escrito con SQL CRUDO DEFENSIVO a propósito.
//
// POR QUÉ CRUDO Y NO EN schema.prisma (lección CH / memoria `fase2-alta-aceitado`): si la
// columna estuviera en el modelo `User`, `prisma generate` haría que TODO `user.findFirst`
// sin `select` (p. ej. el LOGIN) la SELECT-eara; contra una DB que todavía NO aplicó la
// migración (`prisma/pending-gate2/MustChangePassword.sql`, Gate 2) eso es "column does not
// exist" → caída de login en prod (el schema-ahead que tiró CH). Manteniéndolo fuera del
// schema, el blast radius sobre las queries existentes de `User` es CERO, y acá toleramos que
// la columna no exista aún: la lectura devuelve `false` (fail-safe → nadie queda trabado) y el
// operador ve "pendiente de migración" en vez de un error.
//
// RLS (ADR-018): `User` es tabla de-tenant. Con RLS ON, la extensión de `rlsPrisma` NO envuelve
// las ops crudas (`model === undefined`) con el GUC del tenant → una lectura cruda suelta se
// filtraría a 0 filas. Por eso el lado APP corre dentro de `tenantTransaction` (setea
// `app.current_tenant_id`). El lado OPERADOR usa `operatorPrisma` (control-plane, BYPASSRLS) y
// puede leer/escribir cross-tenant directo.

import { tenantTransaction } from "@/lib/rls";
import { basePrisma } from "@/lib/prisma-base";

// Cliente capaz de correr SQL crudo (PrismaClient del operador o el `tx` de tenantTransaction).
type RawClient = {
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): PromiseLike<T>;
  $executeRaw(query: TemplateStringsArray, ...values: unknown[]): PromiseLike<number>;
};

// ¿El error es "no existe la columna/tabla" (migración sin aplicar)? Postgres 42703 (columna) /
// 42P01 (tabla). Ante la duda, cualquier fallo de la lectura se trata como ausente (defensivo).
function isMissingColumn(e: unknown): boolean {
  const code = (e as { code?: string })?.code;
  return code === "42703" || code === "42P01";
}

// --- ¿Existe la columna? (probe SIN transacción, memoizado) ------------------
// CLAVE: en el lado APP NO abrimos una `tenantTransaction` para leer una columna que quizá no
// existe — una query que falla (42703) DENTRO de una transacción la ABORTA, y bajo conexiones
// frágiles (o pools chicos) eso ensucia la conexión. En vez de eso probamos la existencia con una
// consulta al catálogo (`information_schema`, no toca RLS ni abre transacción) y sólo entramos a
// la transacción con GUC cuando la columna EXISTE → la lectura del flag nunca aborta nada.
// Memoizado: una vez que da true, no vuelve a chequear (la columna no desaparece sin reinicio);
// mientras dé false/errore, reintenta (cubre el momento justo tras aplicar la migración).
let _columnPresent = false;
async function userFlagColumnExists(): Promise<boolean> {
  if (_columnPresent) return true;
  const rows = await basePrisma
    .$queryRaw`SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'User' AND column_name = 'mustChangePassword'
      LIMIT 1`
    .catch(() => null);
  if (rows === null) return false; // catálogo no disponible: reintentar luego, no cachear
  _columnPresent = Array.isArray(rows) && rows.length > 0;
  return _columnPresent;
}

// --- Lado APP (tenant, RLS-aware) --------------------------------------------

// ¿Este usuario tiene que cambiar la contraseña en su próximo ingreso? Corre dentro de
// `tenantTransaction` para que RLS deje ver su fila. Fail-safe: si la columna no existe todavía
// (Gate 2 sin aplicar) o hay cualquier error, devuelve `false` — nadie queda trabado.
export async function mustChangePasswordFor(user: { id: string; tenantId: string }): Promise<boolean> {
  try {
    if (!(await userFlagColumnExists())) return false;
    return await tenantTransaction(
      async (tx) => {
        const rows = await (tx as unknown as RawClient).$queryRaw<{ mustChangePassword: boolean }[]>`
          SELECT "mustChangePassword" FROM "User"
          WHERE "id" = ${user.id} AND "tenantId" = ${user.tenantId}
          LIMIT 1
        `;
        return rows.length > 0 ? rows[0].mustChangePassword === true : false;
      },
      { tenantId: user.tenantId },
    );
  } catch {
    return false;
  }
}

// Baja el flag (el usuario ya definió su contraseña nueva). Idempotente; si la columna no existe
// todavía, no hay nada que bajar → no rompe.
export async function clearMustChangePassword(user: { id: string; tenantId: string }): Promise<void> {
  if (!(await userFlagColumnExists())) return;
  try {
    await tenantTransaction(
      async (tx) => {
        await (tx as unknown as RawClient).$executeRaw`
          UPDATE "User" SET "mustChangePassword" = ${false}
          WHERE "id" = ${user.id} AND "tenantId" = ${user.tenantId}
        `;
      },
      { tenantId: user.tenantId },
    );
  } catch (e) {
    if (!isMissingColumn(e)) throw e;
  }
}

// --- Lado OPERADOR (control-plane, cross-tenant) -----------------------------

// Estado del flag para un usuario, visto desde el operador. `"pendiente"` = la columna no está
// en la base todavía (migración Gate 2 sin aplicar) → la ficha lo muestra como tal.
export async function operatorReadMustChange(db: RawClient, userId: string): Promise<boolean | "pendiente"> {
  try {
    const rows = await db.$queryRaw<{ mustChangePassword: boolean }[]>`
      SELECT "mustChangePassword" FROM "User" WHERE "id" = ${userId} LIMIT 1
    `;
    return rows.length > 0 ? rows[0].mustChangePassword === true : false;
  } catch (e) {
    if (isMissingColumn(e)) return "pendiente";
    throw e;
  }
}

// Setea el flag desde el operador (reset de contraseña). Devuelve `persisted:false` si la
// columna todavía no existe — el reset de la contraseña en sí SÍ funcionó (es un UPDATE de
// `passwordHash` aparte); solo el cambio-forzado queda inerte hasta aplicar la migración.
export async function operatorSetMustChange(
  db: RawClient,
  userId: string,
  value: boolean,
): Promise<{ persisted: boolean }> {
  try {
    await db.$executeRaw`
      UPDATE "User" SET "mustChangePassword" = ${value} WHERE "id" = ${userId}
    `;
    return { persisted: true };
  } catch (e) {
    if (isMissingColumn(e)) return { persisted: false };
    throw e;
  }
}

// Constante de la acción de auditoría del reset (fuente única, la usan la acción y los tests).
export const AUDIT_ACTION_OWNER_RESET = "owner.password.reset";
