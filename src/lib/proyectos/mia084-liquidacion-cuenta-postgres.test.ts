// ============================================================================
// GSG-MIA-084 · N1 (anexo 2 de GSG-MIA-083): el sueldo pagado por banco tiene que bajar esa cuenta, igual que una cuota.
// Contra Postgres de verdad (base efímera migrada, rol app_rls sin BYPASSRLS, Server Actions con sesión).
//
// La UAT: Paula (3.750.000) pagada «por transferencia» salía del libro pero Banco Pesos seguía en 51.800.000.
// `pagarLiquidacion` (acciones-empresa.ts) no pedía la cuenta ni la movía; marcar una cuota sí (`marcarCuotaEmpresa`).
//
//  N1a  pagar pide la cuenta que se mueve, o «ninguna»; el saldo baja el total exacto en la MISMA transacción que el
//       asiento (si una falla, no queda ninguna). Con cuentas cargadas, sin elegir no se paga. Una cuenta en dólares
//       o de otro negocio no se mueve.
//  N1b  carrera: 5 envíos a la vez del mismo pago (dos cuentas distintas) → un asiento y una sola baja. Con el día de
//       caja cerrado (el `cerrarDia` real) rechaza y no mueve la cuenta. Lo propio sigue frenado.
//
// Montos inventados (los de la UAT): Banco Pesos 58.000.000, Banco Galicia 20.000.000, Banco Dólares US$ 42.000.
// El reloj está fijo en el martes 17/11/2026: el día cerrado es el último test del archivo.
// ============================================================================

import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio } from "@/test/base-efimera";

const laBase = baseEfimeraDelArchivo();
const AHORA = Date.parse("2026-11-17T18:00:00Z");
const HOY = "2026-11-17";
const SUELDO = 3_750_000;
const PESOS = 58_000_000;
const GALICIA = 20_000_000;
const DOLARES = 42_000;
const RECHAZO_DIA = /la caja del .*17\/11\/2026 ya está cerrada/;

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
  const empresa = await import("./acciones-empresa");

  // Una sola vez por base: módulo, caja limpia, personas y cuentas (en A y una en B).
  let paula = await duenio.proyectoPersona.findFirst({ where: { tenantId: a.id, nombre: "Paula" }, select: { id: true } });
  if (!paula) {
    const t0 = await duenio.tenant.findUniqueOrThrow({ where: { id: a.id }, select: { modules: true } });
    await duenio.tenant.update({ where: { id: a.id }, data: { modules: [...new Set([...t0.modules, "proyectos"])] } });
    await duenio.cashMovement.deleteMany({ where: { tenantId: a.id } });
    await duenio.cashSession.updateMany({ where: { tenantId: a.id, status: "OPEN" }, data: { status: "CLOSED", closedAt: new Date(AHORA) } });
    const cuenta = (nombre: string) => duenio.user.create({ data: { tenantId: a.id, name: nombre, email: `${nombre.toLowerCase()}@mia084.test`, passwordHash: "x", role: "RECEPTION" }, select: { id: true } });
    const [uPaula, uOtra] = [await cuenta("Paula"), await cuenta("Otra")];
    await duenio.proyectoPersona.create({ data: { tenantId: a.id, userId: uPaula.id, nombre: "Paula", email: "paula@mia084.test", rol: "PRODUCCION", sueldoBase: SUELDO } });
    await duenio.proyectoPersona.create({ data: { tenantId: a.id, userId: uOtra.id, nombre: "Otra", email: "otra@mia084.test", rol: "ADMINISTRACION", sueldoBase: 1_500_000 } });
    await duenio.proyectoCuentaBanco.create({ data: { tenantId: a.id, nombre: "Banco Pesos", moneda: "ARS", saldo: PESOS } });
    await duenio.proyectoCuentaBanco.create({ data: { tenantId: a.id, nombre: "Banco Galicia", moneda: "ARS", saldo: GALICIA } });
    await duenio.proyectoCuentaBanco.create({ data: { tenantId: a.id, nombre: "Banco Dólares", moneda: "USD", saldo: DOLARES } });
    await duenio.proyectoCuentaBanco.create({ data: { tenantId: b.id, nombre: "Banco de B", moneda: "ARS", saldo: 7_000_000 } });
    paula = await duenio.proyectoPersona.findFirstOrThrow({ where: { tenantId: a.id, nombre: "Paula" }, select: { id: true } });
  }
  const persona = (nombre: string) => duenio.proyectoPersona.findFirstOrThrow({ where: { tenantId: a.id, nombre }, select: { id: true, userId: true } });
  const quien = { paula: await persona("Paula"), otra: await persona("Otra") };
  const cuentaDe = (tenantId: string, nombre: string) => duenio.proyectoCuentaBanco.findFirstOrThrow({ where: { tenantId, nombre }, select: { id: true } });
  const cuentas = { pesos: (await cuentaDe(a.id, "Banco Pesos")).id, galicia: (await cuentaDe(a.id, "Banco Galicia")).id, dolares: (await cuentaDe(a.id, "Banco Dólares")).id, deB: (await cuentaDe(b.id, "Banco de B")).id };

  const form = (c: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(c)) fd.set(k, v);
    return fd;
  };
  const como = async <R>(userId: string, fn: () => Promise<R>): Promise<R> => {
    const r = await ejecutarAccion({ negocio: a, usuario: { id: userId } }, fn);
    assert.equal(r.tipo, "respuesta", JSON.stringify(r));
    return (r as { valor: R }).valor;
  };
  /** La liquidación de Paula de `periodo`, ya publicada (se paga lo que la persona vio). */
  const publicada = async (periodo: string, personaId = quien.paula.id) =>
    (await duenio.proyectoLiquidacion.create({ data: { tenantId: a.id, personaId, periodo, base: SUELDO, total: SUELDO, estado: "PUBLICADA", publicadaEl: new Date(AHORA - 86_400_000) }, select: { id: true } })).id;
  const pagar = (id: string, campos: Record<string, string>, userId = quien.otra.userId!) =>
    como(userId, () => empresa.pagarLiquidacion(form({ id, medio: "TRANSFERENCIA", ...campos }))) as Promise<{ ok: boolean; error?: string }>;
  /** Lo que se mira antes y después: los cuatro saldos, el estado y los asientos de esa liquidación. */
  const foto = async (liquidacionId: string) => {
    const saldo = async (id: string) => (await duenio.proyectoCuentaBanco.findUniqueOrThrow({ where: { id }, select: { saldo: true } })).saldo;
    return {
      pesos: await saldo(cuentas.pesos),
      galicia: await saldo(cuentas.galicia),
      dolares: await saldo(cuentas.dolares),
      deB: await saldo(cuentas.deB),
      estado: (await duenio.proyectoLiquidacion.findUniqueOrThrow({ where: { id: liquidacionId }, select: { estado: true } })).estado,
      asientos: await duenio.cashMovement.findMany({ where: { tenantId: a.id, proyectoLiquidacionId: liquidacionId }, select: { type: true, amount: true } }),
    };
  };
  return { base, duenio, a, empresa, quien, cuentas, form, como, publicada, pagar, foto };
}

