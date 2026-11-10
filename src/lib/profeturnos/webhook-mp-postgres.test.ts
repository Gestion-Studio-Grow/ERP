// ============================================================================
// PROFETURNOS T2 · Webhook del abono + traba del plan + enganche de trámites — contra Postgres
// ============================================================================
//  · Fail-closed (sin secreto 503), firma mala / ts viejo / id no firmado (401): nada escrito.
//  · El pago se RE-LEE en MP (transporte falso): monto distinto, moneda, referencia trucha, negocio
//    inexistente o ajeno (no profe-padel) → 200 ignorado, nada escrito.
//  · El mismo pago 6 veces EN PARALELO: una sola fila de pago y una sola extensión.
//  · Vencido: agendar (server action real) se rechaza; el turnero no toma pedidos. Pagado: anda.
//  · Baja con sesión conserva la vigencia; arrepentimiento dentro de 10 días → vencido + devolución
//    a mano (una por pago, sin duplicar). Sin fila de alta: «libre», nunca se traba.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { buildManifest } from "@/plugins/mercadopago/signature";
import type { HttpTransport } from "@/plugins/mercadopago/http";
import { PRECIO_MENSUAL } from "./planes";
import { sumarUnMes } from "./plan-core";

const SECRETO = "secreto-de-prueba";

function aviso(id: string, o: { secreto?: string; tsMs?: number; idCuerpo?: string } = {}): Request {
  const ts = String(Math.floor((o.tsMs ?? Date.now()) / 1000));
  const v1 = createHmac("sha256", o.secreto ?? SECRETO).update(buildManifest(id, "req-1", ts)).digest("hex");
  return new Request(`https://x.test/api/webhooks/profeturnos-mp?data.id=${id}&type=payment`, {
    method: "POST",
    headers: { "x-signature": `ts=${ts},v1=${v1}`, "x-request-id": "req-1", "content-type": "application/json" },
    body: JSON.stringify({ type: "payment", action: "payment.updated", data: { id: o.idCuerpo ?? id } }),
  });
}

