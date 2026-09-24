import { test } from "node:test";
import assert from "node:assert/strict";
import {
  POR_PAGINA,
  SIN_FILTROS,
  TIPOS,
  atajosDePeriodo,
  diaSiguiente,
  esDia,
  hayFiltros,
  hrefAuditoria,
  leerFiltros,
  opcionesSobre,
  paginaValida,
  whereAuditoria,
} from "./filtros";
import { businessWallTimeToUtc } from "@/lib/datetime";
import { whereAnulacionesDelDia } from "@/lib/order-anulacion";
import { ACCION_CAMBIO_DE_PRECIO } from "@/lib/catalogo/precios-auditoria";
import { CIERRE_DIARIO_ACTION } from "@/lib/caja/frontera-cierre";
import { ACCION_CONGELAR, ACCION_REABRIR } from "@/lib/cierre-mes/cierre-mes";

const USUARIOS = new Set(["juan1", "carla2"]);

test("'las anulaciones de Juan en septiembre': un where con el mes entero en hora argentina", () => {
  const f = leerFiltros({ desde: "2026-09-01", hasta: "2026-09-30", quien: "u:juan1", tipo: "anulaciones" }, USUARIOS);
  assert.deepEqual(f, { desde: "2026-09-01", hasta: "2026-09-30", quien: { tipo: "usuario", id: "juan1" }, tipo: "anulaciones", sobre: null, pagina: 1 });
  const w = whereAuditoria(f) as { AND: Record<string, unknown>[] };
  assert.equal(w.AND.length, 3);
  // Del 1/9 00:00 al 1/10 00:00 de Buenos Aires (03:00 UTC): el 30 entra entero.
  assert.deepEqual(w.AND[0], {
    createdAt: { gte: new Date("2026-09-01T03:00:00.000Z"), lt: new Date("2026-10-01T03:00:00.000Z") },
  });
  // Juan, también cuando actuó desde la casa de su red o en un traslado.
  assert.deepEqual(w.AND[1], { OR: [{ actor: "user:juan1" }, { actor: { endsWith: ":user:juan1" } }] });
  // La anulación de una venta es la misma fila que cuenta el Inicio (order-anulacion.ts).
  const anulaVenta = (w.AND[2].OR as Record<string, unknown>[])[0];
  const delInicio = whereAnulacionesDelDia("t", new Date());
  assert.deepEqual(
    { entity: anulaVenta.entity, action: anulaVenta.action, changes: anulaVenta.changes },
    { entity: delInicio.entity, action: delInicio.action, changes: delInicio.changes },
  );
});

test("lo que llega por la URL se valida: lo que no sirve se ignora, no rompe", () => {
  const f = leerFiltros(
    { desde: "2026-02-31", hasta: "ayer", quien: "u:intruso", tipo: "DROP", sobre: "x", pagina: "-3" },
    USUARIOS,
  );
  assert.deepEqual(f, SIN_FILTROS);
  assert.deepEqual(whereAuditoria(f), {});
  assert.equal(hayFiltros(f), false);
  // Sin nada (la pantalla recién abierta, o un endpoint llamado sin argumentos).
  assert.deepEqual(leerFiltros(null, USUARIOS), SIN_FILTROS);
  // Un parámetro repetido toma el primero; la página tiene tope.
  assert.equal(leerFiltros({ tipo: ["cobros", "precios"], pagina: "999999" }, USUARIOS).tipo, "cobros");
  assert.equal(leerFiltros({ pagina: "999999" }, USUARIOS).pagina, 500);
  assert.equal(leerFiltros({ pagina: "2.5" }, USUARIOS).pagina, 1);
});

test("un rango al revés se da vuelta; un solo extremo filtra de un lado", () => {
  const f = leerFiltros({ desde: "2026-09-30", hasta: "2026-09-01" }, USUARIOS);
  assert.equal(f.desde, "2026-09-01");
  assert.equal(f.hasta, "2026-09-30");
  assert.deepEqual(whereAuditoria(leerFiltros({ desde: "2026-09-10" }, USUARIOS)), {
    createdAt: { gte: businessWallTimeToUtc("2026-09-10", "00:00") },
  });
  assert.deepEqual(whereAuditoria(leerFiltros({ hasta: "2026-12-31" }, USUARIOS)), {
    createdAt: { lt: businessWallTimeToUtc("2027-01-01", "00:00") },
  });
});

