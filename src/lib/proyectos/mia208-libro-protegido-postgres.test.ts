// ============================================================================
// GSG-MIA-208 · lo que halló la segunda corrida de Aurora (P1-v2, paso 9 y «Hallazgos»), contra Postgres de verdad
// (base efímera migrada, rol app_rls sin BYPASSRLS, Server Actions con sesión).
//
//  1  El libro de un proyecto está trabado EN LA BASE: como `app_rls`, borrar o cambiarle importe, tipo, medio, fecha o
//     vínculos a una fila de `CashMovement` con `proyectoPagoId` u `proyectoOrdenPagoId` falla y la fila queda igual,
//     también con N pedidos a la vez. Lo que no es de un proyecto sigue libre (asientos a mano, ajustes del cierre), y el
//     dueño de las tablas (consola del operador, limpieza de pruebas) no cambia. Migración:
//     prisma/migrations/20261121110000_caja_libro_proyecto_inmutable; reversa: rollback.sql en la misma carpeta.
//  3  El productor (rol de gestión PRODUCCION, usuario que no ve la plata) no puede «Marcar cobrado» ni «Anular»: el
//     servidor lo rechaza y no escribe nada.
//  4  A-06: `deleteLibroEntry` rechaza borrar la venta de un cobro de proyecto y su contraasiento.
// Sin Postgres local se saltea y lo dice; en CI, falla.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type BaseEfimera } from "@/test/base-efimera";

const laBase = baseEfimeraDelArchivo();
const MIGRACION = "20261121110000_caja_libro_proyecto_inmutable";
const CARPETA = path.join(process.cwd(), "prisma", "migrations", MIGRACION);
/** SQLSTATE `restrict_violation`: el que usa el disparador. */
const RESTRICCION = "23001";
/** Fecha fija del evento (tests deterministas): lejos en el futuro, así ningún cierre la alcanza. */
const EVENTO = new Date("2027-06-15T15:00:00Z");
const DIA = 86_400_000;

/** Una transacción como `app_rls` con el negocio puesto (como `tenantTransaction`). Devuelve las filas tocadas. */
async function comoApp(base: BaseEfimera, tenantId: string, sql: string, params: unknown[] = []): Promise<number> {
  const c = new pg.Client({ connectionString: base.urlApp });
  await c.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);
    const r = await c.query(sql, params);
    await c.query("COMMIT");
    return r.rowCount ?? 0;
  } catch (e) {
    await c.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    await c.end();
  }
}

async function comoDuenio(base: BaseEfimera, sql: string, params: unknown[] = []): Promise<pg.QueryResult> {
  const c = new pg.Client({ connectionString: base.urlDuenio });
  await c.connect();
  try {
    return await c.query(sql, params);
  } finally {
    await c.end();
  }
}

async function rechaza(p: Promise<unknown>, que: RegExp, contexto: string): Promise<void> {
  await assert.rejects(
    p,
    (e: unknown) => {
      const err = e as { code?: string; message?: string; detail?: string };
      assert.equal(err.code, RESTRICCION, `${contexto}: código ${String(err.code)} · ${String(err.message)}`);
      assert.match(`${String(err.message)} · ${String(err.detail)}`, que, contexto);
      return true;
    },
    contexto,
  );
}

const fila = async (base: BaseEfimera, id: string) => (await comoDuenio(base, `SELECT * FROM "CashMovement" WHERE id = $1`, [id])).rows[0] as Record<string, unknown> | undefined;

