// ============================================================================
// CARRERAS DE PLATA que quedaron fuera de `doble-envio-postgres.test.ts`, contra Postgres (base efímera migrada, app_rls +
// RLS) y con las Server Actions reales (sesión de la dueña). Mismo arnés y mismas barreras deterministas (pg_locks del
// candado consultivo de la cobranza; sin esperas arbitrarias).
//
//  · 7 · «Registrar cobro» desde dos pestañas (claves de envío distintas) en un proyecto SIN presupuesto aprobado: no
//        hay tope que frene el segundo. Ahora el servidor pide confirmación si hace poco entró un cobro igual.
//  · 3 · «Anular gasto»: lo que se registra (el importe del cambio) se lee adentro de la transacción, ya en fila.
//  · 5 · DIAGNÓSTICO: «Marcar cobrada» desde Bancos asienta lo que le falta a la cuota, no el importe del movimiento.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { randomBytes } from "node:crypto";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type BaseEfimera } from "@/test/base-efimera";

const laBase = baseEfimeraDelArchivo();
const DIA = 86_400_000;
const PLAZO_MS = 20_000;
const AHORA = Date.parse("2026-11-10T12:00:00Z");

type Res = { ok: boolean; error?: string; confirmar?: string; listo?: string };

/** Pedidos que esperan el candado consultivo `clave` (misma cuenta que `doble-envio-postgres.test.ts`). */
async function trabadosEnCandado(c: pg.Client, clave: string): Promise<number> {
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

/** Lanza los pedidos de a uno; cada uno, recién cuando el anterior quedó esperando (`cuantos() >= i + 1`). */
async function lanzarEnFila<T>(pedidos: readonly (() => Promise<T>)[], cuantos: () => Promise<number>, que: string): Promise<Promise<T>[]> {
  const enCurso: Promise<T>[] = [];
  const terminados = new Set<number>();
  for (let i = 0; i < pedidos.length; i++) {
    const p = pedidos[i]();
    p.then(() => terminados.add(i), () => terminados.add(i));
    enCurso.push(p);
    const hasta = performance.now() + PLAZO_MS;
    while ((await cuantos()) < i + 1) {
      if (terminados.has(i)) {
        const r = await p.catch((e: unknown) => e);
        assert.fail(`el pedido ${i + 1} terminó sin esperar ${que}: ${JSON.stringify(r instanceof Error ? r.message : r)}`);
      }
      if (performance.now() > hasta) assert.fail(`el pedido ${i + 1} no llegó a ${que} en ${PLAZO_MS} ms`);
      await new Promise((r) => setImmediate(r));
    }
  }
  return enCurso;
}

/**
 * Traba el candado, lanza los pedidos en fila y, con todos esperando, corre `mientras` (lo que pasa en el medio: otra
 * pantalla que cambia algo). Después suelta y espera a todos.
 */
async function enFilaDelCandado<T>(base: BaseEfimera, clave: string, pedidos: readonly (() => Promise<T>)[], mientras?: () => Promise<unknown>): Promise<T[]> {
  const c = new pg.Client({ connectionString: base.urlDuenio });
  await c.connect();
  try {
    assert.equal(await trabadosEnCandado(c, clave), 0);
    await c.query("SELECT pg_advisory_lock(hashtext($1))", [clave]);
    let enCurso: Promise<T>[];
    try {
      enCurso = await lanzarEnFila(pedidos, () => trabadosEnCandado(c, clave), `el candado «${clave}»`);
      await mientras?.();
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
  Object.assign(process.env as Record<string, string | undefined>, { NODE_ENV: "development", DB_CONNECTION_LIMIT: "12", DB_CONNECT_TIMEOUT_MS: "5000" });
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const { a } = base;
  const t0 = await duenio.tenant.findUniqueOrThrow({ where: { id: a.id }, select: { modules: true } });
  await duenio.tenant.update({ where: { id: a.id }, data: { modules: [...new Set([...t0.modules, "proyectos"])] } });

  const acciones = await import("./acciones");
  const ficha = await import("./acciones-ficha");

  let numero = (await duenio.proyecto.count()) + 900;
  /** Proyecto confirmado de A; con `aprobado`, presupuesto aprobado por $ 1.210 (tope del cobro). */
  const proyecto = async (aprobado: boolean) => {
    const evento = new Date(AHORA + 20 * DIA);
    const p = await duenio.proyecto.create({
      data: { tenantId: a.id, numero: ++numero, clientId: a.clientes[0], nombre: `Stand ${numero}`, servicio: "ARQUITECTURA", etapa: "APROBADO", fechaArmado: new Date(evento.getTime() - 2 * DIA), fechaEvento: evento, fechaDesarme: new Date(evento.getTime() + DIA) },
      select: { id: true },
    });
    if (aprobado) {
      const pres = await duenio.proyectoPresupuesto.create({ data: { tenantId: a.id, proyectoId: p.id, version: 1, estado: "APROBADO", token: `tok-${p.id}`, ivaPct: 21 }, select: { id: true } });
      await duenio.proyectoItem.create({ data: { tenantId: a.id, presupuestoId: pres.id, rubro: "General", descripcion: "Stand", cantidad: 1, precio: 1000 } });
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
  /** Una clave de envío nueva: la que el navegador genera para cada cobro (una por pestaña). */
  const clave = () => randomBytes(12).toString("hex");
  /** «Registrar cobro» como lo manda el navegador; `extra` pisa el medio o suma la confirmación. */
  const cobrar = (proyectoId: string, monto: number, claveEnvio: string, extra: Record<string, string> = {}) => () =>
    enSesion(() => acciones.registrarCobro(form({ proyectoId, medio: "TRANSFERENCIA", monto: String(monto), nota: "anticipo", claveEnvio, ...extra })) as Promise<Res>);
  const plata = async (proyectoId: string) => {
    const pagos = await duenio.proyectoPago.findMany({ where: { proyectoId, anuladoEl: null }, select: { id: true, monto: true } });
    const asientos = await duenio.cashMovement.count({ where: { proyectoPagoId: { in: pagos.map((x) => x.id) } } });
    return { pagos: pagos.length, suma: pagos.reduce((s, x) => s + x.monto, 0), asientos };
  };
  const claveCobranza = (proyectoId: string) => `cobranza-proyecto:${a.id}:${proyectoId}`;
  return { base, a, duenio, enSesion, acciones, ficha, proyecto, form, clave, cobrar, plata, claveCobranza };
}

// ── 7 · Registrar cobro desde dos pestañas, sin presupuesto aprobado ─────────────

test("7.a dos pestañas con el mismo cobro a la vez (claves distintas, sin tope): entra uno y el otro pide confirmación", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const id = await p.proyecto(false);
  const [r1, r2] = await enFilaDelCandado(p.base, p.claveCobranza(id), [p.cobrar(id, 1210, p.clave()), p.cobrar(id, 1210, p.clave())]);
  assert.deepEqual(r1, { ok: true });
  assert.equal(r2.ok, false, "el segundo no se graba solo");
  assert.ok(r2.confirmar, `pide confirmación explícita: ${JSON.stringify(r2)}`);
  assert.deepEqual(await p.plata(id), { pagos: 1, suma: 1210, asientos: 1 });
});

test("7.b uno detrás del otro: el segundo pide confirmación; tildada la casilla, entra", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const id = await p.proyecto(false);
  assert.deepEqual(await p.cobrar(id, 1210, p.clave())(), { ok: true });
  const r = await p.cobrar(id, 1210, p.clave())();
  assert.equal(r.ok, false);
  assert.ok(r.confirmar);
  assert.deepEqual(await p.plata(id), { pagos: 1, suma: 1210, asientos: 1 }, "sin confirmar no graba nada");
  // El navegador renueva la clave al recibir respuesta: el reenvío confirmado llega con otra.
  assert.deepEqual(await p.cobrar(id, 1210, p.clave(), { confirmaRepetido: "1" })(), { ok: true });
  assert.deepEqual(await p.plata(id), { pagos: 2, suma: 2420, asientos: 2 });
});

test("7.c el mismo envío repetido (misma clave) sigue devolviendo bien, sin duplicar ni pedir confirmación", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const id = await p.proyecto(false);
  const k = p.clave();
  const iguales = await enFilaDelCandado(p.base, p.claveCobranza(id), [p.cobrar(id, 800, k), p.cobrar(id, 800, k)]);
  assert.deepEqual(iguales, [{ ok: true }, { ok: true }]);
  assert.deepEqual(await p.cobrar(id, 800, k)(), { ok: true });
  assert.deepEqual(await p.plata(id), { pagos: 1, suma: 800, asientos: 1 });
});

test("7.d no confunde cobros distintos: otro monto, otro medio, uno anulado, uno viejo y otro proyecto entran sin preguntar", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const id = await p.proyecto(false);
  assert.deepEqual(await p.cobrar(id, 500, p.clave())(), { ok: true });
  assert.deepEqual(await p.cobrar(id, 501, p.clave())(), { ok: true }, "otro monto");
  assert.deepEqual(await p.cobrar(id, 500, p.clave(), { medio: "EFECTIVO" })(), { ok: true }, "otro medio");
  assert.deepEqual(await p.cobrar(await p.proyecto(false), 500, p.clave())(), { ok: true }, "otro proyecto");
  // El de $ 500 por transferencia se anula: uno igual después no es repetido.
  await p.duenio.proyectoPago.updateMany({ where: { proyectoId: id, monto: 500, medio: "TRANSFERENCIA" }, data: { anuladoEl: new Date(), anuladoPor: "QA" } });
  assert.deepEqual(await p.cobrar(id, 500, p.clave())(), { ok: true }, "el igual está anulado");
  // Hace más de 10 minutos: es otro cobro.
  await p.duenio.proyectoPago.updateMany({ where: { proyectoId: id }, data: { createdAt: new Date(Date.now() - 11 * 60_000) } });
  assert.deepEqual(await p.cobrar(id, 501, p.clave())(), { ok: true }, "el igual es de hace 11 minutos");
  assert.deepEqual(await p.plata(id), { pagos: 4, suma: 2002, asientos: 4 });
});

test("7.e con presupuesto aprobado también: dos pestañas con el mismo cobro dentro del saldo, entra uno y el otro pide confirmación", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const id = await p.proyecto(true);
  const [r1, r2] = await enFilaDelCandado(p.base, p.claveCobranza(id), [p.cobrar(id, 600, p.clave()), p.cobrar(id, 600, p.clave())]);
  assert.deepEqual(r1, { ok: true });
  assert.equal(r2.ok, false, "el tope no lo frena (entra en el saldo): lo frena el cobro igual de recién");
  assert.ok(r2.confirmar, JSON.stringify(r2));
  assert.deepEqual(await p.plata(id), { pagos: 1, suma: 600, asientos: 1 });
  // Confirmado entra, mientras no pase el tope; el tope se controla primero (no se pide un sí para algo que no entra).
  assert.deepEqual(await p.cobrar(id, 600, p.clave(), { confirmaRepetido: "1" })(), { ok: true });
  const pasado = await p.cobrar(id, 600, p.clave())();
  assert.equal(pasado.ok, false);
  assert.equal(pasado.confirmar, undefined, "pasa el tope: avisa el tope, no pide confirmación");
  assert.deepEqual(await p.plata(id), { pagos: 2, suma: 1200, asientos: 2 });
});

