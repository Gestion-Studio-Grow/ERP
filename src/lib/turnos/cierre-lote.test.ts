// ============================================================================
// TEST-GATE — cerrar lo pendiente en lote (src/lib/turnos/cierre-lote.ts). PURO, sin DB.
// ============================================================================
//
// La queja del dueño de CH: 15 pasados sin cerrar = 60-90 toques. Acá queda fijado qué se decide
// por cada línea del lote antes de tocar la base: medio obligatorio cuando hay saldo y quien mira
// cobra; la de Vero (cobra aparte) queda debiendo; un medio forzado sobre un turno que no se cobra
// se rechaza; un rechazo trae su motivo y no frena a las demás; tope 50.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TOPE_DEL_LOTE,
  MOTIVO,
  camposDeLaDecision,
  formDataDelLote,
  leerLote,
  permisosDeRol,
  planCierreEnLote,
  plataDeLaFila,
  turnoParaCerrar,
  turnoSinCerrar,
  type ContextoDelPlan,
  type FilaDeTurno,
  type PedidoDeCierre,
  type TurnoParaCerrar,
  type Veredicto,
} from "./cierre-lote";

const AHORA = new Date("2026-10-22T13:00:00Z"); // jueves 10:00 en Buenos Aires
const AYER = new Date("2026-10-21T13:00:00Z");
const MANANA = new Date("2026-10-23T13:00:00Z");
const VERO_NO: Veredicto = { ok: false, motivo: "Vero cobra sus propios turnos. Pasale el cobro a ella; después rinde la comisión." };

const turno = (id: string, o: Partial<TurnoParaCerrar> = {}): TurnoParaCerrar => ({
  id,
  status: "PENDING",
  startsAt: AYER,
  professionalId: "caro",
  saldo: 20000,
  cobrado: 0,
  ...o,
});

const recepcion = (veredictos: Record<string, Veredicto> = {}): ContextoDelPlan => ({
  ahora: AHORA,
  permisos: permisosDeRol("RECEPTION"),
  veredictos: new Map(Object.entries(veredictos)),
});

function unaLinea(pedido: PedidoDeCierre, t: TurnoParaCerrar | null, ctx: ContextoDelPlan) {
  const plan = planCierreEnLote([{ pedido, turno: t }], ctx);
  assert.equal(plan.ok, true);
  return plan.ok ? plan.lineas[0]!.decision : null;
}

// ── Permisos ────────────────────────────────────────────────────────────────

test("permisos: sólo la dueña perdona; recepción gestiona, cobra y termina; la profesional no gestiona", () => {
  assert.deepEqual(permisosDeRol("OWNER"), { gestionar: true, cobrar: true, terminar: true, perdonar: true });
  assert.deepEqual(permisosDeRol("RECEPTION"), { gestionar: true, cobrar: true, terminar: true, perdonar: false });
  assert.deepEqual(permisosDeRol("PROFESSIONAL"), { gestionar: false, cobrar: true, terminar: true, perdonar: false });
});

// ── «Vino» ──────────────────────────────────────────────────────────────────

test("CH-002 · Reservado de ayer que vino y paga por MP → completar y cobrar el saldo, sin Confirmar", () => {
  const d = unaLinea({ id: "t1", accion: "vino", method: "MERCADOPAGO" }, turno("t1"), recepcion({ t1: { ok: true } }));
  assert.deepEqual(d, { tipo: "completar-y-cobrar", method: "MERCADOPAGO", monto: 20000, vino: true });
});

test("CH-003 · «vino» con saldo y sin medio → rechazado: ningún medio viene preelegido", () => {
  const d = unaLinea({ id: "t1", accion: "vino" }, turno("t1"), recepcion({ t1: { ok: true } }));
  assert.deepEqual(d, { tipo: "rechazado", motivo: MOTIVO.faltaMedio });
});

test("un medio que no existe cuenta como falta de medio", () => {
  const d = unaLinea({ id: "t1", accion: "vino", method: "BITCOIN" }, turno("t1"), recepcion({ t1: { ok: true } }));
  assert.deepEqual(d, { tipo: "rechazado", motivo: MOTIVO.faltaMedio });
});

test("CH-004 · ya pagaron todo (saldo $0) → completar sin cobro nuevo, con o sin medio", () => {
  const ctx = recepcion({ t1: { ok: true } });
  const t = turno("t1", { status: "CONFIRMED", saldo: 0, cobrado: 20000 });
  assert.deepEqual(unaLinea({ id: "t1", accion: "vino" }, t, ctx), { tipo: "completar-sin-cobro", vino: false });
  assert.deepEqual(unaLinea({ id: "t1", accion: "vino", method: "EFECTIVO" }, t, ctx), { tipo: "completar-sin-cobro", vino: false });
});

