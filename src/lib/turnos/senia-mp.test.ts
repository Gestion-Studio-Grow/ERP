// ============================================================================
// TEST-GATE — seña por Mercado Pago confirma el turno (interruptor «sena-obligatoria»)
// ============================================================================
//
//  1. Pago aprobado que cubre la seña → cobro registrado + Reservado → Confirmado, auditoría «Mercado Pago».
//  2. Monto menor a la seña → cobro parcial, NO confirma, fila de aviso.
//  3. Pendiente / rechazado → nada cambia (ni una escritura).
//  4. Devolución total / contracargo → anula el cobro y vuelve a Reservado; parcial → ajusta al neto.
//  + Idempotencia por id de pago (el aviso dos veces no duplica plata) y aislamiento por negocio.
//  + El handler del plugin llama a la seña antes de facturar y con `refunded`.
//
// Sin DB: un doble en memoria del `tx` (varios negocios en la misma «base») y dobles del cobro y la
// anulación con el mismo contrato (`aplicarCobroTurnoInTx` / `anularCobroTurnoInTx`). Estilo node:test.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { PagoMP } from "@/plugins/mercadopago";
import { procesarNotificacionPago } from "@/plugins/mercadopago/handler";
import { InterruptorIlegible, aplicarPagoMPDelTurno, avisarSeniaMPFallida, type DepsServidorSeniaMP } from "./senia-mp.server";
import { AnulacionRechazada, notaDeAnulacion } from "./anulacion";
import {
  ACTOR_MP,
  ACCION_SENIA_PARCIAL_MP,
  ACCION_SENIA_MP_DEVUELTA_SIN_ANULAR,
  aplicarPagoMPDelTurnoEnTx,
  netoDelPagoMP,
  notaSeniaMP,
  planSeniaMP,
  type DepsSeniaMPTx,
} from "./senia-mp";

type Cobro = { id: string; tenantId: string; originId: string; amount: number; note: string | null; key: string | null; method: string };
type Audit = { id: string; tenantId: string; entity: string; entityId: string; action: string; actor: string; channel: string; createdAt: Date; changes?: unknown };
type Turno = { id: string; tenantId: string; status: string; startsAt: Date; priceAtBooking: number | null; service: { name: string; price: number; depositAmount: number | null } };

function coincide(fila: Record<string, unknown>, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([k, v]) => {
    const x = fila[k];
    if (v && typeof v === "object" && !(v instanceof Date)) {
      const o = v as { in?: unknown[]; startsWith?: string; path?: string[]; equals?: unknown };
      if (o.in) return o.in.includes(x);
      if (o.path) return o.path.reduce<unknown>((acc, k2) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[k2] : undefined), x) === o.equals;
      if (o.startsWith !== undefined) return typeof x === "string" && x.startsWith(o.startsWith);
    }
    return x === v;
  });
}