let numero = 7200;
/** Un proyecto aprobado con un ítem de $ 1.000 + IVA 21 %, sus cuotas generadas y el cobro del anticipo ($ 605) hecho y anulado por la dueña. */
async function proyectoConCobroAnulado(t: import("node:test").TestContext) {
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const { a } = base;
  const t0 = await duenio.tenant.findUniqueOrThrow({ where: { id: a.id }, select: { modules: true } });
  await duenio.tenant.update({ where: { id: a.id }, data: { modules: [...new Set([...t0.modules, "proyectos"])] } });
  const form = (c: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(c)) fd.set(k, v);
    return fd;
  };
  const en = async <R>(quien: "duenia" | "recepcion", fn: () => Promise<R>): Promise<R> => {
    const r = await ejecutarAccion({ negocio: a, usuario: { id: a[quien].id } }, fn);
    assert.equal(r.tipo, "respuesta", JSON.stringify(r));
    return (r as { valor: R }).valor;
  };
  const ficha = await import("./acciones-ficha");
  const gestion = await import("./gestion.server");
  const p = await duenio.proyecto.create({
    data: { tenantId: a.id, numero: ++numero, clientId: a.clientes[0], nombre: `Aurora MIA-208 ${numero}`, servicio: "ARQUITECTURA", etapa: "APROBADO", fechaArmado: new Date(EVENTO.getTime() - 2 * DIA), fechaEvento: EVENTO, fechaDesarme: new Date(EVENTO.getTime() + DIA) },
    select: { id: true },
  });
  const pres = await duenio.proyectoPresupuesto.create({ data: { tenantId: a.id, proyectoId: p.id, version: 1, estado: "APROBADO", token: `mia208-${p.id}`, ivaPct: 21 }, select: { id: true } });
  await duenio.proyectoItem.create({ data: { tenantId: a.id, presupuestoId: pres.id, rubro: "General", descripcion: "Stand", cantidad: 1, precio: 1000 } });
  await en("duenia", () => gestion.regenerarCuotas(a.id, p.id));
  const cuota = await duenio.proyectoCuota.findFirstOrThrow({ where: { proyectoId: p.id, tipo: "COBRO", clave: { endsWith: ":cliente:anticipo" } }, select: { id: true, monto: true } });
  assert.equal(cuota.monto, 605, "a mano: 1.000 × 1,21 ÷ 2 = 605");
  const cobro = await en("duenia", () => ficha.marcarCuota(form({ envio: `mia208-cobro-${numero}`, id: cuota.id, medio: "TRANSFERENCIA", cuenta: "ninguna" })));
  assert.equal(cobro.ok, true, JSON.stringify(cobro));
  const pago = await duenio.proyectoPago.findFirstOrThrow({ where: { proyectoId: p.id }, select: { id: true } });
  const anulo = await en("duenia", () => ficha.anularCobroFicha(form({ id: pago.id })));
  assert.equal(anulo.ok, true, JSON.stringify(anulo));
  const venta = await duenio.cashMovement.findFirstOrThrow({ where: { proyectoPagoId: pago.id, type: "VENTA" }, select: { id: true, amount: true } });
  const contra = await duenio.cashMovement.findFirstOrThrow({ where: { proyectoPagoId: pago.id, type: "EGRESO" }, select: { id: true, amount: true } });
  assert.deepEqual([venta.amount, contra.amount], [605, 605], "la venta y su contraasiento, $ 605 cada uno");
  return { base, duenio, a, form, en, ficha, proyectoId: p.id, cuotaId: cuota.id, pagoId: pago.id, venta: venta.id, contra: contra.id };
}

/** `produccion@` de la corrida: rol de gestión PRODUCCION, en el equipo como Productor, y un usuario del ERP que no ve la plata
 *  del negocio (sin «agenda:manage» fuera de la agenda: PROFESSIONAL). La base es una por archivo: la persona se reusa. */
async function comoProductor(p: NonNullable<Awaited<ReturnType<typeof proyectoConCobroAnulado>>>) {
  const { duenio, a } = p;
  await duenio.user.update({ where: { id: a.recepcion.id }, data: { role: "PROFESSIONAL" } });
  const persona = await duenio.proyectoPersona.upsert({
    where: { tenantId_userId: { tenantId: a.id, userId: a.recepcion.id } },
    create: { tenantId: a.id, userId: a.recepcion.id, nombre: "Producción de prueba", rol: "PRODUCCION" },
    update: { rol: "PRODUCCION", activa: true },
    select: { id: true },
  });
  await duenio.proyectoEquipo.create({ data: { tenantId: a.id, proyectoId: p.proyectoId, personaId: persona.id, funcion: "PRODUCTOR" } });
  return persona;
}

