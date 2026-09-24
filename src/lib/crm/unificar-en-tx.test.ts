// ============================================================================
// UNIFICAR FICHAS — el cuerpo de la transacción, EJECUTADO.
// ============================================================================
//
// `unificarFichasEnTx` mueve fiado, turnos y pedidos. Se corre entero contra una base falsa
// con DOS negocios, que hace respetar lo que Postgres hace respetar: cada `where` se evalúa con
// su negocio y el borrado de una ficha con filas colgadas falla por la clave foránea (P2003).

import { test } from "node:test";
import assert from "node:assert/strict";
import type { Prisma } from "@/generated/prisma/client";
import { unificarFichasEnTx } from "./unificar-en-tx";

type Fila = { id: string; tenantId: string; clientId: string };
type Ficha = {
  id: string;
  tenantId: string;
  name: string;
  phone: string;
  email: string | null;
  notes: string | null;
  birthDate: Date | null;
  isResident: boolean | null;
  createdAt: Date;
};

function mundo() {
  const f = (id: string, tenantId: string, over: Partial<Ficha> = {}): Ficha => ({
    id,
    tenantId,
    name: "Ana",
    phone: "11 4000-7919",
    email: null,
    notes: null,
    birthDate: null,
    isResident: null,
    createdAt: new Date("2026-01-01T12:00:00Z"),
    ...over,
  });
  return {
    fichas: [
      f("queda", "t_magra"),
      f("dup", "t_magra", { phone: "1140007919", email: "ana@x.com", notes: "alérgica" }),
      // Otro negocio con una ficha de id y contenido que se cruzan: no se puede tocar.
      f("ajena", "t_shine"),
    ],
    turnos: [
      { id: "a1", tenantId: "t_magra", clientId: "dup" },
      { id: "a2", tenantId: "t_magra", clientId: "queda" },
      { id: "a3", tenantId: "t_shine", clientId: "ajena" },
    ] as Fila[],
    pedidos: [
      { id: "o1", tenantId: "t_magra", clientId: "dup" },
      { id: "o2", tenantId: "t_shine", clientId: "ajena" },
    ] as Fila[],
    fiado: [
      { id: "ar1", tenantId: "t_magra", clientId: "dup" },
      { id: "ar2", tenantId: "t_shine", clientId: "ajena" },
    ] as Fila[],
    auditoria: [] as Record<string, unknown>[],
  };
}

type Where = { tenantId?: string; id?: string | { in: string[] }; clientId?: { in: string[] } };
const coincide = (r: { id: string; tenantId: string; clientId?: string }, w: Where) =>
  (w.tenantId === undefined || r.tenantId === w.tenantId) &&
  (w.id === undefined || (typeof w.id === "string" ? r.id === w.id : w.id.in.includes(r.id))) &&
  (w.clientId === undefined || (r.clientId !== undefined && w.clientId.in.includes(r.clientId)));

function tabla(filas: Fila[]) {
  return {
    findMany: async (a: { where: Where }) => filas.filter((r) => coincide(r, a.where)).map((r) => ({ id: r.id })),
    updateMany: async (a: { where: Where; data: { clientId: string } }) => {
      const hits = filas.filter((r) => coincide(r, a.where));
      for (const r of hits) r.clientId = a.data.clientId;
      return { count: hits.length };
    },
  };
}

function txDe(m: ReturnType<typeof mundo>, opts: { turnoNuevoEnDuplicada?: boolean } = {}) {
  return {
    client: {
      findMany: async (a: { where: Where }) => m.fichas.filter((r) => coincide(r, a.where)).map((r) => ({ ...r })),
      updateMany: async (a: { where: Where; data: Partial<Ficha> }) => {
        const hits = m.fichas.filter((r) => coincide(r, a.where));
        for (const r of hits) Object.assign(r, a.data);
        return { count: hits.length };
      },
      deleteMany: async (a: { where: Where }) => {
        if (opts.turnoNuevoEnDuplicada) m.turnos.push({ id: "a_nuevo", tenantId: "t_magra", clientId: "dup" });
        const borrar = m.fichas.filter((r) => coincide(r, a.where));
        // La clave foránea: una ficha con turnos, pedidos o fiado colgados no se borra.
        const colgadas = [...m.turnos, ...m.pedidos, ...m.fiado].some((x) => borrar.some((b) => b.id === x.clientId));
        if (colgadas) throw Object.assign(new Error("Foreign key constraint violated"), { code: "P2003" });
        m.fichas = m.fichas.filter((r) => !borrar.includes(r));
        return { count: borrar.length };
      },
    },
    appointment: tabla(m.turnos),
    order: tabla(m.pedidos),
    accountReceivable: tabla(m.fiado),
    auditLog: {
      create: async (a: { data: Record<string, unknown> }) => {
        m.auditoria.push(a.data);
        return { id: `al_${m.auditoria.length}` };
      },
    },
  } as unknown as Prisma.TransactionClient;
}

