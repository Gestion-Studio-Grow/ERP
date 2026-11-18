// ============================================================================
// GSG-MIA-089 · CARRERAS REALES de la plata de Proyectos, contra Postgres (base efímera migrada, `app_rls` + RLS) y con
// las Server Actions reales (sesión de la dueña). La barrera es la de `cobranza-carrera-postgres.test.ts`: el test toma
// antes el candado que toma la acción, lanza los pedidos uno por uno y, antes del siguiente, espera VER en `pg_locks` que
// el anterior quedó trabado ahí. Si una acción no pasa por el candado, el pedido termina sin trabarse y el test falla.
// Cada caso corre en los dos órdenes. Se corre 5 veces seguidas (ver el PR).
//
//  V4  mover de etapa contra cobrar y contra «Marcar cobrado»; perdido contra cobrar; dos cambios de etapa; el mismo
//      cambio dos veces (idempotente: una fila de historial).
//  V7  ADM-122 / ADM-123: el mismo envío (misma clave del envío) 2 y 10 veces a la vez, y un reintento después, deja UNA
//      cuota y UNA fila de registro, en `crearMovimientoManual` (cobro y pago) y en `crearPagoEmpresa`. Dos cuotas
//      iguales en dos envíos distintos se siguen pudiendo cargar.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type BaseEfimera } from "@/test/base-efimera";

const laBase = baseEfimeraDelArchivo();
const DIA = 86_400_000;
const PLAZO_MS = 20_000;

/**
 * Cuántos pedidos esperan ESTE candado consultivo (`clave`) en esta base. `pg_advisory_lock(bigint)` guarda la clave
 * partida en dos: `classid` = 32 bits altos y `objid` = 32 bits bajos, con `objsubid` = 1. `hashtext` da un int4, que
 * extendido a bigint deja `objid` = el hash como oid (sin signo) y `classid` = 0 o 4294967295 según el signo.
 */
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

/**
 * Corre `pedidos` a la vez, en fila detrás del candado `clave`: los lanza en orden, cada uno recién cuando el anterior
 * quedó trabado en el candado, y suelta. Devuelve los resultados en el orden de lanzamiento (= orden en que pasan).
 */
async function enFila<T>(base: BaseEfimera, clave: string, pedidos: readonly (() => Promise<T>)[]): Promise<T[]> {
  const c = new pg.Client({ connectionString: base.urlDuenio });
  await c.connect();
  try {
    assert.equal(await trabados(c, clave), 0, "no queda nadie trabado de antes");
    await c.query("SELECT pg_advisory_lock(hashtext($1))", [clave]);
    const enCurso: Promise<T>[] = [];
    const terminados = new Set<number>();
    try {
      for (let i = 0; i < pedidos.length; i++) {
        const p = pedidos[i]();
        p.then(
          () => terminados.add(i),
          () => terminados.add(i),
        );
        enCurso.push(p);
        const hasta = performance.now() + PLAZO_MS; // plazo de espera (monotónico), no un dato del test
        // Espera una CONDICIÓN (el pedido trabado en el candado), no un tiempo: la vuelta sólo cede el turno.
        while ((await trabados(c, clave)) < i + 1) {
          if (terminados.has(i)) {
            const r = await p.catch((e: unknown) => e);
            assert.fail(`el pedido ${i + 1} terminó sin trabarse en «${clave}»: ${JSON.stringify(r instanceof Error ? r.message : r)}`);
          }
          if (performance.now() > hasta) assert.fail(`el pedido ${i + 1} no llegó al candado «${clave}» en ${PLAZO_MS} ms`);
          await new Promise((r) => setImmediate(r));
        }
      }
    } finally {
      await c.query("SELECT pg_advisory_unlock(hashtext($1))", [clave]);
    }
    return await Promise.all(enCurso);
  } finally {
    await c.end();
  }
}