test("1 · como app_rls, la venta de un cobro de proyecto y su contraasiento no se borran ni se les cambia importe, tipo, medio, fecha ni vínculos", async (t) => {
  const p = await proyectoConCobroAnulado(t);
  if (!p) return;
  const { base, a, duenio } = p;
  for (const id of [p.venta, p.contra]) {
    const antes = await fila(base, id);
    // La reproducción del paso 9: DELETE 1 y UPDATE 1 del importe (antes del disparador).
    await rechaza(comoApp(base, a.id, `DELETE FROM "CashMovement" WHERE id = $1`, [id]), /no se borra/, `DELETE ${id}`);
    const cambios: Array<[string, string, unknown[]]> = [
      ["amount", `amount = 1`, []],
      ["type", `type = 'INGRESO'`, []],
      ["method", `method = 'EFECTIVO'`, []],
      ["occurredAt", `"occurredAt" = "occurredAt" - interval '1 day'`, []],
      ["proyectoPagoId", `"proyectoPagoId" = NULL`, []],
      ["sessionId", `"sessionId" = NULL, "proyectoPagoId" = "proyectoPagoId"`, []],
      ["tenantId", `"tenantId" = $2`, [base.b.id]],
      ["orderId", `"orderId" = $2`, [a.pedidos[0]]],
      ["createdBy", `"createdBy" = 'otro'`, []],
    ];
    for (const [columna, set, extra] of cambios) {
      if (columna === "sessionId" && antes?.sessionId === null) continue; // sin turno abierto no hay qué vaciar
      await rechaza(
        comoApp(base, a.id, `UPDATE "CashMovement" SET ${set} WHERE id = $1`, [id, ...extra]),
        new RegExp(`no se edita[^·]* · Campos: [^·]*\\b${columna}\\b`),
        `UPDATE ${set}`,
      );
    }
    assert.deepEqual(await fila(base, id), antes, "la fila quedó exactamente igual");
  }
  // El motivo no es plata: sigue libre (no hay acción que lo cambie hoy; no se traba lo que no hace falta).
  assert.equal(await comoApp(base, a.id, `UPDATE "CashMovement" SET reason = reason || ' ' WHERE id = $1`, [p.venta]), 1);
  // Borrar el cobro (la FK deja el vínculo en NULL) tampoco despega la venta: falla entero.
  await rechaza(comoApp(base, a.id, `DELETE FROM "ProyectoPago" WHERE id = $1`, [p.pagoId]), /no se edita/, "DELETE ProyectoPago");
  assert.equal(await duenio.cashMovement.count({ where: { proyectoPagoId: p.pagoId } }), 2, "las dos filas siguen con su cobro");
});

test("1 · carrera: 8 pedidos a la vez como app_rls (borrar y cambiar importe) fallan todos y el libro no cambia", async (t) => {
  const p = await proyectoConCobroAnulado(t);
  if (!p) return;
  const { base, a, duenio } = p;
  const antes = await duenio.cashMovement.findMany({ where: { tenantId: a.id }, orderBy: { id: "asc" } });
  const pedidos = Array.from({ length: 8 }, (_, i) =>
    i % 2 === 0
      ? comoApp(base, a.id, `DELETE FROM "CashMovement" WHERE id = $1`, [i % 4 === 0 ? p.venta : p.contra])
      : comoApp(base, a.id, `UPDATE "CashMovement" SET amount = amount + $2 WHERE id = $1`, [i % 4 === 1 ? p.venta : p.contra, i]),
  );
  const salidas = await Promise.allSettled(pedidos);
  assert.deepEqual(salidas.map((s) => s.status), Array(8).fill("rejected"), "ninguno pasa");
  for (const s of salidas) assert.equal((s as PromiseRejectedResult).reason?.code, RESTRICCION);
  assert.deepEqual(await duenio.cashMovement.findMany({ where: { tenantId: a.id }, orderBy: { id: "asc" } }), antes, "el libro quedó igual");
});