test("webhook de ProfeTurnos: firma, re-lectura, exigencias, idempotencia en paralelo, traba y trámites", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const A = base.a.id;
  const B = base.b.id;
  await duenio.tenant.update({ where: { id: B }, data: { blueprintId: "profe-padel" } });
  // Alta web de hace 30 días: la prueba (14) ya venció.
  await duenio.auditLog.create({
    data: { tenantId: B, actor: "web:alta-profeturnos", action: "profeturnos.alta", entity: "Tenant", entityId: B, changes: {}, createdAt: new Date(Date.now() - 30 * 86_400_000) },
  });

  const { atenderAvisoProfeturnos } = await import("./webhook-mp.server");
  const { exigirPlanVigente, leerPlan, turneroTomaPedidos } = await import("./plan.server");
  const { leerPagoDeMp } = await import("./cobro-mp");
  const { registrarTramiteProfeturnos } = await import("./tramites.server");
  const profe = await import("@/lib/padel/acciones");
  const { todayInBusinessTz } = await import("@/lib/datetime");
  const hoy = todayInBusinessTz();

  // MP falso: los pagos que «existen» en la cuenta de GSG.
  const pagos: Record<string, object> = {};
  const pago = (id: string, o: Partial<{ status: string; currency_id: string; transaction_amount: number; external_reference: string }> = {}) => {
    pagos[id] = { id: Number(id), status: "approved", currency_id: "ARS", transaction_amount: PRECIO_MENSUAL, external_reference: `pt:${B}:mensual:n${id}`, ...o };
  };
  let lecturas = 0;
  const transporte: HttpTransport = {
    get: async (url, headers) => {
      lecturas++;
      assert.equal(headers.Authorization, "Bearer tok-gsg");
      const id = url.split("/").pop() as string;
      return pagos[id] ? { status: 200, body: JSON.stringify(pagos[id]) } : { status: 404, body: '{"message":"not found"}' };
    },
  };
  const deps = (env: Record<string, string | undefined> = { MP_WEBHOOK_SECRET: SECRETO, MP_ACCES_TOKEN: "tok-gsg" }) => ({
    env,
    ahoraMs: () => Date.now(),
    leerPago: (id: string, token: string) => leerPagoDeMp(id, token, { transport: transporte }),
  });
  const filas = (tenantId: string, action: string) => duenio.auditLog.findMany({ where: { tenantId, action }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  const status = async (r: Promise<Response>) => {
    const x = await r;
    return { status: x.status, cuerpo: (await x.json()) as Record<string, unknown> };
  };

  // ── Vencido: el panel no agenda y el turnero no toma pedidos; leer sigue andando.
  assert.equal((await leerPlan(B)).estado, "vencido");
  assert.equal((await exigirPlanVigente(B)).ok, false);
  assert.equal(await turneroTomaPedidos(B), false);
  const fd = new FormData();
  fd.set("fecha", hoy);
  fd.set("hora", "10:00");
  const trabado = await ejecutarAccion({ negocio: base.b, usuario: base.b.duenia }, () => profe.agendarClase(fd));
  assert.equal(trabado.tipo, "respuesta");
  const rt = (trabado as { valor: { ok: boolean; error?: string } }).valor;
  assert.equal(rt.ok, false);
  assert.match(rt.error ?? "", /Mi plan/);
  // Sin fila de alta (A): libre, no se traba.
  assert.equal((await leerPlan(A)).estado, "libre");
  assert.equal((await exigirPlanVigente(A)).ok, true);

  // ── Fail-closed y firma: nada escrito.
  pago("1001");
  assert.equal((await status(atenderAvisoProfeturnos(aviso("1001"), deps({ MP_ACCES_TOKEN: "tok-gsg" })))).status, 503);
  assert.equal((await status(atenderAvisoProfeturnos(aviso("1001"), deps({ MP_WEBHOOK_SECRET: SECRETO })))).status, 503);
  assert.equal((await status(atenderAvisoProfeturnos(aviso("1001", { secreto: "otro" }), deps()))).status, 401);
  assert.equal((await status(atenderAvisoProfeturnos(aviso("1001", { tsMs: Date.now() - 10 * 60_000 }), deps()))).status, 401);
  assert.equal((await status(atenderAvisoProfeturnos(aviso("1001", { idCuerpo: "9999" }), deps()))).status, 401);
  assert.equal(lecturas, 0, "sin firma válida no se consulta MP");
  assert.equal((await filas(B, "profeturnos.pago")).length, 0);

  // ── Exigencias sobre el pago RE-LEÍDO.
  pago("2001", { transaction_amount: PRECIO_MENSUAL - 1 });
  pago("2002", { currency_id: "USD" });
  pago("2003", { external_reference: `pt:${B}:anual:x` });
  pago("2004", { external_reference: "pt:noexiste123:mensual:x" });
  pago("2005", { external_reference: `pt:${A}:mensual:x` });
  pago("2006", { status: "pending" });
  const esperado: Record<string, string> = { "2001": "monto", "2002": "moneda", "2003": "referencia", "2004": "tenant-inexistente", "2005": "tenant-ajeno", "2006": "no-aprobado" };
  for (const [id, motivo] of Object.entries(esperado)) {
    const r = await status(atenderAvisoProfeturnos(aviso(id), deps()));
    assert.equal(r.status, 200, id);
    assert.equal(r.cuerpo.ignorado, motivo, id);
  }
  // Un pago que MP no tiene: 502 (MP reintenta), nada escrito.
  assert.equal((await status(atenderAvisoProfeturnos(aviso("7777"), deps()))).status, 502);
  assert.equal(await duenio.auditLog.count({ where: { action: { in: ["profeturnos.pago", "profeturnos.plan"] } } }), 0);

  // ── El mismo pago 6 veces en paralelo: una sola acreditación.
  const rs = await Promise.all(Array.from({ length: 6 }, () => status(atenderAvisoProfeturnos(aviso("1001"), deps()))));
  assert.ok(rs.every((r) => r.status === 200), JSON.stringify(rs));
  assert.equal(rs.filter((r) => r.cuerpo.acreditado).length, 1);
  assert.equal(rs.filter((r) => r.cuerpo.repetido).length, 5);
  const p1 = await filas(B, "profeturnos.pago");
  assert.equal(p1.length, 1);
  assert.equal(p1[0].entityId, "1001");
  const plan1 = await filas(B, "profeturnos.plan");
  assert.equal(plan1.length, 1);
  const v1 = sumarUnMes(hoy);
  assert.equal((plan1[0].changes as { vigenciaHasta: string }).vigenciaHasta, v1);
  assert.equal((await leerPlan(B)).estado, "activo");
  assert.equal((await exigirPlanVigente(B)).ok, true);
  assert.equal(await turneroTomaPedidos(B), true);

  // Otro pago: se suma al final.
  pago("1002");
  assert.equal((await status(atenderAvisoProfeturnos(aviso("1002"), deps()))).cuerpo.acreditado, true);
  const v2 = sumarUnMes(v1);
  assert.equal((await leerPlan(B)).fila.vigenciaHasta, v2);

  // ── Baja con sesión: conserva lo pagado.
  const datos = { email: base.b.duenia.email, usuario: "profe-b", motivo: "" };
  const baja = await registrarTramiteProfeturnos("baja", "BAJ-20261110-T2001", datos, { tenantId: B, userId: base.b.duenia.id });
  assert.equal(baja.efecto, "registrado");
  const trasBaja = await leerPlan(B);
  assert.equal(trasBaja.estado, "activo");
  assert.equal(trasBaja.baja, true);
  assert.equal(trasBaja.fila.vigenciaHasta, v2);

  // ── Arrepentimiento (pagos de hoy, dentro de 10 días): vencido + una devolución por pago.
  const arr = await registrarTramiteProfeturnos("arrepentimiento", "ARR-20261110-T2002", datos, { tenantId: B, userId: base.b.duenia.id });
  assert.equal(arr.efecto, "plan_a_gratis");
  assert.equal((await leerPlan(B)).estado, "vencido");
  const dev = await filas(B, "profeturnos.devolucion");
  assert.deepEqual(dev.map((d) => d.entityId).sort(), ["1001", "1002"]);
  // Repetido: no duplica la devolución.
  const arr2 = await registrarTramiteProfeturnos("arrepentimiento", "ARR-20261110-T2003", datos, { tenantId: B, userId: base.b.duenia.id });
  assert.equal(arr2.efecto, "ya_era_gratis");
  assert.equal((await filas(B, "profeturnos.devolucion")).length, 2);
  // Nada se borró: los pagos siguen.
  assert.equal((await filas(B, "profeturnos.pago")).length, 2);

  // Un pago nuevo después del arrepentimiento arranca de hoy.
  pago("1003");
  assert.equal((await status(atenderAvisoProfeturnos(aviso("1003"), deps()))).cuerpo.acreditado, true);
  assert.equal((await leerPlan(B)).fila.vigenciaHasta, v1);

  // ── Aislamiento: nada de ProfeTurnos en A.
  assert.equal(await duenio.auditLog.count({ where: { tenantId: A, action: { startsWith: "profeturnos." } } }), 0);
});
