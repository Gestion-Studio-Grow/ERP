// ============================================================================
// GSG-MIA-114 · P4 de la certificación GSG-MIA-094 (re-certificación MIA-113): aislamiento por negocio en el camino nuevo
// de Bancos (MIA-111): conciliar, proponer, rechazar el cobro de un perdido y el candado de la cobranza (14c7875).
// Base efímera migrada, rol `app_rls` sin BYPASSRLS, Server Actions con la sesión de cada negocio. A y B tienen el mismo
// caso con el MISMO importe (uno por test, $ 551 a $ 555): si algo se filtrara entre negocios, la propuesta por importe lo mostraría.
//
//  1. B no ve nada de A en Bancos (cuentas, movimientos, candidatas, propuesta), ni pidiendo con el id de A.
//  2. B no concilia lo de A en ninguna combinación (movimiento de A, cuota de A, o los dos); A queda igual, fila por fila.
//  3. A pierde su proyecto: a A se le rechaza el cobro; B, con el mismo importe, sigue proponiendo y conciliando.
//     El cobro perdido de A, pedido desde B, ni siquiera existe para B (no dice «perdido»).
//  4. Con el candado de la cobranza de un proyecto de A tomado, B concilia lo suyo sin esperar; A sí espera.
// Las fechas son fijas (26/10/2026): el resultado no depende del reloj.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type BaseEfimera, type NegocioDePrueba } from "@/test/base-efimera";
import { propuestasDeConciliacion } from "./empresa-core";

const laBase = baseEfimeraDelArchivo();
const DIA = 86_400_000;
const PLAZO_MS = 20_000;
const EVENTO = new Date("2027-03-10T12:00:00Z");