test("un Confirmado pasado se completa con vino=false (no cambia el camino de siempre)", () => {
  const d = unaLinea({ id: "t1", accion: "vino", method: "EFECTIVO" }, turno("t1", { status: "CONFIRMED" }), recepcion({ t1: { ok: true } }));
  assert.deepEqual(d, { tipo: "completar-y-cobrar", method: "EFECTIVO", monto: 20000, vino: false });
});

test("CH-007 · Vero cobra aparte: la recepción lo termina dejando el saldo", () => {
  const d = unaLinea({ id: "v1", accion: "vino" }, turno("v1", { professionalId: "vero" }), recepcion({ v1: VERO_NO }));
  assert.deepEqual(d, { tipo: "dejar-saldo", saldo: 20000, vino: true });
});

test("CH-007 · un medio forzado por formulario sobre el turno de Vero se rechaza con el motivo de Vero", () => {
  const d = unaLinea({ id: "v1", accion: "vino", method: "EFECTIVO" }, turno("v1", { professionalId: "vero" }), recepcion({ v1: VERO_NO }));
  assert.deepEqual(d, { tipo: "rechazado", motivo: VERO_NO.motivo });
});

test("sin veredicto para el turno, no se cobra (fail-closed)", () => {
  const d = unaLinea({ id: "t1", accion: "vino", method: "EFECTIVO" }, turno("t1"), recepcion({}));
  assert.deepEqual(d, { tipo: "rechazado", motivo: MOTIVO.sinVeredicto });
});

test("CH-046 · un Reservado de mañana no se cierra: no ocurrió", () => {
  const d = unaLinea({ id: "t1", accion: "vino", method: "EFECTIVO" }, turno("t1", { startsAt: MANANA }), recepcion({ t1: { ok: true } }));
  assert.deepEqual(d, { tipo: "rechazado", motivo: MOTIVO.noOcurrio });
});

test("un turno ya cerrado (terminado, cancelado, faltazo) no se vuelve a cerrar", () => {
  for (const status of ["COMPLETED", "CANCELLED", "NO_SHOW"]) {
    for (const accion of ["vino", "debe", "no-vino"] as const) {
      const d = unaLinea({ id: "t1", accion, method: "EFECTIVO" }, turno("t1", { status }), recepcion({ t1: { ok: true } }));
      assert.deepEqual(d, { tipo: "rechazado", motivo: MOTIVO.yaCerrado }, `${status} · ${accion}`);
    }
  }
});

// ── «Debe» ──────────────────────────────────────────────────────────────────

test("CH-016 · «Debe» → completar dejando el saldo a cobrar", () => {
  const d = unaLinea({ id: "t1", accion: "debe" }, turno("t1", { saldo: 9000, cobrado: 5000 }), recepcion({ t1: { ok: true } }));
  assert.deepEqual(d, { tipo: "dejar-saldo", saldo: 9000, vino: true });
});

test("«Debe» con saldo $0 no deja deuda inventada: completar sin cobro", () => {
  const d = unaLinea({ id: "t1", accion: "debe" }, turno("t1", { saldo: 0, cobrado: 20000 }), recepcion({ t1: { ok: true } }));
  assert.deepEqual(d, { tipo: "completar-sin-cobro", vino: true });
});

// ── «No vino» ───────────────────────────────────────────────────────────────

test("CH-009 · «No vino» sin plata → faltazo, sin pregunta por la seña", () => {
  const d = unaLinea({ id: "t1", accion: "no-vino" }, turno("t1"), recepcion({ t1: { ok: true } }));
  assert.deepEqual(d, { tipo: "no-vino", senia: null });
});

test("CH-010/011 · «No vino» con seña: sin destino se rechaza; con retener/devolver pasa", () => {
  const t = turno("t1", { cobrado: 5000, saldo: 15000 });
  const ctx = recepcion({ t1: { ok: true } });
  const sin = unaLinea({ id: "t1", accion: "no-vino" }, t, ctx);
  assert.equal(sin?.tipo, "rechazado");
  assert.match(sin?.tipo === "rechazado" ? sin.motivo : "", /seña/);
  assert.deepEqual(unaLinea({ id: "t1", accion: "no-vino", senia: "retener" }, t, ctx), { tipo: "no-vino", senia: "retener" });
  assert.deepEqual(unaLinea({ id: "t1", accion: "no-vino", senia: "devolver" }, t, ctx), { tipo: "no-vino", senia: "devolver" });
});