test("1 · el pago de una orden (proyectoOrdenPagoId) también está trabado; lo que no es de un proyecto y el dueño de las tablas siguen como antes", async (t) => {
  const p = await proyectoConCobroAnulado(t);
  if (!p) return;
  const { base, a, duenio } = p;
  const prov = await duenio.supplier.create({ data: { tenantId: a.id, name: "Proveedor MIA-208" }, select: { id: true } });
  // La orden tiene RLS forzada: se siembra con el negocio puesto en la transacción, como el dueño.
  const egreso = await duenio.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${a.id}, true)`;
    const orden = await tx.proyectoOrdenPago.create({ data: { tenantId: a.id, numero: 1, supplierId: prov.id, estado: "PAGADA", totalCentavos: BigInt(35_000_000), creadaPorId: a.duenia.id, creadaNombre: "Dueña", pagadaEl: EVENTO }, select: { id: true } });
    return tx.cashMovement.create({ data: { tenantId: a.id, type: "EGRESO", method: "TRANSFERENCIA", amount: 350_000, reason: "Orden de pago #1", proyectoOrdenPagoId: orden.id, createdBy: "user:dueña", occurredAt: EVENTO }, select: { id: true } });
  });
  await rechaza(comoApp(base, a.id, `DELETE FROM "CashMovement" WHERE id = $1`, [egreso.id]), /no se borra/, "DELETE orden");
  await rechaza(comoApp(base, a.id, `UPDATE "CashMovement" SET amount = 1 WHERE id = $1`, [egreso.id]), /Campos: amount/, "UPDATE orden");
  await rechaza(comoApp(base, a.id, `UPDATE "CashMovement" SET "proyectoOrdenPagoId" = NULL WHERE id = $1`, [egreso.id]), /Campos: proyectoOrdenPagoId/, "despegar la orden");
  // Un asiento a mano (sin proyecto), como los de `deleteLibroEntry` o los ajustes del cierre: app_rls lo cambia y lo borra.
  const manual = await duenio.cashMovement.create({ data: { tenantId: a.id, type: "INGRESO", method: "EFECTIVO", amount: 1_000, reason: "A mano", createdBy: "user:dueña", occurredAt: EVENTO }, select: { id: true } });
  assert.equal(await comoApp(base, a.id, `UPDATE "CashMovement" SET amount = 1500 WHERE id = $1`, [manual.id]), 1);
  assert.equal(await comoApp(base, a.id, `DELETE FROM "CashMovement" WHERE id = $1`, [manual.id]), 1);
  // El dueño de las tablas (consola del operador, reseteo de go-live, limpieza de pruebas) no cambia: el disparador es para la app.
  assert.equal((await comoDuenio(base, `DELETE FROM "CashMovement" WHERE id = $1`, [egreso.id])).rowCount, 1);
});

test("1 · la reversa saca la traba sin tocar filas y `prisma migrate deploy` la vuelve a poner", async (t) => {
  const p = await proyectoConCobroAnulado(t);
  if (!p) return;
  const { base, a } = p;
  const objetos = async () =>
    (
      await comoDuenio(
        base,
        `SELECT (SELECT count(*)::int FROM pg_trigger WHERE tgname = 'CashMovement_proyecto_inmutable') AS disparadores,
                (SELECT count(*)::int FROM pg_proc WHERE proname = 'caja_libro_proyecto_inmutable') AS funciones,
                (SELECT count(*)::int FROM "_prisma_migrations" WHERE migration_name = $1 AND finished_at IS NOT NULL) AS registrada`,
        [MIGRACION],
      )
    ).rows[0] as { disparadores: number; funciones: number; registrada: number };
  assert.deepEqual(await objetos(), { disparadores: 1, funciones: 1, registrada: 1 }, "migrate deploy la aplicó");
  const filasAntes = (await comoDuenio(base, `SELECT * FROM "CashMovement" ORDER BY id`)).rows;
  await comoDuenio(base, readFileSync(path.join(CARPETA, "rollback.sql"), "utf8"));
  assert.deepEqual(await objetos(), { disparadores: 0, funciones: 0, registrada: 0 });
  assert.deepEqual((await comoDuenio(base, `SELECT * FROM "CashMovement" ORDER BY id`)).rows, filasAntes, "ninguna fila cambió");
  // Sin la traba, la base vuelve a dejar cambiar el importe (lo que midió el paso 9); se deja como estaba.
  assert.equal(await comoApp(base, a.id, `UPDATE "CashMovement" SET amount = 1 WHERE id = $1`, [p.venta]), 1);
  assert.equal(await comoApp(base, a.id, `UPDATE "CashMovement" SET amount = 605 WHERE id = $1`, [p.venta]), 1);
  const salida = await new Promise<{ codigo: number; texto: string }>((ok) =>
    execFile(
      process.execPath,
      [path.join(process.cwd(), "node_modules", "prisma", "build", "index.js"), "migrate", "deploy"],
      { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: base.urlDuenio, MIGRATE_DATABASE_URL: base.urlDuenio }, timeout: 180_000 },
      (err, stdout, stderr) => ok({ codigo: err ? 1 : 0, texto: `${stdout}\n${stderr}` }),
    ),
  );
  assert.equal(salida.codigo, 0, salida.texto);
  assert.deepEqual(await objetos(), { disparadores: 1, funciones: 1, registrada: 1 });
  await rechaza(comoApp(base, a.id, `DELETE FROM "CashMovement" WHERE id = $1`, [p.venta]), /no se borra/, "otra vez trabado");
});

test("4 · A-06: deleteLibroEntry rechaza borrar la venta de un cobro de proyecto y su contraasiento", async (t) => {
  const p = await proyectoConCobroAnulado(t);
  if (!p) return;
  const { duenio } = p;
  const { deleteLibroEntry } = await import("@/lib/libro-caja-actions");
  const borrar = deleteLibroEntry as unknown as (previo: never, fd: FormData) => Promise<{ ok?: boolean; error?: string } | null>;
  for (const id of [p.venta, p.contra]) {
    const r: { ok?: boolean; error?: string } | null = await p.en("duenia", (): Promise<{ ok?: boolean; error?: string } | null> => borrar({ ok: false } as never, p.form({ id })));
    assert.ok(r, "la acción contesta");
    assert.equal(r.ok, false, `${id}: ${JSON.stringify(r)}`);
    assert.match((r as { error?: string }).error ?? "", /proyecto/i, "dice por qué: es de un proyecto");
  }
  assert.equal(await duenio.cashMovement.count({ where: { id: { in: [p.venta, p.contra] } } }), 2, "0 filas borradas");
});

test("3 · el productor (PRODUCCION, no ve la plata) no puede marcar cobrado, anular, registrar cobro ni gasto pagado, ni cargar o quitar cuotas: el servidor lo rechaza y no escribe nada", async (t) => {
  const p = await proyectoConCobroAnulado(t);
  if (!p) return;
  const { duenio, a } = p;
  await comoProductor(p);
  // Un cobro vivo (de la dueña) para que haya algo que anular, y un gasto pagado.
  const cobro = await p.en("duenia", () => p.ficha.marcarCuota(p.form({ envio: "mia208-cobro-0002", id: p.cuotaId, medio: "TRANSFERENCIA", cuenta: "ninguna" })));
  assert.equal(cobro.ok, true, JSON.stringify(cobro));
  const vivo = await duenio.proyectoPago.findFirstOrThrow({ where: { proyectoId: p.proyectoId, anuladoEl: null }, select: { id: true } });
  const gasto = await duenio.proyectoGasto.create({ data: { tenantId: a.id, proyectoId: p.proyectoId, descripcion: "Flete", neto: 10_000, pagadoEl: EVENTO, medio: "EFECTIVO", pagadoPor: "Dueña" }, select: { id: true } });
  const otra = await duenio.proyectoCuota.findFirstOrThrow({ where: { proyectoId: p.proyectoId, tipo: "COBRO", pagadoEl: null, anuladoEl: null, prevista: false }, select: { id: true } });
  // MIA-213: una cuota cargada a mano (de la dueña), para intentar quitarla.
  const aMano = await duenio.proyectoCuota.create({ data: { tenantId: a.id, proyectoId: p.proyectoId, tipo: "COBRO", concepto: "Extra a mano", monto: 100, moneda: "ARS", venceEl: new Date(EVENTO.getTime() - 30 * DIA), auto: false }, select: { id: true } });
  const acciones = await import("./acciones");
  const foto = async () => ({
    pagos: await duenio.proyectoPago.findMany({ where: { tenantId: a.id }, orderBy: { id: "asc" } }),
    gastos: await duenio.proyectoGasto.findMany({ where: { tenantId: a.id }, orderBy: { id: "asc" } }),
    libro: await duenio.cashMovement.count({ where: { tenantId: a.id } }),
    cuotas: await duenio.proyectoCuota.findMany({ where: { tenantId: a.id }, orderBy: { id: "asc" } }),
  });
  const antes = await foto();
  const intentos = {
    "Marcar cobrado": () => p.ficha.marcarCuota(p.form({ envio: "mia208-productor-0001", id: otra.id, medio: "EFECTIVO", cuenta: "ninguna" })),
    "Anular cobro": () => p.ficha.anularCobroFicha(p.form({ id: vivo.id })),
    "Anular gasto": () => p.ficha.anularGastoFicha(p.form({ id: gasto.id })),
    // MIA-213 (certificación de MIA-208, C3): «Registrar cobro» asentaba una VENTA; «Registrar gasto» pagado, un EGRESO.
    "Registrar cobro": () => acciones.registrarCobro(p.form({ proyectoId: p.proyectoId, medio: "EFECTIVO", monto: "100" })),
    "Registrar gasto pagado": () => acciones.registrarGasto(p.form({ proyectoId: p.proyectoId, descripcion: "Flete del productor", neto: "100", pagado: "on", medio: "EFECTIVO" })),
    // Decisión de ORQ-007: tampoco carga ni quita cuotas a mano.
    "Movimiento manual": () => p.ficha.crearMovimientoManual(p.form({ proyectoId: p.proyectoId, tipo: "PAGO", concepto: "Pago del productor", monto: "100", moneda: "ARS", venceEl: "2027-05-01" })),
    "Quitar movimiento": () => p.ficha.quitarMovimiento(p.form({ proyectoId: p.proyectoId, id: aMano.id })),
  };
  // Todas las puertas en una corrida: las que no rechazan con el texto de la plata se listan juntas.
  const pasaron: string[] = [];
  for (const [que, fn] of Object.entries(intentos)) {
    const r: { ok: boolean; error?: string } = await p.en("recepcion", fn);
    if (r.ok || !/plata del negocio/.test(r.error ?? "")) pasaron.push(`${que}: ${JSON.stringify(r)}`);
  }
  assert.deepEqual(pasaron, [], "cada acción rechaza y dice por qué");
  assert.deepEqual(await foto(), antes, "nada escrito");
});

// MIA-213 · 4: PRODUCCION tiene `rendiciones: V` (`gestion-core.ts`). «Ver» alcanza para rendir lo propio, que crea el gasto
// pagado por la persona SIN asiento de caja (`acciones-rendiciones.ts`, `rendirGasto`). Lo que mueve el libro (aprobar,
// reintegrar, entregar y cerrar anticipos) pide Rendiciones en «editar»: el productor lo intenta y el libro no cambia.
test("5 · el productor (rendiciones: ver) no mueve plata por Rendiciones: aprobar, reintegrar, entregar y cerrar anticipos se rechazan y el libro no cambia", async (t) => {
  const p = await proyectoConCobroAnulado(t);
  if (!p) return;
  const { duenio, a } = p;
  const persona = await comoProductor(p);
  // Un anticipo abierto a su nombre: cerrarlo con devolución asentaría un INGRESO.
  const anticipo = await duenio.proyectoAnticipo.create({ data: { tenantId: a.id, personaId: persona.id, proyectoId: p.proyectoId, montoCentavos: 50_000 }, select: { id: true } });
  const rendiciones = await import("./acciones-rendiciones");
  const foto = async () => ({
    libro: await duenio.cashMovement.count({ where: { tenantId: a.id } }),
    anticipos: await duenio.proyectoAnticipo.findMany({ where: { tenantId: a.id }, orderBy: { id: "asc" } }),
    gastos: await duenio.proyectoGasto.count({ where: { tenantId: a.id } }),
  });
  const antes = await foto();
  const intentos = {
    "Aprobar rendición": () => rendiciones.aprobarRendicion(p.form({ id: "rendicion-inexistente" })),
    "Reintegrar directo": () => rendiciones.reintegrarDirecto(p.form({ id: "rendicion-inexistente", medio: "EFECTIVO" })),
    "Entregar anticipo": () => rendiciones.entregarAnticipo(p.form({ personaId: persona.id, proyectoId: p.proyectoId, medio: "EFECTIVO", monto: "500", clave: "mia213-anticipo-0001" })),
    "Cerrar anticipo": () => rendiciones.cerrarAnticipo(p.form({ id: anticipo.id, medio: "EFECTIVO" })),
  };
  const pasaron: string[] = [];
  for (const [que, fn] of Object.entries(intentos)) {
    const r: { ok: boolean; error?: string } = await p.en("recepcion", fn);
    if (r.ok || !/Rendiciones en «editar»/.test(r.error ?? "")) pasaron.push(`${que}: ${JSON.stringify(r)}`);
  }
  assert.deepEqual(pasaron, [], "cada acción rechaza en la puerta y dice por qué");
  assert.deepEqual(await foto(), antes, "el libro, los anticipos y los gastos no cambian");
});
