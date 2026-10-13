// ============================================================================
// UNIFICAR FICHAS — el cuerpo de la transacción, EJECUTADO.
// ============================================================================
//
// `unificarFichasEnTx` mueve fiado, turnos, pedidos y las cinco claves de la inmobiliaria. Se
// corre entero contra una base falsa con DOS negocios, que hace respetar lo que Postgres hace
// respetar: cada `where` se evalúa con su negocio y el borrado de una ficha con filas colgadas
// falla por la clave foránea (P2003).

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
    // Inmobiliaria: la duplicada es dueña de una ficha, inquilina de un contrato, propietaria de
    // otro (y de su liquidación) e interesada en una consulta. En el otro negocio, lo mismo.
    propiedades: [
      { id: "p1", tenantId: "t_magra", propietarioId: "dup" },
      { id: "p2", tenantId: "t_shine", propietarioId: "ajena" },
    ] as Generica[],
    contratos: [
      { id: "c1", tenantId: "t_magra", inquilinoId: "dup", propietarioId: "otro" },
      { id: "c2", tenantId: "t_magra", inquilinoId: "otro", propietarioId: "dup" },
      { id: "c3", tenantId: "t_shine", inquilinoId: "ajena", propietarioId: "ajena" },
    ] as Generica[],
    liquidaciones: [
      { id: "l1", tenantId: "t_magra", propietarioId: "dup" },
      { id: "l2", tenantId: "t_shine", propietarioId: "ajena" },
    ] as Generica[],
    consultas: [
      { id: "q1", tenantId: "t_magra", clientId: "dup" },
      { id: "q2", tenantId: "t_magra", clientId: null },
      { id: "q3", tenantId: "t_shine", clientId: "ajena" },
    ] as Generica[],
    auditoria: [] as Record<string, unknown>[],
  };
}

/** Una fila con cualquier columna que apunte a Client (propietarioId, inquilinoId, clientId…). */
type Generica = { id: string; tenantId: string } & Record<string, string | null>;
type Where = { tenantId?: string; id?: string | { in: string[] } } & Record<string, undefined | string | { in: string[] }>;
const coincide = (r: Record<string, unknown>, w: Where) =>
  Object.entries(w).every(([k, v]) => {
    if (v === undefined) return true;
    const valor = r[k];
    return typeof v === "string" ? valor === v : typeof valor === "string" && v.in.includes(valor);
  });

function tabla(filas: Generica[]) {
  return {
    findMany: async (a: { where: Where }) => filas.filter((r) => coincide(r, a.where)).map((r) => ({ id: r.id })),
    updateMany: async (a: { where: Where; data: Record<string, string> }) => {
      const hits = filas.filter((r) => coincide(r, a.where));
      for (const r of hits) Object.assign(r, a.data);
      return { count: hits.length };
    },
  };
}

/** Las filas de la inmobiliaria que todavía apuntan a alguna de estas personas. */
const inmoColgadas = (m: ReturnType<typeof mundo>, ids: string[]) =>
  [...m.propiedades, ...m.contratos, ...m.liquidaciones, ...m.consultas].some((x) => ["propietarioId", "inquilinoId", "clientId"].some((k) => x[k] != null && ids.includes(x[k] as string)));

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
        // La clave foránea: una ficha con turnos, pedidos, fiado o filas de la inmobiliaria colgadas no se borra.
        const ids = borrar.map((b) => b.id);
        const colgadas = [...m.turnos, ...m.pedidos, ...m.fiado].some((x) => ids.includes(x.clientId)) || inmoColgadas(m, ids);
        if (colgadas) throw Object.assign(new Error("Foreign key constraint violated"), { code: "P2003" });
        m.fichas = m.fichas.filter((r) => !borrar.includes(r));
        return { count: borrar.length };
      },
    },
    appointment: tabla(m.turnos),
    order: tabla(m.pedidos),
    accountReceivable: tabla(m.fiado),
    inmoPropiedad: tabla(m.propiedades),
    inmoContrato: tabla(m.contratos),
    inmoLiquidacion: tabla(m.liquidaciones),
    inmoConsulta: tabla(m.consultas),
    auditLog: {
      create: async (a: { data: Record<string, unknown> }) => {
        m.auditoria.push(a.data);
        return { id: `al_${m.auditoria.length}` };
      },
    },
  } as unknown as Prisma.TransactionClient;
}

const PEDIDO = { conservaId: "queda", eliminaIds: ["dup"], actor: "user:u1", conFiado: true, eventos: [] };

