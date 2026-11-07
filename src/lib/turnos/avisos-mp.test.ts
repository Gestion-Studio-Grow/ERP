// Los avisos de la seña por Mercado Pago en la agenda: la consulta (filtrada por negocio) y el texto
// en criollo, que se apaga solo cuando el turno ya lo resolvió.
import { test } from "node:test";
import assert from "node:assert/strict";
import { avisoMPDeFila, avisosMPPorTurno, type FilaAvisoMP } from "./avisos-mp";
import { leerAvisosMP, type LectorAvisosMP } from "./avisos-mp.server";
import { textosAvisoMP } from "@/app/admin/(dashboard)/turnos/agenda-core";
import { notaDeAnulacion } from "./anulacion";

type Fila = FilaAvisoMP & { tenantId: string; entity: string };
const filas: Fila[] = [
  { tenantId: "A", entity: "Appointment", entityId: "t1", action: "senia_parcial_mp", changes: { senia: 5000, seniaQueFalta: 3000, amount: 2000 }, createdAt: new Date("2026-11-07T10:00:00Z") },
  { tenantId: "A", entity: "Appointment", entityId: "t1", action: "senia_mp_no_registrada", changes: { pagoMP: { id: "9002", monto: 3000 }, motivo: "La caja de hoy ya está cerrada: este cobro no se puede asentar hoy." }, createdAt: new Date("2026-11-07T11:00:00Z") },
  { tenantId: "A", entity: "Appointment", entityId: "t2", action: "collect_payment", changes: {}, createdAt: new Date("2026-11-07T11:00:00Z") },
  // El mismo turno (mismo id) en el negocio B: nunca se ve desde A.
  { tenantId: "B", entity: "Appointment", entityId: "t1", action: "senia_mp_devuelta_sin_anular", changes: { cobroId: "cB" }, createdAt: new Date("2026-11-07T12:00:00Z") },
];

function lector() {
  const wheres: unknown[] = [];
  const db: LectorAvisosMP = {
    auditLog: {
      findMany: async ({ where }) => {
        wheres.push(where);
        return filas.filter((f) => f.tenantId === where.tenantId && f.entity === where.entity && where.action.in.includes(f.action) && where.entityId.in.includes(f.entityId));
      },
    },
  };
  return { db, wheres };
}

const ON = { reglaPrendida: true };

test("consulta: una sola, con tenantId, sólo las tres acciones de aviso y sólo los turnos dados", async () => {
  const { db, wheres } = lector();
  const r = await leerAvisosMP(db, "A", ["t1", "t2", "t1", ""], ON);
  assert.equal(wheres.length, 1);
  assert.deepEqual(wheres[0], {
    tenantId: "A",
    entity: "Appointment",
    action: { in: ["senia_parcial_mp", "senia_mp_devuelta_sin_anular", "senia_mp_no_registrada"] },
    entityId: { in: ["t1", "t2"] },
  });
  assert.deepEqual(Object.keys(r), ["t1"]);
  assert.deepEqual(r.t1.map((a) => a.tipo), ["parcial", "no-registrada"]);
});

test("consulta: aislamiento — B ve lo suyo y no lo de A; sin turnos o sin negocio, ni una consulta", async () => {
  const { db, wheres } = lector();
  const b = await leerAvisosMP(db, "B", ["t1"], ON);
  assert.deepEqual(b.t1, [{ tipo: "devuelta-sin-anular", cobroId: "cB" }]);
  assert.deepEqual(await leerAvisosMP(db, "A", [], ON), {});
  assert.deepEqual(await leerAvisosMP(db, "", ["t1"], ON), {});
  assert.equal(wheres.length, 1);
});

test("filas: queda el más reciente de cada tipo; lo que no es aviso se ignora", () => {
  const r = avisosMPPorTurno([
    { entityId: "t1", action: "senia_parcial_mp", changes: { senia: 5000, seniaQueFalta: 4000 }, createdAt: "2026-11-07T09:00:00Z" },
    { entityId: "t1", action: "senia_parcial_mp", changes: { senia: 5000, seniaQueFalta: 1000 }, createdAt: "2026-11-07T10:00:00Z" },
  ]);
  assert.deepEqual(r.t1, [{ tipo: "parcial", pagado: 4000, senia: 5000 }]);
  assert.equal(avisoMPDeFila({ action: "collect_payment", changes: {} }), null);
  assert.equal(avisoMPDeFila({ action: "senia_parcial_mp", changes: null }), null);
});