test("devolver la seña de un turno de Vero desde la recepción se rechaza (es plata que sale)", () => {
  const t = turno("v1", { professionalId: "vero", cobrado: 5000, saldo: 15000 });
  const d = unaLinea({ id: "v1", accion: "no-vino", senia: "devolver" }, t, recepcion({ v1: VERO_NO }));
  assert.deepEqual(d, { tipo: "rechazado", motivo: VERO_NO.motivo });
});

test("CH-014 · «No vino» de un turno de mañana se rechaza con el motivo de siempre", () => {
  const d = unaLinea({ id: "t1", accion: "no-vino" }, turno("t1", { startsAt: MANANA }), recepcion({ t1: { ok: true } }));
  assert.equal(d?.tipo, "rechazado");
  assert.match(d?.tipo === "rechazado" ? d.motivo : "", /Todavía no es la hora/);
});

// ── Aislamiento, permisos y el lote ─────────────────────────────────────────

test("CH-060 · un turno que el servidor no leyó (otro negocio) → «ya no existe»", () => {
  const d = unaLinea({ id: "T-OTRO", accion: "vino", method: "EFECTIVO" }, null, recepcion({}));
  assert.deepEqual(d, { tipo: "rechazado", motivo: MOTIVO.noExiste });
});

test("una profesional sólo cierra los suyos", () => {
  const ctx: ContextoDelPlan = { ahora: AHORA, permisos: permisosDeRol("PROFESSIONAL"), veredictos: { t1: { ok: true } }, profesionalPropio: "vero" };
  assert.deepEqual(unaLinea({ id: "t1", accion: "debe" }, turno("t1"), ctx), { tipo: "rechazado", motivo: MOTIVO.deOtraProfesional });
  assert.deepEqual(unaLinea({ id: "t1", accion: "debe" }, turno("t1", { professionalId: "vero" }), ctx), {
    tipo: "dejar-saldo",
    saldo: 20000,
    vino: true,
  });
});

test("sin permiso de terminar, nada se cierra", () => {
  const ctx: ContextoDelPlan = { ahora: AHORA, permisos: { gestionar: true, cobrar: true, terminar: false, perdonar: false }, veredictos: {} };
  assert.deepEqual(unaLinea({ id: "t1", accion: "debe" }, turno("t1"), ctx), { tipo: "rechazado", motivo: MOTIVO.sinPermiso });
});

test("CH-006 · una línea rechazada no frena a las demás: cada una con su decisión, en orden", () => {
  const plan = planCierreEnLote(
    [
      { pedido: { id: "a", accion: "vino", method: "EFECTIVO" }, turno: turno("a") },
      { pedido: { id: "b", accion: "vino" }, turno: turno("b") }, // falta el medio
      { pedido: { id: "c", accion: "vino", method: "EFECTIVO" }, turno: null }, // otro negocio
      { pedido: { id: "d", accion: "no-vino" }, turno: turno("d") },
      { pedido: { id: "a", accion: "vino", method: "EFECTIVO" }, turno: turno("a") }, // repetido
    ],
    recepcion({ a: { ok: true }, b: { ok: true }, d: { ok: true } }),
  );
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.deepEqual(
    plan.lineas.map((l) => [l.id, l.decision.tipo]),
    [
      ["a", "completar-y-cobrar"],
      ["b", "rechazado"],
      ["c", "rechazado"],
      ["d", "no-vino"],
      ["a", "rechazado"],
    ],
  );
  const repetido = plan.lineas[4]!.decision;
  assert.equal(repetido.tipo === "rechazado" && repetido.motivo, MOTIVO.repetido);
});

test("tope 50: el lote 51 se rechaza entero, el de 50 pasa", () => {
  const items = (n: number) => Array.from({ length: n }, (_, i) => ({ pedido: { id: `t${i}`, accion: "debe" as const }, turno: turno(`t${i}`) }));
  assert.equal(TOPE_DEL_LOTE, 50);
  assert.equal(planCierreEnLote(items(50), recepcion()).ok, true);
  const r = planCierreEnLote(items(51), recepcion());
  assert.equal(r.ok, false);
  assert.match(r.ok ? "" : r.error, /hasta 50/);
  assert.equal(planCierreEnLote([], recepcion()).ok, false);
});

// ── El formulario ───────────────────────────────────────────────────────────

test("formDataDelLote y leerLote son ida y vuelta; lo que no es medio ni seña queda en null", () => {
  const pedidos: PedidoDeCierre[] = [
    { id: "a", accion: "vino", method: "EFECTIVO" },
    { id: "b", accion: "no-vino", senia: "retener" },
    { id: "c", accion: "debe" },
  ];
  const r = leerLote(formDataDelLote(pedidos).get("items"));
  assert.deepEqual(r, {
    ok: true,
    pedidos: [
      { id: "a", accion: "vino", method: "EFECTIVO", senia: null },
      { id: "b", accion: "no-vino", method: null, senia: "retener" },
      { id: "c", accion: "debe", method: null, senia: null },
    ],
  });
});

