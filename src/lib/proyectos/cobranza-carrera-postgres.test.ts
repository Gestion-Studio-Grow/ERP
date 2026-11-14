// ============================================================================
// CARRERAS REALES de la cobranza de un proyecto, contra Postgres (base efímera migrada, app_rls + RLS) y con las
// Server Actions reales (sesión de la dueña). Complementa la afirmación estática de `cobranza-propiedades.test.ts`
// («existe `trabarCobranza`»): acá se demuestra que el candado ordena dos pedidos que llegan A LA VEZ.
//
// La barrera es determinista, sin esperas arbitrarias: el test TOMA ANTES el mismo candado de la base que toma la
// acción (`pg_advisory_lock(hashtext(clave))`), lanza los pedidos uno por uno y, antes de lanzar el siguiente, espera
// a VER en `pg_locks` que el anterior quedó trabado en ese candado (con todas sus lecturas de afuera ya hechas). Con
// los dos adentro y trabados, suelta: Postgres los atiende en orden de llegada (FIFO), así que también se sabe quién
// gana. Si un pedido termina sin trabarse, el código no pasa por el candado y el test falla diciéndolo.
//
//  (a) dos cobros a la vez que sumados pasan el tope → entra uno solo; lo que falta cobrar nunca queda negativo.
//  (b) cobro manual y «Marcar cobrado» de una cuota a la vez (en los dos órdenes) → la plata entra una sola vez.
//  (c) T2 (#68) está en la rama: dos «Facturar» a la vez de la misma cuota → un solo comprobante y un solo envío.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type BaseEfimera } from "@/test/base-efimera";

const laBase = baseEfimeraDelArchivo();
const DIA = 86_400_000;
const PLAZO_MS = 20_000;
/** Fecha fija de los datos (vencimientos y evento): el resultado no depende del reloj. */
const AHORA = Date.parse("2026-11-10T12:00:00Z");

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
  Object.assign(process.env as Record<string, string | undefined>, {
    NODE_ENV: "development",
    DB_CONNECTION_LIMIT: "12",
    DB_CONNECT_TIMEOUT_MS: "5000",
    ARCA_INVOICING_ENABLED: "true",
  });
  delete (process.env as Record<string, string | undefined>).ARCA_MODO; // ARCA de mentira: nunca homologación ni real
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const { a } = base;
  const t0 = await duenio.tenant.findUniqueOrThrow({ where: { id: a.id }, select: { modules: true } });
  const modules = [...new Set([...t0.modules, "proyectos", "proyectos-facturacion", "arca"])];
  await duenio.tenant.update({ where: { id: a.id }, data: { modules, arcaCuit: "20111111112", arcaPuntoVenta: 1, arcaHomologacion: true, arcaCondicionIva: "RESPONSABLE_INSCRIPTO" } });

  const acciones = await import("./acciones");
  const ficha = await import("./acciones-ficha");
  const { cobranzasDelNegocio, tiposDeCambio } = await import("./cobranza.server");
  const { configProyectos } = await import("./datos.server");

  let numero = (await duenio.proyecto.count()) + 500;
  /** Proyecto de A confirmado, con fechas, aprobado por $ 1.210 (1.000 + IVA 21 %). */
  const proyecto = async () => {
    const evento = new Date(AHORA + 20 * DIA);
    const p = await duenio.proyecto.create({
      data: { tenantId: a.id, numero: ++numero, clientId: a.clientes[0], nombre: `Stand ${numero}`, servicio: "ARQUITECTURA", etapa: "APROBADO", fechaArmado: new Date(evento.getTime() - 2 * DIA), fechaEvento: evento, fechaDesarme: new Date(evento.getTime() + DIA) },
      select: { id: true },
    });
    const pres = await duenio.proyectoPresupuesto.create({ data: { tenantId: a.id, proyectoId: p.id, version: 1, estado: "APROBADO", token: `tok-${p.id}`, ivaPct: 21 }, select: { id: true } });
    await duenio.proyectoItem.create({ data: { tenantId: a.id, presupuestoId: pres.id, rubro: "General", descripcion: "Stand", cantidad: 1, precio: 1000 } });
    return p.id;
  };
  const cuota = async (proyectoId: string, monto = 1210) =>
    (await duenio.proyectoCuota.create({ data: { tenantId: a.id, proyectoId, tipo: "COBRO", concepto: "Anticipo", monto, moneda: "ARS", venceEl: new Date(AHORA + 5 * DIA), auto: false }, select: { id: true } })).id;
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
  const cobrar = (proyectoId: string, monto: number) => () => enSesion(() => acciones.registrarCobro(form({ proyectoId, medio: "TRANSFERENCIA", monto: String(monto) })));
  const marcar = (id: string) => () => enSesion(() => ficha.marcarCuota(form({ id, medio: "TRANSFERENCIA" })));
  /** La cobranza del proyecto, leída por la fuente única con la sesión de la dueña. */
  const cobranzaDe = (proyectoId: string) =>
    enSesion(async () => {
      const [config, tc] = await Promise.all([configProyectos(a.id), tiposDeCambio(a.id)]);
      return (await cobranzasDelNegocio(a.id, tc, config.margenPct, [proyectoId])).get(proyectoId)!;
    });
  /** Los cobros del proyecto y sus asientos de caja, vistos como dueño de las tablas. */
  const plata = async (proyectoId: string) => {
    const pagos = await duenio.proyectoPago.findMany({ where: { proyectoId, anuladoEl: null }, select: { id: true, monto: true } });
    const asientos = await duenio.cashMovement.count({ where: { proyectoPagoId: { in: pagos.map((x) => x.id) } } });
    return { pagos: pagos.length, suma: pagos.reduce((s, x) => s + x.monto, 0), asientos };
  };
  const claveCobranza = (proyectoId: string) => `cobranza-proyecto:${a.id}:${proyectoId}`;
  return { base, duenio, a, ficha, proyecto, cuota, form, enSesion, cobrar, marcar, cobranzaDe, plata, claveCobranza };
}

