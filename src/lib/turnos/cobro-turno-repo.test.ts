// ============================================================================
// TEST-GATE — persistencia del cobro de turno (src/lib/turnos/cobro-turno-repo.ts).
// ============================================================================
//
// Invariantes, contra un doble de tx (ADR-026, sin DB):
//  · Cada cobro deja UNA `Collection`, actualiza el `Payment` agregado y asienta UNA VENTA
//    en el libro con el medio del cobro, keyeada por `collectionId`.
//  · Doble clic con la misma clave → el segundo no escribe nada (duplicate).
//  · Cobrar más de lo que falta → rechazado ANTES de escribir (nada queda a medias).
//  · Un turno cobrado por el camino viejo (Payment sin Collection) no se cobra dos veces.
//  · Schema-ahead (`withSchema: false`): Collection + Payment sin clave ni asiento.

import { test } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@/generated/prisma/client";
import { aplicarCobroTurnoInTx, CobroTurnoRechazado, type AplicarCobroArgs, type CobroTurnoTx } from "./cobro-turno-repo";
// La lectura tolerante vive ahora acá: `cobrosPorTurno` se borró por ser un Σ ciego a `note`.
import { cobrosDetalladosPorTurno, desglosarCobros } from "./anulacion";
import { estadoCobroTurno } from "./cobros";
import { readdirSync, readFileSync } from "node:fs";

type ColRow = {
  id: string;
  originType: string;
  originId: string;
  appointmentId: string | null;
  amount: Prisma.Decimal;
  method: string;
  note?: string | null;
  idempotencyKey?: string | null;
  createdAt: Date;
};
type PayRow = { id: string; appointmentId: string; amount: number; method: string; status: string };
type MovRow = { id: string; collectionId: string | null; paymentId: string | null; type: string; amount: number; method: string; reason: string };

function makeTx(opts: { legacyPayment?: PayRow; enforceUnique?: boolean } = {}) {
  const collections: ColRow[] = [];
  const payments: PayRow[] = opts.legacyPayment ? [opts.legacyPayment] : [];
  const movements: MovRow[] = [];
  let seq = 0;
  const tx = {
    collection: {
      findFirst: async (args: { where: { idempotencyKey: string } }) => {
        const c = collections.find((x) => x.idempotencyKey === args.where.idempotencyKey);
        return c ? { id: c.id } : null;
      },
      findMany: async (args: { where: { originId: string | { in: string[] } } }) => {
        const w = args.where.originId;
        const ids = typeof w === "string" ? [w] : w.in;
        return collections.filter((c) => ids.includes(c.originId));
      },
      create: async (args: { data: Omit<ColRow, "id" | "amount" | "createdAt"> & { amount: number } }) => {
        if (opts.enforceUnique && args.data.idempotencyKey && collections.some((c) => c.idempotencyKey === args.data.idempotencyKey)) {
          throw new Prisma.PrismaClientKnownRequestError("dup", {
            code: "P2002",
            clientVersion: "7.8.0",
            meta: { target: "Collection_tenantId_idempotencyKey_key" },
          });
        }
        const row: ColRow = { ...args.data, id: `col_${++seq}`, amount: new Prisma.Decimal(args.data.amount), createdAt: new Date() };
        collections.push(row);
        return { id: row.id };
      },
    },
    payment: {
      findUnique: async (args: { where: { appointmentId: string } }) =>
        payments.find((p) => p.appointmentId === args.where.appointmentId) ?? null,
      upsert: async (args: { where: { appointmentId: string }; create: Omit<PayRow, "id">; update: Partial<PayRow> }) => {
        let p = payments.find((x) => x.appointmentId === args.where.appointmentId);
        if (p) Object.assign(p, args.update);
        else {
          p = { id: `pay_${++seq}`, ...args.create };
          payments.push(p);
        }
        return { id: p.id, amount: p.amount };
      },
    },
    cashSession: { findFirst: async () => null },
    cashMovement: {
      findFirst: async (args: { where: { collectionId?: string; paymentId?: string; type: string } }) => {
        const m = movements.find(
          (x) =>
            x.type === args.where.type &&
            (args.where.collectionId ? x.collectionId === args.where.collectionId : x.paymentId === args.where.paymentId),
        );
        return m ? { id: m.id } : null;
      },
      create: async (args: { data: Omit<MovRow, "id"> }) => {
        const m: MovRow = { id: `mov_${++seq}`, ...args.data };
        movements.push(m);
        return { id: m.id };
      },
    },
  };
  return { tx: tx as unknown as CobroTurnoTx, collections, payments, movements };
}

