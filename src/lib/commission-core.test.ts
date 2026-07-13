// ============================================================================
// TEST-GATE concurrencia — liquidación de comisiones anti-doble-pago.
// ============================================================================
//
// Invariante: dos liquidaciones concurrentes del MISMO profesional (doble-click /
// dos pestañas del OWNER) NO pueden crear dos `CommissionPayout` con el mismo monto.
// El fix combina Serializable (en `settleCommissions`) + COMPARE-AND-SET aquí: el
// `updateMany` solo estampa turnos que SIGUEN sin liquidar (`commissionPayoutId:null`);
// si otra operación reclamó parte del set, `claimed.count != ids.length` → throw
// (aborta la tx, rollback del payout).
//
// Sin DB (ADR-026): se testea la ORQUESTACIÓN real (`settleCommissionsInTx`) contra un
// doble de test (patrón invoice-core.test). La carrera se inyecta con un hook que
// "reclama" un turno ENTRE el create del payout y el updateMany (como haría una tx
// concurrente que commiteó primero).

import { test } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@/generated/prisma/client";
import { settleCommissionsInTx, resolvePct } from "./commission-core";

type Appt = {
  id: string;
  startsAt: Date;
  serviceId: string;
  commissionPayoutId: string | null;
  payment: { amount: number; status: string } | null;
};

function makeMockTx(opts: {
  professional: { id: string; name: string; commissionPercent: number } | null;
  appointments: Appt[];
  overrides?: { serviceId: string; commissionPercent: number }[];
  // Simula una tx concurrente que reclama turnos entre el create y el updateMany.
  onCreatePayout?: (appts: Appt[]) => void;
}) {
  const appts = opts.appointments;
  let seq = 0;
  const created: { id: string; amount: number }[] = [];
  let lastUpdateWhere: { id: { in: string[] }; commissionPayoutId?: unknown } | null = null;

  const tx = {
    professional: {
      findFirst: async () => opts.professional,
    },
    appointment: {
      findMany: async () =>
        appts.filter((a) => a.commissionPayoutId === null && a.payment?.status === "APPROVED"),
      updateMany: async (args: {
        where: { id: { in: string[] }; commissionPayoutId?: unknown };
        data: { commissionPayoutId: string };
      }) => {
        lastUpdateWhere = args.where;
        const ids = args.where.id.in;
        // La guarda real: solo cuenta/estampa los que siguen en null (compare-and-set).
        const requireNull = "commissionPayoutId" in args.where && args.where.commissionPayoutId === null;
        let count = 0;
        for (const a of appts) {
          if (!ids.includes(a.id)) continue;
          if (requireNull && a.commissionPayoutId !== null) continue;
          a.commissionPayoutId = args.data.commissionPayoutId;
          count++;
        }
        return { count };
      },
    },
    professionalServiceCommission: {
      findMany: async () => opts.overrides ?? [],
    },
    commissionPayout: {
      create: async (args: { data: { amount: number } }) => {
        opts.onCreatePayout?.(appts);
        const p = { id: `payout_${++seq}`, amount: args.data.amount };
        created.push(p);
        return p;
      },
    },
  };

  return {
    tx: tx as unknown as Prisma.TransactionClient,
    created,
    getLastUpdateWhere: () => lastUpdateWhere,
  };
}

const ARGS = { tenantId: "t1", professionalId: "prof1", note: null, settledBy: "user:u1" };

test("resolvePct: override por servicio gana sobre el % general", () => {
  assert.equal(resolvePct(30, new Map([["s1", 50]]), "s1"), 50);
  assert.equal(resolvePct(30, new Map([["s1", 50]]), "s2"), 30);
});

test("happy path: liquida todos los pendientes con el monto correcto y UN payout", async () => {
  const m = makeMockTx({
    professional: { id: "prof1", name: "Ana", commissionPercent: 50 },
    appointments: [
      { id: "a1", startsAt: new Date("2026-01-01"), serviceId: "s1", commissionPayoutId: null, payment: { amount: 1000, status: "APPROVED" } },
      { id: "a2", startsAt: new Date("2026-01-02"), serviceId: "s1", commissionPayoutId: null, payment: { amount: 2000, status: "APPROVED" } },
    ],
  });
  const res = await settleCommissionsInTx(m.tx, ARGS);
  assert.equal(res.count, 2);
  assert.equal(res.amount, 1500); // 1000*50% + 2000*50%
  assert.equal(m.created.length, 1);
  // La guarda compare-and-set DEBE estar en el where del updateMany.
  const where = m.getLastUpdateWhere();
  assert.ok(where && "commissionPayoutId" in where && where.commissionPayoutId === null,
    "el updateMany debe filtrar por commissionPayoutId: null (compare-and-set)");
});

test("REGRESIÓN concurrencia: si otra tx reclamó un turno del set, ABORTA (no doble-paga)", async () => {
  const appts: Appt[] = [
    { id: "a1", startsAt: new Date("2026-01-01"), serviceId: "s1", commissionPayoutId: null, payment: { amount: 1000, status: "APPROVED" } },
    { id: "a2", startsAt: new Date("2026-01-02"), serviceId: "s1", commissionPayoutId: null, payment: { amount: 2000, status: "APPROVED" } },
  ];
  const m = makeMockTx({
    professional: { id: "prof1", name: "Ana", commissionPercent: 50 },
    appointments: appts,
    // Entre el create del payout y el updateMany, una tx concurrente reclama a2.
    onCreatePayout: (list) => {
      const a2 = list.find((a) => a.id === "a2");
      if (a2) a2.commissionPayoutId = "payout_concurrente";
    },
  });
  // El set leído tenía 2 pendientes; el compare-and-set solo estampa 1 → throw.
  await assert.rejects(() => settleCommissionsInTx(m.tx, ARGS), /concurrente/i);
});

test("sin pendientes: no crea payout y devuelve count 0", async () => {
  const m = makeMockTx({
    professional: { id: "prof1", name: "Ana", commissionPercent: 50 },
    appointments: [],
  });
  const res = await settleCommissionsInTx(m.tx, ARGS);
  assert.equal(res.count, 0);
  assert.equal(m.created.length, 0);
});
