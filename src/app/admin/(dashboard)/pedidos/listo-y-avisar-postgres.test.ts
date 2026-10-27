// ============================================================================
// «LISTO Y AVISAR» contra Postgres efímero — tanda perf (P-4)
// ============================================================================
//
// La acción REAL (`listoYAvisar`) con la sesión de la dueña, el rol de la app (app_rls) y RLS:
// guarda lo pesado, pasa el pedido de Nuevo a Listo paso a paso, devuelve el WhatsApp con el
// total GRABADO y deja las mismas filas de auditoría que antes (original, ajuste, cada paso y la
// constancia «pedido-listo»). Y lo que cuesta: las sentencias que salen a Postgres se cuentan en
// el `query` de pg (lo mismo que registra `log_statement`), con la meta ≤ 120 (antes 271), y sin
// `revalidatePath` (la respuesta no vuelve a dibujar Armar: la pantalla navega a la bandeja).
//
// Base efímera propia (src/test/base-efimera.ts); sin Postgres local, se saltea y lo dice.

import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor, type SalidaDeAccion } from "@/test/accion-de-servidor";

// El contador va en el prototipo ANTES de que la app abra conexiones: cada mensaje a Postgres
// (el BEGIN plegado con el set_config del negocio cuenta como uno, igual que en el log).
let sentencias = 0;
const queryOriginal = pg.Client.prototype.query;
pg.Client.prototype.query = function (this: pg.Client, ...args: unknown[]) {
  sentencias++;
  return (queryOriginal as (...a: unknown[]) => unknown).apply(this, args);
} as typeof pg.Client.prototype.query;

const laBase = baseEfimeraDelArchivo();

function valor<T>(s: SalidaDeAccion<T>): T {
  assert.equal(s.tipo, "respuesta", JSON.stringify(s));
  return (s as { valor: T }).valor;
}

test("«Listo y avisar»: pesa, pasa a Listo, avisa con el total grabado y deja las 5 filas, en ≤ 120 sentencias y sin re-dibujar Armar", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  await duenio.tenant.update({ where: { id: base.a.id }, data: { blueprintId: "carniceria", modules: ["pos", "catalog", "clients"] } });
  const { listoYAvisar } = await import("./[code]/armar/acciones");

  const vacio = await duenio.product.create({
    data: { tenantId: base.a.id, name: "Vacío", saleUnit: "WEIGHT", pricePerKg: 20000, unit: "kg", trackStock: false },
  });
  const pedido = (code: number, status: "PENDING" | "DELIVERED") =>
    duenio.order.create({
      data: {
        tenantId: base.a.id,
        code,
        status,
        channel: "ONLINE",
        fulfillment: "PICKUP",
        customerName: "Ana UAT",
        customerPhone: "11 5555 1234",
        subtotal: 20000,
        total: 20000,
        items: { create: [{ tenantId: base.a.id, productId: vacio.id, name: "Vacío", saleUnit: "WEIGHT", quantity: 1, unitPrice: 20000, lineTotal: 20000 }] },
      },
      select: { id: true, code: true },
    });
  const duenaA = { negocio: base.a, usuario: base.a.duenia };
  const formulario = (id: string, peso: string | null) => {
    const fd = new FormData();
    fd.set("id", id);
    if (peso !== null) {
      fd.append("productId", vacio.id);
      fd.append("quantity", peso);
    }
    return fd;
  };

  // Calentar la app (módulos, pool, sesión) con un pedido aparte, para contar sólo la acción.
  const calentar = await pedido(8100, "PENDING");
  assert.equal(valor(await ejecutarAccion(duenaA, () => listoYAvisar(formulario(calentar.id, null)))).ok, true);

  const nuevo = await pedido(8101, "PENDING");
  sentencias = 0;
  const salida = await ejecutarAccion(duenaA, () => listoYAvisar(formulario(nuevo.id, "1,25")));
  const costo = sentencias;
  const r = valor(salida);
  t.diagnostic(`«Listo y avisar» con pesada: ${costo} sentencias`);
  assert.ok(r.ok, JSON.stringify(r));
  assert.ok(costo <= 120, `«Listo y avisar» manda ${costo} sentencias (meta ≤ 120; antes 271)`);
  assert.deepEqual(salida.revalidadas, [], "sin revalidatePath: la respuesta no vuelve a dibujar Armar");
  assert.match(r.ok ? r.wa : "", /^https:\/\/wa\.me\//);
  assert.match(decodeURIComponent(r.ok ? r.wa : ""), /25\.000/, "el total grabado (1,25 kg × $20.000)");

  const o = await duenio.order.findUniqueOrThrow({ where: { id: nuevo.id }, select: { status: true, total: true, items: { select: { quantity: true } } } });
  assert.equal(o.status, "READY");
  assert.equal(Number(o.total), 25000);
  assert.equal(Number(o.items[0].quantity), 1.25);
  const filas = await duenio.auditLog.findMany({
    where: { tenantId: base.a.id, entity: "Order", entityId: nuevo.id },
    select: { action: true, changes: true, actor: true, channel: true },
  });
  const resumen = filas.map((f) => {
    const c = f.changes as Record<string, unknown>;
    return f.action === "update" && c.status ? `status:${(c.status as { to: string }).to}` : f.action === "update" ? "ajuste" : f.action === "whatsapp" ? `whatsapp:${c.tipo}` : f.action;
  });
  assert.deepEqual(resumen.sort(), ["ajuste", "pedido-original", "status:PREPARING", "status:READY", "whatsapp:pedido-listo"]);
  assert.ok(filas.every((f) => f.actor === `user:${base.a.duenia.id}` && f.channel === "admin"), "firmadas por la dueña, como auditAdmin");
  const original = filas.find((f) => f.action === "pedido-original")!.changes as { lineas: { quantity: number }[]; total: number };
  assert.equal(original.lineas[0].quantity, 1, "lo que pidió la clienta, antes del ajuste");
  assert.equal(original.total, 20000);

  // Un pedido ya entregado no se arma: no toca nada y lo dice.
  const entregado = await pedido(8102, "DELIVERED");
  const r2 = valor(await ejecutarAccion(duenaA, () => listoYAvisar(formulario(entregado.id, null))));
  assert.deepEqual(r2, { ok: false, error: "Este pedido ya no está para armar: volvé a la bandeja." });
  assert.equal(await duenio.auditLog.count({ where: { entityId: entregado.id } }), 0);

  // Otro negocio no ve el pedido de A.
  const duenaB = { negocio: base.b, usuario: base.b.duenia };
  const r3 = valor(await ejecutarAccion(duenaB, () => listoYAvisar(formulario(calentar.id, null))));
  assert.deepEqual(r3, { ok: false, error: "No se encontró el pedido. Volvé a la bandeja." });
});