test("mueve las claves foráneas (turnos, pedidos, fiado, inmobiliaria) a la ficha que queda y borra la duplicada", async () => {
  const m = mundo();
  const r = await unificarFichasEnTx(txDe(m), "t_magra", PEDIDO);
  assert.deepEqual(r, { ok: true, nombre: "Ana", turnos: 1, pedidos: 1, fiado: 1, inmobiliaria: 5, fichas: 1 });
  assert.equal(m.turnos.find((t) => t.id === "a1")!.clientId, "queda");
  assert.equal(m.pedidos.find((o) => o.id === "o1")!.clientId, "queda");
  assert.equal(m.fiado.find((d) => d.id === "ar1")!.clientId, "queda");
  assert.deepEqual(m.fichas.map((f) => f.id).sort(), ["ajena", "queda"]);
  // Completa lo que le faltaba, sin pisar nada.
  const queda = m.fichas.find((f) => f.id === "queda")!;
  assert.equal(queda.email, "ana@x.com");
  assert.match(String(queda.notes), /alérgica/);
});

test("inmobiliaria: la ficha, los dos contratos, la liquidación y la consulta pasan a la persona que queda; la consulta sin cliente no se toca", async () => {
  const m = mundo();
  await unificarFichasEnTx(txDe(m), "t_magra", PEDIDO);
  assert.equal(m.propiedades.find((p) => p.id === "p1")!.propietarioId, "queda");
  // Inquilina en uno, propietaria en el otro: cada columna por su lado y la otra parte no cambia.
  assert.deepEqual(m.contratos.filter((c) => c.tenantId === "t_magra").map((c) => [c.inquilinoId, c.propietarioId]), [["queda", "otro"], ["otro", "queda"]]);
  assert.equal(m.liquidaciones.find((l) => l.id === "l1")!.propietarioId, "queda");
  assert.equal(m.consultas.find((q) => q.id === "q1")!.clientId, "queda");
  assert.equal(m.consultas.find((q) => q.id === "q2")!.clientId, null);
  const fila = m.auditoria.find((a) => a.action === "unificar")!;
  const movidos = (fila.changes as { movidos: { inmobiliaria: Record<string, string[]> } }).movidos.inmobiliaria;
  assert.deepEqual(movidos, { propiedades: ["p1"], contratosInquilino: ["c1"], contratosPropietario: ["c2"], liquidaciones: ["l1"], consultas: ["q1"] });
});

test("no toca NADA del otro negocio, aunque le pasen sus ids", async () => {
  const m = mundo();
  const r = await unificarFichasEnTx(txDe(m), "t_magra", { ...PEDIDO, eliminaIds: ["dup", "ajena"] });
  // La ficha ajena no se lee con el negocio de la acción: el plan ve que falta una y no hace nada.
  assert.equal(r.ok, false);
  assert.equal(m.turnos.find((t) => t.id === "a3")!.clientId, "ajena");
  assert.equal(m.pedidos.find((o) => o.id === "o2")!.clientId, "ajena");
  assert.equal(m.fiado.find((d) => d.id === "ar2")!.clientId, "ajena");
  assert.equal(m.propiedades.find((p) => p.id === "p2")!.propietarioId, "ajena");
  assert.deepEqual([m.contratos.find((c) => c.id === "c3")!.inquilinoId, m.contratos.find((c) => c.id === "c3")!.propietarioId], ["ajena", "ajena"]);
  assert.equal(m.liquidaciones.find((l) => l.id === "l2")!.propietarioId, "ajena");
  assert.equal(m.consultas.find((q) => q.id === "q3")!.clientId, "ajena");
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
  assert.deepEqual(c.movidos.turnos, ["a1"]);
  assert.deepEqual(c.movidos.pedidos, ["o1"]);
  assert.deepEqual(c.movidos.fiado, ["ar1"]);
  assert.deepEqual(c.eliminadas.map((e) => [e.id, e.email]), [["dup", "ana@x.com"]]);
});

test("sin la tabla del fiado (migración sin aplicar) no la nombra: turnos y pedidos se mueven igual", async () => {
  const m = mundo();
  m.fiado.length = 0;
  const tx = txDe(m) as unknown as Record<string, unknown>;
  // Como en una base sin la tabla: cualquier consulta al fiado revienta con P2021.
  tx.accountReceivable = new Proxy({}, { get: () => async () => { throw Object.assign(new Error("tabla inexistente"), { code: "P2021" }); } });
  const r = await unificarFichasEnTx(tx as unknown as Prisma.TransactionClient, "t_magra", { ...PEDIDO, conFiado: false });
  assert.deepEqual(r, { ok: true, nombre: "Ana", turnos: 1, pedidos: 1, fiado: 0, inmobiliaria: 5, fichas: 1 });
});

test("un turno cargado en la duplicada mientras tanto: la clave foránea frena y se propaga P2003", async () => {
  const m = mundo();
  await assert.rejects(
    () => unificarFichasEnTx(txDe(m, { turnoNuevoEnDuplicada: true }), "t_magra", PEDIDO),
    (e: unknown) => (e as { code?: string }).code === "P2003",
  );
});
