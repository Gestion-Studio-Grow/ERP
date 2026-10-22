// Cuentas corrientes → libro de caja, EJECUTADO: la decisión pura y la composición en la
// transacción (con una transacción falsa que anota cada escritura). El criterio de aceptación
// es "un cobro de fiado aparece en el libro y el cierre cuadra": acá se arma el asiento real
// y se lo pasa por el MISMO cierre diario que usa la pantalla.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CUENTA_CORRIENTE_ACTOR_PREFIX,
  MEDIO_OBLIGATORIO,
  cuentasCorrientesEnabled,
  decidirAsiento,
  esAsientoDeCuentaCorriente,
  leerMedio,
} from "./asiento-libro";
import { AsientoRechazadoError, aplicarConAsientoInTx } from "./collection-repo";
import { buildCierreDiario } from "@/lib/caja/cierre-diario";
import type { CashMethod, CashMovementType } from "@/lib/caja/cash-register";
import { cuentasCorrientesPrendidas } from "./asiento-libro";
import { estadoDesdeFilas, todosApagados } from "@/cambios/interruptores-core";
import { CUENTAS_CORRIENTES, esInterruptorId, interruptorPorId } from "@/cambios/interruptores";

test("el flag: apagado por defecto; sólo valores explícitos lo prenden", () => {
  assert.equal(cuentasCorrientesEnabled({}), false);
  assert.equal(cuentasCorrientesEnabled({ CUENTAS_CORRIENTES_ENABLED: "false" }), false);
  assert.equal(cuentasCorrientesEnabled({ CUENTAS_CORRIENTES_ENABLED: " true " }), true);
  assert.equal(cuentasCorrientesEnabled({ CUENTAS_CORRIENTES_ENABLED: "1" }), true);
});

test("el medio es obligatorio: nada de suponer efectivo", () => {
  assert.equal(leerMedio(null), null);
  assert.equal(leerMedio(""), null);
  assert.equal(leerMedio("TARJETA"), null, "la cartera no tiene tarjeta: no se adivina");
  assert.equal(leerMedio("TRANSFERENCIA"), "TRANSFERENCIA");
  const base = { origen: "RECEIVABLE" as const, monto: 100, detalle: "x", hoy: "2026-09-23", cerradoHasta: null };
  assert.deepEqual(decidirAsiento({ ...base, medio: null }), { ok: false, error: MEDIO_OBLIGATORIO });
  assert.deepEqual(decidirAsiento({ ...base, medio: "CHEQUE" }), { ok: false, error: MEDIO_OBLIGATORIO });
});

test("cobro = INGRESO, pago = EGRESO; transferencia y Mercado Pago van a la columna MP del libro", () => {
  const base = { monto: 1500, detalle: "Cobro de cuenta corriente — Ana", hoy: "2026-09-23", cerradoHasta: "2026-09-22" };
  const cobro = decidirAsiento({ ...base, origen: "RECEIVABLE", medio: "EFECTIVO" });
  assert.deepEqual(cobro, {
    ok: true,
    asiento: { type: "INGRESO", method: "EFECTIVO", amount: 1500, reason: "Cobro de cuenta corriente — Ana" },
  });
  const pago = decidirAsiento({ ...base, origen: "PAYABLE", medio: "TRANSFERENCIA", detalle: "" });
  assert.ok(pago.ok);
  assert.equal(pago.asiento.type, "EGRESO");
  assert.equal(pago.asiento.method, "MP");
  assert.equal(pago.asiento.reason, "Pago a proveedor");
  const mp = decidirAsiento({ ...base, origen: "RECEIVABLE", medio: "MERCADOPAGO" });
  assert.ok(mp.ok);
  assert.equal(mp.asiento.method, "MP");
});

test("freno de día cerrado: si hoy ya se cerró, no se asienta y dice qué día usar", () => {
  const d = decidirAsiento({
    origen: "RECEIVABLE", medio: "EFECTIVO", monto: 100, detalle: "x",
    hoy: "2026-09-23", cerradoHasta: "2026-09-23",
  });
  assert.equal(d.ok, false);
  assert.ok(!d.ok && /23\/09\/2026/.test(d.error) && /24\/09\/2026/.test(d.error), !d.ok ? d.error : "");
  assert.equal(decidirAsiento({ origen: "PAYABLE", medio: "EFECTIVO", monto: 0, detalle: "", hoy: "2026-09-23", cerradoHasta: null }).ok, false);
});

