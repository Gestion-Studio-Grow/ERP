// ============================================================================
// CARRERA REAL de DOS ajustes del plan de cuotas del mismo proyecto, contra Postgres (base efímera migrada, app_rls + RLS).
// Hallazgo de la certificación (MEDIA): `regenerarCuotas` calculaba el plan con la ficha leída al arrancar y nada ponía en
// fila dos ajustes del mismo proyecto. Si el que leyó la ficha vieja escribía DESPUÉS que el que leyó la nueva, revivía
// una cuota que la ficha nueva ya no tiene: 150 a pagar por un ítem de 100.
//
// Escenario: un ítem con proveedor, costo $ 100.
//  1. Ficha del proveedor al 100 % → plan: `…:anticipo` 100, sin saldo.
//  2. La ficha pasa al 50 % → arranca A (lee la ficha al 50 %: anticipo 50 + saldo 50).
//  3. La ficha vuelve al 100 % → arranca B (lee la ficha al 100 %: anticipo 100, sin saldo).
//
// Intercalado determinista, sin esperas arbitrarias: el test inserta ANTES, en su propia transacción sin confirmar, una
// fila con la clave `…:saldo`. A actualiza el anticipo y se TRABA en el alta de `…:saldo` (el índice único espera a ver si
// la otra fila se confirma). Recién ahí la ficha vuelve al 100 % y arranca B. El test espera a que B termine o quede
// esperando un candado, y hace ROLLBACK: el alta de A sigue.
//  · sin el arreglo: B termina (anticipo 100, no ve ningún saldo) y A, al destrabarse, crea `…:saldo` 50 → 150;
//  · con el arreglo: B espera el candado del proyecto que tiene A; A termina (50 + 50) y B ajusta con la ficha vigente
//    (anticipo 100, saldo anulado) → 100.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio } from "@/test/base-efimera";

const laBase = baseEfimeraDelArchivo();
const DIA = 86_400_000;
const PLAZO_MS = 20_000;
/** Fecha fija de los datos (evento): el resultado no depende del reloj. */
const AHORA = Date.parse("2026-11-10T12:00:00Z");