/** Cuántos pedidos esperan el candado consultivo `clave` (mismo cálculo que mia089-plata-postgres.test.ts). */
async function trabados(c: pg.Client, clave: string): Promise<number> {
  const r = await c.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM pg_locks
      WHERE locktype = 'advisory' AND NOT granted AND objsubid = 1
        AND database = (SELECT oid FROM pg_database WHERE datname = current_database())
        AND objid = ((hashtext($1)::bigint & 4294967295)::text)::oid
        AND classid = ((hashtext($1)::bigint >> 32) & 4294967295)::text::oid`,
    [clave],
  );
  return r.rows[0].n;
}

/** Termina antes de `ms` o falla diciendo qué quedó esperando. */
async function aTiempo<T>(p: Promise<T>, ms: number, que: string): Promise<T> {
  let reloj: ReturnType<typeof setTimeout> | undefined;
  const tope = new Promise<never>((_, no) => (reloj = setTimeout(() => no(new Error(`${que}: no terminó en ${ms} ms`)), ms)));
  try {
    return await Promise.race([p, tope]);
  } finally {
    clearTimeout(reloj);
  }
}

type Resultado = { ok: boolean; error?: string };

async function preparar(t: import("node:test").TestContext) {
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  Object.assign(process.env as Record<string, string | undefined>, { DB_CONNECTION_LIMIT: "14" });
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  for (const n of [base.a, base.b]) {
    const t0 = await duenio.tenant.findUniqueOrThrow({ where: { id: n.id }, select: { modules: true } });
    await duenio.tenant.update({ where: { id: n.id }, data: { modules: [...new Set([...t0.modules, "proyectos"])] } });
  }
  const ficha = await import("./acciones-ficha");
  const empresa = await import("./acciones-empresa");
  const gestion = await import("./gestion.server");
  const { datosDeBancos } = await import("./empresa.server");
  const form = (c: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(c)) fd.set(k, v);
    return fd;
  };
  const como = async <R>(n: NegocioDePrueba, fn: () => Promise<R>): Promise<R> => {
    const r = await ejecutarAccion({ negocio: n, usuario: { id: n.duenia.id } }, fn);
    assert.equal(r.tipo, "respuesta", JSON.stringify(r));
    return (r as { valor: R }).valor;
  };
  let numero = (await duenio.proyecto.count()) + 900;
  /** Proyecto en Pedido con un cobro a mano de `importe`, una cuenta y un depósito del mismo importe sin conciliar: todo del negocio `n`. */
  const caso = async (n: NegocioDePrueba, etiqueta: string, importe: number) => {
    const p = await duenio.proyecto.create({
      data: { tenantId: n.id, numero: ++numero, clientId: n.clientes[0], nombre: `Stand 114 ${etiqueta}`, servicio: "ARQUITECTURA", etapa: "PEDIDO", fechaArmado: new Date(EVENTO.getTime() - 2 * DIA), fechaEvento: EVENTO, fechaDesarme: new Date(EVENTO.getTime() + DIA) },
      select: { id: true },
    });
    const pres = await duenio.proyectoPresupuesto.create({ data: { tenantId: n.id, proyectoId: p.id, version: 1, estado: "APROBADO", token: `m114-${p.id}`, ivaPct: 21 }, select: { id: true } });
    await duenio.proyectoItem.create({ data: { tenantId: n.id, presupuestoId: pres.id, rubro: "General", descripcion: "Stand", cantidad: 1, precio: 1000 } });
    await como(n, () => gestion.regenerarCuotas(n.id, p.id));
    const concepto = `Seña banco ${etiqueta}`;
    const r: Resultado = await como(n, () => ficha.crearMovimientoManual(form({ proyectoId: p.id, tipo: "COBRO", concepto, monto: String(importe), moneda: "ARS", venceEl: "2026-10-26" })));
    assert.equal(r.ok, true, `${etiqueta}: el cobro a mano se carga: ${JSON.stringify(r)}`);
    const cuota = (await duenio.proyectoCuota.findFirstOrThrow({ where: { proyectoId: p.id, concepto }, select: { id: true } })).id;
    const cuenta = (await duenio.proyectoCuentaBanco.create({ data: { tenantId: n.id, nombre: `Banco 114 ${etiqueta}`, moneda: "ARS", saldo: 0 }, select: { id: true } })).id;
    const mov = (await duenio.proyectoMovBanco.create({ data: { tenantId: n.id, cuentaId: cuenta, fecha: new Date("2026-10-26T12:00:00Z"), descripcion: `Transferencia ${importe} ${etiqueta}`, importe }, select: { id: true } })).id;
    return { n, proyecto: p.id, cuota, cuenta, mov };
  };
  type Bancos = Awaited<ReturnType<typeof datosDeBancos>>;
  const bancos = (n: NegocioDePrueba, pedido: NegocioDePrueba = n): Promise<Bancos> => como(n, () => datosDeBancos(pedido.id));
  const propuestaPara = (b: Bancos, movId: string) => propuestasDeConciliacion(b.movimientos.filter((m) => !m.cuotaId), b.candidatas, b.tc).get(movId)?.id;
  const conciliar = (n: NegocioDePrueba, mov: string, cuota: string): Promise<Resultado> => como(n, () => empresa.conciliarMovimiento(form({ id: mov, cuotaId: cuota })));
  const mover = (n: NegocioDePrueba, id: string, destino: string, motivo?: string): Promise<Resultado> => como(n, () => ficha.moverProyecto({ id, destino, motivo }));
  const atado = async (mov: string) => (await duenio.proyectoMovBanco.findUniqueOrThrow({ where: { id: mov }, select: { cuotaId: true } })).cuotaId;
  /** Foto de Bancos y cuotas de un negocio, leída como dueño de las tablas (sin RLS). */
  const foto = async (tenantId: string) =>
    JSON.stringify({
      movs: await duenio.proyectoMovBanco.findMany({ where: { tenantId }, orderBy: { id: "asc" }, select: { id: true, cuotaId: true, importe: true, cuentaId: true } }),
      cuotas: await duenio.proyectoCuota.findMany({ where: { tenantId }, orderBy: { id: "asc" }, select: { id: true, monto: true, pagadoEl: true, anuladoEl: true } }),
      cuentas: await duenio.proyectoCuentaBanco.findMany({ where: { tenantId }, orderBy: { id: "asc" }, select: { id: true, saldo: true } }),
    });
  const claveCobranza = (n: NegocioDePrueba, proyectoId: string) => `cobranza-proyecto:${n.id}:${proyectoId}`;
  return { base, duenio, a: base.a, b: base.b, caso, bancos, propuestaPara, conciliar, mover, atado, foto, claveCobranza };
}

test("MIA-114 · P4 · Bancos de dos negocios con el mismo importe: B no ve cuentas, movimientos, candidatas ni propuestas de A, ni pidiendo con el id de A", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const A = await p.caso(p.a, "A1", 551);
  const B = await p.caso(p.b, "B1", 551);

  const deB = await p.bancos(p.b);
  assert.deepEqual(deB.cuentas.map((c) => c.id), [B.cuenta], "B ve sólo su cuenta");
  assert.deepEqual(deB.movimientos.map((m) => m.id), [B.mov], "B ve sólo su depósito");
  assert.equal(deB.candidatas.some((c) => c.id === A.cuota), false, "la cuota de A no está para elegir en B");
  assert.ok(deB.candidatas.some((c) => c.id === B.cuota), "la de B sí");
  assert.equal(p.propuestaPara(deB, B.mov), B.cuota, "el depósito de B propone el cobro de B, no el de A del mismo importe");

  const deA = await p.bancos(p.a);
  assert.deepEqual(deA.movimientos.map((m) => m.id), [A.mov], "A ve sólo su depósito");
  assert.equal(deA.candidatas.some((c) => c.id === B.cuota), false, "la cuota de B no está para elegir en A");
  assert.equal(p.propuestaPara(deA, A.mov), A.cuota);

  // La sesión es de B pero el pedido trae el id de A: la base (RLS) no devuelve nada de A.
  const cruzado = await p.bancos(p.b, p.a);
  assert.equal(cruzado.cuentas.length + cruzado.movimientos.length, 0, `sesión de B pidiendo Bancos de A: nada (${JSON.stringify({ c: cruzado.cuentas.length, m: cruzado.movimientos.length })})`);
  assert.equal(cruzado.candidatas.some((c) => c.id === A.cuota), false, "ni las cuotas de A");
});

test("MIA-114 · P4 · B no concilia lo de A en ninguna combinación (movimiento de A, cuota de A, los dos) y A queda igual fila por fila; A concilia lo suyo", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const A = await p.caso(p.a, "A2", 552);
  const B = await p.caso(p.b, "B2", 552);
  const antesA = await p.foto(p.a.id);
  const antesB = await p.foto(p.b.id);

  for (const [mov, cuota, que] of [
    [A.mov, A.cuota, "movimiento y cuota de A"],
    [B.mov, A.cuota, "movimiento de B con la cuota de A"],
    [A.mov, B.cuota, "movimiento de A con la cuota de B"],
  ] as const) {
    const r = await p.conciliar(p.b, mov, cuota);
    assert.equal(r.ok, false, `B con ${que}: no concilia: ${JSON.stringify(r)}`);
    // ADM-143 (#195): a un id de otro negocio se le dice que no existe, sin afirmarle un estado (ni «anulada» ni «conciliado»).
    assert.match(r.error ?? "", /^(Ese movimiento no existe\.|Esa cuota no existe\.|Ese movimiento o esa cuota ya no existen\.)$/, `B con ${que}: para B no existe`);
  }
  assert.equal(await p.foto(p.a.id), antesA, "A queda igual, fila por fila");
  assert.equal(await p.foto(p.b.id), antesB, "B también: nada quedó atado a medias");

  assert.equal((await p.conciliar(p.a, A.mov, A.cuota)).ok, true, "A concilia lo suyo");
  assert.equal(await p.atado(A.mov), A.cuota);
  const r = await p.conciliar(p.b, B.mov, A.cuota);
  assert.equal(r.ok, false, "con la cuota de A ya conciliada, B sigue sin poder usarla");
  assert.match(r.error ?? "", /^(Esa cuota no existe\.|Ese movimiento o esa cuota ya no existen\.)$/, "y no se entera de que está conciliada");
  assert.equal(await p.atado(B.mov), null);
  assert.equal((await p.conciliar(p.b, B.mov, B.cuota)).ok, true, "B concilia lo suyo");
});

test("MIA-114 · P4 · A pierde su proyecto: a A se le rechaza el cobro y deja de proponerlo; B, con el mismo importe y sin perder, propone y concilia; el perdido de A, pedido desde B, no existe para B", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const A = await p.caso(p.a, "A3", 553);
  const B = await p.caso(p.b, "B3", 553);
  assert.equal((await p.mover(p.a, A.proyecto, "PERDIDO", "Eligió otro proveedor")).ok, true);

  const deA = await p.bancos(p.a);
  assert.equal(p.propuestaPara(deA, A.mov), undefined, "A perdido: no propone su cobro");
  const rA = await p.conciliar(p.a, A.mov, A.cuota);
  assert.equal(rA.ok, false);
  assert.match(rA.error ?? "", /perdido/i, "a A se le dice por qué");

  const deB = await p.bancos(p.b);
  assert.equal(p.propuestaPara(deB, B.mov), B.cuota, "el perdido de A no frena la propuesta de B");
  const rCruzado = await p.conciliar(p.b, B.mov, A.cuota);
  assert.equal(rCruzado.ok, false);
  assert.doesNotMatch(rCruzado.error ?? "", /perdido/i, "B no se entera de que el proyecto de A está perdido");
  assert.equal((await p.conciliar(p.b, B.mov, B.cuota)).ok, true, "B concilia el suyo");

  // Al revés: B pierde el suyo y A, reabierto, concilia.
  const B2 = await p.caso(p.b, "B3b", 554);
  assert.equal((await p.mover(p.b, B2.proyecto, "PERDIDO", "Eligió otro proveedor")).ok, true);
  assert.equal((await p.mover(p.a, A.proyecto, "PEDIDO")).ok, true, "A reabre");
  assert.equal((await p.conciliar(p.a, A.mov, A.cuota)).ok, true, "el perdido de B no frena a A");
  assert.equal((await p.conciliar(p.b, B2.mov, B2.cuota)).ok, false, "y a B sí se le frena el suyo");
});

test("MIA-114 · P4 · candado de la cobranza (14c7875): con el de un proyecto de A tomado, B concilia lo suyo sin esperar y A sí espera hasta que se suelta", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const A = await p.caso(p.a, "A4", 555);
  const B = await p.caso(p.b, "B4", 555);
  const clave = p.claveCobranza(p.a, A.proyecto);
  const c = new pg.Client({ connectionString: (p.base as BaseEfimera).urlDuenio });
  await c.connect();
  try {
    await c.query("SELECT pg_advisory_lock(hashtext($1))", [clave]);
    let soltado = false;
    try {
      // B: lo suyo y el intento cruzado con la cuota de A terminan sin esperar el candado de A.
      const rB = await aTiempo(p.conciliar(p.b, B.mov, B.cuota), 10_000, "B conciliando lo suyo con el candado de A tomado");
      assert.equal(rB.ok, true, JSON.stringify(rB));
      const rCruzado = await aTiempo(p.conciliar(p.b, B.mov, A.cuota), 10_000, "B pidiendo la cuota de A con el candado de A tomado");
      assert.equal(rCruzado.ok, false);
      assert.equal(await trabados(c, clave), 0, "nadie de B quedó esperando el candado de A");

      // A: espera detrás de su candado (la prueba de que el candado está de verdad tomado).
      let termino = false;
      const pedidoA = p.conciliar(p.a, A.mov, A.cuota);
      pedidoA.then(() => (termino = true), () => (termino = true));
      const hasta = performance.now() + PLAZO_MS;
      while ((await trabados(c, clave)) < 1) {
        if (termino) assert.fail(`A terminó sin esperar su candado: ${JSON.stringify(await pedidoA.catch((e: unknown) => String(e)))}`);
        if (performance.now() > hasta) assert.fail("A no llegó a su candado");
        await new Promise((r) => setImmediate(r));
      }
      assert.equal(termino, false, "A sigue esperando");
      await c.query("SELECT pg_advisory_unlock(hashtext($1))", [clave]);
      soltado = true;
      const rA = await aTiempo(pedidoA, PLAZO_MS, "A después de soltar el candado");
      assert.equal(rA.ok, true, JSON.stringify(rA));
    } finally {
      if (!soltado) await c.query("SELECT pg_advisory_unlock(hashtext($1))", [clave]);
    }
  } finally {
    await c.end();
  }
  assert.equal(await p.atado(A.mov), A.cuota);
  assert.equal(await p.atado(B.mov), B.cuota);
});