// ── 3 · Anular gasto: lo que se registra se lee adentro ───────────────────────

async function gastoPagado(p: NonNullable<Awaited<ReturnType<typeof preparar>>>, proyectoId: string, neto: number, iva: number) {
  const g = await p.duenio.proyectoGasto.create({ data: { tenantId: p.a.id, proyectoId, descripcion: "Alfombra", neto, iva, pagadoEl: new Date(AHORA), medio: "TRANSFERENCIA", pagadoPor: "QA" }, select: { id: true } });
  await p.duenio.cashMovement.create({ data: { tenantId: p.a.id, type: "EGRESO", method: "MP", amount: neto + iva, reason: "Gasto de prueba", proyectoGastoId: g.id, createdBy: "QA" } });
  return g.id;
}

test("3.a anular un gasto mientras otra pantalla lo cambia: el importe registrado es el de adentro de la fila, no el leído antes", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const proyectoId = await p.proyecto(true);
  const gastoId = await gastoPagado(p, proyectoId, 1000, 210);
  // El cambio de importe no tiene pantalla hoy (ningún camino edita neto/iva): se hace por base, como lo haría una futura.
  const [r] = await enFilaDelCandado(
    p.base,
    p.claveCobranza(proyectoId),
    [() => p.enSesion(() => p.ficha.anularGastoFicha(p.form({ id: gastoId })) as Promise<Res>)],
    () => p.duenio.proyectoGasto.update({ where: { id: gastoId }, data: { neto: 2000, iva: 420 } }),
  );
  assert.equal(r.ok, true, JSON.stringify(r));
  const cambio = await p.duenio.proyectoCambio.findFirst({ where: { entidadId: gastoId, campo: "Gasto anulado" }, select: { antes: true } });
  assert.equal(cambio?.antes, "2420", "el historial dice el importe que tenía el gasto al anularlo");
  // La contrapartida de caja ya salía de adentro: devuelve exactamente lo que salió.
  const ingresos = await p.duenio.cashMovement.findMany({ where: { proyectoGastoId: gastoId, type: "INGRESO" }, select: { amount: true } });
  assert.deepEqual(ingresos.map((x) => x.amount), [1210]);
});