// ── La composición en la transacción ──────────────────────────────────────────

type Escritura = { modelo: string; op: string; data: Record<string, unknown> };

/** Transacción falsa: la frontera del cierre, los cobros previos y el turno abierto, a pedido. */
function txFalsa(opts: { cerradoHasta?: string | null; cobrosPrevios?: number[]; turnoAbierto?: string | null }) {
  const escrituras: Escritura[] = [];
  const dec = (n: number) => ({ toNumber: () => n });
  const tx = {
    cashMovement: {
      // Frontera: el corte inicial (no hay) …
      findFirst: async () => null,
      create: async (a: { data: Record<string, unknown> }) => {
        escrituras.push({ modelo: "cashMovement", op: "create", data: a.data });
        return { id: "mov-1" };
      },
    },
    // … y el último cierre diario.
    auditLog: { findFirst: async () => (opts.cerradoHasta ? { entityId: opts.cerradoHasta } : null) },
    collection: {
      findMany: async () => (opts.cobrosPrevios ?? []).map((n) => ({ amount: dec(n) })),
      create: async (a: { data: Record<string, unknown> }) => {
        escrituras.push({ modelo: "collection", op: "create", data: a.data });
        return { id: "cob-1" };
      },
    },
    order: { updateMany: async () => ({ count: 0 }) },
    cashSession: { findFirst: async () => (opts.turnoAbierto ? { id: opts.turnoAbierto } : null) },
  };
  return { tx: tx as unknown as Parameters<typeof aplicarConAsientoInTx>[0], escrituras };
}

const AHORA = new Date("2026-09-23T15:00:00.000Z"); // 23/09 12:00 en Buenos Aires

const cobroFiado = (monto: number) => ({
  originType: "RECEIVABLE" as const,
  originId: "ar-1",
  totalCharged: 1000,
  amount: monto,
  method: "EFECTIVO" as const,
  collectedBy: "user:u-1",
  origen: "RECEIVABLE" as const,
  detalle: "Cobro de cuenta corriente — Ana",
  ahora: AHORA,
});

test("un cobro de fiado queda en el libro, con su cobro, en la misma transacción — y el cierre cuadra", async () => {
  const { tx, escrituras } = txFalsa({ cerradoHasta: "2026-09-22", cobrosPrevios: [200], turnoAbierto: "turno-7" });
  const res = await aplicarConAsientoInTx(tx, "t-1", cobroFiado(300));
  assert.equal(res.collectionId, "cob-1");
  assert.equal(res.settlement.balance, 500);

  assert.deepEqual(escrituras.map((e) => `${e.modelo}.${e.op}`), ["collection.create", "cashMovement.create"]);
  const mov = escrituras[1].data;
  assert.deepEqual(
    { ...mov },
    {
      tenantId: "t-1",
      sessionId: "turno-7",
      type: "INGRESO",
      method: "EFECTIVO",
      amount: 300,
      reason: "Cobro de cuenta corriente — Ana",
      occurredAt: AHORA,
      collectionId: "cob-1",
      createdBy: `${CUENTA_CORRIENTE_ACTOR_PREFIX}cob-1`,
    },
  );
  assert.ok(esAsientoDeCuentaCorriente(mov as { createdBy: string }));

  // El cierre del día con ese asiento: la persona cuenta $300 en el cajón y CUADRA. Antes el
  // cobro no entraba al libro, el esperado era 0 y los $300 aparecían como sobrante.
  const cierre = buildCierreDiario({
    day: "2026-09-23",
    previous: [],
    movements: [
      {
        id: "mov-1",
        occurredAt: AHORA,
        type: mov.type as CashMovementType,
        method: mov.method as CashMethod,
        amount: mov.amount as number,
        detail: mov.reason as string,
        collectionId: "cob-1",
        collectionOrigin: "RECEIVABLE",
      },
    ],
    declared: { EFECTIVO: 300, MP: null, TARJETA: null },
  });
  assert.equal(cierre.estado, "CUADRA");
  assert.equal(cierre.porMedio.EFECTIVO.cobrosCartera, 300);
  assert.equal(cierre.cobrosCarteraCount, 1);
});