let seq = 0;
function base() {
  const db = { turnos: [] as Turno[], cobros: [] as Cobro[], audit: [] as Audit[], escrituras: 0 };
  const prender = (tenantId: string) =>
    db.audit.push({
      id: `i${++seq}`,
      tenantId,
      entity: "Interruptor",
      entityId: "sena-obligatoria",
      action: "interruptor.encender",
      actor: "operator:gsg",
      channel: "operador",
      createdAt: new Date("2026-11-01T10:00:00Z"),
    });
  const tx = {
    // El candado transaccional del aviso «una vez por pago» (la carrera real la prueba aviso-senia-mp-carrera-postgres).
    $executeRaw: async () => 0,
    auditLog: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => db.audit.filter((a) => coincide(a, where)).slice(-1),
      findFirst: async ({ where }: { where: Record<string, unknown> }) => db.audit.filter((a) => coincide(a, where)).at(-1) ?? null,
      create: async ({ data }: { data: Omit<Audit, "id" | "createdAt"> }) => (db.escrituras++, db.audit.push({ ...data, id: `a${++seq}`, createdAt: new Date() }), {}),
    },
    appointment: {
      findFirst: async ({ where }: { where: { id: string; tenantId: string } }) => {
        const t = db.turnos.find((x) => x.id === where.id && x.tenantId === where.tenantId);
        return t ? { ...t, client: { name: "Ana" }, payment: null } : null;
      },
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: { status: string } }) => {
        const ts = db.turnos.filter((t) => coincide(t, where));
        for (const t of ts) t.status = data.status;
        db.escrituras += ts.length;
        return { count: ts.length };
      },
    },
    collection: {
      findMany: async ({ where }: { where: { tenantId: string; originId: string | { in: string[] } } }) =>
        db.cobros
          .filter((c) => c.tenantId === where.tenantId && (typeof where.originId === "string" ? c.originId === where.originId : where.originId.in.includes(c.originId)))
          .map((c) => ({ ...c, createdAt: new Date(), collectedBy: ACTOR_MP, amount: { toNumber: () => c.amount } })),
    },
  };
  // Dobles con el contrato de los escritores reales: clave única por negocio, anulación con su marca.
  const aplicarCobro = (async (_tx: unknown, tenantId: string, a: { appointmentId: string; monto: number; note: string; idempotencyKey: string | null; withSchema: boolean; method: string }) => {
    if (a.withSchema && a.idempotencyKey) {
      const prev = db.cobros.find((c) => c.tenantId === tenantId && c.key === a.idempotencyKey);
      if (prev) return { applied: false, reason: "duplicate", collectionId: prev.id };
    }
    const id = `c${++seq}`;
    db.cobros.push({ id, tenantId, originId: a.appointmentId, amount: a.monto, note: a.note, key: a.withSchema ? a.idempotencyKey : null, method: a.method });
    db.escrituras++;
    return { applied: true, collectionId: id, monto: a.monto, estado: { cobrado: a.monto, saldo: 0 }, payment: { id: "p", amount: a.monto }, caja: null };
  }) as unknown as DepsSeniaMPTx["aplicarCobro"];
  let rechazarAnulacion: AnulacionRechazada | null = null;
  const anularCobro = (async (_tx: unknown, tenantId: string, a: { collectionId: string; appointmentId: string; motivo: string }) => {
    if (rechazarAnulacion) throw rechazarAnulacion;
    const o = db.cobros.find((c) => c.id === a.collectionId && c.tenantId === tenantId)!;
    const id = `c${++seq}`;
    db.cobros.push({ id, tenantId, originId: a.appointmentId, amount: -o.amount, note: notaDeAnulacion(o.id, a.motivo), key: null, method: o.method });
    db.escrituras++;
    return { applied: true, reversaId: id, monto: o.amount, cobradoDespues: 0, saldoDespues: 0, libro: { asentada: false, reason: "sin-migrar" } };
  }) as unknown as DepsSeniaMPTx["anularCobro"];
  const deps = (withSchema = true): DepsSeniaMPTx => ({ aplicarCobro, anularCobro, ahora: new Date("2026-11-07T12:00:00Z"), cerradoHasta: null, withSchema });
  const turno = (id: string, tenantId: string, extra: Partial<Turno> = {}) =>
    db.turnos.push({ id, tenantId, status: "PENDING", startsAt: new Date("2099-01-01T15:00:00Z"), priceAtBooking: 20000, service: { name: "Limpieza", price: 20000, depositAmount: 5000 }, ...extra });
  return {
    db,
    tx: tx as never,
    deps,
    prender,
    turno,
    rechazarAnulacionCon: (e: AnulacionRechazada) => (rechazarAnulacion = e),
  };
}

const pago = (p: Partial<PagoMP> = {}): PagoMP => ({ id: "9001", estado: "approved", monto: 5000, externalReference: "t1", ...p }) as PagoMP;

// ── Lo puro ──────────────────────────────────────────────────────────────────

test("neto del pago: aprobado = monto − devoluciones; refunded = 0; pendiente/rechazado = null", () => {
  assert.equal(netoDelPagoMP(pago()), 5000);
  assert.equal(netoDelPagoMP(pago({ posteriores: [{ tipo: "devolucion", refundId: "r", paymentId: "9001", importe: 2000 }] })), 3000);
  assert.equal(netoDelPagoMP(pago({ estado: "refunded" })), 0);
  for (const estado of ["pending", "rejected", "in_process", "cancelled"] as const) assert.equal(netoDelPagoMP(pago({ estado })), null);
  assert.equal(netoDelPagoMP(pago({ monto: 0 })), null);
});