const base = { estado: "PENDING" as const, senia: 5000, cobrado: 2000, cobros: [] as { id?: string; amount: number; method: string; note?: string | null }[] };

test("textos en criollo, y cada uno se apaga cuando el turno ya lo resolvió", () => {
  const avisosMP = [
    { tipo: "parcial" as const, pagado: 2000, senia: 5000 },
    { tipo: "devuelta-sin-anular" as const, cobroId: "c1" },
    { tipo: "no-registrada" as const, pagoId: "9002", monto: 3000, cajaCerrada: true },
  ];
  const cobro = { id: "c1", amount: 2000, method: "MERCADOPAGO", note: "Seña por Mercado Pago · pago 9001" };
  const textos = textosAvisoMP({ ...base, cobros: [cobro], avisosMP });
  assert.equal(textos.length, 3);
  assert.match(textos[0], /^Seña parcial por Mercado Pago: pagó \$\s?2\.000 de \$\s?5\.000$/);
  assert.equal(textos[1], "Mercado Pago devolvió la seña pero el cobro sigue en caja: revisalo");
  assert.match(textos[2], /^Entró la seña por Mercado Pago \(\$\s?3\.000\) pero la caja estaba cerrada: registrala a mano$/);
  // Seña completa → no más «parcial»; cobro anulado a mano → no más «devuelta»; cobro del pago registrado → no más «no registrada».
  const anulacion = { id: "c2", amount: -2000, method: "MERCADOPAGO", note: null as string | null };
  const resuelto = textosAvisoMP({
    ...base,
    cobrado: 5000,
    cobros: [cobro, { ...anulacion, note: notaDeAnulacion("c1", "devuelta a mano") }, { id: "c3", amount: 3000, method: "MERCADOPAGO", note: "Seña por Mercado Pago · pago 9002" }],
    avisosMP,
  });
  assert.deepEqual(resuelto, []);
  assert.deepEqual(textosAvisoMP({ ...base, avisosMP: undefined }), []);
  assert.match(textosAvisoMP({ ...base, avisosMP: [{ tipo: "no-registrada", pagoId: null, monto: null, cajaCerrada: false }] })[0], /no se pudo registrar: registrala a mano/);
});

// ── Certificación de a9683e42 ────────────────────────────────────────────────

test("H2: con la regla de seña obligatoria apagada la agenda no lee (ni muestra) avisos de MP", async () => {
  const { db, wheres } = lector();
  assert.deepEqual(await leerAvisosMP(db, "A", ["t1", "t2"], { reglaPrendida: false }), {});
  assert.equal(wheres.length, 0);
});

test("baja: más de 300 turnos en el día → bloques de 300, todos con tenantId; no se corta ninguno", async () => {
  const ids = Array.from({ length: 650 }, (_, i) => `x${i}`);
  ids[649] = "t1"; // el aviso está en el último bloque
  const { db, wheres } = lector();
  const r = await leerAvisosMP(db, "A", ids, ON);
  assert.equal(wheres.length, 3);
  const pedidos = (wheres as { tenantId: string; entityId: { in: string[] } }[]).flatMap((w) => (assert.equal(w.tenantId, "A"), w.entityId.in));
  assert.equal(pedidos.length, 650);
  assert.deepEqual(r.t1.map((a) => a.tipo), ["parcial", "no-registrada"]);
});

test("baja: la seña parcial NO se apaga al cancelar el turno (la plata parcial sigue en caja)", () => {
  const avisosMP = [{ tipo: "parcial" as const, pagado: 2000, senia: 5000 }];
  const cancelado = textosAvisoMP({ ...base, estado: "CANCELLED", avisosMP });
  assert.equal(cancelado.length, 1);
  assert.match(cancelado[0], /^Seña parcial por Mercado Pago \(\$\s?2\.000\): el turno se canceló y esa plata sigue en caja: revisala$/);
  assert.match(textosAvisoMP({ ...base, estado: "NO_SHOW", avisosMP })[0], /quedó sin venir/);
  // Si la plata ya se devolvió (cobro anulado → cobrado 0), se apaga.
  assert.deepEqual(textosAvisoMP({ ...base, estado: "CANCELLED", cobrado: 0, avisosMP }), []);
});
