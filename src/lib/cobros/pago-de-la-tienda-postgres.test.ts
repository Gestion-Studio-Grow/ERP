// T6 · CARRERA del «Pagar ahora con Mercado Pago» de la tienda (`pagarPedidoDeLaTienda`) contra
// Postgres de verdad (src/test/base-efimera.ts: migraciones + RLS, la app como `app_rls`).
//
// Dos (y después cinco) clics a la vez sobre el MISMO pedido tienen que terminar en UNA sola
// preferencia de Mercado Pago, UNA sola fila de auditoría del link y la MISMA url para todos. Lo
// garantiza el `pg_advisory_xact_lock` por pedido de la action: el segundo espera y relee el link
// que auditó el primero.
//
// La pasarela es el stub (MP_MODO sin setear + MP_SIMULAR_AVISOS=1, como la demo). Se espía su
// `crearLinkDePago` desde el test (sin tocar producción): cuenta las llamadas y demora 150 ms,
// como la latencia de Mercado Pago, para que sin el candado la carrera se vea siempre.
// El pool es el de producción (DB_CONNECTION_LIMIT 5 por instancia): la ronda de 5 prueba
// además que la auditoría del ganador (dentro de su transacción) no pide otra conexión.
//
// Con PGlite (`node scripts/qa/p1-pglite.mjs …`, ERP_TEST_PGLITE=1) se SALTEA diciéndolo: atiende
// una transacción a la vez, así que dos transacciones abiertas en paralelo no arrancan («Unable to
// start a transaction in the given time») y la carrera no existe. Discrimina sólo Postgres real
// (CI, o local con ERP_TEST_PG_URL).

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const DEMORA_MP_MS = 150;

test("tienda: clics simultáneos sobre el mismo pedido → una preferencia, una auditoría, la misma url", { timeout: 120_000 }, async (t) => {
  if (process.env.ERP_TEST_PGLITE === "1") {
    t.skip("PGlite no sostiene transacciones en paralelo: esta carrera sólo se prueba contra Postgres real");
    return;
  }
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  prepararAccionesDeServidor();
  apuntarLaAppA(base);
  const env = process.env as Record<string, string | undefined>;
  delete env.MP_MODO;
  Object.assign(env, { MP_SIMULAR_AVISOS: "1", DB_CONNECTION_LIMIT: "5", DB_CONNECT_TIMEOUT_MS: "3000" });
  const duenio = await prismaComoDuenio(base);
  const { a } = base;

  const { StubPasarelaCobros } = await import("@/plugins/mercadopago/cobros/stub");
  let preferencias = 0;
  const original = StubPasarelaCobros.prototype.crearLinkDePago;
  StubPasarelaCobros.prototype.crearLinkDePago = async function (this: InstanceType<typeof StubPasarelaCobros>, s) {
    preferencias++;
    await new Promise((r) => setTimeout(r, DEMORA_MP_MS));
    return original.call(this, s);
  };
  t.after(() => {
    StubPasarelaCobros.prototype.crearLinkDePago = original;
  });

  const { pagarPedidoDeLaTienda } = await import("./pago-de-la-tienda-actions");
  const { tokenDelPedido } = await import("./pago-de-la-tienda");
  const { authSecret } = await import("@/lib/auth");
  const { ACCION_LINK_DE_PAGO } = await import("@/app/admin/(dashboard)/pedidos/link-de-pago");

  await duenio.tenant.update({ where: { id: a.id }, data: { modules: { push: "mercadopago" } } });

  async function ronda(code: number, clics: number): Promise<void> {
    preferencias = 0;
    const o = await duenio.order.create({
      data: { tenantId: a.id, code, channel: "ONLINE", status: "PENDING", paid: false, total: 15_250.5, customerName: "Clienta Tienda", customerPhone: "" },
      select: { id: true },
    });
    const token = tokenDelPedido(authSecret(), a.id, o.id);
    const clic = () => {
      const fd = new FormData();
      fd.set("pedido", String(code));
      fd.set("t", token);
      return ejecutarAccion({ negocio: { host: a.host } }, () => pagarPedidoDeLaTienda(null, fd));
    };
    const salidas = await Promise.all(Array.from({ length: clics }, clic));
    const valores = salidas.map((s) => {
      assert.equal(s.tipo, "respuesta");
      return (s as { valor: Awaited<ReturnType<typeof pagarPedidoDeLaTienda>> }).valor;
    });
    for (const v of valores) assert.ok(v?.ok, `${clics} clics: todos ok (${JSON.stringify(v)})`);
    const urls = new Set(valores.map((v) => (v as { url: string }).url));
    assert.equal(urls.size, 1, `${clics} clics: la misma url para todos`);
    assert.equal(preferencias, 1, `${clics} clics: una sola preferencia creada en Mercado Pago`);
    const filas = await duenio.auditLog.findMany({
      where: { tenantId: a.id, entity: "Order", entityId: o.id, action: ACCION_LINK_DE_PAGO },
      select: { changes: true },
    });
    assert.equal(filas.length, 1, `${clics} clics: una sola fila de auditoría del link`);
    assert.equal((filas[0].changes as { url?: string }).url, [...urls][0], "la url auditada es la que recibieron");

    // Un clic más, ya sin carrera: reusa el mismo link sin crear otra preferencia.
    const otra = await clic();
    assert.equal(otra.tipo, "respuesta");
    assert.deepEqual((otra as { valor: unknown }).valor, valores[0]);
    assert.equal(preferencias, 1, `${clics} clics + 1: sigue habiendo una sola preferencia`);
  }

  await ronda(77_001, 2);
  await ronda(77_002, 5);
});