async function preparar(t: import("node:test").TestContext) {
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  Object.assign(process.env as Record<string, string | undefined>, { NODE_ENV: "development", DB_CONNECTION_LIMIT: "14", DB_CONNECT_TIMEOUT_MS: "5000" });
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const { a } = base;
  const t0 = await duenio.tenant.findUniqueOrThrow({ where: { id: a.id }, select: { modules: true } });
  await duenio.tenant.update({ where: { id: a.id }, data: { modules: [...new Set([...t0.modules, "proyectos"])] } });

  const acciones = await import("./acciones");
  const ficha = await import("./acciones-ficha");
  const empresa = await import("./acciones-empresa");
  const { regenerarCuotas } = await import("./gestion.server");
  const { cobranzasDelNegocio, tiposDeCambio } = await import("./cobranza.server");
  const { configProyectos } = await import("./datos.server");

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
  let numero = (await duenio.proyecto.count()) + 900;
  /** Proyecto de A confirmado, aprobado por $ 1.210 (1.000 + IVA 21 %), seña del 50 %, con su plan de cuotas. */
  const proyecto = async () => {
    const evento = new Date(Date.now() + 60 * DIA);
    const p = await duenio.proyecto.create({
      data: { tenantId: a.id, numero: ++numero, clientId: a.clientes[0], nombre: `Stand ${numero}`, servicio: "ARQUITECTURA", etapa: "APROBADO", anticipoClientePct: 50, fechaArmado: new Date(evento.getTime() - 2 * DIA), fechaEvento: evento, fechaDesarme: new Date(evento.getTime() + DIA) },
      select: { id: true },
    });
    const pres = await duenio.proyectoPresupuesto.create({ data: { tenantId: a.id, proyectoId: p.id, version: 1, estado: "APROBADO", token: `tok-${p.id}`, ivaPct: 21 }, select: { id: true } });
    await duenio.proyectoItem.create({ data: { tenantId: a.id, presupuestoId: pres.id, rubro: "General", descripcion: "Stand", cantidad: 1, precio: 1000 } });
    await enSesion(() => regenerarCuotas(a.id, p.id));
    return p.id;
  };
  const sena = async (proyectoId: string) => (await duenio.proyectoCuota.findFirstOrThrow({ where: { proyectoId, clave: `${proyectoId}:cliente:anticipo` }, select: { id: true } })).id;
  const cobrar = (proyectoId: string, monto: number) => () => enSesion(() => acciones.registrarCobro(form({ proyectoId, medio: "TRANSFERENCIA", monto: String(monto) })));
  const marcar = (id: string) => () => enSesion(() => ficha.marcarCuota(form({ id, medio: "TRANSFERENCIA" })));
  const mover = (id: string, destino: string, motivo?: string) => () => enSesion(() => ficha.moverProyecto({ id, destino, motivo }));
  const estado = (id: string) => duenio.proyecto.findUniqueOrThrow({ where: { id }, select: { etapa: true, perdidoEl: true } });
  const pagos = (proyectoId: string) => duenio.proyectoPago.count({ where: { proyectoId, anuladoEl: null } });
  const historialDeEtapa = async (proyectoId: string) => (await duenio.proyectoCambio.findMany({ where: { proyectoId, campo: "Etapa" }, orderBy: { createdAt: "asc" }, select: { antes: true, despues: true } })).map((h) => `${h.antes} → ${h.despues}`);
  const cobranzaDe = (proyectoId: string) =>
    enSesion(async () => {
      const [config, tc] = await Promise.all([configProyectos(a.id), tiposDeCambio(a.id)]);
      return (await cobranzasDelNegocio(a.id, tc, config.margenPct, [proyectoId])).get(proyectoId)!;
    });
  const claveCobranza = (proyectoId: string) => `cobranza-proyecto:${a.id}:${proyectoId}`;
  const claveEnvio = (clave: string) => `envio:${a.id}:${clave}`;
  return { base, duenio, a, acciones, ficha, empresa, form, enSesion, proyecto, sena, cobrar, marcar, mover, estado, pagos, historialDeEtapa, cobranzaDe, claveCobranza, claveEnvio };
}

const ok = { ok: true };
const rechazo = (r: { ok: boolean; error?: string }, patron: RegExp, que: string) => {
  assert.equal(r.ok, false, `${que}: ${JSON.stringify(r)}`);
  assert.match(String(r.error), patron, que);
};

