// Box «Nail Artist» (docs/tenants/ch/NAIL-ARTIST.md, Tanda 1): las reglas puras.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  changesDelSnapshot,
  notaDeCobroProfesional,
  seniaDeLaProfesional,
  snapshotDeChanges,
  ultimoSnapshotPorTurno,
} from "./senia-profesional";
import {
  ALIAS_SENIA_PROVISIONAL,
  lineaDeSeniaProfesionalEnReserva,
  mensajePedidoDeSeniaProfesional,
  mensajeSeniaRecibidaProfesional,
} from "./mensajes-whatsapp";
import { cobroTurnoEligibility } from "@/lib/caja/cobro-turno";
import { INTERRUPTORES, NAIL_ARTIST, nailArtistPrendido } from "@/cambios/interruptores";
import { leerCuentaProfesional, puedeEditarCuentaDe } from "@/lib/catalogo/cuenta-profesional";
import { textoDeSeniaProfesional } from "@/app/(site)/_ch/senia-profesional-reserva";

const MICA = { id: "p-mica", name: "Mica", aliasCbu: "mica.nails", titularCuenta: "Micaela Pérez", cuitTitular: "27111111113" };
const SOL = { id: "p-sol", name: "Sol", aliasCbu: "sol.unas", titularCuenta: "Sol Gómez", cuitTitular: null };

test("apagado o servicio sin marca: no aplica (camino de siempre)", () => {
  assert.deepEqual(seniaDeLaProfesional({ nailArtist: false, depositToProfessional: true, appointment: { professionalId: MICA.id }, profesional: MICA, monto: 5000 }), { aplica: false });
  assert.deepEqual(seniaDeLaProfesional({ nailArtist: true, depositToProfessional: false, appointment: { professionalId: MICA.id }, profesional: MICA, monto: 5000 }), { aplica: false });
  assert.deepEqual(seniaDeLaProfesional({ nailArtist: true, depositToProfessional: undefined, appointment: { professionalId: MICA.id }, profesional: MICA, monto: 5000 }), { aplica: false });
});

test("el alias sale SIEMPRE de la profesional del turno: con dos profesionales, cada una el suyo", () => {
  const a = seniaDeLaProfesional({ nailArtist: true, depositToProfessional: true, appointment: { professionalId: MICA.id }, profesional: MICA, monto: 5000 });
  const b = seniaDeLaProfesional({ nailArtist: true, depositToProfessional: true, appointment: { professionalId: SOL.id }, profesional: SOL, monto: 5000 });
  assert.ok(a.aplica && a.ok && b.aplica && b.ok);
  if (a.aplica && a.ok && b.aplica && b.ok) {
    assert.equal(a.snapshot.alias, "mica.nails");
    assert.equal(b.snapshot.alias, "sol.unas");
  }
  // Ficha de OTRA profesional: nunca se usa su alias.
  const cruzada = seniaDeLaProfesional({ nailArtist: true, depositToProfessional: true, appointment: { professionalId: MICA.id }, profesional: SOL, monto: 5000 });
  assert.deepEqual(cruzada, { aplica: true, ok: false, motivo: "sin-alias" });
});

test("sin alias no hay seña por transferencia (nunca el alias provisional ni del negocio)", () => {
  for (const aliasCbu of [null, "", "   "]) {
    const r = seniaDeLaProfesional({ nailArtist: true, depositToProfessional: true, appointment: { professionalId: "p-lu" }, profesional: { id: "p-lu", aliasCbu }, monto: 5000 });
    assert.deepEqual(r, { aplica: true, ok: false, motivo: "sin-alias" });
  }
  assert.equal(mensajePedidoDeSeniaProfesional({ clienta: "Laura", servicios: "Kapping", inicio: new Date(), monto: 5000, cuenta: null }), "");
  assert.equal(ALIAS_SENIA_PROVISIONAL, null);
});

test("snapshot: ida y vuelta por `changes`, y manda la ÚLTIMA seña pedida del turno", () => {
  const r = seniaDeLaProfesional({ nailArtist: true, depositToProfessional: true, appointment: { professionalId: MICA.id }, profesional: MICA, monto: 5000 });
  assert.ok(r.aplica && r.ok);
  if (!(r.aplica && r.ok)) return;
  const ch = { ...changesDelSnapshot(r.snapshot), canal: "turno" };
  assert.deepEqual(snapshotDeChanges(ch), r.snapshot);
  assert.equal(snapshotDeChanges({ monto: 5000, canal: "turno" }), null, "una seña del negocio no tiene snapshot");
  const filas = [
    { entityId: "t1", createdAt: "2026-11-01T10:00:00Z", changes: ch },
    { entityId: "t1", createdAt: "2026-11-02T10:00:00Z", changes: { ...ch, alias: "mica.vieja" } },
    { entityId: "t2", createdAt: "2026-11-02T10:00:00Z", changes: { monto: 1, canal: "alta" } },
  ];
  const m = ultimoSnapshotPorTurno(filas);
  assert.equal(m.t1.alias, "mica.vieja");
  assert.equal(m.t2, undefined);
  assert.equal(notaDeCobroProfesional(r.snapshot), "a Micaela Pérez (mica.nails) — no entra a la caja del negocio");
});

