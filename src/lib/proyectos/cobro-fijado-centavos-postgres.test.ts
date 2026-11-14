// ============================================================================
// D13 en centavos (GSG-MIA-009) contra Postgres (base efímera migrada, app con app_rls + RLS) y las Server Actions REALES:
//   (a) sin el SQL pendiente: el cobro entra sin D13 y la sonda dice que no;
//   (b) con `prisma/pending-gate2/D13_cobro_fijado.sql` aplicado (dos veces: idempotente): tipos BIGINT y NUMERIC(18,6);
//       R8 en JS = `round(p::numeric / tc, 2)` de Postgres en un barrido (mulberry32, semilla fija); el cobro guarda el
//       tc exacto y los centavos; un tc con más de 6 decimales deja el cobro sin fijar;
//   (c) doble envío de «Marcar cobrado» → 1 cobro y 1 asiento;
//   (d) dos cobros a la vez por exactamente el saldo → entra uno;
//   (e) 8 cobros y 1 cambio de moneda a la vez → nunca quedan cobros en una moneda distinta de la del proyecto;
//   (f) el trigger «lo contabilizado no se edita»: rechaza cambiar el monto, re-fijar, des-anular y fijar un anulado;
//       deja la nota y la anulación de la app;
//   (g) la vuelta atrás del pie deja la tabla como antes, y el SQL se puede volver a aplicar.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type BaseEfimera } from "@/test/base-efimera";
import { aplicarD13, correrComoDuenio, fijadoDe, vueltaAtrasD13 } from "@/test/cobro-fijado-gate2";
import { monedaCentavosDePesos, textoDeMicro } from "@/lib/dinero/redondeo";

const laBase = baseEfimeraDelArchivo();
const DIA = 86_400_000;
const AHORA = Date.parse("2026-11-10T12:00:00Z");

function mulberry32(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
}
const entre1Y = (azar: () => number, tope: bigint) => (((BigInt(azar()) << BigInt(32)) | BigInt(azar())) % tope) + BigInt(1);
const textoDeCentavos = (c: bigint) => `${c / BigInt(100)}.${String(c % BigInt(100)).padStart(2, "0")}`;

let entorno: Awaited<ReturnType<typeof preparar>> | undefined;
async function preparar(base: BaseEfimera) {
  apuntarLaAppA(base);
  Object.assign(process.env as Record<string, string | undefined>, { DB_CONNECTION_LIMIT: "12", DB_CONNECT_TIMEOUT_MS: "5000", PROYECTOS_COBRO_FIJADO: "on" });
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const { a } = base;
  const t0 = await duenio.tenant.findUniqueOrThrow({ where: { id: a.id }, select: { modules: true } });
  await duenio.tenant.update({ where: { id: a.id }, data: { modules: [...new Set([...t0.modules, "proyectos"])] } });
  await duenio.proyectoTipoCambio.create({ data: { tenantId: a.id, moneda: "USD", porUnidad: 1000 } });
  const acciones = await import("./acciones");
  const ficha = await import("./acciones-ficha");
  const cobranza = await import("./cobranza.server");
  let numero = 700;
  /** Proyecto de A; con `precio`, presupuesto aprobado por precio + IVA 21 % vendido a 1.000. */
  const proyecto = async (moneda: string, precio?: number) => {
    const p = await duenio.proyecto.create({ data: { tenantId: a.id, numero: ++numero, clientId: a.clientes[0], nombre: `Stand ${numero}`, servicio: "ARQUITECTURA", etapa: "APROBADO", moneda }, select: { id: true } });
    if (precio !== undefined) {
      const pres = await duenio.proyectoPresupuesto.create({ data: { tenantId: a.id, proyectoId: p.id, version: 1, estado: "APROBADO", token: `tok-${p.id}`, ivaPct: 21, tcVenta: 1000 } });
      await duenio.proyectoItem.create({ data: { tenantId: a.id, presupuestoId: pres.id, rubro: "General", descripcion: "Stand", cantidad: 1, precio } });
    }
    return p.id;
  };
  const form = (campos: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(campos)) fd.set(k, v);
    return fd;
  };
  const enSesion = async <R>(fn: () => Promise<R>): Promise<R> => {
    const r = await ejecutarAccion({ negocio: a, usuario: { id: a.duenia.id } }, fn);
    assert.equal(r.tipo, "respuesta", JSON.stringify(r));
    return (r as { valor: R }).valor;
  };
  const cobrar = (proyectoId: string, monto: string) => enSesion(() => acciones.registrarCobro(form({ proyectoId, medio: "EFECTIVO", monto })));
  const ultimoCobro = async (proyectoId: string) => (await duenio.proyectoPago.findFirstOrThrow({ where: { tenantId: a.id, proyectoId }, orderBy: { createdAt: "desc" }, select: { id: true, monto: true } }));
  return { base, duenio, a, acciones, ficha, cobranza, proyecto, form, enSesion, cobrar, ultimoCobro };
}
async function entornoDe(t: import("node:test").TestContext) {
  const base = await laBase(t);
  if (!base) return null;
  entorno ??= await preparar(base);
  return entorno;
}