test("3.b dos anulaciones del mismo gasto a la vez: una sola contrapartida y un solo registro; las dos responden bien", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const proyectoId = await p.proyecto(true);
  const gastoId = await gastoPagado(p, proyectoId, 1000, 210);
  const anular = () => p.enSesion(() => p.ficha.anularGastoFicha(p.form({ id: gastoId })) as Promise<Res>);
  const r = await enFilaDelCandado(p.base, p.claveCobranza(proyectoId), [anular, anular]);
  assert.ok(r.every((x) => x.ok), JSON.stringify(r));
  assert.equal(await p.duenio.cashMovement.count({ where: { proyectoGastoId: gastoId, type: "INGRESO" } }), 1);
  assert.equal(await p.duenio.proyectoCambio.count({ where: { entidadId: gastoId, campo: "Gasto anulado" } }), 1);
});

// ── 5 · DIAGNÓSTICO: «Marcar cobrada» desde Bancos ────────────────────────────

test("5 DIAGNÓSTICO: banco $ 1.000 conciliado con una cuota de $ 1.210 → «Marcar cobrada» asienta $ 1.210 (el pendiente), no lo del banco", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const proyectoId = await p.proyecto(true);
  const cuotaId = (await p.duenio.proyectoCuota.create({ data: { tenantId: p.a.id, proyectoId, tipo: "COBRO", concepto: "Anticipo", monto: 1210, moneda: "ARS", venceEl: new Date(AHORA + 5 * DIA), auto: false }, select: { id: true } })).id;
  const cuenta = await p.duenio.proyectoCuentaBanco.create({ data: { tenantId: p.a.id, nombre: "Banco" }, select: { id: true, saldo: true } });
  await p.duenio.proyectoMovBanco.create({ data: { tenantId: p.a.id, cuentaId: cuenta.id, fecha: new Date(AHORA), descripcion: "Transferencia 1000", importe: 1000, cuotaId } });
  // Lo que manda «Marcar cobrada» de Bancos (_bancos.tsx → MarcarCuota sin `falta`): id, medio y cuenta; ni monto ni `visto`.
  const r = await p.enSesion(() => p.ficha.marcarCuota(p.form({ envio: crypto.randomUUID(), id: cuotaId, medio: "TRANSFERENCIA", cuenta: cuenta.id })) as Promise<Res>);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(await p.plata(proyectoId), { pagos: 1, suma: 1210, asientos: 1 }, "DEFECTO: se asienta el pendiente de la cuota, no los $ 1.000 del banco");
  const saldo = (await p.duenio.proyectoCuentaBanco.findUniqueOrThrow({ where: { id: cuenta.id }, select: { saldo: true } })).saldo;
  assert.equal(saldo - cuenta.saldo, 1210, "DEFECTO: la cuenta sube $ 1.210 aunque el banco muestra $ 1.000");
  assert.ok(await p.duenio.proyectoCuota.count({ where: { id: cuotaId, pagadoEl: { not: null } } }), "y la cuota queda cobrada entera");
});
