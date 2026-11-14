// ============================================================================
// CARRERA REAL del ajuste del plan de cuotas, contra Postgres (base efímera migrada, app_rls + RLS).
// Cubre el arreglo de 5faac2b (`gestion.server.ts`, `aplicarPlan`): si el `updateMany` que anula las cuotas que
// sobran anula MENOS de las esperadas (una se marcó pagada en el medio), el plan se calculó sin descontarla y hay
// que dar otra pasada.
//
// Escenario: un ítem con proveedor, costo $ 100 y anticipo del proveedor al 50 % → dos cuotas de pago
// (`…:anticipo` 50 y `…:saldo` 50). El anticipo pasa al 100 %: `…:saldo` sale del plan y `…:anticipo` sube a 100.
// Mientras `regenerarCuotas` corre, se marca pagada `…:saldo`.
//
// Intercalado determinista, sin esperas arbitrarias: el test toma ANTES un candado de fila (`SELECT … FOR UPDATE`)
// sobre `…:saldo`, en su propia transacción. La primera pasada de `regenerarCuotas` lee las cuotas (un SELECT simple
// no se traba), ajusta el resto del plan y se TRABA recién en el `UPDATE` que anula `…:saldo`. El test espera a VER
// que su conexión bloquea a otra (`pg_blocking_pids`), marca `…:saldo` pagada en su transacción y hace COMMIT.
// Postgres (READ COMMITTED) reevalúa el WHERE del UPDATE trabado (`pagadoEl IS NULL`) → no anula nada (count 0).
//  · con el arreglo: 0 < 1 → otra pasada, que descuenta la pagada → `…:anticipo` = 50;
//  · sin el arreglo: el ajuste termina con `…:anticipo` = 100 y se paga 150 por un ítem de 100.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio } from "@/test/base-efimera";

const laBase = baseEfimeraDelArchivo();
const DIA = 86_400_000;
const PLAZO_MS = 20_000;
/** Fecha fija de los datos (evento, marca): el resultado no depende del reloj. */
const AHORA = Date.parse("2026-11-10T12:00:00Z");

test("una cuota que sobra se marca pagada mientras se ajusta el plan: el plan la descuenta y no la anula", async (t) => {
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

  // Proyecto confirmado con un ítem de proveedor: costo 100, anticipo del proveedor 50 %.
  const evento = new Date(AHORA + 20 * DIA);
  const prov = await duenio.supplier.create({ data: { tenantId: a.id, name: "Carpintería de prueba" }, select: { id: true } });
  await duenio.proyectoProveedorFicha.create({ data: { tenantId: a.id, supplierId: prov.id, anticipoPct: 50 } });
  const proy = await duenio.proyecto.create({
    data: { tenantId: a.id, numero: (await duenio.proyecto.count()) + 900, clientId: a.clientes[0], nombre: "Stand carrera plan", servicio: "ARQUITECTURA", etapa: "APROBADO", fechaArmado: new Date(evento.getTime() - 2 * DIA), fechaEvento: evento, fechaDesarme: new Date(evento.getTime() + DIA) },
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
  const cuotaDe = (clave: string) => duenio.proyectoCuota.findUniqueOrThrow({ where: { tenantId_clave: { tenantId: a.id, clave } }, select: { id: true, monto: true, pagadoEl: true, anuladoEl: true } });

  await regenerar();
  assert.equal((await cuotaDe(claveAnticipo)).monto, 50, "plan inicial: anticipo 50");
  const saldo = await cuotaDe(claveSaldo);
  assert.equal(saldo.monto, 50, "plan inicial: saldo 50");

  // El anticipo pasa al 100 %: el saldo sale del plan.
  await duenio.proyectoProveedorFicha.update({ where: { supplierId: prov.id }, data: { anticipoPct: 100 } });

  const c = new pg.Client({ connectionString: base.urlDuenio });
  await c.connect();
  try {
    await c.query("BEGIN");
    await c.query(`SELECT id FROM "ProyectoCuota" WHERE id = $1 FOR UPDATE`, [saldo.id]);
    const yo = (await c.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0].pid;

    let termino = false;
    const enCurso = regenerar().finally(() => (termino = true));
    enCurso.catch(() => {}); // el error se ve al esperar abajo
    const hasta = performance.now() + PLAZO_MS; // plazo de espera (monotónico), no un dato del test
    // Espera una CONDICIÓN (el ajuste trabado detrás del candado de la cuota), no un tiempo.
    while ((await c.query<{ n: number }>("SELECT count(*)::int AS n FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))", [yo])).rows[0].n < 1) {
      if (termino) {
        await c.query("ROLLBACK");
        await enCurso;
        assert.fail("el ajuste terminó sin trabarse en la cuota que sobra: no llegó al UPDATE que la anula");
      }
      if (performance.now() > hasta) assert.fail(`el ajuste no se trabó en la cuota en ${PLAZO_MS} ms`);
      await new Promise((r) => setImmediate(r));
    }
    // El ajuste ya leyó las cuotas (con el saldo sin pagar) y espera para anularlo: se marca pagado y se suelta.
    await c.query(`UPDATE "ProyectoCuota" SET "pagadoEl" = $2, "pagadoPor" = 'Dueña', medio = 'TRANSFERENCIA' WHERE id = $1`, [saldo.id, new Date(AHORA)]);
    await c.query("COMMIT");
    await enCurso;
  } finally {
    await c.end();
  }

  const saldoDespues = await cuotaDe(claveSaldo);
  assert.ok(saldoDespues.pagadoEl, "el saldo sigue pagado");
  assert.equal(saldoDespues.anuladoEl, null, "el saldo pagado no se anuló");
  assert.equal(saldoDespues.monto, 50, "al saldo pagado no se le tocó el monto");
  const anticipo = await cuotaDe(claveAnticipo);
  assert.equal(anticipo.anuladoEl, null);
  assert.equal(anticipo.monto, 50, "el plan descontó el saldo pagado: el anticipo queda en 50, no en 100 (se pagarían 150 por 100)");
  const pagos = await duenio.proyectoCuota.findMany({ where: { tenantId: a.id, proyectoId: proy.id, tipo: "PAGO", anuladoEl: null }, select: { monto: true } });
  assert.equal(pagos.reduce((s, x) => s + x.monto, 0), 100, "lo que se le paga al proveedor suma el costo del ítem");
});