test("plan: un cobro de ese pago anulado a mano NO se vuelve a registrar por un reenvío", () => {
  assert.deepEqual(planSeniaMP({ neto: 5000, estado: "approved", vigente: null, huboCobro: true }).tipo, "nada");
  assert.deepEqual(planSeniaMP({ neto: 5000, estado: "approved", vigente: { id: "c", amount: 5000 }, huboCobro: true }), { tipo: "nada", motivo: "ya registrado" });
});

// ── 1. Aprobado que cubre la seña ────────────────────────────────────────────

test("1. aprobado que cubre la seña: registra el cobro y confirma, con auditoría «Mercado Pago»", async () => {
  const b = base();
  b.prender("A");
  b.turno("t1", "A");
  const r = await aplicarPagoMPDelTurnoEnTx(b.tx, "A", "t1", pago(), b.deps());
  assert.equal(r.accion, "confirmado");
  assert.equal(b.db.turnos[0].status, "CONFIRMED");
  assert.equal(b.db.cobros.length, 1);
  assert.equal(b.db.cobros[0].note, notaSeniaMP("9001"));
  assert.equal(b.db.cobros[0].method, "MERCADOPAGO");
  const confirm = b.db.audit.find((a) => a.action === "confirm");
  assert.ok(confirm);
  assert.equal(confirm.actor, "Mercado Pago");
  assert.equal(confirm.tenantId, "A");
  assert.equal(confirm.channel, "webhook");
});

test("1b. interruptor apagado: no registra ni confirma (el aviso sólo factura, como siempre)", async () => {
  const b = base();
  b.turno("t1", "A");
  const r = await aplicarPagoMPDelTurnoEnTx(b.tx, "A", "t1", pago(), b.deps());
  assert.equal(r.accion, "apagada");
  assert.equal(b.db.escrituras, 0);
  assert.equal(b.db.turnos[0].status, "PENDING");
});

test("1c. turno ya Confirmado: registra la seña y no toca el estado", async () => {
  const b = base();
  b.prender("A");
  b.turno("t1", "A", { status: "CONFIRMED" });
  const r = await aplicarPagoMPDelTurnoEnTx(b.tx, "A", "t1", pago(), b.deps());
  assert.equal(r.accion, "registrado");
  assert.equal(b.db.audit.filter((a) => a.action === "confirm").length, 0);
});

// ── 2. Monto menor ───────────────────────────────────────────────────────────

test("2. monto menor a la seña: queda la seña parcial y el aviso; NO confirma", async () => {
  const b = base();
  b.prender("A");
  b.turno("t1", "A");
  const r = await aplicarPagoMPDelTurnoEnTx(b.tx, "A", "t1", pago({ monto: 3000 }), b.deps());
  assert.equal(r.accion, "senia-parcial");
  assert.equal(r.accion === "senia-parcial" && r.falta, 2000);
  assert.equal(b.db.turnos[0].status, "PENDING");
  assert.equal(b.db.cobros.length, 1);
  assert.ok(b.db.audit.some((a) => a.action === ACCION_SENIA_PARCIAL_MP && a.actor === ACTOR_MP));
});

// ── 3. Pendiente / rechazado ─────────────────────────────────────────────────

test("3. pendiente o rechazado: nada cambia, ni una lectura del turno", async () => {
  const b = base();
  b.prender("A");
  b.turno("t1", "A");
  for (const estado of ["pending", "rejected", "in_process", "cancelled"] as const) {
    const r = await aplicarPagoMPDelTurnoEnTx(b.tx, "A", "t1", pago({ estado }), b.deps());
    assert.equal(r.accion, "sin-cambios");
  }
  assert.equal(b.db.escrituras, 0);
  assert.equal(b.db.turnos[0].status, "PENDING");
});

// ── 4. Devolución / contracargo ──────────────────────────────────────────────