const args = (over: Partial<AplicarCobroArgs> = {}): AplicarCobroArgs => ({
  appointmentId: "appt_1",
  status: "PENDING",
  precio: 20000,
  monto: 5000,
  method: "TRANSFERENCIA",
  actor: "user:u1",
  detail: "Turno · Limpieza facial — Sofía",
  idempotencyKey: "senia:appt_1",
  withSchema: true,
  ...over,
});

test("seña al reservar: Collection + Payment agregado APPROVED + VENTA en el libro con el medio, keyeada por el cobro", async () => {
  const { tx, collections, payments, movements } = makeTx();
  const r = await aplicarCobroTurnoInTx(tx, "t1", args());
  assert.equal(r.applied, true);
  if (!r.applied) return;
  assert.equal(r.monto, 5000);
  assert.deepEqual(r.estado, { precio: 20000, cobrado: 5000, saldo: 15000, estado: "PARTIAL" });

  assert.equal(collections.length, 1);
  assert.equal(collections[0].originType, "APPOINTMENT");
  assert.equal(collections[0].appointmentId, "appt_1");
  assert.equal(collections[0].idempotencyKey, "senia:appt_1");

  assert.equal(payments.length, 1);
  assert.equal(payments[0].amount, 5000);
  assert.equal(payments[0].status, "APPROVED");
  assert.equal(payments[0].method, "TRANSFERENCIA");

  assert.equal(movements.length, 1);
  assert.equal(movements[0].type, "VENTA");
  assert.equal(movements[0].method, "MP", "transferencia cae en la columna MP del libro");
  assert.equal(movements[0].amount, 5000);
  assert.equal(movements[0].collectionId, collections[0].id);
  assert.equal(movements[0].paymentId, null, "el asiento se keyea por el cobro, no por el Payment agregado");
});

test("seña + saldo: dos Collection, dos asientos, y el Payment agregado suma el total del servicio", async () => {
  const { tx, collections, payments, movements } = makeTx();
  await aplicarCobroTurnoInTx(tx, "t1", args());
  const r = await aplicarCobroTurnoInTx(
    tx,
    "t1",
    args({ status: "CONFIRMED", monto: 15000, method: "EFECTIVO", idempotencyKey: "saldo:appt_1" }),
  );
  assert.equal(r.applied, true);
  if (!r.applied) return;
  assert.deepEqual(r.estado, { precio: 20000, cobrado: 20000, saldo: 0, estado: "PAID" });
  assert.equal(collections.length, 2);
  assert.equal(payments.length, 1, "Payment sigue siendo 1:1 con el turno");
  assert.equal(payments[0].amount, 20000, "lo que ven Reportes, la ficha y comisiones: el total");
  assert.equal(movements.length, 2);
  assert.deepEqual(
    movements.map((m) => [m.method, m.amount]),
    [
      ["MP", 5000],
      ["EFECTIVO", 15000],
    ],
  );
});

test("doble clic con la misma clave: el segundo no escribe nada (duplicate)", async () => {
  const { tx, collections, payments, movements } = makeTx();
  const r1 = await aplicarCobroTurnoInTx(tx, "t1", args());
  const r2 = await aplicarCobroTurnoInTx(tx, "t1", args());
  assert.equal(r1.applied, true);
  assert.deepEqual(r2, { applied: false, reason: "duplicate", collectionId: collections[0].id });
  assert.equal(collections.length, 1);
  assert.equal(payments[0].amount, 5000);
  assert.equal(movements.length, 1);
});

test("carrera: dos submits pasan el pre-check y el @@unique dispara P2002 → lo clasifica el llamador, nada escrito", async () => {
  const { tx, collections } = makeTx({ enforceUnique: true });
  // Simula que otro submit ya dejó su Collection con la misma clave sin que el pre-check la vea.
  collections.push({
    id: "col_otro",
    originType: "APPOINTMENT",
    originId: "appt_1",
    appointmentId: "appt_1",
    amount: new Prisma.Decimal(5000),
    method: "EFECTIVO",
    idempotencyKey: "uuid-x",
    createdAt: new Date(),
  });
  const original = tx.collection.findFirst;
  (tx.collection as unknown as { findFirst: () => Promise<null> }).findFirst = async () => null;
  await assert.rejects(aplicarCobroTurnoInTx(tx, "t1", args({ idempotencyKey: "uuid-x" })), (e: unknown) =>
    e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002",
  );
  (tx.collection as unknown as { findFirst: typeof original }).findFirst = original;
  assert.equal(collections.length, 1);
});

