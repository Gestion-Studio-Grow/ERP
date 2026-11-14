// T3b · NINGÚN CANAL VENDE CARNE VENCIDA — las acciones REALES de la tienda, la API externa, la caja
// con lector y el cobro del turno con productos, contra una base efímera (Postgres del arnés o
// PGlite: `node scripts/qa/p1-pglite.mjs src/lib/carniceria/lotes-canales-postgres.test.ts`).
//
//   1 · sin Lotes listos (migración cárnica SIN aplicar, hoy en producción): los cuatro venden como
//       siempre, aunque el negocio sea de perecederos (la guarda no consulta una tabla que no hay);
//   2 · con la migración aplicada y un corte con su único lote vencido: los cuatro lo rechazan y no
//       graban nada (ni pedido, ni stock, ni cobro, ni turno terminado); la tienda y la API dicen el
//       texto para el cliente, sin el código del lote;
//   3 · CH (slug `beauty-spa`, no vende perecederos): con la migración aplicada y un lote vencido
//       cargado, vende como siempre (la guarda ni se arma).
// Nunca toca Neon: el arnés exige un servidor local.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type BaseEfimera, type NegocioDePrueba } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const SQL = readFileSync(path.join(process.cwd(), "prisma/pending-gate2/CarniceriaRubro.sql"), "utf8");
const MODULOS_SUPER = ["pos", "catalog", "clients", "reports", "inventario", "arca", "caja-rapida", "ofertas"];
const HORA = 3_600_000;
const laBase = baseEfimeraDelArchivo();
// La caja con lector no corre sobre PGlite: sus lecturas en paralelo dentro de la transacción chocan
// con el socket de PGlite ("bind message supplies N parameters"), igual que en
// supermercado-postgres.test.ts. Ahí se saltea y se prueba contra el Postgres del arnés (CI).
const CON_CAJA = process.env.ERP_TEST_PGLITE !== "1";