test("N1a · pagar el sueldo eligiendo Banco Pesos baja esa cuenta el total exacto, con un solo egreso en el libro", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const id = await p.publicada("2026-01");
  const antes = await p.foto(id);
  const r = await p.pagar(id, { cuenta: p.cuentas.pesos });
  assert.equal(r.ok, true, JSON.stringify(r));
  const despues = await p.foto(id);
  assert.equal(despues.estado, "PAGADA");
  assert.deepEqual(despues.asientos, [{ type: "EGRESO", amount: SUELDO }], "un egreso por el total");
  // A mano: 58.000.000 − 3.750.000 = 54.250.000. Las otras cuentas, iguales.
  assert.equal(despues.pesos, 54_250_000, "Banco Pesos baja el sueldo");
  assert.deepEqual([despues.galicia, despues.dolares, despues.deB], [antes.galicia, antes.dolares, antes.deB], "las demás cuentas no se mueven");
});

test("N1a · «Ninguna cuenta del banco»: el egreso va al libro y ningún saldo se mueve", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const id = await p.publicada("2026-02");
  const antes = await p.foto(id);
  const r = await p.pagar(id, { cuenta: "ninguna" });
  assert.equal(r.ok, true, JSON.stringify(r));
  const despues = await p.foto(id);
  assert.equal(despues.estado, "PAGADA");
  assert.deepEqual(despues.asientos, [{ type: "EGRESO", amount: SUELDO }]);
  assert.deepEqual([despues.pesos, despues.galicia, despues.dolares, despues.deB], [antes.pesos, antes.galicia, antes.dolares, antes.deB], "ningún saldo cambia");
});

test("N1a · con cuentas cargadas y sin elegir ninguna opción, no se paga: estado, libro y saldos iguales", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const id = await p.publicada("2026-03");
  const antes = await p.foto(id);
  const r = await p.pagar(id, {});
  assert.equal(r.ok, false, `sin cuenta elegida no se paga: ${JSON.stringify(r)}`);
  assert.match(String(r.error), /cuenta/i, "el rechazo pide la cuenta");
  assert.deepEqual(await p.foto(id), antes, "nada cambió");
});

