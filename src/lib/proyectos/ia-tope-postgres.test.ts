// TOPE MENSUAL DE IA PAGA POR NEGOCIO (Etapa 2 de MIA · T4), contra una base migrada de verdad y con el
// rol de la app (`app_rls`, RLS aplicado). La API de Anthropic es un espía de `fetch`: ninguna llamada sale.
//
// (a) tope 0 → niega sin llamar · (b) carrera: tope para 3 llamadas, 20 a la vez → exactamente 3, gasto ≤ tope
// · (c) liquidar libera la diferencia · (d) sin tablas → paga negada, gratis sigue · (e) otro negocio no ve
// ni consume el tope (RLS) · (f) borde de mes de Buenos Aires · (g) GSG (`tenantId` null) no toca las tablas.

import { test } from "node:test";
import assert from "node:assert/strict";
import { prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio, ROL_APP } from "@/test/base-efimera";

const API = "https://api.anthropic.com/v1/messages";

test("tope de IA: niega sin llamar, aguanta la carrera, libera al liquidar, falla cerrado y aísla por negocio", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  prepararAccionesDeServidor();
  apuntarLaAppA(base);
  const env = process.env as Record<string, string | undefined>;
  const guardadas = Object.fromEntries(["ANTHROPIC_API_KEY", "CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_AI_TOKEN"].map((k) => [k, env[k]]));
  const fetchOriginal = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = fetchOriginal;
    for (const [k, v] of Object.entries(guardadas)) {
      if (v === undefined) delete env[k];
      else env[k] = v;
    }
  });
  const pago = () => {
    env.ANTHROPIC_API_KEY = "clave-de-prueba";
    delete env.CLOUDFLARE_ACCOUNT_ID;
    delete env.CLOUDFLARE_AI_TOKEN;
  };
  const gratis = () => {
    delete env.ANTHROPIC_API_KEY;
    env.CLOUDFLARE_ACCOUNT_ID = "cuenta-qa";
    env.CLOUDFLARE_AI_TOKEN = "token-qa";
  };

  // Espía: cuenta las llamadas a Anthropic y a Cloudflare. La respuesta paga trae `usage` igual al máximo
  // reservado (lo peor que puede pasar), así liquidar no libera nada y la carrera se mide limpia.
  const { costoMicroUsd, tokensEntradaMaximos, mesDeIA, SIN_TOPE_CARGADO, IA_ESPERA_ACTUALIZACION } = await import("./ia-tope-core");
  let pagas = 0;
  let gratuitas = 0;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url instanceof Request ? url.url : url);
    if (u === API) {
      pagas++;
      const cuerpo = JSON.parse(String(init?.body)) as { system: string; messages: { content: string }[]; max_tokens: number };
      await new Promise((ok) => setTimeout(ok, 30));
      const usage = { input_tokens: tokensEntradaMaximos({ sistema: cuerpo.system, mensajes: cuerpo.messages }), output_tokens: cuerpo.max_tokens };
      return Response.json({ model: "claude-opus-5-5", stop_reason: "end_turn", usage, content: [{ type: "text", text: "listo" }] });
    }
    if (u.startsWith("https://api.cloudflare.com/")) {
      gratuitas++;
      return Response.json({ success: true, result: { response: "gratis" } });
    }
    return fetchOriginal(url, init);
  }) as typeof fetch;

  const duenio = await prismaComoDuenio(base);
  const { a, b } = base;
  const ia = await import("./ia.server");
  const tope = await import("./ia-tope.server");
  const { tenantTransaction } = await import("@/lib/rls");

  const pedido = (tenantId: string | null) => ({ tenantId, sistema: "Sos un asistente.", mensajes: [{ role: "user" as const, content: "Hola" }], maxTokens: 1000 });
  const estimado = costoMicroUsd("claude-opus-5-5", tokensEntradaMaximos(pedido(null)), 1000)!;
  const consumo = (tenantId: string, mes: string) => duenio.iaConsumo.findUnique({ where: { tenantId_mes: { tenantId, mes } } });

  // (d) Sin las tablas: la paga se niega SIN llamar; la gratis sigue.
  await duenio.$executeRawUnsafe(`ALTER TABLE "IaConsumo" RENAME TO "IaConsumo_qa"`);
  tope.olvidarTablasIaParaTests();
  pago();
  assert.deepEqual(await ia.pedirAlModelo(pedido(a.id)), { ok: false, error: IA_ESPERA_ACTUALIZACION });
  assert.equal(pagas, 0, "(d) sin tablas no sale ninguna llamada paga");
  gratis();
  assert.equal((await ia.pedirAlModelo(pedido(a.id))).ok, true, "(d) la gratis sigue");
  assert.equal(gratuitas, 1);
  await duenio.$executeRawUnsafe(`ALTER TABLE "IaConsumo_qa" RENAME TO "IaConsumo"`);
  assert.equal(await tope.hayTablasIa(), true);

  // (g) GSG: sin tope y sin tocar las tablas.
  pago();
  assert.equal((await ia.pedirAlModelo(pedido(null))).ok, true, "(g) el operador llama aunque nadie tenga tope");
  assert.equal(pagas, 1);
  assert.equal(await duenio.iaConsumo.count(), 0, "(g) el gasto de GSG no se anota a ningún negocio");

  // (a) Sin tope cargado (= 0): niega sin llamar.
  assert.deepEqual(await ia.pedirAlModelo(pedido(a.id)), { ok: false, error: SIN_TOPE_CARGADO });
  assert.equal(pagas, 1, "(a) tope 0 → ninguna llamada");
  await tope.guardarTopeIA({ tenantId: a.id, topeMicroUsd: BigInt(0), operador: "qa" });
  assert.deepEqual(await ia.pedirAlModelo(pedido(a.id)), { ok: false, error: SIN_TOPE_CARGADO });
  assert.equal(pagas, 1, "(a) tope 0 explícito → ninguna llamada");

  // GSG carga un tope que alcanza para 3 llamadas y no para 4. Queda en la auditoría del negocio.
  const topeA = estimado * BigInt(4) - BigInt(1);
  assert.deepEqual(await tope.guardarTopeIA({ tenantId: a.id, topeMicroUsd: topeA, operador: "qa" }), { ok: true });
  assert.equal(await duenio.auditLog.count({ where: { tenantId: a.id, action: "ia_tope_mensual" } }), 2);

  // (b1) Carrera en la reserva: 20 a la vez sobre un mes limpio → exactamente 3.
  const enero = new Date("2026-01-15T12:00:00Z");
  const reservas = await Promise.all(Array.from({ length: 20 }, () => tope.reservarGastoIA(a.id, { modelo: "claude-opus-5-5", tokensEntrada: tokensEntradaMaximos(pedido(null)), maxTokens: 1000 }, enero)));
  const ok = reservas.filter((r) => r.ok);
  assert.equal(ok.length, 3, "(b) exactamente 3 reservas entran");
  for (const r of reservas.filter((r) => !r.ok)) assert.match((r as { error: string }).error, /Se alcanzó el tope de IA de este mes/);
  const c1 = await consumo(a.id, "2026-01");
  assert.equal(c1?.reservadoMicroUsd, estimado * BigInt(3));
  assert.ok(c1!.reservadoMicroUsd + c1!.gastadoMicroUsd <= topeA, "(b) nunca por encima del tope");
  assert.equal(c1?.llamadas, 3);

  // (c) Liquidar devuelve la diferencia: la que gastó la mitad deja lugar para otra.
  const [r1, r2, r3] = ok.map((r) => (r as { ok: true; reserva: import("./ia-tope.server").ReservaIA }).reserva);
  const cuarta = () => tope.reservarGastoIA(a.id, { modelo: "claude-opus-5-5", tokensEntrada: tokensEntradaMaximos(pedido(null)), maxTokens: 1000 }, enero);
  assert.equal((await cuarta()).ok, false, "(c) antes de liquidar, la cuarta no entra");
  await tope.liquidarGastoIA(r1, estimado / BigInt(2));
  const r4 = await cuarta();
  assert.equal(r4.ok, true, "(c) liberada la diferencia, la cuarta entra");
  for (const r of [r2, r3]) await tope.liquidarGastoIA(r, estimado);
  if (r4.ok) await tope.liquidarGastoIA(r4.reserva, BigInt(0));
  const c2 = await consumo(a.id, "2026-01");
  assert.equal(c2?.reservadoMicroUsd, BigInt(0), "(c) nada queda en vuelo");
  assert.equal(c2?.gastadoMicroUsd, estimado / BigInt(2) + estimado * BigInt(2));

  // (b2) La carrera por la ruta real (pedirAlModelo), en el mes en curso: 20 a la vez → 3 llamadas pagas.
  const antes = pagas;
  const respuestas = await Promise.all(Array.from({ length: 20 }, () => ia.pedirAlModelo(pedido(a.id))));
  assert.equal(respuestas.filter((r) => r.ok).length, 3);
  assert.equal(pagas - antes, 3, "(b) salieron exactamente 3 llamadas a la API");
  const mesActual = mesDeIA(new Date());
  const c3 = await consumo(a.id, mesActual);
  assert.equal(c3?.reservadoMicroUsd, BigInt(0));
  assert.equal(c3?.gastadoMicroUsd, estimado * BigInt(3));
  assert.ok(c3!.gastadoMicroUsd <= topeA, "(b) el gasto liquidado no pasa el tope");
  const visto = await tope.consumoDelMes(a.id);
  assert.equal(visto?.tope, topeA);
  assert.equal(visto?.gastado, estimado * BigInt(3));

  // La API rechaza (5xx): se devuelve la reserva y no se gasta nada.
  globalThis.fetch = (async () => new Response("caída", { status: 500 })) as typeof fetch;
  await tope.guardarTopeIA({ tenantId: a.id, topeMicroUsd: topeA + estimado, operador: "qa" });
  assert.equal((await ia.pedirAlModelo(pedido(a.id))).ok, false);
  const c4 = await consumo(a.id, mesActual);
  assert.equal(c4?.gastadoMicroUsd, estimado * BigInt(3), "un error de la API no se cobra");
  assert.equal(c4?.reservadoMicroUsd, BigInt(0));

  // (f) Borde de mes: reservada el 31/12/2025 a las 23:30 de Buenos Aires (ya 1/1/2026 en UTC), se liquida en diciembre.
  const borde = new Date("2026-01-01T02:30:00Z");
  const rb = await tope.reservarGastoIA(a.id, { modelo: "claude-opus-5-5", tokensEntrada: 100, maxTokens: 100 }, borde);
  assert.equal(rb.ok, true);
  if (rb.ok) {
    assert.equal(rb.reserva.mes, "2025-12");
    await tope.liquidarGastoIA(rb.reserva, BigInt(7));
  }
  assert.equal((await consumo(a.id, "2025-12"))?.gastadoMicroUsd, BigInt(7), "(f) cuenta en el mes de Argentina");
  assert.equal((await consumo(a.id, "2026-01"))?.gastadoMicroUsd, estimado / BigInt(2) + estimado * BigInt(2), "(f) enero no se toca");

  // Las gratis se cuentan (sin mirar el tope).
  gratis();
  globalThis.fetch = (async () => Response.json({ success: true, result: { response: "gratis" } })) as typeof fetch;
  assert.equal((await ia.pedirAlModelo(pedido(b.id))).ok, true);
  assert.equal((await consumo(b.id, mesActual))?.llamadasGratis, 1);

  // (e) El tope de A no le sirve a B ni B ve el consumo de A.
  pago();
  assert.deepEqual(await ia.pedirAlModelo(pedido(b.id)), { ok: false, error: SIN_TOPE_CARGADO }, "(e) B no usa el tope de A");
  assert.equal((await tope.consumoDelMes(b.id))?.gastado, BigInt(0));
  assert.equal(
    await tenantTransaction((tx) => tx.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM "IaConsumo" WHERE "tenantId" = ${a.id}`, { tenantId: b.id }).then((f) => Number(f[0].n)),
    0,
    "(e) en el contexto de B no se ven filas de A",
  );
  await assert.rejects(
    tenantTransaction((tx) => tx.$executeRaw`UPDATE "IaTope" SET "topeMensualMicroUsd" = 1 WHERE "tenantId" = ${a.id}`.then((n) => assert.equal(n, 0)).then(() => tx.$executeRaw`INSERT INTO "IaTope" ("tenantId", "updatedAt") VALUES (${a.id}, now())`), { tenantId: b.id }),
    "(e) B no puede escribir el tope de A",
  );
  assert.equal((await duenio.iaTope.findUnique({ where: { tenantId: a.id } }))?.topeMensualMicroUsd, topeA + estimado);

  // Con el rol de la app y sin pasar por el código: las políticas aplican en las dos tablas.
  const pg = (await import("pg")).default;
  const verComo = async (tenantId: string, tabla: string) => {
    const c = new pg.Client({ connectionString: base.urlApp });
    await c.connect();
    try {
      await c.query("BEGIN");
      await c.query(`SET LOCAL ROLE ${ROL_APP}`);
      await c.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);
      const f = await c.query<{ n: string }>(`SELECT count(*) AS n FROM "${tabla}" WHERE "tenantId" = $1`, [a.id]);
      await c.query("ROLLBACK");
      return Number(f.rows[0].n);
    } finally {
      await c.end();
    }
  };
  assert.ok((await verComo(a.id, "IaConsumo")) > 0);
  assert.equal(await verComo(b.id, "IaConsumo"), 0);
  assert.equal(await verComo(a.id, "IaTope"), 1);
  assert.equal(await verComo(b.id, "IaTope"), 0);
});