test("(a) sin el SQL pendiente: la sonda dice que no y el cobro entra sin D13", async (t) => {
  const e = await entornoDe(t);
  if (!e) return;
  assert.equal(await e.cobranza.hayColumnasCobroFijado(), false);
  const p = await e.proyecto("USD");
  assert.deepEqual(await e.cobrar(p, "30000"), { ok: true });
  assert.equal((await e.ultimoCobro(p)).monto, 30000);
  const cols = await e.duenio.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = 'ProyectoPago' AND column_name IN ('cuotaId', 'moneda', 'montoMonedaCentavos', 'tipoCambio', 'montoMoneda')`;
  assert.equal(cols[0].n, 0);
});

test("(b) con el SQL aplicado dos veces: tipos exactos, R8 = round(numeric) de Postgres y el cobro guarda centavos y tc exacto", async (t) => {
  const e = await entornoDe(t);
  if (!e) return;
  aplicarD13(e.base);
  aplicarD13(e.base); // idempotente
  e.cobranza.olvidarColumnasCobroFijadoParaTests();
  assert.equal(await e.cobranza.hayColumnasCobroFijado(), true);
  const tipos = await e.duenio.$queryRaw<{ column_name: string; data_type: string; numeric_precision: number | null; numeric_scale: number | null; is_nullable: string }[]>`
    SELECT column_name, data_type, numeric_precision, numeric_scale, is_nullable FROM information_schema.columns
    WHERE table_name = 'ProyectoPago' AND column_name IN ('cuotaId', 'moneda', 'montoMonedaCentavos', 'tipoCambio') ORDER BY column_name`;
  assert.deepEqual(
    tipos.map((c) => [c.column_name, c.data_type, c.numeric_precision, c.numeric_scale, c.is_nullable]),
    [
      ["cuotaId", "text", null, null, "YES"],
      ["moneda", "text", null, null, "YES"],
      ["montoMonedaCentavos", "bigint", 64, 0, "YES"],
      ["tipoCambio", "numeric", 18, 6, "YES"],
    ],
  );

  // Barrido: la misma semilla, R8 contra `round(p::numeric / tc, 2)` (escala alta para que Postgres no redondee antes).
  const azar = mulberry32(0x0d13_5eed);
  const ps: string[] = [];
  const tcs: string[] = [];
  const esperado: string[] = [];
  for (let i = 0; i < 4000; i++) {
    let p = entre1Y(azar, BigInt(1_000_000_000_000));
    let tc = entre1Y(azar, BigInt("999999999999999999"));
    if (i % 4 === 0) {
      // Empate exacto (medio centavo): tc par y p armado para caer justo en la mitad.
      const k = entre1Y(azar, BigInt(1_000_000));
      tc = BigInt(2_000_000) * k;
      p = (BigInt(2) * (entre1Y(azar, BigInt(1_000_000)) - BigInt(1)) + BigInt(1)) * k;
    }
    ps.push(textoDeCentavos(p));
    tcs.push(textoDeMicro(tc));
    esperado.push(String(monedaCentavosDePesos(p, tc)));
  }
  const pg = await e.duenio.$queryRaw<{ q: string }[]>`
    SELECT (round(x.p::numeric(60,30) / x.tc::numeric(18,6)::numeric(60,30), 2) * 100)::bigint::text AS q
    FROM unnest(${ps}::text[], ${tcs}::text[]) WITH ORDINALITY AS x(p, tc, i) ORDER BY x.i`;
  assert.equal(pg.length, esperado.length);
  for (let i = 0; i < esperado.length; i++) assert.equal(pg[i].q, esperado[i], `p=${ps[i]} tc=${tcs[i]}`);

  // El cobro a mano en USD a 1.234,5678: guarda los centavos de R8 y el tc exacto, sin cuota.
  await e.duenio.proyectoTipoCambio.update({ where: { tenantId_moneda: { tenantId: e.a.id, moneda: "USD" } }, data: { porUnidad: 1234.5678 } });
  const p = await e.proyecto("USD");
  assert.deepEqual(await e.cobrar(p, "100000"), { ok: true });
  const cobro = await e.ultimoCobro(p);
  assert.deepEqual(await fijadoDe(e.duenio, cobro.id), { cuotaId: null, moneda: "USD", centavos: String(monedaCentavosDePesos(BigInt(10_000_000), BigInt(1_234_567_800))), tipoCambio: "1234.567800" });
  assert.equal((await fijadoDe(e.duenio, cobro.id)).centavos, "8100");

  // «Marcar cobrado» de una cuota en USD: los centavos de la cuota, sin dividir.
  const cuota = await e.duenio.proyectoCuota.create({ data: { tenantId: e.a.id, proyectoId: p, tipo: "COBRO", concepto: "Seña", monto: 60.07, moneda: "USD", venceEl: new Date(AHORA + 5 * DIA), auto: false }, select: { id: true } });
  const marcada = await e.enSesion(() => e.ficha.marcarCuota(e.form({ id: cuota.id, medio: "TRANSFERENCIA" })));
  assert.equal(marcada.ok, true, JSON.stringify(marcada));
  const deCuota = await e.duenio.proyectoPago.findFirstOrThrow({ where: { tenantId: e.a.id, proyectoId: p, nota: "Seña" }, select: { id: true } });
  assert.deepEqual(await fijadoDe(e.duenio, deCuota.id), { cuotaId: cuota.id, moneda: "USD", centavos: "6007", tipoCambio: "1234.567800" });

  // Proyecto en pesos: tc 1 y los mismos centavos.
  const pArs = await e.proyecto("ARS");
  assert.deepEqual(await e.cobrar(pArs, "45000.5"), { ok: true });
  assert.deepEqual(await fijadoDe(e.duenio, (await e.ultimoCobro(pArs)).id), { cuotaId: null, moneda: "ARS", centavos: "4500050", tipoCambio: "1.000000" });

  // Un tc que no entra exacto en 6 decimales: el cobro entra igual, sin fijar (nunca se redondea el tc).
  await e.duenio.proyectoTipoCambio.update({ where: { tenantId_moneda: { tenantId: e.a.id, moneda: "USD" } }, data: { porUnidad: 1 / 3 } });
  const pRaro = await e.proyecto("USD");
  assert.deepEqual(await e.cobrar(pRaro, "1000"), { ok: true });
  assert.deepEqual(await fijadoDe(e.duenio, (await e.ultimoCobro(pRaro)).id), { cuotaId: null, moneda: null, centavos: null, tipoCambio: null });
  await e.duenio.proyectoTipoCambio.update({ where: { tenantId_moneda: { tenantId: e.a.id, moneda: "USD" } }, data: { porUnidad: 1000 } });
});

test("(c) doble envío de «Marcar cobrado»: un solo cobro y un solo asiento", async (t) => {
  const e = await entornoDe(t);
  if (!e) return;
  const p = await e.proyecto("ARS", 1000);
  const cuota = await e.duenio.proyectoCuota.create({ data: { tenantId: e.a.id, proyectoId: p, tipo: "COBRO", concepto: "Anticipo", monto: 1210, moneda: "ARS", venceEl: new Date(AHORA + 5 * DIA), auto: false }, select: { id: true } });
  const marcar = () => e.enSesion(() => e.ficha.marcarCuota(e.form({ id: cuota.id, medio: "TRANSFERENCIA" })));
  const r = await Promise.all([marcar(), marcar()]);
  assert.equal(r.filter((x) => x.ok).length, 1, JSON.stringify(r));
  const cobros = await e.duenio.proyectoPago.findMany({ where: { tenantId: e.a.id, proyectoId: p }, select: { id: true } });
  assert.equal(cobros.length, 1);
  assert.equal(await e.duenio.cashMovement.count({ where: { tenantId: e.a.id, proyectoPagoId: cobros[0].id } }), 1);
  assert.deepEqual(await fijadoDe(e.duenio, cobros[0].id), { cuotaId: cuota.id, moneda: "ARS", centavos: "121000", tipoCambio: "1.000000" });
});

test("(d) dos cobros a la vez por exactamente el saldo: entra uno solo", async (t) => {
  const e = await entornoDe(t);
  if (!e) return;
  const p = await e.proyecto("ARS", 1000); // $ 1.210 con IVA
  const r = await Promise.all([e.cobrar(p, "1210"), e.cobrar(p, "1210")]);
  assert.equal(r.filter((x) => x.ok).length, 1, JSON.stringify(r));
  const cobros = await e.duenio.proyectoPago.findMany({ where: { tenantId: e.a.id, proyectoId: p, anuladoEl: null }, select: { monto: true } });
  assert.deepEqual(cobros.map((c) => c.monto), [1210]);
});

test("(e) 8 cobros y un cambio de moneda a la vez: nunca hay cobros en otra moneda que la del proyecto", async (t) => {
  const e = await entornoDe(t);
  if (!e) return;
  for (let vuelta = 0; vuelta < 3; vuelta++) {
    const p = await e.proyecto("ARS"); // sin presupuesto: ni tope ni versión enviada
    type Respuesta = { ok: boolean; error?: string };
    const cambio: Promise<Respuesta> = e.enSesion(() => e.ficha.guardarDatos(e.form({ id: p, nombre: `Stand moneda ${vuelta}`, moneda: "USD" })));
    const cobros: Promise<Respuesta>[] = Array.from({ length: 8 }, (_, i) => e.cobrar(p, String(1000 + i)));
    const [rc, ...rs]: Respuesta[] = await Promise.all([cambio, ...cobros]);
    assert.ok(rs.every((x) => x.ok), JSON.stringify(rs));
    const final: string = (await e.duenio.proyecto.findUniqueOrThrow({ where: { id: p }, select: { moneda: true } })).moneda;
    if (final === "USD") assert.equal(rc.ok, true);
    else assert.match(rc.error ?? "", /no se puede cambiar: el proyecto ya tiene cobros registrados en ARS\. Para cambiarla hay que anular esos cobros, y anular un cobro mueve la caja/);
    const monedas: { moneda: string | null }[] = await e.duenio.$queryRaw<{ moneda: string | null }[]>`SELECT "moneda" FROM "ProyectoPago" WHERE "proyectoId" = ${p} AND "anuladoEl" IS NULL`;
    assert.equal(monedas.length, 8);
    for (const m of monedas) assert.equal(m.moneda, final, `vuelta ${vuelta}: cobro fijado en ${m.moneda} y el proyecto quedó en ${final}`);
  }
});

test("(f) el trigger: lo contabilizado no se edita; la nota y la anulación sí", async (t) => {
  const e = await entornoDe(t);
  if (!e) return;
  const p = await e.proyecto("USD");
  assert.deepEqual(await e.cobrar(p, "30000"), { ok: true });
  const { id } = await e.ultimoCobro(p);
  const rechaza = async (sql: string, cuando: string) => {
    await assert.rejects(e.duenio.$executeRawUnsafe(sql, id), /contabilizado|fijado|anula/i, cuando);
  };
  await rechaza(`UPDATE "ProyectoPago" SET "monto" = 1 WHERE "id" = $1`, "cambiar el monto");
  await rechaza(`UPDATE "ProyectoPago" SET "medio" = 'CHEQUE' WHERE "id" = $1`, "cambiar el medio");
  await rechaza(`UPDATE "ProyectoPago" SET "cobradoPor" = 'otro' WHERE "id" = $1`, "cambiar quién cobró");
  await rechaza(`UPDATE "ProyectoPago" SET "montoMonedaCentavos" = 1 WHERE "id" = $1`, "re-fijar los centavos");
  await rechaza(`UPDATE "ProyectoPago" SET "moneda" = NULL, "montoMonedaCentavos" = NULL, "tipoCambio" = NULL WHERE "id" = $1`, "des-fijar");
  // La nota es libre.
  assert.equal(await e.duenio.$executeRawUnsafe(`UPDATE "ProyectoPago" SET "nota" = 'aclaración' WHERE "id" = $1`, id), 1);
  // La anulación de la app (app_rls, por la Server Action) pasa; después no se des-anula ni se cambia.
  const anulado = await e.enSesion(() => e.ficha.anularCobroFicha(e.form({ id })));
  assert.equal(anulado.ok, true, JSON.stringify(anulado));
  await rechaza(`UPDATE "ProyectoPago" SET "anuladoEl" = NULL, "anuladoPor" = NULL WHERE "id" = $1`, "des-anular");
  await rechaza(`UPDATE "ProyectoPago" SET "anuladoPor" = 'otro' WHERE "id" = $1`, "cambiar quién anuló");
  // Un cobro anulado sin fijar no se fija.
  await e.duenio.proyectoTipoCambio.update({ where: { tenantId_moneda: { tenantId: e.a.id, moneda: "USD" } }, data: { porUnidad: 1 / 3 } });
  const p2 = await e.proyecto("USD");
  assert.deepEqual(await e.cobrar(p2, "500"), { ok: true });
  await e.duenio.proyectoTipoCambio.update({ where: { tenantId_moneda: { tenantId: e.a.id, moneda: "USD" } }, data: { porUnidad: 1000 } });
  const sinFijar = await e.ultimoCobro(p2);
  await e.duenio.$executeRawUnsafe(`UPDATE "ProyectoPago" SET "anuladoEl" = now(), "anuladoPor" = 'test' WHERE "id" = $1`, sinFijar.id);
  await assert.rejects(
    e.duenio.$executeRawUnsafe(`UPDATE "ProyectoPago" SET "moneda" = 'USD', "montoMonedaCentavos" = 50, "tipoCambio" = 1000 WHERE "id" = $1`, sinFijar.id),
    /vivo|anula/i,
  );
  // Los CHECKs: centavos negativos, tc no positivo, o la terna incompleta.
  const base = `INSERT INTO "ProyectoPago" ("id", "tenantId", "proyectoId", "medio", "monto", "moneda", "montoMonedaCentavos", "tipoCambio") VALUES ($1, $2, $3, 'EFECTIVO', 1, $4, $5::bigint, $6::numeric)`;
  for (const [n, moneda, centavos, tc] of [[1, "USD", "-1", "1"], [2, "USD", "1", "0"], [3, "USD", null, "1"], [4, null, "1", null]] as const) {
    await assert.rejects(e.duenio.$executeRawUnsafe(base, `check-${n}`, e.a.id, p2, moneda, centavos, tc), /check/i, `CHECK ${n}`);
  }
});

test("(g) la vuelta atrás del pie deja la tabla como antes y el SQL se vuelve a aplicar", async (t) => {
  const e = await entornoDe(t);
  if (!e) return;
  correrComoDuenio(e.base, vueltaAtrasD13());
  const quedan = await e.duenio.$queryRaw<{ n: number }[]>`
    SELECT (SELECT count(*)::int FROM information_schema.columns WHERE table_name = 'ProyectoPago' AND column_name IN ('cuotaId', 'moneda', 'montoMonedaCentavos', 'tipoCambio'))
         + (SELECT count(*)::int FROM pg_trigger WHERE tgrelid = '"ProyectoPago"'::regclass AND NOT tgisinternal)
         + (SELECT count(*)::int FROM pg_indexes WHERE indexname = 'ProyectoPago_tenantId_cuotaId_idx')
         + (SELECT count(*)::int FROM pg_proc WHERE proname = 'proyecto_pago_contabilizado') AS n`;
  assert.equal(quedan[0].n, 0);
  e.cobranza.olvidarColumnasCobroFijadoParaTests();
  assert.equal(await e.cobranza.hayColumnasCobroFijado(), false);
  const p = await e.proyecto("USD");
  assert.deepEqual(await e.cobrar(p, "2000"), { ok: true });
  // Y otra vez adelante, sobre filas que ya existen.
  aplicarD13(e.base);
  e.cobranza.olvidarColumnasCobroFijadoParaTests();
  assert.equal(await e.cobranza.hayColumnasCobroFijado(), true);
  assert.deepEqual(await e.cobrar(p, "3000"), { ok: true });
  assert.deepEqual(await fijadoDe(e.duenio, (await e.ultimoCobro(p)).id), { cuotaId: null, moneda: "USD", centavos: "300", tipoCambio: "1000.000000" });
});