test("quién: GSG, la web y el sistema, sin mezclar con los usuarios", () => {
  const w = (quien: string) => whereAuditoria(leerFiltros({ quien }, USUARIOS));
  assert.deepEqual(w("gsg"), { actor: { startsWith: "operator:" } });
  assert.deepEqual(w("web"), { actor: { startsWith: "cliente" } });
  assert.deepEqual(w("sistema"), { actor: "system" });
  assert.deepEqual(w("juan1"), {}); // sin el prefijo u: no es un usuario
});

test("cada 'qué hizo' filtra con las acciones que de verdad se escriben", () => {
  const tipo = (t: string) => whereAuditoria(leerFiltros({ tipo: t }, USUARIOS));
  assert.deepEqual(tipo("precios"), { action: ACCION_CAMBIO_DE_PRECIO });
  const cierres = JSON.stringify(tipo("cierres"));
  for (const a of [CIERRE_DIARIO_ACTION, ACCION_CONGELAR, ACCION_REABRIR]) assert.ok(cierres.includes(`"${a}"`), a);
  for (const t of TIPOS) assert.notDeepEqual(tipo(t.id), {}, t.id);
});

test("sobre qué: la entidad, y sin agenda no se ofrece 'Turnos'", () => {
  assert.deepEqual(whereAuditoria(leerFiltros({ sobre: "ventas" }, USUARIOS)), { entity: { in: ["Order", "PaymentLink", "Coupon"] } });
  assert.ok(opcionesSobre(true).some((s) => s.id === "turnos"));
  assert.ok(!opcionesSobre(false).some((s) => s.id === "turnos"));
});

test("páginas: una de más muestra la última; los links conservan los filtros", () => {
  assert.equal(paginaValida(9, 0), 1);
  assert.equal(paginaValida(9, POR_PAGINA * 2 + 1), 3);
  assert.equal(paginaValida(2, POR_PAGINA * 2 + 1), 2);
  const f = leerFiltros({ quien: "u:juan1", tipo: "anulaciones", desde: "2026-09-01", pagina: "3" }, USUARIOS);
  assert.equal(hrefAuditoria(f), "/admin/auditoria?desde=2026-09-01&quien=u%3Ajuan1&tipo=anulaciones&pagina=3");
  assert.equal(hrefAuditoria(f, { pagina: 1 }), "/admin/auditoria?desde=2026-09-01&quien=u%3Ajuan1&tipo=anulaciones");
  assert.equal(hrefAuditoria(SIN_FILTROS), "/admin/auditoria");
});

test("atajos de período: hoy, 7 días, este mes y el anterior con su nombre", () => {
  assert.deepEqual(atajosDePeriodo("2026-09-24"), [
    { id: "hoy", etiqueta: "Hoy", desde: "2026-09-24", hasta: "2026-09-24" },
    { id: "7d", etiqueta: "Últimos 7 días", desde: "2026-09-18", hasta: "2026-09-24" },
    { id: "mes", etiqueta: "Septiembre", desde: "2026-09-01", hasta: "2026-09-24" },
    { id: "mes-anterior", etiqueta: "Agosto", desde: "2026-08-01", hasta: "2026-08-31" },
  ]);
  // En enero, el mes anterior es diciembre del año pasado; y febrero bisiesto.
  assert.deepEqual(atajosDePeriodo("2027-01-05")[3], { id: "mes-anterior", etiqueta: "Diciembre", desde: "2026-12-01", hasta: "2026-12-31" });
  assert.equal(atajosDePeriodo("2028-03-02")[3].hasta, "2028-02-29");
});

test("días: validación y día siguiente", () => {
  assert.ok(esDia("2028-02-29"));
  assert.ok(!esDia("2027-02-29"));
  assert.ok(!esDia("2026-9-1"));
  assert.equal(diaSiguiente("2026-12-31"), "2027-01-01");
});