test("leerLote rechaza lo vacío, lo roto, una acción desconocida y más de 50", () => {
  for (const raw of [null, "", "no-json", "{}", "[]", JSON.stringify([{ id: "a", accion: "borrar" }]), JSON.stringify([{ accion: "vino" }])]) {
    assert.equal(leerLote(raw).ok, false, String(raw));
  }
  const muchos = JSON.stringify(Array.from({ length: 51 }, (_, i) => ({ id: `t${i}`, accion: "debe" })));
  const r = leerLote(muchos);
  assert.equal(r.ok, false);
  assert.match(r.ok ? "" : r.error, /hasta 50/);
});

test("camposDeLaDecision arma exactamente lo que leen completeAppointment y cerrarTurnoSinPrestar", () => {
  assert.deepEqual(camposDeLaDecision("t1", { tipo: "completar-y-cobrar", method: "MERCADOPAGO", monto: 9000, vino: true }), {
    accion: "completar",
    campos: { appointmentId: "t1", method: "MERCADOPAGO", vino: "on" },
  });
  assert.deepEqual(camposDeLaDecision("t1", { tipo: "completar-sin-cobro", vino: false }), {
    accion: "completar",
    campos: { appointmentId: "t1" },
  });
  assert.deepEqual(camposDeLaDecision("t1", { tipo: "dejar-saldo", saldo: 9000, vino: true }), {
    accion: "completar",
    campos: { appointmentId: "t1", saldo: "a-cobrar", vino: "on" },
  });
  assert.deepEqual(camposDeLaDecision("t1", { tipo: "no-vino", senia: "devolver" }), {
    accion: "no-vino",
    campos: { appointmentId: "t1", accion: "no-vino", senia: "devolver" },
  });
  assert.deepEqual(camposDeLaDecision("t1", { tipo: "no-vino", senia: null }), {
    accion: "no-vino",
    campos: { appointmentId: "t1", accion: "no-vino" },
  });
});

// ── La fila y sus proyecciones ──────────────────────────────────────────────

const fila = (o: Partial<FilaDeTurno> = {}): FilaDeTurno => ({
  id: "t1",
  clientId: "c1",
  startsAt: AYER,
  endsAt: new Date(AYER.getTime() + 30 * 60_000),
  status: "PENDING",
  priceAtBooking: 14000,
  professionalId: "caro",
  client: { name: "Laura Gómez", phone: "1155667788" },
  service: { name: "Piernas completas", price: 15000, depositAmount: 5000 },
  professional: { name: "Caro", cobraEnMostrador: true },
  box: { name: "Box 1" },
  payment: null,
  collections: [{ id: "k1", amount: 5000, method: "TRANSFERENCIA", note: "Seña" }],
  ...o,
});

test("la plata de la fila sale del precio congelado: seña $5.000, falta $9.000", () => {
  assert.deepEqual(plataDeLaFila(fila()), { precio: 14000, saldo: 9000, cobradoBruto: 5000, cobradoReal: 5000, senia: 5000 });
  assert.deepEqual(turnoParaCerrar(fila()), { id: "t1", status: "PENDING", startsAt: AYER, professionalId: "caro", saldo: 9000, cobrado: 5000 });
});

test("un turno cobrado por el camino viejo (Payment sin cobros) no figura como deuda", () => {
  const p = plataDeLaFila(fila({ collections: [], payment: { status: "APPROVED", amount: 14000 } }));
  assert.equal(p.saldo, 0);
  assert.equal(p.cobradoReal, 14000);
});

test("turnoSinCerrar: proyección mínima con el día, la plata y el veredicto", () => {
  const t = turnoSinCerrar(fila({ status: "CONFIRMED", box: null }), VERO_NO, "2026-10-21");
  assert.deepEqual(t, {
    id: "t1",
    clienteId: "c1",
    inicio: AYER.toISOString(),
    fin: new Date(AYER.getTime() + 30 * 60_000).toISOString(),
    dia: "2026-10-21",
    estado: "CONFIRMED",
    clienta: "Laura Gómez",
    telefono: "1155667788",
    servicio: "Piernas completas",
    profesional: "Caro",
    profesionalId: "caro",
    box: "",
    precio: 14000,
    cobrado: 5000,
    saldo: 9000,
    senia: 5000,
    cobros: [{ amount: 5000, method: "TRANSFERENCIA", note: "Seña" }],
    veredicto: VERO_NO,
  });
});
