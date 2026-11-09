// Flag `User.mustChangePassword` — leído/escrito con SQL CRUDO DEFENSIVO a propósito.
//
// 09/11/2026: la columna pasó a migración normal (`prisma/migrations/20261109120000_must_change_password`)
// y al modelo `User` de schema.prisma. El schema-ahead que tiró CH (login caído porque el cliente
// SELECT-eaba una columna que la base no tenía) ya no puede llegar a producción: el build frena si la
// base está atrás del código (scripts/vercel-build.mjs) y `prisma/lote-deploy.txt` la declara. Igual
// se sigue leyendo con SQL crudo y tolerando la ausencia, por las bases de desarrollo atrasadas:
//   - la LECTURA sin columna devuelve `false` (nadie queda trabado). Es seguro porque, sin columna,
//     el reset y el alta NO emiten provisorias (fallan cerrado: CAMBIO_OBLIGATORIO_INACTIVO);
//   - el operador ve "pendiente de migración" en vez de un error.
//
// RLS (ADR-018): `User` es tabla de-tenant. Con RLS ON, la extensión de `rlsPrisma` NO envuelve
// las ops crudas (`model === undefined`) con el GUC del tenant → una lectura cruda suelta se
// filtraría a 0 filas. Por eso el lado APP corre dentro de `tenantTransaction` (setea
// `app.current_tenant_id`). El lado OPERADOR corre dentro de `enElNegocio` (la conexión de la
// consola también está sujeta a RLS en producción, ver operator-db.ts): por eso ahí NO se puede
// «probar y tolerar» la columna faltante — en Postgres una sentencia que falla deja abortada la
// transacción entera y el reset no llegaba a auditar. Primero se pregunta si la columna existe.

import { tenantTransaction } from "@/lib/rls";
import { basePrisma } from "@/lib/prisma-base";

// Cliente capaz de correr SQL crudo (PrismaClient del operador o el `tx` de tenantTransaction).
type RawClient = {
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): PromiseLike<T>;
  $executeRaw(query: TemplateStringsArray, ...values: unknown[]): PromiseLike<number>;
};