function diaMas(dia: string, n: number): string {
  const d = new Date(`${dia}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

type Contexto = { base: BaseEfimera; duenio: Awaited<ReturnType<typeof prismaComoDuenio>> };
let ctx: Contexto | null = null;

async function preparar(t: import("node:test").TestContext): Promise<Contexto | null> {
  if (ctx) return ctx;
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  // A: un supermercado (rubro de perecederos) con la caja con lector. B queda como CH.
  const a = await duenio.tenant.findUniqueOrThrow({ where: { id: base.a.id }, select: { modules: true } });
  await duenio.tenant.update({ where: { id: base.a.id }, data: { blueprintId: "supermercado", modules: [...new Set([...a.modules, ...MODULOS_SUPER])] } });
  await duenio.tenant.update({ where: { id: base.b.id }, data: { slug: "beauty-spa", blueprintId: null } });
  ctx = { base, duenio };
  return ctx;
}

/** Los cuatro canales sobre un producto del negocio; cada uno devuelve "ok" o el texto del rechazo. */
function canales(c: Contexto) {
  const { duenio } = c;
  const turno = async (negocio: NegocioDePrueba) => {
    const tenantId = negocio.id;
    const box = await duenio.box.create({ data: { tenantId, name: `Box ${randomUUID().slice(0, 4)}` } });
    const servicio = await duenio.service.create({ data: { tenantId, name: "Piernas", durationMin: 30, price: 18000 } });
    const pro = await duenio.professional.create({ data: { tenantId, name: "Caro", boxId: box.id, services: { connect: [{ id: servicio.id }] } } });
    const clientId = (await duenio.client.create({ data: { tenantId, name: "Clienta Lotes", phone: `11400${Math.floor(Math.random() * 1e5)}` } })).id;
    const startsAt = new Date(Date.now() - 24 * HORA);
    return (await duenio.appointment.create({
      data: { tenantId, clientId, professionalId: pro.id, serviceId: servicio.id, boxId: box.id, startsAt, endsAt: new Date(startsAt.getTime() + HORA / 2), status: "CONFIRMED", priceAtBooking: 18000 },
    })).id;
  };
  return {
    async tienda(negocio: NegocioDePrueba, productId: string): Promise<string> {
      const { placeOnlineOrder } = await import("@/lib/order-actions");
      const fd = new FormData();
      for (const [k, v] of Object.entries({ customerName: "Ana Lotes", customerPhone: "11 5555 1234", fulfillment: "PICKUP" })) fd.set(k, v);
      fd.append("productId", productId);
      fd.append("quantity", "1");
      const r = await ejecutarAccion({ negocio }, () => placeOnlineOrder(null as never, fd));
      if (r.tipo === "redireccion") return "ok";
      assert.equal(r.tipo, "respuesta", JSON.stringify(r));
      const v = r.tipo === "respuesta" ? r.valor : null;
      return v && !v.ok ? v.error : "ok";
    },
    async api(negocio: NegocioDePrueba, productId: string): Promise<string> {
      const { createExternalOrder } = await import("@/lib/external-orders");
      const { ApiError } = await import("@/lib/public-api-auth");
      const { runInTenantContext } = await import("@/lib/tenant-context");
      try {
        await runInTenantContext(negocio.id, () =>
          createExternalOrder(negocio.id, { customer: { name: "Comprador", phone: "1155550000" }, items: [{ productId, quantity: 1 }], externalRef: `woo-${randomUUID()}` }),
        );
        return "ok";
      } catch (err) {
        if (err instanceof ApiError) return `${err.status} ${err.code}: ${err.message}`;
        throw err;
      }
    },
    async caja(negocio: NegocioDePrueba, productId: string): Promise<string> {
      const { cobrarVentaDeCaja } = await import("@/lib/supermercado/caja-actions");
      const r = await ejecutarAccion({ negocio, usuario: negocio.duenia }, () =>
        cobrarVentaDeCaja({ clave: `ticket-${randomUUID().slice(0, 8)}`, renglones: [{ productId, cantidad: 1, importe: null }], pagos: [{ medio: "EFECTIVO", monto: 100000 }] }),
      );
      assert.equal(r.tipo, "respuesta", JSON.stringify(r));
      return r.tipo === "respuesta" && !r.valor.ok ? r.valor.error : "ok";
    },
    async turno(negocio: NegocioDePrueba, productId: string): Promise<{ resultado: string; appointmentId: string }> {
      const { cobrarTurnoConProductos } = await import("@/lib/turnos/cobro-con-producto-actions");
      const appointmentId = await turno(negocio);
      const fd = new FormData();
      for (const [k, v] of Object.entries({ appointmentId, method: "EFECTIVO", productos: JSON.stringify([{ productId, qty: 1 }]), clave: randomUUID(), facturar: "false" })) fd.set(k, v);
      const r = await ejecutarAccion({ negocio, usuario: negocio.recepcion }, () => cobrarTurnoConProductos(fd));
      assert.equal(r.tipo, "respuesta", JSON.stringify(r));
      return { resultado: r.tipo === "respuesta" && !r.valor.ok ? r.valor.error : "ok", appointmentId };
    },
  };
}

const corte = (c: Contexto, tenantId: string, name: string) =>
  c.duenio.product.create({ data: { tenantId, name, unit: "u", saleUnit: "UNIT", price: 20000, stock: 50, trackStock: true, active: true }, select: { id: true } });

async function cargarLote(c: Contexto, tenantId: string, actorId: string, productId: string, codigo: string, vence: string) {
  const { tenantTransaction } = await import("@/lib/rls");
  const { crearLoteEnTx } = await import("./lotes-registro");
  const { todayInBusinessTz } = await import("@/lib/datetime");
  await tenantTransaction(
    (tx) =>
      crearLoteEnTx(tx, tenantId, {
        id: randomUUID(), codigo, productId, supplierId: null, envasado: diaMas(todayInBusinessTz(), -20), vence,
        netWeightKg: 4, packages: 2, unitCost: 12000, note: null, actor: `user:${actorId}`,
      }),
    { tenantId },
  );
}

test("1 · sin la migración cárnica: tienda, API, caja y turno venden como siempre en un negocio de perecederos", async (t) => {
  const c = await preparar(t);
  if (!c) return;
  const { base, duenio } = c;
  const { opcionLotesVencidos } = await import("./schema-probe");
  assert.equal(await opcionLotesVencidos(base.a.id, "2026-11-10"), null, "sin la tabla, ni se arma la guarda");
  const vacio = await corte(c, base.a.id, "Vacío al vacío");
  const ch = canales(c);
  assert.equal(await ch.tienda(base.a, vacio.id), "ok");
  assert.equal(await ch.api(base.a, vacio.id), "ok");
  if (CON_CAJA) assert.equal(await ch.caja(base.a, vacio.id), "ok");
  else t.diagnostic("caja con lector salteada en PGlite (ver CON_CAJA)");
  assert.equal((await ch.turno(base.a, vacio.id)).resultado, "ok");
  const { stock } = await duenio.product.findUniqueOrThrow({ where: { id: vacio.id }, select: { stock: true } });
  assert.equal(stock, CON_CAJA ? 46 : 47);
});

test("2 · con Lotes listos: el corte con su único lote vencido no se vende por ningún canal y no se graba nada", async (t) => {
  const c = await preparar(t);
  if (!c) return;
  const { base, duenio } = c;
  const { Client } = await import("pg");
  const pg = new Client({ connectionString: base.urlDuenio });
  await pg.connect();
  try {
    await pg.query(SQL);
  } finally {
    await pg.end();
  }
  const { todayInBusinessTz } = await import("@/lib/datetime");
  const hoy = todayInBusinessTz();
  const { opcionLotesVencidos } = await import("./schema-probe");
  assert.deepEqual(await opcionLotesVencidos(base.a.id, hoy), { hoy });

  const matambre = await corte(c, base.a.id, "Matambre al vacío");
  const bife = await corte(c, base.a.id, "Bife de chorizo");
  await cargarLote(c, base.a.id, base.a.duenia.id, matambre.id, "L-VEN", diaMas(hoy, -1));
  await cargarLote(c, base.a.id, base.a.duenia.id, bife.id, "L-OK", diaMas(hoy, 5));

  const foto = async () => ({
    pedidos: await duenio.order.count({ where: { tenantId: base.a.id } }),
    cobros: await duenio.collection.count({ where: { tenantId: base.a.id } }),
    stock: (await duenio.product.findUniqueOrThrow({ where: { id: matambre.id }, select: { stock: true } })).stock,
  });
  const antes = await foto();
  const ch = canales(c);

  const tienda = await ch.tienda(base.a, matambre.id);
  assert.match(tienda, /"Matambre al vacío" no está disponible/);
  assert.doesNotMatch(tienda, /L-VEN|Lotes y vencimientos/, "al cliente, sin el código ni la tarea del local");

  const api = await ch.api(base.a, matambre.id);
  assert.match(api, /^422 expired_product: "Matambre al vacío" no está disponible/);

  if (CON_CAJA) assert.match(await ch.caja(base.a, matambre.id), /No se puede vender "Matambre al vacío".*L-VEN/);

  const turno = await ch.turno(base.a, matambre.id);
  assert.match(turno.resultado, /No se puede vender "Matambre al vacío"/);
  const ap = await duenio.appointment.findUniqueOrThrow({ where: { id: turno.appointmentId }, select: { status: true } });
  assert.equal(ap.status, "CONFIRMED", "el turno no se terminó");

  assert.deepEqual(await foto(), antes, "ni pedido, ni cobro, ni stock");

  // El corte con un lote vigente se sigue vendiendo (la guarda frena el vencido, no al rubro).
  assert.equal(await ch.api(base.a, bife.id), "ok");
  if (CON_CAJA) assert.equal(await ch.caja(base.a, bife.id), "ok");
  assert.equal((await ch.turno(base.a, bife.id)).resultado, "ok");
});

test("3 · CH (beauty-spa) con la migración aplicada y un lote vencido: vende como siempre", async (t) => {
  const c = await preparar(t);
  if (!c) return;
  const { base, duenio } = c;
  const { todayInBusinessTz } = await import("@/lib/datetime");
  const hoy = todayInBusinessTz();
  const { opcionLotesVencidos } = await import("./schema-probe");
  assert.equal(await opcionLotesVencidos(base.b.id, hoy), null, "CH no vende perecederos: ni se arma");
  const crema = await corte(c, base.b.id, "Crema corporal");
  await cargarLote(c, base.b.id, base.b.duenia.id, crema.id, "L-CH", diaMas(hoy, -3));
  const ch = canales(c);
  assert.equal(await ch.api(base.b, crema.id), "ok");
  assert.equal((await ch.turno(base.b, crema.id)).resultado, "ok");
  assert.equal(await ch.tienda(base.b, crema.id), "ok");
  const { stock } = await duenio.product.findUniqueOrThrow({ where: { id: crema.id }, select: { stock: true } });
  assert.equal(stock, 47);
});