test("4. devolución total o contracargo (refunded): anula el cobro y el turno vuelve a Reservado", async () => {
  const b = base();
  b.prender("A");
  b.turno("t1", "A");
  await aplicarPagoMPDelTurnoEnTx(b.tx, "A", "t1", pago(), b.deps());
  assert.equal(b.db.turnos[0].status, "CONFIRMED");
  const r = await aplicarPagoMPDelTurnoEnTx(b.tx, "A", "t1", pago({ estado: "refunded" }), b.deps());
  assert.deepEqual(r, { accion: "devuelto", volvioAReservado: true });
  assert.equal(b.db.turnos[0].status, "PENDING");
  assert.equal(b.db.cobros.reduce((n, c) => n + c.amount, 0), 0);
  const vuelta = b.db.audit.find((a) => a.action === "unconfirm_falta_senia");
  assert.equal(vuelta?.actor, ACTOR_MP);
  // El reenvío del mismo aviso de devolución no anula dos veces ni re-registra.
  const n = b.db.escrituras;
  const otra = await aplicarPagoMPDelTurnoEnTx(b.tx, "A", "t1", pago({ estado: "refunded" }), b.deps());
  assert.equal(otra.accion, "sin-cambios");
  assert.equal(b.db.escrituras, n);
  // Y un aviso viejo «approved» que llega tarde tampoco revive el cobro anulado.
  const tarde = await aplicarPagoMPDelTurnoEnTx(b.tx, "A", "t1", pago(), b.deps());
  assert.equal(tarde.accion, "sin-cambios");
  assert.equal(b.db.escrituras, n);
});

test("4b. devolución parcial (sigue approved con posteriores): ajusta al neto y, si no alcanza, vuelve a Reservado", async () => {
  const b = base();
  b.prender("A");
  b.turno("t1", "A");
  await aplicarPagoMPDelTurnoEnTx(b.tx, "A", "t1", pago(), b.deps());
  const parcial = pago({ posteriores: [{ tipo: "devolucion", refundId: "r1", paymentId: "9001", importe: 2000 }] });
  const r = await aplicarPagoMPDelTurnoEnTx(b.tx, "A", "t1", parcial, b.deps());
  assert.equal(r.accion, "ajustado");
  assert.equal(b.db.cobros.reduce((n, c) => n + c.amount, 0), 3000);
  assert.equal(b.db.turnos[0].status, "PENDING");
  // Reenvío del mismo aviso: idempotente.
  const n = b.db.escrituras;
  assert.equal((await aplicarPagoMPDelTurnoEnTx(b.tx, "A", "t1", parcial, b.deps())).accion, "ya-registrado");
  assert.equal(b.db.escrituras, n);
});

test("4c. devolución con el cobro no anulable (facturado): aviso y el turno igual vuelve a Reservado", async () => {
  const b = base();
  b.prender("A");
  b.turno("t1", "A");
  await aplicarPagoMPDelTurnoEnTx(b.tx, "A", "t1", pago(), b.deps());
  b.rechazarAnulacionCon(new AnulacionRechazada("facturado"));
  const r = await aplicarPagoMPDelTurnoEnTx(b.tx, "A", "t1", pago({ estado: "refunded" }), b.deps());
  assert.deepEqual(r, { accion: "devuelto", volvioAReservado: true });
  assert.equal(b.db.turnos[0].status, "PENDING");
  assert.ok(b.db.audit.some((a) => a.action === ACCION_SENIA_MP_DEVUELTA_SIN_ANULAR));
  // O3: MP reenvía el mismo aviso → no se duplica la fila de ese pago.
  await aplicarPagoMPDelTurnoEnTx(b.tx, "A", "t1", pago({ estado: "refunded" }), b.deps());
  assert.equal(b.db.audit.filter((a) => a.action === ACCION_SENIA_MP_DEVUELTA_SIN_ANULAR).length, 1);
});

test("4d. la excepción de la dueña («confirm_sin_senia») se respeta al devolverse la seña sin poder anular", async () => {
  const b = base();
  b.prender("A");
  b.turno("t1", "A");
  await aplicarPagoMPDelTurnoEnTx(b.tx, "A", "t1", pago(), b.deps());
  b.db.audit.push({ id: "x", tenantId: "A", entity: "Appointment", entityId: "t1", action: "confirm_sin_senia", actor: "user:dueña", channel: "admin", createdAt: new Date() });
  b.rechazarAnulacionCon(new AnulacionRechazada("dia-cerrado"));
  const r = await aplicarPagoMPDelTurnoEnTx(b.tx, "A", "t1", pago({ estado: "refunded" }), b.deps());
  assert.deepEqual(r, { accion: "devuelto", volvioAReservado: false });
  assert.equal(b.db.turnos[0].status, "CONFIRMED");
});