// ¿El error es "no existe la columna/tabla" (migración sin aplicar)? Postgres 42703 (columna) /
// 42P01 (tabla).
//
// CON PRISMA 7 Y EL ADAPTADOR DE PG EL CÓDIGO NO LLEGA ARRIBA. Medido contra Postgres local
// (2026-09-23): un `$queryRaw` sobre una columna que no existe tira `code: "P2010"` y el 42703
// viaja en `meta.driverAdapterError.cause.originalCode` (con `kind: "ColumnNotFound"`). Mirar
// sólo `e.code` daba siempre false: la ficha del negocio en /operador se caía entera en vez de
// mostrar "pendiente". Se miran las dos formas: la del driver directo y la del adaptador.
export function isMissingColumn(e: unknown): boolean {
  const x = e as {
    code?: string;
    meta?: { driverAdapterError?: { cause?: { originalCode?: string; kind?: string } } };
  };
  if (x?.code === "42703" || x?.code === "42P01") return true;
  const causa = x?.meta?.driverAdapterError?.cause;
  return (
    causa?.originalCode === "42703" ||
    causa?.originalCode === "42P01" ||
    causa?.kind === "ColumnNotFound" ||
    causa?.kind === "TableDoesNotExist"
  );
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
// El NEGATIVO también se recuerda, pero con vencimiento. Mientras la migración no esté
// aplicada (hoy, Gate 2 pendiente) la respuesta es "no existe" — y sin este recuerdo el
// backoffice le preguntaba al catálogo en CADA request de CADA pantalla. Es una query
// entera por pantalla para confirmar algo que cambia una sola vez en la vida del sistema.
// Con el vencimiento corto se conserva la propiedad que import a: aplicada la migración, el
// sistema se entera solo en menos de un minuto, sin reiniciar nada.
const AUSENCIA_TTL_MS = 60_000;
let _ausenciaHasta = 0;
// `null` = no se pudo preguntar (catálogo caído): el llamador decide (la lectura falla cerrado).
async function userFlagColumnExists(now: number = Date.now()): Promise<boolean | null> {
  if (_columnPresent) return true;
  if (now < _ausenciaHasta) return false;
  const rows = await basePrisma
    .$queryRaw`SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'User' AND column_name = 'mustChangePassword'
      LIMIT 1`
    .catch(() => null);
  if (rows === null) return null; // catálogo no disponible: reintentar ya, no cachear
  _columnPresent = Array.isArray(rows) && rows.length > 0;
  if (!_columnPresent) _ausenciaHasta = now + AUSENCIA_TTL_MS;
  return _columnPresent;
}

// --- Lado APP (tenant, RLS-aware) --------------------------------------------

// ¿Este usuario tiene que cambiar la contraseña en su próximo ingreso? Corre dentro de
// `tenantTransaction` para que RLS deje ver su fila.
//   - Columna inexistente (migración sin aplicar) → `false`: sin ella no se emite ninguna provisoria
//     (el reset y el alta fallan cerrado), así que no hay a quién forzar y nadie queda trabado.
//   - Cualquier OTRO error (catálogo o lectura) → `true`: FALLA CERRADO (ENG-104). Lo peor que pasa
//     es ver una vez la pantalla de cambio (vive fuera del portón: no hay loop); lo otro era dejar
//     pasar una provisoria sin cambiarla.
export async function mustChangePasswordFor(user: { id: string; tenantId: string }): Promise<boolean> {
  try {
    const existe = await userFlagColumnExists();
    if (existe === false) return false;
    if (existe === null) return true;
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
  } catch (e) {
    return !isMissingColumn(e);
  }
}

// Baja el flag (el usuario ya definió su contraseña nueva). Idempotente; si la columna no existe
// todavía, no hay nada que bajar → no rompe.
export async function clearMustChangePassword(user: { id: string; tenantId: string }): Promise<void> {
  if ((await userFlagColumnExists()) === false) return;
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

// ¿Ya se aplicó la migración de la columna? Una lectura del catálogo, que no falla: dentro de una
// transacción no se puede probar la columna y tolerar el error (abortaría la transacción).
async function hayColumnaMustChange(db: RawClient): Promise<boolean> {
  const filas = await db.$queryRaw<{ hay: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'User' AND column_name = 'mustChangePassword'
    ) AS hay
  `;
  return filas[0]?.hay === true;
}

// Estado del flag para un usuario, visto desde el operador. `"pendiente"` = la columna no está
// en la base todavía (migración Gate 2 sin aplicar) → la ficha lo muestra como tal.
export async function operatorReadMustChange(db: RawClient, userId: string): Promise<boolean | "pendiente"> {
  if (!(await hayColumnaMustChange(db))) return "pendiente";
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
  if (!(await hayColumnaMustChange(db))) return { persisted: false };
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

// Mensaje único de «el cambio obligatorio no está activo en esta base» (reset y alta lo usan).
// Regla del dueño (contraseñas provisorias): sin el cambio obligatorio activo, NO se emite una
// provisoria — quedaría válida para siempre. Primero se aplica la migración.
export const CAMBIO_OBLIGATORIO_INACTIVO =
  "No se generó ninguna contraseña: esta base todavía no tiene activo el cambio obligatorio de contraseña " +
  "(migración 20261109120000_must_change_password sin aplicar). Una provisoria quedaría válida para siempre. " +
  "Primero se publica la migración; después se repite esta acción.";

// La tira el alta cuando ya creó la fila y el flag no se pudo marcar: tirarla dentro de la
// transacción del negocio deshace el alta entera (no queda un usuario con provisoria eterna).
export class CambioObligatorioInactivo extends Error {
  constructor() {
    super(CAMBIO_OBLIGATORIO_INACTIVO);
    this.name = "CambioObligatorioInactivo";
  }
}

// Constante de la acción de auditoría del reset (fuente única, la usan la acción y los tests).
export const AUDIT_ACTION_OWNER_RESET = "owner.password.reset";