test("dos ajustes del plan del mismo proyecto, uno con la ficha vieja: se ponen en fila y gana la ficha vigente", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  Object.assign(process.env as Record<string, string | undefined>, { NODE_ENV: "development", DB_CONNECTION_LIMIT: "8", DB_CONNECT_TIMEOUT_MS: "5000" });
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const { a } = base;
  const t0 = await duenio.tenant.findUniqueOrThrow({ where: { id: a.id }, select: { modules: true } });
  await duenio.tenant.update({ where: { id: a.id }, data: { modules: [...new Set([...t0.modules, "proyectos"])] } });
  const { regenerarCuotas } = await import("./gestion.server");

  // Proyecto confirmado con un ítem de proveedor: costo 100, anticipo del proveedor al 100 %.
  const evento = new Date(AHORA + 20 * DIA);
  const prov = await duenio.supplier.create({ data: { tenantId: a.id, name: "Carpintería de prueba" }, select: { id: true } });
  await duenio.proyectoProveedorFicha.create({ data: { tenantId: a.id, supplierId: prov.id, anticipoPct: 100 } });
  const proy = await duenio.proyecto.create({
    data: { tenantId: a.id, numero: (await duenio.proyecto.count()) + 900, clientId: a.clientes[0], nombre: "Stand dos ajustes", servicio: "ARQUITECTURA", etapa: "APROBADO", fechaArmado: new Date(evento.getTime() - 2 * DIA), fechaEvento: evento, fechaDesarme: new Date(evento.getTime() + DIA) },
    select: { id: true },
  });
  const pres = await duenio.proyectoPresupuesto.create({ data: { tenantId: a.id, proyectoId: proy.id, version: 1, estado: "APROBADO", token: `tok-${proy.id}`, ivaPct: 21 }, select: { id: true } });
  const item = await duenio.proyectoItem.create({ data: { tenantId: a.id, presupuestoId: pres.id, rubro: "General", descripcion: "Mueble", cantidad: 1, costo: 100, precio: 200, supplierId: prov.id }, select: { id: true } });

  const regenerar = async () => {
    const r = await ejecutarAccion({ negocio: a, usuario: { id: a.duenia.id } }, () => regenerarCuotas(a.id, proy.id));
    assert.equal(r.tipo, "respuesta", JSON.stringify(r));
  };
  const claveAnticipo = `${proy.id}:${item.id}:anticipo`;
  const claveSaldo = `${proy.id}:${item.id}:saldo`;
  const fichaAl = (anticipoPct: number) => duenio.proyectoProveedorFicha.update({ where: { supplierId: prov.id }, data: { anticipoPct } });
  const pagosVivos = () => duenio.proyectoCuota.findMany({ where: { tenantId: a.id, proyectoId: proy.id, tipo: "PAGO", anuladoEl: null }, select: { clave: true, monto: true } });

  await regenerar();
  assert.deepEqual(await pagosVivos(), [{ clave: claveAnticipo, monto: 100 }], "plan inicial: sólo el anticipo al 100 %");

  const c = new pg.Client({ connectionString: base.urlDuenio });
  await c.connect();
  try {
    await c.query("BEGIN");
    // La fila sin confirmar que frena el alta de `…:saldo` de A.
    await c.query(`INSERT INTO "ProyectoCuota" (id, "tenantId", "proyectoId", tipo, concepto, monto, "venceEl", clave) VALUES ($1, $2, $3, 'PAGO', 'traba del test', 1, $4, $5)`, [`traba-${proy.id}`, a.id, proy.id, evento, claveSaldo]);
    const yo = (await c.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0].pid;
    // Cuántas conexiones de la base están trabadas por otra (`pg_blocking_pids`: se ve aunque sean de otro rol). Adentro
    // de una transacción `pg_stat_activity` es una foto: se borra antes de cada vuelta para ver las conexiones nuevas.
    const esperando = async () => {
      await c.query("SELECT pg_stat_clear_snapshot()");
      return (await c.query<{ n: number }>(`SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND cardinality(pg_blocking_pids(pid)) > 0`)).rows[0].n;
    };

    // A: con la ficha al 50 %, se traba en el alta del saldo.
    await fichaAl(50);
    const enCursoA = regenerar();
    enCursoA.catch(() => {});
    let hasta = performance.now() + PLAZO_MS;
    while ((await c.query<{ n: number }>("SELECT count(*)::int AS n FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))", [yo])).rows[0].n < 1) {
      if (performance.now() > hasta) assert.fail("A no se trabó en el alta del saldo");
      await new Promise((r) => setImmediate(r));
    }

    // B: con la ficha de nuevo al 100 %. Termina (sin fila) o queda esperando un candado (con fila): cualquiera de las dos.
    await fichaAl(100);
    let terminoB = false;
    const enCursoB = regenerar().finally(() => {
      terminoB = true;
    });
    enCursoB.catch(() => {});
    hasta = performance.now() + PLAZO_MS;
    while (!terminoB && (await esperando()) < 2) {
      if (performance.now() > hasta) assert.fail("B ni terminó ni quedó esperando");
      await new Promise((r) => setImmediate(r));
    }

    await c.query("ROLLBACK");
    await Promise.all([enCursoA, enCursoB]);
  } finally {
    await c.end();
  }

  const pagos = await pagosVivos();
  assert.equal(pagos.reduce((s, x) => s + x.monto, 0), 100, `pagos vivos: ${JSON.stringify(pagos)}`);
  assert.deepEqual(pagos, [{ clave: claveAnticipo, monto: 100 }], "gana la ficha vigente: anticipo 100, sin saldo");
});
