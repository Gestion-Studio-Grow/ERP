// Cuentas corrientes con CUENTAS_CORRIENTES_ENABLED, EJECUTADAS: el pago a un proveedor, el
// cheque que se acredita y el cobro de un fiado, cada uno dentro de la transacción (falsa,
// que anota cada escritura). Lo que se prueba es lo que después ve el libro de caja: qué fila
// queda, con qué medio y marca, y que un rechazo no deja nada escrito.
//
// La transacción real es Serializable y todo-o-nada (`tenantTransaction`): acá "no deja nada"
// se mira en las escrituras de cobro y de libro. El cambio de estado del cheque que precede
// al asiento vuelve atrás con la transacción cuando el asiento se rechaza.

import { test } from "node:test";
import assert from "node:assert/strict";
import { pagarDeudaInTx, transicionarChequeInTx } from "./payable-service";
import { cobrarFiadoInTx } from "./receivable-service";
import { AsientoRechazadoError } from "@/lib/settlement/collection-repo";
import { CUENTA_CORRIENTE_ACTOR_PREFIX, MEDIO_OBLIGATORIO } from "@/lib/settlement/asiento-libro";
import { buildCierreDiario } from "@/lib/caja/cierre-diario";
import type { CashMethod, CashMovementType } from "@/lib/caja/cash-register";

type Escritura = { modelo: string; op: string; data: Record<string, unknown> };

const dec = (n: number) => ({ toNumber: () => n });