test("(a) dos cobros a la vez que sumados pasan el tope: entra uno solo y lo que falta cobrar nunca queda negativo", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const id = await p.proyecto();
  const [primero, segundo] = await enFila(p.base, p.claveCobranza(id), [p.cobrar(id, 800), p.cobrar(id, 800)]);
  assert.deepEqual(primero, { ok: true }, "el primero en llegar al candado cobra");
  assert.equal(segundo.ok, false, "el segundo ve el cobro del primero y no pasa el tope");
  assert.match(String((segundo as { error: string }).error), /410/, "el aviso dice lo que falta cobrar de verdad");
  assert.deepEqual(await p.plata(id), { pagos: 1, suma: 800, asientos: 1 }, "un cobro, un asiento de caja");
  const cob = await p.cobranzaDe(id);
  assert.equal(cob.saldo, 410);
  assert.ok(cob.saldo >= 0 && cob.porCobrar === 410, "lo que falta cobrar nunca queda negativo");
});

test("(b) cobro manual y «Marcar cobrado» de la misma cuota a la vez, en los dos órdenes: la plata entra una sola vez", async (t) => {
  const p = await preparar(t);
  if (!p) return;

  // Primero llega el cobro manual: «Marcar cobrado» relee adentro, ve que a la cuota ya no le falta nada y no graba.
  const id1 = await p.proyecto();
  const q1 = await p.cuota(id1);
  const [cobro1, marca1] = await enFila(p.base, p.claveCobranza(id1), [p.cobrar(id1, 1210), p.marcar(q1)]);
  assert.deepEqual(cobro1, { ok: true });
  assert.equal(marca1.ok, false, "«Marcar cobrado» no vuelve a cobrar lo que ya entró");
  assert.deepEqual(await p.plata(id1), { pagos: 1, suma: 1210, asientos: 1 });
  assert.equal((await p.duenio.proyectoCuota.findUniqueOrThrow({ where: { id: q1 } })).pagadoEl, null, "la cuota no quedó marcada con un cobro que no es suyo");
  const cob1 = await p.cobranzaDe(id1);
  assert.deepEqual([cob1.cobrado, cob1.saldo, cob1.porCobrar], [1210, 0, 0]);

  // Primero llega «Marcar cobrado»: el cobro manual relee adentro, ve que no falta nada y no pasa el tope.
  const id2 = await p.proyecto();
  const q2 = await p.cuota(id2);
  const [marca2, cobro2] = await enFila(p.base, p.claveCobranza(id2), [p.marcar(q2), p.cobrar(id2, 1210)]);
  assert.equal(marca2.ok, true, JSON.stringify(marca2));
  assert.equal(cobro2.ok, false, "el cobro manual no vuelve a cobrar lo que cobró la cuota");
  assert.deepEqual(await p.plata(id2), { pagos: 1, suma: 1210, asientos: 1 });
  assert.ok((await p.duenio.proyectoCuota.findUniqueOrThrow({ where: { id: q2 } })).pagadoEl, "la cuota quedó marcada");
  const cob2 = await p.cobranzaDe(id2);
  assert.deepEqual([cob2.cobrado, cob2.saldo, cob2.porCobrar], [1210, 0, 0]);
});

test("(c) T2: dos «Facturar» a la vez de la misma cuota → un solo comprobante y un solo envío", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  await p.duenio.outboxEvent.updateMany({ where: { processedAt: null }, data: { processedAt: new Date() } });
  const id = await p.proyecto();
  const q = await p.cuota(id);
  const facturar = () => p.enSesion(() => p.ficha.facturarCuota(p.form({ id: q, proyectoId: id })));
  // La escritura de la factura toma el candado de las facturas por cobro del negocio (`tomarCandadoFacturasDeCobro`).
  const [f1, f2] = await enFila(p.base, `facturas-cobro:${p.a.id}`, [facturar, facturar]);
  assert.equal(f1.ok, true, JSON.stringify(f1));
  assert.equal(f2.ok, true, JSON.stringify(f2));
  const ids = [f1, f2].map((r) => (r as { invoiceId?: string }).invoiceId);
  assert.ok(ids[0] && ids[0] === ids[1], "los dos pedidos devuelven la MISMA factura");
  const facturas = await p.duenio.invoice.findMany({ where: { proyectoCuotaId: q }, select: { id: true } });
  assert.equal(facturas.length, 1, "un solo comprobante para la cuota");
  const envios = (await p.duenio.outboxEvent.findMany({ where: { type: "InvoiceCreated" } })).filter((e) => (e.payload as { invoiceId?: string }).invoiceId === facturas[0].id);
  assert.equal(envios.length, 1, "un solo envío a ARCA");
  const historial = await p.duenio.proyectoCambio.count({ where: { tenantId: p.a.id, entidad: "ProyectoCuota", entidadId: q, campo: { startsWith: "Factura pedida" } } });
  assert.equal(historial, 1, "una sola línea de historial");
});