// ── Idempotencia ─────────────────────────────────────────────────────────────

for (const withSchema of [true, false]) {
  test(`idempotencia: el mismo aviso aprobado dos veces no duplica la plata (columna de clave ${withSchema ? "migrada" : "SIN migrar"})`, async () => {
    const b = base();
    b.prender("A");
    b.turno("t1", "A");
    await aplicarPagoMPDelTurnoEnTx(b.tx, "A", "t1", pago(), b.deps(withSchema));
    const n = b.db.escrituras;
    const r = await aplicarPagoMPDelTurnoEnTx(b.tx, "A", "t1", pago(), b.deps(withSchema));
    assert.equal(r.accion, "ya-registrado");
    assert.equal(b.db.cobros.length, 1);
    assert.equal(b.db.escrituras, n);
    assert.equal(b.db.audit.filter((a) => a.action === "confirm").length, 1);
  });
}

test("idempotencia: un segundo pago distinto de la misma clienta es otro cobro", async () => {
  const b = base();
  b.prender("A");
  b.turno("t1", "A");
  await aplicarPagoMPDelTurnoEnTx(b.tx, "A", "t1", pago({ monto: 3000 }), b.deps());
  const r = await aplicarPagoMPDelTurnoEnTx(b.tx, "A", "t1", pago({ id: "9002", monto: 2000 }), b.deps());
  assert.equal(r.accion, "confirmado");
  assert.equal(b.db.cobros.length, 2);
});

// ── Aislamiento por negocio ──────────────────────────────────────────────────

test("aislamiento: el aviso del negocio B no ve ni toca el turno del negocio A (mismo id)", async () => {
  const b = base();
  b.prender("A");
  b.prender("B");
  b.turno("t1", "A");
  const r = await aplicarPagoMPDelTurnoEnTx(b.tx, "B", "t1", pago(), b.deps());
  assert.equal(r.accion, "sin-turno");
  assert.equal(b.db.turnos[0].status, "PENDING");
  assert.equal(b.db.cobros.length, 0);
});

test("aislamiento: el interruptor prendido en A no prende la regla en B", async () => {
  const b = base();
  b.prender("A");
  b.turno("t1", "B");
  const r = await aplicarPagoMPDelTurnoEnTx(b.tx, "B", "t1", pago(), b.deps());
  assert.equal(r.accion, "apagada");
  assert.equal(b.db.escrituras, 0);
});

test("aislamiento: el cobro de A con la misma clave no hace «duplicado» al cobro de B", async () => {
  const b = base();
  b.prender("A");
  b.prender("B");
  b.turno("t1", "A");
  b.turno("t1", "B");
  await aplicarPagoMPDelTurnoEnTx(b.tx, "A", "t1", pago(), b.deps());
  const r = await aplicarPagoMPDelTurnoEnTx(b.tx, "B", "t1", pago(), b.deps());
  assert.equal(r.accion, "confirmado");
  assert.deepEqual(b.db.cobros.map((c) => c.tenantId).sort(), ["A", "B"]);
  assert.ok(b.db.audit.filter((a) => a.action === "confirm").every((a) => b.db.turnos.some((t) => t.tenantId === a.tenantId)));
});

// ── El handler del plugin ────────────────────────────────────────────────────

function handlerCon(p: PagoMP) {
  const llamadas: string[] = [];
  const deps = {
    clientePara: () => ({ getPayment: async () => p }) as never,
    facturar: async () => (llamadas.push("facturar"), "inv"),
    senia: async (id: string, t: string, pg: PagoMP) => (llamadas.push(`senia:${t}:${id}:${pg.estado}`), null),
    cobrarPedido: async () => (llamadas.push("pedido"), { cobrado: true as const, code: 1, total: 1 }),
  };
  return { deps, llamadas };
}

test("handler: aprobado de un turno → seña ANTES de facturar", async () => {
  const { deps, llamadas } = handlerCon(pago());
  await procesarNotificacionPago({ type: "payment", paymentId: "9001", tenantId: "A" }, deps);
  assert.deepEqual(llamadas, ["senia:A:t1:approved", "facturar"]);
});