const PEDIDO = { conservaId: "queda", eliminaIds: ["dup"], actor: "user:u1", conFiado: true, eventos: [] };

test("mueve las TRES claves foráneas (turnos, pedidos, fiado) a la ficha que queda y borra la duplicada", async () => {
  const m = mundo();
  const r = await unificarFichasEnTx(txDe(m), "t_magra", PEDIDO);
  assert.deepEqual(r, { ok: true, nombre: "Ana", turnos: 1, pedidos: 1, fiado: 1, fichas: 1 });
  assert.equal(m.turnos.find((t) => t.id === "a1")!.clientId, "queda");
  assert.equal(m.pedidos.find((o) => o.id === "o1")!.clientId, "queda");
  assert.equal(m.fiado.find((d) => d.id === "ar1")!.clientId, "queda");
  assert.deepEqual(m.fichas.map((f) => f.id).sort(), ["ajena", "queda"]);
  // Completa lo que le faltaba, sin pisar nada.
  const queda = m.fichas.find((f) => f.id === "queda")!;
  assert.equal(queda.email, "ana@x.com");
  assert.match(String(queda.notes), /alérgica/);
});

test("no toca NADA del otro negocio, aunque le pasen sus ids", async () => {
  const m = mundo();
  const r = await unificarFichasEnTx(txDe(m), "t_magra", { ...PEDIDO, eliminaIds: ["dup", "ajena"] });
  // La ficha ajena no se lee con el negocio de la acción: el plan ve que falta una y no hace nada.
  assert.equal(r.ok, false);
  assert.equal(m.turnos.find((t) => t.id === "a3")!.clientId, "ajena");
  assert.equal(m.pedidos.find((o) => o.id === "o2")!.clientId, "ajena");
  assert.equal(m.fiado.find((d) => d.id === "ar2")!.clientId, "ajena");
  assert.ok(m.fichas.some((f) => f.id === "ajena"));
  assert.equal(m.auditoria.length, 0);
});

test("audita los ids movidos y la foto de la ficha borrada, en la misma transacción", async () => {
  const m = mundo();
  await unificarFichasEnTx(txDe(m), "t_magra", PEDIDO);
  const fila = m.auditoria.find((a) => a.action === "unificar")!;
  assert.equal(fila.tenantId, "t_magra");
  assert.equal(fila.entityId, "queda");
  const c = fila.changes as { movidos: Record<string, string[]>; eliminadas: { id: string; email: string | null }[] };
  assert.deepEqual(c.movidos, { turnos: ["a1"], pedidos: ["o1"], fiado: ["ar1"] });
  assert.deepEqual(c.eliminadas.map((e) => [e.id, e.email]), [["dup", "ana@x.com"]]);
});

test("sin la tabla del fiado (migración sin aplicar) no la nombra: turnos y pedidos se mueven igual", async () => {
  const m = mundo();
  m.fiado.length = 0;
  const tx = txDe(m) as unknown as Record<string, unknown>;
  // Como en una base sin la tabla: cualquier consulta al fiado revienta con P2021.
  tx.accountReceivable = new Proxy({}, { get: () => async () => { throw Object.assign(new Error("tabla inexistente"), { code: "P2021" }); } });
  const r = await unificarFichasEnTx(tx as unknown as Prisma.TransactionClient, "t_magra", { ...PEDIDO, conFiado: false });
  assert.deepEqual(r, { ok: true, nombre: "Ana", turnos: 1, pedidos: 1, fiado: 0, fichas: 1 });
});

test("un turno cargado en la duplicada mientras tanto: la clave foránea frena y se propaga P2003", async () => {
  const m = mundo();
  await assert.rejects(
    () => unificarFichasEnTx(txDe(m, { turnoNuevoEnDuplicada: true }), "t_magra", PEDIDO),
    (e: unknown) => (e as { code?: string }).code === "P2003",
  );
});