test("N1a · una cuenta en dólares para un sueldo en pesos se rechaza y no queda nada a medias", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const id = await p.publicada("2026-04");
  const antes = await p.foto(id);
  const r = await p.pagar(id, { cuenta: p.cuentas.dolares });
  assert.equal(r.ok, false, `la cuenta en USD no paga un sueldo en pesos: ${JSON.stringify(r)}`);
  assert.match(String(r.error), /USD/, "el rechazo nombra la moneda de la cuenta");
  assert.deepEqual(await p.foto(id), antes, "ni el estado, ni el libro, ni los saldos cambiaron");
});

test("N1a · aislamiento: la cuenta de otro negocio no existe para A; ni A paga ni B se mueve", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const id = await p.publicada("2026-05");
  const antes = await p.foto(id);
  const r = await p.pagar(id, { cuenta: p.cuentas.deB });
  assert.equal(r.ok, false, `una cuenta de B no se elige desde A: ${JSON.stringify(r)}`);
  assert.match(String(r.error), /no existe/i);
  assert.deepEqual(await p.foto(id), antes, "nada cambió en A ni en B");
});

test("N1b · carrera: 5 envíos a la vez del mismo pago, con dos cuentas, dejan un asiento y una sola baja (5 rondas)", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  for (let ronda = 1; ronda <= 5; ronda++) {
    const id = await p.publicada(`2025-0${ronda}`);
    const antes = await p.foto(id);
    const elegidas = [p.cuentas.pesos, p.cuentas.galicia, p.cuentas.pesos, p.cuentas.galicia, p.cuentas.pesos];
    const rs = await Promise.all(elegidas.map((cuenta) => p.pagar(id, { cuenta })));
    const bien = rs.filter((r) => r.ok);
    assert.equal(bien.length, 1, `ronda ${ronda}: uno solo paga: ${JSON.stringify(rs)}`);
    for (const r of rs.filter((x) => !x.ok)) assert.match(String(r.error), /ya está pagada/, `ronda ${ronda}: los demás dicen que ya está pagada`);
    const despues = await p.foto(id);
    assert.equal(despues.estado, "PAGADA");
    assert.deepEqual(despues.asientos, [{ type: "EGRESO", amount: SUELDO }], `ronda ${ronda}: un solo egreso`);
    const bajas = [antes.pesos - despues.pesos, antes.galicia - despues.galicia];
    assert.deepEqual([...bajas].sort((x, y) => x - y), [0, SUELDO], `ronda ${ronda}: una sola cuenta baja, y baja el sueldo exacto (${JSON.stringify(bajas)})`);
    assert.deepEqual([despues.dolares, despues.deB], [antes.dolares, antes.deB]);
  }
});

test("N1b · lo propio sigue frenado aunque elija la cuenta: ni paga ni mueve el saldo", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const id = await p.publicada("2026-06");
  const antes = await p.foto(id);
  const r = await p.pagar(id, { cuenta: p.cuentas.pesos }, p.quien.paula.userId!);
  assert.equal(r.ok, false, JSON.stringify(r));
  assert.match(String(r.error), /tuya/i);
  assert.deepEqual(await p.foto(id), antes);
});

// Último del archivo: deja el martes 17 cerrado para la base compartida.
test("N1b · con el día de caja cerrado (cerrarDia real) pagar se rechaza con el texto del cierre y la cuenta no se mueve", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { cerrarDia } = await import("@/lib/cierre-diario-actions");
  const libroEfectivo = (await p.duenio.cashMovement.findMany({ where: { tenantId: p.a.id, method: "EFECTIVO" }, select: { type: true, amount: true } })).reduce((s, m) => s + (m.type === "EGRESO" ? -m.amount : m.amount), 0);
  const cierre = await p.como(p.a.duenia.id, () => cerrarDia(p.form({ day: HOY, declarado_EFECTIVO: String(libroEfectivo), note: "Cierre MIA-084" })));
  assert.equal((cierre as { ok?: boolean }).ok, true, `se cerró el ${HOY}: ${JSON.stringify(cierre)}`);
  const id = await p.publicada("2026-07");
  const antes = await p.foto(id);
  const r = await p.pagar(id, { cuenta: p.cuentas.pesos });
  assert.equal(r.ok, false, JSON.stringify(r));
  assert.match(String(r.error), RECHAZO_DIA);
  assert.deepEqual(await p.foto(id), antes, "estado PUBLICADA, sin asiento y Banco Pesos igual");
});