test("textos §3: pedido, comprobante y reserva, sin «undefined» ni CUIT del salón", () => {
  const inicio = new Date("2026-11-12T19:00:00Z");
  const pedido = mensajePedidoDeSeniaProfesional({ clienta: "Laura Gómez", servicios: "Kapping", inicio, monto: 5000, cuenta: { alias: "mica.nails", titular: "Micaela Pérez" } });
  assert.match(pedido, /^Hola Laura, para confirmar tu turno de \*Kapping\* \*el jueves 12 a las 16:00\* transferí la seña de \$5\.000 al alias \*mica\.nails\* \(Micaela Pérez\) y mandame el comprobante por acá\. ¡Gracias!$/);
  const recibo = mensajeSeniaRecibidaProfesional({ clienta: "Laura", servicios: "Kapping", inicio, monto: 5000, cuenta: { alias: "mica.nails", titular: "Micaela Pérez", cuit: "27111111113" }, negocio: "CH" });
  assert.equal(recibo, "Recibimos tu seña de $5.000 para el turno de *Kapping* *el jueves 12 a las 16:00*. Cobrada por Micaela Pérez (alias mica.nails). Te esperamos en CH. CUIT 27111111113");
  assert.doesNotMatch(recibo + pedido, /undefined|null|NaN/);
  assert.equal(
    lineaDeSeniaProfesionalEnReserva({ monto: 5000, cuenta: { alias: "mica.nails", titular: "Micaela Pérez" }, profesional: "Mica" }),
    "Seña de $5.000 por transferencia al alias mica.nails (titular: Micaela Pérez). La cobra Mica, tu nail artist, no el salón.",
  );
  assert.equal(textoDeSeniaProfesional({ depositAmount: 5000, depositToProfessional: true }, { name: "Lu" }), "La seña se coordina con la profesional.");
  assert.equal(textoDeSeniaProfesional({ depositAmount: 5000 }, { name: "Mica", cuentaSenia: { alias: "mica.nails", titular: null } }), null, "sin marca: texto de siempre");
});

test("caja: con la marca, el cobro no asienta (PROFESIONAL_COBRA); sin ella, igual que siempre", () => {
  assert.deepEqual(cobroTurnoEligibility({ status: "APPROVED", paymentMethod: "TRANSFERENCIA", amount: 5000, profesionalCobra: true }), { eligible: false, reason: "PROFESIONAL_COBRA" });
  const siempre = cobroTurnoEligibility({ status: "APPROVED", paymentMethod: "EFECTIVO", amount: 5000 });
  assert.deepEqual(cobroTurnoEligibility({ status: "APPROVED", paymentMethod: "EFECTIVO", amount: 5000, profesionalCobra: false }), siempre);
  assert.equal(siempre.eligible, true);
});

test("interruptor `nail-artist`: al final del catálogo y apagado si falta", () => {
  assert.equal(INTERRUPTORES[INTERRUPTORES.length - 1].id, NAIL_ARTIST);
  assert.equal(nailArtistPrendido({}), false);
  assert.equal(nailArtistPrendido({ [NAIL_ARTIST]: { encendido: true } }), true);
});

test("ficha: edita el dueño o la propia profesional (sólo su fila); valida alias, titular y CUIT", () => {
  assert.equal(puedeEditarCuentaDe({ role: "OWNER" }, "p1").ok, true);
  assert.equal(puedeEditarCuentaDe({ role: "PROFESSIONAL", professionalId: "p1" }, "p1").ok, true);
  assert.equal(puedeEditarCuentaDe({ role: "PROFESSIONAL", professionalId: "p2" }, "p1").ok, false);
  assert.equal(puedeEditarCuentaDe({ role: "PROFESSIONAL", professionalId: null }, "p1").ok, false);
  assert.equal(puedeEditarCuentaDe({ role: "RECEPTION" }, "p1").ok, false);
  assert.deepEqual(leerCuentaProfesional({ aliasCbu: " mica.nails ", titularCuenta: " Micaela  Pérez ", cuitTitular: "27-11111111-3" }), {
    ok: true,
    cuenta: { aliasCbu: "mica.nails", titularCuenta: "Micaela Pérez", cuitTitular: "27111111113" },
  });
  assert.deepEqual(leerCuentaProfesional({ aliasCbu: "", titularCuenta: "", cuitTitular: "" }), { ok: true, cuenta: { aliasCbu: null, titularCuenta: null, cuitTitular: null } });
  assert.equal(leerCuentaProfesional({ aliasCbu: "ab", titularCuenta: "X" }).ok, false);
  assert.equal(leerCuentaProfesional({ aliasCbu: "mica.nails", titularCuenta: "" }).ok, false, "con alias, el titular es obligatorio");
  assert.equal(leerCuentaProfesional({ aliasCbu: "0".repeat(22), titularCuenta: "Mica" }).ok, true, "CBU/CVU de 22");
  assert.equal(leerCuentaProfesional({ aliasCbu: "mica.nails", titularCuenta: "Mica", cuitTitular: "123" }).ok, false);
});