/** Transacción falsa con una deuda (a pagar o a cobrar), un cheque, la frontera del cierre y los cobros previos. */
function txFalsa(opts: {
  cerradoHasta?: string | null;
  cobrosPrevios?: number[];
  deuda?: { amount: number; status?: string; nombre?: string } | null;
  cheque?: { status: string; amount: number } | null;
  casPierde?: boolean;
}) {
  const escrituras: Escritura[] = [];
  const deuda =
    opts.deuda === null
      ? null
      : {
          amount: dec(opts.deuda?.amount ?? 1000),
          status: opts.deuda?.status ?? "OPEN",
          supplier: { name: opts.deuda?.nombre ?? "Frigorífico Sur" },
          client: { name: opts.deuda?.nombre ?? "Parrilla El Tano" },
        };
  const tx = {
    accountPayable: { findFirst: async () => deuda },
    accountReceivable: { findFirst: async () => deuda },
    payableCheque: {
      findFirst: async () =>
        opts.cheque ? { id: "ch-1", status: opts.cheque.status, amount: dec(opts.cheque.amount), payableId: "ap-1" } : null,
      updateMany: async (a: { data: Record<string, unknown> }) => {
        escrituras.push({ modelo: "payableCheque", op: "updateMany", data: a.data });
        return { count: opts.casPierde ? 0 : 1 };
      },
    },
    // Frontera del cierre: sin corte inicial…
    cashMovement: {
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
    cashSession: { findFirst: async () => null },
  };
  return { tx: tx as unknown as Parameters<typeof pagarDeudaInTx>[0], escrituras };
}

const AHORA = new Date("2026-09-23T15:00:00.000Z"); // 23/09 12:00 en Buenos Aires
const pago = (monto: number, method: string = "EFECTIVO") => ({ amount: monto, method: method as "EFECTIVO", by: "user:u-1" });
const plata = (e: Escritura[]) => e.filter((x) => x.modelo === "collection" || x.modelo === "cashMovement");

test("pago a proveedor: el pago y el EGRESO del libro en la misma transacción, y el cierre del día cuadra", async () => {
  const { tx, escrituras } = txFalsa({ cerradoHasta: "2026-09-22", cobrosPrevios: [200] });
  const res = await pagarDeudaInTx(tx, "t-1", "ap-1", pago(400), AHORA);
  assert.equal(res.settlement.balance, 400);
  assert.deepEqual(escrituras.map((e) => `${e.modelo}.${e.op}`), ["collection.create", "cashMovement.create"]);
  assert.equal(escrituras[0].data.originType, "PAYABLE");
  const mov = escrituras[1].data;
  assert.equal(mov.type, "EGRESO");
  assert.equal(mov.method, "EFECTIVO");
  assert.equal(mov.amount, 400);
  assert.equal(mov.reason, "Pago a proveedor — Frigorífico Sur");
  assert.equal(mov.collectionId, "cob-1");
  assert.equal(mov.createdBy, `${CUENTA_CORRIENTE_ACTOR_PREFIX}cob-1`);

  // El cierre del día: entraron $1.000 de ventas, salieron $400 al proveedor, en el cajón hay
  // $600 → CUADRA. Antes el pago no pasaba por el libro, el esperado era $1.000 y faltaban $400.
  const cierre = buildCierreDiario({
    day: "2026-09-23",
    previous: [],
    movements: [
      { id: "v-1", occurredAt: AHORA, type: "INGRESO", method: "EFECTIVO", amount: 1000, detail: "Ventas" },
      {
        id: "mov-1",
        occurredAt: AHORA,
        type: mov.type as CashMovementType,
        method: mov.method as CashMethod,
        amount: mov.amount as number,
        detail: mov.reason as string,
        collectionId: "cob-1",
        collectionOrigin: "PAYABLE",
      },
    ],
    declared: { EFECTIVO: 600, MP: null, TARJETA: null },
  });
  assert.equal(cierre.estado, "CUADRA");
});

test("pago por transferencia va a la columna MP; sin medio, se rechaza sin escribir", async () => {
  const transf = txFalsa({});
  await pagarDeudaInTx(transf.tx, "t-1", "ap-1", pago(100, "TRANSFERENCIA"), AHORA);
  assert.equal(transf.escrituras.find((e) => e.modelo === "cashMovement")!.data.method, "MP");

  const sinMedio = txFalsa({});
  await assert.rejects(pagarDeudaInTx(sinMedio.tx, "t-1", "ap-1", pago(100, ""), AHORA), (e: Error) => e.message === MEDIO_OBLIGATORIO);
  assert.deepEqual(plata(sinMedio.escrituras), []);
});

test("pago con la caja de hoy cerrada, o a una deuda anulada: rechazo y nada escrito", async () => {
  const cerrado = txFalsa({ cerradoHasta: "2026-09-23" });
  await assert.rejects(pagarDeudaInTx(cerrado.tx, "t-1", "ap-1", pago(100), AHORA), AsientoRechazadoError);
  assert.deepEqual(plata(cerrado.escrituras), []);

  const anulada = txFalsa({ deuda: { amount: 1000, status: "VOID" } });
  await assert.rejects(pagarDeudaInTx(anulada.tx, "t-1", "ap-1", pago(100), AHORA), /anulada/);
  assert.deepEqual(plata(anulada.escrituras), []);

  const excede = txFalsa({ cobrosPrevios: [950] });
  await assert.rejects(pagarDeudaInTx(excede.tx, "t-1", "ap-1", pago(100), AHORA), /saldo pendiente 50/);
  assert.deepEqual(excede.escrituras.filter((e) => e.modelo === "cashMovement"), [], "sin pago no hay asiento");
});

test("cheque acreditado: cambia de estado, paga la deuda y deja el EGRESO por transferencia", async () => {
  const { tx, escrituras } = txFalsa({ cheque: { status: "DELIVERED", amount: 700 } });
  await transicionarChequeInTx(tx, "t-1", "ch-1", "CLEARED", "user:u-1", { asentarEnLibro: true, ahora: AHORA });
  assert.deepEqual(escrituras.map((e) => `${e.modelo}.${e.op}`), ["payableCheque.updateMany", "collection.create", "cashMovement.create"]);
  const mov = escrituras[2].data;
  assert.equal(mov.type, "EGRESO");
  assert.equal(mov.method, "MP", "un cheque acreditado es plata del banco, no del cajón");
  assert.equal(mov.amount, 700);
  assert.equal(mov.reason, "Cheque acreditado — Frigorífico Sur");
});

test("cheque acreditado por más que el saldo: se registra igual (es un hecho del banco) y queda pagado de más", async () => {
  const { tx, escrituras } = txFalsa({ cheque: { status: "DELIVERED", amount: 1500 }, cobrosPrevios: [0] });
  await transicionarChequeInTx(tx, "t-1", "ch-1", "CLEARED", "user:u-1", { asentarEnLibro: true, ahora: AHORA });
  assert.equal(escrituras.find((e) => e.modelo === "collection")!.data.amount, 1500);
  assert.equal(escrituras.find((e) => e.modelo === "cashMovement")!.data.amount, 1500);
});

test("cheque acreditado con la caja de hoy cerrada: rechazo, sin pago ni asiento (el cambio de estado vuelve atrás con la transacción)", async () => {
  const { tx, escrituras } = txFalsa({ cheque: { status: "DELIVERED", amount: 700 }, cerradoHasta: "2026-09-23" });
  await assert.rejects(
    transicionarChequeInTx(tx, "t-1", "ch-1", "CLEARED", "user:u-1", { asentarEnLibro: true, ahora: AHORA }),
    AsientoRechazadoError,
  );
  assert.deepEqual(plata(escrituras), []);
});

test("cheque rechazado, flag apagado u operación concurrente: nada de libro", async () => {
  const rebota = txFalsa({ cheque: { status: "DELIVERED", amount: 700 } });
  await transicionarChequeInTx(rebota.tx, "t-1", "ch-1", "BOUNCED", "user:u-1", { asentarEnLibro: true, ahora: AHORA });
  assert.deepEqual(plata(rebota.escrituras), [], "un cheque que rebota no pagó");

  const apagado = txFalsa({ cheque: { status: "DELIVERED", amount: 700 } });
  await transicionarChequeInTx(apagado.tx, "t-1", "ch-1", "CLEARED", "user:u-1", { asentarEnLibro: false, ahora: AHORA });
  assert.deepEqual(apagado.escrituras.map((e) => `${e.modelo}.${e.op}`), ["payableCheque.updateMany", "collection.create"], "como antes: sin asiento");

  const pierde = txFalsa({ cheque: { status: "DELIVERED", amount: 700 }, casPierde: true });
  await assert.rejects(
    transicionarChequeInTx(pierde.tx, "t-1", "ch-1", "CLEARED", "user:u-1", { asentarEnLibro: true, ahora: AHORA }),
    /operación concurrente/,
  );
  assert.deepEqual(plata(pierde.escrituras), [], "el que pierde el compare-and-set no paga dos veces");

  const invalida = txFalsa({ cheque: { status: "PENDING", amount: 700 } });
  await assert.rejects(
    transicionarChequeInTx(invalida.tx, "t-1", "ch-1", "CLEARED", "user:u-1", { asentarEnLibro: true, ahora: AHORA }),
    /Transición de cheque inválida/,
  );
});

test("cobro de fiado: INGRESO con el nombre del cliente; a una deuda anulada no se le cobra", async () => {
  const { tx, escrituras } = txFalsa({});
  await cobrarFiadoInTx(tx, "t-1", "ar-1", pago(300), AHORA);
  const mov = escrituras.find((e) => e.modelo === "cashMovement")!.data;
  assert.equal(mov.type, "INGRESO");
  assert.equal(mov.reason, "Cobro de cuenta corriente — Parrilla El Tano");
  assert.equal(escrituras.find((e) => e.modelo === "collection")!.data.originType, "RECEIVABLE");

  const anulada = txFalsa({ deuda: { amount: 1000, status: "VOID" } });
  await assert.rejects(cobrarFiadoInTx(anulada.tx, "t-1", "ar-1", pago(300), AHORA), /anulada/);
  assert.deepEqual(plata(anulada.escrituras), []);
});
