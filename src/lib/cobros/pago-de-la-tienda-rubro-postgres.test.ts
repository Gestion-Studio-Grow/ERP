// El pago desde Gracias es sólo para COMERCIO, contra Postgres de verdad (src/test/base-efimera.ts).
//
// B · Un negocio de servicios (estética, como beauty-spa: blueprint `servicios`) con el módulo
// `mercadopago` (que es de todos los rubros) y Mercado Pago «conectado» (modo real) o el simulador
// prendido: Gracias NO muestra el botón y la action pública responde «sin-mp» aunque alguien arme el
// formulario a mano con un token válido.
// A · El mismo negocio como carnicería (la demo Magra: stub + simulador): el botón sí, y la action
// arma el link (stub).
//
// El entorno de Mercado Pago se inyecta (al server, por parámetro; a la action, en process.env
// restaurado al terminar). Corre también con PGlite: no hay transacciones en paralelo.

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const CLAVES_MP = ["MP_MODO", "MP_SIMULAR_AVISOS"] as const;

test("pago desde Gracias: servicios no (botón ni action, real o simulador); comercio sí", { timeout: 120_000 }, async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  prepararAccionesDeServidor();
  apuntarLaAppA(base);
  const env = process.env as Record<string, string | undefined>;
  const antes = Object.fromEntries(CLAVES_MP.map((k) => [k, env[k]]));
  t.after(() => {
    for (const k of CLAVES_MP) {
      if (antes[k] === undefined) delete env[k];
      else env[k] = antes[k];
    }
  });
  const duenio = await prismaComoDuenio(base);
  const { a } = base;

  const { pagarPedidoDeLaTienda } = await import("./pago-de-la-tienda-actions");
  const { pagoDeLaTiendaParaGracias } = await import("./pago-de-la-tienda.server");
  const { MENSAJE_SIN_PAGO, tokenDelPedido } = await import("./pago-de-la-tienda");
  const { authSecret } = await import("@/lib/auth");

  await duenio.tenant.update({ where: { id: a.id }, data: { modules: { push: "mercadopago" }, blueprintId: "servicios" } });
  const o = await duenio.order.create({
    data: { tenantId: a.id, code: 78_001, channel: "ONLINE", status: "PENDING", paid: false, total: 9_000, customerName: "Clienta Spa", customerPhone: "" },
    select: { id: true },
  });
  const token = tokenDelPedido(authSecret(), a.id, o.id);
  const clic = async (mp: Record<(typeof CLAVES_MP)[number], string | undefined>) => {
    for (const k of CLAVES_MP) {
      if (mp[k] === undefined) delete env[k];
      else env[k] = mp[k];
    }
    const fd = new FormData();
    fd.set("pedido", "78001");
    fd.set("t", token);
    const s = await ejecutarAccion({ negocio: { host: a.host } }, () => pagarPedidoDeLaTienda(null, fd));
    assert.equal(s.tipo, "respuesta");
    return (s as { valor: Awaited<ReturnType<typeof pagarPedidoDeLaTienda>> }).valor;
  };

  // Como la página: dentro de un pedido HTTP al subdominio del negocio (la lectura pasa por la RLS).
  const boton = async (mp: Record<(typeof CLAVES_MP)[number], string | undefined>) => {
    const s = await ejecutarAccion({ negocio: { host: a.host } }, () => pagoDeLaTiendaParaGracias(a.id, "78001", token, mp));
    assert.equal(s.tipo, "respuesta");
    return (s as { valor: unknown }).valor;
  };

  const REAL = { MP_MODO: "real", MP_SIMULAR_AVISOS: undefined };
  const DEMO = { MP_MODO: undefined, MP_SIMULAR_AVISOS: "1" };

  // B · servicios: ni el botón ni la action, con MP «real» o con el simulador.
  assert.equal(await boton(REAL), null, "servicios + real: sin botón");
  assert.equal(await boton(DEMO), null, "servicios + simulador: sin botón");
  assert.deepEqual(await clic(REAL), { ok: false, error: MENSAJE_SIN_PAGO["sin-mp"] }, "servicios + real: la action no cobra");
  assert.deepEqual(await clic(DEMO), { ok: false, error: MENSAJE_SIN_PAGO["sin-mp"] }, "servicios + simulador: la action no cobra");

  // A · el mismo negocio como carnicería (la demo Magra): botón y link (stub).
  await duenio.tenant.update({ where: { id: a.id }, data: { blueprintId: "carniceria" } });
  assert.deepEqual(await boton(DEMO), { pedido: "78001", token, prueba: true }, "carnicería: botón");
  const ok = await clic(DEMO);
  assert.ok(ok?.ok, `carnicería + simulador: la action arma el link (${JSON.stringify(ok)})`);
});