test("cobrar más de lo que falta se rechaza ANTES de escribir", async () => {
  const { tx, collections, payments, movements } = makeTx();
  await aplicarCobroTurnoInTx(tx, "t1", args({ monto: 20000, idempotencyKey: "k1" }));
  await assert.rejects(
    aplicarCobroTurnoInTx(tx, "t1", args({ monto: 1, idempotencyKey: "k2" })),
    (e: unknown) => e instanceof CobroTurnoRechazado && e.motivo === "excede-saldo" && e.saldo === 0,
  );
  assert.equal(collections.length, 1);
  assert.equal(payments[0].amount, 20000);
  assert.equal(movements.length, 1);
});

test("turno cobrado por el camino viejo (Payment APPROVED sin Collection): no se cobra dos veces", async () => {
  const { tx, collections } = makeTx({
    legacyPayment: { id: "pay_legacy", appointmentId: "appt_1", amount: 20000, method: "EFECTIVO", status: "APPROVED" },
  });
  await assert.rejects(
    aplicarCobroTurnoInTx(tx, "t1", args({ monto: 5000 })),
    (e: unknown) => e instanceof CobroTurnoRechazado && e.motivo === "excede-saldo",
  );
  assert.equal(collections.length, 0);
});

test("Payment legado PARCIAL (precio cambió): el pago previo se materializa como cobro y no se pierde un peso", async () => {
  const { tx, collections, payments, movements } = makeTx({
    legacyPayment: { id: "pay_legacy", appointmentId: "appt_1", amount: 15000, method: "EFECTIVO", status: "APPROVED" },
  });
  const r = await aplicarCobroTurnoInTx(tx, "t1", args({ status: "CONFIRMED", monto: 5000 }));
  assert.equal(r.applied, true);
  assert.equal(collections.length, 2, "el legado materializado + el cobro nuevo");
  assert.equal(collections[0].amount.toNumber(), 15000);
  assert.equal(collections[0].idempotencyKey, "legado:appt_1");
  assert.equal(payments[0].amount, 20000, "Reportes/ficha siguen viendo lo que ya había entrado");
  assert.equal(r.applied && r.estado.saldo, 0);
  assert.equal(movements.length, 1, "sólo el cobro nuevo se asienta: el legado ya tuvo su asiento por paymentId");
  assert.equal(movements[0].amount, 5000);
  // Y la lectura posterior coincide con el agregado.
  const map = await cobrosDetalladosPorTurno(tx, "t1", ["appt_1"]);
  assert.equal(map.get("appt_1")!.reduce((s: number, c: { amount: number }) => s + c.amount, 0), 20000);
});

test("schema-ahead (withSchema=false): Collection + Payment, sin clave persistente ni asiento", async () => {
  const { tx, collections, payments, movements } = makeTx();
  const r = await aplicarCobroTurnoInTx(tx, "t1", args({ withSchema: false }));
  assert.equal(r.applied, true);
  assert.equal(r.applied && r.caja, null);
  assert.equal(collections.length, 1);
  assert.equal(collections[0].idempotencyKey, undefined, "no se escribe la columna que no existe");
  assert.equal(payments[0].amount, 5000);
  assert.equal(movements.length, 0, "el libro no lo ve: lo tipea la dueña, como antes del puente");
});

test("el Payment agregado no lleva comprobanteNro: completar el turno tiene que poder facturar (ADR-024)", async () => {
  const { tx, payments } = makeTx();
  await aplicarCobroTurnoInTx(tx, "t1", args());
  assert.equal("comprobanteNro" in payments[0], false);
});

// ── Lectura tolerante ───────────────────────────────────────────────────────