test("handler: refunded de un turno → seña (anula), sin facturar; pendiente/rechazado → nada", async () => {
  const r = handlerCon(pago({ estado: "refunded" }));
  await procesarNotificacionPago({ type: "payment", paymentId: "9001", tenantId: "A" }, r.deps);
  assert.deepEqual(r.llamadas, ["senia:A:t1:refunded"]);
  for (const estado of ["pending", "rejected"] as const) {
    const h = handlerCon(pago({ estado }));
    await procesarNotificacionPago({ type: "payment", paymentId: "9001", tenantId: "A" }, h.deps);
    assert.deepEqual(h.llamadas, []);
  }
});

test("handler: el pago de un PEDIDO no pasa por la seña", async () => {
  const { deps, llamadas } = handlerCon(pago({ externalReference: "pedido:o1" }));
  await procesarNotificacionPago({ type: "payment", paymentId: "9001", tenantId: "A" }, deps);
  assert.deepEqual(llamadas, ["pedido"]);
});

// ── Observaciones de la certificación de 60e587ce ───────────────────────────

function servidorCon(prendida: boolean, b = base()) {
  if (prendida) b.prender("A");
  b.turno("t1", "A");
  const log: string[] = [];
  let dentro: string | null = null;
  const deps: DepsServidorSeniaMP = {
    transaccion: async (fn, opts) => {
      const nivel = opts.isolationLevel ?? "default";
      log.push(`tx:${opts.tenantId}:${nivel}`);
      dentro = nivel;
      try {
        return await fn(b.tx);
      } finally {
        dentro = null;
      }
    },
    cerradoHastaEnTx: async (_tx, t) => (log.push(`cierre:${t}:dentro-de-${dentro}`), null),
    reglaPrendidaEnTx: async (_tx, t) => (log.push(`regla:${t}`), prendida),
    enTx: { aplicarCobro: b.deps().aplicarCobro, anularCobro: b.deps().anularCobro },
    ahora: () => new Date("2026-11-07T12:00:00Z"),
  };
  return { b, deps, log };
}

test("obs 1: regla apagada → se mira la regla primero; ni cierre de caja ni tx Serializable", async () => {
  const { b, deps, log } = servidorCon(false);
  const r = await aplicarPagoMPDelTurno("t1", "A", pago(), deps);
  assert.deepEqual(r, { accion: "apagada" });
  assert.deepEqual(log, ["tx:A:default", "regla:A"]);
  assert.equal(b.db.escrituras, 0);
});

test("obs 2: regla prendida → el cierre de caja se lee DENTRO de la tx Serializable", async () => {
  const { b, deps, log } = servidorCon(true);
  const r = await aplicarPagoMPDelTurno("t1", "A", pago(), deps);
  assert.equal(r.accion, "confirmado");
  assert.deepEqual(log, ["tx:A:default", "regla:A", "tx:A:Serializable", "cierre:A:dentro-de-Serializable"]);
  assert.equal(b.db.turnos[0].status, "CONFIRMED");
});

test("obs 1: un fallo de la seña NO bloquea la factura: se avisa al Core y se factura igual", async () => {
  const { deps, llamadas } = handlerCon(pago());
  const fallos: string[] = [];
  const r = await procesarNotificacionPago(
    { type: "payment", paymentId: "9001", tenantId: "A" },
    { ...deps, senia: async () => { throw new Error("boom"); }, alFallarSenia: async (id, t, _p, e) => { fallos.push(`${t}:${id}:${(e as Error).message}`); } },
  );
  assert.deepEqual(llamadas, ["facturar"]);
  assert.deepEqual(fallos, ["A:t1:boom"]);
  assert.equal(r.facturado, true);
  // Aunque el aviso del fallo también tire, la factura sale.
  const h = handlerCon(pago());
  const r2 = await procesarNotificacionPago(
    { type: "payment", paymentId: "9001", tenantId: "A" },
    { ...h.deps, senia: async () => { throw new Error("boom"); }, alFallarSenia: () => { throw new Error("otro"); } },
  );
  assert.equal(r2.facturado, true);
});

