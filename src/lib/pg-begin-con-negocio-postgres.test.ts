// La capa de datos CONTRA POSTGRES, con el rol de la app (app_rls, sin BYPASSRLS) y RLS
// encendido, a través del cliente REAL (prisma-base.ts con el empaquetado del BEGIN, rls.ts):
//   · el negocio queda puesto adentro de la transacción y vacío afuera y después del COMMIT;
//   · cada transacción ve SÓLO las filas de su negocio, también con muchas a la vez;
//   · el nivel Serializable se respeta con el BEGIN plegado;
//   · cuántos mensajes salen a la base (el ahorro medido: 4 → 3 por lectura, 1 por lectura de
//     columnas de Tenant);
//   · una lectura de Tenant que toca otra tabla (`_count`) sigue yendo con el negocio puesto.
// SÓLO LECTURA: no escribe nada. Base: una efímera propia (src/test/base-efimera.ts) con los
// negocios A (3 pedidos) y B (2), que se borra al terminar. Sin Postgres local se saltea y lo
// dice; en CI, falla.

import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { apuntarLaAppA, baseEfimeraParaElTest } from "@/test/base-efimera";

test("contra Postgres (app_rls + RLS): el BEGIN junto al negocio no afloja el aislamiento", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  const e = process.env as Record<string, string | undefined>;
  // Las dos mejoras vienen APAGADAS por defecto (db-pool.ts); acá se prueban prendidas.
  Object.assign(e, { NODE_ENV: "development", DB_CONNECTION_LIMIT: "4", DB_CONNECT_TIMEOUT_MS: "3000", DB_BEGIN_CON_NEGOCIO: "on", DB_TENANT_DIRECTO: "on" });

  // Cada mensaje que sale de verdad a la base pasa por el query del prototipo: se cuenta ahí.
  // Tiene que estar puesto ANTES de que el pool abra su primera conexión.
  const salidas: string[] = [];
  const queryOriginal = pg.Client.prototype.query;
  pg.Client.prototype.query = function (this: pg.Client, ...args: unknown[]) {
    const c = args[0] as string | { text?: string };
    salidas.push(typeof c === "string" ? c : String(c?.text ?? ""));
    return (queryOriginal as (...a: unknown[]) => unknown).apply(this, args);
  } as typeof queryOriginal;
  t.after(() => {
    pg.Client.prototype.query = queryOriginal;
  });

  // Dos negocios con distinta cantidad de pedidos: si uno se colara en el otro, el conteo cambia.
  const A = { id: base.a.id, n: base.a.pedidos.length };
  const B = { id: base.b.id, n: base.b.pedidos.length };
  assert.notEqual(A.n, B.n);
  const owner = new pg.Client({ connectionString: base.urlDuenio });
  await owner.connect();
  const tenantEsperado = (await owner.query(`SELECT id, slug, modules FROM "Tenant" WHERE id = $1`, [A.id])).rows[0];
  await owner.end();

  const { basePrisma } = await import("@/lib/prisma-base");
  const { prisma } = await import("@/lib/db");
  const { tenantTransaction, bookingTransaction } = await import("@/lib/rls");
  const { runInTenantContext } = await import("@/lib/tenant-context");

  const rol = await basePrisma.$queryRaw<{ bypass: boolean }[]>`SELECT rolbypassrls AS bypass FROM pg_roles WHERE rolname = current_user`;
  assert.equal(rol[0]?.bypass, false, "la app tiene que correr con un rol sin BYPASSRLS");

  type Visto = { g: string | null; iso: string; n: number };
  const mirar = (tx: { $queryRaw: typeof basePrisma.$queryRaw }) =>
    tx.$queryRaw<Visto[]>`SELECT current_setting('app.current_tenant_id', true) AS g,
                                 current_setting('transaction_isolation') AS iso,
                                 (SELECT count(*) FROM "Order")::int AS n`;

  // 1) Adentro: el negocio puesto, sus filas y nada más. Tres mensajes: BEGIN+negocio, la
  //    consulta, COMMIT (antes eran cuatro).
  salidas.length = 0;
  const [adentro] = await tenantTransaction((tx) => mirar(tx), { tenantId: A.id });
  assert.deepEqual(adentro, { g: A.id, iso: "read committed", n: A.n });
  assert.equal(salidas.length, 3, `mensajes: ${JSON.stringify(salidas)}`);
  assert.match(salidas[0], /^BEGIN; SELECT set_config\('app\.current_tenant_id', '[A-Za-z0-9_-]+', true\)$/);
  assert.equal(salidas[2], "COMMIT");

  // 2) Serializable: el nivel viaja plegado en el BEGIN y se respeta.
  salidas.length = 0;
  const [serial] = await bookingTransaction((tx) => mirar(tx), { tenantId: B.id });
  assert.deepEqual(serial, { g: B.id, iso: "serializable", n: B.n });
  assert.equal(salidas.length, 3, `mensajes: ${JSON.stringify(salidas)}`);
  assert.match(salidas[0], /^BEGIN ISOLATION LEVEL SERIALIZABLE; SELECT set_config/);

  // 3) Afuera y después del COMMIT: el negocio vacío y ninguna fila visible.
  const [afuera] = await basePrisma.$queryRaw<{ g: string | null; n: number }[]>`
    SELECT current_setting('app.current_tenant_id', true) AS g, (SELECT count(*) FROM "Order")::int AS n`;
  assert.ok(afuera.g === null || afuera.g === "", `el negocio quedó puesto afuera: ${afuera.g}`);
  assert.equal(afuera.n, 0);

  // 4) Muchas a la vez, de los dos negocios, sobre el mismo pool (4 conexiones): cada una ve lo
  //    suyo. Si un negocio se colara en la transacción de otro, algún conteo daría distinto.
  const vueltas = await Promise.all(
    Array.from({ length: 40 }, (_, i) => {
      const quien = i % 2 === 0 ? A : B;
      return tenantTransaction(async (tx) => (await mirar(tx))[0], { tenantId: quien.id }).then((v) => ({ quien, v }));
    }),
  );
  for (const { quien, v } of vueltas) assert.deepEqual(v, { g: quien.id, iso: "read committed", n: quien.n });

  // 5) Una lectura suelta con RLS (la extensión): mismo resultado, un mensaje menos.
  salidas.length = 0;
  const n = await runInTenantContext(A.id, async () => prisma.order.count());
  assert.equal(n, A.n);
  assert.equal(salidas.length, 3, `mensajes: ${JSON.stringify(salidas)}`);

  // 6) Columnas propias de Tenant: un solo mensaje, sin transacción, y lo mismo que lee el dueño.
  salidas.length = 0;
  const tenant = await runInTenantContext(A.id, async () =>
    prisma.tenant.findUnique({ where: { id: A.id }, select: { id: true, slug: true, modules: true } }),
  );
  assert.deepEqual(tenant, tenantEsperado);
  assert.equal(salidas.length, 1, `mensajes: ${JSON.stringify(salidas)}`);
  assert.doesNotMatch(salidas[0], /BEGIN/);

  // 7) Tenant con `_count` de otra tabla: sigue por la transacción con el negocio puesto (sin el
  //    negocio, RLS contaría 0).
  salidas.length = 0;
  const conConteo = await runInTenantContext(A.id, async () =>
    prisma.tenant.findUnique({ where: { id: A.id }, select: { id: true, _count: { select: { orders: true } } } }),
  );
  assert.equal(conConteo?._count.orders, A.n);
  assert.match(salidas[0] ?? "", /^BEGIN; SELECT set_config/);
});
