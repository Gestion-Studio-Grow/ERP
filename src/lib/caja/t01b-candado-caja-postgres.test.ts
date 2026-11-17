// ============================================================================
// MIA-075 · T01b · todo asiento de caja dentro del candado, contra Postgres real: base efímera migrada, rol app_rls
// sin BYPASSRLS, las Server Actions y los servicios reales, y `cerrarDia` real del otro lado.
//
// La carrera (cert. MIA-064, corrección 4): el cierre del día corre en Serializable y saca su foto en la primera
// sentencia, ANTES de esperar el candado `cierre-dia:<negocio>`. Un asiento que confirma mientras el cierre espera no
// entra en esa foto: el cierre cierra sin contarlo (asienta un sobrante o un faltante falso) y el libro queda con una
// fila en un día cerrado. T01 lo cerró para Proyectos (`transaccionQueAsienta`); acá se prueba cada otro camino que
// escribe en `CashMovement`.
//
// Cada caso, con dos conexiones más que la app:
//   1. `h` toma el candado del negocio (como un cierre que todavía no confirmó);
//   2. arranca el `cerrarDia` real: saca su foto y queda esperando el candado (visto en `pg_locks`);
//   3. arranca el camino real que asienta (o borra) en la caja;
//   4. `h` suelta. El cierre corre con la foto del paso 2.
// Invariante (escrito a mano antes de correr, R7): lo que el libro tiene del día es lo que el cierre contó, y el
// camino que no entró lo dice con «cerrada». Sin candado en el camino, el asiento confirma en el paso 3 y el cierre no
// lo ve: el libro tiene una fila más (o una menos, si borró) que lo que el cierre contó. Con candado, el camino espera
// detrás del cierre, ve el día cerrado y se rechaza: libro y cierre coinciden.
//
// Reloj fijado: `Date` vale AHORA en todo el archivo.
// ============================================================================

import { test, mock } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type NegocioDePrueba } from "@/test/base-efimera";

const laBase = baseEfimeraDelArchivo();
/** 17/11/2026 a las 15:00 en Buenos Aires: el día de caja es «2026-11-17». */
const AHORA = Date.parse("2026-11-17T18:00:00Z");
const HOY = "2026-11-17";
/** Fin del 17/11 en Buenos Aires (00:00 del 18/11, UTC−3). */
const FIN_DE_HOY = new Date("2026-11-18T03:00:00Z");
const MARCA_DEL_CIERRE = "cierre-diario:";

async function preparar(t: import("node:test").TestContext) {
  const base = await laBase(t);
  if (!base) return null;
  mock.timers.enable({ apis: ["Date"], now: AHORA });
  t.after(() => mock.timers.reset());
  apuntarLaAppA(base);
  Object.assign(process.env as Record<string, string | undefined>, { NODE_ENV: "development", DB_CONNECTION_LIMIT: "12", DB_CONNECT_TIMEOUT_MS: "5000" });
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const { a, b } = base;
  const form = (campos: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(campos)) fd.set(k, v);
    return fd;
  };
  const como = async <R>(usuarioId: string, fn: () => Promise<R>, negocio: NegocioDePrueba = a): Promise<R> => {
    const r = await ejecutarAccion({ negocio, usuario: { id: usuarioId } }, fn);
    assert.equal(r.tipo, "respuesta", JSON.stringify(r));
    return (r as { valor: R }).valor;
  };
  const enSesion = <R>(fn: () => Promise<R>) => como(a.duenia.id, fn);
  // Cada caso arranca con el libro de A vacío, el día abierto y sin turno: el cierre cuenta sólo lo del caso.
  await duenio.auditLog.deleteMany({ where: { tenantId: a.id, entity: { in: ["CierreDiario", "CierreMes"] } } });
  await duenio.cashMovement.deleteMany({ where: { tenantId: a.id } });
  await duenio.cashSession.updateMany({ where: { tenantId: a.id, status: "OPEN" }, data: { status: "CLOSED", closedAt: new Date(AHORA) } });
  return { base, duenio, a, b, form, como, enSesion };
}

type P = NonNullable<Awaited<ReturnType<typeof preparar>>>;

/** Las filas del libro de A hasta el fin de hoy, sin los ajustes que escribe el propio cierre. */
const filasDelDia = (p: P) =>
  p.duenio.cashMovement.count({ where: { tenantId: p.a.id, occurredAt: { lt: FIN_DE_HOY }, NOT: { createdBy: { startsWith: MARCA_DEL_CIERRE } } } });

/**
 * La carrera del encabezado. `asentar` corre el camino real; vuelve lo que el camino respondió (o el error, como texto).
 * Falla si el libro y el cierre no coinciden, o si el camino que no entró no dice «cerrada».
 */