test("obs 1: reembolso de turno con la regla apagada contesta como antes: «estado refunded»", async () => {
  for (const senia of [async () => ({ accion: "apagada" }), async () => null]) {
    const h = handlerCon(pago({ estado: "refunded" }));
    const r = await procesarNotificacionPago({ type: "payment", paymentId: "9001", tenantId: "A" }, { ...h.deps, senia, alFallarSenia: () => {} });
    assert.deepEqual(r, { procesado: true, facturado: false, invoiceId: null, motivo: "estado refunded" });
  }
  const h = handlerCon(pago({ estado: "refunded" }));
  const r = await procesarNotificacionPago({ type: "payment", paymentId: "9001", tenantId: "A" }, { ...h.deps, senia: async () => ({ accion: "devuelto", volvioAReservado: true }) });
  assert.equal(r.motivo, "seña devuelta");
});

test("obs 1: avisarSeniaMPFallida deja la fila senia_mp_no_registrada del negocio y nunca tira", async () => {
  const b = base();
  await avisarSeniaMPFallida("t1", "A", pago(), new Error("boom"), { transaccion: async (fn) => fn(b.tx), reglaPrendidaEnTx: async () => true });
  const fila = b.db.audit.at(-1)!;
  assert.equal(fila.action, "senia_mp_no_registrada");
  assert.equal(fila.tenantId, "A");
  assert.equal(fila.entityId, "t1");
  await avisarSeniaMPFallida("t1", "A", pago(), "x", { transaccion: async () => { throw new Error("db caída"); }, reglaPrendidaEnTx: async () => true });
});

// ── Certificación de a9683e42 ────────────────────────────────────────────────

test("H1: refunded con la seña fallando (40001 agotado) → el error SUBE (webhook 500, MP reintenta) y no se traga", async () => {
  // Reproducción de la certificación: antes contestaba procesado:true (200) y el aviso quedaba escondido.
  for (const p of [pago({ estado: "refunded" })]) {
    const h = handlerCon(p);
    const avisos: string[] = [];
    await assert.rejects(
      procesarNotificacionPago(
        { type: "payment", paymentId: "9001", tenantId: "A" },
        {
          ...h.deps,
          senia: async () => { throw Object.assign(new Error("could not serialize access"), { code: "40001" }); },
          alFallarSenia: () => { avisos.push("tragado"); },
        },
      ),
      /could not serialize access/,
    );
    assert.deepEqual(avisos, ["tragado"], "en una devolución se avisa y el error sube igual");
    assert.deepEqual(h.llamadas, [], "no factura");
  }
});

test("H2: avisarSeniaMPFallida no deja fila si la regla está apagada o no se pudo leer (y nunca tira)", async () => {
  const b = base();
  const antes = b.db.audit.length;
  await avisarSeniaMPFallida("t1", "A", pago(), new Error("boom"), { transaccion: async (fn) => fn(b.tx), reglaPrendidaEnTx: async () => false });
  await avisarSeniaMPFallida("t1", "A", pago(), new Error("boom"), {
    transaccion: async (fn) => fn(b.tx),
    reglaPrendidaEnTx: async () => { throw new Error("no se pudo leer el interruptor"); },
  });
  assert.equal(b.db.audit.length, antes);
});

// ── Certificación de ae7879fd ────────────────────────────────────────────────

const ilegible = async () => {
  throw new Error("no se pudo leer el interruptor");
};
const devueltasSinAnular = (b: ReturnType<typeof base>) => b.db.audit.filter((a) => a.action === ACCION_SENIA_MP_DEVUELTA_SIN_ANULAR);

test("O1: refunded que falla → el handler avisa al Core ANTES de relanzar; un aviso que tira no tapa el error", async () => {
  let orden: string[] = [];
  for (const alFallar of [() => { orden.push("aviso"); }, () => { orden.push("aviso"); throw new Error("otro"); }]) {
    orden = [];
    const h = handlerCon(pago({ estado: "refunded" }));
    await assert.rejects(
      procesarNotificacionPago({ type: "payment", paymentId: "9001", tenantId: "A" }, { ...h.deps, senia: async () => { orden.push("senia"); throw new Error("40001"); }, alFallarSenia: alFallar }),
      /40001/,
    );
    assert.deepEqual(orden, ["senia", "aviso"]);
    assert.deepEqual(h.llamadas, []);
  }
});