test("la lectura de la agenda agrupa por turno y tolera que la tabla Collection no esté migrada", async () => {
  // Era el test de `cobrosPorTurno`. Esa función se borró (Σ ciego a `note`, muerta en
  // producción) y la agenda lee por `cobrosDetalladosPorTurno`: la tolerancia que acá se
  // verifica —que la pantalla siga cargando con la tabla sin migrar— es de la que se usa.
  const { tx } = makeTx();
  await aplicarCobroTurnoInTx(tx, "t1", args());
  await aplicarCobroTurnoInTx(tx, "t1", args({ appointmentId: "appt_2", idempotencyKey: "senia:appt_2", monto: 3000 }));
  const map = await cobrosDetalladosPorTurno(tx, "t1", ["appt_1", "appt_2", "appt_3"]);
  assert.deepEqual(map.get("appt_1")?.map((c) => c.amount), [5000]);
  assert.deepEqual(map.get("appt_2")?.map((c) => c.amount), [3000]);
  assert.equal(map.has("appt_3"), false);

  const sinTabla = {
    collection: {
      findMany: async () => {
        throw new Prisma.PrismaClientKnownRequestError("no table", { code: "P2021", clientVersion: "7.8.0", meta: { table: "Collection" } });
      },
    },
  } as unknown as Parameters<typeof cobrosDetalladosPorTurno>[0];
  const vacio = await cobrosDetalladosPorTurno(sinTabla, "t1", ["appt_1"]);
  assert.equal(vacio.size, 0, "la agenda sigue cargando");

  const otroError = {
    collection: {
      findMany: async () => {
        throw new Error("se cayó la conexión");
      },
    },
  } as unknown as Parameters<typeof cobrosDetalladosPorTurno>[0];
  await assert.rejects(cobrosDetalladosPorTurno(otroError, "t1", ["appt_1"]), /conexión/);
});


// ── El Payment agregado es PLATA, no saldo perdonado ────────────────────────
//
// El defecto: `Payment.amount` salía de un Σ ciego a la nota de la fila. Una
// `CONDONACION:` —saldo dado de baja SIN que entre un peso— se sumaba igual. Medido en el
// caso real: cobrar $5.000, condonar los $15.000 que faltaban, anular el cobro y volver a
// cobrar $5.000 dejaba `Payment.amount = 20.000` con $5.000 adentro. Esa columna alimenta
// Reportes, los KPIs, la ficha de la clienta, el libro de IVA y la BASE DE LA COMISIÓN: la
// profesional cobraba sobre plata que nunca entró.

function seed(tx: ReturnType<typeof makeTx>, filas: { amount: number; method: string; note: string | null }[]) {
  for (const f of filas) {
    // Se siembra por el mismo `create` del doble que usa la producción.
    void tx.tx.collection.create({
      data: {
        tenantId: "t1",
        originType: "APPOINTMENT",
        originId: "appt_1",
        appointmentId: "appt_1",
        amount: f.amount,
        method: f.method,
        note: f.note,
        collectedBy: "qa",
      },
    } as never);
  }
}

test("una condonación previa NO entra al Payment: el agregado es la plata que entró", async () => {
  const t = makeTx();
  // El turno vale 20.000. Ya se cobraron 5.000 y se condonaron los 15.000 que faltaban.
  seed(t, [
    { amount: 5000, method: "EFECTIVO", note: null },
    { amount: 15000, method: "EFECTIVO", note: "CONDONACION: no volvió a buscar el producto" },
  ]);
  await new Promise((r) => setTimeout(r, 0));
  // Ahora anulan el cobro de 5.000 (contrapartida) y vuelven a cobrarlo bien.
  seed(t, [{ amount: -5000, method: "EFECTIVO", note: "ANULACION:col_1 se tipeó el medio equivocado" }]);
  await new Promise((r) => setTimeout(r, 0));

  const r = await aplicarCobroTurnoInTx(t.tx, "t1", args({ monto: 5000, idempotencyKey: "recobro:appt_1" }));
  assert.equal(r.applied, true);
  assert.equal(
    t.payments[0].amount,
    5000,
    "Payment.amount tiene que ser la plata que entró (5.000), no el precio del turno (20.000). " +
      "Sobre esta columna se liquida la comisión de la profesional.",
  );
});