async function carreraConElCierre(p: P, t: import("node:test").TestContext, que: string, asentar: () => Promise<unknown>) {
  const { cerrarDia } = await import("@/lib/cierre-diario-actions");
  const abrir = async () => {
    const c = new pg.Client({ connectionString: p.base.urlDuenio });
    await c.connect();
    t.after(() => c.end().catch(() => {}));
    return c;
  };
  const h = await abrir();
  const espia = await abrir();
  const esperando = async () =>
    (await espia.query(`SELECT count(*)::int AS n FROM pg_locks WHERE locktype = 'advisory' AND NOT granted AND database = (SELECT oid FROM pg_database WHERE datname = current_database())`)).rows[0].n as number;
  const antes = await filasDelDia(p);

  await h.query("BEGIN");
  await h.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`cierre-dia:${p.a.id}`]);
  let soltado = false;
  const soltar = async () => {
    if (!soltado) await h.query("COMMIT");
    soltado = true;
  };
  t.after(soltar);

  // 2. El cierre real saca su foto y espera el candado.
  const cierre = p.enSesion(() => cerrarDia(p.form({ day: HOY, declarado_EFECTIVO: "0", declarado_MP: "0", declarado_TARJETA: "0", note: "Carrera T01b" })));
  cierre.catch(() => {});
  for (let i = 0; i < 400 && (await esperando()) < 1; i++) await new Promise((r) => setTimeout(r, 25));
  assert.equal(await esperando(), 1, "el cierre del día quedó esperando el candado");

  // 3. El camino real. Sin candado confirma ya; con candado queda segundo en la fila.
  let termino = false;
  const asiento = asentar().then(
    (v) => ({ respuesta: v as unknown }),
    (e: unknown) => ({ respuesta: `error: ${e instanceof Error ? e.message : String(e)}` }),
  ).finally(() => (termino = true));
  for (let i = 0; i < 400 && !termino && (await esperando()) < 2; i++) await new Promise((r) => setTimeout(r, 25));

  // 4. Suelta: el cierre corre con la foto del paso 2.
  await soltar();
  const rc = await cierre;
  assert.equal(rc?.ok, true, `el cierre del día confirma: ${JSON.stringify(rc)}`);
  const { respuesta } = await asiento;
  const registro = await p.duenio.auditLog.findFirst({ where: { tenantId: p.a.id, action: "caja.cierre-diario", entityId: HOY }, select: { changes: true } });
  const contados = (registro?.changes as { movimientos?: number } | null)?.movimientos;
  const enElLibro = await filasDelDia(p);
  const texto = typeof respuesta === "string" ? respuesta : JSON.stringify(respuesta);
  assert.equal(
    enElLibro,
    contados,
    `${que}: el libro tiene ${enElLibro} movimientos hasta hoy (antes ${antes}) y el cierre contó ${contados}. Respuesta del camino: ${texto}`,
  );
  assert.equal(enElLibro, antes, `${que}: con el día cerrado por delante, el libro queda como estaba. Respuesta: ${texto}`);
  assert.match(texto, /cerrad/i, `${que}: el rechazo dice que el día está cerrado`);
  assert.doesNotMatch(texto, /"ok":true/, `${que}: no responde éxito sin haber asentado`);
  return respuesta;
}

// ─── Libro de caja a mano (`libro-caja-actions.ts`) ─────────────────────────────

test("T01b · libro a mano, cargar: un ingreso que llega con el cierre del día en marcha no queda fuera de lo contado", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { addLibroEntry } = await import("@/lib/libro-caja-actions");
  await carreraConElCierre(p, t, "addLibroEntry", () =>
    p.enSesion(() => addLibroEntry({ ok: false, error: "" } as never, p.form({ type: "INGRESO", method: "EFECTIVO", amount: "300", detail: "Carrera T01b · libro", date: HOY, viewMonth: HOY.slice(0, 7), confirm: "1" }))),
  );
});

test("T01b · libro a mano, borrar: un borrado que llega con el cierre del día en marcha no saca una fila que el cierre contó", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { deleteLibroEntry } = await import("@/lib/libro-caja-actions");
  const fila = await p.duenio.cashMovement.create({
    data: { tenantId: p.a.id, type: "INGRESO", method: "EFECTIVO", amount: 300, reason: "Carrera T01b · a borrar", occurredAt: new Date(AHORA - 3_600_000), createdBy: `user:${p.a.duenia.id}` },
    select: { id: true },
  });
  await carreraConElCierre(p, t, "deleteLibroEntry", () => p.enSesion(() => deleteLibroEntry({ ok: false, error: "" } as never, p.form({ id: fila.id }))));
  assert.equal(await p.duenio.cashMovement.count({ where: { id: fila.id } }), 1, "la fila contada sigue en el libro");
});