test("O1/O3: avisarSeniaMPFallida de un refunded deja UNA fila senia_mp_devuelta_sin_anular por pago (regla prendida o ilegible)", async () => {
  const b = base();
  const tx = async <T,>(fn: (t: never) => Promise<T>) => fn(b.tx as never);
  for (let i = 0; i < 3; i++) {
    assert.equal(await avisarSeniaMPFallida("t1", "A", pago({ estado: "refunded" }), new Error("40001"), { transaccion: tx, reglaPrendidaEnTx: async () => true }), undefined);
  }
  assert.equal(devueltasSinAnular(b).length, 1);
  const fila = devueltasSinAnular(b)[0];
  assert.deepEqual([fila.tenantId, fila.entityId], ["A", "t1"]);
  // Regla ilegible: igual avisa (otro turno), y sin duplicar en los reintentos.
  await avisarSeniaMPFallida("t2", "A", pago({ estado: "refunded" }), new Error("x"), { transaccion: tx, reglaPrendidaEnTx: ilegible });
  await avisarSeniaMPFallida("t2", "A", pago({ estado: "refunded" }), new Error("x"), { transaccion: tx, reglaPrendidaEnTx: ilegible });
  assert.equal(devueltasSinAnular(b).length, 2);
  // Otro pago del mismo turno sí suma su fila.
  await avisarSeniaMPFallida("t1", "A", pago({ id: "9002", estado: "refunded" }), new Error("x"), { transaccion: tx, reglaPrendidaEnTx: async () => true });
  assert.equal(devueltasSinAnular(b).length, 3);
  // Regla apagada: nada.
  await avisarSeniaMPFallida("t3", "A", pago({ estado: "refunded" }), new Error("x"), { transaccion: tx, reglaPrendidaEnTx: async () => false });
  assert.equal(devueltasSinAnular(b).length, 3);
  // La base caída: no tira.
  await avisarSeniaMPFallida("t4", "A", pago({ estado: "refunded" }), new Error("x"), { transaccion: async () => { throw new Error("db caída"); }, reglaPrendidaEnTx: async () => true });
});

test("O2: approved con el interruptor ilegible → la seña tira InterruptorIlegible y el aviso contesta «reintentar» (sin fila)", async () => {
  const { b, deps } = servidorCon(true);
  await assert.rejects(aplicarPagoMPDelTurno("t1", "A", pago(), { ...deps, reglaPrendidaEnTx: ilegible }), InterruptorIlegible);
  const antes = b.db.audit.length;
  const tx = deps.transaccion;
  assert.equal(await avisarSeniaMPFallida("t1", "A", pago(), new Error("boom"), { transaccion: tx, reglaPrendidaEnTx: ilegible }), "reintentar");
  // Se pudo releer y está prendida, pero la seña falló por no poder leerlo: también se reintenta.
  assert.equal(await avisarSeniaMPFallida("t1", "A", pago(), new InterruptorIlegible(new Error("x")), { transaccion: tx, reglaPrendidaEnTx: async () => true }), "reintentar");
  assert.equal(b.db.audit.length, antes);
  // Regla apagada y leída: como antes (sin fila, sin reintento).
  assert.equal(await avisarSeniaMPFallida("t1", "A", pago(), new Error("boom"), { transaccion: tx, reglaPrendidaEnTx: async () => false }), undefined);
  // Regla prendida, error común: fila y sin reintento.
  assert.equal(await avisarSeniaMPFallida("t1", "A", pago(), new Error("boom"), { transaccion: tx, reglaPrendidaEnTx: async () => true }), undefined);
  assert.equal(b.db.audit.at(-1)!.action, "senia_mp_no_registrada");
});

test("O2: handler — approved con aviso «reintentar» → el error sube (500) y no factura; regla apagada leída sigue igual", async () => {
  const h = handlerCon(pago());
  await assert.rejects(
    procesarNotificacionPago({ type: "payment", paymentId: "9001", tenantId: "A" }, { ...h.deps, senia: async () => { throw new Error("interruptor"); }, alFallarSenia: async () => "reintentar" as const }),
    /interruptor/,
  );
  assert.deepEqual(h.llamadas, []);
  const h2 = handlerCon(pago());
  const r = await procesarNotificacionPago({ type: "payment", paymentId: "9001", tenantId: "A" }, { ...h2.deps, senia: async () => ({ accion: "apagada" }) });
  assert.equal(r.facturado, true);
  assert.deepEqual(h2.llamadas, ["facturar"]);
});