test("Σ cobros negativa (anulación sin su cobro) frena la escritura en vez de tapar", async () => {
  const t = makeTx();
  // Una contrapartida huérfana: el libro de este turno ya está roto. No se escribe encima.
  seed(t, [{ amount: -9000, method: "EFECTIVO", note: "ANULACION:col_fantasma error de carga" }]);
  await new Promise((r) => setTimeout(r, 0));
  await assert.rejects(
    aplicarCobroTurnoInTx(t.tx, "t1", args({ monto: 1000, idempotencyKey: "x:appt_1" })),
    /Σ cobros negativa/,
  );
});

test("la nota de un cobro no puede hacerse pasar por una marca reservada", async () => {
  const t = makeTx();
  // `note` es texto libre sin constraint en la base, y ahora decide si el peso entra al
  // agregado. Un cobro marcado como condonación se descontaría solo.
  await assert.rejects(
    aplicarCobroTurnoInTx(t.tx, "t1", args({ note: "CONDONACION: me lo perdono yo" } as Partial<AplicarCobroArgs>)),
    /marca reservada/,
  );
});

// ── La asimetría es DELIBERADA y tiene que seguir siéndolo ──────────────────

test("el SALDO ignora la nota y el AGREGADO la lee: las dos cuentas son distintas a propósito", () => {
  const filas = [
    { amount: 5000, method: "EFECTIVO", note: null },
    { amount: 15000, method: "EFECTIVO", note: "CONDONACION: cortesía" },
  ];
  // `estadoCobroTurno` tiene que seguir CIEGO: la condonación cierra el saldo, y es eso lo
  // que destraba la liquidación de la comisión. Si alguien lo "arregla" por simetría, los
  // turnos condonados no se liquidan nunca y la profesional no cobra.
  assert.equal(estadoCobroTurno({ precio: 20000, cobros: filas }).saldo, 0, "el saldo SÍ se cierra con la condonación");
  // `desglosarCobros` tiene que seguir LEYÉNDOLA: es la plata.
  const d = desglosarCobros(filas);
  assert.equal(d.cobrado, 5000, "entraron 5.000");
  assert.equal(d.condonado, 15000, "y 15.000 se perdonaron");
});

test("sólo hay DOS lugares que escriben Payment.amount en todo el árbol", () => {
  // El bug caro de este sistema no es la función mal escrita: es la SEGUNDA función que
  // escribe lo mismo por otro camino y nadie sincronizó. Lo que se persigue es quien escribe
  // el MONTO, no cualquier toque al `Payment`: `invoice-from-appointment.ts` escribe
  // `status` y `comprobanteNro` y eso no es plata. Hoy el monto lo escriben el cobro
  // (`cobro-turno-repo.ts`, upsert) y la anulación (`anulacion.ts`, updateMany), y los dos
  // lo derivan con `desglosarCobros`. Un tercero que sume montos a secas vuelve a inflarlo.
  const raiz = new URL("../../../src/", import.meta.url);
  const archivos: string[] = [];
  for (const f of readdirSync(raiz, { recursive: true }) as string[]) {
    const rel = String(f).replaceAll("\\", "/");
    if (/\.tsx?$/.test(rel) && !rel.endsWith(".test.ts") && !rel.startsWith("generated/")) archivos.push(rel);
  }
  const escritores = archivos.filter((rel) => {
    const src = readFileSync(new URL(rel, raiz), "utf8");
    for (const m of src.matchAll(/\bpayment\.(upsert|update|updateMany|create|createMany)\(/g)) {
      // El `data:` de esa llamada: si menciona `amount`, escribe plata.
      if (/\bamount\b/.test(src.slice(m.index, m.index + 500))) return true;
    }
    return false;
  });
  assert.deepEqual(
    escritores.sort(),
    ["lib/turnos/anulacion.ts", "lib/turnos/cobro-turno-repo.ts"],
    "Apareció (o se movió) un escritor de `Payment.amount`. Tiene que derivar el monto con " +
      "`desglosarCobros`, no con un Σ de los montos: una fila CONDONACION: no es plata, y " +
      "sobre esa columna se liquida la comisión de la profesional.",
  );
});

test("los dos escritores de Payment.amount derivan con desglosarCobros", () => {
  // No alcanza con que sean dos: tienen que usar la MISMA definición de "cobrado".
  for (const rel of ["turnos/cobro-turno-repo.ts", "turnos/anulacion.ts"]) {
    const src = readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
    assert.match(
      src,
      /desglosarCobros\(/,
      `src/lib/${rel} escribe Payment.amount sin pasar por desglosarCobros.`,
    );
  }
});
