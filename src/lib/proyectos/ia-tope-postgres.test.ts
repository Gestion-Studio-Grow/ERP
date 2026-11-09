// TOPE MENSUAL DE IA PAGA POR NEGOCIO (Etapa 2 de MIA · T4), contra una base migrada de verdad y con el
// rol de la app (`app_rls`, RLS aplicado). La API de Anthropic es un espía de `fetch`: ninguna llamada sale.
//
// (a) tope 0 → niega sin llamar · (b) carrera: tope para 3 llamadas, 20 a la vez → exactamente 3, gasto ≤ tope
// · (c) liquidar libera la diferencia · (d) sin tablas → paga negada, gratis sigue · (e) otro negocio no ve
// ni consume el tope (RLS) · (f) borde de mes de Buenos Aires · (g) GSG (`tenantId` null) no toca las tablas
// · (h) `usage` ilegible liquida el estimado · (i) sin respaldo de modelo en lo pago de un negocio; otro modelo
// se liquida al máximo de la tabla · (j) `app_rls` no escribe ni borra `IaTope` ni borra `IaConsumo`.
//
// La consola (`OPERATOR_DATABASE_URL`) va con el rol DUEÑO: con `app_rls` no puede fijar el tope (la migración
// le deja sólo SELECT). En producción hace falta un rol de consola con ese permiso: decisión del dueño.

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
  env.OPERATOR_DATABASE_URL = base.urlDuenio;
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
  const { costoMicroUsd, tokensEntradaMaximos, mesDeIA, precioMaximo, SIN_TOPE_CARGADO, IA_ESPERA_ACTUALIZACION } = await import("./ia-tope-core");
  let pagas = 0;
  let gratuitas = 0;
  let ultimoPago: { cuerpo: Record<string, unknown>; headers: Record<string, string> } | null = null;
  let respuestaPaga: ((maximo: { input_tokens: number; output_tokens: number }) => Record<string, unknown>) | null = null;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url instanceof Request ? url.url : url);
    if (u === API) {
      pagas++;
      const cuerpo = JSON.parse(String(init?.body)) as { system: string; messages: { content: string }[]; max_tokens: number };
      ultimoPago = { cuerpo, headers: { ...(init?.headers as Record<string, string>) } };
      await new Promise((ok) => setTimeout(ok, 30));
      const usage = { input_tokens: tokensEntradaMaximos({ sistema: cuerpo.system, mensajes: cuerpo.messages }), output_tokens: cuerpo.max_tokens };
      if (respuestaPaga) return Response.json(respuestaPaga(usage));
      return Response.json({ model: "claude-opus-5-5", stop_reason: "end_turn", usage, content: [{ type: "text", text: "listo" }] });
    }
    if (u.startsWith("https://api.cloudflare.com/")) {
      gratuitas++;
      return Response.json({ success: true, result: { response: "gratis" } });
    }
    return fetchOriginal(url, init);
  }) as typeof fetch;
  const espia = globalThis.fetch;

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
  assert.equal(ultimoPago!.cuerpo.fallbacks, "default", "(i) el gasto de GSG sí usa el respaldo de modelo");

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

  // (h) y (i) por la ruta real, en el mes en curso, con lugar de sobra.
  globalThis.fetch = espia;
  pago();
  await tope.guardarTopeIA({ tenantId: a.id, topeMicroUsd: estimado * BigInt(100), operador: "qa" });
  const gastadoAhora = async () => (await consumo(a.id, mesActual))!.gastadoMicroUsd;
  const texto = { stop_reason: "end_turn", content: [{ type: "text", text: "listo" }] };
  for (const [nombre, usage] of [
    ["usage ausente", undefined],
    ["usage vacío", {}],
    ["negativo y en texto", { input_tokens: -100, output_tokens: "999" }],
    ["decimal", { input_tokens: 10.5, output_tokens: 3 }],
  ] as const) {
    respuestaPaga = () => ({ model: "claude-opus-5-5", ...texto, ...(usage !== undefined && { usage }) });
    const g0 = await gastadoAhora();
    assert.equal((await ia.pedirAlModelo(pedido(a.id))).ok, true, nombre);
    assert.equal((await gastadoAhora()) - g0, estimado, `(h) ${nombre}: se liquida el estimado, no 0`);
  }
  assert.equal(ultimoPago!.cuerpo.fallbacks, undefined, "(i) lo pago de un negocio sale sin respaldo de modelo");
  assert.equal(ultimoPago!.headers["anthropic-beta"], undefined, "(i) ni con el beta del respaldo");
  respuestaPaga = () => ({ model: "claude-otro-modelo-caro", ...texto, usage: { input_tokens: 10, output_tokens: 1000 } });
  const g1 = await gastadoAhora();
  assert.equal((await ia.pedirAlModelo(pedido(a.id))).ok, true);
  const max = precioMaximo();
  const alMaximo = (BigInt(10) * max.entrada + BigInt(1000) * max.salida + BigInt(999_999)) / BigInt(1_000_000);
  assert.equal((await gastadoAhora()) - g1, alMaximo, "(i) otro modelo se liquida al máximo de la tabla");
  // Saturada sin respaldo: 529 → el error de saturación, y no se cobra.
  respuestaPaga = null;
  globalThis.fetch = (async () => new Response("overloaded", { status: 529 })) as typeof fetch;
  const g2 = await gastadoAhora();
  assert.deepEqual(await ia.pedirAlModelo(pedido(a.id)), { ok: false, error: "La IA está saturada en este momento. Probá en unos minutos." });
  assert.equal(await gastadoAhora(), g2, "(i) la saturación no se cobra");
  assert.equal((await consumo(a.id, mesActual))!.reservadoMicroUsd, BigInt(0));
  globalThis.fetch = espia;

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

  // (j) Parado en SU negocio, `app_rls` no sube su tope, no lo borra ni lo crea, y no borra su consumo.
  // Cada intento en su propia transacción: el primer error aborta la que lo contiene.
  const comoApp = async (tenantId: string, sql: string, params: unknown[] = []): Promise<{ filas: number } | { error: string }> => {
    const c = new pg.Client({ connectionString: base.urlApp });
    await c.connect();
    try {
      await c.query("BEGIN");
      await c.query(`SET LOCAL ROLE ${ROL_APP}`);
      await c.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);
      const r = await c.query(sql, params);
      await c.query("COMMIT");
      return { filas: r.rowCount ?? 0 };
    } catch (e) {
      await c.query("ROLLBACK").catch(() => {});
      return { error: (e as Error).message };
    } finally {
      await c.end();
    }
  };
  const negado = (r: { filas: number } | { error: string }, que: string) =>
    assert.ok("error" in r ? /permission denied/i.test(r.error) : r.filas === 0, `(j) ${que}: ${JSON.stringify(r)}`);
  negado(await comoApp(a.id, `UPDATE "IaTope" SET "topeMensualMicroUsd" = 999999999999 WHERE "tenantId" = $1`, [a.id]), "UPDATE IaTope");
  negado(await comoApp(a.id, `DELETE FROM "IaTope" WHERE "tenantId" = $1`, [a.id]), "DELETE IaTope");
  negado(await comoApp(b.id, `INSERT INTO "IaTope" ("tenantId", "topeMensualMicroUsd", "updatedAt") VALUES ($1, 999999999999, now())`, [b.id]), "INSERT IaTope");
  negado(await comoApp(a.id, `DELETE FROM "IaConsumo" WHERE "tenantId" = $1`, [a.id]), "DELETE IaConsumo");
  assert.equal((await duenio.iaTope.findUnique({ where: { tenantId: a.id } }))?.topeMensualMicroUsd, estimado * BigInt(100), "(j) el tope de A sigue igual");
  assert.equal(await duenio.iaTope.findUnique({ where: { tenantId: b.id } }), null, "(j) B no se creó un tope");
  assert.ok((await duenio.iaConsumo.count({ where: { tenantId: a.id } })) > 0, "(j) el consumo de A sigue");
  // Lo que la app SÍ necesita sigue andando: leer el tope y escribir el consumo.
  assert.deepEqual(await comoApp(a.id, `SELECT 1 FROM "IaTope" WHERE "tenantId" = $1`, [a.id]), { filas: 1 });
  assert.ok("filas" in (await comoApp(a.id, `UPDATE "IaConsumo" SET "llamadas" = "llamadas" WHERE "tenantId" = $1`, [a.id])));
});