test("día cerrado: se rechaza ANTES de escribir nada (ni cobro ni asiento)", async () => {
  const { tx, escrituras } = txFalsa({ cerradoHasta: "2026-09-23" });
  await assert.rejects(aplicarConAsientoInTx(tx, "t-1", cobroFiado(300)), AsientoRechazadoError);
  assert.deepEqual(escrituras, []);
});

test("un cobro que excede el saldo no deja asiento en el libro", async () => {
  const { tx, escrituras } = txFalsa({ cerradoHasta: null, cobrosPrevios: [900] });
  await assert.rejects(aplicarConAsientoInTx(tx, "t-1", cobroFiado(300)), /saldo pendiente 100/);
  assert.equal(escrituras.filter((e) => e.modelo === "cashMovement").length, 0);
});

test("sin turno abierto, el asiento queda suelto (el libro lo toma igual)", async () => {
  const { tx, escrituras } = txFalsa({ cerradoHasta: null });
  await aplicarConAsientoInTx(tx, "t-1", { ...cobroFiado(100), method: "TRANSFERENCIA" });
  const mov = escrituras.find((e) => e.modelo === "cashMovement")!.data;
  assert.equal(mov.sessionId, null);
  assert.equal(mov.method, "MP");
});

// ── El interruptor por negocio reemplaza a la variable (Magra, tanda 2 · 2D) ──────────────────

test("cuentas corrientes por negocio: el interruptor tocado manda; sin tocar, la variable de siempre", () => {
  const prendida = { CUENTAS_CORRIENTES_ENABLED: "true" };
  const apagada = {};
  // Nunca tocado (cuando = null): la variable decide, como antes del cambio.
  const sinTocar = todosApagados()[CUENTAS_CORRIENTES];
  assert.equal(cuentasCorrientesPrendidas(sinTocar, prendida), true, "un negocio que dependía de la variable sigue igual");
  assert.equal(cuentasCorrientesPrendidas(sinTocar, apagada), false);
  assert.equal(cuentasCorrientesPrendidas(null, prendida), true, "lectura fallida: la variable");
  assert.equal(cuentasCorrientesPrendidas(undefined, apagada), false);
  // Tocado por la consola: manda, para los dos lados.
  const fila = (action: string, h: number) => ({
    id: `f${h}`,
    entity: "Interruptor",
    entityId: CUENTAS_CORRIENTES,
    action,
    actor: "operator:facu",
    channel: "operador",
    createdAt: new Date(Date.UTC(2026, 9, 22, h)),
  });
  const encendido = estadoDesdeFilas([fila("interruptor.encender", 10)])[CUENTAS_CORRIENTES];
  assert.equal(cuentasCorrientesPrendidas(encendido, apagada), true, "prendido en el negocio aunque la variable esté apagada");
  const apagadoDespues = estadoDesdeFilas([fila("interruptor.encender", 10), fila("interruptor.apagar", 11)])[CUENTAS_CORRIENTES];
  assert.equal(cuentasCorrientesPrendidas(apagadoDespues, prendida), false, "apagado en el negocio aunque la variable esté prendida");
  // Una fila forjada desde la app (canal admin) no cuenta: sigue la variable.
  const forjada = estadoDesdeFilas([{ ...fila("interruptor.encender", 12), channel: "admin" }])[CUENTAS_CORRIENTES];
  assert.equal(cuentasCorrientesPrendidas(forjada, apagada), false);
  // Está en el catálogo de la consola y no cambia qué apps ve nadie.
  assert.ok(esInterruptorId("cuentas-corrientes"));
  assert.equal(interruptorPorId(CUENTAS_CORRIENTES).cambiaLasApps, false);
});