test("V4 · mover a Lead contra cobrar, en los dos órdenes: con el cobro adentro no se vuelve; sin él, se vuelve y el cobro entra", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const id1 = await p.proyecto();
  const [cobro1, mov1] = await enFila(p.base, p.claveCobranza(id1), [p.cobrar(id1, 300), p.mover(id1, "PROPUESTA")]);
  assert.deepEqual(cobro1, ok);
  rechazo(mov1, /cobro/i, "con el cobro adentro, no vuelve a Lead");
  assert.equal((await p.estado(id1)).etapa, "APROBADO");

  const id2 = await p.proyecto();
  const [mov2, cobro2] = await enFila(p.base, p.claveCobranza(id2), [p.mover(id2, "PROPUESTA"), p.cobrar(id2, 300)]);
  assert.deepEqual(mov2, ok);
  assert.deepEqual(cobro2, ok);
  assert.equal((await p.estado(id2)).etapa, "PROPUESTA");
  assert.equal(await p.pagos(id2), 1);
});

test("V4 · mover a Lead contra «Marcar cobrado» de la seña, en los dos órdenes", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const id1 = await p.proyecto();
  const [marca1, mov1] = await enFila(p.base, p.claveCobranza(id1), [p.marcar(await p.sena(id1)), p.mover(id1, "PROPUESTA")]);
  assert.equal(marca1.ok, true, JSON.stringify(marca1));
  rechazo(mov1, /cobro/i, "con la seña cobrada, no vuelve a Lead");
  assert.equal((await p.estado(id1)).etapa, "APROBADO");

  // Primero vuelve a Lead: la seña ya era firme y lo sigue siendo, así que se puede marcar y entra una sola vez.
  const id2 = await p.proyecto();
  const [mov2, marca2] = await enFila(p.base, p.claveCobranza(id2), [p.mover(id2, "PROPUESTA"), p.marcar(await p.sena(id2))]);
  assert.deepEqual(mov2, ok);
  assert.equal(marca2.ok, true, JSON.stringify(marca2));
  assert.equal(await p.pagos(id2), 1);
});

test("V4 · perdido contra cobrar, en los dos órdenes: a un perdido no entra plata; lo cobrado antes queda cobrado y no se debe nada", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const id1 = await p.proyecto();
  const [perd1, cobro1] = await enFila(p.base, p.claveCobranza(id1), [p.mover(id1, "PERDIDO", "Precio"), p.cobrar(id1, 300)]);
  assert.deepEqual(perd1, ok);
  rechazo(cobro1, /perdido/i, "el cobro que llega después del perdido no entra");
  assert.equal(await p.pagos(id1), 0);

  const id2 = await p.proyecto();
  const [cobro2, perd2] = await enFila(p.base, p.claveCobranza(id2), [p.cobrar(id2, 605), p.mover(id2, "PERDIDO", "Precio")]);
  assert.deepEqual(cobro2, ok);
  assert.deepEqual(perd2, ok);
  const cob = await p.cobranzaDe(id2);
  assert.deepEqual([cob.cobrado, cob.porCobrar, cob.saldo], [605, 0, 0], "perdido: lo cobrado sigue y no se debe nada");
});

test("V4 · dos cambios de etapa a la vez, en los dos órdenes, y el mismo cambio dos veces: el historial cuenta lo que pasó, una vez", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { etapaLabel } = await import("./core");
  for (const [primero, segundo] of [["PRODUCCION", "ARMADO"], ["ARMADO", "PRODUCCION"]]) {
    const id = await p.proyecto();
    const r = await enFila(p.base, p.claveCobranza(id), [p.mover(id, primero), p.mover(id, segundo)]);
    assert.deepEqual(r, [ok, ok]);
    assert.equal((await p.estado(id)).etapa, segundo);
    const nombre = (e: string) => etapaLabel(e, "ARQUITECTURA");
    assert.deepEqual(await p.historialDeEtapa(id), [`${nombre("APROBADO")} → ${nombre(primero)}`, `${nombre(primero)} → ${nombre(segundo)}`]);
  }
  const id = await p.proyecto();
  assert.deepEqual(await enFila(p.base, p.claveCobranza(id), [p.mover(id, "PRODUCCION"), p.mover(id, "PRODUCCION")]), [ok, ok]);
  assert.equal((await p.historialDeEtapa(id)).length, 1, "el mismo cambio dos veces deja una fila");
  const idp = await p.proyecto();
  assert.deepEqual(await enFila(p.base, p.claveCobranza(idp), [p.mover(idp, "PERDIDO", "Precio"), p.mover(idp, "PERDIDO", "Precio")]), [ok, ok]);
  assert.equal((await p.historialDeEtapa(idp)).length, 1, "perder dos veces deja una fila");
});

/** Una clave de envío como la del navegador (32 hex). */
const nuevaClave = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (x) => x.toString(16).padStart(2, "0")).join("");

test("V7 · ADM-123: el mismo «Movimiento manual» 2 y 10 veces a la vez, y un reintento, deja una cuota y una fila de registro (cobro y pago)", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const id = await p.proyecto();
  for (const [tipo, veces] of [["PAGO", 2], ["PAGO", 10], ["COBRO", 2], ["COBRO", 10]] as const) {
    const clave = nuevaClave();
    const concepto = `${tipo} ${veces} ${clave.slice(0, 6)}`;
    const enviar = () => p.enSesion(() => p.ficha.crearMovimientoManual(p.form({ proyectoId: id, tipo, concepto, monto: "10", moneda: "ARS", venceEl: "2026-12-01", claveEnvio: clave })));
    const r = await enFila(p.base, p.claveEnvio(clave), Array.from({ length: veces }, () => enviar));
    assert.ok(r.every((x) => x.ok), JSON.stringify(r));
    assert.deepEqual(await enviar(), ok, "el reintento de después contesta bien y no graba");
    const cuotas = await p.duenio.proyectoCuota.findMany({ where: { proyectoId: id, concepto }, select: { id: true } });
    assert.equal(cuotas.length, 1, `${tipo} × ${veces}: una cuota`);
    assert.equal(await p.duenio.proyectoCambio.count({ where: { entidadId: cuotas[0].id } }), 1, `${tipo} × ${veces}: una fila de registro`);
  }
  // Dos cuotas legítimas iguales, en dos envíos distintos: entran las dos.
  for (let i = 0; i < 2; i++) assert.deepEqual(await p.enSesion(() => p.ficha.crearMovimientoManual(p.form({ proyectoId: id, tipo: "PAGO", concepto: "Iguales", monto: "10", moneda: "ARS", venceEl: "2026-12-01", claveEnvio: nuevaClave() }))), ok);
  assert.equal(await p.duenio.proyectoCuota.count({ where: { proyectoId: id, concepto: "Iguales" } }), 2);
});

test("V7 · ADM-122: el mismo «pago de empresa» 2 y 10 veces a la vez, y un reintento, deja una cuota y una fila de registro", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  for (const [tipo, veces] of [["PAGO", 2], ["PAGO", 10], ["COBRO", 10]] as const) {
    const clave = nuevaClave();
    const concepto = `Empresa ${tipo} ${veces} ${clave.slice(0, 6)}`;
    const enviar = () => p.enSesion(() => p.empresa.crearPagoEmpresa(p.form({ tipo, concepto, monto: "1000", moneda: "ARS", venceEl: "2026-12-01", claveEnvio: clave })));
    const r = await enFila(p.base, p.claveEnvio(clave), Array.from({ length: veces }, () => enviar));
    assert.ok(r.every((x) => x.ok), JSON.stringify(r));
    assert.deepEqual(await enviar(), ok, "el reintento de después contesta bien y no graba");
    const cuotas = await p.duenio.proyectoCuota.findMany({ where: { tenantId: p.a.id, proyectoId: null, concepto }, select: { id: true } });
    assert.equal(cuotas.length, 1, `${tipo} × ${veces}: una cuota`);
    assert.equal(await p.duenio.proyectoCambio.count({ where: { entidadId: cuotas[0].id } }), 1, `${tipo} × ${veces}: una fila de registro`);
  }
  for (let i = 0; i < 2; i++) assert.deepEqual(await p.enSesion(() => p.empresa.crearPagoEmpresa(p.form({ tipo: "PAGO", concepto: "Alquiler", monto: "1000", moneda: "ARS", venceEl: "2026-12-01", claveEnvio: nuevaClave() }))), ok);
  assert.equal(await p.duenio.proyectoCuota.count({ where: { tenantId: p.a.id, proyectoId: null, concepto: "Alquiler" } }), 2, "dos pagos iguales en dos envíos: entran los dos");
});
